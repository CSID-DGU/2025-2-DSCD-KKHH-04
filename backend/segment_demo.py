# ~/backend/segment_demo.py
# -*- coding: utf-8 -*-
"""
녹화된 npz (T,F)를 불러와서
- 휴지기 기반 세그먼트 분리
- 각 세그먼트에 대해 단어 분류 모델 인퍼런스
까지 한 번에 돌려보는 데모 스크립트.

구조:
- 원본 시퀀스(seq_raw)는 그대로 단어 인퍼런스에 사용
- 휴지기 탐지는 부드럽게 만든 시퀀스(seq_seg)로만 수행
- segment_by_pause_local로 "대략적인 단어 구간"을 잡은 뒤,
  해당 구간 주변에서 단어 분류기의 confidence가 가장 높은
  윈도우를 찾는 방식으로 세그먼트 경계를 미세조정한다.
- 직전 세그먼트와 같은 단어가 또 나오는 후보는 한 번 더 의심하고,
  다른 단어 후보 중 확률이 충분히 높은 것이 있으면 그쪽을 선택한다.
"""

import argparse
from pathlib import Path
import numpy as np

from data import _to_numpy_2d
from sign.gloss_model import infer_gloss_from_seq


BASE_DIR = Path(__file__).resolve().parent
REC_ROOT = BASE_DIR / "dataset" / "npz" / "recorded"


# ===================== 유틸 함수들 =====================

def load_seq_from_npz(path: Path) -> np.ndarray:
    """
    npz에서 seq/x 배열 하나 꺼내서 (T,F) float32로 반환
    """
    with np.load(path, allow_pickle=True) as z:
        if "seq" in z:
            arr = z["seq"]
        elif "x" in z:
            arr = z["x"]
        else:
            keys = [k for k in z.files if isinstance(z[k], np.ndarray)]
            if not keys:
                raise ValueError(f"{path}: npz 안에 ndarray가 없음")
            arr = z[keys[0]]

    arr = arr.astype("float32")
    return _to_numpy_2d(arr)  # (T,F)


def smooth_seq_ema(seq: np.ndarray, alpha: float = 0.7) -> np.ndarray:
    """
    지수 이동 평균(EMA)로 프레임 지글지글을 줄이는 함수.
    - alpha에 가까울수록 이전 프레임을 더 신뢰(더 부드럽게)
    """
    T, F = seq.shape
    out = np.empty_like(seq)
    out[0] = seq[0]
    for t in range(1, T):
        out[t] = alpha * out[t - 1] + (1.0 - alpha) * seq[t]
    return out


def segment_by_pause_local(
    seq: np.ndarray,
    fps: float,
    pause_sec: float,
    motion_th: float,
    min_word_sec: float,
):
    """
    휴지기 기반 세그먼트 분리 함수.

    인자:
        seq         : (T,F) — 이미 smoothing 된 시퀀스라고 가정
        fps         : 촬영 fps (예: 30)
        pause_sec   : 휴지기 최소 길이(초)
        motion_th   : "정지"로 볼 motion 임계치
        min_word_sec: 세그먼트가 이 시간보다 짧으면 버림

    반환:
        segments: [(start_frame, end_frame), ...]  (end_frame는 exclusive)
        motion  : (T-1,) 프레임 간 모션 크기 (디버그용)
    """
    T, F = seq.shape
    if T <= 1:
        return [], np.zeros(max(T - 1, 1), dtype=np.float32)

    diff = seq[1:] - seq[:-1]              # (T-1, F)
    motion = np.linalg.norm(diff, axis=1)  # (T-1,)

    still = motion < motion_th

    pause_frames = int(round(pause_sec * fps))
    min_word_frames = int(round(min_word_sec * fps))

    segments = []
    start = 0

    t = 0
    while t < T - 1:
        if still[t]:
            run_start = t
            while t < T - 1 and still[t]:
                t += 1
            run_len = t - run_start

            if run_len >= pause_frames:
                seg_end = run_start  # 이 프레임 직전까지를 세그먼트로
                if seg_end - start >= min_word_frames:
                    segments.append((start, seg_end))
                start = t
        else:
            t += 1

    if T - start >= min_word_frames:
        segments.append((start, T))

    # 전체 길이만 충분하면 최소 1개는 만들기
    if not segments and T >= min_word_frames:
        segments.append((0, T))

    return segments, motion


def infer_window(seq_raw: np.ndarray, s: int, e: int, topk: int = 3):
    """
    [s, e) 구간에 대해 단어 인퍼런스 수행하고
    (토큰/확률/전체 결과)를 반환.
    """
    seg_seq = seq_raw[s:e]
    result = infer_gloss_from_seq(seg_seq, topk=topk)
    top1 = result["topk_tokens"][0]
    prob = float(result["topk_probs"][0])
    return top1, prob, result


def refine_with_classifier(
    seq_raw: np.ndarray,
    s: int,
    e: int,
    min_word_frames: int,
    conf_thr: float = 0.8,
    prev_top1: str | None = None,
    alt_thr: float = 0.5,
):
    """
    segment_by_pause로 얻은 대략적인 세그먼트 [s,e)에 대해:
    1) 먼저 [s,e)를 그대로 인퍼런스
    2) confidence가 충분히 높으면 그대로 사용
    3) 아니면 시작 프레임을 ±2프레임까지 움직여 보면서
       동일한 길이의 윈도우 중에서 가장 confidence가 높은 것을 선택

    + 추가:
      - 직전 세그먼트 토큰(prev_top1)과 같은 단어는
        가능한 한 피하려고 시도한다.
      - prev_top1와 다른 후보 중에서 확률이 alt_thr 이상인 것이 있으면,
        그 후보를 우선 고려한다.

    반환:
        best_s, best_e, best_result
    """
    T = seq_raw.shape[0]
    length = e - s
    if length < min_word_frames:
        return None, None, None  # 상위에서 스킵 처리

    # 1) 기본 윈도우 인퍼런스
    base_top1, base_prob, base_result = infer_window(seq_raw, s, e, topk=3)

    # confidence 충분하면 그냥 사용 (이전 토큰 중복이어도 그대로 감)
    if base_prob >= conf_thr:
        print(
            f"       → base ok: {base_top1} ({base_prob:.3f}), "
            f"no boundary search"
        )
        return s, e, base_result

    # 2) boundary search: 시작 프레임만 ±2 이동 (길이는 동일)
    best_s, best_e = s, e
    best_top1, best_prob, best_result = base_top1, base_prob, base_result

    # prev_top1와 다른 후보들 중에서의 best
    nondup_s, nondup_e = None, None
    nondup_top1, nondup_prob, nondup_result = None, -1.0, None

    print(
        f"       → low conf ({base_top1} {base_prob:.3f}), "
        f"searching around boundary..."
    )

    for ds in [-2, -1, 0, 1, 2]:
        cs = s + ds
        ce = cs + length
        if cs < 0 or ce > T:
            continue
        if ce - cs < min_word_frames:
            continue

        top1, prob, result = infer_window(seq_raw, cs, ce, topk=3)

        print(
            f"         cand ds={ds:>2}: frames {cs}~{ce-1}, "
            f"{top1} ({prob:.3f})"
        )

        # 전체 best (기존 로직 유지)
        if prob > best_prob:
            best_prob = prob
            best_top1 = top1
            best_result = result
            best_s, best_e = cs, ce

        # prev_top1와 다른 후보들 중에서의 best
        if prev_top1 is not None and top1 != prev_top1 and prob > nondup_prob:
            nondup_prob = prob
            nondup_top1 = top1
            nondup_result = result
            nondup_s, nondup_e = cs, ce

    # 3) 최종 선택: 중복 단어를 피할 수 있으면 피한다
    # - best 후보가 prev_top1와 같은 단어이고
    # - prev_top1와 다른 후보 중에서 alt_thr 이상인 것이 있을 때
    if (
        prev_top1 is not None
        and best_top1 == prev_top1
        and nondup_result is not None
        and nondup_prob >= alt_thr
    ):
        print(
            f"       → best token == prev('{prev_top1}'), "
            f"but non-dup cand {nondup_top1} ({nondup_prob:.3f}) >= {alt_thr:.2f}, "
            f"use non-dup"
        )
        return nondup_s, nondup_e, nondup_result

    print(
        f"       → chosen window: frames {best_s}~{best_e-1}, "
        f"{best_top1} ({best_prob:.3f})"
    )

    return best_s, best_e, best_result


# ===================== main =====================

def main():
    pa = argparse.ArgumentParser()
    pa.add_argument(
        "--file",
        "-f",
        default="",
        help="dataset/npz/recorded/sess_xxx.npz",
    )
    pa.add_argument(
        "--fps",
        type=float,
        default=30.0,
        help="촬영 fps (대략 30 정도로 두고 시작)",
    )
    pa.add_argument(
        "--pause-sec",
        type=float,
        default=0.3,
        help="휴지기 최소 길이(초)",
    )
    pa.add_argument(
        "--motion-th",
        type=float,
        default=0.06,
        help="정지로 볼 motion 임계치 (0.02~0.06 사이 튜닝)",
    )
    pa.add_argument(
        "--min-word-sec",
        type=float,
        default=0.3,
        help="세그먼트가 이 시간(초)보다 짧으면 인퍼런스 스킵",
    )
    pa.add_argument(
        "--smooth-alpha",
        type=float,
        default=0.7,
        help="휴지기 판정용 EMA 계수 (0.0~1.0). 0.7 정도에서 시작.",
    )
    pa.add_argument(
        "--conf-thr",
        type=float,
        default=0.8,
        help="기본 세그먼트 confidence가 이 값 이상이면 boundary search 생략",
    )
    args = pa.parse_args()

    # 1) 파일 결정
    if args.file:
        fpath = Path(args.file)
        if not fpath.is_absolute():
            fpath = BASE_DIR / args.file
    else:
        files = sorted(REC_ROOT.glob("*.npz"))
        if not files:
            print(f"[ERR] {REC_ROOT} 안에 npz가 없습니다.")
            return
        fpath = files[-1]

    print(f"[INFO] file = {fpath}")
    if not fpath.exists():
        print("[ERR] 파일이 존재하지 않습니다.")
        return

    # 2) 시퀀스 로드 (원본)
    seq_raw = load_seq_from_npz(fpath)  # (T, F)
    T, F = seq_raw.shape
    print(f"[INFO] shape = [T={T}, F={F}]")

    # 2.1) 휴지기 판정을 위한 EMA smoothing 버전 생성
    if 0.0 < args.smooth_alpha < 1.0:
        seq_seg = smooth_seq_ema(seq_raw, alpha=args.smooth_alpha)
        print(f"[INFO] apply EMA smoothing for segmentation (alpha={args.smooth_alpha})")
    else:
        seq_seg = seq_raw.copy()
        print("[INFO] smoothing disabled (use raw seq for segmentation)")

    # 2.5) (옵션) motion debug (smoothing 이후 기준)
    diff = seq_seg[1:] - seq_seg[:-1]          # (T-1, F)
    motion = np.linalg.norm(diff, axis=1)      # (T-1,)

    print("=== motion debug (after smoothing) ===")
    print("min =", float(motion.min()))
    print("max =", float(motion.max()))
    print("mean =", float(motion.mean()))
    for th in [0.02, 0.04, 0.06, 0.08, 0.10]:
        still = motion < th
        longest = 0
        cur = 0
        for v in still:
            if v:
                cur += 1
                longest = max(longest, cur)
            else:
                cur = 0
        print(
            f"[th={th:.2f}] longest still run = "
            f"{longest} frames (~{longest/args.fps:.2f} sec)"
        )
    print("=== end motion debug ===")

    # 3) 세그먼트 분리
    segments, _ = segment_by_pause_local(
        seq=seq_seg,
        fps=args.fps,
        pause_sec=args.pause_sec,
        motion_th=args.motion_th,
        min_word_sec=args.min_word_sec,
    )

    print(
        f"[INFO] found {len(segments)} segments "
        f"(pause_sec={args.pause_sec}, motion_th={args.motion_th})"
    )

    min_word_frames = int(round(args.fps * args.min_word_sec))

    # 직전 세그먼트 토큰 (중복 피하기 휴리스틱용)
    prev_top1: str | None = None

    # 4) 각 세그먼트마다 단어 인퍼런스 (+ boundary search)
    for i, (s, e) in enumerate(segments):
        length = e - s
        sec = length / args.fps

        print(
            f"  seg{i}: rough frames {s} ~ {e-1}  "
            f"(len={length} frames, {sec:.2f} sec)"
        )

        if length < min_word_frames:
            print(
                f"       → too short rough segment "
                f"(< {args.min_word_sec:.2f} sec), skip"
            )
            continue

        # classifier 기반 경계 미세조정
        rs, re, result = refine_with_classifier(
            seq_raw=seq_raw,
            s=s,
            e=e,
            min_word_frames=min_word_frames,
            conf_thr=args.conf_thr,
            prev_top1=prev_top1,
            alt_thr=0.5,  # 필요하면 0.4~0.6 사이에서 튜닝
        )

        if rs is None:
            print(
                f"       → no valid window (len < {args.min_word_sec:.2f} sec), skip"
            )
            continue

        final_top1 = result["topk_tokens"][0]
        final_prob = float(result["topk_probs"][0])

        print(
            f"       → final: frames {rs}~{re-1}, "
            f"{final_top1} ({final_prob:.3f}), "
            f"top3: {result['topk_tokens']} / "
            f"{['%.3f' % p for p in result['topk_probs']]}"
        )

        # 다음 세그먼트를 위해 prev_top1 업데이트
        prev_top1 = final_top1

    print("[DONE]")


if __name__ == "__main__":
    main()

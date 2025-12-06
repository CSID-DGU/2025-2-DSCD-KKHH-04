# ~/backend/sign/segment_infer.py
# -*- coding: utf-8 -*-
"""
세그먼트 + 단어 인퍼런스 모듈

역할
- (T,F) 시퀀스를 입력으로 받아
  1) 휴지기 기반으로 대략적인 세그먼트 분리
  2) 각 세그먼트 주변에서 단어 분류기의 confidence가 가장 높은 구간을 탐색
  3) segment 별 단어 인퍼런스 결과 + 전체 글로스 문장을 반환

주의
- 실제 단어 인퍼런스는 기존 sign.gloss_model.infer_gloss_from_seq 를 사용한다.
- 여기서는 I/O / 세그먼트 로직만 담당하고, CLI는 없음.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from sign.intersection import gloss_tokens_to_korean

import numpy as np

from data import _to_numpy_2d  # (T,F) 강제 변환 :contentReference[oaicite:0]{index=0}
from sign.gloss_model import infer_gloss_from_seq


# =========================================================
# 공용 유틸
# =========================================================

def load_seq_from_npz(path: Path | str) -> np.ndarray:
    """
    npz 파일에서 (T,F) 시퀀스를 하나 꺼내서 float32로 반환.

    - 'seq' 키가 있으면 seq 사용
    - 없으면 'x' 키 사용
    - 그래도 없으면 첫 번째 ndarray 사용
    """
    path = Path(path)
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
    지수 이동 평균(EMA)로 프레임 지글을 줄이는 함수.
    alpha에 가까울수록 이전 프레임을 더 신뢰(더 부드러워짐).
    """
    T, F = seq.shape
    if T <= 1:
        return seq.copy()

    out = np.empty_like(seq)
    out[0] = seq[0]
    for t in range(1, T):
        out[t] = alpha * out[t - 1] + (1.0 - alpha) * seq[t]
    return out


def _debug_motion_stats(seq_seg: np.ndarray, fps: float) -> Dict[str, Any]:
    """
    모션 통계를 계산해서 dict로 반환 (필요하면 로그 찍기).
    """
    diff = seq_seg[1:] - seq_seg[:-1]          # (T-1,F)
    motion = np.linalg.norm(diff, axis=1)      # (T-1,)

    stats = {
        "min": float(motion.min()) if motion.size else 0.0,
        "max": float(motion.max()) if motion.size else 0.0,
        "mean": float(motion.mean()) if motion.size else 0.0,
        "longest_still": {},
    }

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
        stats["longest_still"][th] = {
            "frames": int(longest),
            "sec": float(longest / fps),
        }

    return stats


# =========================================================
# 휴지기 기반 세그먼트 분리
# =========================================================

def segment_by_pause_local(
    seq: np.ndarray,
    fps: float,
    pause_sec: float,
    motion_th: float,
    min_word_sec: float,
) -> Tuple[List[Tuple[int, int]], np.ndarray]:
    """
    휴지기 기반 세그먼트 분리.

    인자:
        seq         : (T,F) — smoothing 된 시퀀스라고 가정
        fps         : 촬영 fps (예: 30)
        pause_sec   : 휴지기 최소 길이(초)
        motion_th   : "정지"로 볼 motion 임계치
        min_word_sec: 세그먼트가 이 시간보다 짧으면 버림

    반환:
        segments: [(start_frame, end_frame), ...]  (end_frame는 exclusive)
        motion  : (T-1,) 프레임 간 모션 크기
    """
    T, F = seq.shape
    if T <= 1:
        return [], np.zeros(max(T - 1, 1), dtype=np.float32)

    diff = seq[1:] - seq[:-1]              # (T-1, F)
    motion = np.linalg.norm(diff, axis=1)  # (T-1,)

    still = motion < motion_th

    pause_frames = int(round(pause_sec * fps))
    min_word_frames = int(round(min_word_sec * fps))

    segments: List[Tuple[int, int]] = []
    start = 0

    t = 0
    while t < T - 1:
        if still[t]:
            run_start = t
            while t < T - 1 and still[t]:
                t += 1
            run_len = t - run_start

            if run_len >= pause_frames:
                seg_end = run_start  # 이 프레임 직전까지 세그먼트
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


# =========================================================
# 단어 인퍼런스 + 경계 미세조정
# =========================================================

def _infer_window(
    seq_raw: np.ndarray,
    s: int,
    e: int,
    topk: int = 3,
) -> Tuple[str, float, Dict[str, Any]]:
    """
    [s, e) 구간에 대해 단어 인퍼런스 수행.
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
    prev_top1: Optional[str] = None,
    alt_thr: float = 0.5,
    debug: bool = False,
) -> Tuple[Optional[int], Optional[int], Optional[Dict[str, Any]]]:
    """
    segment_by_pause 로 얻은 대략적인 세그먼트 [s,e)에 대해:

    1) 먼저 [s,e)를 그대로 인퍼런스
    2) confidence가 충분히 높으면 그대로 사용
    3) 아니면 시작 프레임을 ±2프레임까지 움직여보며
       동일한 길이의 윈도우 중에서 confidence가 가장 높은 것을 선택

    + prev_top1와 같은 단어는 가능하면 피하고,
      prev_top1와 다른 후보 중에서 확률이 alt_thr 이상인 것이 있으면
      그 후보를 우선 선택.

    반환:
        best_s, best_e, best_result  (못 찾으면 셋 다 None)
    """
    T = seq_raw.shape[0]
    length = e - s
    if length < min_word_frames:
        return None, None, None

    # 1) 기본 윈도우
    base_top1, base_prob, base_result = _infer_window(seq_raw, s, e, topk=3)

    if debug:
        print(
            f"[refine] base window {s}~{e-1} → "
            f"{base_top1} ({base_prob:.3f})"
        )

    # confidence 충분하면 그대로
    if base_prob >= conf_thr:
        if debug:
            print("         → conf OK, boundary search 생략")
        return s, e, base_result

    # 2) boundary search (시작 프레임만 ±2)
    best_s, best_e = s, e
    best_top1, best_prob, best_result = base_top1, base_prob, base_result

    nondup_s, nondup_e = None, None
    nondup_top1, nondup_prob, nondup_result = None, -1.0, None

    if debug:
        print("         → low conf, 주변 boundary 탐색...")

    for ds in [-2, -1, 0, 1, 2]:
        cs = s + ds
        ce = cs + length
        if cs < 0 or ce > T:
            continue
        if ce - cs < min_word_frames:
            continue

        top1, prob, result = _infer_window(seq_raw, cs, ce, topk=3)

        if debug:
            print(
                f"           cand ds={ds:>2}: {cs}~{ce-1}, "
                f"{top1} ({prob:.3f})"
            )

        # 전체 best
        if prob > best_prob:
            best_prob = prob
            best_top1 = top1
            best_result = result
            best_s, best_e = cs, ce

        # prev 토큰과 다른 후보들 중 best
        if prev_top1 is not None and top1 != prev_top1 and prob > nondup_prob:
            nondup_prob = prob
            nondup_top1 = top1
            nondup_result = result
            nondup_s, nondup_e = cs, ce

    # 3) 최종 선택: 중복 단어 피하기
    if (
        prev_top1 is not None
        and best_top1 == prev_top1
        and nondup_result is not None
        and nondup_prob >= alt_thr
    ):
        if debug:
            print(
                f"         → best token == prev('{prev_top1}'), "
                f"non-dup {nondup_top1} ({nondup_prob:.3f}) >= {alt_thr:.2f}, "
                f"non-dup 사용"
            )
        return nondup_s, nondup_e, nondup_result

    if debug:
        print(
            f"         → 최종 선택: {best_s}~{best_e-1}, "
            f"{best_top1} ({best_prob:.3f})"
        )

    return best_s, best_e, best_result


# =========================================================
# public API 함수들
# =========================================================

def infer_segments_from_seq(
    seq_raw: np.ndarray,
    *,
    fps: float = 30.0,
    pause_sec: float = 0.3,
    motion_th: float = 0.06,
    min_word_sec: float = 0.3,
    smooth_alpha: float = 0.7,
    conf_thr: float = 0.8,
    alt_thr: float = 0.5,
    debug: bool = False,
) -> Dict[str, Any]:
    """
    (T,F) 시퀀스를 입력받아
    - 휴지기 기반 세그먼트 분리
    - 각 세그먼트별 단어 인퍼런스 + boundary refine
    를 수행하고 결과 dict를 반환한다.

    반환 형식 예시:
    {
      "ok": True,
      "T": 177,
      "F": 126,
      "params": {... 하이퍼파라미터 ...},
      "motion_stats": {...},
      "segments": [
         {
           "index": 0,
           "rough": [s, e],        # coarse segment
           "refined": [rs, re],    # refined window
           "len_frames": 34,
           "len_sec": 1.13,
           "token": "맞다",
           "prob": 0.98,
           "result": { ... infer_gloss_from_seq raw dict ... }
         },
         ...
      ],
      "tokens": ["맞다", "비밀번호", ...],
      "gloss_sentence": "맞다 비밀번호 ..."
    }
    """
    # (T,F) 보정
    seq_raw = _to_numpy_2d(seq_raw.astype("float32"))
    T, F = seq_raw.shape

    # smoothing (휴지기 판정용)
    if 0.0 < smooth_alpha < 1.0:
        seq_seg = smooth_seq_ema(seq_raw, alpha=smooth_alpha)
    else:
        seq_seg = seq_raw.copy()

    # motion debug 통계
    motion_stats = _debug_motion_stats(seq_seg, fps=fps)
    if debug:
        print("[motion] min={min:.6f} max={max:.6f} mean={mean:.6f}".format(**motion_stats))
        for th, info in motion_stats["longest_still"].items():
            print(
                f"[motion] th={th:.2f} longest still = "
                f"{info['frames']} frames (~{info['sec']:.2f} sec)"
            )

    # 1) 세그먼트 분리
    segments, _ = segment_by_pause_local(
        seq=seq_seg,
        fps=fps,
        pause_sec=pause_sec,
        motion_th=motion_th,
        min_word_sec=min_word_sec,
    )

    if debug:
        print(
            f"[segment] found {len(segments)} segments "
            f"(pause_sec={pause_sec}, motion_th={motion_th})"
        )

    min_word_frames = int(round(fps * min_word_sec))
    prev_top1: Optional[str] = None

    seg_results: List[Dict[str, Any]] = []

    for idx, (s, e) in enumerate(segments):
        length = e - s
        sec = length / fps

        if debug:
            print(
                f"  seg{idx}: rough {s}~{e-1} "
                f"(len={length} frames, {sec:.2f} sec)"
            )

        if length < min_word_frames:
            if debug:
                print(
                    f"       → too short (< {min_word_sec:.2f} sec), skip"
                )
            continue

        rs, re, result = refine_with_classifier(
            seq_raw=seq_raw,
            s=s,
            e=e,
            min_word_frames=min_word_frames,
            conf_thr=conf_thr,
            prev_top1=prev_top1,
            alt_thr=alt_thr,
            debug=debug,
        )

        if rs is None or result is None:
            if debug:
                print(
                    f"       → no valid window (len < {min_word_sec:.2f} sec), skip"
                )
            continue

        final_top1 = result["topk_tokens"][0]
        final_prob = float(result["topk_probs"][0])
        final_len = re - rs
        final_sec = final_len / fps

        if debug:
            print(
                f"       → final seg{idx}: {rs}~{re-1} "
                f"(len={final_len} frames, {final_sec:.2f} sec) "
                f"{final_top1} ({final_prob:.3f})"
            )

        seg_results.append(
            {
                "index": idx,
                "rough": [int(s), int(e)],
                "refined": [int(rs), int(re)],
                "len_frames": int(final_len),
                "len_sec": float(final_sec),
                "token": final_top1,
                "prob": final_prob,
                "result": result,
            }
        )

        prev_top1 = final_top1

        tokens = [s["token"] for s in seg_results]

    # 글로스만 공백으로 이어붙인 원문 (디버깅/로그용)
    gloss_sentence = " ".join(tokens)

    # ✅ 여기서 intersection.py의 로직 사용
    korean_sentence = gloss_tokens_to_korean(tokens)

    return {
        "ok": True,
        "T": int(T),
        "F": int(F),
        "params": {
            "fps": fps,
            "pause_sec": pause_sec,
            "motion_th": motion_th,
            "min_word_sec": min_word_sec,
            "smooth_alpha": smooth_alpha,
            "conf_thr": conf_thr,
            "alt_thr": alt_thr,
        },
        "motion_stats": motion_stats,
        "segments": seg_results,
        "tokens": tokens,
        "gloss_sentence": gloss_sentence,   # 글로스 문장 (디버깅용)
        "korean_sentence": korean_sentence, # ✅ 최종 한국어 문장
    }



def infer_segments_from_npz(
    npz_path: Path | str,
    **kwargs,
) -> Dict[str, Any]:
    """
    파일 경로를 받아 바로 세그먼트+단어 인퍼런스를 수행하는 헬퍼.

    사용 예시 (테스트용):
        from sign.segment_infer import infer_segments_from_npz
        res = infer_segments_from_npz(
            "dataset/npz/recorded/sess_xxx.npz",
            fps=30.0,
            pause_sec=0.3,
            motion_th=0.06,
            min_word_sec=0.3,
            smooth_alpha=0.7,
            conf_thr=0.8,
            debug=True,
        )
        print(res["gloss_sentence"])
    """
    seq = load_seq_from_npz(npz_path)
    return infer_segments_from_seq(seq, **kwargs)

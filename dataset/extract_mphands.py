import os
import csv
import json
import math
from pathlib import Path
import cv2
import numpy as np
from tqdm import tqdm

import mediapipe as mp

# =========================
# 설정
# =========================
DATA_DIR = Path(".")
RAW_DIR = DATA_DIR / "raw_videos"
LABEL_CSV = DATA_DIR / "label.csv"
OUT_DIR = DATA_DIR / "processed"       # 시퀀스 저장 폴더
FPS_TARGET = 30                        # 필요시 리샘플
MAX_LEN = None                         # 길이 고정 원하면 정수(예: 120)로 지정. None이면 원길이 유지.
CONF_THRESH = 0.5                      # landmark visibility/score 필터

# =========================
# 유틸
# =========================
def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)

def resample_indices(n_src:int, n_tgt:int):
    """원 시퀀스 길이 n_src -> 목표 길이 n_tgt 로 선형 인덱스 매핑"""
    if n_tgt is None or n_tgt == n_src:
        return list(range(n_src))
    xs = np.linspace(0, n_src-1, num=n_tgt)
    return np.round(xs).astype(int).tolist()

def flatten_two_hands(frame_left, frame_right):
    """
    각 손 21랜드마크 * (x,y,z) = 63
    왼손 63 + 오른손 63 => 126 float 벡터
    없으면 0-padding
    """
    def to_vec(h):
        if h is None:
            return [0.0]*63
        vec = []
        for (x,y,z) in h:
            vec.extend([float(x), float(y), float(z)])
        return vec
    return np.array(to_vec(frame_left) + to_vec(frame_right), dtype=np.float32)

def extract_hands_one_frame(results, img_w, img_h):
    """
    MediaPipe 결과에서 왼/오 손 랜드마크를 정규화하여 추출.
    반환: (left[(x,y,z)*21], right[(x,y,z)*21])  또는 None
    좌표 정규화: x:=x/img_w, y:=y/img_h, z는 그대로(상대값)
    """
    left, right = None, None
    if not results.multi_hand_landmarks or not results.multi_handedness:
        return left, right

    # handedness와 landmarks를 매칭
    for handedness, landmarks in zip(results.multi_handedness, results.multi_hand_landmarks):
        label = handedness.classification[0].label  # 'Left' or 'Right'
        pts = []
        for lm in landmarks.landmark:
            x = lm.x  # 이미 normalized(0~1) 이지만 안전하게 이미지 기준 다시 clamp
            y = lm.y
            z = lm.z  # relative depth
            # 일부 모델/프레임에선 범위를 벗어날 수 있어 clip
            x = float(np.clip(x, 0.0, 1.0))
            y = float(np.clip(y, 0.0, 1.0))
            pts.append((x, y, z))
        # 가끔 매우 낮은 신뢰 프레임은 버리고 0패딩 처리하고 싶다면 여기에서 threshold 판단 가능
        if label == 'Left':
            left = pts
        else:
            right = pts
    return left, right

# =========================
# 메인: 영상 -> 시퀀스 추출
# =========================
def process_video(video_path: Path, label_text: str, out_dir: Path):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open {video_path}")

    # 원본 FPS
    src_fps = cap.get(cv2.CAP_PROP_FPS)
    src_fps = src_fps if src_fps and not math.isnan(src_fps) else 30.0

    # MediaPipe Hands 초기화
    mp_hands = mp.solutions.hands
    hands = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=2,
        model_complexity=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    frames = []
    # 프레임 추출
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        h, w = frame.shape[:2]
        # RGB 변환
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb)

        left, right = extract_hands_one_frame(results, w, h)
        vec126 = flatten_two_hands(left, right)  # [126]
        frames.append(vec126)

    cap.release()
    hands.close()

    if len(frames) == 0:
        # 비어있으면 스킵
        return None

    # FPS 리샘플 (원하면)
    if FPS_TARGET and abs(src_fps - FPS_TARGET) > 1.0:
        # 간단히 프레임 수 기준으로만 리샘플
        dur_sec = len(frames) / src_fps
        tgt_len = int(round(dur_sec * FPS_TARGET))
    else:
        tgt_len = len(frames)

    idx = resample_indices(len(frames), tgt_len)
    seq = np.stack([frames[i] for i in idx], axis=0)  # [T, 126]

    # 길이 고정(옵션): pad/trunc
    if isinstance(MAX_LEN, int):
        if seq.shape[0] > MAX_LEN:
            seq = seq[:MAX_LEN]
        elif seq.shape[0] < MAX_LEN:
            pad = np.zeros((MAX_LEN - seq.shape[0], seq.shape[1]), dtype=seq.dtype)
            seq = np.concatenate([seq, pad], axis=0)

    # 라벨 토큰 분리(CTC용)
    tokens = label_text.strip().split()  # 공백 기준 글로스 토큰
    sample = {
        "seq": seq.astype(np.float32),     # [T, 126]
        "label_tokens": tokens             # ["THANK","YOU"] 등
    }

    # 저장 (.npz + 메타 JSON)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = video_path.stem
    np.savez_compressed(out_dir / f"{stem}.npz", seq=sample["seq"])
    with open(out_dir / f"{stem}.json", "w", encoding="utf-8") as f:
        json.dump({"label_tokens": tokens, "fps": FPS_TARGET or src_fps, "orig_fps": src_fps}, f, ensure_ascii=False)

    return stem

def main():
    ensure_dir(OUT_DIR)
    rows = []
    with open(LABEL_CSV, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)

    ok_list, fail_list = [], []
    for r in tqdm(rows, desc="Extract"):
        fname = r["file"]
        label = r["label"]
        vpath = RAW_DIR / fname
        try:
            stem = process_video(vpath, label, OUT_DIR)
            if stem:
                ok_list.append((fname, label))
            else:
                fail_list.append((fname, "no frames"))
        except Exception as e:
            fail_list.append((fname, str(e)))

    # 인덱스 파일 생성
    with open(OUT_DIR / "index.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id","file","label"])
        for i,(fname,label) in enumerate(ok_list):
            w.writerow([i, fname, label])

    print(f"\nDone. success={len(ok_list)}, fail={len(fail_list)}")
    if fail_list:
        print("Fails:")
        for x in fail_list[:10]:
            print(" -", x)

if __name__ == "__main__":
    main()

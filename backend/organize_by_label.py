# 파일이 섞여있을 때, 파일뭉치에서 폴더로 분리해주는 스크립트
# 부가단계

import shutil
import pandas as pd
from pathlib import Path


# ==== 경로 설정 ====
# labels.csv 위치 (현재 실행하는 폴더에 있으면 그대로 두면 됨)
CSV_PATH = "dataset/npz/recorded/10개학습데이터/labels_recorded.csv"

# npz 파일들이 모여 있는 폴더 (네 상황에 맞게 수정)
# 예: ./dataset/npz/recorded 에 전부 섞여 있다면:
NPZ_DIR = Path("dataset/npz/recorded/10개학습데이터")

# ==== CSV 읽기 ====
df = pd.read_csv(CSV_PATH)

# 혹시 공백 들어간 경우 대비해서 strip
df["file"] = df["file"].astype(str).str.strip()
df["label"] = df["label"].astype(str).str.strip()

# ==== 파일 이동 ====
for _, row in df.iterrows():
    fname = row["file"]          # 예: sess_1763846216722_1763849225518
    label = row["label"]         # 예: 금리

    src = NPZ_DIR / f"{fname}.npz"       # 원본 파일 경로
    dst_dir = NPZ_DIR / label            # 라벨 폴더 (예: recorded/금리)
    dst_dir.mkdir(exist_ok=True)         # 폴더 없으면 생성

    dst = dst_dir / f"{fname}.npz"

    if src.exists():
        print(f"Moving {src}  ->  {dst}")
        shutil.move(src, dst)
    else:
        print(f"[WARNING] 파일 없음: {src}")

# 각 폴더 안에 있는 npz들을 recorded/ 바로 밑으로 복사하는 스크립트

import shutil
from pathlib import Path

# 기준 폴더
BASE = Path("dataset/npz/recorded")

# recorded/ 밑의 모든 폴더를 확인
for label_dir in BASE.iterdir():
    if label_dir.is_dir() and label_dir.name not in ["labels_recorded.csv", "vocab_recorded.json"]:
        
        # 폴더 안의 모든 npz 파일 순회
        for npz in label_dir.glob("*.npz"):
            dst = BASE / npz.name  # recorded/ 바로 아래로 복사
            
            # 이미 있으면 덮어쓰지 않음 (필요시 overwrite 가능)
            if dst.exists():
                print(f"[SKIP] 이미 존재: {dst}")
                continue

            print(f"[COPY] {npz}  →  {dst}")
            shutil.copy(npz, dst)
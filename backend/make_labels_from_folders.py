import csv
from pathlib import Path

ROOT = Path("dataset/npz/recorded")   # 네 폴더 위치에 맞게 수정

out_rows = []
for label_dir in ROOT.iterdir():
    if not label_dir.is_dir():
        continue
    label = label_dir.name    # 폴더명이 바로 label
    for npz_file in label_dir.glob("*.npz"):
        file_id = npz_file.stem
        out_rows.append([file_id, label])

# 저장
with open("labels_recorded.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["file", "label"])
    w.writerows(out_rows)

print("총", len(out_rows), "개 npz 인덱싱 완료.")

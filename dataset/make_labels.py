# make_labels.py
from pathlib import Path
import csv, re, json

DATASET_DIR = Path(__file__).parent.resolve()
RAW_DIR  = DATASET_DIR / "raw_videos"
OUT_CSV  = DATASET_DIR / "labels.csv"
MAP_JSON = DATASET_DIR / "mapping.json"

# mov, mp4, avi 등 확장자 허용
EXTS = {".mov", ".mp4", ".avi", ".mkv"}

def infer_label(stem: str) -> str:
    s = stem
    s = re.sub(r'^\s*\d+\s*[-_ ]\s*', '', s)
    tokens = [t for t in re.split(r'[-_ ]+', s) if t]
    label = tokens[-1].strip() if tokens else s.strip()
    label = re.sub(r'[()\[\]{}]', '', label).strip()
    return label

def main():
    # raw_videos 폴더 자동 생성
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    all_files = [p for p in RAW_DIR.rglob("*") if p.is_file() and p.suffix.lower() in EXTS]
    if not all_files:
        print(f"[WARN] raw_videos 폴더에 확장자 {sorted(EXTS)} 파일이 없습니다.")
        print(f"→ 여기에 수어 영상 파일을 넣고 다시 실행하세요: {RAW_DIR}")
        return

    uniq_by_name = {}
    for p in all_files:
        uniq_by_name.setdefault(p.name, p)
    files = sorted(uniq_by_name.values(), key=lambda x: x.name.lower())

    user_map = {}
    if MAP_JSON.exists():
        try:
            user_map = json.loads(MAP_JSON.read_text(encoding="utf-8"))
            print(f"[INFO] mapping.json 로드됨 ({len(user_map)} entries)")
        except Exception as e:
            print(f"[WARN] mapping.json 파싱 실패: {e}")

    rows = [("file", "label")]
    for f in files:
        stem = f.stem
        label = user_map.get(stem) or infer_label(stem)
        rows.append((f.name, label))

    with OUT_CSV.open("w", newline="", encoding="utf-8-sig") as fp:
        writer = csv.writer(fp)
        writer.writerows(rows)

    print(f"[OK] labels.csv 생성 완료 → {OUT_CSV}")
    print(f"총 {len(rows)-1}개 파일 처리됨")

if __name__ == "__main__":
    main()

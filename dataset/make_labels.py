# make_labels.py
from pathlib import Path
import csv, re, json
from collections import defaultdict

DATASET_DIR = Path(__file__).parent.resolve()
RAW_DIR  = DATASET_DIR / "raw_videos"
OUT_CSV  = DATASET_DIR / "labels.csv"
MAP_JSON = DATASET_DIR / "mapping.json"

# 허용 확장자 & 선호 순서(앞일수록 우선)
EXTS = {".mov", ".mp4", ".avi", ".mkv", ".webm"}
PREFERRED_EXTS = [".mp4", ".mov", ".mkv", ".avi", ".webm"]  # 필요시 조정

def infer_label(stem: str) -> str:
    s = stem
    # "209-가격경쟁" -> "가격경쟁"
    s = re.sub(r'^\s*\d+\s*[-_ ]\s*', '', s)
    tokens = [t for t in re.split(r'[-_ ]+', s) if t]
    label = tokens[-1].strip() if tokens else s.strip()
    label = re.sub(r'[()\[\]{}]', '', label).strip()
    return label

def pick_preferred(paths):
    """같은 stem의 여러 파일 중 선호 확장자/사전순 경로 기준으로 1개 선택"""
    # 1) 확장자 우선순위 정렬
    def ext_rank(p):
        ext = p.suffix.lower()
        return PREFERRED_EXTS.index(ext) if ext in PREFERRED_EXTS else len(PREFERRED_EXTS)
    # 2) 동순위면 경로 알파벳순
    paths = sorted(paths, key=lambda p: (ext_rank(p), str(p).lower()))
    return paths[0]

def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    all_files = [p for p in RAW_DIR.rglob("*")
                 if p.is_file() and p.suffix.lower() in EXTS]
    if not all_files:
        print(f"[WARN] raw_videos 폴더에 {sorted(EXTS)} 파일이 없습니다.")
        print(f"→ 여기에 수어 영상 파일을 넣고 다시 실행하세요: {RAW_DIR}")
        return

    # stem 단위로 버킷팅 (확장자 중복 정리용)
    buckets = defaultdict(list)
    for p in all_files:
        buckets[p.stem].append(p)

    kept = {}
    dropped = []
    for stem, paths in buckets.items():
        keep = pick_preferred(paths)
        kept[stem] = keep
        for q in paths:
            if q != keep:
                dropped.append(q)

    # 사용자 매핑 불러오기 (stem -> label)
    user_map = {}
    if MAP_JSON.exists():
        try:
            user_map = json.loads(MAP_JSON.read_text(encoding="utf-8"))
            print(f"[INFO] mapping.json 로드됨 ({len(user_map)} entries)")
        except Exception as e:
            print(f"[WARN] mapping.json 파싱 실패: {e}")

    # labels.csv 작성 (stem 알파벳순)
    rows = [("file", "label")]
    for stem in sorted(kept.keys(), key=lambda s: s.lower()):
        path = kept[stem]
        label = user_map.get(stem) or infer_label(stem)
        rows.append((path.name, label))

    with OUT_CSV.open("w", newline="", encoding="utf-8-sig") as fp:
        writer = csv.writer(fp)
        writer.writerows(rows)

    # 리포트
    total = len(all_files)
    kept_n = len(kept)
    dropped_n = len(dropped)
    print(f"[OK] labels.csv 생성 완료 → {OUT_CSV}")
    print(f"총 스캔: {total}개 / 사용: {kept_n}개 / 중복 제거: {dropped_n}개")

    if dropped_n:
        # 중복으로 버린 파일 요약 출력(상위 10개만)
        by_ext = defaultdict(int)
        for q in dropped:
            by_ext[q.suffix.lower()] += 1
        ext_stat = ", ".join([f"{k}:{v}" for k, v in sorted(by_ext.items())])
        print(f"[INFO] 중복으로 제외된 파일(확장자별): {ext_stat}")
        print("[INFO] 예시(최대 10개):")
        for q in sorted(dropped, key=lambda p: str(p).lower())[:10]:
            print("  -", q.relative_to(DATASET_DIR))

if __name__ == "__main__":
    main()

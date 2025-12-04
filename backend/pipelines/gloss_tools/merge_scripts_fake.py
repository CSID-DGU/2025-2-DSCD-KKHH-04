from pathlib import Path

# 기준 폴더 경로
BASE_DIR = Path(r"C:\Users\user\Desktop\2025-2-DSCD-KKHH-04-git\backend\pipelines\gloss_tools")

# 입력 파일들 (순서 중요하면 이렇게 명시!)
INPUT_FILES = [
    BASE_DIR / "script_fake1.txt",
    BASE_DIR / "script_fake2.txt",
    BASE_DIR / "script_fake3.txt",
    BASE_DIR / "script_fake4.txt",
]

OUTPUT_FILE = BASE_DIR / "script_fake.txt"

with open(OUTPUT_FILE, "w", encoding="utf-8") as outfile:
    for file in INPUT_FILES:
        with open(file, "r", encoding="utf-8") as infile:
            outfile.write(infile.read().rstrip() + "\n")

print(f"[Done] 합쳐서 저장 완료 → {OUTPUT_FILE}")

# remove_duplicates.py

from pathlib import Path

# 🔹 수정하고 싶은 txt 파일 경로
FILE_PATH = Path(r"C:\Users\user\Desktop\2025-2-DSCD-KKHH-04-git\backend\pipelines\gloss_tools\gloss_tokens_merged.txt")

def dedupe_txt(path: Path):
    # 파일 읽기
    lines = path.read_text(encoding="utf-8").splitlines()

    # 양쪽 공백 제거 + 빈 줄 제외
    cleaned = [line.strip() for line in lines if line.strip()]

    # 중복 제거(set) + 원래 순서 유지
    seen = set()
    deduped = []
    for word in cleaned:
        if word not in seen:
            deduped.append(word)
            seen.add(word)

    # 결과 다시 파일에 저장
    path.write_text("\n".join(deduped), encoding="utf-8")

    print(f"중복 제거 완료! 총 {len(lines)} → {len(deduped)} 단어로 정리됨.")
    print(f"파일 위치: {path}")

if __name__ == "__main__":
    dedupe_txt(FILE_PATH)

import csv, json
from pathlib import Path

PROC_DIR = Path("dataset/processed")
IDX_CSV = PROC_DIR / "index.csv"
VOCAB_JSON = PROC_DIR / "vocab.json"

def main():
    vocab = set()
    with open(IDX_CSV, "r", encoding="utf-8") as f:
        next(f)  # skip header
        for line in f:
            _, _, label = line.strip().split(",", 2)
            for tok in label.strip().split():
                vocab.add(tok)

    # CTC용 blank는 모델에서 0번으로 쓰는 경우가 일반적이라 여기선 제외/주석만 남김
    vocab = sorted(vocab)
    with open(VOCAB_JSON, "w", encoding="utf-8") as f:
        json.dump({"tokens": vocab, "ctc_blank_index": 0}, f, ensure_ascii=False, indent=2)

    print("vocab size:", len(vocab))

if __name__ == "__main__":
    main()

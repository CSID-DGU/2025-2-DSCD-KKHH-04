# vocab.json 만드는 스크립트

import json
import csv

labels = set()
with open("labels_recorded.csv", encoding="utf-8-sig") as f:
    r = csv.DictReader(f)
    for row in r:
        labels.add(row["label"])

vocab = {"tokens": sorted(labels)}
with open("vocab_recorded.json", "w", encoding="utf-8") as f:
    json.dump(vocab, f, ensure_ascii=False, indent=2)

print("vocab 생성 완료:", len(vocab["tokens"]), "개 클래스")
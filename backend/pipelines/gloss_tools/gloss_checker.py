# -*- coding: utf-8 -*-
"""
1) gloss_dictionary_MOCK_1.csv의 korean_meanings 열에서 모든 한국어 단어 목록 수집
2) gloss_tokens.txt의 단어가 사전에 존재하는지 확인
3) 없는 단어들을 gloss_not_in_dict.txt에 저장
"""

import csv
import ast
import unicodedata
import re
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent

DICT_CSV_PATH   = ROOT_DIR / "gloss_dictionary_MOCK_1.csv"
GLOSS_TOKENS    = ROOT_DIR / "gloss_tokens.txt"
MISSING_OUTFILE = ROOT_DIR / "gloss_not_in_dict.txt"


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "").strip()
    return re.sub(r"\s+", " ", s)


def load_korean_terms_from_dict(csv_path: Path) -> set[str]:
    terms = set()

    with open(csv_path, "r", encoding="utf-8-sig") as f:
        rdr = csv.DictReader(f)
        headers = [h.lower().strip() for h in (rdr.fieldnames or [])]

        cand = [
            "korean_meanings", "korean", "ko",
            "meaning_ko", "ko_meanings", "korean_meaning"
        ]
        h_ko = next((c for c in cand if c in headers), None)

        if not h_ko:
            raise RuntimeError(f"korean_meanings 열을 찾을 수 없습니다. 헤더: {headers}")

        for row in rdr:
            cell = (row.get(h_ko) or "").strip()
            if not cell:
                continue

            try:
                obj = ast.literal_eval(cell)
                if isinstance(obj, (list, tuple)):
                    items = [str(x) for x in obj]
                else:
                    items = [str(obj)]
            except Exception:
                items = [cell]

            for t in items:
                t_norm = norm(t)
                if t_norm:
                    terms.add(t_norm)

    return terms


def main():
    dict_terms = load_korean_terms_from_dict(DICT_CSV_PATH)
    print(f"[Info] 사전 단어 개수: {len(dict_terms)}")

    missing = []
    with open(GLOSS_TOKENS, "r", encoding="utf-8") as f:
        for line in f:
            tok = line.strip()
            if not tok:
                continue
            if norm(tok) not in dict_terms:
                missing.append(tok)

    with open(MISSING_OUTFILE, "w", encoding="utf-8") as f:
        for w in missing:
            f.write(w + "\n")

    total_tokens = sum(1 for _ in open(GLOSS_TOKENS, "r", encoding="utf-8"))

    print(f"[Done] gloss_tokens 단어 수: {total_tokens}")
    print(f"[Done] 사전에 없는 단어 수: {len(missing)}")
    print(f"[Done] 결과 저장: {MISSING_OUTFILE}")


if __name__ == "__main__":
    main()

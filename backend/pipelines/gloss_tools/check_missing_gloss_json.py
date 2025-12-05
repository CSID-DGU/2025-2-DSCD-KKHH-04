# -*- coding: utf-8 -*-
"""
1) gloss_dictionary_MOCK_1.csv의 korean_meanings 열에서 모든 한국어 단어 목록 수집
2) gloss_tokens.txt의 단어가 사전에 존재하는지 확인
3) 사전에 없는 단어들을 dict(JSON) 형태로 gloss_missing_map.json에 저장

출력 예시:
{
  "자동체": [],
  "정기예금": []
}
"""

import csv
import ast
import unicodedata
import re
import json
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent

DICT_CSV_PATH   = ROOT_DIR / "gloss_dictionary_MOCK_1.csv"
GLOSS_TOKENS    = ROOT_DIR / "gloss_tokens.txt"
MISSING_JSON    = ROOT_DIR / "gloss_missing_map.json"


def norm(s: str) -> str:
    """전각/반각 통일 + 공백 정규화."""
    s = unicodedata.normalize("NFKC", s or "").strip()
    return re.sub(r"\s+", " ", s)


def load_korean_terms_from_dict(csv_path: Path) -> set[str]:
    """CSV 사전에서 korean_meanings 계열 컬럼의 한국어 단어들을 set으로 로드."""
    terms = set()

    with open(csv_path, "r", encoding="utf-8-sig") as f:
        rdr = csv.DictReader(f)
        headers = [h.lower().strip() for h in (rdr.fieldnames or [])]

        cand = [
            "korean_meanings", "korean", "ko",
            "meaning_ko", "ko_meanings", "korean_meaning",
        ]
        h_ko = next((c for c in cand if c in headers), None)

        if not h_ko:
            raise RuntimeError(f"korean_meanings 열을 찾을 수 없습니다. 헤더: {headers}")

        for row in rdr:
            cell = (row.get(h_ko) or "").strip()
            if not cell:
                continue

            # '["거치","거치식"]' 같은 리스트 문자열 처리
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
    if not DICT_CSV_PATH.exists():
        raise FileNotFoundError(f"사전 CSV를 찾을 수 없습니다: {DICT_CSV_PATH}")
    if not GLOSS_TOKENS.exists():
        raise FileNotFoundError(f"gloss_tokens.txt를 찾을 수 없습니다: {GLOSS_TOKENS}")

    # 1) 사전 단어 로드
    dict_terms = load_korean_terms_from_dict(DICT_CSV_PATH)
    print(f"[Info] 사전 단어 개수: {len(dict_terms)}")

    # 2) gloss_tokens.txt에서 사전에 없는 단어 수집
    missing_set = set()
    total_tokens = 0

    with open(GLOSS_TOKENS, "r", encoding="utf-8") as f:
        for line in f:
            tok = line.strip()
            if not tok:
                continue
            total_tokens += 1
            if norm(tok) not in dict_terms:
                missing_set.add(tok)

    # 3) missing 토큰들을 dict 형태로 변환 (값은 비어 있는 리스트)
    missing_map = {tok: [] for tok in sorted(missing_set)}

    # 4) JSON 파일로 저장
    with open(MISSING_JSON, "w", encoding="utf-8") as f:
        json.dump(missing_map, f, ensure_ascii=False, indent=2)

    print(f"[Done] gloss_tokens 단어 수: {total_tokens}")
    print(f"[Done] 사전에 없는 단어 수: {len(missing_set)}")
    print(f"[Done] JSON 저장: {MISSING_JSON}")


if __name__ == "__main__":
    main()

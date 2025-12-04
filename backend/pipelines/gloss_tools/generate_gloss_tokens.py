# -*- coding: utf-8 -*-
"""
script.txt의 각 문장을 Gemini에 넣어 글로스(gloss) 토큰을 추출하고,
중복 없이 gloss_tokens.txt에 저장하는 스크립트.
"""

import os
import sys
import json
import re
import unicodedata
from pathlib import Path

# --------------------------------
# 기본 경로
# --------------------------------
ROOT_DIR       = Path(__file__).resolve().parent
SCRIPT_PATH    = ROOT_DIR / "script.txt"
GLOSS_OUT_PATH = ROOT_DIR / "gloss_tokens_merged.txt"

# Gemini API 설정
API_KEY = os.environ.get("GOOGLE_API_KEY", "")
MODEL_NAME = "models/gemini-2.5-flash"

# --------------------------------
# Gemini 로드
# --------------------------------
try:
    import google.generativeai as genai
except Exception as e:
    print(f"[Error] google.generativeai import 실패: {e}")
    sys.exit(1)


def norm(s: str) -> str:
    """전각/반각 통일 + 공백 정규화."""
    s = unicodedata.normalize("NFKC", s or "").strip()
    return re.sub(r"\s+", " ", s)


def build_model():
    """Gemini 모델 생성."""
    if not API_KEY:
        print("[Error] GOOGLE_API_KEY 미설정")
        sys.exit(1)

    genai.configure(api_key=API_KEY)

    sys_prompt = (
        "역할: 한국어 전사 교정 + 수어 글로스 추출기.\n"
        '출력: {"clean":"…","gloss":["…"]} JSON 한 줄.\n'
        "규칙:\n"
        "1) clean: 의미 보존한 자연스러운 문장\n"
        "2) gloss: 조사/어미 제거된 한국어 단어, 공백 금지, 단일명사\n"
        "3) 예: ['정기예금','만기','이자','보호']"
    )

    return genai.GenerativeModel(
        MODEL_NAME,
        system_instruction=sys_prompt,
        generation_config={
            "response_mime_type": "application/json",
            "temperature": 0.2,
        },
    )


def extract_glosses(text: str, model) -> list[str]:
    """한 문장 → gloss 리스트"""
    txt = norm(text)
    if not txt:
        return []

    try:
        resp = model.generate_content([{"role": "user", "parts": [txt]}])
        obj = json.loads(resp.text)
        gloss = obj.get("gloss", [])

        if isinstance(gloss, str):
            gloss = [gloss]

        return [g.strip() for g in gloss if g.strip()]
    except Exception as e:
        print(f"[Gemini 오류] {e}")
        return []


def load_existing(path: Path) -> set[str]:
    if not path.exists():
        return set()
    with open(path, "r", encoding="utf-8") as f:
        return {line.strip() for line in f if line.strip()}


def main():
    if not SCRIPT_PATH.exists():
        print(f"[Error] script.txt 없음: {SCRIPT_PATH}")
        sys.exit(1)

    model = build_model()
    existing = load_existing(GLOSS_OUT_PATH)

    with open(GLOSS_OUT_PATH, "a", encoding="utf-8") as fout, \
         open(SCRIPT_PATH, "r", encoding="utf-8") as fin:

        for line in fin:
            sent = line.strip()
            if not sent:
                continue

            glosses = extract_glosses(sent, model)
            print(f"[Sentence] {sent}")
            print(f"→ gloss: {glosses}")

            for g in glosses:
                if g not in existing:
                    fout.write(g + "\n")
                    existing.add(g)

    print(f"[Done] 총 gloss 개수 = {len(existing)}")
    print(f"[Done] 저장 위치: {GLOSS_OUT_PATH}")


if __name__ == "__main__":
    main()

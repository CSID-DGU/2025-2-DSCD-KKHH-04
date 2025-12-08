# -*- coding: utf-8 -*-
# new

"""
Django 백엔드용 파이프라인 모듈

역할:
- WAV/WEBM 등 음성 파일 -> STT(whisper)
- STT 텍스트 -> Gemini 기반 토큰 추출(tokens: gloss/image/pause)
- 간단 버전: extract_glosses(text, model) -> gloss 문자열 리스트 (기존 service.py 호환)
- gloss 리스트 -> gloss_id 매핑(CSV 사전)
- gloss_id -> 수어 영상(mp4) 경로 리스트

service.py에서 import 하는 심볼:
    stt_from_file
    extract_glosses
    to_gloss_ids
    load_gloss_index
    _paths_from_ids
    build_gemini
    MEDIA_ROOT
    now_ts
    OUT_DIR
    _norm
    GEMINI_MODEL
    _local_gloss_rules
"""

import os
import csv
import re
import json
import ast
import unicodedata
import difflib
import wave
import sys
from datetime import datetime
from pathlib import Path
import shutil
import subprocess
import tempfile
import time  # 디버깅용

import whisper
from dotenv import load_dotenv

from PIL import Image, ImageDraw, ImageFont

# Gemini 라이브러리
try:
    import google.generativeai as genai
except Exception:
    genai = None

# Django MEDIA_ROOT 연동 (없으면 로컬 media 폴더 사용)
try:
    from django.conf import settings

    MEDIA_ROOT = Path(getattr(settings, "MEDIA_ROOT", "media")).resolve()
except Exception:
    MEDIA_ROOT = Path(__file__).resolve().parent / "media"

# 1. .env 로드
load_dotenv()

# 2. 환경 변수
print("[PIPELINE] GOOGLE_API_KEY =", os.getenv("GOOGLE_API_KEY"))
GOOGLE_API_KEY = (os.getenv("GOOGLE_API_KEY") or "").strip().strip("'\"")
print("[DEBUG] GOOGLE_API_KEY prefix:", (GOOGLE_API_KEY or "")[:15], "...")

if not GOOGLE_API_KEY:
    print("⚠️  [Warn] GOOGLE_API_KEY가 설정되지 않았습니다. Gemini 없이 로컬 규칙만 사용합니다.")

# 3. 경로 설정
ROOT_DIR = Path(__file__).resolve().parent

GLOSS_NEW_DIR = ROOT_DIR / "gloss_new"

DATA_DIR = GLOSS_NEW_DIR / "data"  # backend/pipelines/gloss_new/data
OUT_DIR = GLOSS_NEW_DIR / "snapshots14"

# 이 경로들은 네 프로젝트 구조에 맞게 한 번 확인해줘
GLOSS_DICT_PATH = DATA_DIR / "gloss_dictionary_MOCK.csv"

# 규칙 파일 두 개 사용:
# - rules_base.json: 사람이 관리하는 기본 규칙
# - rules.json: 학습/추가 규칙 포함 실제 운영 규칙
RULES_PATH = DATA_DIR / "rules.json"  # 실제 사용 · 자동 업데이트 대상
RULES_BASE_PATH = DATA_DIR / "rules_base.json"

GLOSS_MP4_DIR = Path(
    r"C:\Users\user\Desktop\2025-2-DSCD-KKHH-04-git\backend\pipelines\gloss_new\data\service"
)
# 수어 mp4가 있는 루트 폴더 (하위 fi, li 등 포함)

VIDEO_OUT_DIR = GLOSS_NEW_DIR / "vd_output"
OUT_DIR.mkdir(exist_ok=True)
VIDEO_OUT_DIR.mkdir(exist_ok=True)

# 🔹 gloss 매핑 로그 저장 폴더/파일 (원하면 나중에 service.py에서 사용)
LOG_DIR = ROOT_DIR / "gloss_tools"
LOG_DIR.mkdir(parents=True, exist_ok=True)
GLOSS_LOG_FILE = LOG_DIR / "gloss_mapping_log.csv"


# =========================
# rules_base.json + rules.json 유틸
# =========================
def _load_json(path: Path) -> dict:
    """
    JSON 파일을 안전하게 읽어서 dict로 반환.
    파일이 없거나 형식이 잘못되면 빈 dict 반환.
    """
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_json(path: Path, data: dict):
    """
    dict를 JSON 파일로 저장.
    상위 디렉터리가 없으면 생성한다.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def merge_rules() -> dict:
    """
    rules_base.json + rules.json을 합쳐서 하나의 dict로 반환.

    구조 예:
    {
      "disambiguation_rules": { ... },
      "text_normalization": [ {...}, {...} ]
    }

    - disambiguation_rules: learned(rules.json)이 base를 덮어씀
    - text_normalization: base + learned 순서대로 이어 붙임
    """
    base = _load_json(RULES_BASE_PATH)
    learned = _load_json(RULES_PATH)

    base_dis = base.get("disambiguation_rules", {}) or {}
    learned_dis = learned.get("disambiguation_rules", {}) or {}

    base_norm = base.get("text_normalization", []) or []
    learned_norm = learned.get("text_normalization", []) or []

    return {
        "disambiguation_rules": {
            **base_dis,
            **learned_dis,  # learned가 있으면 base를 덮어씀
        },
        "text_normalization": base_norm + learned_norm,
    }


def append_learned_rule(wrong: str, correct: str):
    """
    wrong → correct 규칙을 rules.json(text_normalization)에 추가.
    rules_base.json은 건드리지 않는다.
    """
    wrong = (wrong or "").strip()
    correct = (correct or "").strip()
    if not wrong or not correct:
        return

    data = _load_json(RULES_PATH)
    if not isinstance(data, dict):
        data = {}

    tn_list = data.get("text_normalization", [])
    if not isinstance(tn_list, list):
        tn_list = []

    # 중복 방지
    for r in tn_list:
        if r.get("wrong") == wrong and r.get("correct") == correct:
            return  # 이미 동일 규칙 존재

    tn_list.append({"wrong": wrong, "correct": correct})
    data["text_normalization"] = tn_list
    _save_json(RULES_PATH, data)


# 모듈 로드 시 base+learned 규칙 한 번 머지해서 전역으로 보관
MERGED_RULES = merge_rules()


def append_normalization_rule(wrong: str, correct: str):
    """
    Django views(add_rule)에서 사용하는 wrapper.

    - rules.json(text_normalization)에 규칙 추가
    - MERGED_RULES도 다시 머지해서 최신 상태로 갱신
    """
    global MERGED_RULES
    append_learned_rule(wrong, correct)
    MERGED_RULES = merge_rules()


def apply_text_normalization(text: str, rules: dict | None = None) -> str:
    """
    rules['text_normalization']에 있는
    {wrong, correct} 리스트를 순서대로 적용해서 텍스트 정규화.
    """
    if not text:
        return text

    # ✅ rules 파라미터가 안 들어오면, 매번 최신 rules_base.json + rules.json을 다시 합쳐서 사용
    if rules is None:
        rules = merge_rules()

    norm_rules = rules.get("text_normalization", []) or []
    out = text
    for r in norm_rules:
        w = (r.get("wrong") or "").strip()
        c = (r.get("correct") or "").strip()
        if not w or not c:
            continue
        out = out.replace(w, c)
    return out



def log_gloss_mapping(
    gloss_list,
    gloss_ids,
    gloss_labels,
    text=None,
    mode=None,
    session_id=None,
    ts=None,
    only_mismatch=True,
):
    """
    gloss / gloss_ids / gloss_labels 매핑 결과를 CSV로 기록.
    """
    if gloss_list is None:
        gloss_list = []
    if gloss_ids is None:
        gloss_ids = []
    if gloss_labels is None:
        gloss_labels = []

    has_mismatch = any((g != l) for g, l in zip(gloss_list, gloss_labels))

    if only_mismatch and not has_mismatch:
        return

    if ts is None:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    row = {
        "timestamp": ts,
        "session_id": session_id or "",
        "mode": mode or "",
        "text": text or "",
        "gloss": "|".join(gloss_list),
        "gloss_ids": "|".join(gloss_ids),
        "gloss_labels": "|".join(gloss_labels),
        "has_mismatch": "1" if has_mismatch else "0",
    }

    file_exists = GLOSS_LOG_FILE.exists()
    with GLOSS_LOG_FILE.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "timestamp",
                "session_id",
                "mode",
                "text",
                "gloss",
                "gloss_ids",
                "gloss_labels",
                "has_mismatch",
            ],
        )
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)

# 파일 업로드
print("🔄 NEW pipeline.py loaded")
print("📁 GLOSS_DICT_PATH   =", GLOSS_DICT_PATH)
print("📁 RULES_BASE_PATH   =", RULES_BASE_PATH)
print("📁 RULES_PATH        =", RULES_PATH)
print("📁 GLOSS_MP4_DIR     =", GLOSS_MP4_DIR)
print("📁 GLOSS_LOG_FILE    =", GLOSS_LOG_FILE)

# 4. 모델/오디오 설정
GEMINI_MODEL_NAME = "models/gemini-2.5-flash"
WHISPER_MODEL_NAME = "small"
WHISPER_LANG = "ko"

ALWAYS_RETURN_ID = True  # 매핑 실패 시에도 유사도 기반으로 ID 하나는 선택

# 전역 캐시
GEMINI_MODEL = None
_WHISPER_MODEL = None
WHISPER_LOAD_MS = None

# ======================================================================
# 공통 유틸
# ======================================================================
def _norm(s: str) -> str:
    """전각/반각 통일 + 양 끝 공백 제거 + 내부 다중 공백을 1칸으로 축소."""
    s = unicodedata.normalize("NFKC", s or "").strip()
    s = re.sub(r"\s+", " ", s)
    return s


def _first_word(phrase: str) -> str:
    """문장에서 첫 단어만 추출(글로스는 단어 1개라는 전제 유지용)."""
    s = _norm(phrase)
    return s.split()[0] if s else ""


def _nospace(s: str) -> str:
    """공백/기호 제거 후 비교용 키 생성."""
    return re.sub(r"[^\w가-힣]", "", re.sub(r"\s+", "", _norm(s)))


def now_ts() -> str:
    """현재 시각을 YYYYmmdd_HHMMSS 문자열로 반환."""
    return datetime.now().strftime("%Y%m%d_%H%M%S")


# ======================================================================
# STT (파일 기반) - service.py에서 사용
# ======================================================================
def _get_whisper_model():
    global _WHISPER_MODEL, WHISPER_LOAD_MS
    if _WHISPER_MODEL is None:
        print(f"[Whisper] loading model: {WHISPER_MODEL_NAME}")
        t0 = time.perf_counter()
        try:
            _WHISPER_MODEL = whisper.load_model(WHISPER_MODEL_NAME, device="cpu")
            WHISPER_LOAD_MS = (time.perf_counter() - t0) * 1000.0
            print(
                f"[Whisper Init] whisper.load_model('{WHISPER_MODEL_NAME}') "
                f"{WHISPER_LOAD_MS:.1f} ms"
            )
        except Exception as e:
            print(f"[Whisper] 모델 로딩 실패: {e}")
            raise
    return _WHISPER_MODEL


def stt_from_file(audio_path: str) -> str:
    """
    서버에서 파일 경로를 받아 STT 수행 후 텍스트 반환.
    """
    model = _get_whisper_model()
    t0 = time.perf_counter()
    res = model.transcribe(
        str(audio_path),
        language=WHISPER_LANG,
        fp16=False,
        temperature=0.0,
        beam_size=1,
        best_of=1,
        condition_on_previous_text=False,
        no_speech_threshold=0.05,
        logprob_threshold=-2.0,
        compression_ratio_threshold=2.0,
    )
    t1 = time.perf_counter()
    print(f"[STT inner] whisper.transcribe only: {t1 - t0:.2f} sec for {audio_path}")

    stt_text = _norm(res.get("text") or "")
    print(f"[STT] {audio_path} -> \"{stt_text}\"")
    return stt_text


# ======================================================================
# Gemini 설정 및 토큰 추출 (고급 버전)
# ======================================================================
def build_gemini():
    """
    Gemini 모델 생성.
    """
    if not GOOGLE_API_KEY or genai is None:
        return None

    genai.configure(api_key=GOOGLE_API_KEY)

    sys_prompt = f"""

    당신은 '청각장애인을 위한 전문 수어(KSL) 통역사'입니다.

    입력된 문장을 단순 번역하지 말고, '농문화(Deaf Culture)'와 '한국수어 문법'에 맞춰 의미를 재구성(Paraphrasing)하십시오.



    [핵심 작업 원칙]

    1. 수지한국어(SK) 금지: 한국어의 어순이나 문법 요소(조사, 어미)를 그대로 따라가지 마십시오.

    2. 의미 중심 번역: 문장의 '핵심 의도'를 파악하여 가장 직관적인 단어들의 나열로 바꾸십시오.

    3. 메타 발화 삭제: "안내해 드리겠습니다", "말씀드리자면" 등 정보가가 없는 멘트는 과감히 삭제하십시오.

       - 단, '안녕하세요', '반갑습니다', '고맙습니다(감사합니다)', '수고하셨습니다' 등 사회적 관계를 맺는 인사말은 삭제하지 말고 반드시 수어 단어로 변환하십시오.

    4. 한국어 전용 출력 (Korean Only):

       - 결과 JSON의 'text' 필드 값에는 '반드시 한국어 또는 숫자'만 들어가야 합니다.

       - 영어 단어(예: 'Limit', 'Bank')가 포함되면 무조건 한국어 뜻으로 번역하여 출력하십시오.

        [cleaned 필드 규칙 – 아주 중요]
    1. cleaned는 화면에 자막으로 그대로 표시될, 사람용 자연스러운 한국어 문장입니다.
    2. 입력 문장의 존댓말/어미/높임(예: 주세요, 입니다, 해요)을 유지하십시오.
       - 동사·형용사를 사전형(주다, 하다, 가다)로 바꾸지 마십시오.
    3. 의미 없는 앞뒤 멘트만 제거할 수 있습니다.
       - 예) 입력: "지금부터 상품 설명 드리겠습니다. 신분증 주세요."
             cleaned: "신분증 주세요."
       - 예) 입력: "신분증 주세요."
             cleaned: "신분증 주세요."
    4. cleaned는 문장부호를 가볍게 다듬는 정도는 허용되지만, 단어 형태는 최대한 유지하십시오.

    [tokens 필드 규칙]
    1. tokens 배열은 수어 표현을 위한 단위입니다.
    2. tokens의 text는 수어 문법에 맞게 단어 기본형을 사용할 수 있습니다.
       - 예) cleaned: "신분증 주세요."
             tokens: [{{"text": "신분증", "type": "gloss"}},
                      {{"text": "주다", "type": "gloss"}}]
    3. "image" 타입, "pause" 타입 사용 규칙은 아래 내용을 따르십시오.


    [출력 포맷]
    {{
      "cleaned": "정리된 한국어 문장",
      "tokens": [
         {{ "text": "상품", "type": "gloss" }},
         {{ "text": "1명", "type": "image" }},
         {{ "text": "PAUSE", "type": "pause" }}
      ]
    }}
    이 JSON만 출력하십시오.
    
    5. 고유명사 및 상품명 처리 (Image Mapping):

       - 사람의 이름(성명), 낯선 지명, 브랜드명, 그리고 '구체적인 금융 상품명'은 수어로 억지로 번역하거나 쪼개지 말고 반드시 전체를 하나의 텍스트 이미지로 변환하십시오.

       - 영어와 한글이 섞여 있어도 합쳐서 하나의 이미지로 만드십시오.

       - 예: "저는 김동호입니다." -> '[저], [PAUSE], [김동호(image)]'

       - 예: "KB나라사랑적금 상품" -> '[KB나라사랑적금(image)], [상품]'

    6. 의문문 처리

       - 질문의 경우에는 반드시 끝에 '물음표'로 마무리 하십시오.

       - 예: "무엇을 도와드릴까요?" -> '[무엇], [돕다], [?(image)]

       - 예: "직장이 있으신가요?" -> '[직장], [있다], [?(image)]'

       - 예: "필요한 금액은 얼마인가요?" -> '[필요], [금액], [얼마], [?(image)]'

       - 예: "진행할까요?" -> '[진행], [?(image)]'

       

    [문법 및 구조 규칙 (Strict Rules)]

   

    1. 화제-서술 구조 (Topic-Comment):

       - 문장 맨 앞에 [시간] -> [장소] -> [화제(Topic)]를 배치하십시오.

       - 화제와 서술부 사이에는 반드시 `type: "pause"`를 삽입하여 시각적 호흡을 주십시오.

       - 예: "어제 집에서 밥을 먹었다" -> [어제], [집], [PAUSE], [밥], [먹다]

   

    2. 수량사 및 수식어 후치 (Post-position):

       - [수량]: '한 사람', '두 개의 계좌'는 반드시 [명사] + [수량] 순서로 변경하십시오.

         -> "한 사람" (X) -> [사람], [1명(이미지)] (O)

       - [부정어]: 서술어 뒤에 위치시킵니다. (예: [가다], [안하다])

       - [형용사]: 명사 뒤에 위치시킵니다. (예: [딸], [예쁘다])



    3. 숫자 및 단위 처리 (이미지화):

       - 오인식 방지를 위해 숫자가 포함된 모든 표현은 텍스트 이미지로 변환합니다.

       - 관형사 '한, 두, 세'는 반드시 아라비아 숫자 '1, 2, 3'으로 변환하십시오.

       - % (퍼센트): '[{{ "text": "3.5", "type": "image" }}, {{ "text": "퍼센트", "type": "gloss" }}]'

       - %p (퍼센트 포인트): '[{{ "text": "0.5", "type": "image" }}, {{ "text": "퍼센트", "type": "gloss" }}, {{ "text": "포인트", "type": "gloss" }}]'

       - 연 이율: '연'은 `[1년]` 수어로, 이율은 '[퍼센트]'로 처리.



    4. 어휘 단순화 (Vocabulary Simplification):

       - 어려운 한자어, 전문 용어는 기초적인 수어 단어의 조합으로 풀어서 설명하십시오.

       - 예: "주택담보대출" -> '[집]', '[맡기다]', '[돈]', '[빌리다]'

       - 예: "우대금리" -> '[특별]', '[이자]'



    [Few-shot Examples]



    입력: "이 상품은 한 사람당 하나의 계좌만 개설 가능합니다."

    출력:

    {{

        "cleaned": "상품 이것 사람 1명 계좌 1개 개설 가능",

        "tokens": [

            {{ "text": "상품", "type": "gloss" }},

            {{ "text": "이것", "type": "gloss" }},

            {{ "text": "PAUSE", "type": "pause" }},

            {{ "text": "사람", "type": "gloss" }},

            {{ "text": "1명", "type": "image" }},

            {{ "text": "계좌", "type": "gloss" }},

            {{ "text": "1개", "type": "image" }},
            {{ "text": "개설", "type": "gloss" }},
            {{ "text": "가능", "type": "gloss" }}

        ]

    }}



    입력: "금리는 연 3.5%포인트 우대 적용됩니다."

    출력:

    {{
        ]

        "cleaned": "금리 1년 3.5 퍼센트 점수 특별 적용",

        "tokens": [

            {{ "text": "금리", "type": "gloss" }},
            {{ "text": "PAUSE", "type": "pause" }},
            {{ "text": "1년", "type": "gloss" }},
            {{ "text": "3.5", "type": "image" }},
            {{ "text": "퍼센트", "type": "gloss" }},
            {{ "text": "점수", "type": "gloss" }},
            {{ "text": "특별", "type": "gloss" }},
            {{ "text": "적용", "type": "gloss" }}


    }}

    5. 범위 표현 (Range):
       - '이상/이하/초과/미만'은 오역 방지를 위해 반드시 '부터(~부터)'와 '까지(~까지)'로 변환하십시오.
       - 입력: "2.5% 이상" -> '[{{ "text": "2.5", "type": "image" }}, {{ "text": "퍼센트", "type": "gloss" }}, {{ "text": "부터", "type": "gloss" }}]'
       - 입력: "3.5% 이하" -> '[{{ "text": "3.5", "type": "image" }}, {{ "text": "퍼센트", "type": "gloss" }}, {{ "text": "까지", "type": "gloss" }}]'
       - 입력: "18세~30세" -> '[{{ "text": "18세", "type": "image" }}, {{ "text": "부터", "type": "gloss" }}, {{ "text": "30세", "type": "image" }}, {{ "text": "까지", "type": "gloss" }}]'

       

    [출력 포맷 (JSON Only)]

    반드시 JSON 형식만 출력하세요.

    """
    


    model = genai.GenerativeModel(
        GEMINI_MODEL_NAME,
        system_instruction=sys_prompt,
        generation_config={
            "response_mime_type": "application/json",
            "temperature": 0.2,
        },
    )
    return model


def _get_gemini_model():
    global GEMINI_MODEL
    if GEMINI_MODEL is None:
        GEMINI_MODEL = build_gemini()
    return GEMINI_MODEL



def extract_tokens(text: str, model=None) -> list[dict]:
    """
    STT 텍스트 -> Gemini 토큰(JSON) -> tokens 리스트 사용.
    - Gemini가 정상 응답하면: JSON의 tokens 그대로 사용
    - 에러 / 이상 응답이면: 로컬 regex 폴백 사용
    """
    clean = _norm(text)
    if not clean:
        return []
    
    # ✅ 여기에서 규칙 적용
    clean = apply_text_normalization(clean)


    if model is None:
        model = _get_gemini_model()

    # 1) Gemini 사용
    if model:
        try:
            print(f"[Gemini] call start  text={clean!r}")
            parts = [{"role": "user", "parts": [clean]}]
            t0 = time.perf_counter()
            resp = model.generate_content(parts)
            t1 = time.perf_counter()
            print(f"[Gemini] call done  {t1 - t0:.2f} sec")

            # --- Gemini 응답(JSON) 파싱 ---
            raw = ""
            if getattr(resp, "text", None):
                raw = resp.text
            else:
                # candidates에서 텍스트 모으는 백업 로직
                try:
                    cand = resp.candidates[0]
                    part_texts = []
                    for p in cand.content.parts:
                        if hasattr(p, "text"):
                            part_texts.append(p.text)
                    raw = "\n".join(part_texts)
                except Exception:
                    raw = ""

            raw = (raw or "").strip()
            if raw:
                # ```json ... ``` 래핑 제거
                if raw.startswith("```"):
                    raw = raw.strip("`")
                    if raw.lower().startswith("json"):
                        raw = raw[4:].lstrip()

                # 본문에서 JSON 부분만 잘라서 파싱 (최초 '{'부터 마지막 '}'까지)
                start = raw.find("{")
                end = raw.rfind("}")
                if start != -1 and end != -1 and end > start:
                    raw_json = raw[start : end + 1]
                else:
                    raw_json = raw

                obj = json.loads(raw_json)

                tokens = obj.get("tokens") or []
                out: list[dict] = []
                for t in tokens:
                    if not isinstance(t, dict):
                        continue
                    txt = (t.get("text") or "").strip()
                    typ = (t.get("type") or "gloss").strip()
                    if not txt:
                        continue
                    out.append({"text": txt, "type": typ})

                if out:
                    print(f"[Gemini] tokens -> {out}")
                    return out

        except Exception as e:
            print(f"[Gemini Error] {e}")

    # 2) 로컬 폴백
    # 2-1) "저는 김다영입니다." / "김다영입니다." 같은 이름 패턴
    m = re.match(r"^(?:저는\s*)?([가-힣]{2,4})입니다[\.!]*$", clean)
    if m:
        name = m.group(1)
        print(f"[LocalFallback] 이름 패턴 감지 -> image 토큰으로 사용: {name}")
        return [{"text": name, "type": "image"}]

    # 2-2) 그 외 일반 규칙
    print(f"[LocalFallback] Gemini 토큰 없음 → regex 사용  text={clean!r}")
    tokens = re.findall(
        r"""
        \d+(?:\.\d+)?(?:천만|천만원|천원|천)?(?:억|억원)?(?:만|만원)?(?:원)?
        |
        \d+(?:\.\d+)?(?:개월|년|세|%|퍼센트|포인트)?
        |
        [가-힣A-Za-z]+
        """,
        clean,
        re.VERBOSE,
    )
    return [{"text": _first_word(t), "type": "gloss"} for t in tokens if _first_word(t)]


def extract_glosses(text: str, model=None) -> list[str]:
    # 1) 토큰 뽑기
    tokens = extract_tokens(text, model=model)

    # 2) 사전 인덱스 & 규칙 불러오기
    index = load_gloss_index()   # CSV 사전
    rules = MERGED_RULES

    gloss_words: list[str] = []

    for t in tokens:
        if not isinstance(t, dict):
            continue
        if t.get("type", "gloss") != "gloss":
            continue

        raw = (t.get("text") or "").strip()
        if not raw:
            continue

        # 여기서 resolve_gloss_token 사용
        ids, resolve_logs = resolve_gloss_token(
            token_text=raw,
            original_sentence=text,
            rules=rules,
            db_index=index,
        )

        # id -> 실제 사전 단어로 다시 매핑
        id_to_word = index.get("id_to_word", {})
        for gid in ids:
            w = id_to_word.get(str(gid))
            if w:
                gloss_words.append(w)

    return gloss_words

    """
    service.py 호환용 간단 인터페이스.
    """
    tokens = extract_tokens(text, model=model)
    gloss_list = [
        t["text"]
        for t in tokens
        if isinstance(t, dict) and t.get("type", "gloss") == "gloss" and t.get("text")
    ]
    return gloss_list


# ======================================================================
# Gloss 사전 로드 및 매핑
# ======================================================================
VIDEO_PATH_INDEX = {}


def build_video_index(root_dir: Path):
    """
    하위 폴더 포함 모든 mp4 파일을 검색하여
    { "파일ID": "전체경로" } 형태의 지도를 만듦.
    """
    global VIDEO_PATH_INDEX
    print(f"📂 영상 파일 인덱싱 중... ({root_dir})")

    count = 0
    for path in root_dir.rglob("*.mp4"):
        file_id = path.stem
        VIDEO_PATH_INDEX[file_id] = str(path.resolve())
        count += 1

    print(f"✅ 총 {count}개의 영상 파일을 찾았습니다.")


try:
    if GLOSS_MP4_DIR.exists():
        build_video_index(GLOSS_MP4_DIR)
    else:
        print(f"⚠️ GLOSS_MP4_DIR가 존재하지 않습니다: {GLOSS_MP4_DIR}")
except Exception as e:
    print(f"⚠️ build_video_index 실행 중 오류: {e}")


def load_gloss_index(csv_path: Path | str | None = None) -> dict:
    """
    글로스 사전을 로드해 검색용 인덱스를 만든다.
    """
    if csv_path is None:
        csv_path = GLOSS_DICT_PATH

    csv_path = Path(csv_path)

    rows, exact = [], {}
    id_to_word = {}

    with open(csv_path, "r", encoding="utf-8-sig") as f:
        rdr = csv.DictReader(f)
        headers = [h.strip().lower() for h in (rdr.fieldnames or [])]

        def pick(*cands):
            for c in cands:
                if c in headers:
                    return c
            return None

        h_id = pick("gloss_id", "id", "gid")
        h_ko = pick(
            "korean_meanings",
            "korean",
            "ko",
            "meaning_ko",
            "ko_meanings",
            "korean_meaning",
        )
        h_cat1 = pick("cat_1", "category_1", "category")

        if not h_id or not h_ko:
            raise RuntimeError(f"[Gloss] 헤더 감지 실패: {headers}")

        for row in rdr:
            gid = (row.get(h_id) or "").strip()
            cell = (row.get(h_ko) or "").strip()
            cat1 = (row.get(h_cat1) or "").strip() if h_cat1 else ""

            if not gid or not cell:
                continue

            try:
                obj = ast.literal_eval(cell)
                if isinstance(obj, (list, tuple)):
                    terms = [str(x) for x in obj]
                else:
                    terms = [str(obj)]
            except Exception:
                terms = [cell]

            if terms:
                id_to_word[gid] = terms[0]

            for term in terms:
                term = _norm(term)
                if not term:
                    continue
                term_ns = _nospace(term)
                token_cnt = len(term.split())
                char_len = len(term_ns)
                rows.append(
                    {
                        "gid": gid,
                        "term": term,
                        "term_ns": term_ns,
                        "token_cnt": token_cnt,
                        "char_len": char_len,
                        "cat_1": cat1,
                    }
                )
                exact.setdefault(term_ns, gid)

    if not rows:
        raise RuntimeError("[Gloss] 사전에 유효한 항목이 없습니다.")

    rows.sort(key=lambda x: 0 if "전문용어" in (x.get("cat_1") or "") else 1)

    print(f"[Gloss] indexed rows={len(rows)}, exact_keys={len(exact)}")
    return {"rows": rows, "exact": exact, "id_to_word": id_to_word}


def map_one_word_to_id(word: str, index: dict, blacklist: list | None = None) -> str | None:
    if not word or not index:
        return None
    if blacklist is None:
        blacklist = []

    rows, exact = index["rows"], index["exact"]
    w = _first_word(word)
    wns = _nospace(w)
    if not wns:
        return None

    gid = exact.get(wns)
    if gid and int(gid) not in blacklist:
        return gid

    cands = [r for r in rows if wns in r["term_ns"] and int(r["gid"]) not in blacklist]
    if cands:
        cands.sort(key=lambda r: (r["token_cnt"], r["char_len"], r["term"], r["gid"]))
        return cands[0]["gid"]

    best_gid, best_sc = None, 0.0
    for r in rows:
        if int(r["gid"]) in blacklist:
            continue
        sc = difflib.SequenceMatcher(None, wns, r["term_ns"]).ratio()
        if sc > best_sc:
            best_sc, best_gid = sc, r["gid"]

    if ALWAYS_RETURN_ID and best_gid:
        return best_gid
    return None


def to_gloss_ids(gloss_list: list[str], index: dict) -> list[str]:
    """
    gloss_list: ["자동이체", "값", "gloss:자동이체", "image:1년", ...] 등
    """
    out: list[str] = []
    seen: set[str] = set()

    for raw in (gloss_list or []):
        if raw is None:
            continue

        g = str(raw).strip()
        if not g:
            continue

        if g.startswith("image:"):
            print(f"[to_gloss_ids] skip image token: {g!r}")
            continue

        if g.startswith("gloss:"):
            g_clean = g[len("gloss:") :].strip()
        else:
            g_clean = g

        if not g_clean:
            continue

        gid = map_one_word_to_id(g_clean, index)
        if not gid:
            print(f"[to_gloss_ids] no id for gloss='{g_clean}' (from {g!r})")
            continue

        gid_str = str(gid)
        if gid_str not in seen:
            out.append(gid_str)
            seen.add(gid_str)

    return out


def decompose_compound_word(token: str, valid_keys: dict) -> list[str] | None:
    if len(token) < 2:
        return None
    for i in range(1, len(token)):
        part1 = token[:i]
        part2 = token[i:]
        if part1 in valid_keys and part2 in valid_keys:
            return [part1, part2]
    return None


def resolve_gloss_token(token_text, original_sentence, rules, db_index):
    """
    고급 규칙 기반 토큰 -> gloss_id 매핑 함수.
    """
    final_ids = []
    resolved_logs = []

    id_map = db_index.get("id_to_word", {})

    blacklist = rules.get("blacklist", [])
    sub_list = rules.get("word_substitution", {}).get(token_text, [token_text])

    for sub in sub_list:
        target_ids = []
        method = "unknown"

        if sub in rules.get("fixed_mappings", {}):
            target_ids.append(rules["fixed_mappings"][sub])
            method = "fixed_rule"

        elif sub in rules.get("disambiguation_rules", {}):
            rule = rules["disambiguation_rules"][sub]
            found = False
            for case in rule["cases"]:
                for kw in case["keywords"]:
                    if kw in original_sentence:
                        target_ids.append(case["target_id"])
                        found = True
                        method = f"context({kw})"
                        break
                if found:
                    break
            if not found:
                target_ids.append(rule["default_id"])
                method = "context_default"

        else:
            gid = map_one_word_to_id(sub, db_index, blacklist)
            if gid:
                target_ids.append(gid)
                method = "exact/similarity"
            else:
                decomposed = decompose_compound_word(sub, db_index["exact"])
                if decomposed:
                    for part in decomposed:
                        part_id = map_one_word_to_id(part, db_index, blacklist)
                        if part_id:
                            target_ids.append(part_id)
                    method = f"decomposed({decomposed})"

        if target_ids:
            final_ids.extend(target_ids)

            real_words = []
            for tid in target_ids:
                rw = id_map.get(str(tid), "UnknownID")
                real_words.append(rw)

            resolved_logs.append(
                {
                    "token": sub,
                    "resolved_word": real_words,
                    "ids": target_ids,
                    "method": method,
                }
            )

    return final_ids, resolved_logs


def _paths_from_ids(gloss_ids):
    """
    gloss_id 리스트를 받아 미리 만들어둔 지도(VIDEO_PATH_INDEX)에서 경로를 찾음.
    """
    paths, missing = [], []
    for gid in gloss_ids or []:
        gid_str = str(gid).strip()
        if not gid_str:
            continue

        if gid_str.startswith("image:"):
            print(f"[paths_from_ids] skip image token in gloss_ids: {gid_str!r}")
            continue
        if gid_str.startswith("gloss:"):
            print(f"[paths_from_ids] unexpected gloss: prefix in gloss_ids: {gid_str!r}")
            gid_str = gid_str[len("gloss:") :].strip()
            if not gid_str:
                continue

        if gid_str in VIDEO_PATH_INDEX:
            paths.append(VIDEO_PATH_INDEX[gid_str])
        else:
            missing.append(gid_str)

    if missing:
        print(f"⚠️  매핑 누락 (파일 없음) gloss_id: {missing}")
    return paths


# ======================================================================
# 영상 합성/저장 및 텍스트 이미지 영상 (캐시 포함)
# ======================================================================
IMAGE_VIDEO_CACHE: dict[str, str] = {}  # key: "text|duration" -> mp4 경로


def get_korean_font(size=80):
    font_paths = [
        "C:/Windows/Fonts/malgun.ttf",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "AppleGothic.ttf",
    ]
    for path in font_paths:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def generate_image_video(text: str, duration: float = 2.0) -> str:
    """
    실제로 ffmpeg를 돌려 텍스트 이미지 영상을 생성.
    (캐싱 없이 순수 생성만 담당)
    """
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tf:
        img_path = tf.name

    width, height = 1280, 720
    img = Image.new("RGB", (width, height), color="black")
    d = ImageDraw.Draw(img)

    font = get_korean_font(80)

    bbox = d.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    position = ((width - text_w) / 2, (height - text_h) / 2)

    d.text(position, text, font=font, fill="white")
    img.save(img_path)

    out_mp4 = img_path.replace(".png", ".mp4")
    cmd = [
        "ffmpeg",
        "-y",
        "-loop",
        "1",
        "-i",
        img_path,
        "-t",
        str(duration),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-profile:v",
        "high",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-video_track_timescale",
        "90000",
        "-bf",
        "2",
        "-an",
        "-vf",
        "scale=1280:720",
        "-loglevel",
        "error",
        out_mp4,
    ]
    subprocess.run(cmd, check=True)

    try:
        os.remove(img_path)
    except Exception:
        pass

    return out_mp4


def get_image_video_cached(text: str, duration: float = 2.0) -> str:
    """
    같은 text + duration 조합에 대해 한 번만 ffmpeg를 돌리고,
    이후에는 캐시된 mp4 경로를 재사용.
    """
    key = f"{text}|{duration}"
    mp4 = IMAGE_VIDEO_CACHE.get(key)

    # 캐시에 있고 실제 파일도 존재하면 그대로 사용
    if mp4 and os.path.exists(mp4):
        return mp4

    # 없거나 파일이 지워졌으면 새로 생성
    mp4 = generate_image_video(text, duration=duration)
    IMAGE_VIDEO_CACHE[key] = mp4
    return mp4


def generate_blank_video(duration: float = 1.0) -> str:
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tf:
        out_mp4 = tf.name

    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"color=c=black:s=1280x720:d={duration}",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-profile:v",
        "high",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-video_track_timescale",
        "90000",
        "-bf",
        "2",
        "-an",
        "-loglevel",
        "error",
        out_mp4,
    ]
    subprocess.run(cmd, check=True)
    return out_mp4

def build_video_sequence_from_tokens(
    tokens: list[dict],
    db_index: dict,
    original_text: str = "",
    rules: dict | None = None,
    include_pause: bool = False,
    pause_duration: float = 0.7,
    debug_log: bool = False,
) -> tuple[list[str], list[dict]]:
    """
    tokens 순서를 그대로 따라가면서
    - gloss  → gloss_id → 수어 mp4 경로
    - image  → 텍스트 이미지 mp4 경로
    - pause  → (옵션) 빈 화면 mp4 경로
    를 이어붙인 video_list를 만든다.

    반환:
      video_paths: 실제 합성에 쓸 mp4 경로 리스트 (순서 보장)
      debug_info : 각 토큰별 매핑 결과(검증용)
    """
    if not tokens:
        return [], []

    if rules is None:
        rules = MERGED_RULES

    video_paths: list[str] = []
    debug_info: list[dict] = []

    step_idx = 0

    for t in tokens:
        if not isinstance(t, dict):
            continue

        raw_text = (t.get("text") or "").strip()
        ttype = (t.get("type") or "gloss").strip().lower()
        if not raw_text:
            continue

        # 1) gloss 토큰: 규칙 + 사전 기반으로 id → mp4 매핑
        if ttype == "gloss":
            ids, resolve_logs = resolve_gloss_token(
                token_text=raw_text,
                original_sentence=original_text,
                rules=rules,
                db_index=db_index,
            )
            paths = _paths_from_ids(ids)

            video_paths.extend(paths)

            debug_entry = {
                "idx": step_idx,
                "token_type": "gloss",
                "token_text": raw_text,
                "ids": ids,
                "paths": paths,
                "resolve_logs": resolve_logs,
            }
            debug_info.append(debug_entry)

            if debug_log:
                print(
                    f"[SEQ][{step_idx:02d}] gloss '{raw_text}' "
                    f"-> ids={ids}, paths={paths}"
                )

            step_idx += 1

        # 2) image 토큰: 텍스트 이미지 영상 생성(또는 캐시 재사용)
        elif ttype == "image":
            img_mp4 = get_image_video_cached(raw_text, duration=2.0)
            video_paths.append(img_mp4)

            debug_entry = {
                "idx": step_idx,
                "token_type": "image",
                "token_text": raw_text,
                "ids": [],
                "paths": [img_mp4],
                "resolve_logs": [],
            }
            debug_info.append(debug_entry)

            if debug_log:
                print(
                    f"[SEQ][{step_idx:02d}] image '{raw_text}' "
                    f"-> path={img_mp4}"
                )

            step_idx += 1

        # 3) pause 토큰: include_pause=True일 때만 빈 영상 끼워넣음
        elif ttype == "pause":
            paths: list[str] = []
            if include_pause:
                blank_mp4 = generate_blank_video(duration=pause_duration)
                paths.append(blank_mp4)
                video_paths.append(blank_mp4)

                if debug_log:
                    print(
                        f"[SEQ][{step_idx:02d}] pause -> blank video "
                        f"duration={pause_duration}s, path={blank_mp4}"
                    )
            else:
                if debug_log:
                    print(
                        f"[SEQ][{step_idx:02d}] pause skipped "
                        f"(include_pause=False)"
                    )

            debug_entry = {
                "idx": step_idx,
                "token_type": "pause",
                "token_text": raw_text,
                "ids": [],
                "paths": paths,
                "resolve_logs": [],
            }
            debug_info.append(debug_entry)
            step_idx += 1

        # 4) 알 수 없는 타입은 그냥 무시
        else:
            if debug_log:
                print(
                    f"[SEQ][{step_idx:02d}] unknown type '{ttype}' "
                    f"for token '{raw_text}' -> skip"
                )
            debug_entry = {
                "idx": step_idx,
                "token_type": ttype,
                "token_text": raw_text,
                "ids": [],
                "paths": [],
                "resolve_logs": [],
            }
            debug_info.append(debug_entry)
            step_idx += 1

    return video_paths, debug_info


def play_sequence(paths):
    if not paths:
        print("⚠️ 재생할 영상이 없습니다.")
        return False

    ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
    ffplay = shutil.which("ffplay")

    if ffplay:
        with tempfile.NamedTemporaryFile(
            "w", suffix=".txt", delete=False, encoding="utf-8"
        ) as f:
            lst_path = f.name
            for p in paths:
                safe_path = str(Path(p).resolve()).replace("\\", "/")
                f.write(f"file '{safe_path}'\n")
        try:
            cmd = [
                ffplay,
                "-autoexit",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                lst_path,
            ]
            subprocess.run(cmd, check=True)
            return True
        finally:
            try:
                os.remove(lst_path)
            except OSError:
                pass

    with tempfile.TemporaryDirectory() as td:
        lst = Path(td) / "list.txt"
        out = Path(td) / f"concat_{now_ts()}.mp4"

        with open(lst, "w", encoding="utf-8") as f:
            for p in paths:
                safe_path = str(Path(p).resolve()).replace("\\", "/")
                f.write(f"file '{safe_path}'\n")

        copy_cmd = [
            ffmpeg,
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(lst),
            "-c",
            "copy",
            str(out),
        ]
        r = subprocess.run(copy_cmd)

        if r.returncode != 0:
            re_cmd = [
                ffmpeg,
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(lst),
                "-vf",
                "format=yuv420p",
                "-c:v",
                "libx264",
                "-crf",
                "20",
                "-preset",
                "veryfast",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                str(out),
            ]
            subprocess.run(re_cmd, check=True)

        if sys.platform == "darwin":
            subprocess.Popen(["open", str(out)])
        elif os.name == "nt":
            os.startfile(str(out))
        else:
            subprocess.Popen(["xdg-open", str(out)])
        return True


def save_sequence(paths, output_path: Path):
    if not paths:
        return

    ffmpeg = shutil.which("ffmpeg") or "ffmpeg"

    with tempfile.NamedTemporaryFile(
        "w", suffix=".txt", delete=False, encoding="utf-8"
    ) as f:
        lst_path = f.name
        for p in paths:
            safe_path = str(Path(p).resolve()).replace("\\", "/")
            f.write(f"file '{safe_path}'\n")

    try:
        cmd = [
            ffmpeg,
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            lst_path,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-loglevel",
            "error",
            str(output_path),
        ]
        subprocess.run(cmd, check=True)
        print(f"💾 영상 저장 완료: {output_path}")
    except Exception as e:
        print(f"❌ 영상 저장 실패: {e}")
    finally:
        try:
            os.remove(lst_path)
        except Exception:
            pass


# 모듈 로드 시 Gemini 모델 한 번만 빌드
if GOOGLE_API_KEY and genai is not None:
    try:
        GEMINI_MODEL = build_gemini()
        print("[Gemini] 모델 초기화 완료")
    except Exception as e:
        GEMINI_MODEL = None
        print(f"[Gemini] 초기화 실패, 로컬 규칙만 사용: {e}")
else:
    GEMINI_MODEL = None
    print("[Gemini] API 키 없음 → 로컬 규칙만 사용")

# 🔹 Whisper 모델도 서버 시작 시 미리 로딩
try:
    _get_whisper_model()
    print("[Whisper] 모델 미리 로딩 완료")
except Exception as e:
    print(f"[Whisper] 모델 미리 로딩 실패: {e}")


# ======================================================================
# 로컬 규칙 기반 gloss 추출 (service.py에서 Gemini 실패 시 사용할 수 있는 최소 버전)
# ======================================================================
def _local_gloss_rules(text: str) -> list[str]:
    """
    Gemini 없이도 사용할 수 있는 초간단 폴백 규칙.
    (extract_tokens의 로컬 폴백과 동일 패턴, 모두 gloss 취급)
    """
    clean = _norm(text)
    tokens = re.findall(
        r"""
        \d+(?:\.\d+)?(?:천만|천만원|천원|천)?(?:억|억원)?(?:만|만원)?(?:원)?
        |
        \d+(?:\.\d+)?(?:개월|년|세|%|퍼센트|포인트)?
        |
        [가-힣A-Za-z]+
        """,
        clean,
        re.VERBOSE,
    )
    return [_first_word(t) for t in tokens if _first_word(t)]

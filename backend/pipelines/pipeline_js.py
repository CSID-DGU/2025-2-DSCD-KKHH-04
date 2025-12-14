# -*- coding: utf-8 -*-

# ==============================================================================
# [SECTION 0] Imports & Configuration
# 라이브러리 임포트, 경로 설정, API 키 로드, 전역 설정
# ==============================================================================
import os
import csv
import re
import json
import ast
import unicodedata
import difflib
import wave
import threading
import time
import sys
from datetime import datetime
from pathlib import Path
import shutil
import subprocess
import tempfile

import sounddevice as sd                # 마이크 입력
import whisper                          # STT
from dotenv import load_dotenv          # 환경변수 로드

# [추가] 이미지 생성을 위한 라이브러리
from PIL import Image, ImageDraw, ImageFont

# Gemini 라이브러리
try:
    import google.generativeai as genai
except Exception:
    genai = None

# 1. .env 파일 로드
if not load_dotenv():
    print("⚠️  .env 파일을 찾을 수 없습니다. 환경변수가 설정되지 않았을 수 있습니다.")

# 2. 환경변수에서 API 키 가져오기
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# 3. 키 확인
if not GOOGLE_API_KEY:
    print("❌  [Error] GOOGLE_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.")
    sys.exit(1)
else:
    print(f"✅  API Key 로드 완료 (Len: {len(GOOGLE_API_KEY)})")

# 4. 경로 설정
try:
    ROOT_DIR = Path(__file__).resolve().parent
except NameError:
    ROOT_DIR = Path(os.getcwd())

DATA_DIR = ROOT_DIR / "data"
OUT_DIR = ROOT_DIR / "snapshots14"
GLOSS_DICT_PATH = DATA_DIR / "gloss_dictionary_MOCK.csv"
RULES_JSON_PATH = DATA_DIR / "rules.json"
GLOSS_MP4_DIR = DATA_DIR / "service"

VIDEO_OUT_DIR = ROOT_DIR / "vd_output"
VIDEO_OUT_DIR.mkdir(exist_ok=True)


# 폴더 자동 생성
OUT_DIR.mkdir(exist_ok=True)

# 5. 모델 및 오디오 설정
GEMINI_MODEL_NAME = "models/gemini-2.5-flash"
WHISPER_MODEL_NAME = "small"
WHISPER_LANG = "ko"

CHUNK = 1024        # 콜백당 프레임 수
DEBOUNCE_SEC = 0.5  # Enter 연타 방지
ALWAYS_RETURN_ID = True    # 매핑 실패 시에도 유사도 기반으로 ID 하나는 선택


# ==============================================================================
# [SECTION 1] Common Utilities
# 텍스트 정규화, 타임스탬프 등 공통 헬퍼 함수
# ==============================================================================
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


# ==============================================================================
# [SECTION 2] Input (Audio Capture)
# 마이크 장치 설정, 스트림 콜백, 오디오 데이터 수집
# ==============================================================================
frames = []                       # 오디오 조각(바이트) 누적
frames_lock = threading.Lock()
_last_frame_idx = 0
ACTUAL_RATE = None               # 실제 장치 샘플레이트
sd_stream = None

def list_devices():
    """현재 사용 가능한 오디오 디바이스 목록 출력(디버깅용)."""
    print("[Audio] Listing devices …")
    for i, dev in enumerate(sd.query_devices()):
        print(
            f"  #{i}: {dev['name']} | inputs={dev['max_input_channels']} | "
            f"defaultSR={int(dev['default_samplerate'])}"
        )

def _audio_cb(indata, frames_cnt, time_info, status):
    """sounddevice RawInputStream 콜백: 들어온 바이트를 frames 리스트에 그대로 누적."""
    if status:
        print(f"[Audio] status: {status}")
    with frames_lock:
        frames.append(bytes(indata))

def open_input_stream():
    """기본 입력 장치로 RawInputStream 열기."""
    global ACTUAL_RATE
    info = sd.query_devices(kind="input")
    sr = int(info["default_samplerate"]) if info and info["default_samplerate"] else 16000
    ACTUAL_RATE = sr
    print(f"[Audio] Using device='{info['name']}' @ {sr} Hz")
    return sd.RawInputStream(
        samplerate=sr,
        channels=1,
        dtype="int16",
        blocksize=CHUNK,
        callback=_audio_cb,
    )

def cut_delta_blob() -> bytes:
    """
    frames 리스트에서 '직전 스냅샷 이후 ~ 현재까지' 구간만 잘라서 반환.
    (delta 모드)
    """
    global _last_frame_idx
    with frames_lock:
        cur = len(frames)
        if cur <= _last_frame_idx:
            return b""
        blob = b"".join(frames[_last_frame_idx:cur])
        _last_frame_idx = cur
        return blob


# ==============================================================================
# [SECTION 3] NLP (Natural Language Processing)
# Gemini 모델 설정, 텍스트 분석 및 토큰 추출
# ==============================================================================
def build_gemini():
    """환경변수와 라이브러리가 준비되면 Gemini 모델을 생성, 아니면 None."""
    if not GOOGLE_API_KEY or genai is None:
        return None

    genai.configure(api_key=GOOGLE_API_KEY)
    
    sys_prompt = f"""
    당신은 '청각장애인을 위한 전문 수어(KSL) 통역사'입니다.
    입력된 문장을 단순 번역하지 말고, '농문화(Deaf Culture)'와 '한국수어 문법'에 맞춰 의미를 재구성(Paraphrasing)하십시오.

    [핵심 작업 원칙]
    0. 발음오류가 발생한 단어는 문맥을 고려해 올바른 단어로 교정하십시오. 교정 결과는 출력 JSON의 'cleaned' 필드에 반영돼야 합니다.
       - 예: '전기예금' -> '정기예금'
    1. 수지한국어(SK) 금지: 한국어의 어순이나 문법 요소(조사, 어미)를 그대로 따라가지 마십시오.
    2. 의미 중심 번역: 문장의 '핵심 의도'를 파악하여 가장 직관적인 단어들의 나열로 바꾸십시오.
    3. 메타 발화 삭제: "안내해 드리겠습니다", "말씀드리자면" 등 정보가가 없는 멘트는 과감히 삭제하십시오.
       - 단, '안녕하세요', '반갑습니다', '고맙습니다(감사합니다)', '수고하셨습니다' 등 사회적 관계를 맺는 인사말은 삭제하지 말고 반드시 수어 단어로 변환하십시오.

    4. 한국어 전용 출력 (Korean Only):
       - 결과 JSON의 'text' 필드 값에는 '반드시 한국어 또는 숫자'만 들어가야 합니다.
       - 영어 단어(예: 'Limit', 'Bank')가 포함되면 무조건 한국어 뜻으로 번역하여 출력하십시오.

    5. 고유명사 및 상품명 처리 (Image Mapping):
       - 사람의 이름(성명), 낯선 지명, 브랜드명, 그리고 '구체적인 금융 상품명'은 수어로 억지로 번역하거나 쪼개지 말고 반드시 전체를 하나의 텍스트 이미지로 변환하십시오.
       - 영어와 한글이 섞여 있어도 합쳐서 하나의 이미지로 만드십시오.
       - '정기예금', '보통예금' 등과 같이 일반적인 상품 유형의 경우에는 gloss로 반환합니다.
       - 예: "저는 김동호입니다." -> '[저], [PAUSE], [김동호(image)]'
       - 예: "이 적금은 KB나라사랑적금입니다." -> '[적금] [이것] [KB나라사랑적금(image)]'

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
    입력: "이 상품은 한 사람당 하나의 개좌만 개설 가능함니다."
    출력:
    {{
        "cleaned": "이 상품은 한 사람당 하나의 계좌만 개설 가능합니다.",
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

    입력: "금니는 연 3.5%포인트 무대 적용됩니다."
    출력:
    {{
        "cleaned": "금리는 연 3.5%포인트 우대 적용됩니다.",
        "tokens": [
            {{ "text": "금리", "type": "gloss" }},
            {{ "text": "PAUSE", "type": "pause" }},
            {{ "text": "1년", "type": "gloss" }},
            {{ "text": "3.5", "type": "image" }},
            {{ "text": "퍼센트", "type": "gloss" }},
            {{ "text": "점수", "type": "gloss" }},
            {{ "text": "특별", "type": "gloss" }},
            {{ "text": "적용", "type": "gloss" }}
        ]
    }}
    5. 범위 표현 (Range):
       - '이상/이하/초과/미만'은 오역 방지를 위해 반드시 '부터(~부터)'와 '까지(~까지)'로 변환하십시오.
       - 입력: "2.5% 이상" -> '[{{ "text": "2.5", "type": "image" }}, {{ "text": "퍼센트", "type": "gloss" }}, {{ "text": "부터", "type": "gloss" }}]'
       - 입력: "3.5% 이하" -> '[{{ "text": "3.5", "type": "image" }}, {{ "text": "퍼센트", "type": "gloss" }}, {{ "text": "까지", "type": "gloss" }}]'
       - 입력: "18세~30세" -> '[{{ "text": "18세", "type": "image" }}, {{ "text": "부터", "type": "gloss" }}, {{ "text": "30세", "type": "image" }}, {{ "text": "까지", "type": "gloss" }}]'
       

    [출력 포맷 (JSON Only)]
    반드시 JSON 형식만 출력하세요.

    """

    return genai.GenerativeModel(
        GEMINI_MODEL_NAME,
        system_instruction=sys_prompt,
        generation_config={
            "response_mime_type": "application/json",
            "temperature": 0.2,
        },
    )

def extract_glosses(text: str, model) -> list[dict]:
    """
    문장을 분석하여 토큰 리스트(dict) 반환.
    반환 예시: [{'text': '나이', 'type': 'gloss'}, {'text': '18세', 'type': 'image'}]
    """
    clean = _norm(text)
    if not clean:
        return []

    # 1) Gemini 사용
    if model:
        try:
            parts = [{"role": "user", "parts": [clean]}]
            resp = model.generate_content(parts)
            # 응답 텍스트에서 JSON 부분만 파싱 시도
            try:
                obj = json.loads(resp.text)
            except:
                # 가끔 마크다운 ```json ... ``` 으로 감싸서 줄 때 처리
                json_str = re.search(r"\{.*\}", resp.text, re.DOTALL)
                if json_str:
                    obj = json.loads(json_str.group())
                else:
                    obj = {}
            
            cleaned = obj.get("cleaned", clean)
            tokens = obj.get("tokens", [])
            
            return cleaned, tokens
            
        except Exception as e:
            print(f"[Gemini Error] {e}")
            pass

    # 2) 로컬 폴백 (Gemini 실패 시 단순 텍스트 글로스로 처리)
    # 기존 로직을 유지하되 포맷만 맞춤
    tokens = re.findall(r"\d+(?:억원|억\s*원|개월|년)|[가-힣A-Za-z]+", clean)
    gloss_list = [{"text": _first_word(t), "type": "gloss"} for t in tokens if _first_word(t)]
    
    # [수정 핵심] 로컬 처리 시에는 원본 텍스트를 cleaned로 간주하여 반환
    return clean, gloss_list


# ==============================================================================
# [SECTION 4] Query & Resolution (Search Engine)
# CSV 사전 로드, 룰 기반 ID 매핑, 파일 경로 변환
# ==============================================================================
# [추가] 전역 변수로 영상 위치 지도를 저장할 딕셔너리 선언
VIDEO_PATH_INDEX = {} 

def build_video_index(root_dir: Path):
    """
    [중요] 하위 폴더(fi, li 등)를 포함한 모든 mp4 파일을 검색하여
    { "파일ID": "전체경로" } 형태의 지도를 만듭니다.
    """
    global VIDEO_PATH_INDEX
    print(f"📂 영상 파일 인덱싱 중... ({root_dir})")
    
    count = 0
    # rglob('*')은 하위 폴더까지 전부 뒤집니다.
    for path in root_dir.rglob("*.mp4"):
        # 파일명(확장자 제외)을 ID로 사용 (예: "101650")
        file_id = path.stem 
        VIDEO_PATH_INDEX[file_id] = str(path.resolve())
        count += 1
        
    print(f"✅ 총 {count}개의 영상 파일을 찾았습니다.")

def load_gloss_index(csv_path: Path) -> dict:
    """
    글로스 사전을 로드해 검색용 인덱스를 만든다.
    """
    rows, exact = [], {}
    id_to_word = {}

    # utf-8-sig: BOM이 있어도 안전하게 처리
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
            "korean_meanings", "korean", "ko",
            "meaning_ko", "ko_meanings", "korean_meaning",
        )
        if not h_id or not h_ko:
            raise RuntimeError(f"[Gloss] 헤더 감지 실패: {headers}")

        for row in rdr:
            gid = (row.get(h_id) or "").strip()
            cell = (row.get(h_ko) or "").strip()
            if not gid or not cell:
                continue

            # '["거치","거치식"]' 같은 리스트 문자열 안전 파싱
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
                term_ns   = _nospace(term)
                token_cnt = len(term.split())
                char_len  = len(term_ns)
                rows.append({
                    "gid": gid,
                    "term": term,
                    "term_ns": term_ns,
                    "token_cnt": token_cnt,
                    "char_len": char_len,
                })
                # 동일 term_ns가 여러 gid를 가리키더라도 최초 등장 우선
                exact.setdefault(term_ns, gid)

    if not rows:
        raise RuntimeError("[Gloss] 사전에 유효한 항목이 없습니다.")
    
    # 전문용어 우선순위 정렬 (cat_1 기준)
    rows.sort(key=lambda x: 0 if "전문용어" in x.get("cat_1", "") else 1)

    print(f"[Gloss] indexed rows={len(rows)}, exact_keys={len(exact)}")
    return {"rows": rows, "exact": exact, "id_to_word": id_to_word}


def map_one_word_to_id(word: str, index: dict, blacklist: list = None, threshold: float = 0.5) -> str | None:
    if not word or not index: return None
    if blacklist is None: blacklist = []

    rows, exact = index["rows"], index["exact"]
    w = _first_word(word)
    wns = _nospace(w)
    if not wns: return None

    # 1) 완전 일치 (통과)
    gid = exact.get(wns)
    if gid and int(gid) not in blacklist:
        return gid

    # 2) 포함 후보 (글자 수 차이가 너무 크면 제외하는 로직 추가)
    # 예: "김동호"(3글자)인데 "동"(1글자)이 매칭되는 것 방지
    # 포함된 단어 길이가 원본의 50% 이상일 때만 인정
    cands = []
    for r in rows:
        if int(r["gid"]) in blacklist: continue
        if wns in r["term_ns"] or r["term_ns"] in wns:
             # [NEW] 길이 비율 체크
             len_ratio = len(r["term_ns"]) / len(wns) if len(wns) > 0 else 0
             if 0.5 <= len_ratio <= 1.5: 
                 cands.append(r)

    if cands:
        cands.sort(key=lambda r: (r["token_cnt"], r["char_len"], r["term"], r["gid"]))
        return cands[0]["gid"]

    # 3) 유사도 검색 (점수 미달 시 과감히 버림 -> 이미지로 감)
    best_gid, best_sc = None, 0.0
    for r in rows:
        if int(r["gid"]) in blacklist: continue
        sc = difflib.SequenceMatcher(None, wns, r["term_ns"]).ratio()
        if sc > best_sc:
            best_sc, best_gid = sc, r["gid"]

    # [NEW] 점수가 커트라인(0.5) 이상일 때만 반환, 아니면 None (-> Fallback 이미지)
    if ALWAYS_RETURN_ID and best_gid and best_sc >= threshold:
        return best_gid
        
    return None

def to_gloss_ids(gloss_list: list[str], index: dict) -> list[str]:
    """글로스 리스트 → 중복 제거된 gloss_id 리스트(입력 순서 보존)."""
    out, seen = [], set()
    for g in gloss_list or []:
        gid = map_one_word_to_id(g, index)
        if gid and gid not in seen:
            out.append(gid)
            seen.add(gid)
    return out

# [수정] 상세 로그(logs)를 함께 반환하도록 변경
def resolve_gloss_token(token_text, original_sentence, rules, db_index):
    final_ids = []
    resolved_logs = []
    
    # ID -> 단어 사전 가져오기
    id_map = db_index.get("id_to_word", {})

    blacklist = rules.get("blacklist", [])
    sub_list = rules.get("word_substitution", {}).get(token_text, [token_text])
    
    for sub in sub_list:
        target_ids = []
        method = "unknown"

        # 1. Fixed Mappings
        if sub in rules.get("fixed_mappings", {}):
            target_ids.append(rules["fixed_mappings"][sub])
            method = "fixed_rule"
            
        # 2. Disambiguation
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
                if found: break
            if not found:
                target_ids.append(rule["default_id"])
                method = "context_default"

        # 3. DB Search & Decomposition
        else:
            # (A) 일반 검색
            gid = map_one_word_to_id(sub, db_index, blacklist)
            if gid:
                target_ids.append(gid)
                method = "exact/similarity"
            else:
                # (B) 복합어 분해 시도
                decomposed = decompose_compound_word(sub, db_index["exact"])
                if decomposed:
                    for part in decomposed:
                        part_id = map_one_word_to_id(part, db_index, blacklist)
                        if part_id: target_ids.append(part_id)
                    method = f"decomposed({decomposed})"
                else:
                    # (C) 그래도 없으면 유사도 강제 검색 (이미 map_one_word_to_id에서 수행됨)
                    pass 

        if target_ids:
            final_ids.extend(target_ids)
            
            # [FIX] ID를 이용해 실제 사전에 있는 단어(Representative Word)를 찾음
            real_words = []
            for tid in target_ids:
                # ID가 숫자형일 수 있으니 문자열로 변환하여 조회
                rw = id_map.get(str(tid), "UnknownID") 
                real_words.append(rw)
            
            resolved_logs.append({
                "token": sub,            # 입력 토큰
                "resolved_word": real_words, # [NEW] 실제 매핑된 단어 리스트
                "ids": target_ids,
                "method": method
            })
            
    return final_ids, resolved_logs

def _paths_from_ids(gloss_ids):
    """
    gloss_id 리스트를 받아 미리 만들어둔 지도(VIDEO_PATH_INDEX)에서 경로를 찾습니다.
    """
    paths, missing = [], []
    for gid in gloss_ids or []:
        gid_str = str(gid) # ID가 숫자일 수 있으므로 문자로 변환
        
        if gid_str in VIDEO_PATH_INDEX:
            paths.append(VIDEO_PATH_INDEX[gid_str])
        else:
            missing.append(gid)
            
    if missing:
        print(f"⚠️  매핑 누락 (파일 없음) gloss_id: {missing}")
    return paths

# [수정] 복합어 분해 함수 추가
def decompose_compound_word(token, valid_keys):
    if len(token) < 2: return None
    for i in range(1, len(token)):
        part1 = token[:i]
        part2 = token[i:]
        if part1 in valid_keys and part2 in valid_keys:
            return [part1, part2]
    return None


# ==============================================================================
# [SECTION 5] Synthesis (Video Generation)
# 텍스트 -> 이미지 영상 변환, 공백 영상 생성
# ==============================================================================
def get_korean_font(size=80):
    """OS에 맞는 한국어 폰트 로드 시도"""
    font_paths = [
        "C:/Windows/Fonts/malgun.ttf",       # Windows
        "/System/Library/Fonts/AppleSDGothicNeo.ttc", # Mac
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf", # Linux
        "AppleGothic.ttf"
    ]
    for path in font_paths:
        try:
            return ImageFont.truetype(path, size)
        except:
            continue
    return ImageFont.load_default()

def generate_image_video(text: str, duration: float = 2.0) -> str:
    """텍스트 이미지를 영상으로 변환 (전처리된 영상 스펙과 100% 일치시킴)"""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tf:
        img_path = tf.name

    # 1. 검은 배경에 흰 글씨 이미지 생성
    width, height = 1280, 720
    img = Image.new('RGB', (width, height), color='black')
    d = ImageDraw.Draw(img)
    
    font = get_korean_font(80)
    
    # 텍스트 중앙 정렬
    bbox = d.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    position = ((width - text_w) / 2, (height - text_h) / 2)
    
    d.text(position, text, font=font, fill="white")
    img.save(img_path)

    # 2. FFmpeg 변환 (Code 2의 스펙을 그대로 적용)
    out_mp4 = img_path.replace(".png", ".mp4")
    
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", img_path,    # 이미지 루프 입력
        "-t", str(duration),             # 길이 설정
        
        # [핵심] 코덱 및 포맷 설정
        "-c:v", "libx264",               # 이미지 변환은 CPU(libx264)가 더 안정적/빠를 수 있음
        "-preset", "veryfast",           # 생성 속도 최적화
        "-profile:v", "high",            # 프로파일: High
        "-pix_fmt", "yuv420p",           # 픽셀 포맷
        
        # [핵심] 병합을 위한 물리적 스펙 통일
        "-r", "30",                      # FPS 강제: 30
        "-video_track_timescale", "90000", # 타임베이스: 90000
        "-bf", "2",                      # B-frame: 2
        
        # [핵심] 오디오 제거 (기존 영상에 오디오가 없으므로)
        "-an",
        
        # 리사이징 (혹시 모를 크기 오류 방지)
        "-vf", "scale=1280:720",
        
        "-loglevel", "error",
        out_mp4
    ]
    subprocess.run(cmd, check=True)
    
    try: os.remove(img_path)
    except: pass
    
    return out_mp4

def generate_blank_video(duration: float = 1.0) -> str:
    """검은 화면(Pause) 영상 생성 (스펙 통일)"""
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tf:
        out_mp4 = tf.name
        
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"color=c=black:s=1280x720:d={duration}",
        
        # [핵심] 코덱 및 포맷 통일
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        
        # [핵심] FPS 및 타임베이스 통일
        "-r", "30",
        "-video_track_timescale", "90000",
        "-bf", "2",
        
        # 오디오 제거
        "-an",
        
        "-loglevel", "error",
        out_mp4
    ]
    subprocess.run(cmd, check=True)
    return out_mp4


# ==============================================================================
# [SECTION 6] Output (Playback)
# FFmpeg/FFplay를 이용한 영상 시퀀스 재생
# ==============================================================================
def play_sequence(paths):
    """
    FFmpeg/ffplay를 사용하여 영상들을 순서대로 재생.
    """
    if not paths:
        print("⚠️ 재생할 영상이 없습니다.")
        return False

    ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
    ffplay = shutil.which("ffplay")  # 있으면 1번 경로 사용

    # 1) ffplay: concat 리스트로 바로 재생
    if ffplay:
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
            lst_path = f.name
            for p in paths:
                f.write(f"file '{p}'\n")
        try:
            cmd = [
                ffplay,
                "-autoexit",
                "-hide_banner",
                "-loglevel", "error",
                "-f", "concat",
                "-safe", "0",
                "-i", lst_path,
            ]
            subprocess.run(cmd, check=True)
            return True
        finally:
            try:
                os.remove(lst_path)
            except OSError:
                pass

    # 2) ffmpeg: 임시 mp4 생성 후 OS 기본 플레이어로 재생
    with tempfile.TemporaryDirectory() as td:
        lst = Path(td) / "list.txt"
        out = Path(td) / f"concat_{now_ts()}.mp4"

        # concat 리스트 파일 작성
        with open(lst, "w", encoding="utf-8") as f:
            for p in paths:
                f.write(f"file '{p}'\n")

        # (A) 코덱 동일 시 초고속 copy 시도
        copy_cmd = [
            ffmpeg, "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(lst),
            "-c", "copy",
            str(out),
        ]
        r = subprocess.run(copy_cmd)

        # (B) 실패하면 재인코딩으로 안전하게 합성
        if r.returncode != 0:
            re_cmd = [
                ffmpeg, "-y",
                "-f", "concat", "-safe", "0",
                "-i", str(lst),
                "-vf", "format=yuv420p",
                "-c:v", "libx264", "-crf", "20", "-preset", "veryfast",
                "-c:a", "aac", "-b:a", "128k",
                str(out),
            ]
            subprocess.run(re_cmd, check=True)

        # OS 별 기본 플레이어로 열기
        if sys.platform == "darwin":          # macOS
            subprocess.Popen(["open", str(out)])
        elif os.name == "nt":                 # Windows
            os.startfile(str(out))
        else:                                 # Linux 등
            subprocess.Popen(["xdg-open", str(out)])
        return True

# ... (기존 play_sequence 함수 끝난 뒤 아래에 추가) ...

def save_sequence(paths, output_path):
    """
    영상 경로 리스트(paths)를 받아 하나로 병합하여 output_path에 저장합니다.
    """
    if not paths: return

    ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
    
    # 1. 병합할 파일 리스트 생성 (temp file)
    # Windows 경로 호환을 위해 백슬래시(\)를 슬래시(/)로 변경
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
        lst_path = f.name
        for p in paths:
            safe_path = str(Path(p).resolve()).replace('\\', '/')
            f.write(f"file '{safe_path}'\n")

    # 2. FFmpeg 병합 명령 (재인코딩 방식: 해상도/코덱 통일성을 위해 안전함)
    try:
        cmd = [
            ffmpeg, "-y",
            "-f", "concat", "-safe", "0",
            "-i", lst_path,
            "-c:v", "libx264", "-pix_fmt", "yuv420p",  # 호환성 높은 포맷
            "-c:a", "aac",
            "-loglevel", "error",
            str(output_path)
        ]
        subprocess.run(cmd, check=True)
        print(f"💾 영상 저장 완료: {output_path}")

    except Exception as e:
        print(f"❌ 영상 저장 실패: {e}")

    finally:
        # 임시 리스트 파일 삭제
        try: os.remove(lst_path)
        except: pass


# ==============================================================================
# [SECTION 7] Main Execution
# 파이프라인 조립 및 실행 루프
# ==============================================================================
def main():
    # 0) rules.json 로드 (룰 엔진용)
    rules_json = {}
    if RULES_JSON_PATH.exists():
        with open(RULES_JSON_PATH, 'r', encoding='utf-8') as f:
            rules_json = json.load(f)
        print(f"[Rules] Loaded rules.json from {RULES_JSON_PATH}")
    else:
        print(f"⚠️ [Warning] rules.json not found at {RULES_JSON_PATH}. Rule engine disabled.")
    # [FIX] 영상 파일 인덱스 생성 함수 호출 추가
    # 이 함수가 실행되어야 하위 폴더(fi, li)의 모든 mp4 위치를 파악합니다.
    build_video_index(GLOSS_MP4_DIR)

    # 1) 글로스 사전 로드
    index = load_gloss_index(GLOSS_DICT_PATH)

    # 2) Gemini 모델 초기화
    model = build_gemini()

    # 3) Whisper 모델 로드
    print("[Whisper] loading:", WHISPER_MODEL_NAME)
    wmodel = whisper.load_model(WHISPER_MODEL_NAME)

    # 4) 오디오 장치 확인
    global sd_stream
    list_devices()
    
    print("\n" + "="*60)
    print("🎙️  [Push-to-Talk 모드] Enter를 눌러 녹음을 시작/종료합니다.")
    print("="*60)

    snap_idx = 0

    while True:
        # --- [오디오 제어: Push-to-Talk] ---
        try:
            # 1. 대기 (녹음 시작 트리거)
            input("\n[Ready] Enter를 누르면 녹음을 시작합니다 >>> ")
            
            # 2. 스트림 열기 및 녹음 시작
            if sd_stream: 
                sd_stream.stop(); sd_stream.close()
            
            sd_stream = open_input_stream()
            sd_stream.start()
            
            # 버퍼 초기화 (이전 잔여 데이터 삭제)
            with frames_lock:
                frames.clear()
                
            print("   🔴 녹음 중... (말씀하신 뒤 Enter를 누르세요)")
            
            # 3. 녹음 중 (종료 트리거 대기)
            input() 
            
            # 4. 녹음 중단 및 데이터 확보
            sd_stream.stop()
            with frames_lock:
                blob = b"".join(frames)
            sd_stream.close()
            
            if not blob:
                print("[Info] 녹음된 소리가 없습니다.")
                continue

            # --- [처리 파이프라인 시작] ---
            ts = now_ts()
            base = OUT_DIR / f"snapshot_{ts}_{snap_idx + 1:02d}"

            # 5-1) WAV 저장
            wav_path = str(base) + ".wav"
            with wave.open(wav_path, "wb") as wf:
                wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(ACTUAL_RATE)
                wf.writeframes(blob)
            
            # 5-2) Whisper STT
            print("⏳ 전사 및 분석 중...")
            res = wmodel.transcribe(wav_path, language=WHISPER_LANG)
            stt_text = _norm(res.get("text") or "")

            cleaned, tokens = extract_glosses(stt_text, model)

            print(f"[STT] \"{stt_text}\"")
            print(f"cleaned: \"{cleaned}\"")
            # 5-3) Gemini -> 토큰(JSON) 추출
            # tokens 예: [{"text":"만 18세", "type":"image"}, {"text":"가입", "type":"gloss"}]
            print(f"[Tokens] {tokens}")

            # 5-4) [멀티모달 합성] 및 [상세 비교 로깅]
            play_queue = []
            debug_logs = []
            
            print("\n" + "="*30 + " [토큰 매핑 상세 분석] " + "="*30)
            print("-" * 110)
            # 헤더 출력 (가독성 확보)
            print(f"{'NLP Token':<15} | {'Resolved Tokens':<20} | {'Method':<18} | {'Video IDs':<15} | {'Note'}")
            print("-" * 110)

            for token in tokens:
                dtype = token.get("type", "gloss")
                text = token.get("text", "")
                
                if not text and dtype != "pause": continue

                token_log = {
                    "nlp_token": text,
                    "type": dtype,
                    "final_mapping": {}
                }

                # [Case 1] 수어(Gloss) 처리
                if dtype == "gloss":
                    # ids: 최종 매핑된 영상 ID 리스트
                    # logs: 알고리즘 거친 세부 내역 [{'token': '우대', 'method': '...'}, {'token': '금리' ...}]
                    ids, logs = resolve_gloss_token(text, stt_text, rules_json, index)
                    
                    if ids:
                        # (A) 매칭 성공
                        paths = _paths_from_ids(ids)
                        play_queue.extend(paths)
                        
                        # 비교 출력을 위한 데이터 가공
                                   
                        ids_str = ", ".join(map(str, ids))          # "10123, 10456"
                        resolved_words_flat = []
                        for l in logs:
                            resolved_words_flat.extend(l.get('resolved_word', []))
                        
                        resolved_str = ", ".join(resolved_words_flat) # "둘, 미안하다" 처럼 출력됨
                        
                        # 방식은 첫 번째 것 혹은 복합적이면 'mixed'
                        method_str = logs[0]['method'] if len(logs) == 1 else "compound/mixed"
                        if "decomposed" in str(logs): method_str = "decomposed"

                        # 파일명 추출 (확인용)
                        file_names = [Path(p).name for p in paths]
                        
                        # [핵심] 한 줄에 비교 출력
                        print(f"{text:<15} | {resolved_str:<20} | {method_str:<18} | {ids_str:<15} | {len(ids)} clips")
                        
                        # JSON 로그 저장 구조
                        token_log["final_mapping"] = {
                            "status": "success",
                            "resolved_tokens": resolved_words_flat,
                            "video_ids": ids,
                            "method": method_str,
                            "files": file_names
                        }

                    else:
                        # (B) 매칭 실패 -> 텍스트 이미지(Fallback)
                        print(f"{text:<15} | {'(IMAGE TEXT)':<20} | {'FALLBACK':<18} | {'-':<15} | Gen Image")
                        
                        calc_duration = max(1.5, len(text) * 0.5)
                        p = generate_image_video(text, duration=calc_duration)
                        play_queue.append(p)
                        
                        token_log["final_mapping"] = {
                            "status": "fallback",
                            "resolved_tokens": [text],
                            "method": "text_image_generation"
                        }

                # [Case 2] 숫자/이미지 처리
                elif dtype == "image":
                    print(f"{text:<15} | {'(IMAGE)':<20} | {'LLM_DIRECT':<18} | {'-':<15} | Gen Image")
                    p = generate_image_video(text, duration=2.0)
                    play_queue.append(p)
                    token_log["final_mapping"] = {"status": "image", "method": "llm_directive"}

                # [Case 3] 휴지(Pause) 처리
                elif dtype == "pause":
                    print(f"{'PAUSE':<15} | {'(BLANK)':<20} | {'LLM_DIRECT':<18} | {'-':<15} | 1.0 sec")
                    p = generate_blank_video(duration=1.0)
                    play_queue.append(p)
                    token_log["final_mapping"] = {"status": "pause", "duration": 1.0}
                
                debug_logs.append(token_log)

            print("-" * 110 + "\n")

            # [통합] 로그 데이터 구성 (아직 저장 안 함)
            log_data = {
                "timestamp": ts,
                "stt_raw": stt_text,
                "nlp_tokens": tokens,
                "processing_detail": debug_logs, # 상세 로그
                "play_queue": play_queue         # 재생 목록
            }

            # 5-5) 최종 재생 및 영상 파일 저장
            if play_queue:
                print(f"▶️  총 {len(play_queue)}개 클립 재생 시작")
                
                # (1) 재생
                play_sequence(play_queue)

                # (2) 영상 파일 저장
                save_filename = VIDEO_OUT_DIR / f"{ts}.mp4" 
                print(f"💾 영상을 저장합니다... -> {save_filename}")
                save_sequence(play_queue, save_filename)
                
                # 영상 저장 경로도 로그에 추가
                log_data["saved_video_path"] = str(save_filename)

            else:
                print("⚠️ 재생할 콘텐츠가 없습니다.")
                log_data["saved_video_path"] = None

            # 5-6) 로그 파일 저장 (JSON) - [여기서 딱 한 번만 저장]
            json_path = str(base) + ".json"
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(log_data, f, ensure_ascii=False, indent=2)
            print(f"[Log Saved] {json_path}")
            
            snap_idx += 1

        except KeyboardInterrupt:
            print("\n[종료] 프로그램을 종료합니다.")
            break
        except Exception as e:
            print(f"\n[Error] 처리 중 오류 발생: {e}")
            continue

    # 종료 정리
    if sd_stream:
        try: sd_stream.stop(); sd_stream.close()
        except: pass


if __name__ == "__main__":
    main()
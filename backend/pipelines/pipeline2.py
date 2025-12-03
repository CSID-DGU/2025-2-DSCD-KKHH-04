# -*- coding: utf-8 -*-
"""
서버용 파이프라인 모듈

기능:
- WAV/WEBM 등 음성 파일 → STT(openai-whisper)
- STT 텍스트 → 글로스 추출(Gemini or 로컬 규칙)
- 글로스 → gloss_id 매핑(CSV 사전)
- gloss_id → 수어 영상(mp4) 경로 리스트

Django에서는:
    from pipelines.pipeline import (
        stt_from_file,
        extract_glosses,
        to_gloss_ids,
        load_gloss_index,
        _paths_from_ids,
        build_gemini,
        MEDIA_ROOT,
        now_ts,
    )

같은 식으로 불러서 사용하면 된다.
"""

import os
import csv
import re
import json
import ast
import unicodedata
import difflib
import time
import sys
from datetime import datetime
from pathlib import Path
import shutil
import subprocess
import wave  # WAV 길이(초) 계산용

import whisper  # openai-whisper

# Gemini – 없으면 로컬 규칙으로만 글로스 추출
try:
    import google.generativeai as genai
except Exception:
    genai = None
    gexc = None

# =========================================================
# 전역 경로/환경 설정
# =========================================================

# pipeline.py 위치:
#   C:\...\backend\pipelines\pipeline.py
PIPELINE_DIR = Path(__file__).resolve().parent       # backend/pipelines
ROOT_DIR = PIPELINE_DIR.parent                       # backend

# Django MEDIA_ROOT와 맞춰두는 용도 (필요하면 settings와 맞추면 됨)
MEDIA_ROOT = ROOT_DIR / "media"

# 데이터/영상 폴더 (네 실제 구조에 맞춤)
DATA_DIR = ROOT_DIR / "data"

# 너가 실제로 가지고 있는 파일 기준
#   C:\...\backend\data\gloss_dictionary_MOCK_1.csv
GLOSS_INDEX_PATH = DATA_DIR / "gloss_dictionary_MOCK_1.csv"

#   C:\...\backend\pipelines\gloss_mp4\100123.mp4 ...
SIGN_VID_DIR = MEDIA_ROOT / "sign_videos"
SIGN_VID_DIR.mkdir(parents=True, exist_ok=True)

# 스냅샷/로그 폴더들
SNAPSHOT_DIR = ROOT_DIR / "snapshots"
SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

OUT_DIR = SNAPSHOT_DIR / "local"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# delta 용 폴더는 현재 사용하지 않음
# OUT_DIR_DELTA = SNAPSHOT_DIR / "delta_backend"
# OUT_DIR_DELTA.mkdir(parents=True, exist_ok=True)

OUT_JSON_DIR = SNAPSHOT_DIR / "json"
OUT_JSON_DIR.mkdir(parents=True, exist_ok=True)

# STT / Gemini 설정
GOOGLE_API_KEY     = os.environ.get("GOOGLE_API_KEY", "")  # 없으면 Gemini 미사용
GEMINI_MODEL_NAME  = "models/gemini-2.5-flash"
WHISPER_MODEL_NAME = "small"
WHISPER_LANG       = "ko"


def now_ts():
    """로그/파일명에 쓰기 좋은 타임스탬프 문자열."""
    return datetime.now().strftime("%Y%m%d_%H%M%S")


# =========================================================
# 정규화 / 유틸
# =========================================================

def _normalize_korean(text: str) -> str:
    """한글 정규화: NFKC, 공백 정리 등."""
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\u3000", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _norm(text: str) -> str:
    if not text:
        return ""
    text = _normalize_korean(text)
    # 불필요한 기호 제거 예시
    text = re.sub(r'[“”\""]', "", text)
    return text.strip()


def safe_json_loads(s, default=None):
    try:
        return json.loads(s)
    except Exception:
        try:
            return ast.literal_eval(s)
        except Exception:
            return default


def get_wav_duration_sec(file_path: str):
    """
    WAV 파일 길이(초)를 대략 계산.
    - whisper에 넣는 입력이 보통 wav라고 가정
    """
    try:
        with wave.open(file_path, "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate() or 16000
            return round(frames / float(rate), 3)
    except Exception as e:
        print(f"[WARN] get_wav_duration_sec 실패: {e}")
        return None


# =========================================================
# Whisper STT 로딩
# =========================================================

print(f"[Whisper] loading model: {WHISPER_MODEL_NAME}")
STT_MODEL = whisper.load_model(WHISPER_MODEL_NAME, device="cpu")



def stt_from_file(file_path: str) -> str:
    """
    주어진 음성 파일 경로 전체에서 STT 실행 후 정규화된 텍스트 반환.
    (앞, 뒤, 중간 포함 전체 전사)
    """
    result = STT_MODEL.transcribe(
        file_path,
        language=WHISPER_LANG,
        fp16=False,          # 🔹 CPU에서는 항상 False
    )
    text = result.get("text") or ""
    return _norm(text)


# =========================================================
# Gemini 빌드
# =========================================================

def build_gemini():
    """환경변수와 라이브러리가 준비되면 Gemini 모델을 생성, 아니면 None."""

    if genai is None:
        print("[Gemini] generativeai 라이브러리 없음 → 로컬 규칙만 사용")
        return None

    if not GOOGLE_API_KEY:
        print("[Gemini] GOOGLE_API_KEY 없음 → 로컬 규칙만 사용")
        return None

    # API 키 설정
    try:
        genai.configure(api_key=GOOGLE_API_KEY)
    except Exception as e:
        print(f"[Gemini] API 키 설정 실패: {e}")
        return None

    sys_prompt = (
        "역할: 한국어 전사 교정 + 수어 글로스 추출기.\n"
        '출력 형식: {"clean":"…","gloss":["…"]} — JSON 한 줄만.\n'
        "규칙:\n"
        "1) clean: 원문의 의미를 보존해 자연스러운 한 문장으로 교정.\n"
        "2) gloss: 반드시 한국어 단어 1개(공백 금지)들로 이루어진 리스트.\n"
        "   - 조사/어미/접사 금지(예: '대상에는' ✗ → '대상' ✓)\n"
        "   - 표제형/명사형으로 적기('보호하다' ✗ → '보호' ✓)\n"
        "   - 숫자·단위는 결합 표기 허용(예: 1억원, 6개월, 5년)\n"
        "   - 의미를 포괄하되 중복 없이 1–10개 범위로 산출.\n"
        "3) 예시:\n"
        '   입력: "가입 대상에는 제한이 없으며 누구나 가입 가능합니다."\n'
        '   gloss: ["가입","대상","제한","가능"]\n'
        '   입력: "이 상품은 예금자보호법에 따라 원금과 이자를 합하여 1인당 1억원까지 보호됩니다."\n'
        '   gloss: ["상품","예금자보호법","원금","이자","1인당","1억원","보호"]\n'
    )

    try:
        model = genai.GenerativeModel(
            GEMINI_MODEL_NAME,
            system_instruction=sys_prompt,
            generation_config={
                "response_mime_type": "application/json",
                "temperature": 0.2,
            },
        )
        print(f"[Gemini] 모델 준비 완료: {GEMINI_MODEL_NAME}")
        return model

    except Exception as e:
        print(f"[Gemini] 모델 초기화 실패: {e}")
        return None


GEMINI_MODEL = build_gemini()


# =========================================================
# 글로스 인덱스 로딩
# =========================================================

def load_gloss_index(path: Path = None):
    """
    gloss_dictionary_MOCK_1.csv를 읽어서
    { "통장": "104886", "토끼": "104887", ... } 형태의 dict를 만든다.

    CSV 헤더:
      gloss_id,korean_meanings,cat_1,cat_2,cat_3,original_vd_idx,source
    예시 행:
      104886,['통장'],일상생활 수어,,,505,li
    """
    p = path or GLOSS_INDEX_PATH
    idx = {}

    if not p.exists():
        print(f"[GlossIndex] 파일 없음: {p}")
        return idx

    with open(p, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        print(f"[GlossIndex] 헤더: {reader.fieldnames}")

        for row in reader:
            # 1) 어떤 ID를 쓸지 선택
            #   - gloss_id = "104886"
            #   - original_vd_idx = "505"
            # mp4 파일 이름이 gloss_id 기준이면 아래처럼 gloss_id 사용
            gid = (row.get("gloss_id") or "").strip()

            # 만약 mp4가 505.mp4 형식이면 아래 줄로 바꿔:
            # gid = (row.get("original_vd_idx") or "").strip()

            # 2) korean_meanings 파싱: "['통장']" → ["통장"]
            raw_meanings = row.get("korean_meanings", "")
            meanings = safe_json_loads(raw_meanings, default=None)

            tokens = []
            if isinstance(meanings, list):
                # ['통장'] 또는 ['정기예금', '적금'] 이런 리스트일 수 있음
                for m in meanings:
                    t = _norm(str(m))
                    if t:
                        tokens.append(t)
            else:
                # 혹시 리스트 파싱이 안 되면, 그냥 문자열 하나로 처리
                t = _norm(str(raw_meanings))
                if t:
                    tokens.append(t)

            # 3) 토큰들 → gid 매핑
            for t in tokens:
                if t and gid:
                    idx[t] = gid

    print(f"[GlossIndex] 로딩 완료: {len(idx)}개, from {p}")
    sample = list(idx.items())[:10]
    print(f"[GlossIndex] 예시 몇 개: {sample}")
    return idx


GLOSS_INDEX = load_gloss_index()


# =========================================================
# 글로스 → ID 매핑 및 영상 경로 생성
# =========================================================

def _paths_from_ids(gloss_ids):
    """
    gloss_id 리스트를 받아서 존재하는 mp4 경로 리스트로 변환.
    - backend/pipelines/gloss_mp4/<gloss_id>.mp4
    """
    paths = []
    for gid in gloss_ids:
        p = SIGN_VID_DIR / f"{gid}.mp4"
        if p.exists():
            paths.append(str(p))
        else:
            print(f"[WARN] gloss_id {gid}에 해당하는 영상 없음: {p}")
    return paths


def to_gloss_ids(gloss_list, gloss_index=None):
    """
    글로스 리스트를 gloss_id 리스트로 변환.
    - exact match 우선
    - 실패 시 유사도 기반 fallback (difflib)
    """
    idx = gloss_index or GLOSS_INDEX
    ids = []

    for token in gloss_list:
        t = _norm(token)
        if not t:
            continue

        if t in idx:
            ids.append(idx[t])
            continue

        # fallback: 비슷한 키 찾기
        # candidates = difflib.get_close_matches(t, idx.keys(), n=1, cutoff=0.8)
        candidates = difflib.get_close_matches(t, idx.keys(), n=1)
        if candidates:
            m = candidates[0]
            print(f"[Fallback] '{t}' → '{m}' 매핑 사용")
            ids.append(idx[m])
        else:
            print(f"[UnknownGloss] '{t}' 매핑 실패")
    return ids


# =========================================================
# 글로스 추출 (STT 텍스트 → gloss list)
# =========================================================

def _local_gloss_rules(text: str):
    """
    Gemini를 쓰지 못할 때 사용하는 단순 로컬 규칙.
    실제 서비스에서는 도메인 규칙/토크나이저로 대체하면 됨.
    """
    text = _norm(text)
    if not text:
        return []

    # 매우 단순한 예: 공백 기준 토큰 분리
    tokens = re.split(r"[ ,.!?]+", text)
    tokens = [t for t in tokens if t]
    return tokens


def extract_glosses(text: str, gemini_model=None):
    """
    STT 텍스트에서 gloss 리스트 추출.
    - gemini_model 있으면 LLM 기반 파싱
    - 없으면 로컬 규칙 기반 분리
    """
    model = gemini_model or GEMINI_MODEL

    if not model:
        return _local_gloss_rules(text)

    prompt = f"""
다음 한국어 문장을 수어 글로스 형태의 '토큰 리스트'로 만들어줘.
- 불필요한 조사/어미는 제거
- 핵심 의미 단어 위주로 단어 사이를 공백으로 구분
- 출력은 JSON 배열 형식만 사용 (예: ["기간", "최소", "1년"])

문장: "{text}"
"""
    try:
        resp = model.generate_content(prompt)
        raw = resp.text.strip()
        gloss_list = safe_json_loads(raw, default=None)
        if isinstance(gloss_list, list):
            return [_norm(str(t)) for t in gloss_list if str(t).strip()]
        else:
            # JSON 파싱 실패 시, 그냥 로컬 규칙 fall back
            return _local_gloss_rules(text)
    except Exception as e:
        print(f"[Gemini.extract_glosses] 오류: {e}")
        return _local_gloss_rules(text)


# =========================================================
# 문장 단위 파이프라인 (파일 입력)
# =========================================================

def run_full_pipeline_on_file(file_path: str):
    """
    한 번에:
    - 음성 파일 전체 → STT
    - STT 텍스트 → gloss 리스트
    - gloss 리스트 → gloss_id 리스트
    - gloss_id → 영상 경로 리스트
    결과(dict)를 반환.
    """
    # 1) 파일 길이(초) 계산 (wav 기준)
    audio_sec = get_wav_duration_sec(file_path)

    # 2) STT 시간 측정
    t0 = time.perf_counter()
    stt_text = stt_from_file(file_path)
    t1 = time.perf_counter()

    stt_ms = round((t1 - t0) * 1000, 1)

    # 3) 콘솔 로그: 길이 vs STT 시간
    if audio_sec is not None:
        ratio = stt_ms / audio_sec if audio_sec > 0 else stt_ms
        print(
            f"[STT Timing] file={file_path} | "
            f"audio_sec={audio_sec} s | stt_ms={stt_ms} ms "
            f"({ratio:.1f} ms/sec)"
        )
    else:
        print(f"[STT Timing] file={file_path} | audio_sec=? | stt_ms={stt_ms} ms")

    # 4) NLP / 매핑 / 경로 생성
    t_nlp0 = time.perf_counter()
    gloss_list = extract_glosses(stt_text, GEMINI_MODEL)
    t_nlp1 = time.perf_counter()

    t_map0 = time.perf_counter()
    gloss_ids = to_gloss_ids(gloss_list, GLOSS_INDEX)
    paths = _paths_from_ids(gloss_ids)
    t_map1 = time.perf_counter()

    return {
        "input_file": file_path,
        "audio_sec": audio_sec,          # 길이 정보도 포함
        "stt_text": stt_text,
        "gloss": gloss_list,
        "gloss_ids": gloss_ids,
        "paths": paths,
        "latency_ms": {
            "total": round((t_map1 - t0) * 1000, 1),
            "stt": stt_ms,
            "nlp": round((t_nlp1 - t_nlp0) * 1000, 1),
            "mapping": round((t_map1 - t_map0) * 1000, 1),
        },
    }

# =========================================================
# (선택) ffmpeg로 문장 영상 합치기
# =========================================================

def concat_videos_ffmpeg(video_paths, out_path: Path):
    """
    여러 개 수어 mp4 파일을 ffmpeg로 하나의 문장 영상으로 합친다.
    video_paths: 절대경로 리스트
    out_path: 출력 mp4 경로
    """
    if not video_paths:
        raise ValueError("video_paths 리스트가 비어 있음")

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # ffmpeg concat용 임시 리스트 파일 생성
    list_file = out_path.with_suffix(".txt")
    with open(list_file, "w", encoding="utf-8") as f:
        for p in video_paths:
            f.write(f"file '{p}'\n")

    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(list_file),
        "-c",
        "copy",
        str(out_path),
    ]

    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"[FFmpeg] concat 완료 → {out_path}")
    except subprocess.CalledProcessError as e:
        print(f"[FFmpeg] 오류: {e.stderr.decode('utf-8', errors='ignore')}")
        raise
    finally:
        if list_file.exists():
            list_file.unlink(missing_ok=True)

    return str(out_path)


# =========================================================
# 7) 실시간 성능평가용 delta 파이프라인 (현재 미사용, 전체 주석 처리)
# =========================================================

# DEBOUNCE_SEC = 1.0
# ACTUAL_RATE = 16000  # 16kHz, 16bit PCM 기준 (len(blob)/(rate*2)로 길이 계산)
#
#
# def main():
#     """
#     실시간 delta 음성 입력 기반 성능평가 모드.
#     - Enter 입력 시 delta blob 추출
#     - STT → gloss → gloss_id → json 로그 저장
#
#     주의:
#     - pipelines/local_delta.py 에 cut_delta_blob(), play_sequence() 구현 필요
#     - cut_delta_blob() → bytes (raw wav blob)
#     - play_sequence(paths) → gloss 영상 리스트 재생
#     """
#
#     from pipelines.local_delta import cut_delta_blob, play_sequence
#
#     snap = 0
#     last_trigger = 0.0
#
#     print("\n[Delta Pipeline Ready]")
#     print("[Enter] 키를 누르면 delta 구간을 전사합니다.\n")
#
#     while True:
#         try:
#             input("\n[Enter] 전사 시작 ")
#
#             now = time.time()
#             if now - last_trigger < DEBOUNCE_SEC:
#                 continue
#             last_trigger = now
#
#             t_all0 = time.perf_counter()
#
#             blob = cut_delta_blob()
#             if not blob:
#                 print("[Info] 새 오디오 없음.")
#                 continue
#
#             ts = now_ts()
#             base = OUT_DIR_DELTA / f"snapshot_{ts}_{snap+1:02d}"
#
#             wav_path = str(base) + ".wav"
#             with open(wav_path, "wb") as wf:
#                 wf.write(blob)
#
#             dur = len(blob) / (ACTUAL_RATE * 2)
#             print(f"[WAV] {wav_path} ({dur:.2f}s)")
#
#             t_stt0 = time.perf_counter()
#             res = STT_MODEL.transcribe(wav_path, language=WHISPER_LANG)
#             stt = _norm(res.get("text") or "")
#             stt_ms = round((time.perf_counter() - t_stt0) * 1000, 1)
#
#             txt_path = str(base) + ".txt"
#             with open(txt_path, "w", encoding="utf-8") as f:
#                 f.write(stt + "\n")
#
#             print(f"[STT] {stt_ms} ms → {txt_path}")
#
#             t_nlp0 = time.perf_counter()
#             gloss_list = extract_glosses(stt, GEMINI_MODEL)
#             nlp_ms = round((time.perf_counter() - t_nlp0) * 1000, 1)
#
#             t_map0 = time.perf_counter()
#             gloss_ids = to_gloss_ids(gloss_list, GLOSS_INDEX)
#             paths = _paths_from_ids(gloss_ids)
#             map_ms = round((time.perf_counter() - t_map0) * 1000, 1)
#
#             print("[GLOSS]", gloss_list)
#             print("[GLOSS_ID]", gloss_ids)
#
#             t_vid0 = time.perf_counter()
#             play_sequence(paths)
#             video_ms = round((time.perf_counter() - t_vid0) * 1000, 1)
#
#             total_ms = round((time.perf_counter() - t_all0) * 1000, 1)
#             print(
#                 f"[LATENCY] STT={stt_ms} | NLP={nlp_ms} | "
#                 f"MAP={map_ms} | VIDEO={video_ms} | TOTAL={total_ms} ms"
#             )
#
#             payload = {
#                 "timestamp": ts,
#                 "snapshot_index": snap + 1,
#                 "raw": {
#                     "stt_text": stt,
#                     "snapshot_mode": "delta",
#                     "tail_seconds": None,
#                 },
#                 "timing": {
#                     "stt_ms": stt_ms,
#                     "nlp_ms": nlp_ms,
#                     "mapping_ms": map_ms,
#                     "video_ms": video_ms,
#                     "total_ms": total_ms,
#                 },
#                 "gemini": {
#                     "gloss": gloss_list,
#                     "gloss_ids": gloss_ids,
#                 },
#             }
#
#             json_path = str(base) + ".json"
#             with open(json_path, "w", encoding="utf-8") as f:
#                 json.dump(payload, f, ensure_ascii=False, indent=2)
#
#             print(f"[JSON] {json_path}")
#
#             snap += 1
#
#         except KeyboardInterrupt:
#             print("\n[종료] Ctrl+C 감지")
#             break
#
#
# # =========================================================
# # 실행 엔트리포인트 (현재 미사용)
# # =========================================================
#
# if __name__ == "__main__":
#     main()


# =========================================================
# API snapshot 저장기
# =========================================================

API_SNAPSHOT_DIR = ROOT_DIR / "snapshots" / "api"
API_SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)


def save_api_snapshot(data: dict):
    """
    REST API 호출 시 STT/NLP/매핑/합성 정보를 snapshot JSON으로 저장.
    """
    ts = now_ts()
    out_path = API_SNAPSHOT_DIR / f"snapshot_{ts}.json"

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"[API Snapshot saved] {out_path}")
    return str(out_path)

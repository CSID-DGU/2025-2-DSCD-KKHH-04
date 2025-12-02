# -*- coding: utf-8 -*-
"""
service.py
Django API(/speech_to_sign)에서 호출되는 파이프라인 래퍼

기능:
- 업로드된 audio 파일 → wav 변환
- STT → clean → gloss 추출
- gloss → gloss_id 매핑
- gloss_id → mp4 영상 리스트
- 문장 단위 영상 concat
- latency 측정
- 스냅샷(snapshot) 저장 (backend/snapshots/api)
- 프론트가 읽는 최종 결과 JSON 구성
"""

import os
import subprocess
import tempfile
from pathlib import Path
import json
import time
import csv
import ast
import contextlib
import wave

from django.conf import settings

# ============================== #
# pipeline.py 내부 기능 import
# ============================== #
from .pipeline import (
    stt_from_file,
    extract_glosses,      # (비상용; 기본은 nlp_with_gemini 사용)
    to_gloss_ids,
    load_gloss_index,
    _paths_from_ids,
    build_gemini,
    MEDIA_ROOT,
    now_ts,
    OUT_DIR,
    _norm,
    GEMINI_MODEL,         
)
# 로컬 규칙 기반 gloss 추출용 (Gemini 실패 시에만 사용)
from .pipeline import _local_gloss_rules

# 🔹 여기 추가
from .pipeline import generate_image_video
import re

# ==============================
# API Snapshot 디렉토리
# ==============================
BASE_DIR = Path(__file__).resolve().parent.parent   # backend/
API_SNAPSHOT_DIR = BASE_DIR / "snapshots" / "api"
API_SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)


def nlp_with_gemini(text, model):
    """
    Gemini가 {"clean": "...", "gloss": [...]} 형태로 줄 때
    clean & gloss 모두 가져오는 함수.
    오류 시 fallback = (원문 정규화, 로컬 gloss)

    반환:
      clean_text: 교정된 문장 (또는 STT 정규화)
      gloss_list: 의미 단위 토큰 리스트
    """
    # 1) Gemini 모델이 전혀 준비 안 된 경우 → STT 정규화 + 로컬 규칙 gloss
    if not model:
        clean = _norm(text)
        gloss = _local_gloss_rules(clean)
        return clean, gloss

    try:
        # 2) Gemini 호출
        #    system_instruction(build_gemini)에서 이미
        #    {"clean":"…","gloss":["…"]} 형식으로 JSON만 반환하도록 지시함.
        prompt = f"""
역할: 한국어 전사 교정 + 수어 글로스 추출기.
아래 한국어 문장을 기반으로 JSON 하나만 반환하세요.

형식:
{{
  "clean": "<교정된 자연스러운 한국어 문장>",
  "gloss": ["의미단어1","의미단어2", ...]
}}

규칙:
- "clean": 원문의 의미는 유지하되 불필요한 반복, 말투, 조사 등을 정리한 자연스러운 문장
- "gloss": 조사를 제거한 핵심 의미 단어들만, 중복 없이 1~10개 정도
- 출력은 위 JSON 하나만, 추가 설명/문장은 넣지 말 것.

입력: "{text}"
"""
        resp = model.generate_content(prompt)

        # build_gemini에서 response_mime_type="application/json"을 줬기 때문에
        # resp.text는 JSON 문자열이어야 함.
        raw = resp.text
        data = json.loads(raw)

        # 3) clean / gloss 파싱
        clean = _norm(data.get("clean", text))

        gloss_raw = data.get("gloss", [])
        gloss = []
        for x in gloss_raw:
            s = _norm(str(x))
            if s:
                gloss.append(s)

        # 혹시 gloss가 비어버렸다면 최소한 로컬 규칙이라도 사용
        if not gloss:
            gloss = _local_gloss_rules(clean)

        return clean, gloss

    except Exception as e:
        # 4) 어떤 이유로든 Gemini 파싱 실패 시 → 안전한 fallback
        print(f"[Gemini NLP ERROR] {e}")
        clean = _norm(text)
        gloss = _local_gloss_rules(clean)
        return clean, gloss


def save_api_snapshot(payload: dict) -> str:
    """REST API 호출 스냅샷 저장"""
    ts = now_ts()
    out_path = API_SNAPSHOT_DIR / f"snapshot_{ts}.json"

    try:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"[API Snapshot saved] {out_path}")
    except Exception as e:
        print(f"[API Snapshot ERROR] {e}")

    return str(out_path)


# ==============================
# 문장 단위 수어 영상 저장 폴더
# ==============================
SENTENCE_DIR = MEDIA_ROOT / "sign_sentences"
SENTENCE_DIR.mkdir(parents=True, exist_ok=True)

# ==============================
# 글로스 사전 전역 로딩
# ==============================
GLOSS_INDEX = load_gloss_index()

# ---------- gloss_id -> korean_meanings 매핑 로더 ----------
GLOSS_CSV_PATH = BASE_DIR / "data" / "gloss_dictionary_MOCK_1.csv"


def load_gloss_meanings():
    """
    gloss_dictionary_MOCK_1.csv에서
    gloss_id -> [korean_meanings 리스트] 매핑을 만든다.
    """
    mapping = {}
    with open(GLOSS_CSV_PATH, "r", encoding="utf-8-sig") as f:
        rdr = csv.DictReader(f)
        for row in rdr:
            gid = (row.get("gloss_id") or "").strip()
            cell = (row.get("korean_meanings") or "").strip()
            if not gid or not cell:
                continue

            # '["예금","예금상품"]' 같은 문자열을 안전하게 파싱
            try:
                obj = ast.literal_eval(cell)
                if isinstance(obj, (list, tuple)):
                    terms = [str(x) for x in obj]
                else:
                    terms = [str(obj)]
            except Exception:
                terms = [cell]

            mapping[gid] = terms
    return mapping


GLOSS_MEANINGS = load_gloss_meanings()
# -----------------------------------------------------------


def concat_videos_ffmpeg(video_paths):
    """여러 개 수어 mp4를 하나로 합쳐 문장 단위 영상 생성"""
    if not video_paths:
        return None, None

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", delete=False, encoding="utf-8"
    ) as f:
        for p in video_paths:
            f.write(f"file '{p}'\n")
        list_path = f.name

    out_name = f"sent_{now_ts()}.mp4"
    out_path = SENTENCE_DIR / out_name

    cmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", list_path,
        "-c", "copy",
        str(out_path),
    ]

    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    finally:
        try:
            os.remove(list_path)
        except OSError:
            pass

    return out_path, f"/media/sign_sentences/{out_name}"


def convert_to_wav_if_needed(src_path: Path) -> Path:
    """webm/mp3 등 → wav(16kHz, mono) 변환"""
    if src_path.suffix.lower() == ".wav":
        return src_path

    dst_path = src_path.with_suffix(".wav")

    cmd = [
        "ffmpeg", "-y",
        "-i", str(src_path),
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        str(dst_path),
    ]

    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return dst_path


def get_audio_duration(path: Path) -> float:
    """
    wav 파일 길이(초) 구하기.
    실패하면 0.0 반환.
    """
    try:
        with contextlib.closing(wave.open(str(path), "rb")) as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            if rate == 0:
                return 0.0
            return frames / float(rate)
    except Exception as e:
        print(f"[Perf] get_audio_duration error: {e}")
        return 0.0


# ==============================
# 메인 처리 함수 (API에서 호출)
# ==============================
def process_audio_file(django_file, mode=None, session_id=None):
    """
    업로드된 오디오를 처리하여
    STT → NLP → gloss_id → 영상 합성 → latency → snapshot 저장 → 최종 응답

    mode: "질문" / "응답" 등 프론트에서 넘겨주는 발화 타입 (선택)
    session_id: 이번 상담 세션 식별자 (선택)
    """

    # ----------------------------------------
    # 1) 업로드 파일을 temp 폴더에 저장
    # ----------------------------------------
    temp_dir = Path(settings.MEDIA_ROOT) / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = temp_dir / django_file.name

    with open(temp_path, "wb") as f:
        for chunk in django_file.chunks():
            f.write(chunk)

    # webm → wav 변환
    wav_path = convert_to_wav_if_needed(temp_path)

    # wav 길이(초) 측정 (STT 성능 비교용)
    audio_sec = get_audio_duration(wav_path)

    latency = {}   # latency 기록용

    # ----------------------------------------
    # 2) STT
    # ----------------------------------------
    t0 = time.perf_counter()
    text = stt_from_file(str(wav_path))   # Whisper STT 결과 (원문)
    t1 = time.perf_counter()
    latency["stt"] = round((t1 - t0) * 1000, 1)

    # STT 성능 로그
    stt_ms = latency["stt"]
    ratio = stt_ms / (audio_sec * 1000 + 1e-6) if audio_sec else 0.0
    print(f"[Perf] audio_sec={audio_sec:.2f}, stt_ms={stt_ms:.1f}, ratio={ratio:.2f}")
    print(f"[DEBUG] STT raw text: {repr(text)}")

    # ----------------------------------------
    # 3) NLP 단계: clean + gloss 추출
    #    (Gemini 사용 → clean_text / gloss 모두 여기서 결정)
    # ----------------------------------------
    model = GEMINI_MODEL   # 🔹 서버 시작 시 한 번만 build 된 전역 모델

    t2 = time.perf_counter()
    clean_text, gloss_list = nlp_with_gemini(text, model)
    t3 = time.perf_counter()
    latency["nlp"] = round((t3 - t2) * 1000, 1)

    # ----------------------------------------
        # ----------------------------------------
    # 4) gloss → gloss_id 매핑
    # ----------------------------------------
    t4 = time.perf_counter()
    gloss_ids = to_gloss_ids(gloss_list, GLOSS_INDEX)
    video_paths = _paths_from_ids(gloss_ids)
    t5 = time.perf_counter()
    latency["mapping"] = round((t5 - t4) * 1000, 1)

    # 🔹 4-1) 숫자/이미지 토큰에 대한 fallback: 이미지 기반 동영상 생성
    #  - 예: "18세", "3년", "2회", "5%" 같은 토큰
    extra_video_paths = []
    num_pattern = re.compile(r"^\d+[가-힣%년월세원만원억개월회]*$")

    for tok in gloss_list or []:
        t = _norm(str(tok))
        if not t:
            continue

        # 숫자 기반 토큰이면 이미지 동영상 생성
        if num_pattern.match(t):
            try:
                img_mp4 = generate_image_video(t, duration=1.5)
                extra_video_paths.append(img_mp4)
                print(f"[Fallback ImageVideo] token={t} -> {img_mp4}")
            except Exception as e:
                print(f"[Fallback ImageVideo ERROR] token={t}: {e}")

    # 최종 합성에 쓸 경로들 (기존 수어 영상 + 숫자 이미지 영상)
    video_paths_for_concat = video_paths + extra_video_paths

    # gloss_id → 한글 meaning 대표 레이블
    gloss_labels = []
    for gid in gloss_ids:
        terms = GLOSS_MEANINGS.get(gid) or []
        if terms:
            gloss_labels.append(terms[0])  # 대표 의미 1개
        else:
            gloss_labels.append(gid)

    # ----------------------------------------
    # 5) 영상 합성
    # ----------------------------------------
    t6 = time.perf_counter()
    sent_abs, sent_url = concat_videos_ffmpeg(video_paths_for_concat)
    t7 = time.perf_counter()
    latency["synth"] = round((t7 - t6) * 1000, 1)

        # 개별 영상 URL 리스트(sign_video_list) 구성
    # - video_paths_for_concat 안에는 기존 수어 mp4 + 숫자 이미지 mp4가 모두 들어 있음
    sign_video_list = []
    for p in video_paths_for_concat:
        p = Path(p)
        try:
            # MEDIA_ROOT 기준 상대 경로로 바꾼 뒤 MEDIA_URL을 붙여서 URL 만들기
            rel = p.relative_to(MEDIA_ROOT)
            url = settings.MEDIA_URL.rstrip("/") + "/" + str(rel).replace("\\", "/")
            sign_video_list.append(url)
        except ValueError:
            # MEDIA_ROOT 밖이면 일단 파일명만 넣어둠 (최소 NameError는 안 나게)
            sign_video_list.append(str(p))
    # ----------------------------------------
    # 6) 디버그 로그 (지금 어디까지 나오는지 확인용)
    # ----------------------------------------
    print("\n========== [DEBUG process_audio_file] ==========")
    print(f"text (STT 원문): {repr(text)}")
    print(f"clean_text: {repr(clean_text)}")
    print(f"gloss_list: {gloss_list}")
    print(f"gloss_ids: {gloss_ids}")
    print(f"gloss_labels: {gloss_labels}")
    print(f"video_paths: {video_paths}")
    print(f"sentence_video_url: {sent_url}")
    print(f"latency_ms: {latency}")
    print(f"video_paths_for_concat: {video_paths_for_concat}")
    print(f"sign_video_list: {sign_video_list}")
    print(f"sentence_video_url: {sent_url}")

    print("===============================================\n")

    # ----------------------------------------
    # 7) API 스냅샷 저장 (latency 포함)
    # ----------------------------------------
        # ----------------------------------------
    # 7) API 스냅샷 저장 (latency 포함)
        # ----------------------------------------
    # 7) latency 보정: sec 단위 + total까지 계산
    # ----------------------------------------
    # ms 단위에서 꺼내기 (없는 키는 0으로)
    stt_ms     = float(latency.get("stt", 0.0))
    nlp_ms     = float(latency.get("nlp", 0.0))
    mapping_ms = float(latency.get("mapping", 0.0))
    synth_ms   = float(latency.get("synth", 0.0))

    total_ms = stt_ms + nlp_ms + mapping_ms + synth_ms

    # 필요하면 sec 단위도 같이 만들어주기
    latency_sec = {
        "stt_sec":     round(stt_ms / 1000.0, 2),
        "nlp_sec":     round(nlp_ms / 1000.0, 2),
        "mapping_sec": round(mapping_ms / 1000.0, 2),
        "synth_sec":   round(synth_ms / 1000.0, 2),
        "total_sec":   round(total_ms / 1000.0, 2),
    }

    # 디버그 출력 (그 문장 1: ~~ s / 총합: ~~ s 형태)
    print(
        f"[Perf Sentence] STT: {latency_sec['stt_sec']:.2f} s / "
        f"NLP: {latency_sec['nlp_sec']:.2f} s / "
        f"매핑: {latency_sec['mapping_sec']:.2f} s / "
        f"합성: {latency_sec['synth_sec']:.2f} s"
    )
    print(f"[Perf Sentence] 총합: {latency_sec['total_sec']:.2f} s")


    # ----------------------------------------
    current_ts = now_ts()  # 🔹 한 번만 호출해서 공통으로 사용

    result = {
        # 🔹 대시보드/프론트 공통으로 쓸 시간 필드
        "ts": current_ts,          # PerformanceDashboard에서 우선 사용
        "timestamp": current_ts,   # 기존 필드도 유지

        "session_id": session_id,    # 이번 상담 세션 ID (없으면 None)
        "mode": mode,                # "질문"/"응답" 등 발화 타입 (없으면 None)
        "audio_sec": audio_sec,      # 이번 발화 길이(초)
        "text": text,                # STT 원문
        "clean_text": clean_text,    # Gemini NLP 결과 (or fallback)
        "latency_ms": latency,
        "latency_sec": latency_sec,
        "gloss": gloss_list,
        "gloss_ids": gloss_ids,
        "sentence_video_url": sent_url,   # 대표 문장 영상
        "sign_video_list": sign_video_list,    # 개별 영상 리스트
        "gloss_labels": gloss_labels,     # gloss_id → 대표 한글 의미
    }


    save_api_snapshot(result)

    # ----------------------------------------
    # 8) 프론트로 반환
    # ----------------------------------------
    return result

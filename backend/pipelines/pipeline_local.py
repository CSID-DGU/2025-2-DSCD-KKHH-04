# -*- coding: utf-8 -*-
"""
음성 → STT → 글로스 추출(Gemini or 로컬 규칙) → gloss_id 매핑(CSV 사전) →
대응 수어 영상(mp4)들을 순서대로 즉시 재생 + 로그(snapshots14/*.wav/txt/json) 저장.

실행 방법:
    python pipeline.py
"""

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

import sounddevice as sd        # 마이크 입력
import whisper                  # STT

# Gemini – 없으면 로컬 규칙으로만 글로스 추출
try:
    import google.generativeai as genai

except Exception:
    genai = None
    gexc = None


# =========================================================
# 전역 설정
# =========================================================

# 출력 및 리소스 경로
ROOT_DIR        = Path(__file__).resolve().parent
OUT_DIR = ROOT_DIR / "snapshots" / "local"          # 로그( wav/txt/json ) 저장 디렉토리
GLOSS_DICT_PATH = ROOT_DIR / "gloss_dictionary_MOCK_1.csv"  # 글로스 사전 CSV
GLOSS_MP4_DIR   = ROOT_DIR / "gloss_mp4"            # gloss_id.mp4 영상 저장 디렉토리

OUT_DIR.mkdir(exist_ok=True)

# STT / Gemini 설정
GOOGLE_API_KEY    = os.environ.get("GOOGLE_API_KEY", "")  # 없으면 Gemini 미사용
GEMINI_MODEL_NAME = "models/gemini-2.5-flash"
WHISPER_MODEL_NAME = "small"
WHISPER_LANG       = "ko"

# 오디오 설정
CHUNK        = 1024        # 콜백당 프레임 수
DEBOUNCE_SEC = 0.5         # Enter 연타 방지
ALWAYS_RETURN_ID = True    # 매핑 실패 시에도 유사도 기반으로 ID 하나는 선택


# =========================================================
# 공통 유틸
# =========================================================

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


# =========================================================
# 1) 영상 매핑 + 즉시 재생
#    - gloss_id 리스트 → gloss_mp4/<id>.mp4 경로 리스트 → concat 재생
# =========================================================

def _paths_from_ids(gloss_ids):
    """gloss_id 리스트를 파일 경로 리스트로 매핑. 없으면 경고만 하고 건너뜀."""
    paths, missing = [], []
    for gid in gloss_ids or []:
        p = GLOSS_MP4_DIR / f"{gid}.mp4"
        if p.exists():
            paths.append(str(p.resolve()))
        else:
            missing.append(gid)
    if missing:
        print(f"⚠️  매핑 누락 gloss_id: {missing}")
    return paths


def play_sequence(paths):
    """
    FFmpeg/ffplay를 사용하여 영상들을 순서대로 재생.
    - ffplay가 있으면 concat demuxer로 바로 재생 (출력 파일 생성 없음)
    - ffplay가 없으면 /tmp에 임시 mp4를 합성 후 OS 기본 플레이어로 열기
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


# =========================================================
# 2) 글로스 사전 로더
#    - gloss_dictionary_MOCK_1.csv → 메모리 인덱스(rows, exact)
# =========================================================

def load_gloss_index(csv_path: Path) -> dict:
    """
    글로스 사전을 로드해 검색용 인덱스를 만든다.

    반환:
      {
        "rows":  [{'gid','term','term_ns','token_cnt','char_len'}, ...],
        "exact": {'term_ns': gid, ...}  # 무공백 완전일치용
      }
    """
    rows, exact = [], {}

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

    print(f"[Gloss] indexed rows={len(rows)}, exact_keys={len(exact)}")
    return {"rows": rows, "exact": exact}


# =========================================================
# 3) 글로스 → gloss_id 매핑
#    - 단어 1개를 가장 잘 대응되는 gloss_id 1개로 선택
# =========================================================

def map_one_word_to_id(word: str, index: dict) -> str | None:
    """
    단일 글로스(단어) → gloss_id 1개를 매핑.

    우선순위:
      1) 무공백 완전일치 (예: '예금자보호법')
      2) 포함 후보: term_ns에 wns를 포함하는 항목 중
         (token_cnt↑, char_len↑, term, gid) 기준으로 가장 짧은/단순한 것
      3) 후보 전무 시: 유사도(difflib.SequenceMatcher) 최상위 1개
    """
    if not word or not index:
        return None

    rows, exact = index["rows"], index["exact"]

    w   = _first_word(word)   # 혹시 문구가 와도 첫 단어만 사용
    wns = _nospace(w)
    if not wns:
        return None

    # 1) 완전 일치
    gid = exact.get(wns)
    if gid:
        return gid

    # 2) 포함 후보 중 가장 “작고 단순한” 항목 선택
    cands = [r for r in rows if wns in r["term_ns"]]
    if cands:
        cands.sort(key=lambda r: (r["token_cnt"], r["char_len"], r["term"], r["gid"]))
        return cands[0]["gid"]

    # 3) 후보가 전혀 없으면 유사도 최상위 1개 선택
    best_gid, best_sc = None, 0.0
    for r in rows:
        sc = difflib.SequenceMatcher(None, wns, r["term_ns"]).ratio()
        if sc > best_sc:
            best_sc, best_gid = sc, r["gid"]

    if ALWAYS_RETURN_ID and best_gid:
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


# =========================================================
# 4) Gemini 설정 및 글로스 추출
#    - 텍스트 → (clean 문장, 글로스 리스트)
# =========================================================

def build_gemini():
    """환경변수와 라이브러리가 준비되면 Gemini 모델을 생성, 아니면 None."""
    if not GOOGLE_API_KEY or genai is None:
        return None

    genai.configure(api_key=GOOGLE_API_KEY)

    sys_prompt = (
        "역할: 한국어 전사 교정 + 수어 글로스 추출기.\n"
        '출력 형식: {"clean":"…","gloss":["…"]} — JSON 한 줄만.\n'
        "규칙:\n"
        "1) clean: 원문의 의미를 보존해 자연스러운 한 문장으로 교정.\n"
        "2) gloss: 반드시 한국어 단어 1개(공백 금지)들로 이루어진 리스트.\n"
        "   - 조사/어미/접사 금지(예: '대상에는' ✗ → '대상' ✓, '제한이' ✗ → '제한' ✓)\n"
        "   - 표제형/명사형으로 적기('보호하다' ✗ → '보호' ✓)\n"
        "   - 숫자·단위는 결합 표기 허용(예: 1억원, 6개월, 5년)\n"
        "   - 의미를 포괄하되 중복 없이 1–10개 범위로 산출.\n"
        "3) 예시:\n"
        '   입력: \"가입 대상에는 제한이 없으며 누구나 가입 가능합니다.\"\n'
        '   gloss: [\"가입\",\"대상\",\"제한\",\"가능\"]\n'
        '   입력: \"이 상품은 예금자보호법에 따라 원금과 이자를 합하여 1인당 1억원까지 보호됩니다.\"\n'
        '   gloss: [\"상품\",\"예금자보호법\",\"원금\",\"이자\",\"1인당\",\"1억원\",\"보호\"]\n"
    )

    return genai.GenerativeModel(
        GEMINI_MODEL_NAME,
        system_instruction=sys_prompt,
        generation_config={
            "response_mime_type": "application/json",
            "temperature": 0.2,
        },
    )


def extract_glosses(text: str, model) -> tuple[str, list[str]]:
    """
    문장(text) → (clean 문장, 글로스 리스트) 변환.

    - model(Gemini)이 있으면: JSON 응답의 clean, gloss 필드 사용
    - 없거나 오류 나면: clean = 정규화된 원문, gloss는 로컬 정규식으로 숫자+단위/단어 토큰 추출
    """
    clean = _norm(text)
    if not clean:
        return "", []

    # 1) Gemini 사용 시
    if model:
        try:
            parts = [{"role": "user", "parts": [clean]}]
            resp = model.generate_content(parts)
            obj = json.loads(resp.text) if (resp and resp.text) else {}

            clean_out = _norm(obj.get("clean") or clean)
            gloss = obj.get("gloss") or []
            if isinstance(gloss, str):
                gloss = [gloss]

            gloss_tokens = [_first_word(g) for g in gloss if _first_word(g)]
            return clean_out, gloss_tokens
        except Exception:
            # 오류 시 조용히 로컬 규칙으로 폴백
            pass

    # 2) 로컬 폴백: 숫자+단위 또는 한글/영문 단어
    tokens = re.findall(r"\d+(?:억원|억\s*원|개월|년)|[가-힣A-Za-z]+", clean)
    tokens = [_first_word(t) for t in tokens if _first_word(t)]
    return clean, (tokens if tokens else [])


# =========================================================
# 5) 오디오 캡처 (delta 스냅샷)
#    - sounddevice RawInputStream으로 연속 녹음
#    - Enter마다 “직전 이후 구간”만 잘라서 STT 대상 blob 생성
# =========================================================

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


# =========================================================
# 6) 메인 파이프라인
#    - 오디오 → STT → (clean, 글로스) → gloss_id → 영상 재생 + 로그 저장
# =========================================================

def main():
    # 1) 글로스 사전 로드
    index = load_gloss_index(GLOSS_DICT_PATH)

    # 2) Gemini 모델 초기화(있으면 사용, 없으면 None)
    model = build_gemini()

    # 3) Whisper 모델 로드
    print("[Whisper] loading:", WHISPER_MODEL_NAME)
    wmodel = whisper.load_model(WHISPER_MODEL_NAME)

    # 4) 오디오 입력 스트림 시작
    list_devices()
    global sd_stream
    sd_stream = open_input_stream()
    sd_stream.start()
    print("🎙️  녹음 시작 — Enter를 누르면 '직전 이후 구간'을 전사합니다. (Ctrl+C 종료)")

    snap_idx = 0
    last_trigger = 0.0

    while True:
        try:
            input("\n[Enter] 전사 (delta). ")
            # Enter 연타 방지
            now = time.time()
            if now - last_trigger < DEBOUNCE_SEC:
                continue
            last_trigger = now

            # 5-1) delta 구간 오디오 추출
            blob = cut_delta_blob()
            if not blob:
                print("[Info] 새 오디오 없음.")
                continue

            ts = now_ts()
            base = OUT_DIR / f"snapshot_{ts}_{snap_idx + 1:02d}"

            # 5-2) WAV 저장 (로그용)
            wav_path = str(base) + ".wav"
            with wave.open(wav_path, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)  # int16
                wf.setframerate(ACTUAL_RATE)
                wf.writeframes(blob)
            dur = len(blob) / (ACTUAL_RATE * 2)
            print(f"[WAV] {wav_path} ({dur:.1f}s)")

            # 5-3) Whisper STT
            t0 = time.perf_counter()
            res = wmodel.transcribe(wav_path, language=WHISPER_LANG)
            stt_text = _norm(res.get("text") or "")
            wlat = round((time.perf_counter() - t0) * 1000, 1)

            txt_path = str(base) + ".txt"
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(stt_text + "\n")
            print(f"[STT] lat {wlat} ms → {txt_path}")
            print("[STT_TEXT]", stt_text)

            # 5-4) clean 문장 + 글로스 추출 → gloss_id 매핑
            clean_text, gloss_list = extract_glosses(stt_text, model)
            gloss_ids = to_gloss_ids(gloss_list, index)

            print("[CLEAN]", clean_text)
            print("[GLOSS]", gloss_list)
            print("[GLOSS_ID]", gloss_ids)

            # 5-5) 해당 gloss_id 영상들을 순서대로 재생
            paths = _paths_from_ids(gloss_ids)
            play_sequence(paths)

            # 5-6) JSON 로그 저장
            payload = {
                "timestamp": ts,
                "snapshot_index": snap_idx + 1,
                "raw": {
                    "stt_text": stt_text,
                    "whisper_latency_ms": wlat,
                    "snapshot_mode": "delta",
                    "tail_seconds": None,
                },
                "gemini": {
                    "clean": clean_text,
                    "gloss": gloss_list,
                    "gloss_ids": gloss_ids,
                },
            }
            json_path = str(base) + ".json"
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            print(f"[JSON] {json_path}")

            snap_idx += 1

        except KeyboardInterrupt:
            print("\n[종료] Ctrl+C 감지. 스트림 정리 중…")
            break

    # 7) 종료 정리
    try:
        if sd_stream:
            sd_stream.stop()
            sd_stream.close()
    except Exception:
        pass


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""
로컬 테스트용: 마이크 → WAV → Whisper STT → 글로스 추출 → gloss_id 매핑.

사용 방법:
    (.venv) python local_mic_test.py
"""

import sounddevice as sd
import whisper
import wave
import threading
import time
import os
from datetime import datetime
from pathlib import Path

# --- 너의 pipeline.py 함수 import ---
from pipeline import (
    _norm,
    extract_glosses,
    to_gloss_ids,
    load_gloss_index,
    GLOSS_DICT_PATH
)

# -----------------------------
# 기본 설정
# -----------------------------
WHISPER_MODEL_NAME = "small"
LANG = "ko"
DEVICE = "cpu"     # GPU 있으면 "cuda"

CHUNK = 1024
frames = []
frames_lock = threading.Lock()
_last_frame_idx = 0

# 로그 저장 폴더
ROOT_DIR = Path(__file__).resolve().parent
LOG_DIR = ROOT_DIR / "local_snapshots"
LOG_DIR.mkdir(exist_ok=True)


# -----------------------------
# 유틸
# -----------------------------
def now_ts():
    return datetime.now().strftime("%Y%m%d_%H%M%S")


# -----------------------------
# Audio Callback
# -----------------------------
def audio_callback(indata, frames_cnt, time_info, status):
    if status:
        print("[Audio status]", status)
    with frames_lock:
        frames.append(bytes(indata))


# -----------------------------
# Delta Cut
# -----------------------------
def cut_delta_audio():
    global _last_frame_idx
    with frames_lock:
        cur = len(frames)
        if cur <= _last_frame_idx:
            return b""
        blob = b"".join(frames[_last_frame_idx:cur])
        _last_frame_idx = cur
        return blob


# -----------------------------
# Main Logic
# -----------------------------
def main():
    print("\n[1] Gloss Dictionary Loading…")
    index = load_gloss_index(GLOSS_DICT_PATH)
    print(" → 글로스 사전 로드 완료.")

    print("\n[2] Whisper Model Loading…")
    model = whisper.load_model(WHISPER_MODEL_NAME, device=DEVICE)
    print(f" → Whisper '{WHISPER_MODEL_NAME}' 로드 완료.\n")

    # 오디오 장치 확인
    print("[3] 오디오 장치 목록:")
    for i, dev in enumerate(sd.query_devices()):
        print(f" #{i}: {dev['name']} (inputs={dev['max_input_channels']})")

    # 기본 마이크 정보
    dev = sd.query_devices(kind="input")
    samplerate = int(dev["default_samplerate"])
    print(f"\n🎙  기본 입력 장치: {dev['name']} @ {samplerate} Hz\n")

    # RawInputStream 열기
    stream = sd.RawInputStream(
        samplerate=samplerate,
        channels=1,
        dtype="int16",
        blocksize=CHUNK,
        callback=audio_callback
    )
    stream.start()

    print("==============================================")
    print("로컬 마이크 녹음 시작됨.")
    print("Enter 누르면 '직전 구간'을 STT 변환합니다.")
    print("Ctrl + C 로 종료.")
    print("==============================================")

    snap_idx = 0

    while True:
        try:
            input("\n[Enter] STT 실행 ▶ ")

            # delta 음성
            blob = cut_delta_audio()
            if not blob:
                print("새 오디오 없음.")
                continue

            ts = now_ts()
            base = LOG_DIR / f"local_{ts}_{snap_idx:02d}"

            # WAV 저장
            wav_path = str(base) + ".wav"
            with wave.open(wav_path, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(samplerate)
                wf.writeframes(blob)

            print(f"[저장] WAV 파일: {wav_path}")

            # Whisper STT
            t0 = time.perf_counter()
            res = model.transcribe(
                wav_path,
                language=LANG,
                task="transcribe",
                temperature=0.0,
                beam_size=5,
                best_of=5,
            )
            latency = round((time.perf_counter() - t0) * 1000, 1)
            text = _norm(res.get("text") or "")
            print(f"[STT] {text}   (lat={latency}ms)")

            # 글로스 추출 + ID 매핑
            gloss = extract_glosses(text, None)
            gids  = to_gloss_ids(gloss, index)

            print("[GLOSS]", gloss)
            print("[GLOSS_ID]", gids)

            snap_idx += 1

        except KeyboardInterrupt:
            print("\n종료합니다…")
            break

    stream.stop()
    stream.close()


if __name__ == "__main__":
    main()

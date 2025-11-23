# backend/pipelines/local_mic_to_api.py
# -*- coding: utf-8 -*-
"""
로컬 마이크 → WAV 저장 → Django API로 업로드 테스트

실행:
    (.venv) python local_mic_to_api.py
"""

import sounddevice as sd
import wave
import threading
import time
from datetime import datetime
from pathlib import Path
import requests

CHUNK = 1024
frames = []
frames_lock = threading.Lock()
_last_frame_idx = 0

ROOT_DIR = Path(__file__).resolve().parent
LOG_DIR = ROOT_DIR / "local_snapshots_api"
LOG_DIR.mkdir(exist_ok=True)

# 네 Django API 엔드포인트 (예시)
API_URL = "http://127.0.0.1:8000/api/speech_to_sign/"


def now_ts():
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def audio_callback(indata, frames_cnt, time_info, status):
    if status:
        print("[Audio status]", status)
    with frames_lock:
        frames.append(bytes(indata))


def cut_delta_audio():
    global _last_frame_idx
    with frames_lock:
        cur = len(frames)
        if cur <= _last_frame_idx:
            return b""
        blob = b"".join(frames[_last_frame_idx:cur])
        _last_frame_idx = cur
        return blob


def main():
    print("\n[1] 오디오 장치 목록:")
    for i, dev in enumerate(sd.query_devices()):
        print(f"  #{i}: {dev['name']} (inputs={dev['max_input_channels']})")

    dev = sd.query_devices(kind="input")
    samplerate = int(dev["default_samplerate"])
    print(f"\n🎙 기본 입력 장치: {dev['name']} @ {samplerate} Hz\n")

    stream = sd.RawInputStream(
        samplerate=samplerate,
        channels=1,
        dtype="int16",
        blocksize=CHUNK,
        callback=audio_callback,
    )
    stream.start()

    print("==============================================")
    print("Enter → WAV 생성 후 Django API로 업로드")
    print(f"API URL: {API_URL}")
    print("Ctrl + C → 종료")
    print("==============================================")

    snap_idx = 0

    while True:
        try:
            input("\n[Enter] 녹음 구간 업로드 ▶ ")
            blob = cut_delta_audio()
            if not blob:
                print("새 오디오 없음.")
                continue

            ts = now_ts()
            base = LOG_DIR / f"api_{ts}_{snap_idx:02d}"
            wav_path = str(base) + ".wav"

            with wave.open(wav_path, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(samplerate)
                wf.writeframes(blob)
            print(f"[WAV] {wav_path}")

            # Django API로 업로드
            with open(wav_path, "rb") as f:
                files = {"audio": ("local.wav", f, "audio/wav")}
                print("[POST] 업로드 중…")
                r = requests.post(API_URL, files=files, timeout=60)

            print(f"[RESP] status={r.status_code}")
            try:
                print(r.json())
            except Exception:
                print(r.text)

            snap_idx += 1

        except KeyboardInterrupt:
            print("\n종료합니다…")
            break

    stream.stop()
    stream.close()


if __name__ == "__main__":
    main()

# backend/pipelines/local_mic_test_with_video.py
# -*- coding: utf-8 -*-
"""
로컬 마이크 → Whisper STT → 글로스 추출 → gloss_id 매핑 → 수어 영상 재생 테스트

실행:
    (.venv) python local_mic_test_with_video.py
"""

import sounddevice as sd
import whisper
import wave
import threading
import time
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
import sys

# 너의 서버용 pipeline.py 함수들 import
from pipeline import (
    _norm,
    extract_glosses,
    to_gloss_ids,
    load_gloss_index,
    GLOSS_DICT_PATH,
    _paths_from_ids,   # MEDIA_ROOT/sign_videos 기준 gloss_id → mp4 경로
)

# ---------------- 기본 설정 ----------------
WHISPER_MODEL_NAME = "medium"   # small → medium 이상 추천
LANG = "ko"
DEVICE = "cpu"                  # GPU 있으면 "cuda"

CHUNK = 1024
frames = []
frames_lock = threading.Lock()
_last_frame_idx = 0

ROOT_DIR = Path(__file__).resolve().parent
LOG_DIR = ROOT_DIR / "local_snapshots_with_video"
LOG_DIR.mkdir(exist_ok=True)


def now_ts():
    return datetime.now().strftime("%Y%m%d_%H%M%S")


# ---------------- 오디오 콜백 ----------------
def audio_callback(indata, frames_cnt, time_info, status):
    if status:
        print("[Audio status]", status)
    with frames_lock:
        frames.append(bytes(indata))


def cut_delta_audio():
    """직전 이후 누적분만 blob으로 잘라오기."""
    global _last_frame_idx
    with frames_lock:
        cur = len(frames)
        if cur <= _last_frame_idx:
            return b""
        blob = b"".join(frames[_last_frame_idx:cur])
        _last_frame_idx = cur
        return blob


# ---------------- 영상 재생 유틸 ----------------
def play_sequence(paths):
    """
    ffplay 또는 ffmpeg를 사용해 mp4 리스트를 순서대로 재생.
    - ffplay 있으면 concat demuxer로 바로 재생
    - 없으면 임시 concat mp4 만들어서 OS 기본 플레이어로 오픈
    """
    if not paths:
        print("⚠ 재생할 영상이 없습니다.")
        return False

    ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
    ffplay = shutil.which("ffplay")

    # 1) ffplay 있으면 concat으로 바로 재생
    if ffplay:
        import tempfile
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

    # 2) ffplay 없으면 ffmpeg로 임시 mp4 합성 후 OS로 열기
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        lst = Path(td) / "list.txt"
        out = Path(td) / f"concat_{now_ts()}.mp4"

        with open(lst, "w", encoding="utf-8") as f:
            for p in paths:
                f.write(f"file '{p}'\n")

        cmd = [
            ffmpeg, "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(lst),
            "-vf", "format=yuv420p",
            "-c:v", "libx264", "-crf", "20", "-preset", "veryfast",
            "-c:a", "aac", "-b:a", "128k",
            str(out),
        ]
        subprocess.run(cmd, check=True)

        if os.name == "nt":      # Windows
            os.startfile(str(out))
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(out)])
        else:
            subprocess.Popen(["xdg-open", str(out)])
        return True


# ---------------- 메인 ----------------
def main():
    print("\n[1] 글로스 사전 로드…")
    index = load_gloss_index(GLOSS_DICT_PATH)
    print(" → gloss index 로드 완료.")

    print("\n[2] Whisper 모델 로드…")
    model = whisper.load_model(WHISPER_MODEL_NAME, device=DEVICE)
    print(f" → Whisper '{WHISPER_MODEL_NAME}' on {DEVICE}")

    # 오디오 디바이스 정보
    print("\n[3] 오디오 입력 장치 목록:")
    for i, dev in enumerate(sd.query_devices()):
        print(f"  #{i}: {dev['name']} (inputs={dev['max_input_channels']})")

    dev = sd.query_devices(kind="input")
    samplerate = int(dev["default_samplerate"])
    print(f"\n🎙 기본 입력 장치: {dev['name']} @ {samplerate} Hz\n")

    # 스트림 시작
    stream = sd.RawInputStream(
        samplerate=samplerate,
        channels=1,
        dtype="int16",
        blocksize=CHUNK,
        callback=audio_callback,
    )
    stream.start()

    print("==============================================")
    print("로컬 마이크 녹음 시작.")
    print("Enter → 직전 구간 STT + 수어 영상 재생")
    print("Ctrl + C → 종료")
    print("==============================================")

    snap_idx = 0

    while True:
        try:
            input("\n[Enter] STT + 수어 재생 ▶ ")
            blob = cut_delta_audio()
            if not blob:
                print("새 오디오 없음.")
                continue

            ts = now_ts()
            base = LOG_DIR / f"local_{ts}_{snap_idx:02d}"

            wav_path = str(base) + ".wav"
            with wave.open(wav_path, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(samplerate)
                wf.writeframes(blob)
            print(f"[WAV] {wav_path}")

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
            print(f"[STT] {text}  (lat={latency}ms)")

            gloss = extract_glosses(text, None)
            gids = to_gloss_ids(gloss, index)
            print("[GLOSS]", gloss)
            print("[GLOSS_ID]", gids)

            # gloss_id → mp4 경로들 → 재생
            paths = _paths_from_ids(gids)
            print("[VIDEO PATHS]", paths)
            play_sequence(paths)

            snap_idx += 1

        except KeyboardInterrupt:
            print("\n종료합니다…")
            break

    stream.stop()
    stream.close()


if __name__ == "__main__":
    main()

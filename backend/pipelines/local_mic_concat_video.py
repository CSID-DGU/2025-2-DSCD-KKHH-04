# backend/pipelines/local_mic_concat_video.py
# -*- coding: utf-8 -*-
"""
로컬 마이크 → STT → gloss_id → 여러 수어 mp4를 하나의 mp4로 concat.

실행:
    (.venv) python local_mic_concat_video.py
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

from pipeline import (
    _norm,
    extract_glosses,
    to_gloss_ids,
    load_gloss_index,
    GLOSS_DICT_PATH,
    _paths_from_ids,
)

WHISPER_MODEL_NAME = "medium"
LANG = "ko"
DEVICE = "cpu"

CHUNK = 1024
frames = []
frames_lock = threading.Lock()
_last_frame_idx = 0

ROOT_DIR = Path(__file__).resolve().parent
LOG_DIR = ROOT_DIR / "local_snapshots_concat"
LOG_DIR.mkdir(exist_ok=True)

COMBINED_DIR = ROOT_DIR / "combined_sign_videos"
COMBINED_DIR.mkdir(exist_ok=True)


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


def concat_videos(paths, out_path: Path) -> bool:
    """ffmpeg concat으로 paths 리스트를 하나의 mp4로 합성."""
    if not paths:
        print("⚠ 합칠 영상이 없습니다.")
        return False

    ffmpeg = shutil.which("ffmpeg") or "ffmpeg"

    tmp_list = out_path.with_suffix(".txt")
    with open(tmp_list, "w", encoding="utf-8") as f:
        for p in paths:
            f.write(f"file '{p}'\n")

    cmd = [
        ffmpeg, "-y",
        "-f", "concat", "-safe", "0",
        "-i", str(tmp_list),
        "-vf", "format=yuv420p",
        "-c:v", "libx264", "-crf", "20", "-preset", "veryfast",
        "-c:a", "aac", "-b:a", "128k",
        str(out_path),
    ]
    r = subprocess.run(cmd)
    try:
        os.remove(tmp_list)
    except OSError:
        pass
    return r.returncode == 0


def main():
    print("\n[1] gloss index 로드…")
    index = load_gloss_index(GLOSS_DICT_PATH)

    print("\n[2] Whisper 모델 로드…")
    model = whisper.load_model(WHISPER_MODEL_NAME, device=DEVICE)

    print("\n[3] 오디오 장치 목록:")
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
    print("Enter → STT + gloss_id → mp4 concat 파일 생성")
    print("Ctrl + C → 종료")
    print("==============================================")

    snap_idx = 0

    while True:
        try:
            input("\n[Enter] STT + mp4 concat ▶ ")
            blob = cut_delta_audio()
            if not blob:
                print("새 오디오 없음.")
                continue

            ts = now_ts()
            base = LOG_DIR / f"concat_{ts}_{snap_idx:02d}"

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

            paths = _paths_from_ids(gids)
            print("[VIDEO PATHS]", paths)

            out_path = COMBINED_DIR / f"sign_seq_{ts}.mp4"
            if concat_videos(paths, out_path):
                print(f"[DONE] 합성 영상: {out_path}")
            else:
                print("❌ ffmpeg concat 실패")

            snap_idx += 1

        except KeyboardInterrupt:
            print("\n종료합니다…")
            break

    stream.stop()
    stream.close()


if __name__ == "__main__":
    main()

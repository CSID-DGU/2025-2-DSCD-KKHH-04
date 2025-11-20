# backend/core/ingest_service.py
from __future__ import annotations
import os, time
from pathlib import Path
from typing import List
import numpy as np


def flatten_frame(frame: dict) -> list[float]:
    """
    한 프레임(dict)을 길이 126 벡터로 변환.
    Left(63) + Right(63), 손 없으면 0으로.
    """
    L = [0.0] * 63
    Rv = [0.0] * 63

    for h in frame.get("hands", []):
        vec: list[float] = []

        for lm in h.get("landmarks", []):
            vec.extend([
                float(lm.get("x", 0.0)),
                float(lm.get("y", 0.0)),
                float(lm.get("z", 0.0)),
            ])

        # 63차원 맞추기 (부족하면 0패딩, 많으면 자르기)
        vec = (vec + [0.0] * 63)[:63]

        if h.get("handedness") == "Left":
            L = vec
        else:
            Rv = vec

    return L + Rv  # 길이 126


def enqueue_frames(session_id: str, frames: list[dict]) -> tuple[str, int]:
    """
    프론트에서 받은 frames(list[dict])를 flatten 해서
    (T,126) np.ndarray로 만든 뒤 npz(seq=...)로 저장.
    반환: (저장된 파일 경로, T)
    """
    # 어디에 저장할지: 환경변수 없으면 dataset/npz/recorded 사용
    base_dir = Path(os.getenv("SEQ_DATA_ROOT", "dataset/npz/recorded"))
    base_dir.mkdir(parents=True, exist_ok=True)

    vecs: list[list[float]] = [flatten_frame(f) for f in frames]
    if not vecs:
        raise ValueError("no frames")

    seq = np.asarray(vecs, dtype=np.float32)  # (T,126)
    T = int(seq.shape[0])

    ts = int(time.time() * 1000)
    fname = f"{session_id}_{ts}.npz"
    out_path = base_dir / fname

    np.savez(out_path, seq=seq)

    return str(out_path), T

# backend/test_inspect_recorded.py
from pathlib import Path
import numpy as np

from sign.gloss_model import infer_gloss_from_seq

REC = Path("dataset/npz/recorded/sess_1763646064052_1763649010078.npz")
ECO = Path("dataset/npz/recorded/209-예금2.npz")  # 잘 맞던 통장 샘플

def inspect_npz(path: Path, name: str):
    with np.load(path, allow_pickle=True) as z:
        print(f"[{name}] keys:", z.files)
        seq = z["seq"]
    print(f"[{name}] shape: {seq.shape}")
    print(f"[{name}] mean abs: {np.mean(np.abs(seq)):.4f}")
    print(f"[{name}] per-dim std: {np.std(seq, axis=0).mean():.4f}")
    return seq

def main():
    seq_rec = inspect_npz(REC, "recorded")
    seq_eco = inspect_npz(ECO, "eco_word")

    print("\n[recorded] inference:")
    print(infer_gloss_from_seq(seq_rec))

    print("\n[eco_word] inference:")
    print(infer_gloss_from_seq(seq_eco))

if __name__ == "__main__":
    main()

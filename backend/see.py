from pathlib import Path
import numpy as np
from sign.gloss_model import infer_gloss_from_seq

# 테스트용 npz 하나 골라서
npz_path = Path("dataset/npz/recorded/sess_1763846216722_1763849263388.npz")
z = np.load(npz_path, allow_pickle=True)
seq = z["seq"]   # (T,126)

print(infer_gloss_from_seq(seq, topk=5))
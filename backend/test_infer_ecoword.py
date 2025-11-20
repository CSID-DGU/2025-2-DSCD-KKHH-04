from pathlib import Path
import numpy as np
from sign.gloss_model import infer_gloss_from_seq

NPZ_PATH = Path("dataset/npz/recorded/209-예금.npz")  # 실제 경로로 바꿔줘

def main():
    with np.load(NPZ_PATH, allow_pickle=True) as z:
        print("keys:", z.files)
        seq = z["seq"]  # 키 이름 확인해서 맞춰줘

    print("shape:", seq.shape)
    result = infer_gloss_from_seq(seq)
    print(result)

if __name__ == "__main__":
    main()
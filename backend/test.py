import numpy as np
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent  # test.py가 있는 폴더(=backend)
npz_path = BASE_DIR / "dataset" / "npz" / "recorded" / "sess_1763618646489_1763618729949.npz"

z = np.load(npz_path)
print(z["seq"].shape)
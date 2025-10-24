import numpy as np
from pathlib import Path

PROCESSED = Path("processed")
SHARDS = Path("shards")
SHARDS.mkdir(exist_ok=True)

all_npz = list(PROCESSED.glob("*.npz"))
SHARD_SIZE = 100  # 50개씩 묶기 (필요하면 100으로 변경)

def chunked(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i+n]

for i, files in enumerate(chunked(all_npz, SHARD_SIZE)):
    X, y, names = [], [], []
    for f in files:
        data = np.load(f, allow_pickle=True)
        X.append(data["arr_0"])
        y.append(data["arr_1"])
        names.append(f.stem)
    out_path = SHARDS / f"shard-{i:05d}.npz"
    np.savez_compressed(out_path, X=X, y=y, names=names)
    print(f"묶음저장완료! {out_path.name} ({len(files)} samples)")

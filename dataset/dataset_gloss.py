import json
import numpy as np
import torch
from torch.utils.data import Dataset
from pathlib import Path

class GlossSeqDataset(Dataset):
    def __init__(self, root="dataset/processed", index_csv="index.csv", vocab_json="vocab.json", split="train", split_ratio=0.9, seed=42):
        self.root = Path(root)
        self.items = []
        with open(self.root / index_csv, "r", encoding="utf-8") as f:
            lines = f.read().strip().splitlines()[1:]
        rng = np.random.default_rng(seed)
        rng.shuffle(lines)
        n_train = int(len(lines)*split_ratio)
        if split=="train":
            use = lines[:n_train]
        else:
            use = lines[n_train:]

        self.items = []
        for line in use:
            _, file, label = line.split(",", 2)
            stem = Path(file).stem
            self.items.append((stem, label.strip().split()))

        with open(self.root / vocab_json, "r", encoding="utf-8") as f:
            vocab = json.load(f)["tokens"]
        self.token2id = {tok:i+1 for i,tok in enumerate(vocab)} # CTC용: 0은 blank로 예약한다고 가정
        self.blank_id = 0

    def __len__(self): return len(self.items)

    def __getitem__(self, idx):
        stem, tokens = self.items[idx]
        npz = np.load(self.root / f"{stem}.npz")
        seq = npz["seq"].astype(np.float32)   # [T,126]
        # 시퀀스 정규화(선택): 여기선 그대로 사용. 필요시 표준화/평균0분산1 적용 가능

        target = np.array([ self.token2id[t] for t in tokens ], dtype=np.int64) if tokens else np.array([], dtype=np.int64)
        return torch.from_numpy(seq), torch.from_numpy(target)

def collate_ctc(batch):
    # batch: List[(seq[T,126], target[L])]
    xs, ys = zip(*batch)
    lens_x = torch.tensor([x.shape[0] for x in xs], dtype=torch.int32)
    lens_y = torch.tensor([y.shape[0] for y in ys], dtype=torch.int32)
    X = torch.nn.utils.rnn.pad_sequence(xs, batch_first=True)   # [B, Tmax, 126]
    Y = torch.nn.utils.rnn.pad_sequence(ys, batch_first=True, padding_value=-1)  # [-1]는 무시용
    return X, lens_x, Y, lens_y

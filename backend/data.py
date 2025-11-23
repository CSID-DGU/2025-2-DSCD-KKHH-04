# ~/src/data.py
# -*- coding: utf-8 -*-

"""
데캡 공용 데이터/유틸 모듈

- vocab 포맷 2종 지원:
  (A) {"tokens": ["HELLO", "WORLD", ...]}
      → 0:<blank>, 1:<unk> 보장
  (B) {"<blank>":0, "<unk>":1, "HELLO":2, ...} (id-map)

- 공용 유틸:
  norm_name, diagnose_array, _to_numpy_2d,
  normalize_hands_frame, augment_seq

- Dataset/Collate:
  SignDataset (CTC/분류 공용) / collate_ctc

주의:
- 좌표는 프레임마다 normalize_hands_frame 적용(회전 정규화 OFF)
- 증강은 Tier A(아주 미세)만 적용, 학습 split에서만 on
"""
from __future__ import annotations

import json
import unicodedata
import re
import random
from pathlib import Path
from collections import defaultdict
from typing import Tuple, List

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset


# =========================================================
# vocab 로드 (두 포맷 지원)
# =========================================================

def load_vocab(vocab_path: Path) -> Tuple[List[str], dict]:
    """
    반환: (itos, stoi)
      - itos[i] = 토큰 문자열
      - stoi[token] = id(int)

    지원 포맷:
      1) {"tokens": [ ... ]}
      2) {"itos": [...], "stoi": {...}}
      3) {"stoi": {token: id, ...}}
      4) {"id_map": {token: id, ...}}
      5) {token: id, ...}  (id-map dict 그대로)
    """
    with open(vocab_path, "r", encoding="utf-8-sig") as f:
        obj = json.load(f)

    # -------------------------
    # 케이스 1) {"tokens": [...]}
    # -------------------------
    if isinstance(obj, dict) and "tokens" in obj:
        toks = list(obj["tokens"])

        # 0번은 항상 <blank>
        if len(toks) == 0 or toks[0] != "<blank>":
            # 혹시 기존 리스트 안에 <blank>가 들어있다면 제거 후 맨 앞에
            if "<blank>" in toks:
                toks.remove("<blank>")
            toks = ["<blank>"] + toks

        # 1번은 항상 <unk>
        if "<unk>" not in toks:
            toks.insert(1, "<unk>")
        else:
            # 이미 다른 위치에 있다면 1번 위치로 강제 이동
            if toks[1] != "<unk>":
                toks.remove("<unk>")
                toks.insert(1, "<unk>")

        itos = toks
        stoi = {t: i for i, t in enumerate(itos)}
        return itos, stoi

    # -------------------------
    # 케이스 2) {"itos": [...], "stoi": {...}} 또는 {"itos":[...]}
    #   - 우리가 만든 포맷 지원
    # -------------------------
    if isinstance(obj, dict) and ("itos" in obj or "stoi" in obj):
        raw_itos = obj.get("itos")
        raw_stoi = obj.get("stoi")

        if raw_itos is not None:
            # 리스트에서 복사
            itos = list(raw_itos)
            # 뒤쪽 빈 슬롯 제거
            while len(itos) > 0 and itos[-1] in ("", None):
                itos.pop()
        elif isinstance(raw_stoi, dict):
            # stoi만 있으면 id-map으로부터 itos 복원
            try:
                id_map = {str(k): int(v) for k, v in raw_stoi.items()}
            except Exception as e:
                raise ValueError(f"vocab stoi value must be int: {e}")
            max_id = max(id_map.values()) if id_map else -1
            itos = [""] * (max_id + 1)
            for tok, idx in id_map.items():
                if idx < 0:
                    raise ValueError(f"negative id for token {tok}: {idx}")
                if idx >= len(itos):
                    itos.extend([""] * (idx - len(itos) + 1))
                itos[idx] = tok
            # 뒤쪽 빈 슬롯 제거
            while len(itos) > 0 and itos[-1] in ("", None):
                itos.pop()
        else:
            raise ValueError("vocab with 'itos'/'stoi' must contain at least one of them properly.")

        # 0:<blank>, 1:<unk> 보정
        if len(itos) == 0:
            itos = ["<blank>", "<unk>"]
        else:
            # 0번 <blank> 강제
            if itos[0] != "<blank>":
                if "<blank>" in itos:
                    itos.remove("<blank>")
                itos.insert(0, "<blank>")

            # 1번 <unk> 강제
            if "<unk>" not in itos:
                if len(itos) == 1:
                    itos.append("<unk>")
                else:
                    itos.insert(1, "<unk>")
            else:
                if itos[1] != "<unk>":
                    itos.remove("<unk>")
                    itos.insert(1, "<unk>")

        stoi = {t: i for i, t in enumerate(itos)}
        return itos, stoi

    # -------------------------
    # 케이스 3) id-map 계열:
    #   - {"stoi":{...}} / {"id_map":{...}} / {token:id,...}
    # -------------------------
    if isinstance(obj, dict):
        # 먼저 안쪽에 있는 id-map 찾기
        if "stoi" in obj and isinstance(obj["stoi"], dict):
            id_src = obj["stoi"]
        elif "id_map" in obj and isinstance(obj["id_map"], dict):
            id_src = obj["id_map"]
        else:
            # 최상단 dict 자체가 id-map이라고 가정
            id_src = obj

        try:
            id_map = {str(k): int(v) for k, v in id_src.items()}
        except Exception as e:
            raise ValueError(f"vocab id-map value must be int: {e}")

        max_id = max(id_map.values()) if id_map else -1
        itos = [""] * (max_id + 1)
        for tok, idx in id_map.items():
            if idx < 0:
                raise ValueError(f"negative id for token {tok}: {idx}")
            if idx >= len(itos):
                itos.extend([""] * (idx - len(itos) + 1))
            itos[idx] = tok

        # 0:<blank>, 1:<unk> 보정
        if len(itos) == 0:
            itos = ["<blank>", "<unk>"]
        else:
            if itos[0] in ("", None):
                itos[0] = "<blank>"
            elif itos[0] != "<blank>":
                # 이미 다른 위치에 있다면 제거 후 0번으로
                if "<blank>" in itos:
                    itos.remove("<blank>")
                itos.insert(0, "<blank>")

            if "<unk>" not in itos:
                if len(itos) == 1:
                    itos.append("<unk>")
                elif itos[1] in ("", None):
                    itos[1] = "<unk>"
                else:
                    itos.insert(1, "<unk>")
            else:
                if itos[1] != "<unk>":
                    itos.remove("<unk>")
                    itos.insert(1, "<unk>")

        # 뒤쪽 빈 슬롯 제거
        while len(itos) > 0 and itos[-1] in ("", None):
            itos.pop()

        stoi = {t: i for i, t in enumerate(itos)}
        return itos, stoi

    # 어떤 케이스에도 안 걸리면 에러
    raise ValueError("vocab.json must be one of: {'tokens':[...]} / {'itos','stoi'} / id-map dict")


# =========================================================
# 공통 유틸
# =========================================================
def norm_name(s: str) -> str:
    """
    파일명/키 정규화: 경로/확장자 제거 + NFC + 공백/대시/언더스코어 정리
    """
    p = Path(str(s).strip())
    stem = Path(p.name).stem
    s = unicodedata.normalize("NFC", stem)
    s = re.sub(r"\s+", "", s)
    return s


def diagnose_array(x, max_elems: int = 8) -> str:
    try:
        arr = np.asarray(x)
    except Exception as e:
        return f"[diagnose] np.asarray 실패: {type(x)} / err={e}"
    lines = [f"[diagnose] type={type(x)}, asarray.dtype={getattr(arr, 'dtype', None)}, "
             f"ndim={getattr(arr, 'ndim', None)}, shape={getattr(arr, 'shape', None)}"]
    if isinstance(arr, np.ndarray) and arr.dtype == object and arr.ndim == 1:
        shapes, dts = [], []
        for i in range(min(len(arr), max_elems)):
            ei = arr[i]
            try:
                a = np.asarray(ei)
                shapes.append(tuple(a.shape))
                dts.append(str(a.dtype))
            except Exception as e:
                shapes.append(("asarray-fail",))
                dts.append(f"err:{e}")
        lines.append(f"[diagnose] object-array sample shapes={shapes}, dtypes={dts}")
    return "\n".join(lines)


def _to_numpy_2d(x) -> np.ndarray:
    """
    다양한 입력을 (T,F) float32로 강제.
    - 이미 (T,F) numeric ndarray면 그대로 반환
    - 숫자 2D로 바로 캐스팅 가능하면 캐스팅
    - (list of 1D vec) → stack
    """
    if isinstance(x, np.ndarray) and x.ndim == 2 and np.issubdtype(x.dtype, np.number):
        return x.astype(np.float32, copy=False)

    try:
        arr_obj = np.asarray(x, dtype=object)
    except Exception:
        raise ValueError("np.asarray(object) 실패\n" + diagnose_array(x))

    # 숫자 2D로 곧장 가능한지 재시도
    try:
        arr_num = np.asarray(x)
        if getattr(arr_num, "ndim", None) == 2 and np.issubdtype(arr_num.dtype, np.number):
            return arr_num.astype(np.float32, copy=False)
    except Exception:
        pass

    # (list of 1D) 처리
    if not (isinstance(arr_obj, np.ndarray) and arr_obj.dtype == object and arr_obj.ndim == 1):
        raise ValueError("2D로 변환 불가한 형태\n" + diagnose_array(x))

    frames, bad = [], []
    for i, ei in enumerate(arr_obj.tolist()):
        try:
            ei_arr = np.asarray(ei)
        except Exception as e:
            bad.append((i, f"asarray-fail:{e}"))
            continue
        if not np.issubdtype(ei_arr.dtype, np.number):
            bad.append((i, f"non-numeric dtype={ei_arr.dtype}"))
            continue
        if ei_arr.ndim == 1:
            vec = ei_arr
        elif ei_arr.ndim == 2 and 1 in ei_arr.shape:
            vec = ei_arr.reshape(-1)  # (1,F) 또는 (F,1) 허용
        else:
            bad.append((i, f"ndim={ei_arr.ndim}, shape={ei_arr.shape}"))
            continue
        frames.append(vec.astype(np.float32, copy=False))

    if bad:
        msg = "\n".join([f"  - idx {i}: {why}" for i, why in bad[:10]])
        raise ValueError(f"object 배열 요소를 벡터로 변환 실패 (상위 10개):\n{msg}\n요약:\n{diagnose_array(x)}")

    lens = {v.shape[0] for v in frames}
    if len(lens) != 1:
        ex = [(i, frames[i].shape) for i in range(min(len(frames), 10))]
        raise ValueError(f"프레임 길이(F) 불일치: {sorted(list(lens))}\n예시(상위 10개): {ex}\n요약:\n{diagnose_array(x)}")

    try:
        out = np.stack(frames, axis=0).astype(np.float32, copy=False)
    except Exception as e:
        raise ValueError(f"np.stack 실패: {e}\n" + diagnose_array(x))
    return out


# =========================================================
# 좌표 정규화 (회전 정규화는 OFF)
# =========================================================
def _normalize_one_hand(hand_flat: np.ndarray) -> np.ndarray:
    """
    입력: hand_flat (63=21*3)
    처리:
      1) 손목(0) 기준 평행이동
      2) 중지 MCP(9) 길이로 스케일 정규화
      3) (옵션) 회전 정규화 - 기본 OFF
    """
    h = hand_flat.reshape(21, 3).copy()
    if np.allclose(h, 0):
        return hand_flat  # 빈 손(검출 실패)은 그대로

    # 1) 손목 기준 이동
    wrist_xy = h[0, :2]
    h[:, :2] -= wrist_xy

    # 2) 중지 MCP 길이로 스케일 정규화
    ref_xy = h[9, :2]
    scale = float(np.linalg.norm(ref_xy)) + 1e-6
    h[:, :2] /= scale

    # 3) (옵션) 회전 정규화 (기본 OFF)
    # ang = np.arctan2(ref_xy[1], ref_xy[0])
    # ca, sa = np.cos(-ang), np.sin(-ang)
    # R = np.array([[ca, -sa], [sa, ca]], dtype=np.float32)
    # h[:, :2] = h[:, :2] @ R.T

    return h.reshape(-1)


def normalize_hands_frame(frame_flat: np.ndarray) -> np.ndarray:
    """
    frame_flat: (F,) - 보통 F=126 (좌/우 21x3씩)
    """
    F = frame_flat.shape[0]
    if F < 126:
        return frame_flat
    L = frame_flat[:63]
    R = frame_flat[63:126]
    Ln = _normalize_one_hand(L)
    Rn = _normalize_one_hand(R)
    out = np.concatenate([Ln, Rn], axis=0)
    if F > 126:  # 추가 피처가 붙어있다면 그대로 뒤에 유지
        out = np.concatenate([out, frame_flat[126:]], axis=0)
    return out


# =========================================================
# Tier A 증강: 아주 미세한 시간 워핑 + 아주 약한 기하 지터
# =========================================================
def _time_warp(seq_tf: np.ndarray, low=0.98, high=1.02, min_frames: int = 12) -> np.ndarray:
    """
    선형 보간 기반의 미세 시간 워핑.
    - 길이를 s배로 리샘플하되, 너무 짧아지지 않도록 최소 프레임 보장.
    """
    T, F = seq_tf.shape
    if T < 2:
        return seq_tf

    s = float(np.random.uniform(low, high))
    new_T = int(round(T * s))
    new_T = max(new_T, min_frames)
    if new_T == T:
        return seq_tf

    src_t = np.linspace(0, T - 1, num=T, dtype=np.float32)
    dst_t = np.linspace(0, T - 1, num=new_T, dtype=np.float32)

    out = np.empty((new_T, F), dtype=np.float32)
    for f in range(F):
        out[:, f] = np.interp(dst_t, src_t, seq_tf[:, f])
    return out


def _augment_one_hand_xy(hand63: np.ndarray, rot_deg: float, trans: float, scale_jit: float) -> np.ndarray:
    """
    hand63: (63,) = 21*3
    - xy에만 아주 약한 평행/스케일/회전(기본 0도) 적용
    """
    h = hand63.reshape(21, 3).copy()

    # 스케일/이동은 정규화된 좌표 기준의 아주 작은 지터
    # scale: 0.98~1.02, translate: ±0.02
    if scale_jit > 0:
        s = 1.0 + np.random.uniform(-scale_jit, scale_jit)
        h[:, :2] *= s

    if trans > 0:
        tx = np.random.uniform(-trans, trans)
        ty = np.random.uniform(-trans, trans)
        h[:, 0] += tx
        h[:, 1] += ty

    # 회전은 기본 OFF(=0). 필요시 3~5도 이내.
    if rot_deg and rot_deg > 0:
        ang = np.deg2rad(np.random.uniform(-rot_deg, rot_deg))
        ca, sa = np.cos(ang), np.sin(ang)
        R = np.array([[ca, -sa], [sa, ca]], dtype=np.float32)
        h[:, :2] = h[:, :2] @ R.T

    return h.reshape(-1)


def _augment_frame_xy(frame_flat: np.ndarray, rot_deg: float = 0.0, trans: float = 0.02, scale_jit: float = 0.02) -> np.ndarray:
    """
    프레임 단위 기하 증강(아주 약하게).
    - 좌/우 손 각각에 적용(존재할 경우)
    - 회전은 기본 0도(OFF)
    """
    F = frame_flat.shape[0]
    if F < 126:
        return frame_flat

    L = frame_flat[:63]
    R = frame_flat[63:126]
    Ln = _augment_one_hand_xy(L, rot_deg=rot_deg, trans=trans, scale_jit=scale_jit)
    Rn = _augment_one_hand_xy(R, rot_deg=rot_deg, trans=trans, scale_jit=scale_jit)
    out = np.concatenate([Ln, Rn], axis=0)
    if F > 126:
        out = np.concatenate([out, frame_flat[126:]], axis=0)
    return out


def augment_seq(seq_tf: np.ndarray) -> np.ndarray:
    """
    Tier A 증강 조합:
      1) 시간 워핑: 0.98~1.02 (미세)
      2) 프레임별 기하 지터: 평행 ±0.02, 스케일 지터 0.02, 회전 0도(OFF)
    프레임 드롭은 사용하지 않음.
    """
    # 1) 시간 워핑(미세)
    x = _time_warp(seq_tf, low=0.98, high=1.02, min_frames=12)

    # 2) 프레임별 아주 약한 기하 지터
    x = np.apply_along_axis(_augment_frame_xy, 1, x, rot_deg=0.0, trans=0.02, scale_jit=0.02)
    return x


# =========================================================
# Dataset (CTC/단어 공용)
# =========================================================
class SignDataset(Dataset):
    def __init__(
        self,
        data_root,
        split: str = "train",          # "train" | "valid" | "all"
        csv_name: str = "labels.csv",
        vocab_json: str = "vocab.json",
        npz_subdir: str = "npz/eco",
        in_dim_override: int | None = None,
        split_ratio: float = 0.9,      # train 비율
        seed: int = 42,
        shuffle: bool = True,          # 인덱스 섞기 여부
        stratify: bool = False,        # 라벨 보존 분할
        augment: bool = False,         # 학습에서만 권장
        aug_seed: int | None = None,   # 증강 랜덤시드(재현성)
        verbose: bool = True,
    ):
        self.root = Path(data_root)
        self.per_sample_dir = self.root / npz_subdir
        self.in_dim_override = in_dim_override

        # labels.csv: must contain 'file','label'
        self.df = pd.read_csv(self.root / csv_name)
        self.df.columns = [c.strip().lower() for c in self.df.columns]
        assert "file" in self.df.columns and "label" in self.df.columns, "CSV must have 'file','label' cols"

        # 표준화
        self.df["file_norm"] = self.df["file"].map(norm_name)
        self.df["label"] = self.df["label"].astype(str).map(str.strip)

        # vocab
        self.itos, self.stoi = load_vocab(self.root / vocab_json)

        # 존재 확인
        def exists(name: str) -> bool:
            return (self.per_sample_dir / f"{name}.npz").exists()

        before = len(self.df)
        self.df = self.df[self.df["file_norm"].map(exists)].reset_index(drop=True)
        after = len(self.df)
        if verbose:
            print(f"[SignDataset] kept {after}/{before} rows after existence check")

        # 분할
        n = len(self.df)
        idx = np.arange(n)
        rng = np.random.default_rng(seed)
        if shuffle:
            rng.shuffle(idx)

        if split == "all":
            use_idx = idx
        elif stratify and split in ("train", "valid"):
            groups = defaultdict(list)
            for i in idx:
                groups[self.df.iloc[i]["label"]].append(i)

            train_idx, valid_idx = [], []
            for g_idx in groups.values():
                if shuffle:
                    rng.shuffle(g_idx)
                cut = int(len(g_idx) * float(split_ratio))
                if len(g_idx) <= 1:
                    train_idx.extend(g_idx)
                else:
                    train_idx.extend(g_idx[:cut])
                    valid_idx.extend(g_idx[cut:])
            use_idx = train_idx if split == "train" else valid_idx
        else:
            cut = int(n * float(split_ratio))
            if split == "train":
                use_idx = idx[:cut]
            elif split == "valid":
                use_idx = idx[cut:]
            else:
                raise ValueError(f"unknown split: {split}")

        self.df = self.df.iloc[list(use_idx)].reset_index(drop=True)

        # 증강 사용 여부(Tier A): 학습(split in {"train","all"})에서만 켜도록 권장
        self.do_aug = bool(augment) and (split in ("train", "all"))

        # 증강 랜덤 시드 (선택)
        self.aug_seed = aug_seed
        if self.do_aug and self.aug_seed is not None:
            random.seed(self.aug_seed)
            np.random.seed(self.aug_seed)

        if verbose:
            info = f"split='{split}'"
            if split in ("train", "valid"):
                info += f", split_ratio={split_ratio}, stratify={stratify}"
            info += f", augment={'ON' if self.do_aug else 'OFF'}"
            if self.do_aug and self.aug_seed is not None:
                info += f", aug_seed={self.aug_seed}"
            print(f"[SignDataset] {info} → {len(self.df)} samples")

    def __len__(self):
        return len(self.df)

    # ---- 내부 I/O ----
    def _load_per_sample_npz(self, name: str) -> np.ndarray:
        path = self.per_sample_dir / f"{name}.npz"
        with np.load(path, allow_pickle=True) as z:
            if "seq" in z:
                raw = z["seq"]
            elif "x" in z:
                raw = z["x"]
            else:
                keys = [k for k in z.files if isinstance(z[k], np.ndarray)]
                if not keys:
                    raise ValueError(f"{path.name}: no ndarray keys")
                raw = z[keys[0]]
        arr = _to_numpy_2d(raw)     # (T,F) float32
        return arr

    def __getitem__(self, i):
        """
        반환: (arr(float32[T,F]), y(LongTensor[1] or [L]))
        - 실패 시 None 반환 → collate_ctc에서 걸러짐
        - label에 공백 포함 시 다중 토큰 시퀀스로 취급(CTC 학습 호환)
        """
        row = self.df.iloc[i]
        name = row["file_norm"]
        label = str(row["label"])

        try:
            arr = self._load_per_sample_npz(name)      # (T,F)
        except Exception as e:
            print(f"[WARN] load fail {name}.npz : {e}")
            return None

        # 프레임별 좌표 정규화
        try:
            arr = np.apply_along_axis(normalize_hands_frame, 1, arr)
        except Exception as e:
            print(f"[WARN] normalize fail {name}.npz : {e}")

        # Tier A 증강(학습 시에만)
        if self.do_aug:
            try:
                # (옵션) 샘플 기준 시드 변조
                if self.aug_seed is not None:
                    seed_i = (self.aug_seed * 1315423911 + i) & 0xFFFFFFFF
                    random.seed(seed_i)
                    np.random.seed(seed_i)
                arr = augment_seq(arr)
            except Exception as e:
                print(f"[WARN] augment fail {name}.npz : {e}")

        # in-dim 강제 필터
        if self.in_dim_override and arr.shape[1] != self.in_dim_override:
            return None

        # 라벨 → 토큰 id (단어=길이1, 문장=공백 split)
        toks = label.split()
        if len(toks) <= 1:
            idx = self.stoi.get(label, None)
            if idx is None or idx == 0:
                idx = self.stoi.get("<unk>", 1)
            y = torch.tensor([idx], dtype=torch.long)
        else:
            ids = [self.stoi.get(t, self.stoi.get("<unk>", 1)) for t in toks]
            y = torch.tensor(ids, dtype=torch.long)

        return (arr, y)


# =========================================================
# Collate (방탄판: None/불량 샘플 제거 + 패딩)
# =========================================================
def collate_ctc(batch):
    """
    반환: xpad[B, T_max, F] float32,
          ycat[sum_B] long,
          x_lens[B] int32,
          y_lens[B] int32,
          pad_mask[B, T_max] bool  (True=pad, False=valid)
    """
    # 0) None/불량 제거
    clean = []
    for item in batch:
        if item is None:
            continue
        if not isinstance(item, (tuple, list)) or len(item) < 2:
            continue
        x, y = item[0], item[1]
        try:
            x = _to_numpy_2d(x)
        except Exception:
            continue

        # y는 텐서/ndarray/스칼라 허용 → LongTensor 1D로 보정
        if isinstance(y, torch.Tensor):
            y_t = y.reshape(-1).to(torch.long)
        elif isinstance(y, np.ndarray):
            y_t = torch.from_numpy(y.reshape(-1)).to(torch.long)
        else:
            y_t = torch.tensor([int(y)], dtype=torch.long)

        clean.append((x, y_t))

    if not clean:
        raise RuntimeError("All samples in this batch are invalid/None")

    xs, ys = zip(*clean)  # xs: list[np.ndarray(T,F)], ys: list[LongTensor]
    T_list = [x.shape[0] for x in xs]
    F = xs[0].shape[1]
    maxT = max(T_list)
    B = len(xs)

    # 1) X 패딩
    xpad = torch.zeros(B, maxT, F, dtype=torch.float32)
    pad_mask = torch.ones(B, maxT, dtype=torch.bool)
    for i, x in enumerate(xs):
        t = x.shape[0]
        xpad[i, :t] = torch.from_numpy(x)
        pad_mask[i, :t] = False

    # 2) y 합치기 (CTC target은 1D LongTensor)
    ycat = torch.cat(ys, dim=0)  # [sum_B]
    x_lens = torch.tensor(T_list, dtype=torch.int32)
    y_lens = torch.tensor([y.numel() for y in ys], dtype=torch.int32)

    return xpad, ycat, x_lens, y_lens, pad_mask

# sign/gloss_model.py  (단어학습 eco_word_1000_closed.pt 전용)
import time
from pathlib import Path
import numpy as np
import torch

from models import HybridBackbone, WordClassifier
from data import normalize_hands_frame  # frame 정규화 (학습과 동일)


# ========= 경로 설정 ============
BASE_DIR = Path(__file__).resolve().parent.parent

CKPT_PATH = BASE_DIR / "runs" / "recorded_word.pt"
# 필요하면 나중에 쓸 수 있게만 둠 (필수 X)
WORD_ROOT = BASE_DIR / "dataset" / "npz" / "recorded"
VOCAB_JSON = WORD_ROOT / "vocab_recorded.json"


# ========= 전역 객체 ============
_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
_model = None
_id2token = None


def _load_model_if_needed():
    global _model, _id2token

    if _model is not None:
        return

    # 1) ckpt 로드
    ckpt = torch.load(CKPT_PATH, map_location="cpu")
    state = ckpt["model"]

    # 2) vocab은 ckpt에서 꺼내기 (가장 안전한 방법)
    itos = ckpt.get("vocab", None)
    if itos is None:
        raise RuntimeError("ckpt 안에 'vocab' 키가 없습니다. 학습 스크립트를 확인해주세요.")

    _id2token = {i: tok for i, tok in enumerate(itos)}
    V = len(itos)

    # 3) backbone 설정 추출
    in_dim = ckpt.get("in_dim", 126)
    hid = ckpt.get("hid", 256)
    depth = ckpt.get("depth", 6)           # ckpt에 없으면 기본값
    nhead = ckpt.get("nhead", 4)
    p = ckpt.get("p", 0.1)
    subsample_stages = ckpt.get("subsample_stages", 1)

    backbone = HybridBackbone(
        in_dim=in_dim,
        hid=hid,
        depth=depth,
        nhead=nhead,
        p=p,
        subsample_stages=subsample_stages,
    )
    model = WordClassifier(backbone, vocab_size=V)
    model.load_state_dict(state)

    model.to(_device)
    model.eval()
    _model = model

    print(
        f"[gloss_model(word)] loaded {CKPT_PATH.name}, "
        f"V={V}, in_dim={in_dim}, hid={hid}, depth={depth}, "
        f"nhead={nhead}, subsample={subsample_stages}"
    )


def infer_gloss_from_seq(seq_tf: np.ndarray, topk: int = 3):
    """
    단어 모델: 한 seq -> 한 단어 분류 (Top-K 반환)
    """
    _load_model_if_needed()
    assert _model is not None

    # numpy 변환
    if not isinstance(seq_tf, np.ndarray):
        seq_tf = np.asarray(seq_tf, dtype=np.float32)
    else:
        seq_tf = seq_tf.astype(np.float32, copy=False)

    # (T,F) 체크
    if seq_tf.ndim != 2:
        raise ValueError(f"seq_tf는 (T,F) 2D여야 합니다. 현재 shape={seq_tf.shape}")

    # 정규화
    seq_tf = np.apply_along_axis(normalize_hands_frame, 1, seq_tf).astype(np.float32)

    x = torch.from_numpy(seq_tf).unsqueeze(0).to(_device)  # [1,T,F]

    t0 = time.time()
    with torch.inference_mode():
        logits = _model(x)              # [1,V]
        probs = torch.softmax(logits, dim=-1)[0].cpu().numpy()

    dt_ms = (time.time() - t0) * 1000.0

    # Top-K
    K = min(topk, probs.shape[0])
    topk_ids = probs.argsort()[::-1][:K]
    topk_tokens = [_id2token[i] for i in topk_ids]
    topk_probs = [float(probs[i]) for i in topk_ids]

    return {
        "topk_tokens": topk_tokens,
        "topk_ids": topk_ids.tolist(),
        "topk_probs": topk_probs,
        "time_ms": round(dt_ms, 2),
    }

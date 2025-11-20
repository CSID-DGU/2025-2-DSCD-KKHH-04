# ~/src/models.py
# -*- coding: utf-8 -*-
import math
import torch
import torch.nn as nn
import torch.nn.functional as F

# ----------------------------
# Helpers (length / mask DS)
# ----------------------------
def down_len(T: torch.Tensor, stages: int) -> torch.Tensor:
    """
    입력 길이 텐서 T에 대해 stride-2를 stages번 적용했을 때의 길이(ceil 규칙).
    T: int64/long 텐서 [B] 또는 스칼라
    """
    out = T.clone()
    for _ in range(int(stages)):
        out = (out + 1) // 2
    return out

def downsample_pad_mask(mask: torch.Tensor, stages: int) -> torch.Tensor:
    """
    mask: [B,T] (True=pad). stride-2를 stages번 적용.
    두 프레임 모두 pad일 때만 pad 유지(Logical AND).
    """
    import torch.nn.functional as F
    m = mask
    for _ in range(int(stages)):
        a, b = m[:, ::2], m[:, 1::2]
        if b.size(1) != a.size(1):
            b = F.pad(b, (0, 1), value=True)
        m = torch.logical_and(a, b)
    return m

# ----------------------------
# TCN
# ----------------------------
class TCNBlock(nn.Module):
    def __init__(self, c_in, c_out, k=5, d=1, p=0.1):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv1d(c_in, c_out, kernel_size=k, dilation=d, padding=d*(k//2), bias=False),
            nn.BatchNorm1d(c_out),
            nn.ReLU(inplace=True),
            nn.Dropout(p),
            nn.Conv1d(c_out, c_out, kernel_size=k, dilation=d, padding=d*(k//2), bias=False),
            nn.BatchNorm1d(c_out),
            nn.ReLU(inplace=True),
        )
        self.down = (nn.Conv1d(c_in, c_out, 1) if c_in != c_out else nn.Identity())

    def forward(self, x):  # x: [B,C,T]
        return self.net(x) + self.down(x)

class TCNEncoder(nn.Module):
    def __init__(self, in_dim, hid=256, depth=3, p=0.1):
        super().__init__()
        layers, c_in = [], in_dim
        for i in range(depth):
            c_out = hid
            d = 2 ** i
            layers.append(TCNBlock(c_in, c_out, k=5, d=d, p=p))
            c_in = c_out
        self.net = nn.Sequential(*layers)

    def forward(self, x):  # [B,T,F]
        h = self.net(x.transpose(1, 2))   # [B,H,T]
        return h.transpose(1, 2)          # [B,T,H]

# ----------------------------
# Positional Encoding
# ----------------------------
class PositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=20000):
        super().__init__()
        pe = torch.zeros(max_len, d_model)
        pos = torch.arange(0, max_len, dtype=torch.float32).unsqueeze(1)
        div = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0)/d_model))
        pe[:, 0::2] = torch.sin(pos * div)
        pe[:, 1::2] = torch.cos(pos * div)
        self.register_buffer("pe", pe)

    def forward(self, x):  # [B,T,D]
        return x + self.pe[:x.size(1)].unsqueeze(0)

# ----------------------------
# Conv subsample (configurable)
# ----------------------------
class ConvSubsample(nn.Module):
    """
    T → ceil(T / 2^stages) via stride-2 × stages
    기본 stages=1 → 1/2T, stages=2 → 1/4T
    """
    def __init__(self, in_dim, hid, stages: int = 1):
        super().__init__()
        layers = []
        c_in = in_dim
        for _ in range(stages):
            layers += [
                nn.Conv1d(c_in, hid, kernel_size=5, stride=2, padding=2),
                nn.ReLU(inplace=True),
            ]
            c_in = hid
        self.net = nn.Sequential(*layers)
        self.stages = int(stages)

    def forward(self, x):  # [B,T,H]
        h = self.net(x.transpose(1, 2))
        return h.transpose(1, 2)  # [B,T',H]

# ----------------------------
# Hybrid Backbone (TCN + TFM)
# ----------------------------
class HybridBackbone(nn.Module):
    """
    공통 백본: TCN → ConvSubsample(×stages) → Transformer
    출력: [B, T', H],  T' ≈ ceil(T / 2^stages)
    """
    def __init__(self, in_dim, hid=256, depth=6, nhead=4, p=0.1, subsample_stages: int = 1):
        super().__init__()
        tcn_depth = max(1, depth // 2)
        tfm_depth = max(1, depth - tcn_depth)

        self.hid = hid
        self.subsample_stages = int(subsample_stages)

        self.tcn = TCNEncoder(in_dim=in_dim, hid=hid, depth=tcn_depth, p=p)
        self.sub = ConvSubsample(hid, hid, stages=self.subsample_stages)

        layer = nn.TransformerEncoderLayer(
            d_model=hid, nhead=nhead, batch_first=True,
            dim_feedforward=hid*4, dropout=p, activation="gelu"
        )
        self.pe = PositionalEncoding(hid)
        self.tfm = nn.TransformerEncoder(layer, num_layers=tfm_depth)

    def forward(self, x, src_key_padding_mask=None):  # x:[B,T,F], mask:[B,T] (True=pad)
        h = self.tcn(x)  # [B,T,H]
        h = self.sub(h)  # [B,T',H]
        m = None
        if src_key_padding_mask is not None:
            m = downsample_pad_mask(src_key_padding_mask, self.subsample_stages)  # [B,T']
            m = m[:, :h.size(1)]
            if m.device != h.device:
                m = m.to(h.device)
        h = self.tfm(self.pe(h), src_key_padding_mask=m)  # [B,T',H]
        return h

# ----------------------------
# Heads
# ----------------------------
class StatsPooling(nn.Module):
    def forward(self, x, mask=None):  # x: [B,T',H], mask: [B,T'] True=pad
        if mask is not None:
            valid = ~mask
            lens = valid.sum(dim=1, keepdim=True).clamp(min=1)  # [B,1]
            x_masked = x.masked_fill(mask.unsqueeze(-1), 0.0)
            mean = x_masked.sum(dim=1) / lens                    # [B,H]
            var = ((x_masked - mean.unsqueeze(1))**2).masked_fill(mask.unsqueeze(-1), 0.0).sum(dim=1) / lens
            std = torch.sqrt(var + 1e-6)                         # [B,H]
        else:
            mean = x.mean(dim=1)
            std = x.std(dim=1)
        return torch.cat([mean, std], dim=-1)                    # [B,2H]

class WordClassifier(nn.Module):
    """
    백본 출력 [B,T',H] → StatsPooling(Mean⊕Std) → Linear(2H,V)
    """
    def __init__(self, backbone: HybridBackbone, vocab_size: int):
        super().__init__()
        self.backbone = backbone
        self.pool = StatsPooling()
        self.fc = nn.Linear(backbone.hid * 2, vocab_size)

    def forward(self, x, src_key_padding_mask=None):  # x:[B,T,F]
        h = self.backbone(x, src_key_padding_mask=src_key_padding_mask)  # [B,T',H]
        m = None
        if src_key_padding_mask is not None:
            m = downsample_pad_mask(src_key_padding_mask, self.backbone.subsample_stages)
            m = m[:, :h.size(1)].to(h.device)
        z = self.pool(h, mask=m)                         # [B,2H]
        logits = self.fc(z)                              # [B,V]
        return logits

class SentenceCTC(nn.Module):
    """
    백본 출력 [B,T',H] → Linear(H,V) → CTC
    """
    def __init__(self, backbone: HybridBackbone, vocab_size: int):
        super().__init__()
        self.backbone = backbone
        self.proj = nn.Linear(backbone.hid, vocab_size)

    def forward(self, x, src_key_padding_mask=None):  # [B,T,F]
        h = self.backbone(x, src_key_padding_mask=src_key_padding_mask)  # [B,T',H]
        return self.proj(h)  # [B,T',V]

# ----------------------------
# Transfer utility
# ----------------------------
def load_backbone_from_word_ckpt(backbone: HybridBackbone, ckpt_path: str):
    """
    단어 분류 체크포인트(.pt/.pth)에서 'backbone.*' 가중치만 로드.
    """
    ck = torch.load(ckpt_path, map_location="cpu")
    state = ck["model"] if isinstance(ck, dict) and "model" in ck else ck
    bb = {k.split("backbone.", 1)[1]: v for k, v in state.items() if k.startswith("backbone.")}
    missing, unexpected = backbone.load_state_dict(bb, strict=False)
    return missing, unexpected


def downsample_boundary_labels(bnd: torch.Tensor, stages: int) -> torch.Tensor:
    """
    boundary 라벨을 ConvSubsample 횟수(stages)에 맞게 줄여주는 함수.
    - bnd: [B,T] int64, 값: 0=NONE, 1=START, 2=END
    - stages=0 이면 ConvSubsample을 안 쓴다는 뜻 → 그대로 반환
    """
    if stages <= 0:
        return bnd  # 지금 우리 문장 CTC 설정에서는 항상 여기로 옴

    m = bnd
    for _ in range(int(stages)):
        a = m[:, ::2]   # 짝수 프레임
        b = m[:, 1::2]  # 홀수 프레임
        if b.size(1) != a.size(1):
            # 길이가 홀수인 경우 마지막 하나를 0(NONE)으로 패딩
            b = F.pad(b, (0, 1), value=0)
        # 최대값 사용: 0<NONE < 1<START < 2<END
        m = torch.maximum(a, b)
    return m  # [B, ceil(T / 2^stages)]


class SentenceCTCWithBoundary(nn.Module):
    """
    문장 CTC + Boundary Head
    - backbone: HybridBackbone
    - CTC head: proj(H -> vocab_size)
    - Boundary head: boundary_head(H -> 3)  # 0:none,1:start,2:end
    """
    def __init__(self, backbone: HybridBackbone, vocab_size: int, boundary_classes: int = 3):
        super().__init__()
        self.backbone = backbone
        self.proj = nn.Linear(backbone.hid, vocab_size)
        self.boundary_head = nn.Linear(backbone.hid, boundary_classes)
        self.boundary_classes = boundary_classes

    def forward(self, x, src_key_padding_mask=None):
        """
        x: [B,T,F]
        src_key_padding_mask: [B,T] (True = pad)
        return:
          - ctc_logits:      [B,T',V]
          - boundary_logits: [B,T',C]
        """
        h = self.backbone(x, src_key_padding_mask=src_key_padding_mask)  # [B,T',H]
        ctc_logits = self.proj(h)                # [B,T',V]
        boundary_logits = self.boundary_head(h)  # [B,T',C]
        return ctc_logits, boundary_logits
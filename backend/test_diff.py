import numpy as np
from pathlib import Path

# 폴더 경로 네 환경에 맞게 확인
REC_DIR = Path("recorded")
WORD_DIR = Path("label")


def compute_stats_from_seq(seq: np.ndarray):
    """
    seq: [T, 126] (21포인트 × 2손 × xyz)
    -> x,y 분포 통계 계산
    """
    xyz = seq.reshape(-1, 42, 3)  # [T, 42, 3]
    x = xyz[:, :, 0]
    y = xyz[:, :, 1]
    z = xyz[:, :, 2]

    stats = {
        "mean_x": x.mean(),
        "mean_y": y.mean(),
        "std_x": x.std(),
        "std_y": y.std(),
        "centroid_x": x.mean(axis=1).mean(),
        "centroid_y": y.mean(axis=1).mean(),
        "scale_xy": (x.std(axis=1).mean() + y.std(axis=1).mean()) / 2,
    }
    return stats


def print_diff(gloss: str, rec_stats: dict, train_stats: dict):
    print(f"\n==================== {gloss} ====================")
    for k in rec_stats.keys():
        r = rec_stats[k]
        t = train_stats[k]
        diff = r - t
        print(f"{k:12s} | rec={r:.6f} | train={t:.6f} | diff={diff:+.6f}")
    print("=======================================================")


def compare_one_gloss(gloss: str):
    """
    recorded/가계소득.npz
    vs
    datasets/word/xxx-가계소득.npz
    한 쌍만 비교
    """
    rec_path = REC_DIR / f"{gloss}.npz"
    if not rec_path.exists():
        print(f"[SKIP] recorded에 {gloss}.npz 없음")
        return

    # 숫자-글로스.npz 패턴 찾기
    candidates = list(WORD_DIR.glob(f"*-{gloss}.npz"))
    if not candidates:
        print(f"[SKIP] word에 *-{gloss}.npz 없음")
        return

    train_path = candidates[0]  # 여러 개면 첫 번째 사용

    rec_seq = np.load(rec_path, allow_pickle=True)["seq"]
    train_seq = np.load(train_path, allow_pickle=True)["seq"]

    rec_stats = compute_stats_from_seq(rec_seq)
    train_stats = compute_stats_from_seq(train_seq)

    print_diff(gloss, rec_stats, train_stats)


if __name__ == "__main__":
    for rec_file in REC_DIR.glob("*.npz"):
        gloss_name = rec_file.stem   # "가계소득"
        compare_one_gloss(gloss_name)


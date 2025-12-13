# backend/sign/log_utils.py
from pathlib import Path
from django.conf import settings
import csv, json, datetime

LOG_PATH = Path(settings.BASE_DIR) / "logs" / "e2e_sps_log.csv"

def append_e2e_log(
    eval_id: str,
    session_id: str,
    gloss_tokens: list[str],
    sent_pred: str,
    elapsed_sec: float,          # ★ 추가: 총 소요 시간
    meta: dict | None = None,
):
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    is_new = not LOG_PATH.exists()

    with LOG_PATH.open("a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if is_new:
            writer.writerow([
                "time", "eval_id", "session_id",
                "gloss_pred", "sent_pred",
                "elapsed_sec", "meta",
            ])
        writer.writerow([
            datetime.datetime.now().isoformat(timespec="seconds"),
            eval_id,
            session_id,
            " ".join(gloss_tokens),
            sent_pred,
            f"{elapsed_sec:.4f}",  # 초 단위
            json.dumps(meta, ensure_ascii=False) if meta else "",
        ])

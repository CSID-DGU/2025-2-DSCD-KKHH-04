# pipelines/views_metrics.py

import json
from pathlib import Path
from django.conf import settings
from django.http import JsonResponse


# pipeline.py가 있는 폴더 기준
PIPELINES_ROOT = Path(__file__).resolve().parent
SNAPSHOT_DIR = PIPELINES_ROOT / "snapshots" / "delta_backend"


def list_snapshots(request):
    """
    snapshots/delta_backend/*.json 파일을 읽어서
    프론트엔드에 리스트로 내려주는 API
    """
    if not SNAPSHOT_DIR.exists():
        return JsonResponse([], safe=False)

    items = []
    # 최신 순 or 오래된 순 정렬 원하면 여기 조절
    json_files = sorted(SNAPSHOT_DIR.glob("*.json"))

    # 너무 많이 쌓일 수 있으니 최근 200개 정도만
    json_files = json_files[-200:]

    for path in json_files:
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            items.append(data)
        except Exception:
            # 깨진 파일 있으면 그냥 스킵
            continue

    return JsonResponse(items, safe=False)

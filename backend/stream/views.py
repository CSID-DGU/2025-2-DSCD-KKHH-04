from django.shortcuts import render

# HTTP 테스트용 엔드포인트

# stream/views.py
import json
from django.http import JsonResponse, HttpResponseBadRequest
from core.ingest_service import enqueue_frames

def ingest_seq(request):
    if request.method != "POST":
        return HttpResponseBadRequest("POST only")
    try:
        # JSON 바디: { session_id, fps, frames: [ {ts, hands:[...]} ] }
        data = json.loads(request.body.decode("utf-8"))
        session_id = data["session_id"]
        frames = data["frames"]
        enqueue_frames(session_id, frames)
        return JsonResponse({"ok": True, "n": len(frames)})
    except Exception as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=400)

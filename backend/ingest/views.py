from django.shortcuts import render
# ingest/views.py
from __future__ import annotations
import json
from pathlib import Path
from django.http import JsonResponse, HttpRequest
from django.views.decorators.csrf import csrf_exempt

from .seq_ingest_utils import Landmark, Hand, Frame, SeqPayload, save_seq_payload

DATA_DIR = Path("./")  # 원하는 경로


@csrf_exempt
def ingest_seq(request: HttpRequest):
  if request.method != "POST":
      return JsonResponse({"ok": False, "error": "POST only"}, status=405)

  try:
      body = json.loads(request.body.decode("utf-8"))
  except json.JSONDecodeError:
      return JsonResponse({"ok": False, "error": "invalid json"}, status=400)

  try:
      session_id = body["session_id"]
      fps = float(body["fps"])
      frames_raw = body.get("frames", [])
  except KeyError as e:
      return JsonResponse({"ok": False, "error": f"missing field {e}"}, status=400)

  # JSON -> dataclass 로 변환
  frames: list[Frame] = []
  for f in frames_raw:
      hands: list[Hand] = []
      for h in f.get("hands", []):
          lms = [
              Landmark(x=lm["x"], y=lm["y"], z=lm.get("z"))
              for lm in h.get("landmarks", [])
          ]
          hands.append(Hand(handedness=h.get("handedness", "Unknown"), landmarks=lms))
      frames.append(Frame(ts=f.get("ts", 0.0), hands=hands))

  payload = SeqPayload(session_id=session_id, fps=fps, frames=frames)

  try:
      saved_path = save_seq_payload(payload, DATA_DIR)
  except ValueError as e:
      return JsonResponse({"ok": False, "error": str(e)}, status=400)

  return JsonResponse(
      {"ok": True, "file": str(saved_path), "T": len(payload.frames)}
  )

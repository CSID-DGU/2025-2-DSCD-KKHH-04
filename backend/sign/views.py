# backend/sign/views.py
from pathlib import Path
import numpy as np

from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from core.ingest_service import enqueue_frames  # npz 저장 함수
from .gloss_model import infer_gloss_from_seq   # 단어 모델 추론 함수


@api_view(["POST", "OPTIONS"])
def ingest(request):
    # CORS preflight
    if request.method == "OPTIONS":
        return Response(status=status.HTTP_200_OK)

    data = request.data

    session_id = data.get("session_id")
    fps = data.get("fps")
    frames = data.get("frames", [])

    if not session_id or not isinstance(frames, list):
        return Response(
            {"ok": False, "error": "session_id 또는 frames가 없습니다."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        file_path, T = enqueue_frames(session_id, frames)
    except ValueError as e:
        return Response(
            {"ok": False, "error": str(e)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response(
        {
            "ok": True,
            "file": file_path,
            "T": T,
            "text": f"{T}프레임을 {file_path} 로 저장했습니다.",
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST", "OPTIONS"])
def ingest_and_infer(request):
    """
    1) frames를 받아서 npz로 저장 (enqueue_frames)
    2) 저장된 npz에서 seq를 꺼냄
    3) gloss_model.infer_gloss_from_seq 로 단어 추론
    4) 저장 정보 + 추론 결과를 같이 반환
    """
    # CORS preflight
    if request.method == "OPTIONS":
        return Response(status=status.HTTP_200_OK)

    data = request.data

    session_id = data.get("session_id")
    fps = data.get("fps")
    frames = data.get("frames", [])

    if not session_id or not isinstance(frames, list):
        return Response(
            {"ok": False, "error": "session_id 또는 frames가 없습니다."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # 1) 먼저 npz 저장 (기존 ingest와 동일)
    try:
        file_path, T = enqueue_frames(session_id, frames)
    except ValueError as e:
        return Response(
            {"ok": False, "error": str(e)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # 2) npz 불러오기 (file_path가 상대경로일 수도 있어서 BASE_DIR 기준으로 보정)
    npz_path = Path(file_path)
    if not npz_path.is_absolute():
        npz_path = Path(settings.BASE_DIR) / npz_path

    try:
        with np.load(npz_path, allow_pickle=True) as z:
            # 우리가 저장한 키 이름에 맞춰서 변경 (보통 "seq"일 가능성이 큼)
            if "seq" in z.files:
                seq = z["seq"]
            elif "features" in z.files:
                seq = z["features"]
            else:
                return Response(
                    {"ok": False, "error": f"npz에 seq/features 키가 없습니다: {z.files}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
    except Exception as e:
        return Response(
            {"ok": False, "error": f"npz 로드 에러: {e}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # 3) 추론 돌리기
    try:
        infer_result = infer_gloss_from_seq(seq)
    except Exception as e:
        return Response(
            {"ok": False, "error": f"추론 에러: {e}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # 4) 저장 정보 + 추론 결과 한꺼번에 반환
    return Response(
        {
            "ok": True,
            "file": file_path,
            "T": T,
            "text": f"{T}프레임을 {file_path} 로 저장했습니다.",
            "inference": infer_result,
        },
        status=status.HTTP_200_OK,
    )

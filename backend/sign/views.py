# backend/sign/views.py
from pathlib import Path
import time  # ★ 총 소요 시간 측정용

from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from core.ingest_service import enqueue_frames  # npz 저장 함수
from .segment_infer import (
    infer_segments_from_seq,
    load_seq_from_npz,
)
from .intersection import gloss_tokens_to_korean  # ✅ 단어 1개 예외 처리 + Gemini 호출 래퍼
from .log_utils import append_e2e_log            # ★ 로그 기록 함수 (별도 파일)


@api_view(["POST", "OPTIONS"])
def ingest(request):
    # CORS preflight
    if request.method == "OPTIONS":
        return Response(status=status.HTTP_200_OK)

    data = request.data

    session_id = data.get("session_id")
    fps = data.get("fps")  # 현재는 저장에만 쓰고, 추론은 ingest_and_infer에서 사용
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
    2) 저장된 npz에서 (T,F) 시퀀스를 로드
    3) segment_infer.infer_segments_from_seq 로 세그먼트 + 글로스 시퀀스 추론
    4) 글로스 토큰 시퀀스를 intersection.gloss_tokens_to_korean 으로 보내
       - 단어 1개면 Gemini 거치지 않고 '입니다/에요'만 붙이고
       - 단어 2개 이상이면 Gemini로 자연스러운 한국어 문장 생성
    5) 저장 정보 + 세그먼트/글로스/한국어 문장을 같이 반환
    6) 위 전체 과정을 로그 CSV에 기록 (총 소요 시간 포함)
    """
    # CORS preflight
    if request.method == "OPTIONS":
        return Response(status=status.HTTP_200_OK)

    data = request.data

    session_id = data.get("session_id")
    eval_id = data.get("eval_id", "")  # ★ 평가용 문장 ID (옵션)
    fps = data.get("fps")
    frames = data.get("frames", [])

    if not session_id or not isinstance(frames, list):
        return Response(
            {"ok": False, "error": "session_id 또는 frames가 없습니다."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # fps 기본값 보정 (없거나 이상한 값이면 30.0으로)
    try:
        fps_val = float(fps) if fps is not None else 30.0
    except (TypeError, ValueError):
        fps_val = 30.0

    # ★ 여기서부터 E2E 시간 측정 시작
    t0 = time.time()

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
        # segment_infer 쪽 유틸을 그대로 사용해서 (T,F) 시퀀스 로드
        seq = load_seq_from_npz(npz_path)
    except Exception as e:
        return Response(
            {"ok": False, "error": f"npz 로드 에러: {e}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # 3) 세그먼트 + 글로스 단어 인퍼런스
    try:
        seg_result = infer_segments_from_seq(
            seq,
            fps=fps_val,
            pause_sec=0.3,
            motion_th=0.06,
            min_word_sec=0.3,
            smooth_alpha=0.7,
            conf_thr=0.8,
            alt_thr=0.5,
            debug=False,  # 필요하면 True로 두고 로그 확인
        )
    except Exception as e:
        return Response(
            {"ok": False, "error": f"세그먼트/단어 추론 에러: {e}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    gloss_tokens = seg_result.get("tokens", [])
    gloss_sentence = seg_result.get("gloss_sentence", "")

    # 4) 글로스 토큰 → 한국어 문장
    try:
        natural_sentence = gloss_tokens_to_korean(gloss_tokens)
    except Exception as e:
        return Response(
            {"ok": False, "error": f"문장 생성 에러: {e}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # ★ 총 소요 시간 계산 (프레임 저장 ~ 한국어 문장 생성까지)
    elapsed = time.time() - t0

    # 5) E2E 로그 CSV에 한 줄 기록
    try:
        append_e2e_log(
            eval_id=eval_id,
            session_id=session_id,
            gloss_tokens=gloss_tokens,
            sent_pred=natural_sentence,
            elapsed_sec=elapsed,
            meta={
                "fps": fps_val,
                "npz_path": str(npz_path),
                "T": int(T),
                "gloss_sentence": gloss_sentence,
            },
        )
    except Exception:
        # 로그 실패는 서비스 동작에 영향 안 주도록 조용히 무시
        pass

    # 6) 저장 정보 + 세그먼트/글로스/한국어 문장 한꺼번에 반환
    return Response(
        {
            "ok": True,
            "file": file_path,
            "T": T,
            "fps": fps_val,
            "text": f"{T}프레임을 {file_path} 로 저장했습니다.",

            # 세그먼트 + 글로스 + 한국어 문장 결과
            "gloss_tokens": gloss_tokens,
            "gloss_sentence": gloss_sentence,
            "natural_sentence": natural_sentence,
            "segments": seg_result.get("segments", []),
            "params": seg_result.get("params", {}),
            "motion_stats": seg_result.get("motion_stats", {}),

            # ★ E2E 소요 시간(초)
            "elapsed_sec": elapsed,
        },
        status=status.HTTP_200_OK,
    )

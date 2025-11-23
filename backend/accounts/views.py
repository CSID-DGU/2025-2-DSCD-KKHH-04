# accounts/views.py
import json
import traceback

from pathlib import Path
from datetime import datetime  # ★ 추가

from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password
from django.contrib.auth import authenticate, login as auth_login
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.core.files.storage import default_storage

# DRF
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework import status

# 파이프라인 import
from pipelines.service import (
    process_audio_file,
    save_api_snapshot,   # 다른 데서 쓸 수 있으니 남겨두되, 아래에선 중복 호출 안 함
    API_SNAPSHOT_DIR,    # ★ 스냅샷 디렉토리 가져오기
)

# =========================================================
# 회원가입
# =========================================================
@csrf_exempt
def signup(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST만 허용된다."}, status=405)

    try:
        data = json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON 형식이 아니다."}, status=400)

    email = data.get("email")
    password = data.get("password")
    name = data.get("name")  # 프론트에서 이름 필드 key

    if not email or not password or not name:
        return JsonResponse(
            {"error": "이메일, 비밀번호, 이름은 필수입니다."},
            status=400,
        )

    # 이미 존재하는지 체크
    if User.objects.filter(username=email).exists():
        return JsonResponse(
            {"error": "이미 가입된 이메일입니다."},
            status=400,
        )

    # User 생성 (username에 email, first_name에 이름)
    user = User.objects.create(
        username=email,
        email=email,
        first_name=name,
        password=make_password(password),
    )

    return JsonResponse(
        {
            "message": "회원가입 성공",
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.first_name,
            },
        },
        status=201,
    )


# =========================================================
# 로그인
# =========================================================
@csrf_exempt
def login(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST만 허용된다."}, status=405)

    try:
        data = json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON 형식이 아니다."}, status=400)

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return JsonResponse(
            {"error": "이메일과 비밀번호는 필수입니다."},
            status=400,
        )

    user = authenticate(request, username=email, password=password)

    if user is None:
        return JsonResponse(
            {"error": "이메일 또는 비밀번호가 올바르지 않습니다."},
            status=401,
        )

    auth_login(request, user)

    return JsonResponse(
        {
            "message": "로그인 성공",
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.first_name,
            },
        },
        status=200,
    )


# =========================================================
# 음성 → STT → 글로스/수어영상 변환 API
# =========================================================
# =========================================================
# 음성 → STT → 글로스/수어영상 변환 API
# =========================================================
@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
def speech_to_sign(request):
    """
    음성 파일(audio)을 받아서
    STT + 글로스 + gloss_id 매핑 + 수어 영상 경로까지 한 번에 처리해서 반환.
    """
    print("[DEBUG] speech_to_sign start")

    # 1) audio 파일 체크
    if "audio" not in request.FILES:
        print("[DEBUG] no audio in request.FILES")
        return Response({"error": "audio 파일이 필요합니다."}, status=400)

    django_file = request.FILES["audio"]
    print(
        f"[DEBUG] got audio: name={django_file.name}, size={django_file.size} bytes"
    )

    try:
        # 파이프라인 처리
        # process_audio_file 내부에서 이미 snapshot 저장까지 수행함
        print("[DEBUG] calling process_audio_file ...")
        result = process_audio_file(django_file)
        print("[DEBUG] process_audio_file OK")

        # 백엔드에서는 STT 원문(text) + NLP 결과(clean_text)를 둘 다 넘겨주고
        # 어떤 걸 화면에 쓸지는 프론트에서 결정 (지금은 clean_text 사용)
        return Response(result, status=200)

    except Exception as e:
        print("[ERROR] speech_to_sign exception:", e)
        traceback.print_exc()  # ★ 어디서 터졌는지 전체 스택 찍기
        return Response(
            {
                "error": "서버 내부 오류가 발생했습니다.",
                "detail": str(e),
            },
            status=500,
        )


# =========================================================
# 용어 교정 저장 API
# /api/terminology/update/
# =========================================================
@api_view(["POST"])
def update_terminology(request):
    wrong = request.data.get("wrong")
    correct = request.data.get("correct")

    path = Path(settings.BASE_DIR) / "data" / "terminology.json"

    # 기존 파일 로드
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = []

    # 새 항목 append
    data.append({"wrong": wrong, "correct": correct})

    # 파일 저장
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return Response({"ok": True})

@csrf_exempt
def speech(request):
    """
    과거 테스트용 엔드포인트.
    필요하다면 유지, 아니면 정리해도 됨.
    """
    if request.method != "POST":
        return JsonResponse({"error": "POST만 허용된다."}, status=405)

    audio_file = request.FILES.get("audio")
    if not audio_file:
        return JsonResponse({"error": "audio 파일이 없다."}, status=400)

    try:
        result = process_audio_file(audio_file)
    except Exception as e:
        print("[speech ERROR]", e)
        return JsonResponse({"error": "서버 처리 오류"}, status=500)

    # 여기서도 별도 save_api_snapshot 호출 X
    return JsonResponse(result, status=200)


# =========================================================
# 성능 로그 조회 API (대시보드용)
# =========================================================
@api_view(["GET"])
def speech_logs(request):
    """
    backend/snapshots/api/ 에 저장된 snapshot_*.json 파일들을 읽어서
    성능 대시보드에서 바로 쓸 수 있는 형태로 반환.
    """
    logs = []

    # 파일 수정 시간 기준 오름차순 정렬 (가장 오래된 로그가 먼저)
    for file in sorted(API_SNAPSHOT_DIR.glob("snapshot_*.json"), key=lambda p: p.stat().st_mtime):
        try:
            with open(file, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"[speech_logs READ ERROR] {file}: {e}")
            continue

        # 파일의 mtime을 ts로 사용 (프론트에서 new Date(ts) 가능하도록 ISO 포맷)
        ts = datetime.fromtimestamp(file.stat().st_mtime).isoformat(timespec="seconds")

        latency = data.get("latency_ms") or {}

        # 대시보드에서 쓰기 좋게 평탄화
        log = {
            "ts": ts,
            "sentence": data.get("clean_text") or data.get("text") or "",
            "stt": latency.get("stt"),
            "nlp": latency.get("nlp"),
            "mapping": latency.get("mapping"),
            "synth": latency.get("synth"),
            "total": latency.get("total"),
            # 상세 팝업에서 사용할 필드들
            "stt_text": data.get("text") or "",
            "clean_text": data.get("clean_text") or "",
            "gloss": data.get("gloss") or [],
            "gloss_labels": data.get("gloss_labels") or [],
        }

        logs.append(log)

    return Response(logs, status=200)

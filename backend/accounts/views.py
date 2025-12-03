import json
import traceback
import subprocess
from pathlib import Path
from datetime import datetime
from django.views.decorators.http import require_GET
from django.core.cache import cache

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password
from django.contrib.auth import authenticate, login as auth_login
from django.utils.dateparse import parse_datetime
from django.shortcuts import get_object_or_404

from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework import status

from pipelines.service import process_audio_file
from pipelines.pipeline import append_normalization_rule 
from .models import ChatMessage, CustomerProfile, ChatSession

def get_or_create_session(request, session_id: str) -> ChatSession:
    """
    - session_id로 ChatSession을 찾고, 없으면 생성한다.
    - request.user가 로그인 상태이고 CustomerProfile이 있으면
      ChatSession.customer에 자동 매핑한다.
    """
    # 로그인한 유저 가져오기
    user = request.user if hasattr(request, "user") and request.user.is_authenticated else None
    profile = None

    if user is not None:
        # user.customer_profile이 있을 수도 있고 없을 수도 있으므로 안전하게
        profile = getattr(user, "customer_profile", None)

    # 세션 가져오기 or 생성
    session, created = ChatSession.objects.get_or_create(
        session_id=session_id,
        defaults={"customer": profile},
    )

    # 이미 존재하던 세션인데 아직 customer가 비어 있고,
    # 지금 요청에 customer_profile이 있으면 매핑
    if session.customer is None and profile is not None:
        session.customer = profile
        session.save(update_fields=["customer"])

    return session


def serialize_user(user):
    """
    프론트에서 쓰기 좋은 형태로 user 정보를 직렬화
    + 고객 프로필(CustomerProfile)이 있으면 은행/계좌번호까지 같이 내려줌
    """
    profile = getattr(user, "customer_profile", None)

    return {
        "id": user.id,
        "email": user.email,
        "name": getattr(user, "name", "") or user.first_name or user.username,
        "username": user.username,
        # 🔽 여기 추가
        "phone": profile.phone if profile else "",
        "contact_method": profile.contact_method if profile else "",
        "bank_name": profile.bank_name if profile else "",
        "account_number": profile.account_number if profile else "",
    }

@api_view(["POST"])
def add_rule(request):
    """
    POST /api/accounts/add_rule/
    body: { "wrong": "정립식", "correct": "적립식" }
    → rules.json(text_normalization)에 규칙 추가
    """
    wrong = (request.data.get("wrong") or "").strip()
    correct = (request.data.get("correct") or "").strip()

    if not wrong or not correct:
        return Response(
            {"ok": False, "error": "wrong / correct 값이 비어 있습니다."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        append_normalization_rule(wrong, correct)
        return Response({"ok": True}, status=status.HTTP_200_OK)
    except Exception as e:
        print("[add_rule] error:", e)
        return Response(
            {"ok": False, "error": "서버 내부 오류"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ----------------------
# 회원가입
# ----------------------
@csrf_exempt
def signup(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST만 허용된다."}, status=405)

    try:
        data = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse({"error": "잘못된 JSON 형식입니다."}, status=400)

    username = data.get("username") or data.get("userId") or data.get("email")
    password = data.get("password") or data.get("insType")
    email = data.get("institutionName") or data.get("email") or ""

    if not username or not password:
        return JsonResponse(
            {"error": "username, password가 필요합니다."},
            status=400,
        )

    if User.objects.filter(username=username).exists():
        return JsonResponse({"error": "이미 존재하는 사용자입니다."}, status=400)

    # 공통 User 생성
    user = User.objects.create(
        username=username,
        email=email,
        password=make_password(password),
    )

    user_type = data.get("userType")

    # 🔹 고객 회원가입인 경우: 이름/연락처/연락수단 저장
    if user_type == "customer":
        name = data.get("name") or ""
        phone = data.get("phone") or ""
        contact_method = data.get("contactMethod") or ""

        # User.first_name에 이름 넣기 (serialize_user, __str__에서 사용)
        if name:
            user.first_name = name
            user.save()

        # CustomerProfile 생성
        CustomerProfile.objects.create(
            user=user,
            phone=phone,
            contact_method=contact_method,
            # bank_name, account_number는 추후 마이페이지/프로필 수정에서 입력
        )

    # 🔹 그 외(userType이 banker/기관 등)는 지금처럼 extra_info만 찍어둬도 됨
    extra_info = {
        "userType": user_type,
        "name": data.get("name"),
        "phone": data.get("phone"),
        "employeeId": data.get("employeeId"),
        "branchName": data.get("branchName"),
        "institutionName": data.get("institutionName"),
        "institutionType": data.get("institutionType"),
        "institutionAddress": data.get("institutionAddress"),
        "contactMethod": data.get("contactMethod"),
    }
    print("[signup] extra info:", extra_info)

    return JsonResponse(
        {
            "ok": True,
            "user_id": user.id,
            "username": user.username,
        },
        status=201,
    )


# ----------------------
# 로그인
# ----------------------
@csrf_exempt
def login(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST만 허용된다."}, status=405)

    content_type = request.META.get("CONTENT_TYPE", "")
    try:
        raw_body = request.body.decode("utf-8", errors="ignore")
    except Exception:
        raw_body = ""

    print("====== [DEBUG /login] ======")
    print(f"CONTENT_TYPE = {content_type}")
    print(f"raw body    = {repr(raw_body)}")

    data = {}

    if raw_body:
        try:
            data = json.loads(raw_body)
            print(f"[login] parsed JSON = {data}")
        except Exception as e:
            print(f"[login] JSON decode error: {e}")

    if not data:
        data = request.POST.dict()
        print(f"[login] fallback POST data = {data}")

    username = (
        data.get("username")
        or data.get("email")
        or data.get("userId")
        or data.get("id")
        or data.get("userid")
    )
    password = data.get("password") or data.get("pw") or data.get("pass")

    print(f"[login] username = {username!r}, password 존재 여부 = {bool(password)}")

    if not username or not password:
        return JsonResponse(
            {"error": "username/password가 모두 필요합니다."},
            status=400,
        )

    user = authenticate(request, username=username, password=password)

    if user is None:
        print("[login] authenticate 실패")
        return JsonResponse({"error": "아이디 또는 비밀번호가 올바르지 않습니다."}, status=400)

    auth_login(request, user)
    print(f"[login] 로그인 성공: user_id={user.id}")

    return JsonResponse(
        {
            "ok": True,
            "user": serialize_user(user),
        },
        status=200,
    )


# ----------------------
# STT → NLP → Sign 파이프라인
# ----------------------
@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
def speech_to_sign(request):
    try:
        file_obj = request.FILES.get("audio")
        mode = request.data.get("mode") or ""
        session_id = request.data.get("session_id") or ""
        ts = request.data.get("ts")

        if not ts:
            ts = datetime.now().isoformat()

        if not file_obj:
            return Response({"error": "audio 파일 없음"}, status=400)

        print(f"[speech_to_sign] uploaded size = {file_obj.size} bytes")
        print(f"[speech_to_sign] mode={mode}, session_id={session_id}, ts={ts}")

        result = process_audio_file(
            django_file=file_obj,
            mode=mode,
            session_id=session_id,
        )

        if isinstance(result, dict):
            result.setdefault("timestamp", ts)
            result.setdefault("session_id", session_id)
            result.setdefault("mode", mode)

        # 🔹 세션별 최신 수어 결과를 cache 에 저장
            if session_id:
                cache_key = f"signance:last_result:{session_id}"
                try:
                    cache.set(cache_key, result, timeout=60 * 60)  # 1시간 캐시
                    print(f"[cache] saved latest sign result: {cache_key}")
                except Exception as e:
                    print("[cache] save error:", e)

        return Response(result, status=200)

    except Exception as e:
        print("[speech_to_sign ERROR]", traceback.format_exc())
        return Response(
            {"error": "서버 내부 오류", "detail": str(e)},
            status=500,
        )


@api_view(["GET"])
def session_customer(request):
    """
    session_id 기준으로 ChatSession에 연결된 고객 정보 반환.
    - 은행원 페이지에서 사용:
      /api/accounts/session_customer/?session_id=...
    """
    session_id = request.query_params.get("session_id") or ""
    if not session_id:
        return Response(
            {"error": "session_id 쿼리 파라미터가 필요합니다."},
            status=400,
        )

    try:
        # customer(FK -> CustomerProfile)와 user까지 같이 가져오기
        session = ChatSession.objects.select_related("customer__user").get(
            session_id=session_id
        )
    except ChatSession.DoesNotExist:
        # 세션이 아직 없거나 고객 매핑 전이면 빈 값 반환
        return Response(
            {
                "session_id": session_id,
                "name": "",
                "phone": "",
                "bank_name": "",
                "account_number": "",
            },
            status=200,
        )

    customer_profile = session.customer  # CustomerProfile or None

    if customer_profile is None:
        return Response(
            {
                "session_id": session_id,
                "name": "",
                "phone": "",
                "bank_name": "",
                "account_number": "",
            },
            status=200,
        )

    user = customer_profile.user
    name = user.first_name or user.username

    return Response(
        {
            "session_id": session_id,
            "name": name,
            "phone": customer_profile.phone,
            "bank_name": customer_profile.bank_name,
            "account_number": customer_profile.account_number,
        },
        status=200,
    )



# ----------------------
# speech_logs (미사용)
# ----------------------
# @api_view(["GET"])
# def speech_logs(request):
#     return Response([], status=200)

# def session_customer(request):
#     session_id = request.query_params.get("session_id")
#     if not session_id:
#         return Response({"error": "session_id required"}, status=400)

#     try:
#         session = ChatSession.objects.get(session_id=session_id)
#     except ChatSession.DoesNotExist:
#         return Response({"error": "session not found"}, status=404)

#     customer = session.customer

#     return Response({
#         "name": customer.name,
#         "phone": customer.phone,
#         "resident_id": customer.resident_id,
#     })

# ----------------------
# 용어 업데이트 (미사용)
# ----------------------
@api_view(["POST"])
def update_terminology(request):
    try:
        payload = request.data
        print("[update_terminology] payload:", payload)
        return Response({"ok": True})
    except Exception as e:
        print("[update_terminology ERROR]", traceback.format_exc())
        return Response({"error": "fail", "detail": str(e)}, status=500)


# ----------------------
# 프로필 업데이트
# ----------------------
from .models import CustomerProfile  # 이미 위에 있으면 중복으로 쓰지 말고 한 번만 두면 됨

@csrf_exempt
@api_view(["PATCH"])
def update_profile(request):
    try:
        data = request.data

        user_id = data.get("id")
        if not user_id:
            return Response({"error": "user id가 필요합니다."}, status=400)

        # 1) User 찾기
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "해당 유저를 찾을 수 없습니다."}, status=404)

        # 2) User 기본 정보
        name = data.get("name")
        email = data.get("email")
        password = data.get("password")

        if name is not None:
            if hasattr(user, "name"):
                user.name = name
            else:
                user.first_name = name

        if email is not None:
            user.email = email

        if password:
            user.set_password(password)

        user.save()

        # 3) CustomerProfile 정보 (전화, 연락수단, 은행, 계좌번호)
        phone = data.get("phone", None)
        contact_method = data.get("contactMethod") or data.get("contact_method")
        bank_name = data.get("bank_name", None)
        account_number = data.get("account_number", None)

        # customer_profile 없으면 생성
        profile, _created = CustomerProfile.objects.get_or_create(user=user)

        if phone is not None:
            profile.phone = phone
        if contact_method is not None:
            profile.contact_method = contact_method
        if bank_name is not None:
            profile.bank_name = bank_name
        if account_number is not None:
            profile.account_number = account_number

        profile.save()

        return Response(
            {"message": "회원정보가 수정되었습니다.", "user": serialize_user(user)},
            status=200,
        )

    except Exception as e:
        print("[update_profile ERROR]", traceback.format_exc())
        return Response({"error": "서버 내부 오류", "detail": str(e)}, status=500)


# ----------------------
# 채팅 생성/조회
# ----------------------
@api_view(["POST", "GET"])
def chat(request):
    """
    POST: 메시지 저장
    GET: 세션 기준 전체 메시지 조회
    """
    if request.method == "POST":
        data = request.data
        session_id = data.get("session_id")
        sender = data.get("sender")  # banker / deaf
        role = data.get("role") or ""
        text = data.get("text")

        if not session_id or not sender or not text:
            return Response({"error": "session_id, sender, text는 필수입니다."}, status=400)

        chat_session = get_or_create_session(request, session_id)
         
        msg = ChatMessage.objects.create(
            session_id=session_id,
            chat_session=chat_session,
            sender=sender,
            role=role,
            text=text,
        )

        return Response(
            {
                "id": msg.id,
                "session_id": msg.session_id,
                "sender": msg.sender,
                "role": msg.role,
                "text": msg.text,
                "created_at": msg.created_at.isoformat(),
            },
            status=201,
        )

    # GET
    session_id = request.GET.get("session_id")
    if not session_id:
        return Response({"error": "session_id 쿼리 파라미터 필요"}, status=400)

    qs = ChatMessage.objects.filter(session_id=session_id).order_by("created_at")

    after = request.GET.get("after")
    if after:
        dt = parse_datetime(after)
        if dt:
            qs = qs.filter(created_at__gt=dt)

    data = [
        {
            "id": m.id,
            "session_id": m.session_id,
            "sender": m.sender,
            "role": m.role,
            "text": m.text,
            "created_at": m.created_at.isoformat(),
        }
        for m in qs
    ]

    return Response(data, status=200)


# ----------------------
# 채팅 수정/조회 detail API (**추가된 부분**)
# ----------------------

@api_view(["GET", "PATCH", "DELETE"])
def chat_detail(request, pk):
    """
    단일 채팅 메시지 조회/수정/삭제
    - GET    /api/accounts/chat/<pk>/
    - PATCH  /api/accounts/chat/<pk>/
    - DELETE /api/accounts/chat/<pk>/
    """
    msg = get_object_or_404(ChatMessage, pk=pk)

    # 공통 응답 포맷
    def to_dict(m):
        return {
          "id": m.id,
          "session_id": m.session_id,
          "sender": m.sender,
          "role": m.role,
          "text": m.text,
          "created_at": m.created_at.isoformat(),
      }

    if request.method == "GET":
        return Response(to_dict(msg), status=status.HTTP_200_OK)

    elif request.method == "PATCH":
        data = request.data

        # text / role 둘 다 선택적으로 수정 가능
        text = data.get("text", None)
        role = data.get("role", None)

        if text is not None:
            msg.text = text
        if role is not None:
            msg.role = role

        msg.save()
        return Response(to_dict(msg), status=status.HTTP_200_OK)

    elif request.method == "DELETE":
        msg.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    

@require_GET
def latest_sign_result(request):
    """
    GET /api/accounts/sign_result/latest/?session_id=...
    - session_id 필수
    - 해당 세션의 최신 수어 변환 결과를 cache 에서 꺼내서 그대로 반환
    - 아직 아무 것도 없으면 204(No Content)
    """
    session_id = request.GET.get("session_id")
    if not session_id:
        return JsonResponse({"error": "session_id is required"}, status=400)

    cache_key = f"signance:last_result:{session_id}"
    data = cache.get(cache_key)

    # 아직 이 세션으로 생성된 결과가 없으면 204
    if not data:
        # 내용 없는 응답
        return JsonResponse({}, status=204)

    # service.py에서 만든 result(dict)를 그대로 돌려줌
    return JsonResponse(
        data,
        status=200,
        json_dumps_params={"ensure_ascii": False},
    )

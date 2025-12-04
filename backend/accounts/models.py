from django.db import models
from django.contrib.auth.models import User


class CustomerProfile(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="customer_profile",
    )
    phone = models.CharField(max_length=20, blank=True)
    contact_method = models.CharField(
        max_length=20,
        blank=True,              # "kakao", "sms", "email" 등
    )
    bank_name = models.CharField(max_length=50, blank=True)
    account_number = models.CharField(max_length=50, blank=True)
    memo = models.TextField(blank=True)

    def __str__(self):
        # user.first_name(=이름) 없으면 username 보여주기
        return f"[고객] {self.user.first_name or self.user.username}"


class ChatSession(models.Model):
    """
    프론트에서 쓰는 signanceSessionId 1개 = 상담 세션 1개

    - session_id: 프론트 localStorage에 저장되는 signanceSessionId
    - customer: 어떤 고객(회원)의 세션인지
    """
    session_id = models.CharField(max_length=100, unique=True)
    customer = models.ForeignKey(
        CustomerProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_sessions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        base = self.session_id
        if self.customer:
            return f"[세션 {self.id}] {base} / {self.customer}"
        return f"[세션 {self.id}] {base} / (고객 없음)"


class ChatMessage(models.Model):
    """
    세션별 상담 대화 로그.

    - session_id: 프론트에서 쓰는 signanceSessionId (문자열, 기존 호환용)
    - chat_session: ChatSession FK (새 구조, 선택적으로 연결)
    - sender: "banker" / "deaf"
    - role:   "질의" / "응답" 등 (옵션)
    - text:   실제 대화 내용
    """
    # 문자열 세션 id (기존 구조용)
    session_id = models.CharField(max_length=100)

    # 새 구조: ChatSession과의 연결
    chat_session = models.ForeignKey(
        ChatSession,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="messages",
    )

    sender = models.CharField(max_length=20)            # banker / deaf
    role = models.CharField(max_length=20, blank=True)  # 질의 / 응답 등
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"[{self.session_id}] {self.sender}: {self.text[:20]}"

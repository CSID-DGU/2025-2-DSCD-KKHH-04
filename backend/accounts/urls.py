from django.urls import path
from . import views
from django.views.generic import RedirectView

urlpatterns = [
    path("signup/", views.signup, name="signup"),
    path("login/", views.login, name="login"),

    path("speech_to_sign/", views.speech_to_sign, name="speech_to_sign"),
    # path("speech_logs/", views.speech_logs, name="speech_logs"),

    path("profile/update/", views.update_profile, name="profile_update"),
    path("terminology/update/", views.update_terminology, name="update_terminology"),
    path("add_rule/", views.add_rule, name="add_rule"),
    
    # 채팅 저장/조회 (list)
    path("chat/", views.chat, name="chat"),
    path("session-customer/", views.session_customer, name="session_customer2"),
    path("session_customer/", views.session_customer, name="session_customer"),   # 기존
    # 프론트에서 호출하는 주소

    # 🔥 **새로 추가된 detail API**
    path("chat/<int:pk>/", views.chat_detail, name="chat-detail"),
    path("sign_result/latest/", views.latest_sign_result, name="latest_sign_result",
         ),
    
    path("favicon.ico", RedirectView.as_view(url="/static/favicon.ico")),

]

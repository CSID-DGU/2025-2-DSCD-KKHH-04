# accounts/urls.py
# accounts/urls.py
from django.urls import path
from . import views 

urlpatterns = [
    path("signup/", views.signup, name="signup"),
    path("login/", views.login, name="login"),
    path("speech_to_sign/", views.speech_to_sign, name="speech_to_sign"),
    path("speech_logs/", views.speech_logs, name="speech_logs"),

    # ★ terminology 저장 API
    path("terminology/update/", views.update_terminology, name="update_terminology"),
]

# accounts/urls.py
# backend/accounts/urls.py


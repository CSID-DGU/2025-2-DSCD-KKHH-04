# config/urls.py
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),

    # 계정 관련 API
    path("api/accounts/", include("accounts.urls")),

    # ★ 성능 평가 파이프라인 API 추가
    path("api/", include("pipelines.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

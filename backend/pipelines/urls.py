# pipelines/urls.py (없는 파일이면 새로 만들어도 됨)

from django.urls import path
from . import views_metrics

urlpatterns = [
    path("api/metrics/snapshots/", views_metrics.list_snapshots, name="metrics-snapshots"),
]

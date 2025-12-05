from django.urls import path
from .views import ingest, ingest_and_infer

urlpatterns = [
    path("ingest/", ingest),  # /api/ingest/
    path("ingest-and-infer/", ingest_and_infer, name="ingest_and_infer"),
]

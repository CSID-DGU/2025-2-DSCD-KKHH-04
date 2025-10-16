from django.shortcuts import render

# Create your views here.
from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(["POST", "OPTIONS"])  # OPTIONS는 CORS preflight용
def ingest(request):
    if request.method == "OPTIONS":
        return Response(status=200)

    # 프론트에서 온 payload를 잠깐 확인하고(선택),
    # 더미 응답을 보냅니다. (후에 정규화/모델 로직 여기에 추가)
    # data = request.data  # 필요하면 사용

    return Response({
        "gloss": "GREET",
        "text": "안녕하세요, 무엇을 도와드릴까요?"
    })
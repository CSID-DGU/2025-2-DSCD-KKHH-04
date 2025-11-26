# 2025-2-DSCD-KKHH-04

# 공통
pip install -r requirements.txt
.env 파일 생성하고 api 키 저장
필요한 파일들이 올바른 위치에 있는지 확인


Python 3.8+
FFmpeg: 영상 합성 및 재생을 위해 필수입니다. 시스템 환경변수(PATH)에 등록되어 있어야 합니다.
Windows: 다운로드 링크 후 bin 폴더 경로 등록
Mac: brew install ffmpeg
Linux: sudo apt install ffmpeg


# coverage_analysis.ipynb



# pipeline.py

## 폴더 구조
root/
├── pipeline_v3.1.py       # 메인 실행 파일
├── .env                   # API 키 설정 파일
├── data/
│   ├── gloss_dictionary_MOCK.csv  # 수어 단어 사전 (ID, 한국어 매핑)
│   ├── rules.json                 # 룰 엔진 설정 (치환, 동음이의어 규칙)
│   └── service/                   # 수어 MP4 파일들이 위치한 폴더 (하위 폴더 포함 검색)
│       ├── 101650.mp4
│       └── ...
└── snapshots14/           # (자동 생성) 실행 로그 및 임시 파일 저장소

## 실행 방법
(1) 초기 로딩(모델 로드, 파일 인덱싱)이 완료될 때까지 기다립니다.
(2) [Ready] 메시지가 뜨면 Enter 키를 누르고 마이크에 말을 합니다.
(3) 말이 끝나면 다시 Enter 키를 눌러 녹음을 종료합니다.
(4) 시스템이 음성을 분석하고 적절한 수어 영상을 찾아 연속 재생합니다.


## 문제 해결
- ffmpeg not found: FFmpeg가 설치되어 있지 않거나 환경변수에 등록되지 않았습니다. 설치를 확인하세요.
- Gemini 오류: .env 파일에 GOOGLE_API_KEY가 올바른지 확인하세요.
- FP16 Warning: Whisper 실행 시 CPU를 사용하는 경우 나타나는 경고입니다. 무시해도 되며, GPU가 있다면 CUDA 설정을 확인하세요.
- 매핑 실패: data/gloss_dictionary_MOCK.csv에 해당 단어가 없거나, data/service 폴더에 해당 ID의 영상 파일이 없는 경우입니다.
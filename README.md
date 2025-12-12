# Signance: 청각장애인의 금융 접근성을 위한 수어 중심 양방향 금융 상담 서비스

## 2025-2 데이터사이언스캡스톤디자인 4조 김김희희

<img src="https://github.com/CSID-DGU/2025-2-DSCD-KKHH-04/blob/9035a878ce7c93f4d5203e568227ddeaf65102c6/images/logo.jpg" width="200"/> 

## 💡 프로젝트 개요
‘Signance’는 **청각장애인과 은행원 간의 의사소통 장벽을 허무는 양방향 금융 상담 지원 서비스**입니다. 
은행원의 음성 설명을 수어 영상으로 변환하여 고객에게 전달하고, 고객의 수어 응답을 인식하여 한국어 문장으로 은행원에게 전달합니다. 

**금융 상담**이라는 명확한 도메인 내에서 은행원의 설명과 고객의 응답이 끊김 없이 이어지는 소통 환경을 구축하여, 청각장애인의 독립적인 금융 의사결정을 돕고 금융권의 디지털 포용성을 실현하는 것을 목표로 합니다.

## 💫 팀원 소개

| 김제석 (팀장) | 김다영 | 서희정 | 이태희 |
|:---:|:---:|:---:|:---:|
|  |  |  |  |
| 산업시스템공학과 | 산업시스템공학과 | 경제학과 | 산업시스템공학과 |

## 👐 개발 동기
청각장애인의 금융 접근성 문제는 단순한 불편을 넘어 **생존권 및 정보 접근권의 문제**입니다.
통계에 따르면 소득 활동을 하는 장애 가구의 약 43%가 일반 금융 활동이 가능한 수준임에도 불구하고, 실제 은행 창구에서는 가장 큰 의사소통 제약을 겪고 있습니다. 

* **소통의 어려움:** 실제 창구에서는 필담(45.7%)이 주를 이루지만, 수어 사용자의 58.2%는 '수어 상담'을 희망합니다. 문해력 격차로 인해 필담만으로는 복잡한 금융 상품(금리, 기간, 약관 등)을 완벽히 이해하기 어렵습니다.
* **기존 대안의 한계:** 화상 수어 통역은 인력 부족과 대기 시간 문제가 있으며, 화상 수어 서비스의 경우 환경의 제약으로 이용에 어려움이 있습니다.
* **현장의 니즈:** 대리인 동반 시 발생하는 개인정보 노출 우려를 없애고, 청각장애인이 스스로 자산을 관리할 수 있는 **주체적인 상담 환경**이 필요합니다.

이에 **금융 도메인에 특화된 완결성 있는 양방향 소통 시스템**을 개발하여, 누구나 동등하게 금융 서비스를 누릴 수 있도록 할 필요성이 있다고 보았습니다.

## 🏁 개발 목표
본 프로젝트는 실제 은행 창구에서 은행원과 청각장애인 고객이 

**(1) 설명 파이프라인 (Banker → Customer)**
- 은행원의 설명을 금융 도메인 맞춤형 수어 단어로 변환
오타나 비문이 포함된 구어체 발화에서도 핵심 금융 정보를 정확히 정제하여 수어 영상으로 합성

**(2) 응답 파이프라인 (Customer → Banker)**
* **의사 복원:** 상담 시나리오 분석을 통해 도출된 70개 핵심 단어(Vocabulary)만으로 고객의 가입 의사, 조건 확인, 절차 요청 등 모든 응답을 자연어로 완벽히 복원.
* **양방향 완결:** 수어 입력 → 단어 인식 → 자연어 문장 재구성의 End-to-End 구조 확립

**(3) 사회적 가치 실현**
* **디지털 포용:** 키오스크, 모바일 등 다양한 채널로 확장 가능한 기술적 토대를 마련하여 금융 소외 계층의 접근성 강화
* **ESG 경영:** 금융권의 사회적 책임 이행과 정부의 수어 발전 기본 계획에 부합하는 솔루션 제시

## 🌟 최종 구현 결과 (스크린샷)

| 메인 화면 | 은행원 상담 화면 |
|:---:|:---:|
| <img src="images/main_page.png" width="400"/> | <img src="images/banker_page.png" width="400"/> |
| **고객(청각장애인) 상담 화면** | **파이프라인 성능 대시보드** |
| <img src="images/customer_page.png" width="400"/> | <img src="images/dashboard.png" width="400"/> |

## 🔧 기술 스택

| 분야 | 기술 스택 |
|:---:|---|
| **Frontend** | <img src="https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=React&logoColor=white"> <img src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white"> <img src="https://img.shields.io/badge/TailwindCSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white"> <img src="https://img.shields.io/badge/PWA-5A0FC8?style=flat-square&logo=pwa&logoColor=white"> |
| **Backend** | <img src="https://img.shields.io/badge/Django-092E20?style=flat-square&logo=django&logoColor=white"> <img src="https://img.shields.io/badge/Django Channels-092E20?style=flat-square"> <img src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white"> <img src="https://img.shields.io/badge/Nginx-009639?style=flat-square&logo=nginx&logoColor=white"> |
| **AI / Model** | <img src="https://img.shields.io/badge/Faster Whisper-000000?style=flat-square"> <img src="https://img.shields.io/badge/Gemini API-8E75B2?style=flat-square&logo=googlebard&logoColor=white"> <img src="https://img.shields.io/badge/MediaPipe-005571?style=flat-square&logo=mediaPipe&logoColor=white"> |
| **Media** | <img src="https://img.shields.io/badge/FFmpeg-007808?style=flat-square&logo=ffmpeg&logoColor=white"> |
| **Database** | <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white"> |
| **Infra** | <img src="https://img.shields.io/badge/AWS EC2-FF9900?style=flat-square&logo=amazonaws&logoColor=white"> <img src="https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white"> |

## 🧾 시스템 아키텍처

### 전체 시스템 구조
<img src="images/system_architecture.png" width="700"/>

### 설명 및 응답 파이프라인
* **설명(Explanation):** `음성 입력` → `Faster-Whisper(STT)` → `Gemini(NLP/Gloss)` → `DB 매핑` → `FFmpeg(영상합성)` → `수어 출력`
* **응답(Response):** `수어 영상` → `MediaPipe(랜드마크)` → `TCN-Transformer(단어인식)` → `Gemini(자연어복원)` → `텍스트 출력`

## 📊 프로젝트 성과 (Performance)
* **설명 파이프라인:** Gloss 매핑 정확도 **93.58%**, 지연 시간 **11.10초** 
* **응답 파이프라인:** 단어 인식 정확도 **100%**, 문장 의미 보존율 **100%**
* **최종 결과:** 제1금융권 8개 상품군 대상 **실시간 양방향 상담 프로토타입** 완성

## 📂 프로젝트 구조
Signance/
├── backend/                     # Django 기반 서버 및 AI 파이프라인
│   ├── accounts/                # 세션 관리, 챗 로그 API, 규칙 기반 교정 API
│   ├── sign/                    # 수어 인식(TCN-Transformer) 및 응답 파이프라인
│   ├── pipeline/                # 음성→STT→Gloss→수어 영상 합성 전체 파이프라인
│   │   ├── pipeline.py          # 실제 실행되는 설명 파이프라인 메인 모듈
│   │   ├── gloss_dictionary.csv # Gloss 사전 (금융 도메인 기반)
│   │   ├── gloss_mp4/           # gloss_id 기반 수어 영상(mp4)
│   │   └── snapshots*/          # 발화·STT·NLP·매핑 결과 로그 저장
│   ├── media/                   # 사용자 업로드 데이터 및 생성 영상 저장
│   ├── static/                  # Django 정적 파일
│   ├── db.sqlite3               # 개발환경용 DB
│   └── manage.py
│
├── frontend_clean/              # React + Vite 프론트엔드
│   ├── src/
│   │   ├── components/
│   │   │   ├── Banker/          # 은행원 화면 UI 컴포넌트
│   │   │   │   ├── ASRPanel.jsx # 은행원 발화 인식 패널
│   │   │   │   ├── ChatPanel.jsx
│   │   │   │   └── SendPanel.jsx
│   │   │   ├── Deaf/            # 청각장애인 고객 화면 컴포넌트
│   │   │   │   ├── VideoPanel.jsx
│   │   │   │   └── ReceivePanel.jsx
│   │   │   ├── Dashboard/       # 파이프라인 성능 대시보드
│   │   │   └── NavTabs.jsx      # 공통 탭 UI
│   │   ├── pages/
│   │   │   ├── MainPage.jsx
│   │   │   ├── BankerPage.jsx
│   │   │   ├── DeafPage.jsx
│   │   │   └── DashboardPage.jsx
│   │   ├── hooks/
│   │   ├── utils/
│   │   └── App.jsx
│   ├── public/
│   └── index.html
│
├── infra/
│   ├── nginx.conf               # Reverse proxy 및 API 라우팅 설정
│   ├── docker-compose.yml       # 배포용 Docker 구성
│   └── aws/                     # EC2 배포 관련 스크립트
│
├── docs/
│   ├── proposal/                # 제안서
│   ├── midterm/                 # 중간 보고서
│   ├── final/                   # 최종 보고서 및 발표 자료
│   └── architecture/            # 시스템 아키텍처 다이어그램
│
└── README.md                    # 프로젝트 설명 문서


📘 디렉토리 상세 설명
backend/

Django 기반 서버로, 설명/응답 파이프라인의 핵심 로직이 위치함

accounts/
세션 관리 · 대화 로그 저장 · 규칙 기반 텍스트 교정 API 운영

sign/
고객 수어 인식(TCN-Transformer) 모델과 문장 복원 로직

pipeline/
은행원 발화 → STT → Gemini Gloss → Gloss ID 매핑 → FFmpeg 영상 합성
전체 설명 파이프라인의 엔진 역할 수행

gloss_mp4/
gloss_id에 대응하는 실제 수어 영상 파일


frontend/React(Vite) 기반 웹 

Banker 화면: 발화 인식, 수어 송출, 상담 진행
Deaf 화면: 수어 영상 수신, 수어 입력 및 문장 복원
Dashboard 화면: STT/NLP/합성 시간, CER 등 시스템 성능 분석
TailwindCSS + PWA 구성으로 반응형 UI 완성

infra/AWS EC2 + Nginx + Docker 기반 배포 환경 구성



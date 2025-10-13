# 🧱 Backend (Django + Uvicorn + Channels)

## 📦 Environment
- **Python** 3.12  
- **Django** 4.2 LTS  
- **Uvicorn** 0.30.x  
- **Channels** 4.1  
- **PostgreSQL** 16  
- **Redis** 7

---

## ⚙️ Setup

```bash
# 1️⃣ 가상환경 생성 및 활성화
python -m venv .venv
source .venv/bin/activate  # (Windows) .venv\Scripts\activate

# 2️⃣ 의존성 설치
pip install -r requirements.txt

---

## 🗄️ Database

DB 엔진: PostgreSQL

## 🚀 Run Server

- uvicorn
- channels

## 🧠 Notes

pnpm workspace는 루트 기준이므로, 백엔드는 별도의 가상환경(Python venv)에서 동작

frontend 폴더와 독립적으로 관리됨

Docker, Redis, PostgreSQL 전부 로컬/클라우드로 확장 가능



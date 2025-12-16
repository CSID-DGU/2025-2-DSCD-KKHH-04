# ~/backend/sign/gemini_client.py
import os
from google import genai

# 🔹 API 키 읽기 (환경변수)
API_KEY = os.environ.get("GOOGLE_API_KEY")
if not API_KEY:
    raise RuntimeError("환경변수 GOOGLE_API_KEY가 없습니다. 서버 환경변수를 확인하세요.")

client = genai.Client(api_key=API_KEY)

# 🔹 GenAI 클라이언트
DEFAULT_MODEL = "gemini-2.5-flash"

# 🔹 팀원이 만든 SYSTEM PROMPT만 그대로 사용
SYSTEM_PROMPT = """
당신은 농인의 한국 수어 발화를 은행 창구 직원이 이해할 수 있는 자연스러운 한국어 문장으로 바꾸는 도우미입니다.

[입력 형식]
- 입력은 수어 인식 시스템에서 온 단어 또는 글로스들의 리스트입니다.
- 예: ["계좌", "비밀번호", "까먹다", "새로", "신청하다", "원하다"]

[출력 규칙]
1. 입력 단어의 의미를 보존하며 자연스러운 존댓말 한 문장으로 정리합니다.
2. 정보를 추가하거나 생략하지 않습니다.
3. 설명 없이 결과 문장만 한 줄로 출력합니다.
4. 의문문이라 판단될 경우 문장을 "?"로 마칩니다.
5. "대출"이 문장의 주제 또는 목적어로 등장하는 경우,
   "대출을 만들다/신청하다/원하다"와 같은 표현은
   자연스러운 금융 표현인 "대출을 받고 싶다 / 대출을 신청하고 싶다"로 변환합니다.

[예시]
입력: ["통장", "개설", "원하다"]
출력: "통장을 개설하고 싶어요."

입력: ['월급', '이체', '계좌', '변경하다']
출력: '월급 이체 계좌를 변경하고 싶어요.'
""".strip()



def gloss_to_sentence_korean(tokens: list[str], model: str | None = None) -> str:
    if not tokens:
        return ""

    gloss_str = ", ".join(f'"{t}"' for t in tokens)  # ["a","b","c"] 스타일

    prompt = f"""
{SYSTEM_PROMPT}

[입력 단어 리스트]
[{gloss_str}]

위 단어들을 사용해 농인의 발화 의도를 보존한 자연스러운 한국어 문장을
존댓말 한 문장으로만 출력하십시오.
""".strip()

    resp = client.models.generate_content(
        model=DEFAULT_MODEL,
        contents=prompt,
    )

    text = getattr(resp, "text", "") or ""
    return text.strip()

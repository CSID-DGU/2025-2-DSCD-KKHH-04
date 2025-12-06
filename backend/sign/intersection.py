# backend/sign/intersection.py

from .gemini_client import gloss_to_sentence_korean

# 이미 정중체 문장처럼 끝나는 단어들 (안녕하세요, 감사합니다 등)
END_WITH_POLITE = ("요", "니다", "예", "다" )

# 단어가 1개여도 문장 구조가 필요하거나,
# "입니다"를 붙이면 이상한 단어들 → 무조건 Gemini로 보낼 목록
FORCE_GEMINI_WORDS = {
    # 원하면 계속 추가하면 됨
}


def _attach_polite_suffix(word: str) -> str:
    """단어 1개일 때 붙일 존댓말."""
    return word + "입니다"


def gloss_tokens_to_korean(tokens: list[str]) -> str:
    """
    글로스 토큰 → 한국어 문장 변환 규칙

    ● 토큰 개수 0개 → ""
    ● 토큰 1개:
        1) FORCE_GEMINI_WORDS 안에 있으면 → Gemini로 보내기
        2) 요/니다/예요/이에요 로 끝나면 → 그대로 반환
        3) 그 외 → '단어 + 입니다'
    ● 토큰 2개 이상 → Gemini 호출
    """
    # 0) 비어 있으면 반환
    if not tokens:
        return ""

    # 1) 단어 1개인 경우
    if len(tokens) == 1:
        word = tokens[0]

        # 1-1) 단어 하나라도 문장 구조가 필요한 것 → Gemini로 보내기
        if word in FORCE_GEMINI_WORDS:
            return gloss_to_sentence_korean(tokens)

        # 1-2) 이미 존댓말/문장 형식이면 그대로 사용
        if word.endswith(END_WITH_POLITE):
            return word

        # 1-3) 기본 규칙: "입니다"
        return _attach_polite_suffix(word)

    # 2) 두 단어 이상이면 Gemini로
    return gloss_to_sentence_korean(tokens)

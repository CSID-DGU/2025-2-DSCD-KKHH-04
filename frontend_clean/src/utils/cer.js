// frontend_clean/src/utils/cer.js

// ---------------------------------------------------------
// CER 계산을 위한 간단 정규화 함수
// - 공백 제거
// - 문장부호 제거
// - NFKC 정규화 (한글 호환성 문제 방지)
// ---------------------------------------------------------
export function normalizeForCER(str = "") {
  if (!str) return "";

  // 유니코드 정규화 (브라우저 호환)
  let s = str.normalize("NFKC");

  // 공백 제거
  s = s.replace(/\s+/g, "");

  // 문장부호 제거 (원하면 유지 가능)
  s = s.replace(/[^\w가-힣]/g, "");

  return s;
}

// ---------------------------------------------------------
// Character Error Rate 계산
// ref: 기준 문장
// hyp: 예측 문장(STT or NLP clean)
// CER = Levenshtein Distance / ref 길이
// ---------------------------------------------------------
export function computeCER(ref = "", hyp = "") {
  const r = normalizeForCER(ref);
  const h = normalizeForCER(hyp);

  const R = r.length;
  const H = h.length;

  if (R === 0) return H === 0 ? 0 : 1;

  // DP 테이블 생성
  const dp = Array.from({ length: R + 1 }, () =>
    Array(H + 1).fill(0)
  );

  for (let i = 0; i <= R; i++) dp[i][0] = i;
  for (let j = 0; j <= H; j++) dp[0][j] = j;

  for (let i = 1; i <= R; i++) {
    for (let j = 1; j <= H; j++) {
      const cost = r[i - 1] === h[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,     // 삭제
        dp[i][j - 1] + 1,     // 삽입
        dp[i - 1][j - 1] + cost // 치환
      );
    }
  }

  return dp[R][H] / R; // CER
}

// ---------------------------------------------------------
// 퍼센트 형태로 보고 싶을 때
// ---------------------------------------------------------
export function cerPercent(ref, hyp) {
  const v = computeCER(ref, hyp);
  return (v * 100).toFixed(1) + "%";
}

// frontend_clean/src/pages/Banker/Logs.jsx
import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * 공통 페이지 헤더
 */
function PanelHeader({ title }) {
  return (
    <div className="mb-4 text-lg font-semibold text-slate-900 flex items-center justify-between">
      <span>📜 {title}</span>
    </div>
  );
}

/**
 * 날짜 포맷터
 * createdAt(ISO 문자열 또는 일반 문자열)을 사람이 읽기 좋은 형태로 변환
 */
function formatTime(createdAt) {
  if (!createdAt) return "-";
  try {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return createdAt; // 이상하면 원문 그대로
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  } catch {
    return createdAt;
  }
}

/**
 * BankerLogs
 * - BankerSend / BankerSend2 에서 navigate("/banker/logs", { state: { errorEntry } }) 로 전달된 로그 표시
 * - 전달된 errorEntry는 localStorage("signanceErrorLogs") 에 누적 저장
 * - 이후에는 누적된 전체 목록을 테이블로 렌더링
 *
 * errorEntry 예시(여러 오류 쌍 버전):
 * {
 *   sttText: "정립심 예금에 가입하셨습니다.",
 *   cleanText: "적립식 예금에 가입하셨습니다.",
 *   spans: [
 *     { wrong: "정립심", correct: "적립식" },
 *     { wrong: "예금에 가입하셨습니다", correct: "적립식 예금에 가입하셨습니다" }
 *   ],
 *   createdAt: "2025-11-23T12:34:56.789Z"
 * }
 */
export default function BankerLogs() {
  const navigate = useNavigate();
  const location = useLocation();

  // BankerSend / Send2에서 넘어온 오류 데이터(없을 수도 있음)
  const errorEntry = location.state?.errorEntry || null;

  // logs 계산 (메모이제이션)
  const logs = useMemo(() => {
    try {
      // 기존에 저장된 로그 목록
      const saved =
        JSON.parse(localStorage.getItem("signanceErrorLogs") || "[]") || [];

      // 새 errorEntry가 있다면 맨 뒤에 추가
      if (errorEntry) {
        saved.push(errorEntry);
        localStorage.setItem("signanceErrorLogs", JSON.stringify(saved));
      }

      return saved;
    } catch (e) {
      console.warn("failed to parse signanceErrorLogs:", e);
      return errorEntry ? [errorEntry] : [];
    }
  }, [errorEntry]);

  return (
    <div className="w-full h-auto overflow-hidden">
      <main className="w-full px-4 sm:px-6 lg:px-10 pt-4 pb-8 bg-slate-50 min-h-[calc(100vh-56px)]">
        {/* 뒤로가기 (상담 화면으로) */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-3 text-xs text-slate-500 hover:text-slate-800"
        >
          ← 상담 화면으로 돌아가기
        </button>

        {/* 로그 리스트 카드 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <PanelHeader title="대화 로그 / 번역 오류 목록" />

          {/* 로그가 없을 경우 */}
          {logs.length === 0 ? (
            <p className="text-sm text-slate-500">
              아직 번역 오류 로그가 없습니다.
              상담 화면에서 "번역 오류" 버튼을 눌러 오류 문장을 등록할 수 있습니다.
            </p>
          ) : (
            <table className="w-full table-fixed text-xs text-slate-700">
              <colgroup>
                {/* 번호 / 시각 / STT / NLP / 잘못된 표현 / 수정 표현 */}
                <col className="w-[60px]" />
                <col className="w-[120px]" />
                <col className="w-[26%]" />
                <col className="w-[26%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
              </colgroup>

              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-2 py-2 text-left">번호</th>
                  <th className="px-2 py-2 text-left">시각</th>
                  <th className="px-2 py-2 text-left">STT 원문</th>
                  <th className="px-2 py-2 text-left">NLP 텍스트</th>
                  <th className="px-2 py-2 text-left">오류 구간</th>
                  <th className="px-2 py-2 text-left">수정 제안</th>
                </tr>
              </thead>

              <tbody>
                {logs.map((log, idx) => {
                  // 1) spans 배열이 있으면 그걸 사용
                  // 2) 없고, 예전 구조(wrongSpan/correctSpan)만 있으면 그걸 한 개짜리 배열로 래핑해서 사용
                  const spans =
                    Array.isArray(log.spans) && log.spans.length > 0
                      ? log.spans
                      : log.wrongSpan || log.correctSpan
                      ? [
                          {
                            wrong: log.wrongSpan,
                            correct: log.correctSpan,
                          },
                        ]
                      : [];

                  return (
                    <tr
                      key={idx}
                      className="border-b border-slate-100 align-top hover:bg-slate-50/70"
                    >
                      {/* 번호 (1부터) */}
                      <td className="px-2 py-2 text-[11px] text-slate-500">
                        {idx + 1}
                      </td>

                      {/* 시각 */}
                      <td className="px-2 py-2 text-[11px] text-slate-500">
                        {formatTime(log.createdAt)}
                      </td>

                      {/* STT 원문 전체 문장 */}
                      <td className="px-2 py-2">
                        <div className="line-clamp-3 whitespace-pre-wrap">
                          {log.sttText || "-"}
                        </div>
                      </td>

                      {/* NLP 결과 전체 문장 */}
                      <td className="px-2 py-2">
                        <div className="line-clamp-3 whitespace-pre-wrap">
                          {log.cleanText || "-"}
                        </div>
                      </td>

                      {/* 잘못된 표현 여러 개 */}
                      <td className="px-2 py-2">
                        <div className="space-y-1">
                          {spans.length === 0 ? (
                            <span className="text-slate-400">-</span>
                          ) : (
                            spans.map((s, i) => (
                              <div
                                key={i}
                                className="line-clamp-2 whitespace-pre-wrap text-red-600"
                              >
                                <span className="text-[11px] text-slate-400 mr-1">
                                  {i + 1}.
                                </span>
                                {s.wrong || "-"}
                              </div>
                            ))
                          )}
                        </div>
                      </td>

                      {/* 수정 제안 여러 개 */}
                      <td className="px-2 py-2">
                        <div className="space-y-1">
                          {spans.length === 0 ? (
                            <span className="text-slate-400">-</span>
                          ) : (
                            spans.map((s, i) => (
                              <div
                                key={i}
                                className="line-clamp-2 whitespace-pre-wrap text-emerald-700"
                              >
                                <span className="text-[11px] text-slate-400 mr-1">
                                  {i + 1}.
                                </span>
                                {s.correct || "-"}
                              </div>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}

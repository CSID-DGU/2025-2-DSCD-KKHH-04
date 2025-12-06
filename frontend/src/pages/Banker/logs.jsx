import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cerPercent } from "../../utils/cer";
import { XCircle } from "lucide-react";

function PanelHeader({ title }) {
  return (
    <div className="mb-4 text-lg font-semibold text-slate-900 flex items-center justify-between">
      <span>📜 {title}</span>
    </div>
  );
}

function formatTime(createdAt) {
  if (!createdAt) return "-";
  try {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return createdAt;
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

// 로그 고유 키 (dedupe + 삭제 공통 기준)
function makeLogKey(log) {
  return `${log.createdAt}__${log.sttText}__${log.cleanText}`;
}

// NLP 텍스트 안에서 오류 구간(wrong)만 빨간색 하이라이트
function highlightWrong(text, spans) {
  if (!text) return "-";
  if (!Array.isArray(spans) || spans.length === 0) return text;

  let result = text;

  spans.forEach((s) => {
    if (!s.wrong) return;

    const escaped = s.wrong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "g");

    result = result.replace(
      regex,
      `<span class="text-red-600 font-semibold">${s.wrong}</span>`
    );
  });

  return result;
}

// span 단위 CER -> 평균값으로 계산
function calcCerForLog(stt, clean, spans) {
  // spans 배열이 있으면 각 wrong/correct 쌍 단위로 CER 계산
  if (Array.isArray(spans) && spans.length > 0) {
    let sum = 0;
    let count = 0;

    spans.forEach((s) => {
      const wrong = (s.wrong || "").trim();
      const correct = (s.correct || "").trim();
      if (!wrong || !correct) return;

      const c = cerPercent(correct, wrong); // % 숫자
      if (!isNaN(c)) {
        sum += c;
        count += 1;
      }
    });

    if (count === 0) return null;
    return Number((sum / count).toFixed(1)); // 평균 한 자리
  }

  // span 정보가 없으면 전체 문장 기준 CER
  if (stt && clean) {
    return cerPercent(clean, stt);
  }
  return null;
}

export default function BankerLogs() {
  const navigate = useNavigate();
  const location = useLocation();

  const errorEntry = location.state?.errorEntry || null;

  const [logs, setLogs] = useState([]);

  // 1) 마운트 시 기존 로그 불러오기 + dedupe
  useEffect(() => {
    try {
      const saved =
        JSON.parse(localStorage.getItem("signanceErrorLogs") || "[]") || [];

      const deduped = [];
      const seen = new Set();

      for (const log of saved) {
        const key = makeLogKey(log);
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(log);
        }
      }

      localStorage.setItem("signanceErrorLogs", JSON.stringify(deduped));
      setLogs(deduped);
    } catch (e) {
      console.warn("failed to parse signanceErrorLogs:", e);
      setLogs([]);
    }
  }, []);

  // 2) 새 errorEntry 있으면 한 번만 추가
  useEffect(() => {
    if (!errorEntry) return;

    setLogs((prev) => {
      const exists = prev.some(
        (log) => makeLogKey(log) === makeLogKey(errorEntry)
      );
      if (exists) return prev;

      const next = [...prev, errorEntry];

      try {
        localStorage.setItem("signanceErrorLogs", JSON.stringify(next));
      } catch (e) {
        console.warn("failed to save signanceErrorLogs:", e);
      }

      return next;
    });
  }, [errorEntry]);

  // 행별 삭제
  const handleDeleteOne = (targetLog) => {
    if (!window.confirm("해당 로그를 삭제할까요?")) return;

    setLogs((prev) => {
      const filtered = prev.filter(
        (log) => makeLogKey(log) !== makeLogKey(targetLog)
      );
      try {
        localStorage.setItem("signanceErrorLogs", JSON.stringify(filtered));
      } catch (e) {
        console.warn("failed to save signanceErrorLogs:", e);
      }
      return filtered;
    });
  };

  // 전체 삭제
  const handleClearAll = () => {
    if (!window.confirm("정말 모든 번역 오류 로그를 삭제할까요?")) return;

    try {
      localStorage.removeItem("signanceErrorLogs");
    } catch (e) {
      console.warn("failed to clear signanceErrorLogs:", e);
    }
    setLogs([]);
  };

  return (
    <div className="w-full h-auto overflow-hidden">
      <main className="w-full px-4 sm:px-6 lg:px-10 pt-4 pb-8 bg-slate-50 min-h-[calc(100vh-56px)]">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-3 text-xs text-slate-500 hover:text-slate-800"
        >
          ← 상담 화면으로 돌아가기
        </button>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <PanelHeader title="대화 로그 / 번역 오류 목록" />
            {logs.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="ml-4 rounded-md border border-red-100 bg-red-50 px-2 py-1 text-[11px] text-red-600 hover:bg-red-100"
              >
                🗑 전체 삭제
              </button>
            )}
          </div>

          {logs.length === 0 ? (
            <p className="text-sm text-slate-500">
              아직 번역 오류 로그가 없습니다.
              상담 화면에서 "번역 오류" 버튼을 눌러 오류 문장을 등록할 수 있습니다.
            </p>
          ) : (
            <table className="w-full table-fixed text-xs text-slate-700">
              <colgroup>
                {[
                  <col key={1} className="w-[40px]" />,
                  <col key={2} className="w-[110px]" />,
                  <col key={3} className="w-[30%]" />,
                  <col key={4} className="w-[30%]" />,
                  <col key={5} className="w-[6%]" />,
                  <col key={6} className="w-[10%]" />,
                  <col key={7} className="w-[10%]" />,
                  <col key={8} className="w-[40px]" />,
                ]}
              </colgroup>

              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-2 py-2 text-left">번호</th>
                  <th className="px-2 py-2 text-left">시간</th>
                  <th className="px-2 py-2 text-left">STT 원문</th>
                  <th className="px-2 py-2 text-left">NLP 텍스트</th>
                  <th className="px-2 py-2 text-left">CER</th>
                  <th className="px-2 py-2 text-left">오류 구간</th>
                  <th className="px-2 py-2 text-left">수정 제안</th>
                  <th className="px-2 py-2 text-left" />
                </tr>
              </thead>

              <tbody>
                {logs.map((log, idx) => {
                  const stt = log.sttText || "";
                  const clean = log.cleanText || "";

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

                  const cer = calcCerForLog(stt, clean, spans);

                  return (
                    <tr
                      key={makeLogKey(log) || idx}
                      className="border-b border-slate-100 align-top hover:bg-slate-50/70"
                    >
                      <td className="px-2 py-2 text-[11px] text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="px-2 py-2 text-[11px] text-slate-500">
                        {formatTime(log.createdAt)}
                      </td>

                      {/* STT 원문 */}
                      <td className="px-2 py-2">
                        <div className="line-clamp-3 whitespace-pre-wrap">
                          {stt || "-"}
                        </div>
                      </td>

                      {/* NLP 텍스트: 오류 구간 하이라이트 */}
                      <td className="px-2 py-2">
                        <div
                          className="line-clamp-3 whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{
                            __html: highlightWrong(clean, spans),
                          }}
                        />
                      </td>

                      {/* CER */}
                      <td className="px-2 py-2">
                        <span className="text-[11px] text-slate-700">
                          {cer ?? "-"}
                        </span>
                      </td>

                      {/* 오류 구간 목록 */}
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

                      {/* 수정 제안 목록 */}
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

                      {/* X 아이콘 삭제 버튼 */}
                      <td className="px-2 py-2 text-center align-top">
                        <button
                          type="button"
                          onClick={() => handleDeleteOne(log)}
                          className="inline-flex items-center justify-center"
                        >
                          <XCircle className="w-4 h-4 text-red-500 hover:text-red-600 hover:scale-110 transition-transform" />
                        </button>
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

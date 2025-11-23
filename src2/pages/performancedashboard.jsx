// frontend_clean/src/pages/performancedashboard.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { XCircle } from "lucide-react";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function msToSec(ms) {
  if (ms == null || isNaN(ms)) return "-";
  return (ms / 1000).toFixed(2);
}

function formatTs(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(
    d.getSeconds()
  ).padStart(2, "0")}`;
}

export default function PerformanceDashboard() {
  const [logs, setLogs] = useState([]);
  const navigate = useNavigate();

  const [sessionStart, setSessionStart] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLog, setDetailLog] = useState(null);

  useEffect(() => {
    let session = sessionStorage.getItem("signanceSessionStart");
    if (!session) {
      session = Date.now();
      sessionStorage.setItem("signanceSessionStart", session);
    }
    setSessionStart(Number(session));
  }, []);

  // 로컬 로그 로드 + 최신순으로 정렬
  useEffect(() => {
    try {
      const raw = localStorage.getItem("signanceLatencyLogs");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.sort((a, b) => new Date(b.ts) - new Date(a.ts));
        setLogs(parsed);
      }
    } catch (e) {}
  }, []);

  // 서버 로그 로드 + 최신순으로 정렬
  useEffect(() => {
    async function fetchServerLogs() {
      try {
        const res = await fetch(`${API_BASE}/api/accounts/speech_logs/`);
        if (!res.ok) return;
        const serverLogs = await res.json();
        if (!Array.isArray(serverLogs)) return;

        setLogs((prev) => {
          const merged = [...prev];
          serverLogs.forEach((s) => {
            const key = `${s.ts}-${s.sentence}`;
            if (!merged.some((l) => `${l.ts}-${l.sentence}` === key)) {
              merged.push(s);
            }
          });

          merged.sort((a, b) => new Date(b.ts) - new Date(a.ts));

          localStorage.setItem("signanceLatencyLogs", JSON.stringify(merged));
          return merged;
        });
      } catch (e) {}
    }
    fetchServerLogs();
  }, []);

  const averages = useMemo(() => {
    if (!logs.length) return {};
    const avg = (k) =>
      logs.reduce((a, c) => a + (Number(c[k]) || 0), 0) / logs.length;
    return {
      stt: avg("stt"),
      nlp: avg("nlp"),
      mapping: avg("mapping"),
      synth: avg("synth"),
      total: avg("total"),
    };
  }, [logs]);

  // ★ 최신순 기준 divider 계산
  const dividerIndex = useMemo(() => {
    if (!sessionStart) return null;
    return logs.findIndex(
      (log) => new Date(log.ts).getTime() < sessionStart
    );
  }, [logs, sessionStart]);

  // ★ 삭제 (이제 index 그대로 사용)
  const handleDelete = (index) => {
    if (!window.confirm("해당 로그를 삭제할까요?")) return;

    setLogs((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      localStorage.setItem("signanceLatencyLogs", JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="w-full h-auto overflow-hidden">
      <main className="w-full px-4 sm:px-6 lg:px-10 pt-4 pb-10 bg-slate-50 min-h-[calc(100vh-56px)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              파이프라인 성능 대시보드
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Banker 화면에서 전송한 음성의 STT / NLP / 매핑 / 합성 지연시간 기록
            </p>
          </div>

          <button
            onClick={() => navigate(-1)}
            className="px-4 h-10 rounded-lg border border-slate-300 text-sm text-slate-700 bg-white hover:bg-slate-50"
          >
            ← 뒤로가기
          </button>
        </div>

        <section className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <SummaryCard label="총 샘플" value={`${logs.length}회`} />
          <SummaryCard label="평균 STT" value={`${msToSec(averages.stt)} s`} />
          <SummaryCard label="평균 NLP" value={`${msToSec(averages.nlp)} s`} />
          <SummaryCard label="평균 합성" value={`${msToSec(averages.synth)} s`} />
          <SummaryCard label="평균 총합" value={`${msToSec(averages.total)} s`} />
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-900">
              개별 측정 로그
            </h2>

            <button
              onClick={() => {
                if (!window.confirm("정말 모든 로그를 초기화할까요?")) return;
                setLogs([]);
                localStorage.removeItem("signanceLatencyLogs");
              }}
              className="px-3 h-8 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50"
            >
              로그 초기화
            </button>
          </div>

          {logs.length === 0 ? (
            <p className="text-sm text-slate-500">아직 저장된 로그 없음.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs sm:text-sm text-left text-slate-700">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-3 py-2 w-[50px]">#</th>
                    <th className="px-3 py-2 w-[120px]">시간</th>
                    <th className="px-3 py-2 w-[420px]">문장</th>
                    <th className="px-3 py-2 w-[90px] text-right">STT(s)</th>
                    <th className="px-3 py-2 w-[90px] text-right">NLP(s)</th>
                    <th className="px-3 py-2 w-[90px] text-right">매핑(s)</th>
                    <th className="px-3 py-2 w-[90px] text-right">합성(s)</th>
                    <th className="px-3 py-2 w-[90px] text-right">총합(s)</th>
                    <th className="px-3 py-2 w-[30px]" />
                  </tr>
                </thead>

                <tbody>
                  {logs.map((log, i) => {
                    const isDivider = dividerIndex === i;

                    return (
                      <React.Fragment key={`${log.ts}-${i}`}>
                        {isDivider && (
                          <tr>
                            <td colSpan={9} className="py-2">
                              <div className="border-t border-slate-300 my-2 text-center text-xs text-slate-500">
                                ─── 이전 세션 기록 ───
                              </div>
                            </td>
                          </tr>
                        )}

                        <tr className={i % 2 ? "bg-slate-50/80" : "bg-white"}>
                          <td className="px-3 py-1.5 w-[50px]">{logs.length - i}</td>
                          <td className="px-3 py-1.5 w-[120px]">
                            {formatTs(log.ts)}
                          </td>

                          <td
                            className="px-3 py-1.5 w-[420px] max-w-[460px] truncate cursor-pointer hover:underline underline-offset-2"
                            onClick={() => {
                              setDetailLog(log);
                              setDetailOpen(true);
                            }}
                          >
                            {log.sentence || "-"}
                          </td>

                          <td className="px-3 py-1.5 w-[90px] text-right">
                            {msToSec(log.stt)}
                          </td>
                          <td className="px-3 py-1.5 w-[90px] text-right">
                            {msToSec(log.nlp)}
                          </td>
                          <td className="px-3 py-1.5 w-[90px] text-right">
                            {msToSec(log.mapping)}
                          </td>
                          <td className="px-3 py-1.5 w-[90px] text-right">
                            {msToSec(log.synth)}
                          </td>
                          <td className="px-3 py-1.5 w-[90px] text-right font-medium">
                            {msToSec(log.total)}
                          </td>

                          <td className="px-1 py-1.5 w-[30px] text-center">
                            <button
                              type="button"
                              onClick={() => handleDelete(i)}
                              className="inline-flex items-center justify-center"
                            >
                              <XCircle className="w-4 h-4 text-red-500 hover:text-red-600 hover:scale-110 transition-transform" />
                            </button>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {detailOpen && detailLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-[90%] max-w-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-slate-900">
                상세 로그
              </h3>
              <button
                type="button"
                onClick={() => {
                  setDetailOpen(false);
                  setDetailLog(null);
                }}
                className="text-slate-400 hover:text-slate-700 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-sm text-slate-800">
              <div>
                <div className="text-xs text-slate-500 mb-0.5">시간</div>
                <div>{formatTs(detailLog.ts)}</div>
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-0.5">문장</div>
                <div className="whitespace-pre-wrap">
                  {detailLog.sentence || "-"}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-0.5">STT 텍스트</div>
                <div className="whitespace-pre-wrap">
                  {detailLog.stt_text ||
                    detailLog.sttText ||
                    detailLog.raw_stt ||
                    detailLog.text ||
                    "-"}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-0.5">NLP 텍스트</div>
                <div className="whitespace-pre-wrap">
                  {detailLog.nlp_text ||
                    detailLog.nlpText ||
                    detailLog.cleaned_text ||
                    detailLog.clean_text ||
                    "-"}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-0.5">
                  매칭된 글로스
                </div>
                <div className="whitespace-pre-wrap">
                  {detailLog.gloss_labels?.length > 0
                    ? detailLog.gloss_labels.join(", ")
                    : detailLog.gloss?.length > 0
                    ? detailLog.gloss.join(", ")
                    : "-"}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 mt-2">
                <DetailMetric
                  label="STT 지연"
                  value={`${msToSec(detailLog.stt)} s`}
                />
                <DetailMetric
                  label="NLP 지연"
                  value={`${msToSec(detailLog.nlp)} s`}
                />
                <DetailMetric
                  label="매핑 지연"
                  value={`${msToSec(detailLog.mapping)} s`}
                />
                <DetailMetric
                  label="합성 지연"
                  value={`${msToSec(detailLog.synth)} s`}
                />
                <DetailMetric
                  label="총합 지연"
                  value={`${msToSec(detailLog.total)} s`}
                />
              </div>

              <div className="flex justify-end pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setDetailOpen(false);
                    setDetailLog(null);
                  }}
                  className="px-4 h-9 rounded-lg text-sm border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-col gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-base font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function DetailMetric({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className="text-sm text-slate-900">{value}</span>
    </div>
  );
}

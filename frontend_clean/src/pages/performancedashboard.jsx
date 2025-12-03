// frontend_clean/src/pages/PerformanceDashboard.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { XCircle } from "lucide-react";
import { computeCER } from "../utils/cer";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function msToSec(ms) {
  if (ms == null || isNaN(ms)) return "-";
  return (ms / 1000).toFixed(2);
}

// 여러 형태의 시간 값을 다 받아주는 파서
function parseLogDate(ts) {
  if (!ts) return null;

  // Date 객체
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;

  // 숫자(ms)
  if (typeof ts === "number") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof ts === "string") {
    // 1) 일반 ISO 문자열
    let d = new Date(ts);
    if (!isNaN(d.getTime())) return d;

    // 2) now_ts(): "YYYYMMDD_HHMMSS"
    const m = ts.match(
      /^(\d{4})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})$/
    );
    if (m) {
      const [, y, mo, da, h, mi, s] = m;
      d = new Date(
        Number(y),
        Number(mo) - 1,
        Number(da),
        Number(h),
        Number(mi),
        Number(s)
      );
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

function formatTs(ts) {
  const d = parseLogDate(ts);
  if (!d) return "-";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(
    2,
    "0"
  )}:${String(d.getSeconds()).padStart(2, "0")}`;
}

// 로그 객체에서 시간 후보 뽑기
function getLogTs(log) {
  if (!log) return null;
  return (
    log.ts ||
    log.createdAt ||
    log.created_at ||
    log.timestamp ||
    log.time ||
    null
  );
}

// 정렬용 숫자(ms)
function getLogTimeValue(log) {
  const cand = getLogTs(log);
  const d = parseLogDate(cand);
  return d ? d.getTime() : 0;
}

export default function PerformanceDashboard() {
  const [logs, setLogs] = useState([]);
  const navigate = useNavigate();

  // 🔹 자동 세션 구분선 관련 state 제거됨
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLog, setDetailLog] = useState(null);

  // 로컬 로그 로드 + ts 보정 + 최신순 정렬
  useEffect(() => {
    try {
      const raw = localStorage.getItem("signanceLatencyLogs");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const normalized = parsed.map((l) => ({
          ...l,
          ts:
            l.ts ||
            l.createdAt ||
            l.created_at ||
            l.timestamp ||
            l.time ||
            null,
        }));
        normalized.sort((a, b) => getLogTimeValue(b) - getLogTimeValue(a));
        setLogs(normalized);
      }
    } catch (e) {
      console.error("[PerformanceDashboard] load local logs error:", e);
    }
  }, []);

  // 서버 로그 로드 + ts 보정 + 최신순 정렬
  useEffect(() => {
    async function fetchServerLogs() {
      try {
        const res = await fetch(`${API_BASE}/api/accounts/speech_logs/`);
        if (!res.ok) return;
        const serverRaw = await res.json();

        // 응답이 [] 또는 {logs: []}
        const arr = Array.isArray(serverRaw)
          ? serverRaw
          : Array.isArray(serverRaw.logs)
          ? serverRaw.logs
          : [];

        const serverLogs = arr.map((s) => ({
          ...s,
          ts:
            s.ts ||
            s.createdAt ||
            s.created_at ||
            s.timestamp ||
            s.time ||
            null,
        }));

        setLogs((prev) => {
          const merged = [...prev];
          serverLogs.forEach((s) => {
            const key = `${getLogTs(s)}-${s.sentence || ""}`;
            if (
              !merged.some(
                (l) => `${getLogTs(l)}-${l.sentence || ""}` === key
              )
            ) {
              merged.push(s);
            }
          });

          merged.sort((a, b) => getLogTimeValue(b) - getLogTimeValue(a));
          localStorage.setItem("signanceLatencyLogs", JSON.stringify(merged));
          return merged;
        });
      } catch (e) {
        console.error("[PerformanceDashboard] fetch server logs error:", e);
      }
    }
    fetchServerLogs();
  }, []);

  // 🔹 평균 계산 시 dividerBefore 같은 플래그는 그냥 무시 (숫자 아니면 0으로 처리되니 그대로 둬도 됨)
  const averages = useMemo(() => {
    if (!logs.length) return {};
    const realLogs = logs.filter((l) => !l._isDividerOnly); // 혹시 나중에 divider 전용 타입 생기면 대비
    if (!realLogs.length) return {};
    const avg = (k) =>
      realLogs.reduce((a, c) => a + (Number(c[k]) || 0), 0) /
      realLogs.length;
    return {
      stt: avg("stt"),
      nlp: avg("nlp"),
      mapping: avg("mapping"),
      synth: avg("synth"),
      total: avg("total"),
      utter: avg("utter_ms"), // 발화 시간(ms)
      video: avg("video_ms"), // 영상 길이(ms)
    };
  }, [logs]);

  // session_id 기준 번호 생성 (1-1, 1-2, 2-1 ...)
  // session_id 기준 번호 생성 (1-1, 1-2, 2-1 ...)
  const numberedRows = useMemo(() => {
    if (!logs.length) return [];

    // 1) 세션별로 로그 모으기 (원래 인덱스도 같이 저장)
    const bySession = new Map(); // sid -> [{ log, idx }]
    logs.forEach((log, idx) => {
      const sid = log.session_id || log.sessionId || "unknown";
      if (!bySession.has(sid)) bySession.set(sid, []);
      bySession.get(sid).push({ log, idx });
    });

    // 2) 세션 번호(sessionNo)는 "현재 logs 순서" 기준으로 부여
    //    (가장 최근에 첫 등장한 세션이 1번, 그 다음이 2번...)
    const sessionOrder = new Map(); // sid -> sessionNo
    let nextSessionNo = 1;
    logs.forEach((log) => {
      const sid = log.session_id || log.sessionId || "unknown";
      if (!sessionOrder.has(sid)) {
        sessionOrder.set(sid, nextSessionNo++);
      }
    });

    // 3) 각 세션 안에서 시간 오름차순으로 정렬해서
    //    1,2,3,... 번호 매기기
    const perLogSeq = new Map(); // idx -> { sessionNo, seq }

    bySession.forEach((arr, sid) => {
      const sessionNo = sessionOrder.get(sid) ?? 0;

      // 해당 세션의 로그들을 시간 오름차순(과거 -> 최근)으로 정렬
      arr.sort(
        (a, b) => getLogTimeValue(a.log) - getLogTimeValue(b.log)
      );

      arr.forEach((item, i) => {
        perLogSeq.set(item.idx, {
          sessionNo,
          seq: i + 1, // 1부터 시작
        });
      });
    });

    // 4) 최종 반환: 원래 logs 순서를 유지하면서 displayIndex만 붙이기
    return logs.map((log, idx) => {
      const info = perLogSeq.get(idx) || { sessionNo: 0, seq: 0 };
      return {
        ...log,
        _sessionNo: info.sessionNo,
        displayIndex: `${info.sessionNo}-${info.seq}`,
      };
    });
  }, [logs]);


  // 삭제
  const handleDelete = (index) => {
    if (!window.confirm("해당 로그를 삭제할까요?")) return;

    setLogs((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      localStorage.setItem("signanceLatencyLogs", JSON.stringify(next));
      return next;
    });
  };

  // 🔹 구분선 토글: 해당 인덱스 로그 위에 구분선 표시 여부를 토글
  const handleToggleDivider = (index) => {
    setLogs((prev) => {
      const next = prev.map((log, i) =>
        i === index ? { ...log, _dividerBefore: !log._dividerBefore } : log
      );
      localStorage.setItem("signanceLatencyLogs", JSON.stringify(next));
      return next;
    });
  };

  const realSampleCount = useMemo(
    () => logs.filter((l) => !l._isDividerOnly).length,
    [logs]
  );

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

        {/* 요약 카드: 발화 / 영상 평균 추가 */}
        <section className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
          <SummaryCard label="총 샘플" value={`${realSampleCount}회`} />
          <SummaryCard label="평균 STT" value={`${msToSec(averages.stt)} s`} />
          <SummaryCard label="평균 NLP" value={`${msToSec(averages.nlp)} s`} />
          <SummaryCard
            label="평균 합성"
            value={`${msToSec(averages.synth)} s`}
          />
          <SummaryCard
            label="평균 총합"
            value={`${msToSec(averages.total)} s`}
          />
          <SummaryCard
            label="평균 발화 길이"
            value={`${msToSec(averages.utter)} s`}
          />
          <SummaryCard
            label="평균 영상 길이"
            value={`${msToSec(averages.video)} s`}
          />
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-900">
              개별 측정 로그
            </h2>

            <div className="flex items-center gap-2">
              {/* 필요하면 나중에 "위에 구분선 하나 추가" 같은 전역 버튼도 여기 배치 가능 */}
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
          </div>

          {logs.length === 0 ? (
            <p className="text-sm text-slate-500">아직 저장된 로그 없음.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs sm:text-sm text-left text-slate-700">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-3 py-2 w-[70px]">#</th>
                    <th className="px-3 py-2 w-[120px]">시간</th>
                    <th className="px-3 py-2 w-[420px]">문장</th>
                    <th className="px-3 py-2 w-[90px] text-right">STT(s)</th>
                    <th className="px-3 py-2 w-[90px] text-right">NLP(s)</th>
                    <th className="px-3 py-2 w-[90px] text-right">매핑(s)</th>
                    <th className="px-3 py-2 w-[90px] text-right">합성(s)</th>
                    {/* 새 컬럼: 발화 / 영상 길이 */}
                    <th className="px-3 py-2 w-[90px] text-right">발화(s)</th>
                    <th className="px-3 py-2 w-[90px] text-right">영상(s)</th>
                    <th className="px-3 py-2 w-[90px] text-right">총합(s)</th>
                    <th className="px-3 py-2 w-[90px] text-right">CER</th>
                    {/* 🔹 새 컬럼: 구분선 토글 버튼 */}
                    <th className="px-3 py-2 w-[70px] text-center">
                      구분선
                    </th>
                    <th className="px-3 py-2 w-[30px]" />
                  </tr>
                </thead>

                <tbody>
                  {numberedRows.map((log, i) => {
                    const sttText =
                      log.stt_text ||
                      log.sttText ||
                      log.raw_stt ||
                      log.text ||
                      "";
                    const nlpText =
                      log.nlp_text ||
                      log.nlpText ||
                      log.cleaned_text ||
                      log.clean_text ||
                      "";

                    const cerValue =
                      sttText && nlpText
                        ? computeCER(sttText, nlpText)
                        : null;

                    const hasDividerBefore = !!log._dividerBefore;

                    return (
                      <React.Fragment key={`${getLogTs(log) ?? "no-ts"}-${i}`}>
                        {/* 🔹 사용자가 켠 구분선 */}
                        {hasDividerBefore && (
                          <tr>
                            <td colSpan={13} className="py-2">
                              <div className="border-t border-dashed border-slate-400 my-2 text-center text-[11px] text-slate-500">
                                ── 사용자 지정 구분선 ──
                              </div>
                            </td>
                          </tr>
                        )}

                        <tr className={i % 2 ? "bg-slate-50/80" : "bg-white"}>
                          {/* # 칸: 1-1, 1-2 형식 */}
                          <td className="px-3 py-1.5 w-[70px] text-center">
                            {log.displayIndex}
                          </td>

                          {/* 시간 */}
                          <td className="px-3 py-1.5 w-[120px]">
                            {formatTs(log.ts || getLogTs(log))}
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

                          {/* 발화 / 영상 길이 */}
                          <td className="px-3 py-1.5 w-[90px] text-right">
                            {msToSec(log.utter_ms)}
                          </td>
                          <td className="px-3 py-1.5 w-[90px] text-right">
                            {msToSec(log.video_ms)}
                          </td>

                          <td className="px-3 py-1.5 w-[90px] text-right font-medium">
                            {msToSec(log.total)}
                          </td>

                          <td className="px-3 py-1.5 w-[90px] text-right">
                            {cerValue != null
                              ? `${(cerValue * 100).toFixed(1)}%`
                              : "-"}
                          </td>

                          {/* 🔹 구분선 토글 버튼 */}
                          <td className="px-1 py-1.5 w-[70px] text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleDivider(i)}
                              className={`px-2 py-0.5 rounded-lg text-[11px] border transition-colors ${
                                hasDividerBefore
                                  ? "border-blue-500 text-blue-600 bg-blue-50"
                                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {hasDividerBefore ? "해제" : "추가"}
                            </button>
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
                <div>{formatTs(detailLog.ts || getLogTs(detailLog))}</div>
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

              {/* 상세창에도 발화 / 영상 길이 표시 */}
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
                <DetailMetric
                  label="발화 길이"
                  value={`${msToSec(detailLog.utter_ms)} s`}
                />
                <DetailMetric
                  label="영상 길이"
                  value={`${msToSec(detailLog.video_ms)} s`}
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

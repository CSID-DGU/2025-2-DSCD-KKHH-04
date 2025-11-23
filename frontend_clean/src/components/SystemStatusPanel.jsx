// src/components/SystemStatusPanel.jsx
import React, { useEffect, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

/*
  기대하는 백엔드 엔드포인트 (나중에 맞게 수정해도 됨)

  1) 상태 요약
  GET  /api/status/summary/

  예시 응답:
  {
    "backend": { "status": "ok" },
    "stt": {
      "loaded": true,
      "avg_latency_ms": 1300,
      "success_rate": 92.3
    },
    "gemini": { "configured": true },
    "sign_match": { "success_rate": 95.0 }
  }

  2) 스냅샷 목록
  GET  /api/pipelines/snapshots/?limit=20

  예시 응답: [ { timestamp, snapshot_index, stt_text, whisper_latency_ms, gloss, gloss_ids, ... }, ... ]
*/

export default function SystemStatusPanel() {
  const [summary, setSummary] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingSnapshots, setLoadingSnapshots] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // 상태 요약 가져오기
    const fetchSummary = async () => {
      try {
        setLoadingSummary(true);
        const res = await fetch(`${API_BASE}/api/status/summary/`);
        if (!res.ok) throw new Error("요약 응답 오류");
        const json = await res.json();
        setSummary(json);
      } catch (e) {
        console.error(e);
        setError("시스템 요약 정보를 불러오지 못했습니다.");
      } finally {
        setLoadingSummary(false);
      }
    };

    // 스냅샷 목록 가져오기
    const fetchSnapshots = async () => {
      try {
        setLoadingSnapshots(true);
        const res = await fetch(
          `${API_BASE}/api/pipelines/snapshots/?limit=20`
        );
        if (!res.ok) throw new Error("스냅샷 응답 오류");
        const json = await res.json();
        setSnapshots(Array.isArray(json) ? json : []);
      } catch (e) {
        console.error(e);
        setError("스냅샷 정보를 불러오지 못했습니다.");
      } finally {
        setLoadingSnapshots(false);
      }
    };

    fetchSummary();
    fetchSnapshots();
  }, []);

  return (
    <section className="mt-4 space-y-6">
      {/* 타이틀 & 설명 */}
      <header>
        <h2 className="text-lg font-semibold text-slate-900">
          시스템 상태
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          실시간 STT · 수어 파이프라인의 작동 현황과 최근 인식 로그를
          확인할 수 있습니다.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 요약 카드 영역 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="백엔드 서버"
          loading={loadingSummary}
          ok={summary?.backend?.status === "ok"}
          description={
            summary?.backend?.status === "ok"
              ? "요청 응답 상태 양호"
              : "응답 없음 또는 오류"
          }
        />

        <StatusCard
          title="STT 엔진"
          loading={loadingSummary}
          ok={!!summary?.stt?.loaded}
          description={
            loadingSummary
              ? ""
              : summary?.stt?.loaded
              ? `평균 지연 ${
                  summary?.stt?.avg_latency_ms
                    ? Math.round(summary.stt.avg_latency_ms) + " ms"
                    : "정보 없음"
                }`
              : "모델 미로드 또는 오류"
          }
          footer={
            summary?.stt?.success_rate != null
              ? `최근 성공률 ${summary.stt.success_rate.toFixed(1)}%`
              : ""
          }
        />

        <StatusCard
          title="Gemini API"
          loading={loadingSummary}
          ok={!!summary?.gemini?.configured}
          description={
            loadingSummary
              ? ""
              : summary?.gemini?.configured
              ? "키 설정 및 연결 정상"
              : "환경 변수 미설정 또는 호출 실패"
          }
        />

        <StatusCard
          title="수어 매칭"
          loading={loadingSummary}
          ok={summary?.sign_match?.status !== "error"}
          description={
            loadingSummary
              ? ""
              : summary?.sign_match?.status === "error"
              ? "매칭 오류 발생"
              : "정상 처리 중"
          }
          footer={
            summary?.sign_match?.success_rate != null
              ? `최근 성공률 ${summary.sign_match.success_rate.toFixed(1)}%`
              : ""
          }
        />
      </div>

      {/* 최근 스냅샷 리스트 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-slate-900">
            최근 STT · 글로스 스냅샷
          </h3>
          <p className="text-xs text-slate-400">
            마지막 20개 인식 결과 기준
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">
                  시간
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">
                  STT 문장
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">
                  STT(ms)
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">
                  글로스 수
                </th>
              </tr>
            </thead>
            <tbody>
              {loadingSnapshots && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-sm text-slate-400"
                  >
                    스냅샷을 불러오는 중입니다…
                  </td>
                </tr>
              )}

              {!loadingSnapshots && snapshots.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-sm text-slate-400"
                  >
                    표시할 스냅샷이 없습니다.
                  </td>
                </tr>
              )}

              {!loadingSnapshots &&
                snapshots.map((s) => {
                  const key = `${s.timestamp || ""}_${s.snapshot_index || ""}`;
                  const glossCount = s.gloss?.length ?? 0;
                  const latency = s.whisper_latency_ms
                    ? Math.round(s.whisper_latency_ms)
                    : null;

                  return (
                    <tr key={key} className="border-t border-slate-100">
                      <td className="px-4 py-2 align-top whitespace-nowrap text-xs text-slate-500">
                        {s.timestamp || "-"}
                      </td>
                      <td className="px-4 py-2 align-top">
                        <div className="text-sm text-slate-900 line-clamp-2">
                          {s.stt_text || "(텍스트 없음)"}
                        </div>

                        {/* 상세 글로스/ID 토글 */}
                        <details className="mt-1 text-xs text-slate-500">
                          <summary className="cursor-pointer select-none">
                            글로스 / ID 보기
                          </summary>
                          <div className="mt-1 space-y-1">
                            <div>
                              글로스:{" "}
                              {Array.isArray(s.gloss) && s.gloss.length > 0
                                ? s.gloss.join(" / ")
                                : "-"}
                            </div>
                            <div>
                              ID:{" "}
                              {Array.isArray(s.gloss_ids) &&
                              s.gloss_ids.length > 0
                                ? s.gloss_ids.join(", ")
                                : "-"}
                            </div>
                            {s.snapshot_mode && (
                              <div className="text-[11px] text-slate-400">
                                mode={s.snapshot_mode}, index=
                                {s.snapshot_index}
                              </div>
                            )}
                          </div>
                        </details>
                      </td>
                      <td className="px-4 py-2 align-top text-right text-sm text-slate-700">
                        {latency != null ? `${latency}` : "-"}
                      </td>
                      <td className="px-4 py-2 align-top text-right text-sm text-slate-700">
                        {glossCount}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function StatusCard({ title, loading, ok, description, footer }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-500">{title}</div>
        {loading ? (
          <span className="text-[11px] text-slate-400">로딩중…</span>
        ) : (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
              ok
                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                : "bg-rose-50 text-rose-700 border border-rose-100"
            }`}
          >
            <span
              className={`mr-1 h-1.5 w-1.5 rounded-full ${
                ok ? "bg-emerald-500" : "bg-rose-500"
              }`}
            />
            {ok ? "정상" : "주의"}
          </span>
        )}
      </div>
      <div className="text-sm text-slate-900 mt-1">
        {loading ? "상태를 불러오는 중입니다." : description || ""}
      </div>
      {footer && !loading && (
        <div className="mt-1 text-xs text-slate-500">{footer}</div>
      )}
    </div>
  );
}

// frontend_clean/src/pages/Banker/Send.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import NavTabs from "../../components/NavTabs";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export default function BankerSend() {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  return (
    <div className="w-full h-auto overflow-hidden">
      <main className="w-full px-4 sm:px-6 lg:px-10 pt-4 pb-8 bg-slate-50 min-h-[calc(100vh-56px)]">
        <NavTabs
          rightSlot={<SendReceiveToggle active="send" />}
          onTabClick={(idx) => {
            // 0: 실시간 인식, 1: 대화 로그, 2: 고객 메모, 3: 시스템 상태(=성능 대시보드)
            if (idx === 1) {
              navigate("/banker/logs");
            }
            if (idx === 3) {
              navigate("/performance");
            }
          }}
        />

        <CustomerBar />
        <ChatPanel />
        <ASRPanel />
      </main>
    </div>
  );
}

/* ---------------- CustomerBar ---------------- */
function CustomerBar() {
  return (
    <section className="mt-4 w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 text-lg font-semibold text-slate-800">
        <UserIcon className="h-5 w-5 text-slate-700" />
        <span>고객 정보</span>
      </div>

      <div className="mt-3 ml-[2.1rem] text-slate-800 text-base font-medium">
        김희희
        <span className="mx-2 text-slate-400">|</span>
        XX은행 1002-123-4567
      </div>
    </section>
  );
}

/* ---------------- ChatPanel ---------------- */
function ChatPanel() {
  const [messages, setMessages] = useState([
    { from: "agent", text: "안녕하세요. 어떤 업무 도와드릴까요?" },
    { from: "user", text: "안녕하세요. 새 통장을 만들고 싶어요." },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { from: "agent", text }]);
    setInput("");
  };

  return (
    <section className="mt-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col">
      <div className="flex items-center gap-2 text-lg font-semibold text-slate-800">
        <BubbleIcon />
        <span>상담 대화창</span>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 h-[318px] overflow-y-auto">
        {messages.map((m, i) => (
          <ChatBubble key={i} role={m.from} text={m.text} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="메시지를 입력하세요"
          className="flex-1 h-11 rounded-xl border border-slate-300 px-3 text-base text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
        <button
          onClick={send}
          className="h-11 px-4 rounded-xl bg-slate-900 text-white text-base hover:bg-slate-800"
        >
          보내기
        </button>
      </div>
    </section>
  );
}

/* ---------------- ChatBubble ---------------- */
function ChatBubble({ role, text }) {
  const isAgent = role === "agent";

  return (
    <div
      className={
        "flex items-start gap-2 mb-3 " + (isAgent ? "" : "justify-end")
      }
    >
      {isAgent && <AvatarCommon />}
      <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-white border border-slate-200">
        <p className="text-base leading-relaxed text-slate-800">{text}</p>
      </div>
      {!isAgent && <AvatarCommon />}
    </div>
  );
}

function AvatarCommon() {
  return (
    <div className="w-9 h-9 rounded-full bg-slate-200 grid place-items-center overflow-hidden">
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="currentColor"
        className="text-slate-500"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M3 21a9 9 0 0 1 18 0" />
      </svg>
    </div>
  );
}

/* ---------------- ASRPanel ---------------- */
function ASRPanel() {
  const [stage, setStage] = useState(0);
  const [isRec, setIsRec] = useState(false);
  const [mode, setMode] = useState("응답");
  const [text, setText] = useState("");
  const [recErr, setRecErr] = useState("");
  const [sec, setSec] = useState(0);
  const [lastAudio, setLastAudio] = useState(null);

  const [isSending, setIsSending] = useState(false);
  const [apiErr, setApiErr] = useState("");

  const [recStatus, setRecStatus] = useState("idle");
  const [latency, setLatency] = useState(null);

  const [showDeafPopup, setShowDeafPopup] = useState(false);
  const navigate = useNavigate(); // DeafReceive / Logs로 이동용

  // 번역 오류 입력 팝업 상태 (여러 개 항목)
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [spans, setSpans] = useState([{ wrong: "", correct: "" }]);

  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  /* 진행 바 애니메이션 */
  useEffect(() => {
    const id = setInterval(() => setStage((s) => (s + 1) % 4), 1600);
    return () => clearInterval(id);
  }, []);

  /* 타이머 */
  useEffect(() => {
    if (isRec) {
      timerRef.current = setInterval(() => setSec((s) => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [isRec]);

  /* 클린업 */
  useEffect(() => {
    return () => {
      try {
        mediaRecRef.current?.stop?.();
      } catch {}
      streamRef.current?.getTracks?.().forEach((t) => t.stop());
      if (lastAudio?.url) URL.revokeObjectURL(lastAudio.url);
    };
  }, [lastAudio]);

  /* Blob 업로드 */
  const uploadBlob = async (blob) => {
    if (!blob) {
      setApiErr("먼저 음성을 녹음해 주세요.");
      return;
    }

    setIsSending(true);
    setApiErr("");
    setRecStatus("idle");

    try {
      const fd = new FormData();
      fd.append("audio", blob, "speech.webm");

      const resp = await fetch(`${API_BASE}/api/accounts/speech_to_sign/`, {
        method: "POST",
        body: fd,
      });

      if (!resp.ok) {
        const txt = await resp.text();
        console.error("speech_to_sign error:", resp.status, txt);
        setApiErr("음성 처리 중 서버 오류가 발생했어요.");
        return;
      }

      const data = await resp.json();
      console.log("speech_to_sign result:", data);

      // gloss_labels 저장
      if (Array.isArray(data.gloss_labels)) {
        try {
          localStorage.setItem(
            "signanceDeafGlossLabels",
            JSON.stringify(data.gloss_labels)
          );
        } catch (e) {
          console.warn("failed to save gloss_labels:", e);
        }
      }

      // STT 원문 / NLP 결과
      const rawText = data.text || "";
      const cleanedText = data.clean_text || rawText || "";

      setText(cleanedText);
      setRecStatus("done");

      try {
        localStorage.setItem("signanceDeafCaptionClean", cleanedText);
      } catch (e) {
        console.warn("failed to save signanceDeafCaptionClean:", e);
      }

      if (rawText) {
        try {
          localStorage.setItem("signanceDeafCaptionRaw", rawText);
        } catch (e) {
          console.warn("failed to save signanceDeafCaptionRaw:", e);
        }
      }

      // latency 로그 저장
      if (data.latency_ms) {
        setLatency(data.latency_ms);

        try {
          const prev =
            JSON.parse(localStorage.getItem("signanceLatencyLogs") || "[]") ||
            [];

          const logEntry = {
            ts: data.timestamp || new Date().toISOString(),
            sentence: cleanedText,
            stt: data.latency_ms.stt,
            nlp: data.latency_ms.nlp,
            mapping: data.latency_ms.mapping,
            synth: data.latency_ms.synth,
            total: data.latency_ms.total,
            text: rawText,
            clean_text: cleanedText,
            gloss: data.gloss || [],
            gloss_labels: data.gloss_labels || [],
            gloss_ids: data.gloss_ids || [],
          };

          prev.push(logEntry);
          localStorage.setItem(
            "signanceLatencyLogs",
            JSON.stringify(prev)
          );
        } catch (e) {
          console.error("latency log save error:", e);
        }
      }

      // 수어 영상 URL 처리
      let hasVideo = false;

      const sentenceVideoUrl =
        data.sentence_video_url || data.video_url || "";
      if (sentenceVideoUrl) {
        localStorage.setItem("signanceDeafVideoUrl", sentenceVideoUrl);
        hasVideo = true;
      }

      const videoList = data.sign_video_list || data.video_urls || [];
      if (Array.isArray(videoList) && videoList.length > 0) {
        localStorage.setItem(
          "signanceDeafVideoUrls",
          JSON.stringify(videoList)
        );
        hasVideo = true;
      }

      if (hasVideo) {
        setShowDeafPopup(true);
      }
    } catch (e) {
      console.error(e);
      setApiErr("서버와 통신 중 오류가 발생했어요.");
      setRecStatus("idle");
    } finally {
      setIsSending(false);
    }
  };

  /* 등록된 blob 전송 */
  const sendToServer = async () => {
    await uploadBlob(lastAudio?.blob);
  };

  /* 녹음 시작 */
  const startRec = async () => {
    setRecErr("");
    setApiErr("");
    setRecStatus("idle");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mr = new MediaRecorder(stream);
      mediaRecRef.current = mr;
      chunksRef.current = [];
      setSec(0);

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const url = URL.createObjectURL(blob);

          if (lastAudio?.url) URL.revokeObjectURL(lastAudio.url);
          setLastAudio({ url, blob });

          uploadBlob(blob); // 자동 업로드
        } catch {
          setRecErr("오디오 데이터를 생성하지 못했어요.");
        }

        streamRef.current?.getTracks?.().forEach((t) => t.stop());
        streamRef.current = null;
      };

      mr.start();
      setIsRec(true);
    } catch {
      setRecErr("마이크 권한을 확인해 주세요. (https / localhost 권장)");
      setIsRec(false);
    }
  };

  /* 녹음 종료 */
  const stopRec = () => {
    try {
      mediaRecRef.current?.stop();
    } catch {}
    setIsRec(false);
  };

  const toggleRec = () => {
    if (isRec) stopRec();
    else startRec();
  };

  // 번역 오류 버튼 클릭: 팝업 오픈
  const handleReportError = () => {
    const rawText = localStorage.getItem("signanceDeafCaptionRaw") || "";
    const cleanText = text || "";

    if (!rawText && !cleanText) {
      setApiErr("먼저 음성을 인식한 뒤 오류를 신고해 주세요.");
      return;
    }

    // 새로 입력 시작
    setSpans([{ wrong: "", correct: "" }]);
    setShowErrorPopup(true);
  };

  // span 추가/수정 헬퍼
  const addSpanRow = () => {
    setSpans((prev) => [...prev, { wrong: "", correct: "" }]);
  };

  const updateSpan = (idx, key, value) => {
    setSpans((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [key]: value } : s))
    );
  };

  // 팝업에서 "저장 후 로그 보기" 눌렀을 때
  const handleConfirmError = () => {
    const rawText = localStorage.getItem("signanceDeafCaptionRaw") || "";
    const cleanText = text || "";

    // 공백 제거 후 유효한 항목만 필터링
    const filtered = spans
      .map((s) => ({
        wrong: s.wrong?.trim() || "",
        correct: s.correct?.trim() || "",
      }))
      .filter((s) => s.wrong || s.correct);

    if (filtered.length === 0) {
      alert("오류 구간을 최소 1개 이상 입력해 주세요.");
      return;
    }

    const entry = {
      sttText: rawText,
      cleanText,
      spans: filtered,
      createdAt: new Date().toISOString(),
    };

    // terminology 딕셔너리(localStorage)에 누적 저장
    try {
      const prev =
        JSON.parse(localStorage.getItem("signanceTerminologyDict") || "[]") ||
        [];
      const merged = prev.concat(
        filtered.map((s) => ({ wrong: s.wrong, correct: s.correct }))
      );
      localStorage.setItem(
        "signanceTerminologyDict",
        JSON.stringify(merged)
      );
    } catch (e) {
      console.warn("terminology dict save error:", e);
    }

    // logs 페이지로 이동
    navigate("/banker/logs", {
      state: { errorEntry: entry },
    });

    setShowErrorPopup(false);
  };

  // 버튼 disabled 조건용
  const hasAnySpanFilled = spans.some(
    (s) =>
      (s.wrong && s.wrong.trim().length > 0) ||
      (s.correct && s.correct.trim().length > 0)
  );

  return (
    <>
      <section className="mt-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center gap-4">
          <div className="shrink-0 w-20 h-20 rounded-full border-2 border-slate-300 grid place-items-center">
            <button
              type="button"
              onClick={toggleRec}
              aria-pressed={isRec}
              title={isRec ? "녹음 중지" : "녹음 시작"}
              className={
                "flex items-center justify-center rounded-full bg-white transition-all " +
                (isRec
                  ? "h-[72px] w-[72px] border-2 border-slate-900 ring-4 ring-slate-200 animate-pulse"
                  : "h-[64px] w-[64px] border border-slate-300")
              }
            >
              <MicIconStroke
                className={
                  isRec ? "h-9 w-9 text-slate-900" : "h-8 w-8 text-slate-800"
                }
              />
            </button>
          </div>

          <div className="flex-1">
            <div className="flex items-baseline gap-2 font-semibold text-base text-slate-800">
              <span>
                {isRec
                  ? "녹음 중..."
                  : recStatus === "done"
                  ? "음성 인식 완료 !"
                  : "음성 인식 대기 중..."}
              </span>
              {isRec && (
                <span className="text-xs font-normal text-slate-500">
                  {formatTime(sec)}
                </span>
              )}
            </div>

            <div className="mt-3">
              <StageDots active={stage} />
            </div>

            <div className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 flex items-center">
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setMode("질문")}
                  className={
                    "px-3 h-8 rounded-lg text-sm border " +
                    (mode === "질문"
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-700 border-slate-300")
                  }
                >
                  질문
                </button>
                <button
                  onClick={() => setMode("응답")}
                  className={
                    "px-3 h-8 rounded-lg text-sm border " +
                    (mode === "응답"
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-700 border-slate-300")
                  }
                >
                  응답
                </button>
              </div>

              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="음성 인식 결과가 여기에 표시됩니다."
                className="flex-1 ml-4 text-base text-slate-800 placeholder-slate-400 border-none bg-transparent focus:outline-none"
              />
            </div>

            {(recErr || apiErr) && (
              <div className="mt-2 text-xs text-red-600">
                {recErr || apiErr}
              </div>
            )}

            {/* latency 표시 영역 */}
            {latency && (
              <div className="mt-3 text-xs text-slate-500 space-y-1">
                <div>
                  STT: {msToSec(latency.stt)} s / NLP:{" "}
                  {msToSec(latency.nlp)} s / 매핑:{" "}
                  {msToSec(latency.mapping)} s / 합성:{" "}
                  {msToSec(latency.synth)} s
                </div>
                <div>🕐 총합: {msToSec(latency.total)} s</div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button
              className="h-11 px-5 rounded-xl bg-slate-900 text-white text-base hover:bg-slate-800 whitespace-nowrap disabled:bg-slate-400"
              onClick={sendToServer}
              disabled={isSending}
            >
              {isSending ? "전송 중..." : "응답 전송"}
            </button>
            <button
              className="h-11 px-5 rounded-xl border border-slate-300 text-base hover:bg-slate-50 whitespace-nowrap"
              onClick={handleReportError}
            >
              번역 오류
            </button>
          </div>
        </div>

        {lastAudio?.url && (
          <div className="mt-3 space-y-2">
            <audio controls src={lastAudio.url} className="w-full" />
          </div>
        )}
      </section>

      {/* 수어 영상 전달 완료 팝업 */}
      {showDeafPopup && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="text-sm font-semibold text-slate-500 mb-1">
              수어 영상 전달 완료
            </div>
            <div className="text-lg font-semibold text-slate-900 mb-2">
              농인 화면으로 영상이 전송되었어요.
            </div>
            <p className="text-sm text-slate-600 mb-5">
              DeafReceive 화면으로 이동해서
              <br />
              매핑된 수어 영상을 확인해 보시겠습니까?
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeafPopup(false)}
                className="px-4 h-10 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
              >
                나중에 보기
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeafPopup(false);
                  navigate("/deaf/receive");
                }}
                className="px-4 h-10 rounded-lg bg-slate-900 text-sm text-white hover:bg-slate-800"
              >
                Deaf 화면 바로가기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 번역 오류 입력 팝업 (여러 개 입력) */}
      {showErrorPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="text-sm font-semibold text-slate-500 mb-1">
              번역 오류 신고
            </div>
            <div className="text-lg font-semibold text-slate-900 mb-3">
              어떤 부분을 어떻게 고치고 싶으신가요?
            </div>

            <div className="mb-3">
              <div className="text-xs text-slate-500 mb-1">전체 문장</div>
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800 max-h-24 overflow-y-auto">
                {text || "인식된 문장이 없습니다."}
              </div>
            </div>

            {/* 여러 개 오류/수정 쌍 입력 */}
            <div className="mb-2 max-h-56 overflow-y-auto space-y-3 pr-1">
              {spans.map((s, idx) => (
                <div key={idx} className="flex gap-2">
                  <div className="flex-1">
                    <div className="text-xs text-slate-500 mb-1">
                      잘못된 부분 {idx + 1}
                    </div>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      placeholder="예: 정립심 예금"
                      value={s.wrong}
                      onChange={(e) =>
                        updateSpan(idx, "wrong", e.target.value)
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-slate-500 mb-1">
                      올바른 표현 {idx + 1}
                    </div>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      placeholder="예: 적립식 예금"
                      value={s.correct}
                      onChange={(e) =>
                        updateSpan(idx, "correct", e.target.value)
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addSpanRow}
              className="mb-4 text-[11px] text-slate-500 hover:text-slate-800"
            >
              + 오류 항목 추가
            </button>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowErrorPopup(false)}
                className="px-4 h-9 rounded-lg border border-slate-300 text-xs text-slate-700 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmError}
                className="px-4 h-9 rounded-lg bg-slate-900 text-xs text-white hover:bg-slate-800 disabled:bg-slate-400"
                disabled={!hasAnySpanFilled}
              >
                저장 후 로그 보기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


/* ---------------- StageDots ---------------- */
function StageDots({ active = 0 }) {
  return (
    <div className="flex items-center gap-6">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={
            "h-2 w-12 rounded-full transition-all " +
            (active >= i ? "bg-slate-800" : "bg-slate-200")
          }
        />
      ))}
    </div>
  );
}

/* ---------------- Util ---------------- */
function formatTime(s) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
function msToSec(ms) {
  if (ms == null || isNaN(ms)) return "-";
  return (ms / 1000).toFixed(2);
}

/* ---------------- Icons ---------------- */
function BubbleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="text-slate-700"
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8z" />
    </svg>
  );
}

function UserIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 12a5 5 0 1 0-5-5 5.006 5.006 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
    </svg>
  );
}

function MicIconStroke({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="9" y="4" width="6" height="10" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
      <path d="M9 22h6" />
    </svg>
  );
}

/* ---------------- Send/Receive Toggle ---------------- */
function SendReceiveToggle({ active }) {
  const navigate = useNavigate();
  const baseBtn =
    "px-4 py-1.5 text-sm rounded-full transition-all duration-150 whitespace-nowrap";

  return (
    <div className="inline-flex items-center rounded-full bg-slate-200 p-1 shadow-sm">
      <button
        type="button"
        onClick={() => {
          if (active !== "send") navigate("/banker/send");
        }}
        className={`${baseBtn} ${
          active === "send"
            ? "bg-slate-900 text-white shadow-sm"
            : "bg-white text-slate-700 hover:bg-slate-100"
        }`}
        aria-pressed={active === "send"}
      >
        송신
      </button>

      <button
        type="button"
        onClick={() => {
          if (active !== "receive") navigate("/banker/receive");
        }}
        className={`${baseBtn} ${
          active === "receive"
            ? "bg-slate-900 text-white shadow-sm"
            : "bg-white text-slate-700 hover:bg-slate-100"
        }`}
        aria-pressed={active === "receive"}
      >
        수신
      </button>
    </div>
  );
}

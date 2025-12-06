// src/pages/Deaf/Send.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
// import NavTabs from "../../components/NavTabs";
import { useChatStore } from "../../store/chatstore";

import { useHands } from "../../hooks/useHands";
import { useSequenceSender } from "../../hooks/useSequenceSender";

/* ========= 공통 상수 & 유틸 ========= */

// Receive와 동일한 카드 높이
const PANEL_HEIGHT = "h-[560px]";

// 백엔드 주소 + 세션 키
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const SESSION_KEY = "signanceSessionId";


// Deaf 쪽에서도 기존 세션 읽어오기
function getExistingSessionId() {
  try {
    return localStorage.getItem(SESSION_KEY) || null;
  } catch {
    return null;
  }
}

// 🔹 공통: 농인(deaf) 채팅 전송 함수
async function sendDeafChat(text, mode = "") {
  const trimmed = (text || "").trim();
  if (!trimmed) return;

  const sessionId = getExistingSessionId();
  if (!sessionId) {
    alert("상담 세션이 없습니다. 은행원 화면에서 상담을 시작해 주세요.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/accounts/chat/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        session_id: sessionId,
        sender: "deaf",
        // 질문 / 응답 모드 정보도 같이 보내고 싶으면 role에 넣기
        role: mode === "질문" || mode === "응답" ? mode : "",
        text: trimmed,
      }),
    });

    if (!res.ok) {
      console.error("sendDeafChat POST 실패:", await res.text());
    }
  } catch (err) {
    console.error("sendDeafChat POST error:", err);
  }
}

/* ========= useHands.Frame → seqTransport.Frame 변환 헬퍼 ========= */
function toTxFrame(frame) {
  return {
    ts: frame.ts,
    hands: frame.hands.map((h) => ({
      ...h,
      handedness: h.handedness === "Left" ? "Left" : "Right",
    })),
  };
}

/* ---------------- 공통 타이틀 ---------------- */
function PanelHeader({ icon, title }) {
  return (
    <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-800">
      <span className="inline-grid place-items-center">{icon}</span>
      <span className="leading-none">{title}</span>
    </div>
  );
}

/* ======================== 메인 페이지 컴포넌트 ======================== */
export default function DeafSend() {
  // 🔥 인식 결과 텍스트 (자연어 문장 우선)
  const [prediction, setPrediction] = useState("");

  // 🔥 수어 인식용 세션 (NPZ/ingest용, 채팅 세션과는 별개)
  const sessionId = useMemo(() => `sess_${Date.now()}`, []);

  // 🔥 useSequenceSender에 콜백으로 연결
  const transport = useSequenceSender(sessionId, (result) => {
    const text =
      result.natural_sentence || result.gloss_sentence || "";
    console.log("[DeafSend] inference result:", result);
    setPrediction(text);
  });

  // useHands: 프레임 들어올 때마다 seqTransport로 push
  const { start, stop, status } = useHands({
    onFrame: (frame) => {
      console.log("[DeafSend] onFrame");
      transport.pushFrame(toTxFrame(frame));
    },
  });

  const flushSeq = async () => {
    console.log("[DeafSend] flushSeq called");
    await transport.flush();
  };

  // 카메라/인식 진행 여부 (StageDots 제어용)
  const [recognizing, setRecognizing] = useState(false);

  return (
    <div className="w-full h-auto overflow-hidden">
      <main className="w-full px-4 sm:px-6 lg:px-10 pt-4 pb-8 bg-slate-50 min-h-[calc(100vh-56px)]">
  {/* 상단: 송신/수신 토글만 표시 */}
  <div className="w-full flex justify-end mb-2">
    <SendReceiveToggle active="send" />
  </div>

  {/* 상단 2열: 수어 카메라 + 상담 대화창 */}
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 items-stretch">
    <VideoPanel
      start={start}
      stop={stop}
      status={status}
      onFlush={flushSeq}
      onStarted={() => setRecognizing(true)}
      onStopped={() => setRecognizing(false)}
    />
    <ChatPanel />
  </div>

  {/* 하단 수어 인식 결과 패널 */}
  <div className="mt-4">
    <ASRPanel
      respText={prediction}
      isActive={recognizing}
      onSend={sendDeafChat}
    />
  </div>
</main>

    </div>
  );
}

/* ---------------- 수어 인식 카메라 패널 ---------------- */

function VideoPanel({
  start,
  stop,
  status,
  onFlush,
  onStarted,
  onStopped,
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [started, setStarted] = useState(false);
  const [mirror, setMirror] = useState(true);

  // 컨테이너 크기에 맞춰 canvas 크기 동기화
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const syncCanvasSize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;

      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const pxW = Math.max(1, Math.round(w * dpr));
      const pxH = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== pxW) canvas.width = pxW;
      if (canvas.height !== pxH) canvas.height = pxH;
    };

    const ro = new ResizeObserver(syncCanvasSize);
    ro.observe(container);
    syncCanvasSize();

    return () => ro.disconnect();
  }, []);

  const handleStart = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (container && canvas) {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    }

    await start(videoRef.current, canvasRef.current);
    setStarted(true);
    onStarted && onStarted();
  };

  const handleStop = async () => {
    stop();
    setStarted(false);
    if (onFlush) await onFlush();
    onStopped && onStopped();
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v) return;

    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (mirror) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `snapshot_${Date.now()}.png`;
    a.click();
  };

  return (
    <section
      className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col ${PANEL_HEIGHT}`}
    >
      <PanelHeader icon={<CameraIcon />} title="수어 인식 카메라" />

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <button
          onClick={() => setMirror((m) => !m)}
          className={
            "h-9 px-3 rounded-lg border text-sm " +
            (mirror
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50")
          }
        >
          {mirror ? "미러 ON" : "미러 OFF"}
        </button>

        {started ? (
          <button
            onClick={handleStop}
            className="h-9 px-3 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm"
          >
            멈추기
          </button>
        ) : (
          <button
            onClick={handleStart}
            className="h-9 px-3 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm"
          >
            시작
          </button>
        )}

        <button
          onClick={capture}
          className="h-9 px-3 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm"
        >
          스냅샷
        </button>

        <span className="ml-auto text-xs text-slate-500">
          상태: {status || "-"}
        </span>
      </div>

      <div className="mt-3 flex-1 min-h-0">
        <div
          ref={containerRef}
          className="relative h-full rounded-xl overflow-hidden border border-slate-200 bg-black"
        >
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              transform: mirror ? "scaleX(-1)" : "none",
              transformOrigin: "center",
            }}
            playsInline
            autoPlay
            muted
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{
              transform: mirror ? "scaleX(-1)" : "none",
              transformOrigin: "center",
            }}
          />
        </div>
      </div>
    </section>
  );
}

/* ---------------- 상담 대화창 (백엔드 폴링 버전) ---------------- */

function ChatPanel() {
  const { messages, setMessages } = useChatStore();

  const listRef = useRef(null);

  // BankerSend에서 만든 session_id
  const [sessionId, setSessionId] = useState(() =>
    getExistingSessionId()
  );

  // 🔹 DeafSend 화면에 "들어온 시점" 이후 채팅만 보이기 위한 기준 시간
  const [resetAfter] = useState(() => Date.now());

  // 다른 탭에서 SESSION_KEY 바뀌면 따라가기
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === SESSION_KEY) {
        setSessionId(e.newValue || null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 🔹 백엔드 채팅 폴링: DeafReceive와 동일하지만 resetAfter로 필터링
  useEffect(() => {
    let stopped = false;

    const fetchAllMessages = async () => {
      if (!sessionId) {
        setMessages([]);
        return;
      }

      try {
        const url = new URL(`${API_BASE}/api/accounts/chat/`);
        url.searchParams.set("session_id", sessionId);

        const res = await fetch(url.toString());
        if (!res.ok) {
          console.error("DeafSend chat fetch 실패:", await res.text());
          return;
        }

        const data = await res.json(); // [{ id, session_id, sender, role, text, created_at }, ...]
        if (!Array.isArray(data) || stopped) return;

        let filtered = data;
        if (resetAfter) {
          const cutoff =
            typeof resetAfter === "number"
              ? resetAfter
              : new Date(resetAfter).getTime();

          filtered = data.filter((m) => {
            if (!m.created_at) return false;
            const t = new Date(m.created_at).getTime();
            return !isNaN(t) && t >= cutoff;
          });
        }

        const mapped = filtered.map((m) => ({
          id: m.id,
          backendId: m.id,
          from: m.sender === "banker" ? "agent" : "user",
          role: m.sender === "banker" ? "agent" : "user",
          text: m.text,
          mode: m.role,
          created_at: m.created_at,
        }));

        setMessages(mapped);
      } catch (err) {
        console.error("DeafSend chat fetch error:", err);
      }
    };

    fetchAllMessages();
    const timer = window.setInterval(fetchAllMessages, 2000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [sessionId, setMessages, resetAfter]);

  const mappedMessages = useMemo(
    () =>
      (messages || []).map((m) => ({
        role: m.from || m.role || "agent",
        text: m.text,
      })),
    [messages]
  );

  // 스크롤 항상 맨 아래로
  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [mappedMessages]);

  // 🔹 하단 입력창은 완전히 제거 → 읽기 전용 채팅창
  return (
    <section
      className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col ${PANEL_HEIGHT}`}
    >
      <PanelHeader icon={<BubbleIcon />} title="상담 대화창" />

      <div
        ref={listRef}
        className="mt-3 flex-1 min-h-0 overflow-y-auto rounded-xl border border-slate-200 p-4 bg-slate-50"
      >
        {mappedMessages.map((m, i) => (
          <ChatBubble key={i} role={m.role} text={m.text} />
        ))}
      </div>
    </section>
  );
}
/* ---------------- 수어 인식 결과 패널 ---------------- */

function ASRPanel({ respText, isActive, onSend }) {
  const [mode, setMode] = useState("응답");
  const [text, setText] = useState("");

  useEffect(() => {
    setText(respText);
  }, [respText]);

  // 🔹 여기 추가
  const handleSend = async () => {
    const msg = (text || "").trim();
    if (!msg) return;

    if (onSend) {
      await onSend(msg, mode);  // mode: "질문" / "응답"
    }
    // 전송 후 비우고 싶으면 아래 주석 해제
    // setText("");
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-20 h-20 rounded-full border-2 border-slate-300 grid place-items-center">
          <HandIcon />
        </div>

        <div className="flex-1">
          <div className="font-semibold text-base text-slate-800">
            {isActive ? "수어 인식 중..." : "대기 중"}
          </div>

          <div className="mt-3">
            <StageDots running={isActive} />
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
              placeholder="수어 인식 결과가 여기에 표시됩니다."
              className="flex-1 ml-4 text-base text-slate-800 placeholder-slate-400 border-none bg-transparent focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleSend}
            className="h-11 px-5 rounded-xl bg-slate-900 text-white text-base hover:bg-slate-800 whitespace-nowrap"
          >
            응답 전송
          </button>

          <button className="h-11 px-5 rounded-xl border border-slate-300 text-base hover:bg-slate-50 whitespace-nowrap">
            번역 오류
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- StageDots ---------------- */

function StageDots({ running }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!running) {
      setActive(0);
      return;
    }

    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % 4);
    }, 400);

    return () => window.clearInterval(id);
  }, [running]);

  return (
    <div className="flex items-center gap-6">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={
            "h-2 w-12 rounded-full transition-all " +
            (i === active ? "bg-slate-900" : "bg-slate-300")
          }
        />
      ))}
    </div>
  );
}

/* ---------------- 공통 말풍선 ---------------- */

function ChatBubble({ role, text }) {
  if (role === "system") {
    return (
      <div className="w-full flex justify-center my-4">
        <div
          className="
            inline-block
            max-w-[90%]
            px-4 py-2
            rounded-xl
            bg-slate-100
            text-slate-800
            font-medium
            text-center
            border border-slate-200
            shadow-sm
          "
        >
          {text}
        </div>
      </div>
    );
  }

  const isAgent = role === "agent";

  return (
    <div
      className={
        "flex items-start gap-2 mb-3 " + (isAgent ? "" : "justify-end")
      }
    >
      {isAgent && <AvatarGirl />}
      <div
        className={
          "max-w-[80%] rounded-2xl px-4 py-3 " +
          (isAgent
            ? "bg-white border border-slate-200"
            : "bg-[#e9f2ff] border border-slate-200")
        }
      >
        <p className="text-base leading-relaxed">{text}</p>
      </div>
      {!isAgent && <AvatarUser />}
    </div>
  );
}

/* ---------------- 아이콘들 ---------------- */

function CameraIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function BubbleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8z" />
    </svg>
  );
}

function AvatarGirl() {
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

function AvatarUser() {
  return (
    <div className="w-9 h-9 rounded-full bg-slate-300 grid place-items-center overflow-hidden">
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="currentColor"
        className="text-slate-600"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M3 21a9 9 0 0 1 18 0" />
      </svg>
    </div>
  );
}

function HandIcon({ className = "" }) {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={"text-slate-700 " + className}
    >
      <path d="M12 22s-6-4.5-6-9.5V7a2 2 0 1 1 4 0v4" />
      <path d="M10 12V6a2 2 0 1 1 4 0v6" />
      <path d="M14 12V5a2 2 0 1 1 4 0v6" />
    </svg>
  );
}

/* ---------------- 송신/수신 토글 ---------------- */

function SendReceiveToggle({ active }) {
  const navigate = useNavigate();
  const baseBtn =
    "px-4 py-1.5 text-sm rounded-full transition-all duration-150 whitespace-nowrap";

  return (
    <div className="inline-flex items-center rounded-full bg-slate-200 p-1 shadow-sm">
      <button
        type="button"
        onClick={() => {
          if (active !== "send") navigate("/deaf/send");
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
          if (active !== "receive") navigate("/deaf/receive");
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

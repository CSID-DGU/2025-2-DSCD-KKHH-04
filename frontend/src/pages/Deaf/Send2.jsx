// frontend_clean/src/pages/Deaf/Send2.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// Receive와 동일한 카드 높이 (살짝 줄임)
const PANEL_HEIGHT = "h-[560px]";

export default function DeafSend() {
  return (
    <div className="w-full h-auto overflow-hidden">
      <main className="w-full px-4 sm:px-6 lg:px-10 pt-4 pb-8 bg-slate-50 min-h-[calc(100vh-56px)]">
        {/* 상단 NavTabs 제거, 오른쪽에 송신/수신 토글만 배치 */}
        <div className="w-full flex justify-end mb-2">
          <SendReceiveToggle active="send" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 items-stretch">
          <VideoPanel />
          <ChatPanel />
        </div>
        <div className="mt-4">
          <ASRPanel />
        </div>
      </main>
    </div>
  );
}

/* ---------------- 수어 인식 카메라 ---------------- */
function VideoPanel() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [facing, setFacing] = useState("user");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
  };

  const startCamera = async (opts = {}) => {
    try {
      setError("");
      const constraints = {
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 },
          ...(deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: facing }),
          ...opts,
        },
      };

      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setRunning(true);

      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter((d) => d.kind === "videoinput");
      setDevices(cams);
      if (!deviceId && cams[0]?.deviceId) setDeviceId(cams[0].deviceId);
    } catch (e) {
      console.error(e);
      setError(e?.message || "카메라를 시작할 수 없습니다.");
      setRunning(false);
    }
  };

  useEffect(() => {
    startCamera();
    return stopStream;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (deviceId) startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const toggleFacing = async () => {
    setFacing((p) => (p === "user" ? "environment" : "user"));
    setDeviceId("");
    await startCamera();
  };

  const capture = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");

    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
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
      {/* 타이틀 */}
      <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-800">
        <span className="inline-grid place-items-center">
          <CameraIcon />
        </span>
        <span className="leading-none">수어 인식 카메라</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <select
          className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
        >
          {devices.length === 0 && <option>카메라 검색 중…</option>}
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>

        <button
          onClick={toggleFacing}
          className="h-9 px-3 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm whitespace-nowrap"
        >
          전·후면
        </button>

        {running ? (
          <button
            onClick={stopStream}
            className="h-9 px-3 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm"
          >
            일시정지
          </button>
        ) : (
          <button
            onClick={() => startCamera()}
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
      </div>

      <div className="mt-3 flex-1 min-h-0">
        <div className="h-full rounded-xl overflow-hidden border border-slate-200 bg-black grid place-items-center">
          <video
            ref={videoRef}
            className="w-full h-full object-cover transform -scale-x-100"
            playsInline
            autoPlay
            muted
          />
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600 px-1">{error}</p>
        )}
      </div>
    </section>
  );
}

/* ---------------- 상담 대화창 ---------------- */
function ChatPanel() {
  const [messages, setMessages] = useState([
    {
      role: "agent",
      text: "안녕하세요. Signance 금융 상담 서비스입니다.",
    },
    {
      role: "agent",
      text: "어떤 업무 도와드릴까요? 예금, 적금, 대출 등 편하게 말씀해 주세요.",
    },
    {
      role: "user",
      text: "안녕하세요. 새 통장을 만들고 싶어요.",
    },
    {
      role: "agent",
      text: "통장 개설이 완료되었습니다. 오늘부터 바로 사용하실 수 있어요.",
    },
  ]);

  const [input, setInput] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
  };

  return (
    <section
      className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col ${PANEL_HEIGHT}`}
    >
      {/* 타이틀 */}
      <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-800">
        <span className="inline-grid place-items-center">
          <BubbleIcon />
        </span>
        <span className="leading-none">상담 대화창</span>
      </div>

      <div
        ref={listRef}
        className="mt-3 flex-1 min-h-0 overflow-y-auto rounded-xl border border-slate-200 p-4 bg-slate-50"
      >
        {messages.map((m, i) => (
          <ChatBubble key={i} role={m.role} text={m.text} />
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? send() : null)}
          placeholder="메시지를 입력하세요"
          className="flex-1 h-11 rounded-XL border border-slate-300 px-3 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
        <button
          onClick={send}
          className="h-11 px-4 rounded-xl bg-slate-900 text-white text-base font-medium hover:bg-slate-800"
        >
          보내기
        </button>
      </div>
    </section>
  );
}

/* ---------------- 수어 인식 결과 패널 (ASRPanel) ---------------- */
function ASRPanel() {
  const [mode, setMode] = useState("응답");
  const [text, setText] = useState("");

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-4">
        <div className="shrink-0 w-20 h-20 rounded-full border-2 border-slate-300 grid place-items-center">
          <HandIcon />
        </div>

        <div className="flex-1">
          <div className="font-semibold text-base text-slate-800">
            수어 인식 중...
          </div>

          <div className="mt-3">
            <StageDots />
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
          <button className="h-11 px-5 rounded-xl bg-slate-900 text-white text-base hover:bg-slate-800 whitespace-nowrap">
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

/* ---------------- 활성 상태 진행 바 (애니메이션) ---------------- */
function StageDots() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((prev) => (prev + 1) % 4);
    }, 400);
    return () => clearInterval(id);
  }, []);

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

/* ---------------- 공통 컴포넌트 ---------------- */
function ChatBubble({ role, text }) {
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
      {/* 송신 */}
      <button
        type="button"
        onClick={() => {
          if (active !== "send") navigate("/deaf/send");
        }}
        className={`
          ${baseBtn}
          ${
            active === "send"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-white text-slate-700 hover:bg-slate-100"
          }
        `}
        aria-pressed={active === "send"}
      >
        송신
      </button>

      {/* 수신 */}
      <button
        type="button"
        onClick={() => {
          if (active !== "receive") navigate("/deaf/receive");
        }}
        className={`
          ${baseBtn}
          ${
            active === "receive"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-white text-slate-700 hover:bg-slate-100"
          }
        `}
        aria-pressed={active === "receive"}
      >
        수신
      </button>
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import PanelTitle from "../../components/PanelTitle"; // alias(@) 쓰면 "@/components/PanelTitle"

export default function DeafSend() {
  return (
    <>
      <NavTabs />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 items-start">
        <VideoPanel />
        <ChatPanel />
      </div>
      <ASRPanel />
    </>
  );
}

/* ---------------- 탭 메뉴 ---------------- */
function NavTabs() {
  const tabs = ["실시간 인식", "대화 로그", "고객 메모", "시스템 상태"];
  const [active, setActive] = useState(0);
  return (
    <nav className="w-full bg-white rounded-xl shadow-sm border border-slate-200 px-3 pb-3">
      <ul className="flex flex-wrap gap-6">
        {tabs.map((t, i) => (
          <li key={t}>
            <button
              onClick={() => setActive(i)}
              className={
                "px-4 py-2 rounded-lg text-sm sm:text-base mt-2 " +
                (active === i
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100")
              }
            >
              {t}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ---------------- 수어 인식 카메라 ---------------- */
function VideoPanel() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [facing, setFacing] = useState("user"); // user | environment
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
          ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: facing }),
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
    ctx.scale(-1, 1); // 전면 미러
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `snapshot_${Date.now()}.png`;
    a.click();
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[520px] md:h-[560px] lg:h-[600px]">
      <PanelTitle
        icon={<CameraIcon />}
        title="수어 인식 카메라"
        right={
          <>
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
              title="전/후면 전환"
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
          </>
        }
      />

      <div className="p-4 flex-1 min-h-0">
        <div className="h-full rounded-xl overflow-hidden border border-slate-200 bg-black grid place-items-center">
          <video
            ref={videoRef}
            className="w-full h-full object-cover transform -scale-x-100"
            playsInline
            autoPlay
            muted
          />
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </section>
  );
}

/* ---------------- 상담 대화창 ---------------- */
function ChatPanel() {
  const [messages, setMessages] = useState([
    { role: "agent", text: "안녕하세요. 어떤 업무 도와드릴까요?" },
    { role: "user", text: "안녕하세요. 새 통장을 만들고 싶어요." },
  ]);
  const [input, setInput] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col h-[520px] md:h-[560px] lg:h-[600px]">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <BubbleIcon />
        <span>상담 대화창</span>
      </div>

      <div
        ref={listRef}
        className="mt-3 flex-1 min-h-0 overflow-y-auto rounded-xl border border-slate-200 p-3 bg-slate-50"
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
          className="flex-1 h-11 rounded-xl border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
        <button
          onClick={send}
          className="h-11 px-4 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
        >
          보내기
        </button>
      </div>
    </section>
  );
}

/* ---------------- 인식 패널 ---------------- */
function ASRPanel() {
  const [stage, setStage] = useState(1);
  const [text, setText] = useState("네, 맞아요…");
  const [mode, setMode] = useState("응답");

  useEffect(() => {
    const id = setInterval(() => setStage((s) => (s + 1) % 4), 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="mt-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-4">
        <div className="shrink-0 w-20 h-20 rounded-full border-2 border-slate-300 grid place-items-center">
          <HandIcon />
        </div>

        <div className="flex-1">
          <div className="font-semibold text-base">수어 인식 중...</div>
          <div className="mt-3 flex items-center gap-4">
            <StageDots active={stage} />
          </div>

          <div className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setMode("질문")}
                className={`px-3 h-8 rounded-lg text-sm border ${
                  mode === "질문" ? "bg-slate-900 text-white" : "bg-white text-slate-700"
                }`}
              >
                질문
              </button>
              <button
                onClick={() => setMode("응답")}
                className={`px-3 h-8 rounded-lg text-sm border ${
                  mode === "응답" ? "bg-slate-900 text-white" : "bg-white text-slate-700"
                }`}
              >
                응답
              </button>
            </div>

            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="수어 인식 결과가 표시됩니다."
              className="flex-1 ml-3 text-slate-800 placeholder-slate-400 border-none focus:outline-none bg-transparent"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button className="h-11 px-5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 whitespace-nowrap">
            응답 전송
          </button>
          <button className="h-11 px-5 rounded-xl border border-slate-300 hover:bg-slate-50 whitespace-nowrap">
            번역 오류
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 공통 컴포넌트 ---------------- */
function StageDots({ active = 0 }) {
  return (
    <div className="flex items-center gap-6">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={"h-2 w-12 rounded-full transition-all " + (active >= i ? "bg-slate-800" : "bg-slate-200")}
        />
      ))}
    </div>
  );
}

function ChatBubble({ role, text }) {
  const isAgent = role === "agent";
  return (
    <div className={"flex items-start gap-2 mb-3 " + (isAgent ? "" : "justify-end")}>
      {isAgent && <AvatarGirl />}
      <div
        className={
          "max-w-[80%] rounded-2xl px-4 py-3 " +
          (isAgent ? "bg-white border border-slate-200" : "bg-[#e9f2ff] border border-slate-200")
        }
      >
        <p className="leading-relaxed">{text}</p>
      </div>
      {!isAgent && <AvatarUser />}
    </div>
  );
}

/* ---------------- 아이콘 ---------------- */
function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}
function BubbleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8z" />
    </svg>
  );
}
function HandIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 22s-6-4.5-6-9.5V7a2 2 0 1 1 4 0v4" />
      <path d="M10 12V6a2 2 0 1 1 4 0v6" />
      <path d="M14 12V5a2 2 0 1 1 4 0v6" />
    </svg>
  );
}
function AvatarGirl() {
  return (
    <div className="w-9 h-9 rounded-full bg-slate-200 grid place-items-center overflow-hidden">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="text-slate-500">
        <circle cx="12" cy="8" r="4" />
        <path d="M3 21a9 9 0 0 1 18 0" />
      </svg>
    </div>
  );
}
function AvatarUser() {
  return (
    <div className="w-9 h-9 rounded-full bg-slate-300 grid place-items-center overflow-hidden">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="text-slate-600">
        <circle cx="12" cy="8" r="4" />
        <path d="M3 21a9 9 0 0 1 18 0" />
      </svg>
    </div>
  );
}

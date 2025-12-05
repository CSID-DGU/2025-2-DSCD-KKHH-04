// src/pages/Deaf/Send.tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import NavTabs from "../../components/NavTabs";

import type { Frame as HandsFrame } from "@/hooks/useHands";
import type {
  Frame as TxFrame,
  Hand as TxHand,
} from "@/lib/seqTransport";
import { useHands } from "@/hooks/useHands";
import {
  useSequenceSender,
  type SignInferenceResult,
} from "@/hooks/useSequenceSender";

/* ========= useHands.Frame → seqTransport.Frame 변환 헬퍼 ========= */
function toTxFrame(frame: HandsFrame): TxFrame {
  return {
    ts: frame.ts,
    hands: frame.hands.map(
      (h): TxHand => ({
        ...h,
        handedness: h.handedness === "Left" ? "Left" : "Right",
      })
    ),
  };
}

/* ---------------- 공통 타이틀 ---------------- */
interface PanelHeaderProps {
  icon: ReactNode;
  title: string;
}
function PanelHeader({ icon, title }: PanelHeaderProps) {
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

  const sessionId = useMemo(() => `sess_${Date.now()}`, []);

  // 🔥 useSequenceSender에 콜백으로 연결
  const transport = useSequenceSender(
    sessionId,
    (result: SignInferenceResult) => {
      // 자연어 문장 > 글로스 문장 > 빈 문자열 순으로 선택
      const text =
        result.natural_sentence ||
        result.gloss_sentence ||
        "";
      console.log("[DeafSend] inference result:", result);
      setPrediction(text);
    }
  );

  // 이제 useHands에서는 respText 안 씀
  const { start, stop, status } = useHands({
    onFrame: (frame) => {
      // 프레임 들어오는지 확인 로그
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
    <div className="w-full min-h-[calc(100vh-4rem)] bg-slate-50 flex flex-col px-4 sm:px-6 lg:px-10">
      {/* 상단 탭 */}
      <div className="pt-4">
        <NavTabs rightSlot={<SendReceiveToggle active="send" />} />
      </div>

      <div className="mt-4 flex-1 min-h-0 flex flex-col">
        <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
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

        <div className="mt-4">
          {/* 🔥 respText 대신 prediction */}
          <ASRPanel respText={prediction} isActive={recognizing} />
        </div>
      </div>
    </div>
  );
}


/* ---------------- 수어 인식 카메라 패널 ---------------- */

interface VideoPanelProps {
  start: (
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement
  ) => Promise<void> | void;
  stop: () => void;
  status: string;
  onFlush?: () => Promise<void> | void;
  // 🔹 추가: 시작/멈춤 콜백
  onStarted?: () => void;
  onStopped?: () => void;
}

function VideoPanel({
  start,
  stop,
  status,
  onFlush,
  onStarted,
  onStopped,
}: VideoPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [started, setStarted] = useState(false);
  const [mirror, setMirror] = useState(true);

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
    onStarted?.(); // 🔹 인식 시작 알림
  };

  const handleStop = async () => {
    stop();
    setStarted(false);
    if (onFlush) await onFlush();
    onStopped?.(); // 🔹 인식 종료 알림
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
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col h-full min-h-[320px]">
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

/* ---------------- 상담 대화창 ---------------- */

type ChatRole = "agent" | "user";

interface ChatMessage {
  role: ChatRole;
  text: string;
}

function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
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
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col h-full min-h-[320px]">
      <PanelHeader icon={<BubbleIcon />} title="상담 대화창" />

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
          onKeyDown={(e) => (e.key === "Enter" ? send() : undefined)}
          placeholder="메시지를 입력하세요"
          className="flex-1 h-11 rounded-xl border border-slate-300 px-3 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
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

/* ---------------- 수어 인식 결과 패널 ---------------- */

interface ASRPanelProps {
  respText: string;
  isActive: boolean;
}

function ASRPanel({ respText, isActive }: ASRPanelProps) {
  const [mode, setMode] = useState<"질문" | "응답">("응답");
  const [text, setText] = useState("");

  useEffect(() => {
    // 🔹 prediction 변경 시마다 그대로 반영
    setText(respText);
  }, [respText]);

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-4">
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

/* ---------------- StageDots ---------------- */

interface StageDotsProps {
  running: boolean;
}

function StageDots({ running }: StageDotsProps) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!running) {
      // 멈췄을 때 첫 번째 단계로 리셋
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

/* ---------------- 공통 컴포넌트 ---------------- */

interface ChatBubbleProps {
  role: ChatRole;
  text: string;
}
function ChatBubble({ role, text }: ChatBubbleProps) {
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

interface HandIconProps {
  className?: string;
}
function HandIcon({ className = "" }: HandIconProps) {
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

interface SendReceiveToggleProps {
  active: "send" | "receive";
}
function SendReceiveToggle({ active }: SendReceiveToggleProps) {
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

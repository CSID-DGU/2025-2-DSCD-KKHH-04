// (위 코드 동일 — 수정 없음)
import React, { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import NavTabs from "../../components/NavTabs"; // ✅ 공통 NavTabs 추가


/* ---------------- 전역 상수: 기본 영상/자막 ---------------- */
const DEFAULT_VIDEO_SRC = `${import.meta.env.BASE_URL}videos/VXPAKOKS240328310.mp4`;
const DEFAULT_CAPTION =
  "예금의 단점에는 나라의 물가가 올랐을 때 수익률이 낮아진다는 점이 있어요.";
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Receive와 DeafSend 공통 카드 높이
const PANEL_HEIGHT = "h-[560px]";

/* ---------------- 메인 컴포넌트 ---------------- */
export default function DeafReceive() {
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
      text: "예금 상품이 어떻게 다른지 간단히 설명해 주세요.",
    },
    {
      role: "agent",
      text: "네, 우선 기본 예금의 이자 구조와 해지 시 유의사항부터 안내드리겠습니다.",
    },
  ]);

  // 수어 영상 / 자막 상태
  const [videoSrc, setVideoSrc] = useState(DEFAULT_VIDEO_SRC);
  const [captionText, setCaptionText] = useState(DEFAULT_CAPTION);
  const [captionSent, setCaptionSent] = useState(false);

  // ★ gloss 라벨 (korean_meanings 대표 단어들)
  const [glossLabels, setGlossLabels] = useState([]);

  // 페이지 들어올 때 localStorage에서 값 읽기
  useEffect(() => {
    const storedVideo = localStorage.getItem("signanceDeafVideoUrl");
    const storedCaptionClean = localStorage.getItem("signanceDeafCaptionClean");
    const storedGlossLabels = localStorage.getItem("signanceDeafGlossLabels");
    const storedCaptionRaw = localStorage.getItem("signanceDeafCaptionRaw");

    console.log("DeafReceive storedVideo:", storedVideo);
    console.log("DeafReceive storedCaptionClean:", storedCaptionClean);
    console.log("DeafReceive storedCaptionRaw:", storedCaptionRaw);
    console.log("DeafReceive storedGlossLabels:", storedGlossLabels);

    if (storedVideo) {
      const fullUrl = storedVideo.startsWith("http")
        ? storedVideo
        : `${API_BASE}${storedVideo}`;
      setVideoSrc(fullUrl);
    }

    if (storedCaptionClean) {
      setCaptionText(storedCaptionClean);
    }

    if (storedGlossLabels) {
      try {
        const parsed = JSON.parse(storedGlossLabels);
        if (Array.isArray(parsed)) {
          setGlossLabels(parsed);
        }
      } catch (e) {
        console.warn("failed to parse signanceDeafGlossLabels:", e);
      }
    }

    setCaptionSent(false);
  }, []);

  const pushMsg = (role, text) => setMessages((m) => [...m, { role, text }]);

  return (
    <div className="w-full h-auto overflow-hidden">
      <main className="w-full px-4 sm:px-6 lg:px-10 pt-4 pb-8 bg-slate-50 min-h-[calc(100vh-56px)]">
        <NavTabs rightSlot={<SendReceiveToggle active="receive" />} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 items-stretch">
          <VideoPanel
            videoSrc={videoSrc}
            captionText={captionText}
            glossLabels={glossLabels}
            onPlayCaption={() => {
              if (captionSent) return;
              if (captionText) {
                pushMsg("agent", captionText);
                setCaptionSent(true);
              }
            }}
          />
          <ChatPanel messages={messages} onSend={(txt) => pushMsg("user", txt)} />
        </div>

        <div className="mt-4">
          <ASRPanel />
        </div>
      </main>
    </div>
  );
}

/* ---------------- 공통 타이틀 컴포넌트 ---------------- */
function PanelHeader({ icon, title }) {
  return (
    <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-800">
      <span className="inline-grid place-items-center">{icon}</span>
      <span className="leading-none">{title}</span>
    </div>
  );
}

/* ---------------- 탭 메뉴 ---------------- */

/* ---------------- 수어 영상 패널 ---------------- */
function VideoPanel({ onPlayCaption, videoSrc, captionText, glossLabels }) {
  const vidRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  /* ★ 자막 길이에 따라 글씨 크기 동적 조절 */
  const captionSizeClass = useMemo(() => {
    const len = captionText ? captionText.length : 0;

    if (len <= 25) return "text-xl sm:text-2xl";
    if (len <= 60) return "text-lg sm:text-xl";
    return "text-base sm:text-lg"; // 긴 문장일수록 작게
  }, [captionText]);

  const safePlay = async () => {
    const v = vidRef.current;
    if (!v) return;

    setErrMsg("");

    try {
      await v.play();
      setIsPlaying(true);
      setShowOverlay(true);
      onPlayCaption?.();
    } catch {
      try {
        v.muted = true;
        await v.play();
        setIsPlaying(true);
        setShowOverlay(true);
        onPlayCaption?.();
      } catch {
        setErrMsg("영상 재생을 시작할 수 없어요. 브라우저 권한/볼륨을 확인해 주세요.");
      }
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
    setShowOverlay(false);
  };

  return (
    <section
      className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col ${PANEL_HEIGHT}`}
    >
      <PanelHeader icon={<PlayBadge />} title="수어 영상 송출" />

      <div className="mt-3 flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-200 bg-slate-900 relative">
        <video
          ref={vidRef}
          src={videoSrc}
          className="w-full h-full object-cover"
          preload="metadata"
          playsInline
          muted
          onPlay={() => {
            setIsPlaying(true);
            setShowOverlay(true);
          }}
          onPause={handlePause}
          onEnded={handlePause}
          onError={() =>
            setErrMsg("영상을 불러오지 못했어요. 경로와 파일명을 확인해 주세요.")
          }
          controls={false}
        />

        {/* ★ gloss 오버레이 */}
        {Array.isArray(glossLabels) && glossLabels.length > 0 && (
          <div className="absolute top-3 left-3 bg-black/70 text-white text-xs sm:text-sm px-3 py-1 rounded-md max-w-[85%]">
            {glossLabels.join(" · ")}
          </div>
        )}

        {/* ★ 새 자막 (줄바꿈 O + 자동 글씨 크기 조절) */}
        {showOverlay && captionText && (
          <div
            className={`
              absolute bottom-6 left-1/2 -translate-x-1/2
              w-[96%] sm:w-[93%] lg:w-[90%]
              px-5 py-3 bg-black/70 text-white rounded-lg
              ${captionSizeClass}
              text-center leading-relaxed
              drop-shadow-[0_6px_20px_rgba(0,0,0,0.35)]
              whitespace-normal break-words
            `}
          >
            {captionText}
          </div>
        )}

        {errMsg && (
          <div className="absolute bottom-4 left-4 right-4 px-3 py-2 text-sm rounded-md bg-red-600/80 text-white">
            {errMsg}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <RoundBtn label="이전" onClick={() => console.log("prev clicked")}>
          <PrevIcon />
        </RoundBtn>

        <RoundBtn
          label={isPlaying ? "일시정지" : "재생"}
          onClick={() => (isPlaying ? vidRef.current.pause() : safePlay())}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </RoundBtn>

        <RoundBtn
          label="다시재생"
          onClick={() => {
            const v = vidRef.current;
            if (!v) return;
            v.currentTime = 0;
            safePlay();
          }}
        >
          <ReplayIcon />
        </RoundBtn>
      </div>
    </section>
  );
}

/* ---------------- 상담 대화창 ---------------- */
function ChatPanel({ messages, onSend }) {
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current)
      listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, typing]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    onSend?.(text);
    setInput("");
    setTyping(true);
    setTimeout(() => setTyping(false), 400);
  };

  return (
    <section
      className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col ${PANEL_HEIGHT}`}
    >
      <PanelHeader icon={<BubbleIcon />} title="상담 대화창" />

      <div
        ref={listRef}
        className="mt-3 flex-1 min-h-0 overflow-y-auto rounded-xl border border-slate-200 p-4 bg-slate-50"
      >
        {messages.map((m, i) => (
          <ChatBubble key={i} role={m.role} text={m.text} />
        ))}
        {typing && <TypingBubble />}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? send() : null)}
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

/* ---------------- 인식 패널 ---------------- */
function ASRPanel() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("응답");

  return (
    <section className="mt-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-4">
        <div className="shrink-0 w-20 h-20 rounded-full border-2 border-slate-300 grid place-items-center">
          <MicIconStroke className="w-9 h-9 text-slate-700" />
        </div>

        <div className="flex-1">
          <div className="font-semibold text-base">수어 인식 결과 안내</div>

          <div className="mt-3 flex items-center gap-4">
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

/* ---------------- 나머지 UI 구성요소들 ---------------- */

function StageDots() {
  return (
    <div className="flex items-center gap-6">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-2 w-12 rounded-full bg-slate-200" />
      ))}
    </div>
  );
}

function ChatBubble({ role, text }) {
  const isAgent = role === "agent";
  return (
    <div
      className={"flex items-start gap-2 mb-3 " + (isAgent ? "" : "justify-end")}
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
        <p className="leading-relaxed">{text}</p>
      </div>
      {!isAgent && <AvatarUser />}
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex items-start gap-2 mb-3">
      <AvatarGirl />
      <div className="max-w-[80%] rounded-2xl px-4 py-3 bg:white border border-slate-200">
        <div className="flex items-center gap-1">
          <Dot />
          <Dot />
          <Dot />
        </div>
      </div>
    </div>
  );
}

function RoundBtn({ children, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="h-10 w-10 grid place-items-center rounded-full border border-slate-300 hover:bg-slate-50"
      title={label}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

/* ---------------- 아이콘 ---------------- */
function PlayBadge() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-slate-600">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-slate-700">
      <polygon points="8,5 19,12 8,19" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-slate-700">
      <rect x="6" y="5" width="4" height="14" />
      <rect x="14" y="5" width="4" height="14" />
    </svg>
  );
}
function PrevIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-slate-700">
      <polygon points="16,5 7,12 16,19" />
    </svg>
  );
}
function ReplayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-700">
      <path d="M4 11a7 7 0 1 1 2 5.3" />
      <polyline points="4 7 4 11 8 11" />
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
function Dot() {
  return <span className="inline-block w-2 h-2 rounded-full bg-slate-500 animate-pulse"></span>;
}

function MicIconStroke({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="4" width="6" height="10" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
      <path d="M9 22h6" />
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
        className={`${baseBtn} ${
          active === "send"
            ? "bg-slate-900 text-white shadow-sm"
            : "bg-white text-slate-700 hover:bg-slate-100"
        }`}
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

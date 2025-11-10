import React, { useEffect, useRef, useState } from "react";

/* ---------------- 전역 상수: 영상/자막 ---------------- */
const VIDEO_ID = "VXPAKOKS240328310";
const VIDEO_SRC = `${import.meta.env.BASE_URL}videos/${VIDEO_ID}.mp4`;
const CAPTIONS = {
  VXPAKOKS240328310:
    "예금의 단점에는 나라의 물가가 올랐을 때 수익률이 낮아진다는 점이 있어요.",
};

export default function DeafReceive() {
  // 채팅 메시지
  const [messages, setMessages] = useState([
    { role: "agent", text: "안녕하세요. 어떤 업무 도와드릴까요?" },
  ]);
  const pushMsg = (role, text) => setMessages((m) => [...m, { role, text }]);

  // ✅ 세션(이 화면에 머무는 동안) 한 번만 자막을 채팅에 올리기 위한 플래그
  const [captionSent, setCaptionSent] = useState(false);

  return (
    <>
      <NavTabs />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 items-start">
        <VideoPanel
          onPlayCaption={() => {
            if (captionSent) return; // 이미 보냈다면 더 이상 안 보냄
            const line = CAPTIONS[VIDEO_ID];
            if (line) {
              pushMsg("user", line);
              setCaptionSent(true);
            }
          }}
        />
        <ChatPanel messages={messages} onSend={(txt) => pushMsg("user", txt)} />
      </div>
      <ASRPanel />
    </>
  );
}

/* ---------------- 공통 타이틀 컴포넌트 ---------------- */
function PanelHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2 text-lg font-semibold">
      <span className="inline-grid place-items-center">{icon}</span>
      <span className="leading-none">{title}</span>
    </div>
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

/* ---------------- 수어 영상 패널 ---------------- */
function VideoPanel({ onPlayCaption }) {
  const vidRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const safePlay = async () => {
    const v = vidRef.current;
    if (!v) return;
    setErrMsg("");
    try {
      await v.play();
      setIsPlaying(true);
      setShowOverlay(true);
      onPlayCaption?.(); // <= 세션당 1회만 실행되도록 상위에서 가드
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
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col h-[520px] md:h-[560px] lg:h-[600px]">
      <PanelHeader icon={<PlayBadge />} title="수어 영상 송출" />

      <div className="mt-3 flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-200 bg-slate-900 relative">
        <video
          ref={vidRef}
          src={VIDEO_SRC}
          className="w-full h-full object-cover"
          preload="metadata"
          playsInline
          muted
          onPlay={() => { setIsPlaying(true); setShowOverlay(true); }}
          onPause={handlePause}
          onEnded={handlePause}
          onError={() => setErrMsg("영상을 불러오지 못했어요. 경로와 파일명을 확인해 주세요.")}
          controls={false}
        />

        {/* 재생 중 자막 오버레이 (폰트 크게 + 가로 더 길게) */}
        {showOverlay && (
          <div
            className="
              absolute bottom-6 left-1/2 -translate-x-1/2
              w-[92%] sm:w-[86%] md:w-[78%] lg:w-[70%]
              px-6 py-3 bg-black/70 text-white rounded-lg
              text-base sm:text-lg leading-relaxed text-center
              drop-shadow-[0_6px_20px_rgba(0,0,0,0.35)]
            "
          >
            {CAPTIONS[VIDEO_ID]}
          </div>
        )}

        {/* 에러 메시지 */}
        {errMsg && (
          <div className="absolute bottom-4 left-4 right-4 px-3 py-2 text-sm rounded-md bg-red-600/80 text-white">
            {errMsg}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <RoundBtn label="이전"><PrevIcon /></RoundBtn>
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
          <NextIcon />
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
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
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
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col h-[520px] md:h-[560px] lg:h-[600px]">
      <PanelHeader icon={<BubbleIcon />} title="상담 대화창" />

      <div
        ref={listRef}
        className="mt-3 flex-1 min-h-0 overflow-y-auto rounded-xl border border-slate-200 p-3 bg-slate-50"
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
  const [text, setText] = useState("");
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

          <div className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 flex items-center">
            <div className="flex gap-2 flex-shrink-0">
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
              className="flex-1 ml-4 text-slate-800 placeholder-slate-400 border-none focus:outline-none bg-transparent"
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

/* ---------------- 서브 컴포넌트 ---------------- */
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

function TypingBubble() {
  return (
    <div className="flex items-start gap-2 mb-3">
      <AvatarGirl />
      <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-white border border-slate-200">
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

/* ---------------- 아이콘/아바타 ---------------- */
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
      <polygon points="6,12 18,5 18,19" transform="scale(-1,1) translate(-24,0)" />
    </svg>
  );
}
function NextIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-slate-700">
      <polygon points="6,5 18,12 6,19" />
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
function Dot() {
  return <span className="inline-block w-2 h-2 rounded-full bg-slate-500 animate-pulse"></span>;
}

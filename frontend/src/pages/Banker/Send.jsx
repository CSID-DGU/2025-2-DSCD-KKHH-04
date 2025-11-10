import React, { useEffect, useRef, useState } from "react";

/* 테마: send는 초록 계열 유지 */
const THEME = {
  accent: "#0f7a4f",
  accentSoft: "#e7f5ef",
  dark: "#0f1a2a",
};

export default function BankerSend() {
  return (
    <main className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      {/* 공통 폭: 탭/고객바/채팅/ASR 모두 동일 */}
      <div className="mx-auto max-w-6xl">
        <NavTabs />
        <CustomerBar />
        <ChatPanel />
        <ASRPanel />
      </div>
    </main>
  );
}

/* ---------------- 탭 ---------------- */
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
                (active === i ? "text-white" : "hover:bg-slate-100 text-slate-600")
              }
              style={active === i ? { backgroundColor: THEME.accent } : {}}
            >
              {t}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ---------------- 고객 정보 바 ---------------- */
function CustomerBar() {
  return (
    <section className="mt-3 w-full bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-3 text-sm sm:text-base">
      <div className="flex flex-col">
        {/* 제목 */}
        <div className="flex items-center gap-2 text-lg font-semibold mb-1 text-slate-800">
          <span className="h-7 w-7 rounded-full flex items-center justify-center border border-slate-400">
            <UserIconStroke className="h-4 w-4 text-slate-700" />
          </span>
          <span>고객 정보</span>
        </div>

        {/* 세부 정보 */}
        <div className="text-slate-700 font-medium ml-9 mt-2">
          김희희 <span className="mx-2 text-slate-400">|</span> XX은행 1002-123-4567
        </div>
      </div>
    </section>
  );
}

/* ---------------- 상담 대화창 ---------------- */
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
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { from: "agent", text: input.trim() }]);
    setInput("");
  };

  return (
    <section className="mt-4 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 text-lg font-semibold text-slate-700 mb-3">
        <TitleBubbleIcon className="h-5 w-5 text-slate-600" />
        <span>상담 대화창</span>
      </div>

      <div className="h-[420px] md:h-[480px] lg:h-[520px] flex flex-col">
        <div className="flex-1 overflow-y-auto pr-2 space-y-3">
          {messages.map((m, i) => (
            <MessageRow key={i} side={m.from === "agent" ? "left" : "right"}>
              {m.text}
            </MessageRow>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="pt-3 border-t mt-3 flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
            placeholder="메시지를 입력하세요..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button
            onClick={send}
            className="px-4 py-2 rounded-lg text-white text-sm"
            style={{ backgroundColor: THEME.accent }}
          >
            전송
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 말풍선 + 아바타 ---------------- */
function MessageRow({ side = "left", children }) {
  const isLeft = side === "left";
  return (
    <div className={`flex items-start ${isLeft ? "justify-start" : "justify-end"}`}>
      {isLeft && <Avatar size="md" className="mr-2" />}
      <div
        className={
          "max-w-[82%] rounded-xl px-4 py-3 text-base leading-relaxed " +
          (isLeft ? "bg-slate-100 text-slate-900" : "text-slate-900")
        }
        style={!isLeft ? { backgroundColor: THEME.accentSoft } : {}}
      >
        {children}
      </div>
      {!isLeft && <Avatar size="lg" className="ml-2" />}
    </div>
  );
}

/* ---------------- 하단 ASR 패널: 마이크 클릭 녹음 ---------------- */
function ASRPanel() {
  const [stage, setStage] = useState(0);
  const [isRec, setIsRec] = useState(false);
  const [recErr, setRecErr] = useState("");
  const [sec, setSec] = useState(0);
  const [lastAudio, setLastAudio] = useState(null); // { url, blob, mime }

  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setStage((s) => (s + 1) % 4), 1600);
    return () => clearInterval(id);
  }, []);

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

  useEffect(() => {
    // 언마운트 시 스트림/레코더 정리
    return () => {
      try {
        mediaRecRef.current?.stop?.();
      } catch {}
      streamRef.current?.getTracks?.().forEach((t) => t.stop());
      if (lastAudio?.url) URL.revokeObjectURL(lastAudio.url);
    };
  }, []);

  const chooseMime = () => {
    if (window.MediaRecorder?.isTypeSupported?.("audio/webm;codecs=opus"))
      return "audio/webm;codecs=opus";
    if (window.MediaRecorder?.isTypeSupported?.("audio/webm"))
      return "audio/webm";
    if (window.MediaRecorder?.isTypeSupported?.("audio/mp4"))
      return "audio/mp4";
    return ""; // 브라우저가 알아서
  };

  const startRec = async () => {
    setRecErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = chooseMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      mediaRecRef.current = mr;
      chunksRef.current = [];
      setSec(0);

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        try {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
          const url = URL.createObjectURL(blob);
          // 이전 url 정리
          if (lastAudio?.url) URL.revokeObjectURL(lastAudio.url);
          setLastAudio({ url, blob, mime: blob.type });
        } catch (e) {
          setRecErr("오디오 데이터를 생성하지 못했어요.");
        }
        // 마이크 해제
        streamRef.current?.getTracks?.().forEach((t) => t.stop());
        streamRef.current = null;
      };

      mr.start();            // 기본 timeslice: 전체 종료 시 한 번에 수집
      setIsRec(true);
    } catch (e) {
      console.error(e);
      setRecErr("마이크 권한을 확인해 주세요. (https 환경/localhost 권장)");
      setIsRec(false);
    }
  };

  const stopRec = () => {
    try {
      mediaRecRef.current?.stop();
    } catch (e) {
      // 이미 stop 상태일 수 있음
    }
    setIsRec(false);
  };

  const toggleRec = () => {
    if (isRec) stopRec();
    else startRec();
  };

  return (
    <section className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      {/* 헤더: 클릭 가능한 마이크 아이콘 + 상태/바 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* ▶ 아이콘 버튼 */}
          <button
            type="button"
            onClick={toggleRec}
            aria-pressed={isRec}
            title={isRec ? "녹음 중지" : "녹음 시작"}
            className={
              "flex items-center justify-center rounded-full border-2 bg-white " +
              (isRec
                ? "h-18 w-18 border-emerald-500 ring-4 ring-emerald-200 animate-pulse"
                : "h-16 w-16 border-slate-300")
            }
          >
            <MicIconStroke className={isRec ? "h-9 w-9 text-emerald-700" : "h-8 w-8 text-slate-800"} />
          </button>

          <div className="text-slate-700">
            <div className="flex items-center gap-3">
              <div className="text-base sm:text-lg font-semibold">
                {isRec ? "녹음 중..." : "음성 인식 중..."}
              </div>
              {isRec && (
                <span className="text-sm text-emerald-700 font-medium">
                  {formatTime(sec)}
                </span>
              )}
            </div>
            <div className="mt-2">
              <StageDots active={stage} />
            </div>
          </div>
        </div>
      </div>

      {/* 인식 텍스트 + 버튼들 */}
      <div className="mt-4 flex items-stretch gap-3">
        <div className="flex-1 space-y-3">
          <div className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <span className="text-slate-400">
              {isRec ? "녹음 중입니다…" : "수어 인식 결과가 표시됩니다."}
            </span>
          </div>

          {/* 마지막 녹음 미리듣기/다운로드 */}
          {lastAudio?.url && (
            <div className="flex items-center gap-3">
              <audio controls src={lastAudio.url} className="w-full" />
              <a
                href={lastAudio.url}
                download={`recording.${(lastAudio.mime || "audio/webm").split("/")[1] || "webm"}`}
                className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 whitespace-nowrap"
              >
                다운로드
              </a>
            </div>
          )}

          {/* 오류 메시지 */}
          {recErr && (
            <div className="text-sm text-red-600">{recErr}</div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            className="h-11 px-5 rounded-xl text-white text-sm"
            style={{ backgroundColor: THEME.dark }}
            onClick={() => alert("TODO: 서버로 업로드/전송 로직 연결")}
          >
            응답 전송
          </button>
          <button className="h-11 px-4 rounded-xl border border-slate-200 text-slate-700 text-sm hover:bg-slate-50">
            번역 오류
          </button>
        </div>
      </div>
    </section>
  );
}

/* 균일 진행바(4개) */
function StageDots({ active = 0 }) {
  return (
    <div className="flex items-center gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={
            "h-2 w-12 rounded-full transition-all " +
            (active >= i ? "bg-slate-900" : "bg-slate-200")
          }
        />
      ))}
    </div>
  );
}

/* 시간 포맷 00:00 */
function formatTime(s) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/* (기존) MicIconStroke 그대로 사용 */

/* ---------------- SegmentedControl (삭제됨) ---------------- */

/* ---------------- 아이콘 + 아바타 ---------------- */
function Avatar({ size = "md", className = "" }) {
  const sizeCls = size === "lg" ? "h-10 w-10" : "h-8 w-8";
  const iconCls = size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return (
    <div
      className={`${sizeCls} rounded-full bg-slate-200 text-slate-600 flex items-center justify-center 
         ring-2 ring-white shadow-sm ${className}`}
    >
      <UserIconFill className={iconCls} />
    </div>
  );
}

/* ---------------- SVG 아이콘 ---------------- */
function TitleBubbleIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M4 4h16a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    </svg>
  );
}

/* 아바타용 꽉찬 사용자 아이콘 */
function UserIconFill({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 12a5 5 0 1 0-5-5 5.006 5.006 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
    </svg>
  );
}

/* 고객정보 타이틀용: 테두리만 있는 사용자 아이콘 */
function UserIconStroke({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

/* ASR용: 테두리만 있는 마이크 아이콘 */
function MicIconStroke({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="9" y="4" width="6" height="10" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4M9 22h6" />
    </svg>
  );
}

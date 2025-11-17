import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom"; // ✅ 추가

export default function BankerSend() {
  // ✅ 이 화면 들어올 때마다 브라우저 스크롤을 맨 위로 강제 이동
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  return (
    <div className="w-full h-auto overflow-hidden">
      <main className="w-full px-4 sm:px-6 lg:px-10 pt-4 pb-8 bg-slate-50 min-h-[calc(100vh-56px)]">
        <NavTabs />
        <CustomerBar />
        <ChatPanel />
        <ASRPanel />
      </main>
    </div>
  );
}

/* ---------------- 탭 + 송신/수신 토글 ---------------- */
/* ---------------- 탭 + 송신/수신 토글 ---------------- */
function NavTabs() {
  const tabs = ["실시간 인식", "대화 로그", "고객 메모", "시스템 상태"];
  const [active, setActive] = useState(0);

  return (
    <nav className="w-full bg-white rounded-xl shadow-sm border border-slate-200 px-3 pb-3">
      <div className="flex items-start justify-between gap-4">
        {/* 왼쪽: 탭 메뉴 */}
        <ul className="flex flex-wrap gap-6 mt-2">
          {tabs.map((t, i) => (
            <li key={t}>
              <button
                onClick={() => setActive(i)}
                className={
                  "px-4 py-2 rounded-lg text-sm sm:text-base " +
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

        {/* 오른쪽: 송신/수신 토글 (송신 활성) */}
        <div className="mt-2">
          <SendReceiveToggle active="send" />
        </div>
      </div>
    </nav>
  );
}


/* ---------------- 고객 정보 바 ---------------- */
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

/* ---------------- 말풍선 ---------------- */
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

  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  // 진행바 애니메이션
  useEffect(() => {
    const id = setInterval(() => setStage((s) => (s + 1) % 4), 1600);
    return () => clearInterval(id);
  }, []);

  // 타이머
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

  // unmount 시 정리
  useEffect(() => {
    return () => {
      try {
        mediaRecRef.current?.stop?.();
      } catch {}
      streamRef.current?.getTracks?.().forEach((t) => t.stop());
      if (lastAudio?.url) URL.revokeObjectURL(lastAudio.url);
    };
  }, [lastAudio]);

  const startRec = async () => {
    setRecErr("");
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

  return (
    <section className="mt-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-4">
        {/* 왼쪽: 마이크 원형 버튼 */}
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

        {/* 가운데: 제목 / 진행바 / 입력창 */}
        <div className="flex-1">
          <div className="flex items-baseline gap-2 font-semibold text-base text-slate-800">
            <span>{isRec ? "녹음 중..." : "음성 인식 중..."}</span>
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
        </div>

        {/* 오른쪽: 버튼 두 개 세로 */}
        <div className="flex flex-col gap-2">
          <button className="h-11 px-5 rounded-xl bg-slate-900 text-white text-base hover:bg-slate-800 whitespace-nowrap">
            응답 전송
          </button>
          <button className="h-11 px-5 rounded-xl border border-slate-300 text-base hover:bg-slate-50 whitespace-nowrap">
            번역 오류
          </button>
        </div>
      </div>

      {(lastAudio?.url || recErr) && (
        <div className="mt-3 space-y-2">
          {lastAudio?.url && (
            <audio controls src={lastAudio.url} className="w-full" />
          )}
          {recErr && <div className="text-xs text-red-600">{recErr}</div>}
        </div>
      )}
    </section>
  );
}

/* ---------------- 진행 바 ---------------- */
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

/* ---------------- 유틸 ---------------- */
function formatTime(s) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/* ---------------- 아이콘 ---------------- */
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
      aria-hidden="true"
    >
      <rect x="9" y="4" width="6" height="10" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
      <path d="M9 22h6" />
    </svg>
  );
}

/* ---------------- 송신/수신 상단 토글 ---------------- */
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
          if (active !== "send") navigate("/banker/send"); // ✅ 라우트는 프로젝트에 맞게 수정
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
          if (active !== "receive") navigate("/banker/receive"); // ✅ 여기도 라우터에 맞게
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

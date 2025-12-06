// frontend_clean/src/pages/Banker/Receive.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import NavTabs from "../../components/NavTabs";
import { useChatStore } from "../../store/chatstore"; // 전역 상담 대화

// 세션 & API 기본 값 (BankerSend랑 맞춤)
const SESSION_KEY = "signanceSessionId";
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Receive는 기존 세션만 읽기 (새로 만들지 않음)
function getExistingSessionId() {
  try {
    return localStorage.getItem(SESSION_KEY) || null;
  } catch {
    return null;
  }
}

/* 🔹 공통: 은행원(banker) 채팅 전송 함수 */
async function sendBankerChat(text, mode = "") {
  const trimmed = (text || "").trim();
  if (!trimmed) return;

  const sessionId = getExistingSessionId();
  if (!sessionId) {
    alert("상담 세션이 없습니다. 상담을 먼저 시작해 주세요.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/accounts/chat/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        session_id: sessionId,
        sender: "banker",
        role: mode === "질문" || mode === "응답" ? mode : "",
        text: trimmed,
      }),
    });

    if (!res.ok) {
      console.error("sendBankerChat POST 실패:", await res.text());
    }
  } catch (err) {
    console.error("sendBankerChat POST error:", err);
  }
}

/* ---------------- 고객 정보 바 ---------------- */
function CustomerBar() {
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    birth: "",
    phone: "",
  });

  // 컴포넌트가 화면에 처음 나올 때 localStorage에서 읽어오기
  useEffect(() => {
    try {
      const raw = localStorage.getItem("customerInfo");
      if (raw) {
        setCustomerInfo(JSON.parse(raw));
      }
    } catch (e) {
      console.error("customerInfo 파싱 에러:", e);
    }
  }, []);

  const name = customerInfo.name || "고객 성함 미입력";
  const birth = customerInfo.birth || "--";
  const phone = customerInfo.phone || "--";

  return (
    <section className="mt-4 w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 text-lg font-semibold text-slate-700">
        <UserIcon className="h-5 w-5 text-slate-700" />
        <span>고객 정보</span>
      </div>
      <div className="mt-3 ml-[2.1rem] text-slate-800 text-base font-medium">
        고객 이름 : {name}
        <span className="mx-2 text-slate-400">|</span>
        생년월일 : {birth}
        <span className="mx-2 text-slate-400">|</span>
        전화번호 : {phone}
      </div>
    </section>
  );
}

export default function BankerReceive() {
  const navigate = useNavigate();

  // 전역 상담 대화
  const { messages, setMessages } = useChatStore();

  // 세션 ID: 이미 만들어진 것만 사용
  const [sessionId, setSessionId] = useState(() => getExistingSessionId());

  // 이 화면에 "들어온 시점" 기록 (이후 메시지만 보기 위함)
  const [resetAfter] = useState(() => Date.now());

  // 화면 들어올 때 기존 messages 초기화
  useEffect(() => {
    setMessages([]);
  }, [setMessages]);

  // BankerReceive 들어올 때 화면 맨 위로
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  // 다른 탭에서 SESSION_KEY 바뀌면 sessionId 갱신
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === SESSION_KEY) {
        setSessionId(e.newValue || null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 🔹 백엔드 /chat 폴링: DeafSend, DeafReceive와 동일 구조 + resetAfter 필터
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
          console.error("BankerReceive chat fetch 실패:", await res.text());
          return;
        }

        const data = await res.json(); // [{ id, session_id, sender, role, text, created_at }, ...]
        if (!Array.isArray(data) || stopped) return;

        // 새로고침/진입 시점 이후 메시지만 보기
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
        console.error("BankerReceive chat fetch error:", err);
      }
    };

    fetchAllMessages();
    const timer = window.setInterval(fetchAllMessages, 2000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [sessionId, setMessages, resetAfter]);

  // 입력창에서 보내기 눌렀을 때 → 백엔드로 POST
  const handleSend = async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    await sendBankerChat(trimmed);
    // 폴링으로 다시 가져오니까 messages 직접 건들 필요 없음
  };

  return (
    <div className="w-full h-auto overflow-hidden">
      <main className="w-full px-4 sm:px-6 lg:px-10 pt-4 pb-8 bg-slate-50 min-h-[calc(100vh-56px)]">
        {/* 상단 탭 */}
        <NavTabs
          rightSlot={<SendReceiveToggle active="receive" />}
          onTabClick={(idx) => {
            if (idx === 3) navigate("/performance");
          }}
        />

        {/* 고객 정보 바 */}
        <CustomerBar />

        {/* 상담 대화창 + 아래 ASRPanel(디자인용) */}
        <ChatPanel messages={messages} onSend={handleSend} />
        <ASRPanel />
      </main>
    </div>
  );
}

/* ---------------- 상담 대화창 ---------------- */
function ChatPanel({ messages, onSend }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    const txt = input.trim();
    if (!txt) return;
    onSend?.(txt);
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
          <ChatBubble
            key={m.id ?? i}
            role={m.from || m.role}
            text={m.text}
          />
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

  const isAgent = (role || "agent") === "agent";
  return (
    <div
      className={"flex items-start gap-2 " + (isAgent ? "" : "justify-end")}
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

/* ---------------- 음성(수어) 인식 패널 (디자인용) ---------------- */
function ASRPanel() {
  const [stage, setStage] = useState(0);
  const [isRec, setIsRec] = useState(false);
  const [mode, setMode] = useState("응답");
  const [text, setText] = useState("");

  useEffect(() => {
    const id = setInterval(() => setStage((s) => (s + 1) % 4), 1600);
    return () => clearInterval(id);
  }, []);

  const toggleRec = () => {
    setIsRec((prev) => !prev);
  };

  return (
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
            <HandIcon
              className={
                isRec ? "h-9 w-9 text-slate-900" : "h-8 w-8 text-slate-800"
              }
            />
          </button>
        </div>

        <div className="flex-1">
          <div className="font-semibold text-base text-slate-800">
            {isRec ? "녹음 중..." : "수어 인식 중..."}
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
      aria-hidden="true"
    >
      <path d="M12 22s-6-4.5-6-9.5V7a2 2 0 1 1 4 0v4" />
      <path d="M10 12V6a2 2 0 1 1 4 0v6" />
      <path d="M14 12V5a2 2 0 1 1 4 0v6" />
    </svg>
  );
}

/* ---------------- 상단 송신/수신 토글 ---------------- */
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

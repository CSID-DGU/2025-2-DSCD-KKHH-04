import React, { useEffect, useRef, useState } from "react";

export default function BankerReceive() {
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
                (active === i
                  ? "bg-slate-800 text-white"
                  : "hover:bg-slate-100 text-slate-600")
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

/* ---------------- 고객 정보 바 ---------------- */
function CustomerBar() {
  return (
    <section className="mt-3 w-full bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-3 text-sm sm:text-base">
      <div className="flex flex-col">
        {/* 제목 */}
        <div className="flex items-center gap-2 text-lg font-semibold text-[#2b5486] mb-1">
          <span className="h-7 w-7 rounded-full bg-[#e7eef7] flex items-center justify-center">
            <UserIcon className="h-4 w-4 text-[#2b5486]" />
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
            className="px-4 py-2 rounded-lg bg-[#2b5486] text-white text-sm"
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
          "max-w-[82%] rounded-xl px-4 py-3 text-sm " +
          (isLeft ? "bg-slate-100 text-slate-800" : "bg-blue-100 text-slate-800")
        }
      >
        {children}
      </div>
      {!isLeft && <Avatar size="lg" className="ml-2" />}
    </div>
  );
}

/* ---------------- 하단 ASR 패널 ---------------- */
function ASRPanel() {
  const [mode, setMode] = useState("answer"); // "question" | "answer"

  return (
    <section className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      {/* 헤더: 아이콘 + '음성 인식 중...' + 진행바 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="h-12 w-12 rounded-full bg-[#e7eef7] grid place-items-center">
            <HandIcon className="h-6 w-6 text-[#2b5486]" />
          </span>
          <div className="text-slate-700">
            <div className="text-base sm:text-lg font-semibold">음성 인식 중...</div>
            <div className="mt-2 flex items-center gap-3">
              <span className="h-2 w-28 rounded-full bg-slate-300 animate-pulse" />
              <span className="h-2 w-10 rounded-full bg-slate-400 animate-pulse" />
              <span className="h-2 w-10 rounded-full bg-slate-400/70 animate-pulse" />
              <span className="h-2 w-10 rounded-full bg-slate-200" />
            </div>
          </div>
        </div>

        {/* 질문/응답 토글 */}
        <SegmentedControl
          value={mode}
          onChange={setMode}
          items={[
            { value: "question", label: "질문" },
            { value: "answer", label: "응답" },
          ]}
        />
      </div>

      {/* 인식 텍스트 영역 + 버튼들 */}
      <div className="mt-4 flex items-stretch gap-3">
        <div className="flex-1">
          <div className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 relative">
            {/* 연필 아이콘: 수정 가능 표시 */}
            <button
              type="button"
              className="absolute right-3 top-3 inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-slate-100 text-slate-400"
              aria-label="편집 가능"
            >
              <PencilIcon className="h-4 w-4" />
            </button>

            <span className="text-slate-400">
              수어 인식 결과가 표시됩니다.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="h-11 px-5 rounded-xl bg-[#0f1a2a] text-white text-sm">
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

/* ---------------- Segmented Control ---------------- */
function SegmentedControl({ value, onChange, items }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1">
      {items.map((it) => {
        const selected = value === it.value;
        return (
          <button
            key={it.value}
            onClick={() => onChange(it.value)}
            className={
              "px-3 sm:px-4 h-9 rounded-lg text-sm " +
              (selected
                ? "bg-[#0f1a2a] text-white"
                : "text-slate-600 hover:bg-slate-200")
            }
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- 아이콘 + 아바타 ---------------- */
function Avatar({ size = "md", className = "" }) {
  const sizeCls = size === "lg" ? "h-10 w-10" : "h-8 w-8";
  const iconCls = size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return (
    <div
      className={`${sizeCls} rounded-full bg-slate-200 text-slate-600 flex items-center justify-center 
         ring-2 ring-white shadow-sm ${className}`}
    >
      <UserIcon className={iconCls} />
    </div>
  );
}

function TitleBubbleIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M4 4h16a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    </svg>
  );
}

function UserIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 12a5 5 0 1 0-5-5 5.006 5.006 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
    </svg>
  );
}

function HandIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M7 11V6a1 1 0 0 1 2 0v5h1V5a1 1 0 1 1 2 0v6h1V6a1 1 0 1 1 2 0v7h1V9a1 1 0 1 1 2 0v6a5 5 0 0 1-5 5H12a5 5 0 0 1-5-5v-4z" />
    </svg>
  );
}

function PencilIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}
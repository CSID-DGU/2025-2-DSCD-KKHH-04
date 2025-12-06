// frontend_clean/src/pages/Banker/Send.jsx
// frontend_clean/src/pages/Banker/Send.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import NavTabs from "../../components/NavTabs";
import ASRPanel from "../../components/Banker/ASRPanel";
import { useChatStore } from "../../store/chatstore"; // 🔹 전역 스토어 import

const SESSION_KEY = "signanceSessionId";

import NavTabs from "../../components/NavTabs";
import ASRPanel from "../../components/Banker/ASRPanel";
import { useChatStore } from "../../store/chatstore"; // 🔹 전역 스토어 import

const SESSION_KEY = "signanceSessionId";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";


function getOrCreateSessionId() {
  try {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return `sess_${Date.now()}`;
  }
}

export default function BankerSend() {
  const navigate = useNavigate();

  // 🔹 전역 상담 메시지 상태 (모든 페이지에서 공유)
  const { messages, setMessages } = useChatStore();

  // 🔹 세션 ID (처음 마운트 시 한 번만 생성/로드)
  const [sessionId] = useState(() => getOrCreateSessionId());

  // 새로 추가되는 메시지용 id 카운터 (백엔드 응답 없을 때만 사용)
  const nextIdRef = useRef(Date.now());

  // 입력값 / 수정 모드 상태
  const [inputValue, setInputValue] = useState("");
  const [editMode, setEditMode] = useState(false); // 연필 버튼 on/off
  const [editTargetId, setEditTargetId] = useState(null); // 어떤 말풍선 수정 중인지

  const navigate = useNavigate();

  // 🔹 전역 상담 메시지 상태 (모든 페이지에서 공유)
  const { messages, setMessages } = useChatStore();

  // 🔹 세션 ID (처음 마운트 시 한 번만 생성/로드)
  const [sessionId] = useState(() => getOrCreateSessionId());

  // 새로 추가되는 메시지용 id 카운터 (백엔드 응답 없을 때만 사용)
  const nextIdRef = useRef(Date.now());

  // 입력값 / 수정 모드 상태
  const [inputValue, setInputValue] = useState("");
  const [editMode, setEditMode] = useState(false); // 연필 버튼 on/off
  const [editTargetId, setEditTargetId] = useState(null); // 어떤 말풍선 수정 중인지

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    localStorage.setItem("signanceDeafStatus", "idle");
    localStorage.setItem("signanceDeafStatus", "idle");
  }, []);

  /* ---------------- 백엔드 저장/수정 공통 함수 ---------------- */

  // 🔹 chat 생성 (입력창 / ASR 둘 다 여기로)
  //    → 성공 시 생성된 row(JSON) 리턴: { id, session_id, sender, role, text, created_at, ... }
  const saveMessageToBackend = async ({ text, mode }) => {
    try {
      const res = await fetch(`${API_BASE}/api/accounts/chat/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          sender: "banker", // 은행원 화면
          role: mode || "", // "질의"/"설명"/"응답" 등
          text,
        }),
      });

      if (!res.ok) {
        console.error("chat 저장 실패:", await res.text());
        return null;
      }

      const data = await res.json();
      // 🔹 백엔드에서 새로 내려준 tokens 사용
      const tokens = data.tokens || [];

      const gloss = tokens.map(t => t.text);
      const glossType = tokens.map(t => t.type);

      console.log("[speech_to_sign] tokens:", tokens);
      console.log("[speech_to_sign] gloss:", gloss);
      console.log("[speech_to_sign] glossType:", glossType);

      return data;
    } catch (err) {
      console.error("chat 저장 실패:", err);
      return null;
    }
  };

  // 🔹 chat 수정 (기존 발화 수정 시 사용)
  //    backendId = 백엔드 chat row id (우리는 message.id랑 같게 씀)
  const updateMessageOnBackend = async (backendId, { text, mode }) => {
    if (!backendId) return;
    try {
      const res = await fetch(`${API_BASE}/api/accounts/chat/${backendId}/`, {
        method: "PATCH", // 백엔드가 PUT만 지원하면 "PUT"으로 변경
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          role: mode || "",
        }),
      });

      if (!res.ok) {
        console.error("chat 수정 실패:", await res.text());
      }
    } catch (err) {
      console.error("chat 수정 에러:", err);
    }
  };

  /* ---------------- 연필 버튼 / 삭제 / 선택 ---------------- */

  // 연필 버튼 토글
  const handleToggleEditMode = () => {
    setEditMode((prev) => {
      const next = !prev;
      if (!next) {
        // 수정 모드 종료 시 초기화
        setEditTargetId(null);
        setInputValue("");
      }
      return next;
    });
  };

  // 말풍선 하나 선택해서 수정 시작
  const handleSelectBubbleForEdit = (id) => {
    const target = messages.find((m) => m.id === id);
    if (!target) return;
    setEditMode(true);
    setEditTargetId(id);
    setInputValue(target.text);
  };

  const handleDeleteMessage = (id) => {
    if (!editMode) return; // 수정 모드에서만 삭제 허용

    setMessages((prev) => prev.filter((m) => m.id !== id));

    if (editTargetId === id) {
      setEditTargetId(null);
      setInputValue("");
    }
  };

  /* ---------------- 입력창: 보내기 / 수정 완료 ---------------- */

  const handleSendOrUpdate = async () => {
    const text = inputValue.trim();
    if (!text) return;

    // ✅ 수정 모드인 경우: 프론트 + 백엔드 둘 다 수정
    if (editMode && editTargetId != null) {
      let targetBackendId = null;
      let targetMode = "";

      // 1) 프론트 상태 먼저 수정
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === editTargetId) {
            // DeafReceive에서 들어온 메시지 포함: m.id = 백엔드 id
            targetBackendId = m.id ?? null;
            targetMode = m.mode ?? "";
            return {
              ...m,
              text,
            };
          }
          return m;
        })
      );

      // 2) 백엔드도 수정 반영
      if (targetBackendId) {
        await updateMessageOnBackend(targetBackendId, {
          text,
          mode: targetMode,
        });
      }

      setInputValue("");
      setEditMode(false);
      setEditTargetId(null);
      return;
    }

    // ✅ 신규 말풍선 추가 (항상 은행원 발화)
    // 1) 백엔드에 먼저 저장
    const created = await saveMessageToBackend({ text });

    // 2) id 결정: 백엔드 id가 있으면 그걸 쓰고, 없으면 로컬에서 발급
    const id = created?.id ?? nextIdRef.current++;

    // 3) ts 생성: 백엔드 created_at > 없으면 지금 시각
    const ts =
      created?.created_at ??
      new Date().toISOString();

    // 4) 프론트 상태 업데이트
    setMessages((prev) => [
      ...prev,
      {
        id, // 항상 백엔드 id를 우선으로 사용
        from: "agent",
        text: created?.text ?? text,
        mode: created?.role ?? "",
        created_at: created?.created_at,
        ts, // 🔹 발화 순서용 키
      },
    ]);

    setInputValue("");
    setEditMode(false);
    setEditTargetId(null);
  };

  /* ---------------- ASRPanel → 채팅으로 푸시 ---------------- */

  // ASRPanel에서 onPushToChat({ text, mode, ts }) 형태로 호출
  const handlePushFromASR = async ({ text, mode, ts }) => {
    if (!text) return;

    // 1) 백엔드 저장
    const created = await saveMessageToBackend({ text, mode });

    // 2) id 결정
    const id = created?.id ?? nextIdRef.current++;

    // 3) ts 결정: ASRPanel ts > created_at > now
    const finalTs =
      ts ??
      created?.created_at ??
      new Date().toISOString();

    // 4) 프론트 상태 업데이트
    setMessages((prev) => [
      ...prev,
      {
        id,
        from: "agent", // 필요하면 mode 보고 "user"/"agent" 나눌 수 있음
        text: created?.text ?? text,
        mode: created?.role ?? mode,
        created_at: created?.created_at,
        ts: finalTs, // 🔹 발화 순서용 키
      },
    ]);
  };

  return (
    <div className="w-full h-auto">
    <div className="w-full h-auto">
      <main className="w-full px-4 sm:px-6 lg:px-10 pt-4 pb-8 bg-slate-50 min-h-[calc(100vh-56px)]">
        <NavTabs
          rightSlot={<SendReceiveToggle active="send" />}
          onTabClick={(idx) => {
            if (idx === 1) navigate("/banker/logs");
            if (idx === 3) navigate("/performance");
          }}
        />

        {/* 🔹 고객 정보 바: 정적 내용 표시 */}
        <NavTabs
          rightSlot={<SendReceiveToggle active="send" />}
          onTabClick={(idx) => {
            if (idx === 1) navigate("/banker/logs");
            if (idx === 3) navigate("/performance");
          }}
        />

        {/* 🔹 고객 정보 바: 정적 내용 표시 */}
        <CustomerBar />

        {/* 상담 대화창 – 상태는 전역 store에서 가져옴 */}
        <ChatPanel
          messages={messages}
          inputValue={inputValue}
          setInputValue={setInputValue}
          onSendOrUpdate={handleSendOrUpdate}
          editMode={editMode}
          onToggleEditMode={handleToggleEditMode}
          onSelectBubbleForEdit={handleSelectBubbleForEdit}
          onDeleteMessage={handleDeleteMessage}
        />

        {/* 수어 인식 패널 – 여기서 onPushToChat으로 채팅으로 전송 */}
        <ASRPanel onPushToChat={handlePushFromASR} />

        {/* 상담 대화창 – 상태는 전역 store에서 가져옴 */}
        <ChatPanel
          messages={messages}
          inputValue={inputValue}
          setInputValue={setInputValue}
          onSendOrUpdate={handleSendOrUpdate}
          editMode={editMode}
          onToggleEditMode={handleToggleEditMode}
          onSelectBubbleForEdit={handleSelectBubbleForEdit}
          onDeleteMessage={handleDeleteMessage}
        />

        {/* 수어 인식 패널 – 여기서 onPushToChat으로 채팅으로 전송 */}
        <ASRPanel onPushToChat={handlePushFromASR} />
      </main>
    </div>
  );
}

/* ---------------- 고객 정보 바 ---------------- */

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
  const birth = customerInfo.birth || "생년월일 미입력";
  const phone = customerInfo.phone || "연락처 미입력";

  return (
    <section className="mt-4 w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-2 text-lg font-semibold text-slate-700">
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


/* ---------------- 상담 대화 정렬용 함수 ---------------- */

function getOrderKey(m) {
  const pick = (v) => {
    if (v instanceof Date) return v.getTime();
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string") {
      // '20251203_202107', '2025-12-03T20:21:07+09:00' 등 → 숫자만 뽑아서 비교
      const digits = v.replace(/\D/g, "");
      if (digits) {
        const num = Number(digits);
        if (!Number.isNaN(num)) return num;
      }
    }
    return null;
  };

  // 1순위: ts (발화 시점)
  let key = pick(m.ts);
  if (key != null) return key;

  // 2순위: created_at (백엔드 생성 시점)
  key = pick(m.created_at);
  if (key != null) return key;

  // 3순위: id
  key = pick(m.id);
  if (key != null) return key;

  // 그래도 없으면 0
  return 0;
}

/* ---------------- 상담 대화 UI ---------------- */

function ChatPanel({
  messages,
  inputValue,
  setInputValue,
  onSendOrUpdate,
  editMode,
  onToggleEditMode,
  onSelectBubbleForEdit,
  onDeleteMessage,
}) {
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // 🔹 발화 순서 기준으로 정렬된 메시지
  const orderedMessages = [...(messages || [])].sort((a, b) => {
    const ka = getOrderKey(a);
    const kb = getOrderKey(b);
    if (ka === kb) {
      // 같은 시점이면 id 기준으로 한 번 더 정렬
      const ida = Number(String(a.id ?? 0).replace(/\D/g, "")) || 0;
      const idb = Number(String(b.id ?? 0).replace(/\D/g, "")) || 0;
      return ida - idb;
    }
    return ka - kb;
  });
  const inputRef = useRef(null);

  // 🔹 발화 순서 기준으로 정렬된 메시지
  const orderedMessages = [...(messages || [])].sort((a, b) => {
    const ka = getOrderKey(a);
    const kb = getOrderKey(b);
    if (ka === kb) {
      // 같은 시점이면 id 기준으로 한 번 더 정렬
      const ida = Number(String(a.id ?? 0).replace(/\D/g, "")) || 0;
      const idb = Number(String(b.id ?? 0).replace(/\D/g, "")) || 0;
      return ida - idb;
    }
    return ka - kb;
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [orderedMessages]);

  useEffect(() => {
    if (editMode) {
      inputRef.current?.focus();
    }
  }, [editMode]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSendOrUpdate();
    }
  };

  const placeholder = editMode
    ? "수정할 말풍선을 클릭하고 내용을 수정한 뒤 [보내기]를 눌러주세요."
    : "메시지를 입력하세요";
  }, [orderedMessages]);

  useEffect(() => {
    if (editMode) {
      inputRef.current?.focus();
    }
  }, [editMode]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSendOrUpdate();
    }
  };

  const placeholder = editMode
    ? "수정할 말풍선을 클릭하고 내용을 수정한 뒤 [보내기]를 눌러주세요."
    : "메시지를 입력하세요";

  return (
    <section className="mt-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col">
      <div className="flex items-center justify-between w-full">
        {/* 왼쪽: 상담 대화창 */}
        <div className="flex items-center gap-2 text-lg font-semibold text-slate-800">
          <BubbleIcon />
          <span>상담 대화창</span>
        </div>

        {/* 오른쪽: 안내문 + 연필 버튼 */}
        <div className="flex items-center gap-3">
          {editMode && (
            <span className="text-xs text-slate-500 font-normal">
              수정할 말풍선을 클릭하면 아래 입력창에서 내용을 편집할 수
              있습니다.
            </span>
          )}

          <button
            type="button"
            onClick={onToggleEditMode}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border transition-colors ${
              editMode
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            <EditIcon className="w-3.5 h-3.5" />
            <span>{editMode ? "수정 종료" : "문장 수정"}</span>
          </button>
        </div>
      <div className="flex items-center justify-between w-full">
        {/* 왼쪽: 상담 대화창 */}
        <div className="flex items-center gap-2 text-lg font-semibold text-slate-800">
          <BubbleIcon />
          <span>상담 대화창</span>
        </div>

        {/* 오른쪽: 안내문 + 연필 버튼 */}
        <div className="flex items-center gap-3">
          {editMode && (
            <span className="text-xs text-slate-500 font-normal">
              수정할 말풍선을 클릭하면 아래 입력창에서 내용을 편집할 수
              있습니다.
            </span>
          )}

          <button
            type="button"
            onClick={onToggleEditMode}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border transition-colors ${
              editMode
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            <EditIcon className="w-3.5 h-3.5" />
            <span>{editMode ? "수정 종료" : "문장 수정"}</span>
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 h-[318px] overflow-y-auto">
        {orderedMessages.map((m, idx) => (
          <ChatBubble
            key={m.id ?? `${m.from}-${idx}`}
            role={m.role || m.from}
            text={m.text}
            mode={m.mode}
            editable={editMode}
            onClick={() => {
              if (editMode) onSelectBubbleForEdit(m.id);
            }}
            onDelete={() => onDeleteMessage && onDeleteMessage(m.id)}
          />
        {orderedMessages.map((m, idx) => (
          <ChatBubble
            key={m.id ?? `${m.from}-${idx}`}
            role={m.role || m.from}
            text={m.text}
            mode={m.mode}
            editable={editMode}
            onClick={() => {
              if (editMode) onSelectBubbleForEdit(m.id);
            }}
            onDelete={() => onDeleteMessage && onDeleteMessage(m.id)}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 h-11 rounded-xl border border-slate-300 px-3 text-base text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
        <button
          onClick={onSendOrUpdate}
          onClick={onSendOrUpdate}
          className="h-11 px-4 rounded-xl bg-slate-900 text-white text-base hover:bg-slate-800"
        >
          보내기
        </button>
      </div>
    </section>
  );
}

function ChatBubble({ role, text, mode, editable, onClick, onDelete }) {
  // system 메시지: 가운데 정렬 안내문
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

function ChatBubble({ role, text, mode, editable, onClick, onDelete }) {
  // system 메시지: 가운데 정렬 안내문
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
  const label = null;
  const label = null;

  return (
    <div
      className={
        "flex items-start gap-2 mb-3 " + (isAgent ? "" : "justify-end")
      }
    >
      {isAgent && <AvatarCommon />}

      {/* 🔹 여기에서 max-w를 래퍼로 옮김 */}
      <div className="relative max-w-[80%]">
        <button
          type="button"
          onClick={onClick}
          className={
            "w-full text-left rounded-2xl px-4 py-3 bg-white border border-slate-200 " +
            (editable ? "cursor-pointer hover:bg-slate-50" : "")
          }
        >
          {label && (
            <div className="mb-1">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600">
                {label}
              </span>
            </div>
          )}
          <p className="text-base leading-relaxed text-slate-800">{text}</p>
        </button>

        {editable && isAgent && onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center
               rounded-full bg-[#2b5486] text-white text-[10px] font-bold
               shadow-md hover:bg-[#1e3e63] transition"
          >
            ×
          </button>
        )}

      {/* 🔹 여기에서 max-w를 래퍼로 옮김 */}
      <div className="relative max-w-[80%]">
        <button
          type="button"
          onClick={onClick}
          className={
            "w-full text-left rounded-2xl px-4 py-3 bg-white border border-slate-200 " +
            (editable ? "cursor-pointer hover:bg-slate-50" : "")
          }
        >
          {label && (
            <div className="mb-1">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600">
                {label}
              </span>
            </div>
          )}
          <p className="text-base leading-relaxed text-slate-800">{text}</p>
        </button>

        {editable && isAgent && onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center
               rounded-full bg-[#2b5486] text-white text-[10px] font-bold
               shadow-md hover:bg-[#1e3e63] transition"
          >
            ×
          </button>
        )}
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

/* ---------------- 아이콘 & 토글 ---------------- */

/* ---------------- 아이콘 & 토글 ---------------- */

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

function EditIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 20h4l10.5-10.5-4-4L4 16v4z" />
      <path d="M14.5 5.5l4 4" />
    </svg>
  );
}

function EditIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 20h4l10.5-10.5-4-4L4 16v4z" />
      <path d="M14.5 5.5l4 4" />
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

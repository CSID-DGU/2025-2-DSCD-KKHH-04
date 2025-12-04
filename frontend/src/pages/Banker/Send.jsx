import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export default function BankerSend() {
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

/* ---------------- NavTabs ---------------- */
function NavTabs() {
  const tabs = ["실시간 인식", "대화 로그", "고객 메모", "시스템 상태"];
  const [active, setActive] = useState(0);

  return (
    <nav className="w-full bg-white rounded-xl shadow-sm border border-slate-200 px-3 pb-3">
      <div className="flex items-start justify-between gap-4">
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

        <div className="mt-2">
          <SendReceiveToggle active="send" />
        </div>
      </div>
    </nav>
  );
}

/* ---------------- CustomerBar ---------------- */
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

/* ---------------- ChatPanel ---------------- */
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

/* ---------------- ChatBubble ---------------- */
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

  const [isSending, setIsSending] = useState(false);
  const [apiErr, setApiErr] = useState("");

  // 음성 인식 상태: idle(대기), done(완료)
  const [recStatus, setRecStatus] = useState("idle");

  // ✅ 수어 영상 전달 완료 팝업 상태
  const [showDeafPopup, setShowDeafPopup] = useState(false);
  const navigate = useNavigate(); // ✅ DeafReceive로 이동용

  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  /* ---------------- 진행 바 애니메이션 ---------------- */
  useEffect(() => {
    const id = setInterval(() => setStage((s) => (s + 1) % 4), 1600);
    return () => clearInterval(id);
  }, []);

  /* ---------------- 타이머 ---------------- */
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

  /* ---------------- 클린업 ---------------- */
  useEffect(() => {
    return () => {
      try {
        mediaRecRef.current?.stop?.();
      } catch {}
      streamRef.current?.getTracks?.().forEach((t) => t.stop());
      if (lastAudio?.url) URL.revokeObjectURL(lastAudio.url);
    };
  }, [lastAudio]);

  /* ---------------- Blob 업로드 ---------------- */
  const uploadBlob = async (blob) => {
    if (!blob) {
      setApiErr("먼저 음성을 녹음해 주세요.");
      return;
    }

    setIsSending(true);
    setApiErr("");
    setRecStatus("idle");

    try {
      const fd = new FormData();
      fd.append("audio", blob, "speech.webm");

      const resp = await fetch(`${API_BASE}/api/accounts/speech_to_sign/`, {
        method: "POST",
        body: fd,
      });

      if (!resp.ok) {
        const txt = await resp.text();
        console.error("speech_to_sign error:", resp.status, txt);
        setApiErr("음성 처리 중 서버 오류가 발생했어요.");
        return;
      }

      const data = await resp.json();
      console.log("speech_to_sign result:", data);

      // ✅ 1) 화면에 보여줄 텍스트 선택: gemini.clean > raw.clean_text > data.text
      const cleanedText =
        (data.gemini && data.gemini.clean) ||
        (data.raw && data.raw.clean_text) ||
        data.text ||
        "";

      if (cleanedText) {
        setText(cleanedText);
        localStorage.setItem("signanceDeafCaption", cleanedText);
        // 텍스트 들어온 시점에 완료 상태
        setRecStatus("done");
      }

      // 2) 대표 영상 URL 저장
      let hasVideo = false;

      if (data.video_url) {
        localStorage.setItem("signanceDeafVideoUrl", data.video_url);
        console.log("대표 수어 영상 URL:", data.video_url);
        hasVideo = true;
      }

      // 3) 여러 개 영상 리스트 저장
      if (data.video_urls) {
        localStorage.setItem(
          "signanceDeafVideoUrls",
          JSON.stringify(data.video_urls)
        );
        console.log("수어 영상 리스트:", data.video_urls);
        if (Array.isArray(data.video_urls) && data.video_urls.length > 0) {
          hasVideo = true;
        }
      }

      // ✅ 수어 영상이 하나라도 있으면 팝업 띄우기
      if (hasVideo) {
        setShowDeafPopup(true);
      }
    } catch (e) {
      console.error(e);
      setApiErr("서버와 통신 중 오류가 발생했어요.");
      setRecStatus("idle");
    } finally {
      setIsSending(false);
    }
  };

  /* ---------------- 등록된 blob 전송 ---------------- */
  const sendToServer = async () => {
    await uploadBlob(lastAudio?.blob);
  };

  /* ---------------- 녹음 시작 ---------------- */
  const startRec = async () => {
    setRecErr("");
    setApiErr("");
    setRecStatus("idle");

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

          uploadBlob(blob); // 자동 업로드
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

  /* ---------------- 종료 ---------------- */
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

  /* ---------------- JSX ---------------- */
  return (
    <>
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
              <MicIconStroke
                className={
                  isRec ? "h-9 w-9 text-slate-900" : "h-8 w-8 text-slate-800"
                }
              />
            </button>
          </div>

          <div className="flex-1">
            <div className="flex items-baseline gap-2 font-semibold text-base text-slate-800">
              <span>
                {isRec
                  ? "녹음 중..."
                  : recStatus === "done"
                  ? "음성 인식 완료 !"
                  : "음성 인식 대기 중..."}
              </span>
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

            {(recErr || apiErr) && (
              <div className="mt-2 text-xs text-red-600">
                {recErr || apiErr}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button
              className="h-11 px-5 rounded-xl bg-slate-900 text-white text-base hover:bg-slate-800 whitespace-nowrap disabled:bg-slate-400"
              onClick={sendToServer}
              disabled={isSending}
            >
              {isSending ? "전송 중..." : "응답 전송"}
            </button>
            <button className="h-11 px-5 rounded-xl border border-slate-300 text-base hover:bg-slate-50 whitespace-nowrap">
              번역 오류
            </button>
          </div>
        </div>

        {lastAudio?.url && (
          <div className="mt-3 space-y-2">
            <audio controls src={lastAudio.url} className="w-full" />
          </div>
        )}
      </section>

      {/* ✅ 수어 영상 전달 완료 팝업 */}
      {showDeafPopup && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="text-sm font-semibold text-slate-500 mb-1">
              수어 영상 전달 완료
            </div>
            <div className="text-lg font-semibold text-slate-900 mb-2">
              농인 화면으로 영상이 전송되었어요.
            </div>
            <p className="text-sm text-slate-600 mb-5">
              DeafReceive 화면으로 이동해서
              <br />
              매핑된 수어 영상을 확인해 보시겠습니까?
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeafPopup(false)}
                className="px-4 h-10 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
              >
                나중에 보기
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeafPopup(false);
                  navigate("/deaf/receive"); // ✅ DeafReceive 페이지로 이동
                }}
                className="px-4 h-10 rounded-lg bg-slate-900 text-sm text-white hover:bg-slate-800"
              >
                Deaf 화면 바로가기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- StageDots ---------------- */
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

/* ---------------- Util ---------------- */
function formatTime(s) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/* ---------------- Icons ---------------- */
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
    >
      <rect x="9" y="4" width="6" height="10" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
      <path d="M9 22h6" />
    </svg>
  );
}

/* ---------------- Send/Receive Toggle ---------------- */
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

// frontend_clean/src/pages/Deaf/Receive.jsx
import React, { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
// import NavTabs from "../../components/NavTabs";
import { useChatStore } from "../../store/chatstore";

// 기본 영상/자막은 없음 (현재는 미사용이지만 그대로 둠)
const DEFAULT_VIDEO_SRC = null;
const DEFAULT_CAPTION = "";

// 기본 영상/자막은 없음 (현재는 미사용이지만 그대로 둠)
const DEFAULT_VIDEO_SRC = null;
const DEFAULT_CAPTION = "";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Video / Chat 카드 공통 높이
const PANEL_HEIGHT = "h-[560px]";
const SESSION_KEY = "signanceSessionId";

// DeafReceive는 세션을 "만들지 않고" 이미 만들어진 세션만 읽기
// DeafReceive는 세션을 "만들지 않고" 이미 만들어진 세션만 읽기
function getExistingSessionId() {
  try {
    return localStorage.getItem(SESSION_KEY) || null;
  } catch {
    return null;
  }
}

/* ---------------- 메인 컴포넌트 ---------------- */
export default function DeafReceive() {
  // 전역 상담 대화 (백엔드에서 push + Banker에서 수정)
  const { setMessages } = useChatStore();
  useEffect(() => {
    // DeafReceive 들어올 때 전역 채팅창도 한 번 비워두기
    setMessages([]);
  }, [setMessages]);

  // BankerSend에서 만든 session_id만 읽어서 사용
  // BankerSend에서 만든 session_id만 읽어서 사용
  const [sessionId, setSessionId] = useState(() => getExistingSessionId());

  // DeafReceive에서 '여기서부터 새 상담방처럼 보기' 기준 시간
  const [resetAfter, setResetAfter] = useState(() => Date.now());

  // 문장별 영상 히스토리
  const [history, setHistory] = useState([]); // [{ id, videoUrl, ... }]
  const [currentIndex, setCurrentIndex] = useState(-1);

  const currentItem = useMemo(
    () =>
      currentIndex >= 0 && currentIndex < history.length
        ? history[currentIndex]
        : null,
    [history, currentIndex]
  );
  // 문장별 영상 히스토리
  const [history, setHistory] = useState([]); // [{ id, videoUrl, ... }]
  const [currentIndex, setCurrentIndex] = useState(-1);

  const currentItem = useMemo(
    () =>
      currentIndex >= 0 && currentIndex < history.length
        ? history[currentIndex]
        : null,
    [history, currentIndex]
  );

  // localStorage 변경 감지용 ref
  const lastVideoKeyRef = useRef(null);

  // 서버에서 받은 마지막 결과 ts 기억 (중복 처리 방지)
  const lastResultTsRef = useRef(null);

  // "초기 스냅샷(ts만 읽기)"가 끝났는지 여부
  const initializedRef = useRef(false);

  
  // 다음 문장을 기다리는 중인지 여부
  const waitingForNextRef = useRef(false);

  // DeafReceive 처음 들어올 때 기존 영상은 "이미 본 것"으로 처리
  useEffect(() => {
    const existing = localStorage.getItem("signanceDeafVideoUrl");
    if (existing) {
      lastVideoKeyRef.current = existing;
      lastVideoKeyRef.current = existing;
    }
  }, []);

  // DeafReceive 들어올 때 상태 idle로 초기화
  useEffect(() => {
    localStorage.setItem("signanceDeafStatus", "idle");
  }, []);

  // 다른 탭/페이지에서 SESSION_KEY가 바뀌면 따라감
  // 다른 탭/페이지에서 SESSION_KEY가 바뀌면 따라감
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === SESSION_KEY) {
        setSessionId(e.newValue || null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /* ------------------- 초기 스냅샷: 이전 결과(ts만 기억, 화면에는 안 띄움) ------------------- */
  useEffect(() => {
    if (!sessionId) return;

    let stopped = false;

    const initLatestTs = async () => {
      try {
        const url = new URL(`${API_BASE}/api/accounts/sign_result/latest/`);
        url.searchParams.set("session_id", sessionId);

        const res = await fetch(url.toString());

        if (stopped) return;

        if (res.status === 204) {
          // 아직 결과가 한 번도 없었다면 그냥 패스
          initializedRef.current = true;
          return;
        }

        if (!res.ok) {
          console.error("init latest_sign_result 실패:", await res.text());
          initializedRef.current = true;
          return;
        }

        const data = await res.json();
        const ts = data.timestamp || data.ts || null;

        // 이전에 만들어져 있던 마지막 ts만 기억해두고 화면에는 안 보여줌
        if (ts) {
          lastResultTsRef.current = ts;
        }
        initializedRef.current = true;
      } catch (err) {
        console.error("init latest_sign_result error:", err);
        initializedRef.current = true;
      }
    };

    initLatestTs();

    return () => {
      stopped = true;
    };
  }, [sessionId]);

  /* ------------------- 초기 스냅샷: 이전 결과(ts만 기억, 화면에는 안 띄움) ------------------- */
  useEffect(() => {
    if (!sessionId) return;

    let stopped = false;

    const initLatestTs = async () => {
      try {
        const url = new URL(`${API_BASE}/api/accounts/sign_result/latest/`);
        url.searchParams.set("session_id", sessionId);

        const res = await fetch(url.toString());

        if (stopped) return;

        if (res.status === 204) {
          // 아직 결과가 한 번도 없었다면 그냥 패스
          initializedRef.current = true;
          return;
        }

        if (!res.ok) {
          console.error("init latest_sign_result 실패:", await res.text());
          initializedRef.current = true;
          return;
        }

        const data = await res.json();
        const ts = data.timestamp || data.ts || null;

        // 이전에 만들어져 있던 마지막 ts만 기억해두고 화면에는 안 보여줌
        if (ts) {
          lastResultTsRef.current = ts;
        }
        initializedRef.current = true;
      } catch (err) {
        console.error("init latest_sign_result error:", err);
        initializedRef.current = true;
      }
    };

    initLatestTs();

    return () => {
      stopped = true;
    };
  }, [sessionId]);

  /* ------------------- 영상 재생 완료 시 ------------------- */
/* ------------------- 영상 재생 완료 시 ------------------- */
const handleVideoEnded = () => {
  setCurrentIndex((idx) => {
    if (idx < 0) return idx; // 아직 아무 것도 없을 때

    const nextIdx = idx + 1;

    // 이미 history에 다음 문장이 있는 경우 → 바로 다음 문장 재생
    if (nextIdx < history.length) {
      // 다음 문장 재생 준비 상태
      waitingForNextRef.current = false;
      localStorage.setItem("signanceDeafStatus", "video_ready");
      return nextIdx; // VideoPanel에서 videoSrc 바뀌면서 자동 재생
    }

    // 다음 문장이 아직 안 온 경우 → "다음 발화 대기 중"
    waitingForNextRef.current = true;
    localStorage.setItem("signanceDeafStatus", "waiting_next");
    return idx;
  });
};


  /* ------------------- 서버 폴링 (영상 수신) ------------------- */
  /* ------------------- 서버 폴링 (영상 수신) ------------------- */
  useEffect(() => {
    if (!sessionId) return;

    let stopped = false;

    const fetchLatestResult = async () => {
      if (stopped) return;

      // 초기 스냅샷 읽기 전이라면 대기
      if (!initializedRef.current) return;

      try {
        const url = new URL(`${API_BASE}/api/accounts/sign_result/latest/`);
        url.searchParams.set("session_id", sessionId);

        const res = await fetch(url.toString());
        if (res.status === 204) {
          // 아직 결과 없음
          return;
        }
        if (!res.ok) {
          console.error("latest_sign_result 실패:", await res.text());
          return;
        }

        const data = await res.json();
        const ts = data.timestamp || data.ts || null;

        // 같은 결과(ts 기준)를 또 처리하지 않도록 방지
        if (!ts || ts === lastResultTsRef.current) return;
        lastResultTsRef.current = ts;

        // 1) 영상 리스트 구성 (문장 단위 + 개별 영상)
        const rawSentenceUrl =
          data.sentence_video_url ||
          data.video_url ||
          data.sign_video_url ||
          data.sign_video_path ||
          null;

        const baseList =
          data.sign_video_list ||
          data.video_urls ||
          data.video_paths ||
          (rawSentenceUrl ? [rawSentenceUrl] : []);

        const fullList = (baseList || [])
          .map((u) =>
            typeof u === "string" && u.startsWith("http")
              ? u
              : `${API_BASE}${u}`
          )
          .filter(Boolean);

        const primaryUrl =
          (rawSentenceUrl &&
            (rawSentenceUrl.startsWith("http")
              ? rawSentenceUrl
              : `${API_BASE}${rawSentenceUrl}`)) ||
          fullList[0] ||
          null;

        // 2) 자막/글로스/모드
        const captionClean = data.clean_text || "";
        const captionRaw = data.text || "";
        const glossLabels = Array.isArray(data.gloss_labels)
          ? data.gloss_labels
          : [];
        const mode = data.mode || "";
    if (!sessionId) return;

    let stopped = false;

    const fetchLatestResult = async () => {
      if (stopped) return;

      // 초기 스냅샷 읽기 전이라면 대기
      if (!initializedRef.current) return;

      try {
        const url = new URL(`${API_BASE}/api/accounts/sign_result/latest/`);
        url.searchParams.set("session_id", sessionId);

        const res = await fetch(url.toString());
        if (res.status === 204) {
          // 아직 결과 없음
          return;
        }
        if (!res.ok) {
          console.error("latest_sign_result 실패:", await res.text());
          return;
        }

        const data = await res.json();
        const ts = data.timestamp || data.ts || null;

        // 같은 결과(ts 기준)를 또 처리하지 않도록 방지
        if (!ts || ts === lastResultTsRef.current) return;
        lastResultTsRef.current = ts;

        // 1) 영상 리스트 구성 (문장 단위 + 개별 영상)
        const rawSentenceUrl =
          data.sentence_video_url ||
          data.video_url ||
          data.sign_video_url ||
          data.sign_video_path ||
          null;

        const baseList =
          data.sign_video_list ||
          data.video_urls ||
          data.video_paths ||
          (rawSentenceUrl ? [rawSentenceUrl] : []);

        const fullList = (baseList || [])
          .map((u) =>
            typeof u === "string" && u.startsWith("http")
              ? u
              : `${API_BASE}${u}`
          )
          .filter(Boolean);

        const primaryUrl =
          (rawSentenceUrl &&
            (rawSentenceUrl.startsWith("http")
              ? rawSentenceUrl
              : `${API_BASE}${rawSentenceUrl}`)) ||
          fullList[0] ||
          null;

        // 2) 자막/글로스/모드
        const captionClean = data.clean_text || "";
        const captionRaw = data.text || "";
        const glossLabels = Array.isArray(data.gloss_labels)
          ? data.gloss_labels
          : [];
        const mode = data.mode || "";

        const item = {
          id: Date.now(),
          videoUrl: primaryUrl,
          videoList:
            fullList.length > 0
              ? fullList
              : primaryUrl
              ? [primaryUrl]
              : [],
          caption: captionClean || captionRaw || "",
          rawText: captionRaw || "",
          glossLabels,
          mode,
          videoUrl: primaryUrl,
          videoList:
            fullList.length > 0
              ? fullList
              : primaryUrl
              ? [primaryUrl]
              : [],
          caption: captionClean || captionRaw || "",
          rawText: captionRaw || "",
          glossLabels,
          mode,
        };

        // 3) 히스토리에 문장 추가 + 현재 인덱스를 마지막으로 이동
        // 3) 히스토리에 문장 추가
      // 3) 히스토리에 문장 추가
      setHistory((prev) => {
        const next = [...prev, item];

        // 아직 아무 문장도 선택되지 않은 상태라면
        // 첫 문장을 현재 문장으로 선택 (자동 재생용)
        if (prev.length === 0 && currentIndex === -1) {
          // 첫 문장 인덱스(0)부터 재생
          setCurrentIndex(0);
        }
        // 이전 영상이 끝나고 "다음 문장을 기다리는 중"이었다면
        // 새로 들어온 문장을 바로 재생
        else if (waitingForNextRef.current) {
          const newIndex = next.length - 1; // 방금 들어온 문장
          waitingForNextRef.current = false;
          setCurrentIndex(newIndex); // VideoPanel에서 자동 재생
          // 상태도 영상 재생 쪽으로 이동
          localStorage.setItem("signanceDeafStatus", "video_ready");
        }

        return next;
      });



        // 이 영상을 "마지막으로 본 영상"으로 기억
        lastVideoKeyRef.current = primaryUrl || null;

        // 4) 필요하면 localStorage에도 백업
        try {
          if (rawSentenceUrl) {
            localStorage.setItem("signanceDeafVideoUrl", rawSentenceUrl);
          }
          localStorage.setItem(
            "signanceDeafVideoList",
            JSON.stringify(baseList || [])
          );
          localStorage.setItem(
            "signanceDeafCaptionClean",
            captionClean || ""
          );
          localStorage.setItem("signanceDeafCaptionRaw", captionRaw || "");
          localStorage.setItem(
            "signanceDeafGlossLabels",
            JSON.stringify(glossLabels)
          );
          localStorage.setItem("signanceDeafMode", mode);
        } catch (e) {
          console.warn("DeafReceive localStorage backup error:", e);
        }

        // 영상 준비 상태
        localStorage.setItem("signanceDeafStatus", "video_ready");
      } catch (err) {
        console.error("latest_sign_result fetch error:", err);
      }
    };

    // 최초 1번 + 주기적 폴링
    fetchLatestResult();
    const timer = setInterval(fetchLatestResult, 1000);

    return () => {
      stopped = true;
      stopped = true;
      clearInterval(timer);
    };
  }, [sessionId, currentIndex]);


  /* ------------------- 백엔드 채팅 폴링 (/api/accounts/chat/) ------------------- */
  useEffect(() => {
    let stopped = false;

    const fetchAllMessages = async () => {
      // 세션이 없으면 그냥 채팅 비우고 리턴
      // 세션이 없으면 그냥 채팅 비우고 리턴
      if (!sessionId) {
        setMessages([]);
        return;
      }

      try {
        const url = new URL(`${API_BASE}/api/accounts/chat/`);
        url.searchParams.set("session_id", sessionId);

        const res = await fetch(url.toString());
        if (!res.ok) {
          console.error("chat fetch 실패:", await res.text());
          return;
        }

        const data = await res.json(); // [{ id, session_id, sender, role, text, created_at }, ...]
        if (!Array.isArray(data) || stopped) return;

        // DeafReceive에서 '상태 초기화' 이후 메시지만 보기
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
          mode: m.role, // "질의"/"설명"/"응답" 등
          created_at: m.created_at,
        }));

        // DeafReceive는 항상 "백엔드 기준 스냅샷"으로 맞춤
        setMessages(mapped);
      } catch (err) {
        console.error("chat fetch error:", err);
      }
    };

    // 최초 1번 + 이후 2초마다 전체 동기화
    fetchAllMessages();
    const timer = setInterval(fetchAllMessages, 2000);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [sessionId, resetAfter, setMessages]);

  /* ------------------- 상태 초기화: 영상 + 채팅 ------------------- */
  const handleResetAll = () => {
    // 1) 영상 히스토리 초기화
    setHistory([]);
    setCurrentIndex(-1);
    // 1) 영상 히스토리 초기화
    setHistory([]);
    setCurrentIndex(-1);
    lastVideoKeyRef.current = null;
    lastResultTsRef.current = null;
    lastResultTsRef.current = null;

    // 2) 상담 대화창 비우기 (전역 store)
    setMessages([]);

    // 3) DeafReceive 기준으로는 '지금 이후 채팅만 보겠다'는 의미
    setResetAfter(Date.now());

    // 4) 상태/로컬 저장값 초기화
    localStorage.setItem("signanceDeafStatus", "idle");
    localStorage.removeItem("signanceDeafVideoUrl");
    localStorage.removeItem("signanceDeafVideoList");
    localStorage.removeItem("signanceDeafCaptionClean");
    localStorage.removeItem("signanceDeafGlossLabels");
    localStorage.removeItem("signanceDeafCaptionRaw");
  };

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < history.length - 1;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < history.length - 1;

  return (
    <div className="w-full h-auto overflow-hidden">
      <main className="w-full px-4 sm:px-6 lg:px-10 pt-4 pb-8 bg-slate-50 min-h-[calc(100vh-56px)]">
        {/* <NavTabs rightSlot={<SendReceiveToggle active="receive" />} /> */}
        <div className="flex items-center justify-end">
          <SendReceiveToggle active="receive" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 items-stretch">
          <VideoPanel
            item={currentItem}
            onEnded={handleVideoEnded}
            onPrev={() => {
              setCurrentIndex((idx) => (idx > 0 ? idx - 1 : idx));
            }}
            onNext={() => {
              setCurrentIndex((idx) =>
                idx < history.length - 1 ? idx + 1 : idx
              );
            }}
            hasPrev={hasPrev}
            hasNext={hasNext}
          />
          <VideoPanel
            item={currentItem}
            onEnded={handleVideoEnded}
            onPrev={() => {
              setCurrentIndex((idx) => (idx > 0 ? idx - 1 : idx));
            }}
            onNext={() => {
              setCurrentIndex((idx) =>
                idx < history.length - 1 ? idx + 1 : idx
              );
            }}
            hasPrev={hasPrev}
            hasNext={hasNext}
          />

          {/* 상담 대화창: DeafReceive 전용 ChatPanel */}
          <ChatPanel />
        </div>

        <div className="mt-4">
          <ASRPanel onResetAll={handleResetAll} />
        </div>
      </main>
    </div>
  );
}

/* ---------------- 공통 타이틀 ---------------- */
function PanelHeader({ icon, title }) {
  return (
    <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-800">
      <span className="inline-grid place-items-center">{icon}</span>
      <span className="leading-none">{title}</span>
    </div>
  );
}

/* ---------------- 수어 영상 패널 ---------------- */

function VideoPanel({ item, onEnded, onPrev, onNext, hasPrev, hasNext }) {

function VideoPanel({ item, onEnded, onPrev, onNext, hasPrev, hasNext }) {
  const vidRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const videoSrc = item ? item.videoUrl : null;
  const captionText = item?.caption || "";
  const glossLabels = Array.isArray(item?.glossLabels)
    ? item.glossLabels
    : [];

  const modeLabel =
    item?.mode === "질문" || item?.mode === "질의"
      ? "질문"
      : item?.mode === "응답" || item?.mode === "설명"
      ? "응답"
      : null;

  const captionSizeClass = useMemo(() => {
    const len = captionText.length;
    if (len <= 25) return "text-xl sm:text-2xl";
    if (len <= 60) return "text-lg sm:text-xl";
    return "text-base sm:text-lg";
  }, [captionText]);

  // 공통: videoSrc를 확실히 다시 물려주고 재생
  const playFromStart = async () => {
  // 공통: videoSrc를 확실히 다시 물려주고 재생
  const playFromStart = async () => {
    const v = vidRef.current;
    if (!v || !videoSrc) return;

    setErrMsg("");
    try {
      // 혹시 남아있던 소스/상태 초기화
      v.pause();
      v.removeAttribute("src");
      v.load();
    } catch (e) {
      // 무시
    }

    v.src = videoSrc;

    try {
      v.load();
    } catch (e) {
      // 무시
    }

    try {
      v.currentTime = 0;
    } catch (e) {
      // 무시
    }

    setErrMsg("");
    try {
      // 혹시 남아있던 소스/상태 초기화
      v.pause();
      v.removeAttribute("src");
      v.load();
    } catch (e) {
      // 무시
    }

    v.src = videoSrc;

    try {
      v.load();
    } catch (e) {
      // 무시
    }

    try {
      v.currentTime = 0;
    } catch (e) {
      // 무시
    }

    try {
      await v.play();
      setIsPlaying(true);
      setShowOverlay(true);
      localStorage.setItem("signanceDeafStatus", "video_playing");
      return;
    } catch (e1) {
      // 한 번 실패하면 muted로 재시도
    }

    } catch (e1) {
      // 한 번 실패하면 muted로 재시도
    }

    try {
      v.muted = true;
      await v.play();
      setIsPlaying(true);
      setShowOverlay(true);
      localStorage.setItem("signanceDeafStatus", "video_playing");
    } catch (e2) {
      console.warn("video play failed in playFromStart:", e2);
    } catch (e2) {
      console.warn("video play failed in playFromStart:", e2);
      setErrMsg("영상 재생을 시작할 수 없습니다.");
    }
  };

  // 새 문장 들어올 때 자동 재생
  // 새 문장 들어올 때 자동 재생
  useEffect(() => {
    if (!videoSrc) {
      setIsPlaying(false);
      setShowOverlay(false);
      setErrMsg("");
      return;
    }
    if (!videoSrc) {
      setIsPlaying(false);
      setShowOverlay(false);
      setErrMsg("");
      return;
    }

    setIsPlaying(false);
    setShowOverlay(false);
    setErrMsg("");

    localStorage.setItem("signanceDeafStatus", "video_ready");

    const timer = setTimeout(() => {
      playFromStart();
      playFromStart();
    }, 50);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSrc]);

  const handlePause = () => {
    setIsPlaying(false);
    setShowOverlay(false);
  };

  const handleReplay = () => {
    // 그냥 현재 문장 처음부터 다시
    playFromStart();
  };

  const handleReplay = () => {
    // 그냥 현재 문장 처음부터 다시
    playFromStart();
  };

  return (
    <section
      className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col ${PANEL_HEIGHT}`}
    >
      <PanelHeader icon={<PlayBadge />} title="수어 영상 송출" />

      <div className="mt-3 flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-200 bg-slate-900 relative">
        {!videoSrc ? (
          <div className="w-full h-full grid place-items-center text-slate-100 text-lg sm:text-xl">
            수어 영상이 아직 도착하지 않았어요.
          </div>
        ) : (
          <video
            ref={vidRef}
            src={videoSrc}
            className="w-full h-full object-cover"
            preload="metadata"
            muted
            playsInline
            onPlay={() => {
              setIsPlaying(true);
              setShowOverlay(true);
            }}
            onPause={handlePause}
            onEnded={() => {
              handlePause();
              onEnded?.();
            }}
          />
        )}

        {modeLabel && (
          <div className="absolute top-3 right-3 px-4 py-2 rounded-xl bg-rose-600/95 text-white text-lg sm:text-xl font-extrabold tracking-wider shadow-2xl">
            {modeLabel}
          </div>
        )}

        {glossLabels.length > 0 && (
          <div className="absolute top-3 left-3 bg-black/70 text-white text-xs px-3 py-1 rounded-md">
            {glossLabels.join(" · ")}
          </div>
        )}

        {showOverlay && captionText && (
          <div
            className={`absolute bottom-6 left-1/2 -translate-x-1/2 
            w-[95%] px-5 py-3 bg-black/70 text-white rounded-lg
            ${captionSizeClass} text-center`}
          >
            {captionText}
          </div>
        )}

        {errMsg && (
          <div className="absolute bottom-4 left-4 right-4 text-sm text-white bg-red-600/90 px-3 py-2 rounded-md">
            {errMsg}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        {/* 맨 왼쪽: 이전 문장 (◀◀) */}
        <RoundBtn
          label="이전 문장"
          onClick={() => {
            if (!hasPrev) return;
            onPrev?.();
          }}
          disabled={!hasPrev}
        >
        {/* 맨 왼쪽: 이전 문장 (◀◀) */}
        <RoundBtn
          label="이전 문장"
          onClick={() => {
            if (!hasPrev) return;
            onPrev?.();
          }}
          disabled={!hasPrev}
        >
          <PrevIcon />
        </RoundBtn>

        {/* 가운데: 현재 문장 재생 / 일시정지 */}
        {/* 가운데: 현재 문장 재생 / 일시정지 */}
        <RoundBtn
          label={isPlaying ? "일시정지" : "재생"}
          onClick={() => {
            const v = vidRef.current;
            if (!videoSrc || !v) return;
            if (isPlaying) v.pause();
            else playFromStart();
            const v = vidRef.current;
            if (!videoSrc || !v) return;
            if (isPlaying) v.pause();
            else playFromStart();
          }}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </RoundBtn>

        {/* 오른쪽: 현재 문장 처음부터 다시 재생 */}
        <RoundBtn label="다시재생" onClick={handleReplay}>
          <ReplayIcon />
        </RoundBtn>

        {/* 맨 오른쪽: 다음 문장 (▶▶) */}
        <RoundBtn
          label="다음 문장"
          onClick={() => {
            if (!hasNext) return;
            onNext?.();
          }}
          disabled={!hasNext}
        {/* 오른쪽: 현재 문장 처음부터 다시 재생 */}
        <RoundBtn label="다시재생" onClick={handleReplay}>
          <ReplayIcon />
        </RoundBtn>

        {/* 맨 오른쪽: 다음 문장 (▶▶) */}
        <RoundBtn
          label="다음 문장"
          onClick={() => {
            if (!hasNext) return;
            onNext?.();
          }}
          disabled={!hasNext}
        >
          <NextIcon />
          <NextIcon />
        </RoundBtn>
      </div>
    </section>
  );
}



/* ---------------- 말풍선 ---------------- */
function ChatBubble({ role, text, mode }) {
  // system 메시지: 가운데 정렬 안내문
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

  // 일반 메시지
  // 일반 메시지
  const isAgent = role === "agent"; // 은행원 = 왼쪽, 고객 = 오른쪽

  const label =
    mode === "질의" || mode === "질문"
      ? "질문"
      : mode === "설명" || mode === "응답"
      ? "응답"
      : null;

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
        {label && (
          <div className="mb-1">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600">
              {label}
            </span>
          </div>
        )}

        <p className="text-base leading-relaxed text-slate-900">{text}</p>
      </div>

      {!isAgent && <AvatarUser />}
    </div>
  );
}

/* ---------------- 상담 대화창 ---------------- */
function ChatPanel() {
  const { messages, setMessages } = useChatStore();
  const [input, setInput] = useState("");
  const listRef = useRef(null);

  // from/role 둘 중 하나가 들어와도 처리
  const mappedMessages = useMemo(
    () =>
      (messages || []).map((m) => ({
        role: m.from || m.role || "agent",
        text: m.text,
        mode: m.mode || "",
      })),
    [messages]
  );

  // 스크롤 항상 맨 아래로
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [mappedMessages]);

  const send = () => {
    const text = input.trim();
    if (!text) return;

    // Deaf 쪽에서 보낸 메시지도 일단 전역 스토어에 추가
    setMessages((prev = []) => [
      ...prev,
      {
        id: Date.now(),
        from: "user",
        role: "user",
        text,
      },
    ]);
    setInput("");
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
        {mappedMessages.map((m, idx) => (
          <ChatBubble
            key={`${m.id ?? m.backendId ?? "local"}-${idx}`}
            role={m.role}
            text={m.text}
            mode={m.mode}
          />
        ))}
      </div>

      {/* DeafSend와 동일한 입력창 + 보내기 버튼 */}
      {/* DeafSend와 동일한 입력창 + 보내기 버튼 */}
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

/* ---------------- 타이핑 버블 + 아바타 ---------------- */
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

function Dot() {
  return (
    <span className="inline-block w-2 h-2 rounded-full bg-slate-500 animate-pulse" />
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
        className="text-slate-600"
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
        className="text-slate-700"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M3 21a9 9 0 0 1 18 0" />
      </svg>
    </div>
  );
}

/* ---------------- 인식 상태 패널 & 아이콘 ---------------- */
function ASRPanel({ onResetAll }) {
  const [status, setStatus] = useState("idle");
  const [mode, setMode] = useState("응답");
  const [text, setText] = useState("");

  useEffect(() => {
    const read = () => {
      const cur = localStorage.getItem("signanceDeafStatus") || "idle";
      setStatus(cur);
    };
    read();

    const onStorage = (e) => {
      if (e.key === "signanceDeafStatus") setStatus(e.newValue || "idle");
    };
    window.addEventListener("storage", onStorage);

    const timer = setInterval(read, 800);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(timer);
    };
  }, []);

  const { label, desc, step } = (() => {
    switch (status) {
      case "stt_running":
        return { label: "음성 인식 중…", desc: "은행원 발화 인식 중", step: 0 };
      case "stt_done":
        return { label: "발화 인식 완료", desc: "텍스트 변환 완료", step: 1 };
      case "waiting_next":
        return {
          label: "다음 발화 대기 중…",
          desc: "은행원이 다음 문장을 발화하면 영상이 자동으로 재생돼요",
          step: 1,
        };
      case "video_ready":
        return { label: "영상 준비 완료", desc: "영상 재생 가능", step: 2 };
      case "video_playing":
        return {
          label: "영상 재생 중",
          desc: "영상을 재생하고 있어요",
          step: 3,
        };
      default:
        return {
          label: "은행원 발화 전",
          desc: "발화를 기다리는 중",
          step: 0,
        };
    }
  })();


  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-4">
        <div className="shrink-0 w-20 h-20 rounded-full border-2 border-slate-300 grid place-items-center">
          <MicIconStroke className="w-9 h-9 text-slate-700" />
        </div>

        <div className="flex-1">
          <div className="font-semibold text-base text-slate-800">
            {label}
          </div>

          <div className="mt-3">
            <StageDots2 active={step} />
          </div>

          <div className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 flex items-center">
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => setMode("질문")}
                className={
                  "px-3 h-8 rounded-lg text-sm border " +
                  (mode === "질문"
                    ? "bg-slate-900 text-white"
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
                    ? "bg-slate-900 text-white"
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
              placeholder={desc}
              className="flex-1 ml-4 text-base text-slate-800 border-none bg-transparent"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              onResetAll?.();
              setStatus("idle");
            }}
            className="h-11 w-[97px] rounded-xl bg-slate-900 text-white"
          >
            상태 초기화
          </button>
          <button className="h-11 w-[97px] rounded-xl border border-slate-300">
            번역 오류
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 아이콘 & 버튼 ---------------- */
function PlayBadge() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
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

function RoundBtn({ children, label, onClick, disabled }) {
function RoundBtn({ children, label, onClick, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={
        "h-10 w-10 grid place-items-center rounded-full border border-slate-300 " +
        (disabled ? "opacity-40 cursor-default" : "")
      }
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={
        "h-10 w-10 grid place-items-center rounded-full border border-slate-300 " +
        (disabled ? "opacity-40 cursor-default" : "")
      }
      title={label}
    >
      {children}
    </button>
  );
}

function PrevIcon() {
  return (
    <span className="text-xs leading-none select-none">◀◀</span>
  );
}

function NextIcon() {
  return (
    <span className="text-xs leading-none select-none">▶▶</span>
    <span className="text-xs leading-none select-none">◀◀</span>
  );
}

function NextIcon() {
  return (
    <span className="text-xs leading-none select-none">▶▶</span>
  );
}
function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="8,5 19,12 8,19" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" />
      <rect x="14" y="5" width="4" height="14" />
    </svg>
  );
}
function ReplayIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 11a7 7 0 1 1 2 5.3" />
      <polyline points="4 7 4 11 8 11" />
    </svg>
  );
}

function StageDots2({ active = 0 }) {
  const labels = ["음성 인식", "발화 완료", "영상 준비", "영상 재생"];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-6">
        {labels.map((_, idx) => (
          <div
            key={idx}
            className={
              "h-2 w-12 rounded-full transition-all " +
              (idx <= active ? "bg-slate-900" : "bg-slate-300")
            }
          />
        ))}
      </div>

      <div className="flex gap-6 text-xs text-slate-500">
        {labels.map((label, idx) => (
          <span key={idx} className={idx === active ? "font-semibold" : ""}>
            {label}
          </span>
        ))}
      </div>
    </div>
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

function SendReceiveToggle({ active }) {
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
            ? "bg-slate-900 text-white"
            : "bg-white text-slate-700 hover:bg-slate-100"
        }`}
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
            ? "bg-slate-900 text-white"
            : "bg-white text-slate-700 hover:bg-slate-100"
        }`}
      >
        수신
      </button>
    </div>
  );
}

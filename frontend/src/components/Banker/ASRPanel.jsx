// frontend_clean/src/components/Banker/ASRPanel.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const ASR_PANEL_HEIGHT = "h-[167px]";
const SESSION_KEY = "signanceSessionId";
const MIC_RUN_KEY = "signanceMicRunNo";

// 번역 오류 규칙 서버로 전송
async function sendNormalizationRules(ruleList) {
  if (!Array.isArray(ruleList) || ruleList.length === 0) return;

  for (const r of ruleList) {
    const wrong = (r.wrong || "").trim();
    const correct = (r.correct || "").trim();
    if (!wrong || !correct) continue;

    try {
      const resp = await fetch(`${API_BASE}/api/accounts/add_rule/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ wrong, correct }),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        console.warn(
          "[ASRPanel] add_rule 실패:",
          resp.status,
          txt
        );
      } else {
        console.log(
          "[ASRPanel] add_rule 성공:",
          wrong,
          "→",
          correct
        );
      }
    } catch (err) {
      console.error("[ASRPanel] add_rule 통신 에러:", err);
    }
  }
}


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

// 마이크 라운드 번호 저장용
function getMicRunNo() {
  try {
    const v = Number(localStorage.getItem(MIC_RUN_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

function nextMicRunNo() {
  const current = getMicRunNo();
  const next = current + 1;
  try {
    localStorage.setItem(MIC_RUN_KEY, String(next));
  } catch {}
  return next;
}

export default function ASRPanel({ onPushToChat }) {
  const [stage, setStage] = useState(0);

  const [sessionActive, setSessionActive] = useState(false);
  const sessionActiveRef = useRef(false);
  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  // 문장 순서를 고정하기 위한 시퀀스 번호 (0,1,2,...)
  const sentenceSeqRef = useRef(0);

  // 마이크 라운드(1,2,3,...) + 라운드 내 문장 인덱스(0,1,2,...) 추적
  const roundRef = useRef(0);
  const sentenceInRoundRef = useRef(0);

  // 마이크 라운드 번호 & 첫 문장 여부 (PerformanceDashboard 번호용)
  const micRunRef = useRef(getMicRunNo());
  const isFirstUtterRef = useRef(true);

  const [isRec, setIsRec] = useState(false);
  const [mode, setMode] = useState("설명"); // "질의" / "설명"

  const [text, setText] = useState("");
  const [segments, setSegments] = useState([]); // {id, text, createdAt}
  const [currentIdx, setCurrentIdx] = useState(0);

  const [recErr, setRecErr] = useState("");
  const [sec, setSec] = useState(0);

  const [isSending, setIsSending] = useState(false);
  const [apiErr, setApiErr] = useState("");

  const [recStatus, setRecStatus] = useState("idle");

  // 마지막 문장 처리 중인지 여부 (세션 종료 후 STT/NLP 대기 상태)
  const [isFinalizing, setIsFinalizing] = useState(false);

  // 각 문장별 latency 리스트 (발화 순서대로 index 고정)
  const [latencyList, setLatencyList] = useState([]); // [{stt, nlp, mapping, synth, total, audioSec, videoSec, round, idxInRound, mic_run}, …]

  // 각 문장별 오디오 리스트 (발화 순서대로 index 고정)
  const [audioList, setAudioList] = useState([]); // [{url, blob}, …]
  const audioUrlsRef = useRef([]);

  const navigate = useNavigate();

  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [spans, setSpans] = useState([{ wrong: "", correct: "" }]);

  const mediaRecRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  const shouldRestartRef = useRef(false); // Enter로 문장 끊기
  const finalStopRef = useRef(false); // 마이크 버튼으로 완전 종료


  // 진행 바 (1.6초마다 한 칸 → 한 사이클 6.4초, BankerReceive와 동일)
  useEffect(() => {
    const active =
      sessionActive || isRec || isSending || recStatus !== "done";
    if (!active) {
      setStage(0);
      return;
    }
    const id = setInterval(() => {
      setStage((s) => (s + 1) % 4);
    }, 1600);
    return () => clearInterval(id);
  }, [sessionActive, isRec, isSending, recStatus]);

  // 타이머: 그냥 시간 표시용 (자동 stop 없음)
  useEffect(() => {
    if (isRec) {
      setSec(0);
      timerRef.current = setInterval(() => {
        setSec((s) => s + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [isRec]);

  // 언마운트 cleanup
  useEffect(() => {
    return () => {
      try {
        const mr = mediaRecRef.current;
        if (mr && mr.state === "recording") {
          try {
            mr.requestData();
          } catch {}
          mr.stop();
        }
      } catch {}
      try {
        streamRef.current?.getTracks?.().forEach((t) => t.stop());
      } catch {}
      // 생성했던 모든 audio URL revoke
      audioUrlsRef.current.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      });
    };
  }, []);

  // Enter로 문장 끊기 (딜레이 최소화: requestData + 즉시 stop)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== "Enter") return;

      const ae = document.activeElement;
      if (
        ae &&
        (ae.tagName === "INPUT" ||
          ae.tagName === "TEXTAREA" ||
          ae.isContentEditable)
      ) {
        return;
      }

      if (!sessionActiveRef.current || !isRec) return;

      e.preventDefault();
      shouldRestartRef.current = true;
      finalStopRef.current = false;

      try {
        const mr = mediaRecRef.current;
        if (mr && mr.state === "recording") {
          try {
            mr.requestData(); // 마지막 chunk까지 강제로 뱉기
          } catch {}
          mr.stop(); // 별도 딜레이 없이 즉시 stop
        }
      } catch {}
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRec]);

  // blob 업로드 (isFinal: 마지막 문장인지 여부, seq: 발화 순서 인덱스, round/idxInRound: 라운드/번호)
  const uploadBlob = async (
    blob,
    isFinal = false,
    seq = null,
    round = 1,
    idxInRound = 0
  ) => {
    if (!blob) {
      setApiErr("먼저 음성을 녹음해 주세요.");
      return;
    }
    const requestTs = new Date().toISOString();

    if (isFinal) {
      setIsFinalizing(true); // 마지막 문장 처리 시작
    }

    setIsSending(true);
    setApiErr("");
    setRecStatus("idle");

    try {
      const fd = new FormData();
      fd.append("audio", blob, "speech.webm");

      const sessionId = getOrCreateSessionId();
      fd.append("mode", mode);
      fd.append("session_id", sessionId);
      fd.append("ts", requestTs);

      const startedAt = Date.now();

      const resp = await fetch(`${API_BASE}/api/accounts/speech_to_sign/`, {
        method: "POST",
        body: fd,
      });

      if (!resp.ok) {
        const txt = await resp.text();
        console.error("speech_to_sign error:", resp.status, txt);
        setApiErr("음성 처리 중 서버 오류가 발생했어요.");
        localStorage.setItem("signanceDeafStatus", "idle");
        return;
      }

      const data = await resp.json();
      const finishedAt = Date.now();

      console.log(
        "[speech_to_sign] OK, frontend total latency:",
        finishedAt - startedAt,
        "ms"
      );
      console.log("speech_to_sign result:", data);

      if (Array.isArray(data.gloss_labels)) {
        try {
          localStorage.setItem(
            "signanceDeafGlossLabels",
            JSON.stringify(data.gloss_labels)
          );
        } catch (e) {
          console.warn("failed to save gloss_labels:", e);
        }
      }

      const rawText = data.text || "";
      const cleanedText = data.clean_text || rawText || "";

      // 세그먼트 텍스트 누적 (seq 인덱스에 고정)
      if (cleanedText) {
        setSegments((prev) => {
          const next = [...prev];
          const idx = typeof seq === "number" ? seq : next.length;

          const item = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            text: cleanedText,
            createdAt: new Date().toISOString(),
          };

          next[idx] = item;
          setCurrentIdx(idx);
          setText(item.text);
          return next;
        });
      } else if (rawText) {
        setText(rawText);
      }

      setRecStatus("done");
      localStorage.setItem("signanceDeafStatus", "stt_done");

      try {
        localStorage.setItem("signanceDeafCaptionClean", cleanedText);
      } catch (e) {
        console.warn("failed to save signanceDeafCaptionClean:", e);
      }

      try {
        localStorage.setItem("signanceDeafMode", mode); // "질의" / "설명"
      } catch (e) {
        console.warn("failed to save signanceDeafMode:", e);
      }

      if (rawText) {
        try {
          localStorage.setItem("signanceDeafCaptionRaw", rawText);
        } catch (e) {
          console.warn("failed to save signanceDeafCaptionRaw:", e);
        }
      }

      // 세그먼트마다 상담창으로 바로 push
      const sentenceForChat = cleanedText || rawText;
      if (sentenceForChat && typeof onPushToChat === "function") {
        try {
          onPushToChat({
            text: sentenceForChat,
            mode,
            ts: data.timestamp || requestTs,
          });
        } catch (e) {
          console.warn("[ASRPanel] onPushToChat error:", e);
        }
      }

      // latency 로그 (ms + sec 모두 대응)
      if (data.latency_ms || data.latency_sec) {
        const latMs = data.latency_ms || {};
        const latSec = data.latency_sec || {};

        // 1) ms 단위 우선, 없으면 sec * 1000
        const sttMs =
          typeof latMs.stt === "number"
            ? latMs.stt
            : typeof latSec.stt_sec === "number"
            ? latSec.stt_sec * 1000
            : null;

        const nlpMs =
          typeof latMs.nlp === "number"
            ? latMs.nlp
            : typeof latSec.nlp_sec === "number"
            ? latSec.nlp_sec * 1000
            : null;

        const mappingMs =
          typeof latMs.mapping === "number"
            ? latMs.mapping
            : typeof latSec.mapping_sec === "number"
            ? latSec.mapping_sec * 1000
            : null;

        const synthMs =
          typeof latMs.synth === "number"
            ? latMs.synth
            : typeof latSec.synth_sec === "number"
            ? latSec.synth_sec * 1000
            : null;

        // 2) total 계산
        let totalMs = null;
        if (typeof latMs.total === "number") {
          totalMs = latMs.total;
        } else if (typeof latSec.total_sec === "number") {
          totalMs = latSec.total_sec * 1000;
        } else {
          const parts = [sttMs, nlpMs, mappingMs, synthMs].filter(
            (v) => typeof v === "number"
          );
          if (parts.length > 0) {
            totalMs = parts.reduce((a, b) => a + b, 0);
          }
        }

        const audioSec =
          typeof data.audio_sec === "number" ? data.audio_sec : null;
        const videoSec =
          typeof data.video_sec === "number" ? data.video_sec : null;
        const mic_run = micRunRef.current || round;

        // 화면에 문장별 latency 표시용 (seq 인덱스에 고정)
        const logEntryForState = {
          stt: sttMs,
          nlp: nlpMs,
          mapping: mappingMs,
          synth: synthMs,
          total: totalMs,
          audioSec,
          videoSec,
          round,
          idxInRound,
          mic_run,
        };

        setLatencyList((prev) => {
          const next = [...prev];
          const idx = typeof seq === "number" ? seq : next.length;
          next[idx] = logEntryForState;
          return next;
        });

        // localStorage에도 저장 (PerformanceDashboard용)
        try {
          const prevRaw =
            localStorage.getItem("signanceLatencyLogs") || "[]";
          let prev = [];
          try {
            const parsed = JSON.parse(prevRaw);
            if (Array.isArray(parsed)) prev = parsed;
          } catch (e) {
            console.warn(
              "[latency log] 기존 로그 JSON 파싱 실패, 새로 초기화:",
              e
            );
          }

          const logEntry = {
            ts: data.timestamp || requestTs,
            sentence: cleanedText,
            stt: sttMs,
            nlp: nlpMs,
            mapping: mappingMs,
            synth: synthMs,
            total: totalMs,
            latency_sec: latSec,
            text: rawText,
            clean_text: cleanedText,
            gloss: data.gloss || [],
            gloss_labels: data.gloss_labels || [],
            gloss_ids: data.gloss_ids || [],
            session_id: data.session_id || sessionId,
            mode: data.mode || mode,
            audio_sec: audioSec,
            video_sec: videoSec,
            // PerformanceDashboard용 ms 단위
            utter_ms:
              typeof audioSec === "number" ? audioSec * 1000 : null,
            video_ms:
              typeof videoSec === "number" ? videoSec * 1000 : null,
            round,
            idxInRound,
            mic_run,
            // 이 마이크 라운드의 첫 문장인지 표시 (자동 구분선/세션 번호용)
            _dividerBefore: isFirstUtterRef.current === true,
          };

          // 첫 로그 이후에는 divider 플래그 끔
          isFirstUtterRef.current = false;

          prev.push(logEntry);
          prev.sort((a, b) => {
            const ta = new Date(a.ts).getTime() || 0;
            const tb = new Date(b.ts).getTime() || 0;
            return tb - ta;
          });

          localStorage.setItem(
            "signanceLatencyLogs",
            JSON.stringify(prev)
          );
        } catch (e) {
          console.error("[latency log] save error:", e);
        }
      }

      // 영상 URL 저장 (문장 단위 + 전체 리스트)
      const rawVideoSingle =
        data.sentence_video_url ||
        data.video_url ||
        data.sign_video_url ||
        data.sign_video_path ||
        data.output_video_url ||
        null;

      const rawVideoFromList =
        (Array.isArray(data.sign_video_list) &&
          data.sign_video_list[0]) ||
        (Array.isArray(data.video_urls) && data.video_urls[0]) ||
        (Array.isArray(data.video_paths) && data.video_paths[0]) ||
        null;

      const sentenceVideoUrl = rawVideoSingle || rawVideoFromList || "";

      if (sentenceVideoUrl) {
        console.log("[ASRPanel] using video url:", sentenceVideoUrl);
        localStorage.setItem("signanceDeafVideoUrl", sentenceVideoUrl);
      }

      const videoList =
        data.sign_video_list ||
        data.video_urls ||
        data.video_paths ||
        (sentenceVideoUrl ? [sentenceVideoUrl] : []);

      if (Array.isArray(videoList) && videoList.length > 0) {
        try {
          // DeafReceive에서 읽는 키 이름에 맞추기
          localStorage.setItem(
            "signanceDeafVideoList",
            JSON.stringify(videoList)
          );
          // 혹시 예전 키 남아있으면 정리 (선택)
          localStorage.removeItem("signanceDeafVideoUrls");
        } catch (e) {
          console.warn("failed to save signanceDeafVideoList:", e);
        }
      }
    } catch (e) {
      console.error(e);
      setApiErr("서버와 통신 중 오류가 발생했어요.");
      setRecStatus("idle");
      localStorage.setItem("signanceDeafStatus", "idle");
    } finally {
      setIsSending(false);
      if (isFinal) {
        setIsFinalizing(false); // 마지막 문장 처리 종료
      }
    }
  };

  const startSegment = async () => {
    setRecErr("");
    setApiErr("");
    setRecStatus("idle");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mr = new MediaRecorder(stream);
      mediaRecRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const isFinalStop = finalStopRef.current;
        finalStopRef.current = false;

        // 이 세그먼트의 발화 순서 인덱스 확정 (전체 인덱스)
        const seq = sentenceSeqRef.current++;

        // 현재 마이크 라운드 번호 + 라운드 내 문장 인덱스
        const round = roundRef.current || 1;
        const idxInRound = sentenceInRoundRef.current++;

        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          console.log("[MediaRecorder] blob size:", blob.size, "bytes");

          if (!blob || blob.size < 2000) {
            console.log(
              "[MediaRecorder] blob too small, skip upload (size:",
              blob.size,
              ")"
            );
          } else {
            const url = URL.createObjectURL(blob);
            audioUrlsRef.current.push(url);

            // 오디오도 seq 인덱스에 고정
            setAudioList((prev) => {
              const next = [...prev];
              next[seq] = { url, blob };
              return next;
            });

            // 서버 업로드도 seq + round 정보 함께
            uploadBlob(blob, isFinalStop, seq, round, idxInRound);
          }
        } catch {
          setRecErr("오디오 데이터를 생성하지 못했어요.");
          localStorage.setItem("signanceDeafStatus", "idle");
        }

        try {
          streamRef.current?.getTracks?.().forEach((t) => t.stop());
        } catch {}
        streamRef.current = null;

        if (!sessionActiveRef.current || isFinalStop) {
          setIsRec(false);
          setSec(0);
          localStorage.setItem("signanceDeafStatus", "idle");
        } else if (shouldRestartRef.current) {
          shouldRestartRef.current = false;
          setIsRec(false);
          setSec(0);
          startSegment();
        } else {
          setIsRec(false);
        }
      };

      // 0.25초 단위로 chunk 쪼개기 (Enter 이후 딜레이 줄이기)
      mr.start(250);

      setIsRec(true);
      localStorage.setItem("signanceDeafStatus", "stt_running");
    } catch {
      setRecErr("마이크 권한을 확인해 주세요. (https / localhost 권장)");
      setIsRec(false);
      setSessionActive(false);
      localStorage.setItem("signanceDeafStatus", "idle");
    }
  };

  const startSession = async () => {
    if (sessionActive) return;

    // 새 라운드 시작할 때 화면 상태 초기화
    setSegments([]);
    setCurrentIdx(0);
    setText("");
    setAudioList([]);
    setLatencyList([]);
    sentenceSeqRef.current = 0;

    // 새 마이크 라운드 시작 (1,2,3,...)
    const newRound = nextMicRunNo();
    roundRef.current = newRound;
    micRunRef.current = newRound;
    sentenceInRoundRef.current = 0;
    isFirstUtterRef.current = true;

    setSessionActive(true);
    localStorage.setItem("signanceDeafStatus", "stt_running");
    await startSegment();
  };

  const stopSession = () => {
    if (!sessionActive) return;
    finalStopRef.current = true; // 이 세그먼트가 마지막이다
    setIsFinalizing(true); // 마지막 문장 처리 모드 ON
    setSessionActive(false);
    try {
      const mr = mediaRecRef.current;
      if (mr && mr.state === "recording") {
        try {
          mr.requestData(); // 마지막 chunk 강제 flush
        } catch {}
        mr.stop();
      }
    } catch {}
  };

  const toggleRec = () => {
    if (sessionActive) stopSession();
    else startSession();
  };

  // 번역 오류 신고 팝업
  const handleReportError = () => {
    const rawText = localStorage.getItem("signanceDeafCaptionRaw") || "";
    const cleanText = text || "";

    if (!rawText && !cleanText && segments.length === 0) {
      setApiErr("먼저 음성을 인식한 뒤 오류를 신고해 주세요.");
      return;
    }

    setSpans([{ wrong: "", correct: "" }]);
    setShowErrorPopup(true);
  };

  const addSpanRow = () => {
    setSpans((prev) => [...prev, { wrong: "", correct: "" }]);
  };

  const updateSpan = (idx, key, value) => {
    setSpans((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [key]: value } : s))
    );
  };

  const handleConfirmError = async () => {
    const rawText = localStorage.getItem("signanceDeafCaptionRaw") || "";
    const cleanText = text || "";

    // 입력된 오류 구간 정리
    const filtered = spans
      .map((s) => ({
        wrong: s.wrong?.trim() || "",
        correct: s.correct?.trim() || "",
      }))
      .filter((s) => s.wrong || s.correct);

    if (filtered.length === 0) {
      alert("오류 구간을 최소 1개 이상 입력해 주세요.");
      return;
    }

    // 1) 규칙 서버로도 전송 (rules.json 반영)
    await sendNormalizationRules(filtered);

    // 2) 문장 리스트 (cleaned 기준)
    const segmentTexts =
      segments.length > 0
        ? segments.map((s) => s.text || "")
        : [cleanText || rawText];

    const baseTime = new Date().toISOString();

    // 🔹 이번 신고 1건에 대해 로그 1개만 만들고,
    //    그 안에 spans 배열로 여러 wrong/correct 쌍을 넣는다.
    const newEntry = {
      sttText: segmentTexts.join("\n"),        // STT/clean 문장
      cleanText: cleanText || rawText || "",
      spans: filtered,                         // ← 여러 개 쌍 그대로
      createdAt: baseTime,
    };

    // 3) 용어 사전(치환 규칙) 누적 (기존 그대로)
    try {
      const prevDict =
        JSON.parse(localStorage.getItem("signanceTerminologyDict") || "[]") ||
        [];
      const mergedDict = prevDict.concat(
        filtered.map((s) => ({ wrong: s.wrong, correct: s.correct }))
      );
      localStorage.setItem(
        "signanceTerminologyDict",
        JSON.stringify(mergedDict)
      );
    } catch (e) {
      console.warn("terminology dict save error:", e);
    }

    // 4) 오류 로그 저장: newEntry 하나만 추가
    try {
      const prevLogs =
        JSON.parse(localStorage.getItem("signanceErrorLogs") || "[]") || [];
      const mergedLogs = [newEntry, ...prevLogs];
      localStorage.setItem(
        "signanceErrorLogs",
        JSON.stringify(mergedLogs)
      );
    } catch (e) {
      console.warn("signanceErrorLogs save error:", e);
    }

    // 로그 화면으로 이동
    navigate("/banker/logs");
    setShowErrorPopup(false);
  };


  const hasAnySpanFilled = spans.some(
    (s) =>
      (s.wrong && s.wrong.trim().length > 0) ||
      (s.correct && s.correct.trim().length > 0)
  );

  const allSegmentsText =
    segments.length > 0 ? segments.map((s) => s.text).join("\n") : text || "";

  const currentText =
    segments.length > 0 ? segments[currentIdx]?.text || "" : text || "";

  const handleNextSegment = () => {
    if (segments.length === 0) return;
    setCurrentIdx((prev) => {
      const next = (prev + 1) % segments.length;
      setText(segments[next].text);
      return next;
    });
  };

  // 상태 텍스트
  let statusText;
  if (isRec) {
    statusText = "녹음 중...";
  } else if (sessionActive) {
    statusText = "다음 문장을 말씀해 주세요.";
  } else if (isFinalizing || isSending) {
    statusText = "음성 인식 중...";
  } else if (segments.length > 0 || text) {
    statusText = "음성 인식 완료 !";
  } else {
    statusText = "녹음 버튼을 눌러 음성을 입력해 주세요.";
  }

  return (
    <>
      {/* 메인 패널 */}
      <section className="mt-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center gap-4">
          {/* 왼쪽: 마이크 버튼 */}
          <div className="shrink-0 w-20 h-20 rounded-full border-2 border-slate-300 grid place-items-center">
            <button
              type="button"
              onClick={toggleRec}
              aria-pressed={sessionActive}
              title={sessionActive ? "녹음 세션 종료" : "녹음 세션 시작"}
              className={
                "flex items-center justify-center rounded-full bg-white transition-all " +
                (sessionActive
                  ? "h-[72px] w-[72px] border-2 border-slate-900 ring-4 ring-slate-200 animate-pulse"
                  : "h-[64px] w-[64px] border border-slate-300")
              }
            >
              <MicIconStroke
                className={
                  sessionActive
                    ? "h-9 w-9 text-slate-900"
                    : "h-8 w-8 text-slate-800"
                }
              />
            </button>
          </div>

          {/* 가운데: 상태, 진행바, 결과 박스 */}
          <div className="flex-1 h-full flex flex-col justify-start">
            <div className="flex items-baseline gap-2 font-semibold text-base text-slate-800">
              <span>{statusText}</span>
              {sessionActive && (
                <span className="text-xs font-normal text-slate-500">
                  {formatTime(sec)}
                </span>
              )}
            </div>

            <div className="mt-3">
              <StageDots active={stage} />
            </div>

            {/* 버튼 + 결과 문구 한 박스 안에 배치 */}
            <div className="mt-4 w-full">
              <div className="rounded-xl border border-slate-300 bg-white px-3 py-2 flex items-center min-h-[40px]">
                {/* 왼쪽: 질의/설명 토글 */}
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

                {/* 가운데: 인식 결과 또는 안내 문구 */}
                <div className="flex-1 ml-4 text-base text-slate-800 truncate pr-2">
                  {currentText ? (
                    currentText
                  ) : (
                    <span className="text-slate-400">
                      ({mode}) 음성 인식 결과가 여기에 표시됩니다.
                    </span>
                  )}
                </div>

                {/* 오른쪽: 문장 넘기기 버튼 */}
                {segments.length > 0 && (
                  <button
                    type="button"
                    onClick={handleNextSegment}
                    className="text-xs text-slate-600 flex-shrink-0 hover:text-slate-900"
                  >
                    ({currentIdx + 1}/{segments.length})▶
                  </button>
                )}
              </div>
            </div>

            {/* 에러 메시지 */}
            {(recErr || apiErr) && (
              <div className="mt-2 text-xs text-red-600">
                {recErr || apiErr}
              </div>
            )}
          </div>

          {/* 오른쪽: 번역 오류 / (응답 전송 버튼은 상태 표시용) */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="h-11 px-5 rounded-xl bg-slate-900 text-white text-base hover:bg-slate-800 whitespace-nowrap disabled:bg-slate-400"
              onClick={() => {}}
              disabled={isSending || isFinalizing}
            >
              {isSending || isFinalizing ? "전송 중..." : "응답 전송"}
            </button>

            <button
              type="button"
              className="h-11 px-5 rounded-xl border border-slate-300 text-base hover:bg-slate-50 whitespace-nowrap"
              onClick={handleReportError}
            >
              번역 오류
            </button>
          </div>
        </div>
      </section>

      {/* 문장별 latency 표시 */}
      
{false && latencyList.length > 0 && (
  <div className="mt-2 space-y-0.5 text-xs text-slate-500">
    {latencyList.map((lat, idx) => {
      // lat이 비어있으면 렌더링 스킵 (undefined 방어)
      if (!lat) return null;

      const label =
        typeof lat.round === "number" && typeof lat.idxInRound === "number"
          ? `${lat.round}-${lat.idxInRound + 1}`
          : `${idx + 1}`;

      return (
        <div key={idx} className="flex flex-wrap gap-x-4">
          <span>
            문장 {label}:
            {typeof lat.audioSec === "number" && (
              <> 발화: {lat.audioSec.toFixed(2)} s /</>
            )}
            {typeof lat.videoSec === "number" && (
              <> 영상: {lat.videoSec.toFixed(2)} s /</>
            )}{" "}
            STT: {msToSec(lat.stt)} s / NLP: {msToSec(lat.nlp)} s /
            매핑: {msToSec(lat.mapping)} s / 합성: {msToSec(lat.synth)} s
          </span>
          <span>🕐 총합: {msToSec(lat.total)} s</span>
        </div>
      );
    })}
  </div>
)}



      {/* 문장별 오디오 미리듣기 */}
      {audioList.length > 0 && (
        <div className="mt-3 space-y-2">
          {audioList.map((a, idx) => (
            <div key={idx} className="space-y-1">
              <div className="text-xs text-slate-500">
                문장 {idx + 1} 오디오
              </div>
              <audio controls src={a.url} className="w-full" />
            </div>
          ))}
        </div>
      )}

      {/* 번역 오류 입력 팝업 */}
      {showErrorPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="text-sm font-semibold text-slate-500 mb-1">
              번역 오류 신고
            </div>
            <div className="text-lg font-semibold text-slate-900 mb-3">
              어떤 부분을 어떻게 고치고 싶으신가요?
            </div>

            <div className="mb-3">
              <div className="text-xs text-slate-500 mb-1">전체 문장</div>
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800 max-h-24 overflow-y-auto whitespace-pre-wrap">
                {allSegmentsText || "인식된 문장이 없습니다."}
              </div>
            </div>

            <div className="mb-2 max-h-56 overflow-y-auto space-y-3 pr-1">
              {spans.map((s, idx) => (
                <div key={idx} className="flex gap-2">
                  <div className="flex-1">
                    <div className="text-xs text-slate-500 mb-1">
                      잘못된 부분 {idx + 1}
                    </div>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      placeholder="예: 정립심 예금"
                      value={s.wrong}
                      onChange={(e) =>
                        updateSpan(idx, "wrong", e.target.value)
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-slate-500 mb-1">
                      올바른 표현 {idx + 1}
                    </div>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      placeholder="예: 적립식 예금"
                      value={s.correct}
                      onChange={(e) =>
                        updateSpan(idx, "correct", e.target.value)
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addSpanRow}
              className="mb-4 text-[11px] text-slate-500 hover:text-slate-800"
            >
              + 오류 항목 추가
            </button>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowErrorPopup(false)}
                className="px-4 h-9 rounded-lg border border-slate-300 text-xs text-slate-700 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmError}
                className="px-4 h-9 rounded-lg bg-slate-900 text-xs text-white hover:bg-slate-800 disabled:bg-slate-400"
                disabled={!hasAnySpanFilled}
              >
                저장 후 로그 보기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// 진행 바
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

function formatTime(s) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function msToSec(ms) {
  if (ms == null || isNaN(ms)) return "-";
  return (ms / 1000).toFixed(2);
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

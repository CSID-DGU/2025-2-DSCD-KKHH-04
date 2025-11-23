// frontend/src/components/MicRecorderForServer.jsx
import React, { useRef, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export default function MicRecorderForServer() {
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [sttText, setSttText] = useState("");
  const [loading, setLoading] = useState(false);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      });

      const mr = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await uploadAudio(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
    } catch (err) {
      console.error("녹음 시작 실패:", err);
      alert("마이크 권한을 확인해 주세요.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadAudio = async (blob) => {
    setLoading(true);
    setSttText("");

    const formData = new FormData();
    formData.append("audio", blob, "record.webm");

    try {
      const resp = await fetch(`${API_BASE}/api/speech_to_sign/`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error("API error:", text);
        alert("서버 오류");
        return;
      }

      const data = await resp.json();
      // 예: { text: "STT 결과", gloss: [...], gloss_ids: [...], video_url: "..." }
      setSttText(data.text || "");
    } catch (e) {
      console.error("업로드 실패:", e);
      alert("업로드 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-white shadow">
      <div className="flex gap-3 items-center">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="px-4 py-2 rounded-lg bg-green-500 text-white"
          >
            녹음 시작
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="px-4 py-2 rounded-lg bg-red-500 text-white"
          >
            녹음 종료
          </button>
        )}
        {loading && <span className="text-sm text-slate-500">인식 중…</span>}
      </div>

      <div className="mt-4 text-sm text-slate-700">
        <p className="font-semibold mb-1">STT 결과:</p>
        <p className="whitespace-pre-wrap min-h-[40px]">
          {sttText || "아직 결과 없음"}
        </p>
      </div>
    </div>
  );
}

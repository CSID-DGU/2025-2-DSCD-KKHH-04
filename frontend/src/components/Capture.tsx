import { useRef, useState } from "react";
import { useHands } from "@/hooks/useHands";

export default function Capture() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { start, stop, status, respText } = useHands();
  const [started, setStarted] = useState(false);

  const handleStart = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    await start(videoRef.current, canvasRef.current);
    setStarted(true);
  };

  const handleStop = () => {
    stop();
    setStarted(false);
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center gap-5 p-6">
      <h1 className="text-3xl font-bold">Sign → Text Demo</h1>

      {/* 카메라 크게 중앙 */}
      <div className="relative w-[85vw] max-w-[1280px] aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"  /* ← 반전 제거 */
          playsInline
          muted
          autoPlay
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none" /* ← 반전 제거 */
        />
      </div>

      <div className="flex gap-3 items-center">
        {!started ? (
          <button onClick={handleStart} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white">
            카메라 시작
          </button>
        ) : (
          <button onClick={handleStop} className="px-5 py-2.5 rounded-xl bg-gray-700 text-white">
            멈추기
          </button>
        )}
        <span className="text-gray-500 text-sm">상태: {status}</span>
      </div>

      <div className="w-[60vw] max-w-[800px] p-4 rounded-xl bg-amber-50 border">
        <div className="text-sm text-gray-500">서버 응답</div>
        <div className="text-lg font-medium break-words">{respText || "—"}</div>
      </div>
    </div>
  );
}

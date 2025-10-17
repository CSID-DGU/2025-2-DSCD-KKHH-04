import { useEffect, useRef, useState } from "react";
import { useHands } from "@/hooks/useHands";

export default function Capture() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { start, stop, status, respText } = useHands();

  const [started, setStarted] = useState(false);
  const [mirror, setMirror] = useState(true); // 화면만 미러(모델 입력은 원본)

  // 컨테이너 크기에 맞춰 캔버스 픽셀 크기 동기화(DPR 포함)
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const syncCanvasSize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;

      // CSS 표시 크기
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      // 실제 픽셀 크기
      const pxW = Math.max(1, Math.round(w * dpr));
      const pxH = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== pxW) canvas.width = pxW;
      if (canvas.height !== pxH) canvas.height = pxH;
    };

    const ro = new ResizeObserver(syncCanvasSize);
    ro.observe(container);
    syncCanvasSize();

    return () => ro.disconnect();
  }, []);

  const handleStart = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    // 비디오 메타가 준비되면(처음 1~2프레임 후) 컨테이너가 영상비율과 달라 생길 수 있는 좌표 어긋남을 줄이기 위해, 시작 시점에 한 번 더 캔버스 동기화
    const ensureSync = () => {
      const container = containerRef.current!;
      const canvas = canvasRef.current!;
      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    };

    ensureSync();
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

      {/* 옵션 바(미러 토글) */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={mirror}
            onChange={(e) => setMirror(e.target.checked)}
          />
          미러 프리뷰(좌우 반전)
        </label>
        <span className="text-gray-500 text-sm">상태: {status}</span>
      </div>

      {/* 카메라 크게 중앙 */}
      <div
        ref={containerRef}
        className="relative w-[85vw] max-w-[1280px] aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl"
      >
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: mirror ? "scaleX(-1)" : "none", transformOrigin: "center" }}
          playsInline
          muted
          autoPlay
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ transform: mirror ? "scaleX(-1)" : "none", transformOrigin: "center" }}
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
      </div>

      <div className="w-[60vw] max-w-[800px] p-4 rounded-xl bg-amber-50 border">
        <div className="text-sm text-gray-500">서버 응답</div>
        <div className="text-lg font-medium break-words">{respText || "—"}</div>
      </div>
    </div>
  );
}

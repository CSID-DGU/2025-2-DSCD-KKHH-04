// src/hooks/useHands.ts
import { useEffect, useRef, useState, useCallback } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

// ---- 공용 타입 ----
export type Landmark = { x: number; y: number; z?: number };
export type Hand = { handedness: string; landmarks: Landmark[] };
export type Frame = { ts: number; hands: Hand[] };

// MediaPipe 표준 연결
const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

// object-cover일 때 비디오가 실제로 그려지는 영역 계산
function getCoverMapping(
  containerW: number,
  containerH: number,
  videoW: number,
  videoH: number
) {
  const scale = Math.max(containerW / videoW, containerH / videoH);
  const drawnW = videoW * scale;
  const drawnH = videoH * scale;
  const offsetX = (containerW - drawnW) / 2;
  const offsetY = (containerH - drawnH) / 2;
  return { drawnW, drawnH, offsetX, offsetY };
}

// 캔버스에 랜드마크 그리기 (object-cover 보정 + mirror)
function drawHandsOnCanvas(
  canvas: HTMLCanvasElement,
  hands: Hand[],
  containerW: number,
  containerH: number,
  videoW: number,
  videoH: number,
  mirror = false // 화면 미러는 CSS로만, 여기서는 false 유지
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { drawnW, drawnH, offsetX, offsetY } =
    getCoverMapping(containerW, containerH, videoW, videoH);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();

  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = "#00D1FF";

  for (const hand of hands) {
    // 선
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = hand.landmarks[a];
      const pb = hand.landmarks[b];
      if (!pa || !pb) continue;
      const ax = (pa.x * drawnW + offsetX) * dpr;
      const ay = (pa.y * drawnH + offsetY) * dpr;
      const bx = (pb.x * drawnW + offsetX) * dpr;
      const by = (pb.y * drawnH + offsetY) * dpr;
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();

    // 점
    ctx.fillStyle = "#FF375F";
    for (let i = 0; i < hand.landmarks.length; i++) {
      const p = hand.landmarks[i];
      const r = (i === 0 ? 3.2 : 2.4) * dpr;
      const x = (p.x * drawnW + offsetX) * dpr;
      const y = (p.y * drawnH + offsetY) * dpr;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // handedness 라벨
    const wrist = hand.landmarks[0];
    if (wrist) {
      const x = (wrist.x * drawnW + offsetX) * dpr;
      const y = (wrist.y * drawnH + offsetY) * dpr;
      ctx.fillStyle = "#12B886";
      ctx.font = `${12 * dpr}px sans-serif`;
      ctx.fillText(hand.handedness || "Unknown", x + 6 * dpr, y - 6 * dpr);
    }
  }
  ctx.restore();
}

// ---- 훅 본체 ----
// onFrame: 프레임 한 개 나올 때마다 (랜드마크 포함) 호출
export function useHands(opts?: { onFrame?: (frame: Frame) => void }) {
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<
    "idle" | "loading" | "running" | "stopped" | "error"
  >("idle");
  // 나중에 LLM inference 다시 붙일 때 쓰라고 respText는 그냥 유지
  const [respText, setRespText] = useState("");

  const fps = 30;
  const runningRef = useRef(false);
  const lastTickRef = useRef(0);

  const initLandmarker = useCallback(async () => {
    setStatus("loading");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );
    landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      },
      runningMode: "VIDEO",
      numHands: 2,
    });
  }, []);

  const start = useCallback(
    async (videoEl: HTMLVideoElement, canvasEl: HTMLCanvasElement) => {
      try {
        if (!landmarkerRef.current) await initLandmarker();

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
        streamRef.current = stream;
        videoEl.srcObject = stream;
        await videoEl.play();

        // 시작 시 캔버스 픽셀 크기 동기화
        const syncCanvas = () => {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const cw = canvasEl.clientWidth;
          const ch = canvasEl.clientHeight;
          const pxW = Math.max(1, Math.floor(cw * dpr));
          const pxH = Math.max(1, Math.floor(ch * dpr));
          if (canvasEl.width !== pxW) canvasEl.width = pxW;
          if (canvasEl.height !== pxH) canvasEl.height = pxH;
        };
        syncCanvas();

        const ro = new ResizeObserver(syncCanvas);
        ro.observe(canvasEl);

        runningRef.current = true;
        setStatus("running");

        const scheduleNext = (cb: (t: number) => void) => {
          const anyVideo = videoEl as any;
          if (typeof anyVideo.requestVideoFrameCallback === "function") {
            anyVideo.requestVideoFrameCallback(cb);
          } else {
            // TS + 일부 브라우저 호환용 fallback
            requestAnimationFrame(cb);
          }
        };

        const tick = (now: number) => {
          if (!runningRef.current) return;
          const lm = landmarkerRef.current;
          if (!lm) return;

          if (now - lastTickRef.current >= 1000 / fps) {
            lastTickRef.current = now;

            const res: HandLandmarkerResult = lm.detectForVideo(videoEl, now);
            const rawLandmarks = res?.landmarks ?? [];
            const handednessArr = res?.handednesses ?? [];

            const hands: Hand[] = rawLandmarks.map((arr, i) => ({
              handedness:
                handednessArr?.[i]?.[0]?.categoryName ?? "Unknown",
              landmarks: arr.map((p) => ({
                x: p.x,
                y: p.y,
                z: p.z ?? 0,
              })),
            }));

            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const cw = canvasEl.clientWidth;
            const ch = canvasEl.clientHeight;
            const pxW = Math.max(1, Math.floor(cw * dpr));
            const pxH = Math.max(1, Math.floor(ch * dpr));
            if (canvasEl.width !== pxW) canvasEl.width = pxW;
            if (canvasEl.height !== pxH) canvasEl.height = pxH;

            drawHandsOnCanvas(
              canvasEl,
              hands,
              cw,
              ch,
              videoEl.videoWidth || 640,
              videoEl.videoHeight || 480,
              false
            );

            if (hands.length) {
              const frame: Frame = { ts: Date.now(), hands };
              opts?.onFrame?.(frame);
            }
          }

          scheduleNext(tick);
        };

        scheduleNext(tick);

        // cleanup 저장
        (videoEl as any)._cleanupObserver = () => {
          ro.disconnect();
        };
      } catch (e) {
        console.error(e);
        setStatus("error");
      }
    },
    [fps, initLandmarker, opts]
  );

  const stop = useCallback(() => {
    runningRef.current = false;
    setStatus("stopped");
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { start, stop, status, respText, setRespText };
}

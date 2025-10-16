import { useEffect, useRef, useState, useCallback } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { postIngest } from "@/services/api";

type Landmark = { x: number; y: number; z?: number };
type Hand = { handedness: string; landmarks: Landmark[] };
type Frame = { ts: number; hands: Hand[] };

// MediaPipe 표준 연결
const HAND_CONNECTIONS: Array<[number, number]> = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];

// object-cover일 때 비디오가 실제로 그려지는 영역 계산
function getCoverMapping(
  containerW: number, containerH: number,
  videoW: number, videoH: number
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
  mirror = true
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const { drawnW, drawnH, offsetX, offsetY } =
    getCoverMapping(containerW, containerH, videoW, videoH);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();

  // 비디오를 CSS로 좌우반전했다면 동일하게 반전
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

export function useHands() {
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<"idle"|"loading"|"running"|"stopped"|"error">("idle");
  const [respText, setRespText] = useState<string>("");

  const fps = 15;
  const windowMs = 1000;
  const framesRef = useRef<Frame[]>([]);
  const lastTickRef = useRef(0);
  const runningRef = useRef(false);
  const timerRef = useRef<number | null>(null);

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

  // 비디오+캔버스 전달받아서 시작
  const start = useCallback(async (videoEl: HTMLVideoElement, canvasEl: HTMLCanvasElement) => {
    try {
      if (!landmarkerRef.current) await initLandmarker();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      videoEl.srcObject = stream;
      await videoEl.play();

      framesRef.current = [];
      runningRef.current = true;
      setStatus("running");

      // 프레임 루프: detect + draw
      const tick = (now: number) => {
        if (!runningRef.current) return;
        const lm = landmarkerRef.current!;
        if (now - lastTickRef.current >= 1000 / fps) {
          lastTickRef.current = now;
          const res = lm.detectForVideo(videoEl, now);
          const hands: Hand[] = (res?.landmarks ?? []).map((arr, i) => ({
            handedness: res.handedness?.[i]?.[0]?.categoryName ?? "Unknown",
            landmarks: arr.map(p => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
          }));

          // 캔버스 해상도(DPR) 맞추기
          const dpr = window.devicePixelRatio || 1;
          const cw = canvasEl.clientWidth;
          const ch = canvasEl.clientHeight;
          if (canvasEl.width !== Math.floor(cw * dpr) || canvasEl.height !== Math.floor(ch * dpr)) {
            canvasEl.width = Math.floor(cw * dpr);
            canvasEl.height = Math.floor(ch * dpr);
          }

          // ★ object-cover 보정하여 그리기 (mirror=true)
          drawHandsOnCanvas(
            canvasEl, hands,
            cw, ch,
            videoEl.videoWidth || 640, videoEl.videoHeight || 480,
            false
          );

          // 서버 전송 버퍼
          framesRef.current.push({ ts: Date.now(), hands });
        }
        videoEl.requestVideoFrameCallback(tick);
      };
      videoEl.requestVideoFrameCallback(tick);

      // 1초마다 무조건 전송 (프레임 누락 대비)
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(async () => {
        const frames = framesRef.current.splice(0, framesRef.current.length);
        if (frames.length === 0) return;
        const payload = { session_id: crypto.randomUUID(), fps, window_ms: windowMs, frames };
        try {
          const r = await postIngest(payload);
          setRespText(r.text);
        } catch (e) {
          console.error(e);
          setRespText("서버 통신 오류");
        }
      }, windowMs);
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }, [fps, windowMs, initLandmarker]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setStatus("stopped");
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { start, stop, status, respText };
}

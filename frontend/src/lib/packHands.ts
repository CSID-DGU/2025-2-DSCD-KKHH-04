// src/lib/packHands.ts

// ❌ 옛날 Mediapipe 타입 import 제거
// import type { Results } from "@mediapipe/hands";

import type { Frame, Hand, Landmark } from "@/lib/seqTransport";

// Mediapipe 결과에서 실제로 쓰는 필드 모양만 정의
type MPHandLandmark = {
  x: number;
  y: number;
  z?: number;
};

type MPHandedness = {
  label?: string;
};

type MPResults = {
  multiHandLandmarks?: MPHandLandmark[][];
  multiHandedness?: MPHandedness[];
};

// ✅ Mediapipe-like 결과 → 우리 Frame 타입으로 변환
export function frameFromResults(results: MPResults, ts: number): Frame {
  const hands: Hand[] = [];

  if (results.multiHandLandmarks && results.multiHandedness) {
    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const lmList = results.multiHandLandmarks[i];
      const handed: Hand["handedness"] =
        results.multiHandedness[i]?.label === "Left" ? "Left" : "Right";

      const landmarks: Landmark[] = lmList.map((lm) => ({
        x: lm.x,
        y: lm.y,
        z: lm.z ?? 0,
      }));

      hands.push({ handedness: handed, landmarks });
    }
  }

  return { ts, hands };
}

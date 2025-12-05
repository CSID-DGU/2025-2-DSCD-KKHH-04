// src/lib/seqTransport.ts
// 공용 인터페이스 (Mediapipe → 서버로 보내는 형식)

export type Landmark = {
  x: number;
  y: number;
  z?: number;      // Mediapipe z 값 (없으면 0으로 처리)
};

export type Hand = {
  handedness: "Left" | "Right";
  landmarks: Landmark[];   // 길이 21 기대
};

export type Frame = {
  ts: number;  // 타임스탬프(ms) - performance.now() or Date.now()
  hands: Hand[];
};

export interface ISeqTransport {
  // 프론트에서는 이 함수만 계속 호출하면 됨
  pushFrame(frame: Frame): void;

  // 버튼누르면 push하게
  flush(): Promise<void>;

  // 세션 종료 시 호출 (마지막 flush 포함)
  close(): void;
}

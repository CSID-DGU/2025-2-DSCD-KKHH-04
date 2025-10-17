// 공용 인터페이스
export type Landmark = { x:number; y:number; z?:number };
export type Hand = { handedness:'Left'|'Right'; landmarks: Landmark[] };
export type Frame = { ts:number; hands: Hand[] };

export interface ISeqTransport {
  pushFrame(frame: Frame): void;
  flush(): void;
  close(): void;
}
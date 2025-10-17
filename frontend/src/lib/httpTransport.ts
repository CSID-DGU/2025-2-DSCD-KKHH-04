// 테스트용
import type { ISeqTransport, Frame } from "@/lib/seqTransport";

export class HttpBatchTransport implements ISeqTransport {
  private buffer: Frame[] = [];
  private timer?: number;
  constructor(private url: string, private sessionId: string, private fps=30, private batchMs=500){
  }

  pushFrame(f: Frame) {
    this.buffer.push(f);
    if (!this.timer) this.timer = window.setTimeout(() => this.flush(), this.batchMs);
    if (this.buffer.length >= 60) this.flush(); // 0.5~1초마다
  }

  async flush() {
    if (!this.buffer.length) return;
    const payload = { session_id: this.sessionId, fps: this.fps, frames: this.buffer };
    this.buffer = [];
    if (this.timer) { window.clearTimeout(this.timer); this.timer = undefined; }
    await fetch(this.url, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
  }

  close(){ this.flush(); }
}

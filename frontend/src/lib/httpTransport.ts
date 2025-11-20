// src/lib/httpTransport.ts

import type { ISeqTransport, Frame } from "@/lib/seqTransport";

const API_BASE = "http://127.0.0.1:8000";

export class HttpBatchTransport implements ISeqTransport {
  private buffer: Frame[] = [];
  private url: string;

  constructor(
    url: string,
    private sessionId: string,
    private fps = 30
  ) {
    this.url = `${API_BASE}${url}`;
  }

  pushFrame(f: Frame) {
    this.buffer.push(f);
  }

  async flush(): Promise<void> {
    if (!this.buffer.length) return;

    const payload = {
      session_id: this.sessionId,
      fps: this.fps,
      frames: this.buffer,
    };

    this.buffer = [];

    await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  // 🔹 인터페이스: close(): void 와 맞추기
  //   내부적으로 flush는 async지만, 여기서는 그냥 fire-and-forget
  close(): void {
    void this.flush();   // Promise는 기다리지 않고 버림
  }
}

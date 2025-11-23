// src/lib/httpTransport.ts
import type { ISeqTransport, Frame } from "@/lib/seqTransport";

const API_BASE = "http://127.0.0.1:8000";

export class HttpBatchTransport implements ISeqTransport {
  private buffer: Frame[] = [];
  private url: string;

  // 🔥 백엔드 응답 전달용 콜백 (선택)
  onResult?: (data: any) => void;

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
    console.log(
      "[HttpBatchTransport] flush() called, buffer length =",
      this.buffer.length
    );

    if (!this.buffer.length) return;

    const payload = {
      session_id: this.sessionId,
      fps: this.fps,
      frames: this.buffer,
    };

    this.buffer = [];

    try {
      console.log("[HttpBatchTransport] POST", this.url, payload);

      const r = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("[HttpBatchTransport] response status", r.status);

      if (!r.ok) {
        console.error("[HttpBatchTransport] HTTP error", r.status);
        return;
      }

      const data = await r.json();
      console.log("[HttpBatchTransport] response json", data);

      if (this.onResult) {
        this.onResult(data);
      }
    } catch (err) {
      console.error("[HttpBatchTransport] network error", err);
    }
  }

  close(): void {
    void this.flush(); // fire-and-forget
  }
}

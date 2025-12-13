// src/lib/httpTransport.ts
import type { ISeqTransport, Frame } from "./seqTransport";

const API_BASE = "http://127.0.0.1:8000";

export class HttpBatchTransport implements ISeqTransport {
  private buffer: Frame[] = [];
  private url: string;

  // ★ evalId 추가
  public evalId?: string;

  // 🔥 백엔드 응답 전달용 콜백 (선택)
  onResult?: (data: any) => void;

  constructor(
    url: string,          // 예: "/api/ingest-and-infer/"
    private sessionId: string,
    private fps = 30
  ) {
    this.url = `${API_BASE}${url}`;
  }

  pushFrame(f: Frame) {
    this.buffer.push(f);
  }

  async flush(): Promise<void> {
    console.log("[HttpBatchTransport] flush() called, buffer length =", this.buffer.length);

    if (!this.buffer.length) return;

    const payload: any = {
      session_id: this.sessionId,
      fps: this.fps,
      frames: this.buffer,
    };

    // ★ ★ eval_id를 payload에 추가
    if (this.evalId) {
      payload.eval_id = this.evalId;
    }

    try {
      console.log("[HttpBatchTransport] POST", this.url, payload);

      const r = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("[HttpBatchTransport] response status", r.status);

      if (!r.ok) {
        let text: string;
        try {
          text = await r.text();
        } catch {
          text = "<no body>";
        }
        console.error("[HttpBatchTransport] HTTP error", r.status, text);
        return;
      }

      const data = await r.json();
      console.log("[HttpBatchTransport] response json", data);

      if (this.onResult) {
        this.onResult(data);
      }

      // 성공하면 버퍼 비우기
      this.buffer = [];
    } catch (err) {
      console.error("[HttpBatchTransport] network error", err);
    }
  }

  close(): void {
    void this.flush(); // fire and forget
  }
}

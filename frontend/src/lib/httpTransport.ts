// src/lib/httpTransport.ts
import type { ISeqTransport, Frame } from "@/lib/seqTransport";

const API_BASE = "http://127.0.0.1:8000";

export class HttpBatchTransport implements ISeqTransport {
  private buffer: Frame[] = [];
  private url: string;

  // 🔥 백엔드 응답 전달용 콜백 (선택)
  onResult?: (data: any) => void;

  constructor(
    url: string,          // 예: "/api/ingest-and-infer-seq/"
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

    try {
      console.log("[HttpBatchTransport] POST", this.url, payload);

      const r = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("[HttpBatchTransport] response status", r.status);

      if (!r.ok) {
        // 🔍 에러 응답 body까지 같이 출력
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

      // ✅ 여기까지 성공하면 버퍼 비우기
      this.buffer = [];
    } catch (err) {
      console.error("[HttpBatchTransport] network error", err);
      // 네트워크 에러면 버퍼는 그대로 두고, 다음 flush 때 다시 시도 가능
    }
  }

  close(): void {
    void this.flush(); // fire-and-forget
  }
}

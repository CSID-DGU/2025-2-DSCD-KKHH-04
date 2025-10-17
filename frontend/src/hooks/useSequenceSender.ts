// src/hooks/useSequenceSender.ts
import { useMemo, useEffect } from "react";
import { HttpBatchTransport } from "@/lib/httpTransport";
// import { WsTransport } from "@/lib/wsTransport";

export function useSequenceSender(sessionId: string) {
  const transport = useMemo(() => {
    // 초기엔 HTTP
    return new HttpBatchTransport("/api/seq/ingest/", sessionId, 30, 500);
    // 나중에 WS로 전환:
    // return new WsTransport("wss://your.host/ws/seq/", sessionId, 30);
  }, [sessionId]);

  useEffect(() => () => transport.close(), [transport]);

  return transport; // transport.pushFrame(frame)만 계속 호출
}

// src/hooks/useSequenceSender.ts
import { useMemo, useEffect } from "react";
import { HttpBatchTransport } from "@/lib/httpTransport";
import type { ISeqTransport } from "@/lib/seqTransport";
// import { WsTransport } from "@/lib/wsTransport";

export function useSequenceSender(sessionId: string): ISeqTransport {
  const transport = useMemo<ISeqTransport>(() => {
    //  HTTP 배치 전송:
    //    - endpoint: /api/ingest-and-infer/
    //    - fps: 30
    //    - flushIntervalMs: 500
    return new HttpBatchTransport("/api/ingest-and-infer/", sessionId, 30);

    // 나중에 WebSocket으로 변경 시 아래로 교체
    // return new WsTransport("wss://your.host/ws/seq/", sessionId, 30);
  }, [sessionId]);

  // 컴포넌트 unmount 시 세션 종료
  useEffect(() => {
    return () => transport.close();
  }, [transport]);

  // 밖에서는 transport.pushFrame(frame) / transport.endSession()만 쓰면 됨
  return transport;
}

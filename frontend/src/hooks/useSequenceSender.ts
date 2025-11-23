import { useMemo, useEffect } from "react";
import { HttpBatchTransport } from "@/lib/httpTransport";
import type { ISeqTransport } from "@/lib/seqTransport";

// top-1 토큰을 밖으로 내보내는 콜백을 받도록
export function useSequenceSender(
  sessionId: string,
  onTop1?: (top1: string) => void
): ISeqTransport {
  // 1) transport 인스턴스는 sessionId 로만 고정
  const transport = useMemo<ISeqTransport>(() => {
    const t = new HttpBatchTransport("/api/ingest-and-infer/", sessionId, 30);
    console.log("[useSequenceSender] new transport created", sessionId);
    return t;
  }, [sessionId]);

  // 2) 콜백(onResult)은 effect 에서 갈아끼우기만 함 (인스턴스는 그대로)
  useEffect(() => {
    const t = transport as HttpBatchTransport;

    t.onResult = (data: any) => {
      const top1 = data?.inference?.topk_tokens?.[0];
      console.log("[useSequenceSender] onResult top1 =", top1);
      if (top1 && onTop1) onTop1(top1);
    };

    // cleanup 에서 굳이 onResult 를 지울 필요는 없음
  }, [transport, onTop1]);

  // 3) 언마운트 / 세션 변경 시에만 close 호출
  useEffect(() => {
    return () => {
      console.log("[useSequenceSender] cleanup → transport.close()");
      transport.close();
    };
  }, [transport]);

  return transport;
}

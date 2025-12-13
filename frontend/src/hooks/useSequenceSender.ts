// src/hooks/useSequenceSender.ts
import { useMemo, useEffect } from "react";
import { HttpBatchTransport } from "../lib/httpTransport";
import type { ISeqTransport } from "../lib/seqTransport";

export interface SignInferenceResult {
  ok: boolean;
  file: string;
  T: number;
  fps: number;
  text: string;
  gloss_tokens: string[];
  gloss_sentence: string;
  natural_sentence: string;
  segments: any[];
  params?: Record<string, unknown>;
  motion_stats?: Record<string, unknown>;
}

/**
 * sessionId: 세션 아이디
 * onResult : 백엔드 결과 콜백
 * evalId  : (선택) 평가용 문장 ID (로그용)
 */
export function useSequenceSender(
  sessionId: string,
  onResult?: (result: SignInferenceResult) => void,
  evalId?: string,                       // ★ 3번째 인자로 이동
): ISeqTransport {
  const transport = useMemo<ISeqTransport>(() => {
    const t = new HttpBatchTransport("/api/ingest-and-infer/", sessionId, 30);

    // ★ 필요하면 여기서 evalId를 세팅
    if (evalId) {
      (t as HttpBatchTransport).evalId = evalId;
    }

    console.log("[useSequenceSender] new transport created", sessionId, evalId);
    return t;
  }, [sessionId, evalId]);

  useEffect(() => {
    const t = transport as HttpBatchTransport;

    t.onResult = (data: any) => {
      console.log("[useSequenceSender] raw onResult data =", data);

      if (!data || data.ok === false) {
        console.warn("[useSequenceSender] backend returned error or falsy data");
        return;
      }

      const result = data as SignInferenceResult;

      console.log(
        "[useSequenceSender] gloss_sentence =",
        result.gloss_sentence,
        "/ natural_sentence =",
        result.natural_sentence
      );

      if (onResult) {
        onResult(result);      // ★ 다시 제대로 콜백 호출
      }
    };
  }, [transport, onResult]);

  useEffect(() => {
    return () => {
      console.log("[useSequenceSender] cleanup → transport.close()");
      transport.close();
    };
  }, [transport]);

  return transport;
}

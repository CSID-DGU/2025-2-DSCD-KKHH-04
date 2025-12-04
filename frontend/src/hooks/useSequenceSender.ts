// src/hooks/useSequenceSender.ts
import { useMemo, useEffect } from "react";
import { HttpBatchTransport } from "@/lib/httpTransport";
import type { ISeqTransport } from "@/lib/seqTransport";

// 백엔드 /api/ingest-and-infer/ 응답 타입 (새 구조)
export interface SignInferenceResult {
  ok: boolean;
  file: string;
  T: number;
  fps: number;
  text: string;

  gloss_tokens: string[];      // ["예금", "비밀번호", "분실", ...]
  gloss_sentence: string;      // "예금 비밀번호 분실"
  natural_sentence: string;    // "계좌 비밀번호를 잊어버렸어요."
  segments: any[];             // 세그먼트 정보 (필요하면 타입 나중에 더 세게 잡아도 됨)

  params?: Record<string, unknown>;
  motion_stats?: Record<string, unknown>;
}

// 세션별 시퀀스 전송 훅
// - sessionId: 세션 식별자
// - onResult : 백엔드에서 온 전체 추론 결과를 받고 싶을 때 콜백
export function useSequenceSender(
  sessionId: string,
  onResult?: (result: SignInferenceResult) => void
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
      console.log("[useSequenceSender] raw onResult data =", data);

      if (!data || data.ok === false) {
        console.warn("[useSequenceSender] backend returned error or falsy data");
        return;
      }

      // 타입 단언해서 콜백에 넘겨줌
      const result = data as SignInferenceResult;

      console.log(
        "[useSequenceSender] gloss_sentence =",
        result.gloss_sentence,
        "/ natural_sentence =",
        result.natural_sentence
      );

      if (onResult) {
        onResult(result);
      }
    };

    // cleanup 에서 굳이 onResult 를 지울 필요는 없음
  }, [transport, onResult]);

  // 3) 언마운트 / 세션 변경 시에만 close 호출
  useEffect(() => {
    return () => {
      console.log("[useSequenceSender] cleanup → transport.close()");
      transport.close();
    };
  }, [transport]);

  return transport;
}

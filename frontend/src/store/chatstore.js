// src/store/chatstore.js
import { create } from "zustand";

const initialSystemMessage = {
  role: "system",
  text: "안녕하세요, Signance입니다. 수어 기반 금융 상담을 시작합니다.",
  timestamp: new Date().toISOString(),
};

export const useChatStore = create((set) => ({
  // 항상 기본 메시지 포함
  messages: [initialSystemMessage],

  // ① 개별 메시지 추가 (필요한 페이지에서 사용)
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  // ② 완전 리셋 (시스템 멘트만 남기고 나머지 삭제)
  resetMessages: () => set({ messages: [initialSystemMessage] }),

  // ✅ DeafSend 등에서 쓰는 clearMessages: resetMessages와 동일하게 동작
  clearMessages: () => set({ messages: [initialSystemMessage] }),

  // ③ 외부에서 "배열 통째로" 세팅할 때 쓰는 함수 (DeafReceive 등에서 사용)
  //    → 항상 맨 앞에 initialSystemMessage를 붙여줌
  setMessages: (updater) =>
    set((state) => {
      // updater가 함수일 수도 있고, 배열일 수도 있으니까 둘 다 처리
      const updated =
        typeof updater === "function" ? updater(state.messages) : updater;

      const backendMessages = Array.isArray(updated) ? updated : [];

      // 혹시 백엔드에서 system 비슷한 게 들어온다고 해도,
      // 우리가 넣는 initialSystemMessage랑 중복되지 않게 필터링
      const filtered = backendMessages.filter(
        (m) =>
          !(
            m &&
            m.role === "system" &&
            m.text === initialSystemMessage.text
          )
      );

      return {
        // 항상 제일 앞에 시스템 멘트 고정
        messages: [initialSystemMessage, ...filtered],
      };
    }),
}));

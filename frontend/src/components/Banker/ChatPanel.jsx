// frontend_clean/src/components/Banker/ChatPanel.jsx
import React from "react";
import { Pencil } from "lucide-react"; // lucide-react 쓰고 있다면

export default function ChatPanel({
  messages = [],
  editMode,
  editTargetId,
  onToggleEditMode,
  onSelectMessage,
  onDeleteMessage,
}) {
  return (
    <div className="w-full mt-4 mb-3 bg-white rounded-xl shadow-sm p-4">
      {/* 헤더 영역 */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-slate-700">
          상담 대화창
        </div>
        <button
          type="button"
          onClick={onToggleEditMode}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${
            editMode
              ? "border-[#2b5486] text-[#2b5486] bg-[#2b5486]/5"
              : "border-slate-300 text-slate-500 bg-white hover:bg-slate-50"
          }`}
        >
          <Pencil size={14} />
          <span>{editMode ? "수정 모드" : "수정"}</span>
        </button>
      </div>

      {/* 메시지 리스트 */}
      <div className="h-[220px] overflow-y-auto bg-slate-50 rounded-lg px-3 py-2">
        {messages.length === 0 ? (
          <p className="text-xs text-slate-400">
            상담 내용이 여기에 표시됩니다.
          </p>
        ) : (
          messages.map((m) => {
            const isSelected = editMode && m.id === editTargetId;
            const isBanker =
              m.role === "banker" || m.from === "agent" || m.from === "banker";

            return (
              <div
                key={m.id}
                className={`mb-2 flex ${
                  isBanker ? "justify-start" : "justify-end"
                }`}
              >
                {/* 말풍선 래퍼: relative 추가 */}
                <div className="relative">
                  <div
                    onClick={() =>
                      onSelectMessage && isBanker && onSelectMessage(m)
                    }
                    className={`
                      max-w-[70%] rounded-2xl px-3 py-2 text-sm
                      ${
                        isBanker
                          ? "bg-white text-slate-800"
                          : "bg-[#2b5486] text-white"
                      }
                      ${
                        editMode && isBanker
                          ? "cursor-pointer hover:ring-2 hover:ring-[#2b5486]/40"
                          : ""
                      }
                      ${isSelected ? "ring-2 ring-[#2b5486]" : ""}
                    `}
                  >
                    {m.text}
                  </div>

                  {/* 🔹 수정 모드 + 은행원 메시지일 때만 X 버튼 */}
                  {editMode && isBanker && onDeleteMessage && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation(); // 말풍선 클릭 이벤트랑 안 섞이게
                        onDeleteMessage(m.id);
                      }}
                      className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center
                                 rounded-full bg-white border border-slate-300 text-[10px] text-slate-500
                                 shadow-sm"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

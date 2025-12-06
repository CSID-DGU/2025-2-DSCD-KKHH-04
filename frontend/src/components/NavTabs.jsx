// src/components/NavTabs.jsx
import React, { useState } from "react";

export default function NavTabs({ rightSlot = null, onTabClick = null }) {
  const tabs = ["실시간 인식", "대화 로그", "고객 메모", "시스템 상태"];
  const [active, setActive] = useState(0);

  const handleClick = (i) => {
    setActive(i);
    if (onTabClick) onTabClick(i);  // ← 탭 클릭 시 외부에서 전달된 함수 실행
  };

  return (
    <nav className="w-full bg-white rounded-xl shadow-sm border border-slate-200 px-3 pb-3">
      <div className="flex items-start justify-between gap-4">
        
        {/* 왼쪽 탭 메뉴 */}
        <ul className="flex flex-wrap gap-6 mt-2">
          {tabs.map((t, i) => (
            <li key={t}>
              <button
                onClick={() => handleClick(i)}
                className={
                  "px-4 py-2 rounded-lg text-sm sm:text-base " +
                  (active === i
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100")
                }
              >
                {t}
              </button>
            </li>
          ))}
        </ul>

        {/* 오른쪽 슬롯 */}
        <div className="mt-2">{rightSlot}</div>
      </div>
    </nav>
  );
}

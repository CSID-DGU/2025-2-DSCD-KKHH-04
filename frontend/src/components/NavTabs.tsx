// src/components/NavTabs.tsx
import React from "react";

interface NavTabsProps {
  rightSlot?: React.ReactNode;
  onTabClick?: (index: number) => void;
}

export default function NavTabs({
  rightSlot = null,
  onTabClick,
}: NavTabsProps) {
  const tabs = ["실시간 인식", "대화 로그", "고객 메모", "시스템 상태"];
  const [active, setActive] = React.useState<number>(0);

  const handleClick = (i: number) => {
    setActive(i);
    if (onTabClick) {
      onTabClick(i); // ✅ 이제 TS가 함수인 걸 안다
    }
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

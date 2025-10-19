import React from "react";

export default function TopBar() {
  return (
    <header className="w-full bg-[#264a73] text-white">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
        {/* 좌측: 로고/서비스명 */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-white/15 flex items-center justify-center text-lg font-bold">
            S
          </div>
          <div className="leading-tight">
            <div className="text-sm opacity-90">Signance</div>
            <div className="text-[11px] opacity-75">
              청각장애인의 금융 접근성을 위한 수어 중심 양방향 금융 상담 서비스
            </div>
          </div>
        </div>
        {/* 우측: 알림/메뉴/로그인 */}
        <nav className="flex items-center gap-6 text-sm">
          <a className="hover:underline" href="#">실시간 인식</a>
          <a className="hover:underline" href="#">대화 로그</a>
          <a className="hover:underline" href="#">고객 메모</a>
          <a className="hover:underline" href="#">시스템 상태</a>
          <div className="flex items-center gap-3">
            <button className="relative">
              <span className="sr-only">알림</span>
              <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center">🔔</div>
            </button>
            <button className="h-8 px-3 rounded-md bg-white/10 hover:bg-white/15">
              로그인
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}

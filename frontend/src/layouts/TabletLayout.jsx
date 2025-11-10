// src/layouts/TabletLayout.jsx
import { Outlet } from "react-router-dom";

/* 상단 네이비바 */
function TopNav() {
  return (
    <header className="h-14 bg-[#2b5486] text-white flex items-center px-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-white text-[#2b5486] grid place-items-center font-bold">S</div>
        <div className="text-sm sm:text-base font-medium">
          Signance : 청각장애인의 금융 접근성을 위한 수어 중심 양방향 금융 상담 서비스
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button className="p-2 rounded-lg hover:bg-white/10" title="도움말">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
          </svg>
        </button>
        <button className="p-2 rounded-lg hover:bg-white/10" title="로그인">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>
          </svg>
        </button>
      </div>
    </header>
  );
}

function FooterNote() {
  return (
    <footer className="text-xs text-slate-400 text-center py-4">
      Demo UI • 모든 텍스트/영상은 예시입니다.
    </footer>
  );
}

export default function TabletLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      <TopNav />
      <main className="flex-1 container mx-auto p-4">
        <Outlet />
      </main>
      <FooterNote />
    </div>
  );
}




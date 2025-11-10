// src/layouts/DesktopLayout.jsx
import { Outlet } from "react-router-dom";

export default function DesktopLayout() {
  return (
    // ✅ 이제 전체 배경이 화면 끝까지 확장됨
    <div className="min-h-screen bg-transparent text-slate-800">
      <TopBar />
      <main className="pt-16 pb-5"> 
        <Outlet />
      </main>
    </div>
  );
}

function TopBar() {
  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-[#2b5486] text-white shadow-md">
      <div className="h-full flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 grid place-items-center font-bold">
            S
          </div>
          <div className="text-sm sm:text-base font-medium">
            Signance : 청각장애인의 금융 접근성을 위한 수어 중심 양방향 금융 상담 서비스
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <button className="opacity-90 hover:opacity-100">↪ 로그인</button>
        </div>
      </div>
    </header>
  );
}

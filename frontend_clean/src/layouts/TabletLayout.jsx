// src/layouts/TabletLayout.jsx
import { Outlet, useNavigate, useLocation } from "react-router-dom";

function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const isHome = location.pathname === "/"; // 메인 여부

  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-[#2b5486] text-white shadow-md">
      <div className="h-full flex items-center justify-between px-4">
        {/* 왼쪽: 뒤로가기 + 로고 */}
        <div className="flex items-center gap-3">
          {!isHome && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-1.5 rounded-full hover:bg-white/10 border border-white/30 flex items-center justify-center"
              title="뒤로가기"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}

          {/* 로고 + 서비스 이름 */}
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <div className="w-8 h-8 rounded-full bg-white/20 grid place-items-center font-bold">
              S
            </div>
            <div className="text-sm sm:text-base font-medium">
              Signance : 청각장애인의 금융 접근성을 위한 수어 중심 양방향 금융 상담 서비스
            </div>
          </div>
        </div>

        {/* 오른쪽 삭제됨 → 로그인/회원가입 제거 완료 */}
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
      <main className="pt-16 pb-5">
        {/* pt-16 추가 → fixed header 공간 확보 */}
        <Outlet />
      </main>
      <FooterNote />
    </div>
  );
}

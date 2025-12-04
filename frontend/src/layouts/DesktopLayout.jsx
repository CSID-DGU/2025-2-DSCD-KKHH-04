// src/layouts/DesktopLayout.jsx
import React, { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";

export default function DesktopLayout() {
  return (
    <div className="min-h-screen bg-transparent text-slate-800">
      <TopBar />
      <main className="pt-16 pb-5">
        <Outlet />
      </main>
    </div>
  );
}

function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);

  const isHome = location.pathname === "/"; // 메인 화면 여부

  useEffect(() => {
    const stored = localStorage.getItem("signanceUser");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch (e) {
        console.error("signanceUser 파싱 에러:", e);
        setUser(null);
      }
    } else {
      setUser(null);
    }
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem("signanceUser");
    setUser(null);
    navigate("/");
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-[#2b5486] text-white shadow-md">
      <div className="h-full flex items-center justify-between px-4">
        {/* 왼쪽: (조건부) 뒤로가기 + 로고/문구 */}
        <div className="flex items-center gap-3">
          {/* 메인이 아닐 때만 뒤로가기 버튼 표시 */}
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

          {/* S 로고 + 서비스 이름 (클릭 시 홈으로) */}
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <div className="w-8 h-8 rounded-full bg-white/20 grid place-items-center font-bold">
              S
            </div>
            <div className="text-sm sm:text-base font-medium">
              Signance : 청각장애인의 금융 접근성을 위한 수어 중심 양방향 금융 상담
              서비스
            </div>
          </div>
        </div>

        {/* 오른쪽 로그인 영역 */}
        {user ? (
          <div className="flex items-center gap-3 text-base">
            <span className="font-medium">{user.name}님</span>
            <button
              onClick={handleLogout}
              className="px-3 py-1 rounded-md bg-white/0 border border-white/60 hover:bg-white/10 transition-colors"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-base">
            <button
              onClick={() => navigate("/login")}
              className="opacity-90 hover:opacity-100"
            >
              ↪ 로그인
            </button>
            <button
              onClick={() => navigate("/signup")}
              className="bg-white text-[#2b5486] px-3 py-1 rounded-md font-medium hover:bg-slate-100 transition"
            >
              회원가입
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

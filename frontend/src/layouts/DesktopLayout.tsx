// src/layouts/DesktopLayout.tsx
import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";

type SignanceUser = {
  name: string;
  // 필요하면 여기 role, email 등도 추가 가능
  // role?: string;
};

export default function DesktopLayout() {
  return (
    <div className="min-h-screen bg-transparent text-slate-800">
      <TopBar />
      {/* 가로 꽉 채우기용: w-full + max-w-none */}
      <main className="pt-16 pb-5 w-full max-w-none">
        <Outlet />
      </main>
    </div>
  );
}

function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ user를 명시적으로 SignanceUser | null 로 선언
  const [user, setUser] = useState<SignanceUser | null>(null);

  const isHome = location.pathname === "/";

  useEffect(() => {
    const stored = localStorage.getItem("signanceUser");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<SignanceUser>;

        // name이 없을 수도 있으니까 방어 코드 한번
        if (parsed && typeof parsed.name === "string") {
          setUser({ name: parsed.name });
        } else {
          setUser(null);
        }
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

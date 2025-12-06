// src/pages/signup-type.jsx
import { useNavigate } from "react-router-dom";

export default function SignUpTypePage() {
  const nav = useNavigate();
  const bannerSrc = `${import.meta.env.BASE_URL}signance-banner.jpg`;

  return (

    <div className="min-h-[calc(100vh-56px)] flex flex-col bg-gradient-to-b from-[#f5f9fc] to-[#eaf3fb]">
      {/* 상단 문구 */}
      <div className="text-center mt-14 mb-3">
        <p className="text-xl md:text-2xl text-slate-700 font-semibold mb-2">
          먼저 서비스에서 사용하실 회원 유형을 선택해 주세요.
        </p>
        <p className="text-3xl md:text-5xl font-extrabold text-[#1f3b63] leading-snug">
          회원 유형 선택
        </p>
      </div>

      {/* 배너: main.jsx와 동일 구조 */}
      <div className="w-full mt-8 mb-8">
        <img
          src={bannerSrc}
          alt="Signance banner"
          className="w-full max-h-60 md:max-h-64 object-cover"
        />
      </div>

      {/* 카드 영역: main.jsx와 동일 레이아웃 */}
      <div className="w-full max-w-[80%] mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 mt-10 pb-10">
        <RoleCard
  label="은행원"
  emoji="👩🏻‍💼"
  description={
    <>
      지점 창구에서 청각장애인 고객과<br />
      수어 기반 상담을 진행합니다.
    </>
  }
  colorFrom="from-[#e3f2fd]"
  colorTo="to-[#bbdefb]"
  onClick={() => nav("/signup/banker")}
/>
        <RoleCard
  label="고객"
  emoji="🙋🏻‍♂️"
  description={
    <>
      수어 영상으로 상담을 요청하고,<br />
      텍스트·자막으로 안내를 받습니다.
    </>
  }
  colorFrom="from-[#fff8e1]"
  colorTo="to-[#ffe082]"
  onClick={() => nav("/signup/customer")}
/>
      </div>
    </div>
  );
}

/* 카드 컴포넌트 */
function RoleCard({ label, emoji, description, colorFrom, colorTo, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer bg-gradient-to-br ${colorFrom} ${colorTo}
      rounded-3xl p-8 min-h-[260px] shadow-md hover:shadow-2xl hover:scale-105
      transition-all duration-300 flex flex-col items-center justify-center text-center`}
    >
      <div className="text-5xl bg-white/70 p-4 rounded-full mb-3">
        {emoji}
      </div>
      <div className="text-[1.9rem] md:text-[2.1rem] font-bold text-[#1f3b63] mt-1">
        {label}
      </div>
      <p className="mt-3 text-sm md:text-base text-slate-700 leading-relaxed max-w-xs">
        {description}
      </p>
    </button>
  );
}

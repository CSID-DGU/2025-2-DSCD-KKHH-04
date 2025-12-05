// src/pages/main.tsx
import { useNavigate } from "react-router-dom";

type RoleCardProps = {
  label: string;
  emoji: string;
  colorFrom: string;
  colorTo: string;
  onClick: () => void;
};

export default function MainIndex() {
  const nav = useNavigate();
  const bannerSrc = `${import.meta.env.BASE_URL}signance-banner.jpg`;

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col bg-gradient-to-b from-[#f5f9fc] to-[#eaf3fb]">
      {/* 상단 문구 */}
      <div className="text-center mt-14 mb-3">
        <p className="text-xl md:text-2xl text-slate-700 font-semibold mb-2">
          음성과 수어를 잇는 금융 상담, 누구에게나 쉽게 다가가는 Signance
        </p>
        <p className="text-3xl md:text-5xl font-extrabold text-[#1f3b63] leading-snug">
          청각장애인의 금융 접근성을 위한 <br className="sm:hidden" />
          수어 중심 양방향 금융 상담 서비스
        </p>
      </div>

      {/* 배너 */}
      <div className="w-full mt-8 mb-8">
        <img
          src={bannerSrc}
          alt="Signance banner"
          className="w-full max-h-60 md:max-h-64 object-cover"
        />
      </div>

      {/* 역할 선택 */}
      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-10 mt-10 pb-10">
        <RoleCard
          label="은행원"
          emoji="👩🏻‍💼"
          colorFrom="from-[#e3f2fd]"
          colorTo="to-[#bbdefb]"
          onClick={() => nav("/banker")}
        />
        <RoleCard
          label="고객"
          emoji="🙋🏻‍♂️"
          colorFrom="from-[#fff8e1]"
          colorTo="to-[#ffe082]"
          onClick={() => nav("/deaf")}
        />
      </div>
    </div>
  );
}

/* 카드 컴포넌트 */
function RoleCard({
  label,
  emoji,
  colorFrom,
  colorTo,
  onClick,
}: RoleCardProps) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer bg-gradient-to-br ${colorFrom} ${colorTo}
      rounded-3xl p-8 min-h-[260px] shadow-md hover:shadow-2xl hover:scale-105
      transition-all duration-300 flex flex-col items-center justify-center`}
    >
      <div className="text-5xl bg-white/70 p-4 rounded-full mb-3">
        {emoji}
      </div>
      <div className="text-[2.3rem] md:text-[2.6rem] font-bold text-[#1f3b63] mt-1">
        {label}
      </div>
    </div>
  );
}

// frontend_clean/src/pages/Deaf/index.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, MessageSquare } from "lucide-react";

const SESSION_KEY = "signanceSessionId";

export default function DeafIndex() {
  const nav = useNavigate();
  const backgroundImg = `${import.meta.env.BASE_URL}background.png`;
  const logoImg = `${import.meta.env.BASE_URL}logo.jpg`;
  const deafImg = `${import.meta.env.BASE_URL}deaf.jpg`;

  // 페이지 들어오자마자 팝업 보이게
  const [showPopup, setShowPopup] = useState(true);

  // 메인 패널 스타일
  const panel =
    "mx-auto w-full max-w-5xl rounded-3xl bg-white/90 border border-blue-200/60 " +
    "shadow-[0_8px_40px_rgba(30,64,175,0.12)] px-16 py-10 sm:px-20 sm:py-12 " +
    "backdrop-blur-sm text-center";

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#f5f9fc] to-[#eaf3fb]">
      {/* 팝업 */}
      {showPopup && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-10 w-[550px] shadow-2xl relative">
            {/* 닫기 버튼 */}
            <button
              onClick={() => setShowPopup(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-black text-2xl"
            >
              ✕
            </button>

            {/* 수어 영상 자리 (비워둔 상태) */}
            <div className="w-full h-80 bg-gray-200 rounded-xl flex items-center justify-center mb-6">
              <span className="text-gray-500">[수어 영상 자리]</span>
            </div>

            {/* 안내 문구 */}
            <p className="text-xl font-semibold text-center text-[#1f3b63] leading-relaxed">

              안녕하세요 고객님
              <br />
              확인을 위해 신분증을 주세요
            </p>
          </div>
        </div>
      )}

      {/* 배경 이미지 */}
      <div
        aria-hidden
        className="fixed inset-0 z-0 bg-cover bg-top bg-no-repeat opacity-40"
        style={{
          backgroundImage: `url(${backgroundImg})`,
          backgroundPositionY: "-100px",
        }}
      />

      <main className="relative z-10 flex flex-col items-center mt-16">
        {/* 로고 */}
        <img
          src={logoImg}
          alt="Signance 로고"
          className="w-64 h-auto mb-10 object-contain"
        />

        <div className={panel}>
          {/* 일러스트 + 제목 */}
          <div className="flex flex-col items-center mb-10">
            <div className="bg-[#e3f2fd] p-5 rounded-full mb-5 shadow-inner mt-4">
              {/* 타원형 컨테이너 */}
              <div className="w-40 h-44 rounded-[50%/55%] overflow-hidden">
                <img
                  src={deafImg}
                  alt="고객(청각장애인) 일러스트"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <h2 className="text-[2.5rem] font-extrabold text-[#1f3b63]">
              고객 전용 화면
            </h2>
          </div>

          {/* 버튼 두 개 */}
          <div className="flex justify-center gap-10 mt-8">
            {/* 은행원에게 메시지 보내기 = DeafSend로 이동 */}
            <button
              onClick={() => nav("/deaf/send")}
              className="flex items-center gap-3 bg-[#2b5486] text-white px-10 py-5 rounded-2xl shadow-md hover:bg-[#24436e] transition-all text-lg font-semibold"
            >
              <Send size={22} />
              은행원에게 메시지 보내기
            </button>

            {/* 은행원 응답 확인하기 = DeafReceive로 이동 */}
            <button
              onClick={() => nav("/deaf/receive")}
              className="flex items-center gap-3 bg-white border border-[#2b5486] text-[#2b5486] px-10 py-5 rounded-2xl shadow-md hover:bg-blue-50 transition-all text-lg font-semibold"
            >
              <MessageSquare size={22} />
              은행원 응답 확인하기
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

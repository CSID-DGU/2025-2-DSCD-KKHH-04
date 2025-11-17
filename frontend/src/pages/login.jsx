import React from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-gray-100 to-gray-300 flex justify-center items-start pt-24 px-10">


      {/* 카드 전체 */}
      <div className="w-full max-w-6xl min-h-[620px] bg-white rounded-2xl shadow-lg flex flex-col md:flex-row overflow-hidden">
        {/* 왼쪽 문구 영역 */}
        <section className="hidden md:flex flex-1 flex-col justify-center px-20 py-24 bg-gradient-to-br from-sky-50 via-white to-sky-100 border-r border-slate-200">
          <p className="text-slate-700 text-5xl leading-snug font-light">
            금융 상담을
            <br />
            더 정확하고.
            <br />
            편리하게.
          </p>

          <p className="mt-14 text-4xl text-slate-900">
            <span className="italic font-semibold">Signance</span>
            <span className="ml-1">가 함께합니다.</span>
          </p>
        </section>

        {/* 오른쪽 로그인 영역 */}
        <section className="w-full md:w-[520px] pl-10 pt-8 pr-14 py-16 flex flex-col justify-center">

          {/* 로고 이미지 */}
          <div className="flex flex-col items-start mb-10 -ml-8 -mt-6">
    <img
      src="/logotitle.jpg"
      alt="Signance Logo"
      className="w-[480px] max-w-full object-contain"
            />
          </div>

          {/* 로그인 폼 */}
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            {/* ID */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                ID
              </label>
              <input
                type="text"
                className="w-full h-14 rounded-lg border border-slate-300 px-4 text-base
                           focus:outline-none focus:ring-2 focus:ring-[#2b5486]/40 focus:border-[#2b5486]"
                placeholder="ID를 입력하세요"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <input
                type="password"
                className="w-full h-14 rounded-lg border border-slate-300 px-4 text-base
                           focus:outline-none focus:ring-2 focus:ring-[#2b5486]/40 focus:border-[#2b5486]"
                placeholder="비밀번호를 입력하세요"
              />
            </div>

            {/* 아이디 저장 */}
            <label className="flex items-center gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-[#2b5486] focus:ring-0"
              />
              <span>아이디 저장</span>
            </label>

            {/* 로그인 버튼 */}
            <button
              type="submit"
              className="mt-4 w-full h-14 rounded-lg border border-[#2b5486] text-base font-semibold 
                         text-[#2b5486] hover:bg-[#2b5486] hover:text-white transition-colors"
            >
              로그인
            </button>
          </form>

          {/* 회원가입/찾기 */}
          <div className="mt-8 flex items-center justify-center gap-6 text-base text-slate-500">
            <button
              type="button"
              onClick={() => navigate("/signup")}
              className="hover:text-[#2b5486]"
            >
              회원가입하기
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={() => navigate("/find-account")}
              className="hover:text-[#2b5486]"
            >
              아이디 / 비밀번호 찾기
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

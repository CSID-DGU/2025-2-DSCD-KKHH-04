import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, MessageSquare } from "lucide-react";

export default function BankerIndex() {
  const nav = useNavigate();
  const backgroundImg = `${import.meta.env.BASE_URL}background.png`;
  const logoImg = `${import.meta.env.BASE_URL}logo.jpg`;
  const bankerImg = `${import.meta.env.BASE_URL}banker.jpg`;

  const [showPopup, setShowPopup] = useState(true);

  const [name, setName] = useState("");

  // 생년월일 분리 입력
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");

  // 전화번호 분리 입력
  const [phone1, setPhone1] = useState("");
  const [phone2, setPhone2] = useState("");
  const [phone3, setPhone3] = useState("");

  const panel =
    "mx-auto w-full max-w-5xl rounded-3xl bg-white/90 border border-blue-200/60 " +
    "shadow-[0_8px_40px_rgba(30,64,175,0.12)] p-14 sm:p-16 backdrop-blur-sm text-center";

  // 숫자만 입력되게 간단 필터
  const onlyDigits = (value) => value.replace(/\D/g, "");

  const saveCustomerInfo = () => {
    const birth = `${birthYear}-${birthMonth}-${birthDay}`;
    const phone = `${phone1}-${phone2}-${phone3}`;

    localStorage.setItem(
      "customerInfo",
      JSON.stringify({ name, birth, phone })
    );

    // 팝업 닫고 바로 상담 화면으로 이동
    setShowPopup(false);
    nav("/banker/send");
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#f5f9fc] to-[#eaf3fb]">
      {/* ===== 팝업 ===== */}
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

            {/* 안내 문구 */}
            <p className="text-2xl font-bold text-center mb-6 text-[#1f3b63] leading-relaxed">
              신분증을 확인 후 고객 정보를 입력해주세요
            </p>

            {/* 입력 폼 */}
            <div className="flex flex-col gap-4">
              {/* 고객 이름 */}
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">
                  고객 이름
                </span>
                <input
                  type="text"
                  placeholder="고객 성함을 입력하세요"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border rounded-xl p-3 text-lg"
                />
              </div>

              {/* 생년월일: YYYY-MM-DD */}
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">
                  생년월일
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="YYYY"
                    maxLength={4}
                    value={birthYear}
                    onChange={(e) =>
                      setBirthYear(onlyDigits(e.target.value))
                    }
                    className="w-24 border rounded-xl p-3 text-lg text-center"
                  />
                  <span className="text-xl">-</span>
                  <input
                    type="text"
                    placeholder="MM"
                    maxLength={2}
                    value={birthMonth}
                    onChange={(e) =>
                      setBirthMonth(onlyDigits(e.target.value))
                    }
                    className="w-16 border rounded-xl p-3 text-lg text-center"
                  />
                  <span className="text-xl">-</span>
                  <input
                    type="text"
                    placeholder="DD"
                    maxLength={2}
                    value={birthDay}
                    onChange={(e) =>
                      setBirthDay(onlyDigits(e.target.value))
                    }
                    className="w-16 border rounded-xl p-3 text-lg text-center"
                  />
                </div>
              </div>

              {/* 전화번호: 010-1234-5678 */}
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">
                  연락처
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="010"
                    maxLength={3}
                    value={phone1}
                    onChange={(e) =>
                      setPhone1(onlyDigits(e.target.value))
                    }
                    className="w-20 border rounded-xl p-3 text-lg text-center"
                  />
                  <span className="text-xl">-</span>
                  <input
                    type="text"
                    placeholder="1234"
                    maxLength={4}
                    value={phone2}
                    onChange={(e) =>
                      setPhone2(onlyDigits(e.target.value))
                    }
                    className="w-24 border rounded-xl p-3 text-lg text-center"
                  />
                  <span className="text-xl">-</span>
                  <input
                    type="text"
                    placeholder="5678"
                    maxLength={4}
                    value={phone3}
                    onChange={(e) =>
                      setPhone3(onlyDigits(e.target.value))
                    }
                    className="w-24 border rounded-xl p-3 text-lg text-center"
                  />
                </div>
              </div>
            </div>

            {/* 저장 버튼 */}
            <button
              onClick={saveCustomerInfo}
              className="w-full bg-[#2b5486] text-white py-4 rounded-2xl mt-6 text-lg font-semibold hover:bg-[#24436e]"
            >
              입력 완료
            </button>
          </div>
        </div>
      )}

      {/* ===== 배경 이미지 ===== */}
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
          <div className="flex flex-col items-center mb-10">
            <div className="bg-[#e3f2fd] p-5 rounded-full mb-5 shadow-inner">
              <img
                src={bankerImg}
                alt="은행원 일러스트"
                className="w-40 h-auto rounded-full object-cover"
              />
            </div>
            <h2 className="text-[2.5rem] font-extrabold text-[#1f3b63]">
              은행원 전용 화면
            </h2>
          </div>

          {/* 버튼 */}
          <div className="flex justify-center gap-10 mt-8">
            <button
              onClick={() => nav("/banker/send")}
              className="flex items-center gap-3 bg-[#2b5486] text-white px-10 py-5 rounded-2xl shadow-md hover:bg-[#24436e] transition-all text-lg font-semibold"
            >
              <Send size={22} />
              고객에게 메시지 보내기
            </button>

            <button
              onClick={() => nav("/banker/receive")}
              className="flex items-center gap-3 bg-white border border-[#2b5486] text-[#2b5486] px-10 py-5 rounded-2xl shadow-md hover:bg-blue-50 transition-all text-lg font-semibold"
            >
              <MessageSquare size={22} />
              고객 응답 확인하기
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

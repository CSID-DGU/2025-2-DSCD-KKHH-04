import { useNavigate } from "react-router-dom";
import { Send, MessageSquare } from "lucide-react"; // ✅ 추가

export default function BankerIndex() {
  const nav = useNavigate();
  const backgroundImg = `${import.meta.env.BASE_URL}background.png`;
  const logoImg = `${import.meta.env.BASE_URL}logo.jpg`;
  const bankerImg = `${import.meta.env.BASE_URL}banker.jpg`;

  const panel =
    "mx-auto w-full max-w-5xl rounded-3xl bg-white/90 border border-blue-200/60 " +
    "shadow-[0_8px_40px_rgba(30,64,175,0.12)] p-14 sm:p-16 backdrop-blur-sm text-center";

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#f5f9fc] to-[#eaf3fb]">
      <div
        aria-hidden
        className="fixed inset-0 z-0 bg-cover bg-top bg-no-repeat opacity-40"
        style={{ backgroundImage: `url(${backgroundImg})`, backgroundPositionY: "-100px", }}
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

// src/pages/ProfileEdit.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ProfileEdit() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); // 비밀번호는 선택 입력

  // 🔹 추가: 고객 프로필 관련 필드
  const [phone, setPhone] = useState("");
  const [contactMethod, setContactMethod] = useState("kakao");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("signanceUser");
    if (!saved) {
      setErrorMsg("로그인 정보가 없습니다. 다시 로그인해주세요.");
      return;
    }

    try {
      const parsed = JSON.parse(saved);
      setUser(parsed);
      setName(parsed.name || "");
      setEmail(parsed.email || "");

      // localStorage에 이런 값이 나중에 들어오면 그대로 사용
      setBankName(parsed.bank_name || "");
      setAccountNumber(parsed.account_number || "");

      if (parsed.phone) setPhone(parsed.phone);
      if (parsed.contact_method) setContactMethod(parsed.contact_method);
    } catch (e) {
      console.error(e);
      setErrorMsg("저장된 사용자 정보를 불러오지 못했습니다.");
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setMsg("");

    if (!user) {
      setErrorMsg("로그인 정보가 없습니다.");
      return;
    }

    if (!name || !email) {
      setErrorMsg("이름과 이메일은 필수입니다.");
      return;
    }

    try {
      setIsLoading(true);

      const res = await fetch(
        "http://127.0.0.1:8000/api/accounts/profile/update/",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: user.id,
            name,
            email,
            password: password || undefined, // 비밀번호는 빈문자면 안 넘김

            // 🔹 CustomerProfile + 은행 정보
            phone: phone || undefined,
            contactMethod: contactMethod || undefined,
            bank_name: bankName || undefined,
            account_number: accountNumber || undefined,
          }),
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.error || "회원정보 수정에 실패했습니다.";
        setErrorMsg(msg);
        return;
      }

      // 수정된 user 정보 localStorage에 반영
      if (data?.user) {
        localStorage.setItem("signanceUser", JSON.stringify(data.user));
        setUser(data.user);
      }

      setMsg("회원정보가 성공적으로 수정되었습니다.");
    } catch (err) {
      console.error(err);
      setErrorMsg("서버와의 통신 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!user && !errorMsg) {
    // 첫 로딩 중
    return (
      <div className="w-full min-h-screen flex items-center justify-center">
        <p className="text-slate-600">사용자 정보를 불러오는 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-gray-100 to-gray-300 flex justify-center items-start pt-24 px-10">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg p-10">
        <h1 className="text-2xl mb-6 text-slate-900">회원정보 수정</h1>

        {errorMsg && (
          <p className="mb-4 text-sm text-red-500 whitespace-pre-line">
            {errorMsg}
          </p>
        )}
        {msg && (
          <p className="mb-4 text-sm text-emerald-600 whitespace-pre-line">
            {msg}
          </p>
        )}

        <form className="space-y-6" onSubmit={handleSubmit}>
          {/* 기본 정보 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              이름
            </label>
            <input
              type="text"
              className="w-full h-12 rounded-lg border border-slate-300 px-4 text-base
                         focus:outline-none focus:ring-2 focus:ring-[#2b5486]/40 focus:border-[#2b5486]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름을 입력해주세요."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              이메일(ID)
            </label>
            <input
              type="email"
              className="w-full h-12 rounded-lg border border-slate-300 px-4 text-base
                         focus:outline-none focus:ring-2 focus:ring-[#2b5486]/40 focus:border-[#2b5486]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일을 입력해주세요."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              새 비밀번호 (선택)
            </label>
            <input
              type="password"
              className="w-full h-12 rounded-lg border border-slate-300 px-4 text-base
                         focus:outline-none focus:ring-2 focus:ring-[#2b5486]/40 focus:border-[#2b5486]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="변경하지 않으려면 빈 칸으로 두세요."
            />
          </div>

          {/* 🔹 추가: 고객 프로필 영역 */}
          <hr className="my-4 border-slate-200" />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              연락처
            </label>
            <input
              type="text"
              className="w-full h-12 rounded-lg border border-slate-300 px-4 text-base
                         focus:outline-none focus:ring-2 focus:ring-[#2b5486]/40 focus:border-[#2b5486]"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="예: 010-1234-5678"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              연락 수단
            </label>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="contactMethod"
                  value="kakao"
                  checked={contactMethod === "kakao"}
                  onChange={(e) => setContactMethod(e.target.value)}
                />
                카카오톡
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="contactMethod"
                  value="sms"
                  checked={contactMethod === "sms"}
                  onChange={(e) => setContactMethod(e.target.value)}
                />
                문자 메시지
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="contactMethod"
                  value="email"
                  checked={contactMethod === "email"}
                  onChange={(e) => setContactMethod(e.target.value)}
                />
                이메일
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              거래 은행
            </label>
            <input
              type="text"
              className="w-full h-12 rounded-lg border border-slate-300 px-4 text-base
                         focus:outline-none focus:ring-2 focus:ring-[#2b5486]/40 focus:border-[#2b5486]"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="예: OO은행"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              계좌번호
            </label>
            <input
              type="text"
              className="w-full h-12 rounded-lg border border-slate-300 px-4 text-base
                         focus:outline-none focus:ring-2 focus:ring-[#2b5486]/40 focus:border-[#2b5486]"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="예: 1002-123-456789"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="h-11 px-6 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="h-11 px-8 rounded-lg border border-[#2b5486] text-[#2b5486] font-semibold
                         hover:bg-[#2b5486] hover:text-white transition-colors
                         disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? "저장 중..." : "저장하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

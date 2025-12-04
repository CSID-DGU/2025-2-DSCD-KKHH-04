// src/pages/signup-customer.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = "http://127.0.0.1:8000";

// ================== 스타일 공통 (은행원이랑 동일) ==================
const styles = {
  page: {
    display: "flex",
    backgroundColor: "#f3f5f9",
    minHeight: "calc(100vh - 56px)",
    fontFamily:
      "Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', sans-serif",
  },
  mainContent: {
    flex: 1,
    padding: "16px 40px 40px",
    maxWidth: 1480,
    margin: "0 auto",
    boxSizing: "border-box",
  },
  formWrapper: {
    position: "relative",
    backgroundColor: "#ffffff",
    padding: "28px 32px 32px",
    borderRadius: 10,
    border: "1px solid #d4d9e6",
    boxShadow: "0 6px 20px rgba(15, 35, 52, 0.08)",
    minHeight: 380,
    boxSizing: "border-box",
  },
  bottomButton: {
    display: "block",
    width: "100%",
    maxWidth: 420,
    margin: "28px auto 0",
    padding: "13px 0",
    backgroundColor: "#2b5486",
    color: "#ffffff",
    border: "none",
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
};

// ================== StepIndicator (그대로 복붙) ==================
function StepIndicator({ currentStep = 3 }) {
  const steps = [
    "사용자 유형 선택",
    "약관 동의 및 안내",
    "기본 정보 입력",
    "추가 정보 입력",
    "회원가입 완료",
  ];
  const cols = steps.length * 2 - 1;
  const connectorColors = ["#d5e0f0", "#b9c9e4", "#90a7d0", "#5f80b8"];

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 980,
        margin: "8px auto 24px",
        padding: "0 8px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          rowGap: 8,
          alignItems: "center",
        }}
      >
        {steps.map((label, i) => {
          const col = i * 2 + 1;
          const stepNum = i + 1;

          return (
            <React.Fragment key={`step-${stepNum}`}>
              <div
                style={{
                  gridColumn: col,
                  gridRow: 1,
                  justifySelf: "center",
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    border: "2px solid #2b5486",
                    fontSize: 14,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxSizing: "border-box",
                    backgroundColor: "#2b5486",
                    color: "#ffffff",
                  }}
                >
                  {stepNum}
                </div>
              </div>

              <div
                style={{
                  gridColumn: col,
                  gridRow: 2,
                  justifySelf: "center",
                  whiteSpace: "nowrap",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#2b3a55",
                  textAlign: "center",
                }}
              >
                {label}
              </div>
            </React.Fragment>
          );
        })}

        {steps.slice(0, -1).map((_, i) => {
          const col = i * 2 + 2;
          const color =
            connectorColors[i] || connectorColors[connectorColors.length - 1];

          return
            <div
              key={`conn-${i}`}
              style={{
                gridColumn: col,
                gridRow: 1,
                height: 3,
                borderRadius: 999,
                backgroundColor: color,
              }}
            />;
        })}
      </div>
    </div>
  );
}

// ================== 공통 FormRow/스타일 (은행원이랑 동일) ==================
function FormRow({ label, children }) {
  return (
    <div
      style={{
        display: "flex",
        marginBottom: 12,
        alignItems: "stretch",
      }}
    >
      <div
        style={{
          width: 140,
          backgroundColor: "#f3f5fa",
          padding: 12,
          border: "1px solid #d4d9e6",
          fontWeight: 600,
          fontSize: 14,
          color: "#344767",
          boxSizing: "border-box",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle = {
  flex: 1,
  padding: 12,
  border: "1px solid #d4d9e6",
  borderLeft: "none",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const phoneBoxStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "0 10px",
  border: "1px solid #d4d9e6",
  borderLeft: "none",
  flex: 1,
  backgroundColor: "white",
  boxSizing: "border-box",
  height: 46,
};

const selectStyle = {
  width: 70,
  padding: 8,
  fontSize: 14,
  boxSizing: "border-box",
};

const phoneFieldStyle = {
  width: 80,
  padding: 8,
  fontSize: 14,
  boxSizing: "border-box",
};

const hyphenStyle = { fontSize: 14, color: "#6c7a92" };

// ================== 메인: 고객용 회원가입 ==================
export default function SignUpCustomerPage() {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  // 계정 정보
  const [email, setEmail] = useState(""); // 로그인 이메일
  const [password, setPassword] = useState(""); // 비밀번호
  const [passwordCheck, setPasswordCheck] = useState(""); // 비밀번호 확인
  const [contact, setContact] = useState("kakao");

  // 고객 정보
  const [name, setName] = useState("");
  const [phone0, setPhone0] = useState("010");
  const [phone1, setPhone1] = useState("");
  const [phone2, setPhone2] = useState("");

  // 계좌 정보
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email || !password || !name) {
      alert("이메일, 비밀번호, 이름은 필수입니다.");
      return;
    }

    if (password !== passwordCheck) {
      alert("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    const phone = `${phone0}-${phone1}-${phone2}`;

    const payload = {
      userType: "customer",
      name,
      email,
      password,
      phone,
      contactMethod: contact,
      bankName,
      accountNumber,
    };

    try {
      setLoading(true);

      const res = await fetch(`${API_BASE_URL}/api/accounts/signup/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "회원가입에 실패했습니다.");
        return;
      }

      alert("회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.");
      navigate("/login");
    } catch (e) {
      console.error(e);
      alert("서버와 통신 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.mainContent}>
        <StepIndicator currentStep={3} />

        <div style={styles.formWrapper}>
          {/* 계정 정보 */}
          <section style={{ marginBottom: 40, width: "100%" }}>
            <h3
              style={{
                fontSize: 18,
                marginBottom: 16,
                color: "#1f3b63",
                fontWeight: 700,
              }}
            >
              계정 정보
            </h3>

            <FormRow label="이메일">
              <input
                style={inputStyle}
                placeholder="이메일을 입력해주세요"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormRow>

            <FormRow label="비밀번호">
              <input
                style={inputStyle}
                type="password"
                placeholder="8자 이상으로 입력해주세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormRow>

            <FormRow label="비밀번호 확인">
              <input
                style={inputStyle}
                type="password"
                placeholder="다시 한 번 입력해주세요"
                value={passwordCheck}
                onChange={(e) => setPasswordCheck(e.target.value)}
              />
            </FormRow>

            <FormRow label="연락 수단">
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  padding: "0 12px",
                  border: "1px solid #d4d9e6",
                  borderLeft: "none",
                  backgroundColor: "#ffffff",
                  fontSize: 14,
                  boxSizing: "border-box",
                  height: 46,
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="radio"
                    name="contact"
                    value="kakao"
                    checked={contact === "kakao"}
                    onChange={(e) => setContact(e.target.value)}
                  />
                  카카오톡
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="radio"
                    name="contact"
                    value="sms"
                    checked={contact === "sms"}
                    onChange={(e) => setContact(e.target.value)}
                  />
                  문자 메시지
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="radio"
                    name="contact"
                    value="email"
                    checked={contact === "email"}
                    onChange={(e) => setContact(e.target.value)}
                  />
                  이메일
                </label>
              </div>
            </FormRow>
          </section>

          {/* 고객 정보 */}
          <section style={{ marginBottom: 24, width: "100%" }}>
            <h3
              style={{
                fontSize: 18,
                marginBottom: 16,
                color: "#1f3b63",
                fontWeight: 700,
              }}
            >
              고객 정보
            </h3>

            <FormRow label="이름">
              <input
                style={inputStyle}
                placeholder="이름을 입력해주세요"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FormRow>

            <FormRow label="연락처">
              <div style={phoneBoxStyle}>
                <select
                  style={selectStyle}
                  value={phone0}
                  onChange={(e) => setPhone0(e.target.value)}
                >
                  <option>010</option>
                  <option>011</option>
                  <option>012</option>
                </select>
                <span style={hyphenStyle}>-</span>
                <input
                  style={phoneFieldStyle}
                  placeholder="1234"
                  value={phone1}
                  onChange={(e) => setPhone1(e.target.value)}
                />
                <span style={hyphenStyle}>-</span>
                <input
                  style={phoneFieldStyle}
                  placeholder="5678"
                  value={phone2}
                  onChange={(e) => setPhone2(e.target.value)}
                />
              </div>
            </FormRow>
                        <FormRow label="은행명">
              <input
                style={inputStyle}
                placeholder="예: XX은행"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </FormRow>

            <FormRow label="계좌번호">
              <input
                style={inputStyle}
                placeholder="예: 1002-123-456789"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </FormRow>
            
          </section>
        </div>

        <button
          style={{
            ...styles.bottomButton,
            opacity: loading ? 0.6 : 1,
          }}
          disabled={loading}
          onClick={onSubmit}
        >
          {loading ? "처리 중..." : "가입하기"}
        </button>
      </div>
    </div>
  );
}

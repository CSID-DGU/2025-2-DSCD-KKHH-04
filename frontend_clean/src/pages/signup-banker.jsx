import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// ================== API 베이스 URL ==================
const API_BASE_URL = "http://127.0.0.1:8000";

// ================== 스타일 공통 ==================
const styles = {
  page: {
    display: "flex",
    backgroundColor: "#f3f5f9",
    minHeight: "calc(100vh - 56px)", // TopBar 높이만큼 뺀 영역
    fontFamily:
      "Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', sans-serif",
  },
  sidebar: {
    width: 200,
    paddingTop: 24,
    paddingLeft: 24,
    fontSize: 15,
    fontWeight: 600,
    color: "#1f3b63",
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

// ================== StepIndicator 컴포넌트 ==================
function StepIndicator({ currentStep = 3 }) {
  const steps = [
    "사용자 유형 선택",
    "약관 동의 및 안내",
    "기본 정보 입력",
    "추가 정보 입력",
    "회원가입 완료",
  ];
  const cols = steps.length * 2 - 1;

  // 왼쪽 → 오른쪽으로 점점 진해지는 선 색
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
              {/* 번호 동그라미 - 모두 동일 스타일 */}
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

              {/* 라벨 */}
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

        {/* 연결선 - 인덱스별 그라데이션 */}
        {steps.slice(0, -1).map((_, i) => {
          const col = i * 2 + 2;
          const color =
            connectorColors[i] || connectorColors[connectorColors.length - 1];

          return (
            <div
              key={`conn-${i}`}
              style={{
                gridColumn: col,
                gridRow: 1,
                height: 3,
                borderRadius: 999,
                backgroundColor: color,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ================== InstitutionInfo (계정 정보) ==================
function InstitutionInfo({
  insName,
  setInsName,
  insType,
  setInsType,
  insAddress,
  setInsAddress,
  contact,
  setContact,
}) {
  return (
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

      {/* 이메일 */}
      <FormRow label="이메일">
        <input
          style={inputStyle}
          placeholder="이메일을 입력해주세요"
          value={insName}
          onChange={(e) => setInsName(e.target.value)}
        />
      </FormRow>

      {/* 비밀번호 */}
      <FormRow label="비밀번호">
        <input
          style={inputStyle}
          type="password"
          placeholder="8자 이상으로 입력해주세요 (영문, 숫자, 특수문자 포함)"
          value={insType}
          onChange={(e) => setInsType(e.target.value)}
        />
      </FormRow>

      {/* 비밀번호 확인 */}
      <FormRow label="비밀번호 확인">
        <input
          style={inputStyle}
          type="password"
          placeholder="다시 한 번 입력해주세요"
          value={insAddress}
          onChange={(e) => setInsAddress(e.target.value)}
        />
      </FormRow>

      {/* 연락 수단 */}
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
  );
}

// ================== ManagerInfo (은행원 정보) ==================
function ManagerInfo({
  managerName,
  setManagerName,
  department,
  setDepartment,
  email,
  setEmail,
  phone0,
  setPhone0,
  phone1,
  setPhone1,
  phone2,
  setPhone2,
  userId,
  setUserId,
  password,
  setPassword,
}) {
  return (
    <section style={{ marginBottom: 24, width: "100%" }}>
      <h3
        style={{
          fontSize: 18,
          marginBottom: 16,
          color: "#1f3b63",
          fontWeight: 700,
        }}
      >
        은행원 정보
      </h3>

      {/* 담당자 이름 */}
      <FormRow label="담당자 이름">
        <input
          style={inputStyle}
          placeholder="이름을 입력해주세요"
          value={managerName}
          onChange={(e) => setManagerName(e.target.value)}
        />
      </FormRow>

      {/* 은행명 */}
      <FormRow label="은행명">
        <input
          style={inputStyle}
          placeholder="은행명을 입력해주세요"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        />
      </FormRow>

      {/* 소속 지점 */}
      <FormRow label="소속 지점">
        <input
          style={inputStyle}
          placeholder="소속 지점을 입력해주세요"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormRow>

      {/* 사내 이메일 */}
      <FormRow label="사내 이메일">
        <input
          style={inputStyle}
          placeholder="이메일을 입력해주세요"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
      </FormRow>

      {/* 업무 연락처 */}
      <FormRow label="업무 연락처">
        <div style={phoneBoxStyle}>
          <select
            style={selectStyle}
            value={phone0}
            onChange={(e) => setPhone0(e.target.value)}
          >
            <option>010</option>
            <option>011</option>
            <option>016</option>
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

      {/* 사번 */}
      <FormRow label="사번">
        <input
          style={inputStyle}
          placeholder="사번을 입력해주세요"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormRow>
    </section>
  );
}

// ================== 공통 FormRow/스타일 ==================
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
  padding: "0 10px", // 위/아래 0
  border: "1px solid #d4d9e6" ,
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

// ================== 메인 페이지 컴포넌트 ==================
export default function SignUpBankerPage() {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  // 계정 정보
  const [insName, setInsName] = useState(""); // 계정 이메일
  const [insType, setInsType] = useState(""); // 계정 비밀번호
  const [insAddress, setInsAddress] = useState(""); // 비밀번호 확인
  const [contact, setContact] = useState("kakao");

  // 은행원 정보
  const [managerName, setManagerName] = useState("");
  const [department, setDepartment] = useState(""); // 은행명
  const [email, setEmail] = useState(""); // 소속 지점
  const [phone0, setPhone0] = useState("010");
  const [phone1, setPhone1] = useState("");
  const [phone2, setPhone2] = useState("");
  const [userId, setUserId] = useState(""); // 사내 이메일 (로그인 ID로 사용)
  const [password, setPassword] = useState(""); // 사번

  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    // 간단한 필수값 체크
    if (!insName || !insType || !managerName || !userId) {
      alert("이메일, 비밀번호, 담당자 이름, 사내 이메일은 필수입니다.");
      return;
    }

    if (insType !== insAddress) {
      alert("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    const phone = `${phone0}-${phone1}-${phone2}`;

    // 백엔드에서 기대하는 필드 이름 중심으로 구성
    const payload = {
      userType: "banker",        // 현재 화면은 은행원 가입이므로 고정
      name: managerName,         // 담당자 이름
      email: userId,             // 사내 이메일을 로그인용 이메일로 사용
      password: insType,         // 계정 비밀번호
      phone,                     // "010-1234-5678" 형태

      employeeId: password,      // 사번
      branchName: email,         // 소속 지점

      // 나머지는 참고용으로 같이 보냄 (백엔드는 일단 무시해도 됨)
      institutionName: insName,
      institutionType: department,      // 여기선 은행명
      institutionAddress: insAddress,
      contactMethod: contact,
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
      navigate("/login"); // 로그인 페이지 경로에 맞게 수정
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
          <InstitutionInfo
            insName={insName}
            setInsName={setInsName}
            insType={insType}
            setInsType={setInsType}
            insAddress={insAddress}
            setInsAddress={setInsAddress}
            contact={contact}
            setContact={setContact}
          />
          <ManagerInfo
            managerName={managerName}
            setManagerName={setManagerName}
            department={department}
            setDepartment={setDepartment}
            email={email}
            setEmail={setEmail}
            phone0={phone0}
            setPhone0={setPhone0}
            phone1={phone1}
            setPhone1={setPhone1}
            phone2={phone2}
            setPhone2={setPhone2}
            userId={userId}
            setUserId={setUserId}
            password={password}
            setPassword={setPassword}
          />
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

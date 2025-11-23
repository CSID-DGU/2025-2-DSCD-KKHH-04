// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";

// 스타일 경로는 너 프로젝트 기준으로 맞춰줘
import "./style/index.css";

// 라우터 기본
import { BrowserRouter, Routes, Route } from "react-router-dom";

// 레이아웃
import DesktopLayout from "./layouts/DesktopLayout";

// 페이지들
import MainIndex from "./pages/main";
import Login from "./pages/login";
import SignUpTypePage from "./pages/signup-type";
import SignUpBankerPage from "./pages/signup-banker";
import SignUpCustomerPage from "./pages/signup-customer";

// PC (은행원)
import BankerIndex from "./pages/Banker/index";
import BankerSend from "./pages/Banker/Send";
import BankerReceive from "./pages/Banker/Receive";

// Tablet (농인)
import DeafIndex from "./pages/Deaf/index";
import DeafSend from "./pages/Deaf/Send";
import DeafReceive from "./pages/Deaf/Receive";

// 성능 대시보드
import PerformanceDashboard from "./pages/PerformanceDashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 공통 상단바가 있는 레이아웃 */}
        <Route element={<DesktopLayout />}>
          {/* 메인 */}
          <Route index element={<MainIndex />} />

          {/* 로그인 / 회원가입 */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUpTypePage />} />
          <Route path="/signup/banker" element={<SignUpBankerPage />} />
          <Route path="/signup/customer" element={<SignUpCustomerPage />} />

          {/* 은행원 화면 */}
          <Route path="/banker" element={<BankerIndex />} />
          <Route path="/banker/send" element={<BankerSend />} />
          <Route path="/banker/receive" element={<BankerReceive />} />

          {/* 농인 화면 */}
          <Route path="/deaf" element={<DeafIndex />} />
          <Route path="/deaf/send" element={<DeafSend />} />
          <Route path="/deaf/receive" element={<DeafReceive />} />

          {/* 성능 대시보드 */}
          <Route path="/performance" element={<PerformanceDashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

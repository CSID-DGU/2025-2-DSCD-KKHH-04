// src/App.jsx
import React from "react";
import { Routes, Route } from "react-router-dom";

// 레이아웃
import DesktopLayout from "./layouts/DesktopLayout";
import TabletLayout from "./layouts/TabletLayout";

// 메인/회원 관련 페이지
import MainIndex from "./pages/main";
import Login from "./pages/login";
import SignUpTypePage from "./pages/signup-type";
import SignUpBankerPage from "./pages/signup-banker";
import SignUpCustomerPage from "./pages/signup-customer";
import ProfileEdit from "./pages/profileedit";

// PC (은행원)
import BankerIndex from "./pages/Banker/index";
import BankerSend from "./pages/Banker/Send";
import BankerReceive from "./pages/Banker/Receive";
//import BankerSend2 from "./pages/Banker/Send2";
import BankerLogs from "./pages/Banker/logs";

// Tablet (농인)
import DeafIndex from "./pages/Deaf/index";
import DeafSend from "./pages/Deaf/Send";
import DeafReceive from "./pages/Deaf/Receive";
// import DeafSend2 from "./pages/Deaf/Send2";
// import DeafReceive2 from "./pages/Deaf/Receive2";

// 성능 대시보드
import PerformanceDashboard from "./pages/performancedashboard";
export default function App() {
  return (
    <Routes>

      {/* ------------------------ */}
      {/* ① DesktopLayout 그룹     */}
      {/* ------------------------ */}
      <Route element={<DesktopLayout />}>
        {/* 메인 */}
        <Route path="/" element={<MainIndex />} />

        {/* 로그인 / 회원가입 */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUpTypePage />} />
        <Route path="/signup/banker" element={<SignUpBankerPage />} />
        <Route path="/signup/customer" element={<SignUpCustomerPage />} />
        <Route path="/profile" element={<ProfileEdit />} />

        {/* 은행원 단말 */}
        <Route path="/banker" element={<BankerIndex />} />
        <Route path="/banker/send" element={<BankerSend />} />
        {/* <Route path="/banker/send2" element={<BankerSend2 />} /> */}
        <Route path="/banker/receive" element={<BankerReceive />} />
        <Route path="/banker/logs" element={<BankerLogs />} />

        {/* 성능 대시보드 (관리자용) */}
        <Route path="/performance" element={<PerformanceDashboard />} />
      </Route>



      {/* ------------------------ */}
      {/* ② TabletLayout 그룹      */}
      {/* ------------------------ */}
      <Route element={<TabletLayout />}>
        {/* 농인 단말 */}
        <Route path="/deaf" element={<DeafIndex />} />
        <Route path="/deaf/send" element={<DeafSend />} />
        {/* <Route path="/deaf/send2" element={<DeafSend2 />} /> */}
        <Route path="/deaf/receive" element={<DeafReceive />} />
        {/* <Route path="/deaf/receive2" element={<DeafReceive2 />} /> */}
      </Route>

    </Routes>
  );
}

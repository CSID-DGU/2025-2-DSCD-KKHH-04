// src/App.tsx
import { Routes, Route } from "react-router-dom";

// 페이지
import DeafSend from "./pages/Deaf/Send.tsx";
import DeafIndex from "./pages/Deaf/index.tsx";

// 레이아웃
import DesktopLayout from "./layouts/DesktopLayout.tsx";

export default function App() {
  return (
    <Routes>
      {/* DesktopLayout 아래에 Deaf 관련 라우트 묶기 */}
      <Route element={<DesktopLayout />}>
        <Route path="/deaf" element={<DeafIndex />} />
        <Route path="/deaf/send" element={<DeafSend />} />
      </Route>

      {/* 기본 라우트 (home 또는 not found) */}
      <Route path="*" element={<DeafIndex />} />
    </Routes>
  );
}

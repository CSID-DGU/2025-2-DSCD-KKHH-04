import React from "react";
import { createBrowserRouter } from "react-router-dom";

import DesktopLayout from "../layouts/DesktopLayout";
import MainIndex from "../pages/main";

// PC (은행원)
import BankerIndex from "../pages/Banker/index";
import BankerSend from "../pages/Banker/Send";
import BankerReceive from "../pages/Banker/Receive";

// Tablet (농인)
import DeafIndex from "../pages/Deaf/index";
import DeafSend from "../pages/Deaf/Send";
import DeafReceive from "../pages/Deaf/Receive";

export const router = createBrowserRouter([
  // 메인 페이지
  {
    path: "/",
    element: <DesktopLayout />,
    children: [
      { index: true, element: <MainIndex /> },
    ],
  },

  // 💻 은행원(PC)
  {
    path: "/banker",
    element: <DesktopLayout />,
    children: [
      { index: true, element: <BankerIndex /> },
      { path: "send", element: <BankerSend /> },
      { path: "receive", element: <BankerReceive /> },
    ],
  },

  // 📱 청각장애인(태블릿)
  {
    path: "/deaf",
    element: <DesktopLayout />, // ← 여기 TabletLayout 대신 DesktopLayout
    children: [
      { index: true, element: <DeafIndex /> },
      { path: "send", element: <DeafSend /> },
      { path: "receive", element: <DeafReceive /> },
    ],
  },
]);

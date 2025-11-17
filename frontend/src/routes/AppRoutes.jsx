import React from "react";
import { createBrowserRouter } from "react-router-dom";

import DesktopLayout from "../layouts/DesktopLayout";
import MainIndex from "../pages/main";
import Login from "../pages/login";

// PC (은행원)
import BankerIndex from "../pages/Banker/index";
import BankerSend from "../pages/Banker/Send";
import BankerReceive from "../pages/Banker/Receive";

// Tablet (농인)
import DeafIndex from "../pages/Deaf/index";
import DeafSend from "../pages/Deaf/Send";
import DeafReceive from "../pages/Deaf/Receive";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <DesktopLayout />,
    children: [
      // 메인
      { index: true, element: <MainIndex /> },

      { path: "login", element: <Login /> },

      // 은행원
      { path: "banker", element: <BankerIndex /> },
      { path: "banker/send", element: <BankerSend /> },
      { path: "banker/receive", element: <BankerReceive /> },

      // 농인
      { path: "deaf", element: <DeafIndex /> },
      { path: "deaf/send", element: <DeafSend /> },
      { path: "deaf/receive", element: <DeafReceive /> },
    ],
  },
]);

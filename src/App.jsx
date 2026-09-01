import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ChatList from "./pages/ChatList";
import ChatRoom from "./pages/ChatRoom";
import CallProvider from "./context/CallContext";
import { useEffect, useState } from "react";
import { getMe } from "./api/auth";

export default function App() {
  const [me, setMe] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
      getMe().then(setMe).catch(() => {});
    }
  }, []);

  return (
    <BrowserRouter>
      <CallProvider me={me}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/chats" element={<ChatList />} />
          <Route path="/chats/:chatId" element={<ChatRoom />} />
          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      </CallProvider>
    </BrowserRouter>
  );
}
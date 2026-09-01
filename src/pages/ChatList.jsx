import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getChats, searchUsers, getOrCreateDirectChat } from "../api/chats";
import { getMe, logout } from "../api/auth";

export default function ChatList() {
  const [chats, setChats] = useState([]);
  const [me, setMe] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    getMe().then(setMe).catch(() => navigate("/login"));
    getChats().then(setChats);
  }, []);

  async function handleSearch(e) {
    const value = e.target.value;
    setQuery(value);
    if (value.trim().length > 0) {
      setResults(await searchUsers(value));
    } else {
      setResults([]);
    }
  }

  async function startChat(user) {
    const chat = await getOrCreateDirectChat(user.id);
    navigate(`/chats/${chat.id}`);
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.title}>Chats</div>
          <div style={s.subtitle}>Hi, {me?.username}</div>
        </div>
        <button onClick={() => { logout(); navigate("/login"); }} style={s.logoutBtn}>
          Log out
        </button>
      </div>

      <div style={{ padding: "0 16px" }}>
        <input
          placeholder="Search people..."
          value={query}
          onChange={handleSearch}
          style={s.searchInput}
        />
        {results.length > 0 && (
          <div style={s.resultsBox}>
            {results.map((user) => (
              <div key={user.id} onClick={() => startChat(user)} style={s.resultRow}>
                <div style={s.avatar}>{user.username[0].toUpperCase()}</div>
                <span>{user.username}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "8px 0" }}>
        {chats.length === 0 && (
          <div style={s.empty}>No chats yet — search for someone above to start one.</div>
        )}
        {chats.map((chat) => {
          const label = chat.display_name || chat.name || "Unnamed chat";
          return (
            <div key={chat.id} onClick={() => navigate(`/chats/${chat.id}`)} style={s.chatRow}>
              <div style={s.avatar}>{label[0]?.toUpperCase() || "?"}</div>
              <span style={s.chatName}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s = {
  page: { width: "100%", maxWidth: 600, margin: "0 auto", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", minHeight: "100vh", background: "#fff" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 16px 12px" },
  title: { fontSize: 22, fontWeight: 700 },
  subtitle: { fontSize: 13, color: "#65676b" },
  logoutBtn: { border: "1px solid #ddd", background: "none", borderRadius: 16, padding: "6px 14px", fontSize: 13, cursor: "pointer" },
  searchInput: { width: "100%", padding: "10px 16px", borderRadius: 22, border: "1px solid #ddd", fontSize: 15, outline: "none", boxSizing: "border-box" },
  resultsBox: { marginTop: 8, borderRadius: 12, overflow: "hidden", border: "1px solid #eee" },
  resultRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", cursor: "pointer", background: "#fff" },
  chatRow: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid #f5f5f5" },
  chatName: { fontSize: 15, fontWeight: 500 },
  avatar: { width: 40, height: 40, borderRadius: "50%", background: "#0084ff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 16, flexShrink: 0 },
  empty: { padding: "24px 16px", color: "#8a8d91", fontSize: 14, textAlign: "center" },
};
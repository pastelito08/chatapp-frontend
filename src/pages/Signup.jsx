import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signup } from "../api/auth";

export default function Signup() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      await signup(username, email, password);
      navigate("/login");
    } catch {
      setError("Signup failed. Try a different username or a password 8+ characters.");
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <h1 style={s.logo}>chatapp</h1>
        <form onSubmit={handleSubmit}>
          <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} style={s.input} />
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={s.input} />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={s.input} />
          {error && <p style={s.error}>{error}</p>}
          <button type="submit" style={s.button}>Sign up</button>
        </form>
        <p style={s.footer}>Already have an account? <Link to="/login">Log in</Link></p>
      </div>
    </div>
  );
}

const s = {
  wrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f2f5", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  card: { background: "#fff", padding: 32, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", width: 320 },
  logo: { textAlign: "center", color: "#0084ff", marginBottom: 24 },
  input: { display: "block", width: "100%", padding: 12, marginBottom: 10, borderRadius: 8, border: "1px solid #ddd", fontSize: 15, boxSizing: "border-box" },
  button: { width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#0084ff", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" },
  error: { color: "#e41e3f", fontSize: 13, marginBottom: 8 },
  footer: { textAlign: "center", fontSize: 13, marginTop: 16, color: "#65676b" },
};
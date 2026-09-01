import api from "./client";

export async function signup(username, email, password) {
  const response = await api.post("/auth/signup/", { username, email, password });
  return response.data;
}

export async function login(username, password) {
  const response = await api.post("/auth/login/", { username, password });
  localStorage.setItem("access_token", response.data.access);
  localStorage.setItem("refresh_token", response.data.refresh);
  return response.data;
}

export function logout() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

export async function getMe() {
  const response = await api.get("/auth/me/");
  return response.data;
}
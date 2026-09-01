import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

const PUBLIC_ENDPOINTS = ["/auth/login/", "/auth/signup/", "/auth/refresh/"];

api.interceptors.request.use((config) => {
  const isPublic = PUBLIC_ENDPOINTS.some((path) => config.url.includes(path));
  if (!isPublic) {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export default api;
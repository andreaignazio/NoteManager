import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";

// ===========================
// API INSTANCE
// ===========================

const domain = import.meta.env.VITE_API_URL || "";

const api: AxiosInstance = axios.create({
  baseURL: `${domain}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

// ===========================
// INTERCEPTORS
// ===========================

/**
 * Add authentication token to all requests
 */
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const userToken = localStorage.getItem("auth_token");

  if (userToken) {
    config.headers.Authorization = `Token ${userToken}`;
  }

  return config;
});

export default api;

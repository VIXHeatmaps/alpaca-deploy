import axios from "axios";

export const API_BASE =
  import.meta.env?.VITE_API_BASE || "http://127.0.0.1:4000";

export const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});


import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export function extractErrorMessage(err: unknown, fallback = "An unexpected error occurred."): string {
  if (err && typeof err === "object") {
    const axErr = err as { response?: { data?: { detail?: string | string[] } }; message?: string };
    const detail = axErr.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) return String(detail[0]);
    if (axErr.message) return axErr.message;
  }
  return fallback;
}


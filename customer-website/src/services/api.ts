import axios from "axios";

export const api = axios.create({
  baseURL: "/api/v1",
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


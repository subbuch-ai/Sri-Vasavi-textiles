import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export const storeApi = axios.create({
  baseURL: `${API_BASE_URL}/store`,
  headers: {
    "Content-Type": "application/json",
  },
});

const STORE_ACCESS_KEY = "svt_store_access_token";
const STORE_REFRESH_KEY = "svt_store_refresh_token";

export const storeTokenStorage = {
  getAccess: () => localStorage.getItem(STORE_ACCESS_KEY),
  getRefresh: () => localStorage.getItem(STORE_REFRESH_KEY),
  setTokens: (access: string, refresh: string) => {
    localStorage.setItem(STORE_ACCESS_KEY, access);
    localStorage.setItem(STORE_REFRESH_KEY, refresh);
  },
  clear: () => {
    localStorage.removeItem(STORE_ACCESS_KEY);
    localStorage.removeItem(STORE_REFRESH_KEY);
  },
};

storeApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = storeTokenStorage.getAccess();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshingStore = false;
let storeQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

const flushStoreQueue = (error: unknown, token: string | null) => {
  storeQueue.forEach((p) => {
    if (error) p.reject(error);
    else if (token) p.resolve(token);
  });
  storeQueue = [];
};

storeApi.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const req = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (
      error.response?.status === 401 &&
      req &&
      !req._retry &&
      !req.url?.includes("/auth/login") &&
      !req.url?.includes("/auth/register") &&
      !req.url?.includes("/auth/refresh")
    ) {
      const refreshToken = storeTokenStorage.getRefresh();
      if (!refreshToken) {
        storeTokenStorage.clear();
        return Promise.reject(error);
      }

      if (isRefreshingStore) {
        return new Promise<string>((resolve, reject) => {
          storeQueue.push({ resolve, reject });
        }).then((newToken) => {
          if (req.headers) req.headers.Authorization = `Bearer ${newToken}`;
          return storeApi(req);
        });
      }

      req._retry = true;
      isRefreshingStore = true;
      try {
        const res = await axios.post(`${API_BASE_URL}/store/auth/refresh`, {
          refresh_token: refreshToken,
        });
        const { access_token, refresh_token } = res.data;
        storeTokenStorage.setTokens(access_token, refresh_token);
        flushStoreQueue(null, access_token);
        if (req.headers) req.headers.Authorization = `Bearer ${access_token}`;
        return storeApi(req);
      } catch (refreshError) {
        flushStoreQueue(refreshError, null);
        storeTokenStorage.clear();
        return Promise.reject(refreshError);
      } finally {
        isRefreshingStore = false;
      }
    }
    return Promise.reject(error);
  }
);

export async function downloadStoreFile(path: string, filename: string) {
  const res = await storeApi.get(path, { responseType: "blob" });
  const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}


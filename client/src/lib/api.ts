import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE || "/api";

export const api = axios.create({
  baseURL,
  withCredentials: true, // send/receive httpOnly auth cookies
});

// On a 401, try one silent refresh, then replay the original request.
let refreshing: Promise<void> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const isAuthEndpoint = original?.url?.includes("/auth/");

    if (status === 401 && !original?._retried && !isAuthEndpoint) {
      original._retried = true;
      try {
        refreshing ??= api.post("/auth/refresh").then(() => undefined);
        await refreshing;
        refreshing = null;
        return api(original);
      } catch (e) {
        refreshing = null;
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  },
);

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export function errorMessage(e: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError(e)) {
    return (e.response?.data as ApiError | undefined)?.error?.message ?? fallback;
  }
  return fallback;
}

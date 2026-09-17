import axios from 'axios';
import { store } from "../app/store";
import { setLoggedOut } from "../features/auth/authSlice";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (cb) => {
  refreshSubscribers.push(cb);
};

const onRefreshed = () => {
  refreshSubscribers.forEach((cb) => cb(null));
  refreshSubscribers = [];
};

const onRefreshFailed = (error) => {
  refreshSubscribers.forEach((cb) => cb(error));
  refreshSubscribers = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Ignore non-401 or network errors
    if (!error.response || error.response.status !== 401) {
      return Promise.reject(error);
    }

    const requestUrl = originalRequest?.url || "";
    const isAuthEndpoint =
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/register") ||
      requestUrl.includes("/auth/refresh") ||
      requestUrl.includes("/auth/logout");

    // Do not attempt token refresh for authentication endpoints to prevent recursive loops
    if (isAuthEndpoint) {
      return Promise.reject(error);
    }

    // Do not retry the same request multiple times
    if (originalRequest._retry) {
      return Promise.reject(error);
    }
    originalRequest._retry = true;

    if (isRefreshing) {
      // Single-flight queue: wait for current refresh in flight
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((refreshErr) => {
          if (refreshErr) {
            return reject(refreshErr);
          }
          resolve(api(originalRequest));
        });
      });
    }

    isRefreshing = true;

    try {
      await api.post("/auth/refresh");
      isRefreshing = false;
      onRefreshed();
      return api(originalRequest);
    } catch (refreshErr) {
      isRefreshing = false;
      onRefreshFailed(refreshErr);
      // Transition client state to logged out
      store.dispatch(setLoggedOut());
      return Promise.reject(refreshErr);
    }
  },
);

export default api;

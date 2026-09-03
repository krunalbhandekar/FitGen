import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export const TOKEN_KEY = 'fitgen.token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      // Private-mode Safari can throw on storage access.
      return null;
    }
  },
  set: (token) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* non-fatal: session simply won't survive a reload */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* no-op */
    }
  },
};

/*
 * Free-tier hosts idle their instances and take 30-60 seconds to wake, so a
 * 20-second timeout turned an ordinary cold start into "cannot reach the
 * server". The ceiling is generous enough to survive a wake-up; individual
 * calls can still pass a shorter timeout where fast failure is better.
 */
export const COLD_START_TIMEOUT_MS = 75_000;

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: COLD_START_TIMEOUT_MS,
});

/**
 * Fires once when requests have been waiting long enough that the server is
 * probably asleep, so the UI can say "waking the server" rather than appearing
 * frozen. Cleared as soon as everything in flight settles.
 */
export const SERVER_WAKING_EVENT = 'fitgen:server-waking';
export const SERVER_AWAKE_EVENT = 'fitgen:server-awake';

const WAKE_HINT_AFTER_MS = 4000;

/**
 * Endpoints that are slow even on a warm server, because they call the LLM.
 *
 * Elapsed time alone cannot distinguish a cold start from an ordinary Groq
 * call: both take seconds. Telling someone the server is asleep while it is
 * busy generating their plan is worse than saying nothing — it is a wrong
 * explanation for a wait that is working as intended, and these screens already
 * show their own progress. So they are excluded, and the hint is left to mean
 * what it says.
 */
const SLOW_BY_DESIGN = [
  /\/plans\/(workout|diet)\/generate$/,
  /\/plans\/diet\/meals\/.+\/swap$/,
  /^\/chat$/,
];

const isSlowByDesign = (url = '') => SLOW_BY_DESIGN.some((pattern) => pattern.test(url));

let pendingRequests = 0;
let hintTimer = null;

const requestStarted = () => {
  pendingRequests += 1;
  if (hintTimer === null) {
    hintTimer = setTimeout(() => {
      if (pendingRequests > 0) window.dispatchEvent(new Event(SERVER_WAKING_EVENT));
    }, WAKE_HINT_AFTER_MS);
  }
};

const requestFinished = () => {
  pendingRequests = Math.max(pendingRequests - 1, 0);
  if (pendingRequests === 0) {
    clearTimeout(hintTimer);
    hintTimer = null;
    window.dispatchEvent(new Event(SERVER_AWAKE_EVENT));
  }
};

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  /*
   * Tracked on the config rather than recomputed on the way out, so a request
   * is always untracked by exactly the same rule that tracked it — otherwise a
   * pattern change could leave `pendingRequests` permanently above zero and pin
   * the toast open.
   */
  config.trackForWakeHint = !isSlowByDesign(config.url);
  if (config.trackForWakeHint) requestStarted();
  return config;
});

/** Broadcast so AuthContext can react to a rejected token from anywhere. */
export const AUTH_EXPIRED_EVENT = 'fitgen:auth-expired';

api.interceptors.response.use(
  (response) => {
    if (response.config?.trackForWakeHint) requestFinished();
    return response;
  },
  (error) => {
    if (error.config?.trackForWakeHint) requestFinished();
    const status = error.response?.status;

    if (status === 401 && tokenStore.get()) {
      tokenStore.clear();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }

    // Normalise every failure into a plain Error with a usable message.
    const message =
      error.response?.data?.message ??
      (error.code === 'ECONNABORTED'
        ? 'The server took too long to respond. On a free-tier host the first request after a pause can be slow — please try again.'
        : error.message === 'Network Error'
          ? 'Cannot reach the FitGen server. Is it running?'
          : 'Something went wrong. Please try again.');

    // `details` carries per-field validation messages so forms can attach them
    // to the right input rather than only showing a banner.
    return Promise.reject(
      Object.assign(new Error(message), {
        status,
        details: error.response?.data?.details,
      }),
    );
  },
);

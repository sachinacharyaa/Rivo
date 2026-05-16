import axios from "axios";

const LOCALHOST_API_RE = /localhost|127\.0\.0\.1/i;

/** API base for axios and fetch. Prod builds never use localhost (common Vercel misconfig). */
export function resolveApiBase(): string {
  const fromEnv = String(import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");
  const isProd = import.meta.env.PROD;

  if (isProd) {
    if (!fromEnv || LOCALHOST_API_RE.test(fromEnv)) {
      if (fromEnv && LOCALHOST_API_RE.test(fromEnv)) {
        console.warn(
          "VITE_API_URL points at localhost in a production build; using /api instead. Set VITE_API_URL=/api on Vercel.",
        );
      }
      return "/api";
    }
    return fromEnv;
  }

  return fromEnv || "http://localhost:4000/api";
}

const apiUrl = resolveApiBase();

if (!import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  console.warn(`VITE_API_URL is not set; falling back to ${apiUrl}.`);
}

export const api = axios.create({
  baseURL: apiUrl,
});

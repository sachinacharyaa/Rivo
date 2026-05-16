// Vercel injects env vars — do not import dotenv here (it lives in backend/ only).
import { createApp } from "../backend/src/app.js";

const app = createApp();

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  // Vercel may forward paths without the /api prefix; Express routes live under /api/...
  const url = req.url || "";
  if (url.startsWith("/") && !url.startsWith("/api")) {
    req.url = `/api${url}`;
  }
  return app(req, res);
}

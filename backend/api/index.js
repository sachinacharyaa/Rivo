import "dotenv/config";
import { createApp } from "../src/app.js";

const app = createApp();

export default async function handler(req, res) {
  // DB connect runs in Express middleware (with error handler). Do not await here — a missing
  // MONGODB_URI would throw before Express and surfaces as FUNCTION_INVOCATION_FAILED on Vercel.
  // Vercel may forward paths without the /api prefix; Express routes all live under /api/...
  const url = req.url || "";
  if (url.startsWith("/") && !url.startsWith("/api")) {
    req.url = `/api${url}`;
  }
  return app(req, res);
}

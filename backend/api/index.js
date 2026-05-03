import "dotenv/config";
import { createApp, ensureDbConnected } from "../src/app.js";

const app = createApp();

export default async function handler(req, res) {
  await ensureDbConnected();
  // Vercel may forward paths without the /api prefix; Express routes all live under /api/...
  const url = req.url || "";
  if (url.startsWith("/") && !url.startsWith("/api")) {
    req.url = `/api${url}`;
  }
  return app(req, res);
}

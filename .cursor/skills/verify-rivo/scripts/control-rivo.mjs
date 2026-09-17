#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(SKILL_DIR, "../../..");
const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const DEFAULT_API_PORT = 14000;
const DEFAULT_WEB_PORT = 15173;

function die(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function runId() {
  return process.env.RIVO_VERIFY_RUN || "default";
}

function stateDir() {
  return process.env.RIVO_VERIFY_DIR || `/tmp/rivo-verify-${runId()}`;
}

function statePath() {
  return join(stateDir(), "state.json");
}

function artifactsDir() {
  return join(SKILL_DIR, "artifacts", runId());
}

function readState() {
  const path = statePath();
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeState(state) {
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(statePath(), `${JSON.stringify(state, null, 2)}\n`);
}

function requireState() {
  const state = readState();
  if (!state) die(`No verification instance at ${statePath()}. Run: control-rivo launch`);
  return state;
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function portFree(port) {
  return new Promise((resolveFree) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolveFree(false));
    server.once("listening", () => {
      server.close(() => resolveFree(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function pickPort(preferred) {
  if (await portFree(preferred)) return preferred;
  for (let port = preferred + 1; port < preferred + 50; port += 1) {
    if (await portFree(port)) return port;
  }
  die(`No free port near ${preferred}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForLog(pattern, timeoutMs, logPath) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (existsSync(logPath) && pattern.test(readFileSync(logPath, "utf8"))) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${pattern} (log: ${logPath})`);
}

async function waitHttp(url, timeoutMs, ok) {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      const body = await res.text();
      last = `${res.status} ${body.slice(0, 180)}`;
      if (ok(res, body)) return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  die(`Timed out waiting for ${url}: ${last}`);
}

function spawnLogged(command, args, { cwd, env, logPath }) {
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, "");
  const fd = openSync(logPath, "a");
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", fd, fd],
    detached: true,
  });
  closeSync(fd);
  child.unref();
  return child;
}

function killPid(pid) {
  if (!pidAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
}

async function killPidWait(pid) {
  if (!pid) return;
  killPid(pid);
  const started = Date.now();
  while (pidAlive(pid) && Date.now() - started < 4000) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (pidAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

function flagValue(args, name) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return undefined;
  return args[index + 1];
}

function hasFlag(args, name) {
  return args.includes(`--${name}`);
}

async function cmdLaunch() {
  const existing = readState();
  if (existing && (pidAlive(existing.apiPid) || pidAlive(existing.webPid))) {
    die(
      `A verification instance is already running (web ${existing.webUrl}, api ${existing.apiUrl}). Run control-rivo cleanup first, or set RIVO_VERIFY_RUN to a new id.`,
    );
  }

  if (!existsSync(join(REPO_ROOT, "backend/.env"))) {
    die("backend/.env is missing. Copy backend/.env.example and fill MONGODB_URI before launch.");
  }
  if (!existsSync(join(REPO_ROOT, "web/node_modules"))) {
    die("web/node_modules is missing. Run: npm install --prefix web");
  }
  if (!existsSync(join(REPO_ROOT, "backend/node_modules"))) {
    die("backend/node_modules is missing. Run: npm install --prefix backend");
  }

  mkdirSync(stateDir(), { recursive: true });
  mkdirSync(artifactsDir(), { recursive: true });

  const apiPort = await pickPort(Number(process.env.RIVO_VERIFY_API_PORT || DEFAULT_API_PORT));
  const webPort = await pickPort(Number(process.env.RIVO_VERIFY_WEB_PORT || DEFAULT_WEB_PORT));
  const webUrl = `http://127.0.0.1:${webPort}`;
  const apiUrl = `http://127.0.0.1:${apiPort}/api`;

  const apiLog = join(stateDir(), "api.log");
  const webLog = join(stateDir(), "web.log");

  const api = spawnLogged("node", ["src/server.js"], {
    cwd: join(REPO_ROOT, "backend"),
    env: {
      PORT: String(apiPort),
      CORS_ORIGINS: webUrl,
    },
    logPath: apiLog,
  });

  try {
    await waitForLog(/Rivo API running on :/, 40000, apiLog);
    await waitHttp(`${apiUrl}/health`, 15000, (res) => res.ok);
  } catch (error) {
    await killPidWait(api.pid);
    die(error instanceof Error ? error.message : String(error));
  }

  const web = spawnLogged(
    "npm",
    ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
    {
      cwd: join(REPO_ROOT, "web"),
      env: {
        VITE_API_URL: apiUrl,
      },
      logPath: webLog,
    },
  );

  try {
    await waitForLog(/Local:|ready in/i, 40000, webLog);
    await waitHttp(webUrl, 15000, (res, body) => res.ok && body.includes('id="root"'));
  } catch (error) {
    await killPidWait(web.pid);
    await killPidWait(api.pid);
    die(error instanceof Error ? error.message : String(error));
  }

  const state = {
    runId: runId(),
    repoRoot: REPO_ROOT,
    webUrl,
    apiUrl,
    webPort,
    apiPort,
    webPid: web.pid,
    apiPid: api.pid,
    cdpPort: null,
    browserPid: null,
    startedAt: new Date().toISOString(),
  };
  writeState(state);
  console.log(`web ${webUrl}`);
  console.log(`api ${apiUrl}`);
  console.log(`state ${statePath()}`);
  console.log(`artifacts ${artifactsDir()}`);
}

function healthFromBody(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function detectMode(state) {
  const dumped = await dumpPage(state, "/");
  if (dumped.includes("Devnet milestone reached")) return "milestone-only";
  if (dumped.includes("Make from 0 to first dollar online")) return "full-app";
  return "unknown";
}

async function cmdDoctor() {
  const state = requireState();
  const webAlive = pidAlive(state.webPid);
  const apiAlive = pidAlive(state.apiPid);
  let health = null;
  let healthError = "";
  try {
    const res = await fetch(`${state.apiUrl}/health`);
    const body = await res.text();
    health = healthFromBody(body);
    if (!res.ok) healthError = `HTTP ${res.status}`;
  } catch (error) {
    healthError = error instanceof Error ? error.message : String(error);
  }

  let webStatus = 0;
  try {
    const res = await fetch(state.webUrl);
    webStatus = res.status;
  } catch (error) {
    healthError = healthError || (error instanceof Error ? error.message : String(error));
  }

  let mode = "unrendered";
  if (webAlive && webStatus === 200) {
    try {
      mode = await detectMode(state);
    } catch (error) {
      mode = `browser-error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  const ok =
    webAlive &&
    apiAlive &&
    webStatus === 200 &&
    Boolean(health?.ok) &&
    (mode === "milestone-only" || mode === "full-app");

  console.log(`ok: ${ok}`);
  console.log(`web: ${state.webUrl} pid=${state.webPid} alive=${webAlive} http=${webStatus}`);
  console.log(`api: ${state.apiUrl} pid=${state.apiPid} alive=${apiAlive}`);
  console.log(`mode: ${mode}`);
  console.log(`health.ok: ${health?.ok ?? false}`);
  console.log(`health.mongoConfigured: ${health?.mongoConfigured ?? "unknown"}`);
  console.log(`health.uploads: ${health?.uploads ?? "unknown"}`);
  if (healthError) console.log(`error: ${healthError}`);
  console.log(`ownedByThisRun: ${webAlive && apiAlive}`);
  console.log(`state: ${statePath()}`);
  if (!ok) process.exit(1);
}

async function cmdCleanup() {
  const state = readState();
  if (!state) {
    console.log("nothing to clean");
    return;
  }
  await killPidWait(state.daemonPid);
  await killPidWait(state.browserPid);
  await killPidWait(state.webPid);
  await killPidWait(state.apiPid);
  rmSync(stateDir(), { recursive: true, force: true });
  console.log(`cleaned ${stateDir()}`);
  console.log(`artifacts kept at ${artifactsDir()}`);
}

async function cmdUrl(args) {
  const state = requireState();
  const path = args[0] || "/";
  console.log(new URL(path, state.webUrl).toString());
}

async function cmdApi(args) {
  const state = requireState();
  const method = (args[0] || "GET").toUpperCase();
  const path = args[1];
  if (!path) die("usage: control-rivo api <METHOD> <path> [--body JSON]");
  const body = flagValue(args, "body");
  const res = await fetch(`${state.apiUrl}${path.startsWith("/") ? path : `/${path}`}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body,
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text);
  if (!res.ok) process.exit(1);
}

const DEFAULT_DAEMON_PORT = 15175;

function braveAvailable() {
  return existsSync(BRAVE);
}

async function runBrowserAction(page, state, action, args) {
  if (action === "goto") {
    const path = args[0] || "/";
    await page.goto(new URL(path, state.webUrl).toString(), { waitUntil: "networkidle" });
    await page.waitForSelector("#root", { timeout: 15000 });
    return page.url();
  }
  if (action === "click") {
    const role = flagValue(args, "role") || "button";
    const name = flagValue(args, "name");
    if (!name) throw new Error("browser click requires --name");
    await page.getByRole(role, { name }).click();
    return `clicked ${role} ${name}`;
  }
  if (action === "fill") {
    const name = flagValue(args, "name");
    const placeholder = flagValue(args, "placeholder");
    const value = flagValue(args, "value");
    if (value == null) throw new Error("browser fill requires --value");
    if (name) {
      await page.getByLabel(name, { exact: true }).fill(value);
      return `filled ${name}`;
    }
    if (placeholder) {
      await page.getByPlaceholder(placeholder, { exact: true }).fill(value);
      return `filled placeholder ${placeholder}`;
    }
    throw new Error("browser fill requires --name or --placeholder, and --value");
  }
  if (action === "wait") {
    const text = flagValue(args, "text");
    const timeout = Number(flagValue(args, "timeout") || 8000);
    if (!text) throw new Error("browser wait requires --text");
    await page.getByText(text).first().waitFor({ timeout });
    return `saw ${text}`;
  }
  if (action === "text") {
    return page.locator("body").innerText();
  }
  if (action === "snapshot") {
    const path = flagValue(args, "path") || join(artifactsDir(), "snapshot.aria.txt");
    mkdirSync(dirname(path), { recursive: true });
    const body = await page.locator("body").ariaSnapshot();
    writeFileSync(path, body.endsWith("\n") ? body : `${body}\n`);
    return path;
  }
  if (action === "screenshot") {
    const path = flagValue(args, "path") || join(artifactsDir(), "page.png");
    mkdirSync(dirname(path), { recursive: true });
    await page.screenshot({ path, fullPage: true });
    return path;
  }
  throw new Error(`unknown browser action: ${action}`);
}

async function cmdBrowserDaemon() {
  if (!braveAvailable()) die("Brave is required at /Applications/Brave Browser.app for browser commands.");
  const { chromium } = await import("playwright-core");
  const { createServer: createHttpServer } = await import("node:http");
  const profile = join(stateDir(), "chrome-profile");
  mkdirSync(profile, { recursive: true });
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: BRAVE,
    headless: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] || (await context.newPage());
  const port = Number(process.env.RIVO_BROWSER_DAEMON_PORT);
  const shutdown = async () => {
    await context.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  const server = createHttpServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === "POST" && req.url === "/run") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      try {
        const state = requireState();
        const out = await runBrowserAction(page, state, payload.action, payload.args || []);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, out }));
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, "127.0.0.1");
}

async function ensureDaemon(state) {
  if (state.daemonPid && pidAlive(state.daemonPid) && state.daemonPort) {
    try {
      const res = await fetch(`http://127.0.0.1:${state.daemonPort}/health`);
      if (res.ok) return state;
    } catch {
      /* restart below */
    }
  }
  if (!existsSync(join(SCRIPT_DIR, "node_modules/playwright-core"))) {
    die("Install browser driver once: npm install --prefix .cursor/skills/verify-rivo/scripts");
  }
  if (!braveAvailable()) {
    die("Brave is required at /Applications/Brave Browser.app for browser commands.");
  }
  const daemonPort = await pickPort(Number(process.env.RIVO_VERIFY_DAEMON_PORT || DEFAULT_DAEMON_PORT));
  const child = spawnLogged(process.execPath, [fileURLToPath(import.meta.url), "_browser-daemon"], {
    cwd: SCRIPT_DIR,
    env: {
      RIVO_VERIFY_DIR: stateDir(),
      RIVO_VERIFY_RUN: runId(),
      RIVO_BROWSER_DAEMON_PORT: String(daemonPort),
    },
    logPath: join(stateDir(), "browser-daemon.log"),
  });
  await waitHttp(`http://127.0.0.1:${daemonPort}/health`, 25000, (res) => res.ok);
  state.daemonPid = child.pid;
  state.daemonPort = daemonPort;
  writeState(state);
  return state;
}

async function daemonRun(action, args) {
  let state = requireState();
  state = await ensureDaemon(state);
  const res = await fetch(`http://127.0.0.1:${state.daemonPort}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, args }),
  });
  const payload = await res.json();
  if (!payload.ok) throw new Error(payload.error || "browser daemon failed");
  return payload.out;
}

async function dumpPage(_state, path = "/") {
  await daemonRun("goto", [path]);
  return daemonRun("text", []);
}

async function cmdBrowser(args) {
  const action = args[0];
  if (!action) {
    die(
      "usage: control-rivo browser <goto|click|fill|wait|snapshot|screenshot|text> [...flags]",
    );
  }
  const out = await daemonRun(action, args.slice(1));
  if (out) console.log(out);
}

function printHelp() {
  console.log(`control-rivo drives a disposable Rivo verification instance

Commands:
  launch
  doctor
  cleanup
  url [path]
  api <METHOD> <path> [--body JSON]
  browser goto <path>
  browser click --role button --name "Send details"
  browser fill --name Email --value "you@studio.com"
  browser fill --placeholder "Search products..." --value "query"
  browser wait --text "Devnet milestone reached"
  browser snapshot [--path FILE]
  browser screenshot [--path FILE]
  browser text

Env:
  RIVO_VERIFY_RUN   run id (default: default)
  RIVO_VERIFY_DIR   state dir (default: /tmp/rivo-verify-$RUN)
`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === "help" || cmd === "-h" || hasFlag(process.argv, "help")) {
  printHelp();
  process.exit(0);
}

const commands = {
  launch: () => cmdLaunch(),
  doctor: () => cmdDoctor(),
  cleanup: () => cmdCleanup(),
  url: () => cmdUrl(rest),
  api: () => cmdApi(rest),
  browser: () => cmdBrowser(rest),
  "_browser-daemon": () => cmdBrowserDaemon(),
};

const fn = commands[cmd];
if (!fn) die(`unknown command: ${cmd}`);
fn().catch((error) => die(error instanceof Error ? error.stack || error.message : String(error)));


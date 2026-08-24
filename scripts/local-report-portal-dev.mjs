import { createServer } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import originalPhotoDownloadHandler from "../api/original-photo-download.js";
import originalPhotosDownloadHandler from "../api/original-photos-download.js";
import originalPhotosHandler from "../api/original-photos.js";
import reportDownloadHandler from "../api/report-download.js";
import reportOrgsHandler from "../api/report-orgs.js";
import reportPackagesHandler from "../api/report-packages.js";
import stampedExportHandler from "../api/stamped-export.js";
import stampedExportDownloadHandler from "../api/stamped-export-download.js";
import stampedPhotoDownloadHandler from "../api/stamped-photo-download.js";

const HOST = "127.0.0.1";
const API_PORT = Number(process.env.REPORT_PORTAL_API_PORT || 3000);
const VITE_PORT = Number(process.env.REPORT_PORTAL_VITE_PORT || 5174);
const PROJECT_REF = process.env.EXPECTED_SUPABASE_PROJECT_REF || "chlvazmtucoszicehtnm";
const SUPABASE_URL = "https://chlvazmtucoszicehtnm.supabase.co";

function loadLocalEnv() {
  if (!existsSync(".env.local")) return {};
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]])
  );
}

function loadServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  const raw = execFileSync(
    "/opt/homebrew/bin/supabase",
    ["projects", "api-keys", "--project-ref", PROJECT_REF, "--output-format", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  const keys = JSON.parse(raw);
  return keys
    .map((entry) => ({
      name: String(entry.name || entry.api_key_name || "").toLowerCase(),
      value: entry.api_key || entry.key || entry.value || "",
    }))
    .find((entry) => entry.name.includes("service"))?.value;
}

function makeRequest(url, req) {
  const parsed = new URL(url, `http://${req.headers.host || `${HOST}:${API_PORT}`}`);
  return {
    ...req,
    method: req.method,
    headers: req.headers,
    query: Object.fromEntries(parsed.searchParams.entries()),
    url: parsed.pathname + parsed.search,
  };
}

function makeResponse(res) {
  return {
    setHeader(name, value) {
      res.setHeader(name, value);
    },
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(body) {
      res.end(JSON.stringify(body));
      return this;
    },
    end(body) {
      res.end(body);
      return this;
    },
  };
}

async function proxyToVite(req, res) {
  const viteUrl = `http://${HOST}:${VITE_PORT}${req.url || "/"}`;
  const upstream = await fetch(viteUrl, {
    headers: {
      accept: req.headers.accept || "*/*",
      "user-agent": req.headers["user-agent"] || "local-report-portal-dev",
    },
  });
  res.statusCode = upstream.status;
  upstream.headers.forEach((value, name) => {
    if (!["content-encoding", "content-length", "transfer-encoding"].includes(name)) {
      res.setHeader(name, value);
    }
  });
  const body = Buffer.from(await upstream.arrayBuffer());
  res.end(body);
}

const serviceKey = loadServiceRoleKey();
if (!serviceKey) {
  throw new Error("Unable to retrieve scout-dev service-role key for local API runtime.");
}

const localEnv = loadLocalEnv();
const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  localEnv.SUPABASE_ANON_KEY ||
  localEnv.SUPABASE_PUBLISHABLE_KEY ||
  localEnv.VITE_SUPABASE_ANON_KEY;
if (!anonKey) {
  throw new Error("Missing scout-dev anon key for local API runtime.");
}

process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_ANON_KEY = anonKey;
process.env.VITE_SUPABASE_URL = SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = anonKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;

const viteEnv = {
  ...process.env,
  VITE_SUPABASE_URL: SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: anonKey,
};
delete viteEnv.SUPABASE_SERVICE_ROLE_KEY;
delete viteEnv.SUPABASE_SERVICE_KEY;
delete viteEnv.SUPABASE_SECRET_KEY;

const vite = spawn(
  "npm",
  ["run", "dev", "--", "--host", HOST, "--port", String(VITE_PORT), "--strictPort"],
  {
    cwd: process.cwd(),
    env: viteEnv,
    stdio: ["ignore", "inherit", "inherit"],
  }
);

const server = createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/report-packages")) {
      await reportPackagesHandler(makeRequest(req.url, req), makeResponse(res));
      return;
    }
    if (req.url?.startsWith("/api/report-orgs")) {
      await reportOrgsHandler(makeRequest(req.url, req), makeResponse(res));
      return;
    }
    if (req.url?.startsWith("/api/report-download")) {
      await reportDownloadHandler(makeRequest(req.url, req), makeResponse(res));
      return;
    }
    if (req.url?.startsWith("/api/original-photo-download")) {
      await originalPhotoDownloadHandler(makeRequest(req.url, req), makeResponse(res));
      return;
    }
    if (req.url?.startsWith("/api/original-photos-download")) {
      await originalPhotosDownloadHandler(makeRequest(req.url, req), makeResponse(res));
      return;
    }
    if (req.url?.startsWith("/api/original-photos")) {
      await originalPhotosHandler(makeRequest(req.url, req), makeResponse(res));
      return;
    }
    if (req.url?.startsWith("/api/stamped-export-download")) {
      await stampedExportDownloadHandler(makeRequest(req.url, req), makeResponse(res));
      return;
    }
    if (req.url?.startsWith("/api/stamped-photo-download")) {
      await stampedPhotoDownloadHandler(makeRequest(req.url, req), makeResponse(res));
      return;
    }
    if (req.url?.startsWith("/api/stamped-export")) {
      await stampedExportHandler(makeRequest(req.url, req), makeResponse(res));
      return;
    }
    await proxyToVite(req, res);
  } catch (error) {
    console.error("Local report portal dev error:", error?.message || error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Local report portal dev server failed." }));
  }
});

server.listen(API_PORT, HOST, () => {
  console.log(`Local report portal: http://${HOST}:${API_PORT}/reports`);
});

function shutdown() {
  server.close();
  vite.kill("SIGTERM");
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(143);
});

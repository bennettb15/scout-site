import { spawn } from "node:child_process";
import path from "node:path";

import {
  authenticateRequest,
  createServiceClient,
  getQueryValue,
  methodAllowed,
  sendJson,
} from "./_reportPortalShared.js";

const DEFAULT_WORKER_REPO = "/Users/brian/Desktop/ScoutCapture";
const DEFAULT_WORKER_PYTHON =
  "/Users/brian/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const PROJECT_REF = "chlvazmtucoszicehtnm";

export function publicExport(row) {
  if (!row) return null;
  const expired = row.expires_at ? new Date(row.expires_at).getTime() <= Date.now() : false;
  return {
    id: row.id,
    status: expired && row.status === "ready" ? "expired" : row.status,
    filename: row.filename,
    byteSize: row.byte_size,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export function parsePhotoIds(req) {
  const raw = getQueryValue(req, "photoIds");
  return [
    ...new Set(
      String(raw || "")
        .split(",")
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export async function latestExportForPackage(client, reportPackage) {
  const { data, error } = await client
    .from("temporary_exports")
    .select("id,status,filename,byte_size,expires_at,created_at")
    .eq("artifact_type", "stamped_jpg_zip")
    .like("cache_key", "stamped-jpg-zip:%")
    .eq("org_id", reportPackage.org_id)
    .eq("property_id", reportPackage.property_id)
    .eq("session_id", reportPackage.session_id)
    .eq("snapshot_id", reportPackage.snapshot_id)
    .is("deleted_at", null)
    .order("requested_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function validateSelectedPhotoIds(auth, reportPackage, photoIds) {
  if (photoIds.length === 0) return [];
  const { data, error } = await auth.client
    .from("shots")
    .select("id")
    .in("id", photoIds)
    .eq("org_id", reportPackage.org_id)
    .eq("property_id", reportPackage.property_id)
    .eq("session_id", reportPackage.session_id)
    .eq("storage_bucket", "scoutcapture-originals")
    .eq("upload_state", "uploaded")
    .is("deleted_at", null)
    .not("storage_path", "is", null);

  if (error) throw error;
  const found = new Set((data || []).map((row) => String(row.id).toLowerCase()));
  if (found.size !== photoIds.length || photoIds.some((id) => !found.has(id))) {
    const error = new Error("Selected photos are not available.");
    error.statusCode = 404;
    throw error;
  }
  return photoIds;
}

export function runWorker(reportPackage, userId, selectedPhotoIds = []) {
  const repo = process.env.REPORT_WORKER_REPO_DIR || DEFAULT_WORKER_REPO;
  const python = process.env.REPORT_WORKER_PYTHON || DEFAULT_WORKER_PYTHON;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  if (!serviceKey || !supabaseUrl) {
    throw new Error("Server report worker configuration is missing.");
  }

  const args = [
    path.join(repo, "web-contract/report-production/report_worker_cli.py"),
    "--allow-remote-validation",
    "--expected-project-ref",
    PROJECT_REF,
    "--stamped-zip-package-id",
    reportPackage.id,
    "--allow-session-id",
    reportPackage.session_id,
    "--requested-by-user-id",
    userId,
    "--retention-mode",
    "dry-run",
    "--pretty",
    "--output-dir",
    "/private/tmp/scoutcapture-report-worker-stamped-zip-api",
  ];
  for (const photoId of selectedPhotoIds) {
    args.push("--stamped-zip-shot-id", photoId);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(python, args, {
      cwd: repo,
      env: {
        ...process.env,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: serviceKey,
        PATH: `/Users/brian/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override:${process.env.PATH || ""}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code, signal) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error("Worker returned an invalid stamped export response."));
        }
      } else {
        reject(new Error(`Worker failed (${code ?? signal}): ${stderr || stdout}`));
      }
    });
  });
}

export async function loadReadyReportPackage(auth, packageId) {
  const { data: reportPackage, error: packageError } = await auth.client
    .from("report_packages")
    .select("id,org_id,property_id,session_id,snapshot_id,status")
    .eq("id", packageId)
    .is("deleted_at", null)
    .maybeSingle();

  if (packageError) {
    const error = new Error("Unable to load stamped export.");
    error.statusCode = 500;
    throw error;
  }
  if (!reportPackage || reportPackage.status !== "ready") {
    const error = new Error("Report package not found.");
    error.statusCode = 404;
    throw error;
  }
  return reportPackage;
}

export async function prepareStampedExportForPhotos(auth, reportPackage, photoIds = []) {
  const service = createServiceClient();
  const validatedPhotoIds = await validateSelectedPhotoIds(auth, reportPackage, photoIds);
  const workerResult = await runWorker(reportPackage, auth.user.id, validatedPhotoIds);
  if (!workerResult?.export_id) {
    throw new Error("Unable to prepare stamped export.");
  }
  const { data, error } = await service
    .from("temporary_exports")
    .select(
      "id,status,filename,byte_size,expires_at,created_at,storage_bucket,storage_path,mime_type"
    )
    .eq("id", workerResult.export_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST", "OPTIONS"])) return;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const packageId = getQueryValue(req, "packageId");
    const selectedPhotoIds = parsePhotoIds(req);
    if (!packageId) {
      return sendJson(res, 400, { error: "Missing package id." });
    }

    const reportPackage = await loadReadyReportPackage(auth, packageId);

    const service = createServiceClient();
    let exportRow = null;
    if (req.method === "POST") {
      exportRow = await prepareStampedExportForPhotos(auth, reportPackage, selectedPhotoIds);
    } else {
      exportRow = await latestExportForPackage(service, reportPackage);
    }
    return sendJson(res, 200, { export: publicExport(exportRow) });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error:
        error.statusCode === 404
          ? error.message
          : "Unable to prepare stamped export.",
    });
  }
}

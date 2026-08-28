import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Flag,
  FileText,
  LogOut,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "./lib/supabaseClient";
import { readPortalContext, writePortalContext } from "./lib/portalContext";

const BRAND = {
  siteTitle: "Reports | SCOUT",
  brandNavy: "#1C2742",
  logos: {
    wordmarkOnly: "/Scout Only Logo Navy Dark NEW.png",
  },
};

const REPORT_LABELS = {
  property_report: "Property Report",
  flagged_observations: "Priority Report",
  flagged_comparison: "Flagged Comparison",
};

const REPORT_ORDER = {
  property_report: 0,
  flagged_comparison: 1,
  flagged_observations: 2,
};

const ALL_PROPERTIES = "all";
const DATE_FILTER_LATEST = "latest";
const DATE_FILTER_ALL = "all";
const FETCH_IDLE = "idle";
const FETCH_LOADING = "loading";
const FETCH_SUCCESS = "success";
const FETCH_ERROR = "error";

function formatDate(value) {
  if (!value) return "Not dated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not dated";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return "";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function propertyLine(property) {
  if (!property) return "Property";
  const cityState = [property.city, property.state].filter(Boolean).join(", ");
  const address = [property.addressLine1, cityState, property.postalCode]
    .filter(Boolean)
    .join(" ");
  return property.name || address || "Property";
}

function propertyOptionLabel(property) {
  if (!property) return "Property";
  const cityState = [property.city, property.state].filter(Boolean).join(", ");
  const address = [property.addressLine1, cityState, property.postalCode]
    .filter(Boolean)
    .join(" ");
  if (property.name && address) return `${property.name} · ${address}`;
  return property.name || address || "Property";
}

function propertyAddressLine(property) {
  if (!property) return "";
  const cityState = [property.city, property.state].filter(Boolean).join(", ");
  const locality = [cityState, property.postalCode].filter(Boolean).join(" ");
  return [property.addressLine1, locality].filter(Boolean).join(" · ");
}

function packageDisplayTimestamp(reportPackage) {
  return (
    reportPackage.sessionCompletedAt ||
    reportPackage.completedAt ||
    reportPackage.session?.completedAt ||
    reportPackage.session?.startedAt
  );
}

function packageTitle(reportPackage) {
  return reportPackage.session?.title || "Completed session";
}

function packageDateTime(reportPackage) {
  const timestamp = packageDisplayTimestamp(reportPackage);
  const time = formatTime(timestamp);
  return [formatDate(timestamp), time].filter(Boolean).join(" · ");
}

function packageSubtitle(reportPackage) {
  return [packageTitle(reportPackage), packageDateTime(reportPackage)]
    .filter(Boolean)
    .join(" · ");
}

function packageTimestampMs(reportPackage) {
  const date = new Date(packageDisplayTimestamp(reportPackage));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function packagePropertyKey(reportPackage) {
  return reportPackage.property?.id || reportPackage.property?.name || "unknown-property";
}

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function stampedExportSummary(stampedExport) {
  if (stampedExport?.status === "ready") {
    const date = formatShortDate(stampedExport.expiresAt);
    return date ? `Ready until ${date}` : "Ready";
  }
  if (stampedExport?.status === "generating" || stampedExport?.status === "queued") {
    return "Preparing";
  }
  if (stampedExport?.status === "expired") {
    return "Expired";
  }
  return "Not prepared";
}

function packageSummary(reportPackage) {
  const stamped = stampedExportSummary(reportPackage.stampedExport).toLowerCase();
  return [
    countLabel(reportPackage.files.length, "PDF"),
    countLabel(reportPackage.originalPhotoCount || 0, "original"),
    `stamped export ${stamped}`,
  ].join(" · ");
}

function compactPhotoLabel(photo) {
  return String(photo.displayName || "Photo").replace(/\bAngle\s+(\d+)\b/g, "A$1");
}

function photoFlaggedReason(photo) {
  return String(photo.flaggedReason || photo.flagReason || photo.reason || "").trim();
}

function photoIsResolved(photo) {
  const status = String(photo?.issueStatus || photo?.issue_status || "").toLowerCase();
  return Boolean(
    photo?.isResolved ||
      photo?.isResolvedInSession ||
      photo?.is_resolved_in_session ||
      status === "resolved" ||
      status === "closed"
  );
}

function photoIsFlagged(photo) {
  return Boolean(photo?.isFlagged || photo?.flagged || photo?.is_flagged);
}

function photoHasIssueState(photo) {
  return photoIsFlagged(photo) || photoIsResolved(photo);
}

export default function ScoutReportsPortalPage() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [packages, setPackages] = useState([]);
  const [reportsError, setReportsError] = useState("");
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsFetchStatus, setReportsFetchStatus] = useState(FETCH_IDLE);
  const [orgs, setOrgs] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgsFetchStatus, setOrgsFetchStatus] = useState(FETCH_IDLE);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState(ALL_PROPERTIES);
  const [dateFilter, setDateFilter] = useState(DATE_FILTER_LATEST);
  const [downloadId, setDownloadId] = useState("");
  const [exportActionId, setExportActionId] = useState("");
  const [expandedPackageIds, setExpandedPackageIds] = useState({});
  const [photosByPackageId, setPhotosByPackageId] = useState({});
  const [photosLoadingId, setPhotosLoadingId] = useState("");
  const [photoDownloadId, setPhotoDownloadId] = useState("");
  const [selectedPhotoIdsByPackageId, setSelectedPhotoIdsByPackageId] = useState({});
  const [flaggedOnlyByPackageId, setFlaggedOnlyByPackageId] = useState({});
  const [activePhotoViewer, setActivePhotoViewer] = useState(null);
  const [canOpenAdmin, setCanOpenAdmin] = useState(false);
  const reportsRequestIdRef = useRef(0);
  const orgsRequestIdRef = useRef(0);
  const reportsRetrySessionKeyRef = useRef("");

  useEffect(() => {
    document.title = BRAND.siteTitle;
    document.documentElement.style.setProperty("--brand", BRAND.brandNavy);
    document.documentElement.style.setProperty("--brand-ink", "#23243A");
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setAuthLoading(false);
      return;
    }

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session || null);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  function sessionRequestKey(activeSession = session) {
    return [
      activeSession?.user?.id || "",
      activeSession?.access_token || "",
    ].join(":");
  }

  function shouldRetryAfterSessionSettles(error) {
    const status = Number(error?.status || 0);
    const message = String(error?.message || "").toLowerCase();
    return (
      status === 401 ||
      message.includes("authentication required") ||
      message.includes("session") ||
      message.includes("jwt")
    );
  }

  async function getSettledSession(fallbackSession) {
    if (!supabase) return fallbackSession;
    await wait(300);
    const { data } = await supabase.auth.getSession();
    return data.session || fallbackSession;
  }

  async function loadReports(activeSession = session, options = {}) {
    if (!activeSession?.access_token) return;
    const requestId = reportsRequestIdRef.current + 1;
    reportsRequestIdRef.current = requestId;
    const initialSessionKey = sessionRequestKey(activeSession);
    const allowSessionRetry = options.allowSessionRetry !== false;
    setReportsLoading(true);
    setReportsFetchStatus(FETCH_LOADING);
    setReportsError("");
    try {
      const response = await fetch("/api/report-packages", {
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`,
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(body.error || "Unable to load reports.");
        error.status = response.status;
        throw error;
      }
      if (requestId !== reportsRequestIdRef.current) return;
      setPackages(Array.isArray(body.packages) ? body.packages : []);
      setReportsFetchStatus(FETCH_SUCCESS);
    } catch (error) {
      if (requestId !== reportsRequestIdRef.current) return;
      if (
        allowSessionRetry &&
        reportsRetrySessionKeyRef.current !== initialSessionKey &&
        shouldRetryAfterSessionSettles(error)
      ) {
        reportsRetrySessionKeyRef.current = initialSessionKey;
        const settledSession = await getSettledSession(activeSession);
        if (requestId !== reportsRequestIdRef.current) return;
        if (
          settledSession?.access_token &&
          (!activeSession.user?.id || settledSession.user?.id === activeSession.user.id)
        ) {
          await loadReports(settledSession, { allowSessionRetry: false });
          return;
        }
      }
      setReportsError(error.message || "Unable to load reports.");
      setPackages([]);
      setReportsFetchStatus(FETCH_ERROR);
    } finally {
      if (requestId === reportsRequestIdRef.current) {
        setReportsLoading(false);
      }
    }
  }

  async function loadOrgs(activeSession = session) {
    if (!activeSession?.access_token) return;
    const requestId = orgsRequestIdRef.current + 1;
    orgsRequestIdRef.current = requestId;
    setOrgsLoading(true);
    setOrgsFetchStatus(FETCH_LOADING);
    try {
      const response = await fetch("/api/report-orgs", {
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`,
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(body.orgs)) {
        throw new Error(body.error || "Unable to load organizations.");
      }
      if (requestId !== orgsRequestIdRef.current) return;
      setOrgs(body.orgs);
      setOrgsFetchStatus(FETCH_SUCCESS);
    } catch (error) {
      if (requestId !== orgsRequestIdRef.current) return;
      setReportsError(error.message || "Unable to load organizations.");
      setOrgs([]);
      setOrgsFetchStatus(FETCH_ERROR);
    } finally {
      if (requestId === orgsRequestIdRef.current) {
        setOrgsLoading(false);
      }
    }
  }

  useEffect(() => {
    if (session?.access_token) {
      loadReports(session, { allowSessionRetry: true });
      loadOrgs(session);
    } else {
      reportsRequestIdRef.current += 1;
      orgsRequestIdRef.current += 1;
      setPackages([]);
      setOrgs([]);
      setSelectedOrgId("");
      setSelectedPropertyId(ALL_PROPERTIES);
      setReportsError("");
      setReportsLoading(false);
      setOrgsLoading(false);
      setReportsFetchStatus(FETCH_IDLE);
      setOrgsFetchStatus(FETCH_IDLE);
      setCanOpenAdmin(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    let active = true;

    async function loadAdminStatus() {
      if (!session?.access_token) {
        setCanOpenAdmin(false);
        return;
      }

      try {
        const response = await fetch("/api/admin/me", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        const body = await response.json().catch(() => ({}));
        if (active) setCanOpenAdmin(response.ok && body.isAdmin === true);
      } catch {
        if (active) setCanOpenAdmin(false);
      }
    }

    loadAdminStatus();

    return () => {
      active = false;
    };
  }, [session?.access_token]);

  useEffect(() => {
    if (!activePhotoViewer) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setActivePhotoViewer(null);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        movePhotoViewer(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        movePhotoViewer(1);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePhotoViewer]);

  async function handleSignIn(event) {
    event.preventDefault();
    setAuthError("");
    if (!hasSupabaseConfig || !supabase) {
      setAuthError("Supabase is not configured for this site.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setAuthError(error.message || "Unable to sign in.");
    }
  }

  async function handleSignOut() {
    await supabase?.auth.signOut();
    setPackages([]);
    setOrgs([]);
    setSelectedOrgId("");
    setSelectedPropertyId(ALL_PROPERTIES);
  }

  async function handleDownload(file) {
    if (!session?.access_token) return;
    setDownloadId(file.id);
    setReportsError("");
    try {
      const response = await fetch(
        `/api/report-download?fileId=${encodeURIComponent(file.id)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.downloadUrl) {
        throw new Error(body.error || "Unable to prepare download.");
      }
      window.location.assign(body.downloadUrl);
    } catch (error) {
      setReportsError(error.message || "Unable to prepare download.");
    } finally {
      setDownloadId("");
    }
  }

  function updatePackageStampedExport(packageId, stampedExport) {
    setPackages((current) =>
      current.map((item) =>
        item.id === packageId
          ? {
              ...item,
              stampedExport: stampedExport || item.stampedExport,
            }
          : item
      )
    );
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function requestStampedExport(reportPackage, selectedPhotos) {
    const params = new URLSearchParams({ packageId: reportPackage.id });
    if (selectedPhotos.length > 0) {
      params.set("photoIds", selectedPhotos.map((photo) => photo.id).join(","));
    }
    const response = await fetch(`/api/stamped-export?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.export) {
      throw new Error(body.error || "Unable to prepare stamped photo download.");
    }
    updatePackageStampedExport(reportPackage.id, body.export);
    return body.export;
  }

  async function loadStampedExportStatus(reportPackage) {
    const response = await fetch(
      `/api/stamped-export?packageId=${encodeURIComponent(reportPackage.id)}`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "Unable to check stamped export status.");
    }
    updatePackageStampedExport(reportPackage.id, body.export);
    return body.export;
  }

  async function waitForStampedExport(reportPackage, selectedPhotos) {
    let exportRow = await requestStampedExport(reportPackage, selectedPhotos);
    if (exportRow?.status === "ready") return exportRow;
    if (!["queued", "generating"].includes(exportRow?.status)) {
      throw new Error("Stamped photos are not prepared yet.");
    }

    for (let attempt = 0; attempt < 45; attempt += 1) {
      await wait(2000);
      exportRow = await loadStampedExportStatus(reportPackage);
      if (exportRow?.status === "ready") return exportRow;
      if (["failed", "expired"].includes(exportRow?.status)) {
        throw new Error("Stamped photos are not prepared yet.");
      }
    }
    throw new Error("Stamped photos are still being prepared. Try again in a moment.");
  }

  async function handleDownloadStampedPhotos(reportPackage) {
    if (!session?.access_token) return;
    const actionId = `${reportPackage.id}:stamped:selected`;
    setExportActionId(actionId);
    setReportsError("");
    try {
      const photos = photosByPackageId[reportPackage.id] || (await loadOriginalPhotos(reportPackage));
      const selectedIds = selectedPhotoIdsByPackageId[reportPackage.id] || [];
      const selectedPhotos = photos.filter((photo) => selectedIds.includes(photo.id));
      if (selectedPhotos.length === 0) {
        throw new Error("Select at least one photo.");
      }
      await waitForStampedExport(reportPackage, selectedPhotos);

      if (selectedPhotos.length === 1) {
        const photo = selectedPhotos[0];
        const response = await fetch(
          `/api/stamped-photo-download?packageId=${encodeURIComponent(
            reportPackage.id
          )}&photoId=${encodeURIComponent(photo.id)}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Unable to prepare stamped photo download.");
        }
        const blob = await response.blob();
        if (!(await responseIsJpeg(response, blob))) {
          throw new Error("Stamped photo download did not return a JPEG.");
        }
        const filename = filenameFromDisposition(
          response.headers.get("content-disposition"),
          `${compactPhotoLabel(photo).replace(/[^A-Za-z0-9]+/g, "_")}.jpg`
        );
        triggerBlobDownload(blob, filename);
        return;
      }

      const allPackagePhotosSelected =
        photos.length > 0 && photos.every((photo) => selectedIds.includes(photo.id));
      const params = new URLSearchParams({ packageId: reportPackage.id });
      if (!allPackagePhotosSelected) {
        params.set("photoIds", selectedPhotos.map((photo) => photo.id).join(","));
      }

      const downloadResponse = await fetch(`/api/stamped-export-download?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (!downloadResponse.ok) {
        const downloadBody = await downloadResponse.json().catch(() => ({}));
        throw new Error(downloadBody.error || "Unable to prepare stamped photo download.");
      }
      const blob = await downloadResponse.blob();
      if (!(await responseIsZip(downloadResponse, blob))) {
        throw new Error("Stamped photos download did not return a ZIP.");
      }
      const filename = filenameFromDisposition(
        downloadResponse.headers.get("content-disposition"),
        "Stamped Photos.zip"
      );
      triggerBlobDownload(blob, filename);
    } catch (error) {
      setReportsError(downloadErrorMessage(error, "Unable to prepare stamped photo download."));
    } finally {
      setExportActionId("");
    }
  }

  function isPackageExpanded(reportPackage) {
    return Boolean(expandedPackageIds[reportPackage.id]);
  }

  async function loadOriginalPhotos(reportPackage) {
    if (!session?.access_token) return [];
    if (photosByPackageId[reportPackage.id]) return photosByPackageId[reportPackage.id];
    setPhotosLoadingId(reportPackage.id);
    setReportsError("");
    try {
      const response = await fetch(
        `/api/original-photos?packageId=${encodeURIComponent(reportPackage.id)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(body.photos)) {
        throw new Error(body.error || "Unable to load original photos.");
      }
      setPhotosByPackageId((current) => ({
        ...current,
        [reportPackage.id]: body.photos,
      }));
      return body.photos;
    } catch (error) {
      setReportsError(error.message || "Unable to load original photos.");
      return [];
    } finally {
      setPhotosLoadingId("");
    }
  }

  async function togglePackage(reportPackage) {
    const nextOpen = !isPackageExpanded(reportPackage);
    setExpandedPackageIds((current) => ({
      ...current,
      [reportPackage.id]: nextOpen,
    }));
    if (nextOpen) {
      await loadOriginalPhotos(reportPackage);
    }
  }

  function isPhotoSelected(reportPackage, photo) {
    return (selectedPhotoIdsByPackageId[reportPackage.id] || []).includes(photo.id);
  }

  function togglePhotoSelected(reportPackage, photo) {
    setSelectedPhotoIdsByPackageId((current) => {
      const existing = current[reportPackage.id] || [];
      const selected = existing.includes(photo.id)
        ? existing.filter((id) => id !== photo.id)
        : [...existing, photo.id];
      return {
        ...current,
        [reportPackage.id]: selected,
      };
    });
  }

  function selectAllPhotos(reportPackage) {
    const photos = visiblePhotos(reportPackage);
    setSelectedPhotoIdsByPackageId((current) => ({
      ...current,
      [reportPackage.id]: photos.map((photo) => photo.id),
    }));
  }

  function clearSelectedPhotos(reportPackage) {
    setSelectedPhotoIdsByPackageId((current) => ({
      ...current,
      [reportPackage.id]: [],
    }));
  }

  function allVisiblePhotosSelected(reportPackage) {
    const photos = visiblePhotos(reportPackage);
    const selectedIds = selectedPhotoIdsByPackageId[reportPackage.id] || [];
    return photos.length > 0 && photos.every((photo) => selectedIds.includes(photo.id));
  }

  function toggleSelectAllPhotos(reportPackage) {
    if (allVisiblePhotosSelected(reportPackage)) {
      clearSelectedPhotos(reportPackage);
    } else {
      selectAllPhotos(reportPackage);
    }
  }

  function isFlaggedOnly(reportPackage) {
    return Boolean(flaggedOnlyByPackageId[reportPackage.id]);
  }

  function toggleFlaggedOnly(reportPackage) {
    setFlaggedOnlyByPackageId((current) => ({
      ...current,
      [reportPackage.id]: !current[reportPackage.id],
    }));
  }

  function visiblePhotos(reportPackage) {
    const photos = photosByPackageId[reportPackage.id] || [];
    if (!isFlaggedOnly(reportPackage)) return photos;
    return photos.filter(photoHasIssueState);
  }

  function photoViewerPhotos(viewer) {
    if (!viewer) return [];
    const photos = visiblePhotos(viewer.reportPackage);
    return photos.length > 0 ? photos : [viewer.photo];
  }

  function movePhotoViewer(direction) {
    setActivePhotoViewer((current) => {
      if (!current) return current;
      const photos = photoViewerPhotos(current);
      if (photos.length < 2) return current;
      const currentIndex = photos.findIndex((photo) => photo.id === current.photo.id);
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (safeIndex + direction + photos.length) % photos.length;
      return {
        ...current,
        photo: photos[nextIndex],
      };
    });
  }

  function triggerDownload(downloadUrl, filename) {
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = filename || "";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function filenameFromDisposition(header, fallback) {
    const value = String(header || "");
    const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
    const asciiMatch = value.match(/filename="?([^";]+)"?/i);
    return asciiMatch?.[1] || fallback || "";
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    try {
      triggerDownload(url, filename);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function downloadErrorMessage(error, fallback) {
    const message = String(error?.message || "").trim();
    return !message || message === "Load failed" || message === "Failed to fetch"
      ? fallback
      : message;
  }

  async function responseIsJpeg(response, blob) {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/jpeg")) return false;
    const magic = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
    return magic[0] === 0xff && magic[1] === 0xd8 && magic[2] === 0xff;
  }

  async function responseIsZip(response, blob) {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("application/zip")) return false;
    const magic = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    return magic[0] === 0x50 && magic[1] === 0x4b && magic[2] === 0x03 && magic[3] === 0x04;
  }

  async function requestOriginalPhotoDownload(reportPackage, photo) {
    const response = await fetch(
      `/api/original-photo-download?packageId=${encodeURIComponent(
        reportPackage.id
      )}&photoId=${encodeURIComponent(photo.id)}`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.downloadUrl) {
      throw new Error(body.error || "Unable to prepare original photo download.");
    }
    return body;
  }

  async function handleDownloadOriginalPhotos(reportPackage, mode) {
    if (!session?.access_token) return;
    const actionId = `${reportPackage.id}:originals:${mode}`;
    setPhotoDownloadId(actionId);
    setReportsError("");
    try {
      const photos = photosByPackageId[reportPackage.id] || (await loadOriginalPhotos(reportPackage));
      const selectedIds = selectedPhotoIdsByPackageId[reportPackage.id] || [];
      const targets =
        mode === "selected"
          ? photos.filter((photo) => selectedIds.includes(photo.id))
          : photos;
      if (targets.length === 0) {
        throw new Error(
          mode === "selected"
            ? "Select at least one original photo."
            : "No original photos are available for this package."
        );
      }
      if (targets.length === 1) {
        const photo = targets[0];
        const body = await requestOriginalPhotoDownload(reportPackage, photo);
        triggerDownload(body.downloadUrl, body.filename);
        return;
      }

      const params = new URLSearchParams({ packageId: reportPackage.id });
      params.set("photoIds", targets.map((photo) => photo.id).join(","));
      const response = await fetch(`/api/original-photos-download?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Unable to prepare original photos download.");
      }
      const blob = await response.blob();
      if (!(await responseIsZip(response, blob))) {
        throw new Error("Original photos download did not return a ZIP.");
      }
      const filename = filenameFromDisposition(
        response.headers.get("content-disposition"),
        "Original Photos.zip"
      );
      triggerBlobDownload(blob, filename);
    } catch (error) {
      setReportsError(downloadErrorMessage(error, "Unable to prepare original photo downloads."));
    } finally {
      setPhotoDownloadId("");
    }
  }

  async function handleDownloadSingleOriginal(reportPackage, photo) {
    if (!session?.access_token) return;
    const actionId = `${reportPackage.id}:original:${photo.id}`;
    setPhotoDownloadId(actionId);
    setReportsError("");
    try {
      const body = await requestOriginalPhotoDownload(reportPackage, photo);
      triggerDownload(body.downloadUrl, body.filename);
    } catch (error) {
      setReportsError(downloadErrorMessage(error, "Unable to prepare original photo download."));
    } finally {
      setPhotoDownloadId("");
    }
  }

  const orgOptions = useMemo(() => {
    const optionsById = new Map();
    for (const org of orgs) {
      if (org?.id) optionsById.set(org.id, org);
    }
    for (const reportPackage of packages) {
      const org = reportPackage.org;
      if (org?.id && !optionsById.has(org.id)) {
        optionsById.set(org.id, org);
      }
    }
    return Array.from(optionsById.values()).sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );
  }, [orgs, packages]);

  const reportsContextSettled =
    reportsFetchStatus !== FETCH_IDLE &&
    reportsFetchStatus !== FETCH_LOADING &&
    orgsFetchStatus !== FETCH_IDLE &&
    orgsFetchStatus !== FETCH_LOADING;
  const reportsPropertyContextReady =
    reportsContextSettled && reportsFetchStatus === FETCH_SUCCESS;

  useEffect(() => {
    if (!session?.access_token || !reportsContextSettled) return;
    if (orgOptions.length === 0) {
      if (selectedOrgId) setSelectedOrgId("");
      return;
    }
    if (selectedOrgId && orgOptions.some((org) => org.id === selectedOrgId)) return;

    const savedContext = readPortalContext(session);
    const savedOrgId = orgOptions.some((org) => org.id === savedContext.orgId)
      ? savedContext.orgId
      : "";
    setSelectedOrgId(savedOrgId || orgOptions[0].id);
  }, [orgOptions, reportsContextSettled, selectedOrgId, session]);

  const selectedOrg = useMemo(
    () => orgOptions.find((org) => org.id === selectedOrgId) || null,
    [orgOptions, selectedOrgId]
  );

  const orgFilteredPackages = useMemo(() => {
    if (!selectedOrgId) return packages;
    return packages.filter((reportPackage) => reportPackage.org?.id === selectedOrgId);
  }, [packages, selectedOrgId]);

  const propertyOptions = useMemo(() => {
    const optionsById = new Map();
    for (const reportPackage of orgFilteredPackages) {
      const property = reportPackage.property;
      const id = property?.id;
      if (id && !optionsById.has(id)) {
        optionsById.set(id, property);
      }
    }
    return Array.from(optionsById.values()).sort((a, b) =>
      propertyOptionLabel(a).localeCompare(propertyOptionLabel(b))
    );
  }, [orgFilteredPackages]);

  useEffect(() => {
    if (!session?.access_token || !reportsPropertyContextReady) return;

    const savedContext = readPortalContext(session);
    if (
      savedContext.propertyId &&
      savedContext.propertyId !== ALL_PROPERTIES &&
      propertyOptions.some((property) => property.id === savedContext.propertyId) &&
      selectedPropertyId !== savedContext.propertyId
    ) {
      setSelectedPropertyId(savedContext.propertyId);
      return;
    }

    if (
      selectedPropertyId !== ALL_PROPERTIES &&
      !propertyOptions.some((property) => property.id === selectedPropertyId)
    ) {
      setSelectedPropertyId(ALL_PROPERTIES);
    }
  }, [propertyOptions, reportsPropertyContextReady, selectedPropertyId, session]);

  useEffect(() => {
    if (!session?.access_token || !reportsPropertyContextReady || !selectedOrgId) return;
    if (!orgOptions.some((org) => org.id === selectedOrgId)) return;
    if (
      selectedPropertyId !== ALL_PROPERTIES &&
      !propertyOptions.some((property) => property.id === selectedPropertyId)
    ) {
      return;
    }

    writePortalContext(session, {
      orgId: selectedOrgId,
      propertyId: selectedPropertyId,
    });
  }, [
    orgOptions,
    propertyOptions,
    reportsPropertyContextReady,
    selectedOrgId,
    selectedPropertyId,
    session,
  ]);

  const selectedProperty = useMemo(
    () => propertyOptions.find((property) => property.id === selectedPropertyId) || null,
    [propertyOptions, selectedPropertyId]
  );

  const propertyFilteredPackages = useMemo(() => {
    if (selectedPropertyId === ALL_PROPERTIES) return orgFilteredPackages;
    return orgFilteredPackages.filter(
      (reportPackage) => reportPackage.property?.id === selectedPropertyId
    );
  }, [orgFilteredPackages, selectedPropertyId]);

  const latestPackageIdsForPropertyFilter = useMemo(() => {
    const newestByProperty = new Map();
    for (const reportPackage of propertyFilteredPackages) {
      const propertyId = packagePropertyKey(reportPackage);
      const timestampMs = packageTimestampMs(reportPackage);
      const current = newestByProperty.get(propertyId);
      if (!current || timestampMs > current.timestampMs) {
        newestByProperty.set(propertyId, {
          id: reportPackage.id,
          timestampMs,
        });
      }
    }
    return new Set(Array.from(newestByProperty.values()).map((entry) => entry.id));
  }, [propertyFilteredPackages]);

  const filteredPackages = useMemo(() => {
    if (dateFilter === DATE_FILTER_ALL) return propertyFilteredPackages;
    return propertyFilteredPackages.filter((reportPackage) =>
      latestPackageIdsForPropertyFilter.has(reportPackage.id)
    );
  }, [dateFilter, latestPackageIdsForPropertyFilter, propertyFilteredPackages]);

  const orgSelectionSettled =
    orgOptions.length === 0 ||
    Boolean(selectedOrgId && orgOptions.some((org) => org.id === selectedOrgId));
  const propertySelectionSettled =
    selectedPropertyId === ALL_PROPERTIES ||
    propertyOptions.some((property) => property.id === selectedPropertyId);
  const reportsViewSettled =
    reportsFetchStatus === FETCH_SUCCESS &&
    orgsFetchStatus === FETCH_SUCCESS &&
    orgSelectionSettled &&
    propertySelectionSettled;
  const hasActiveLoadError =
    reportsFetchStatus === FETCH_ERROR || orgsFetchStatus === FETCH_ERROR;

  const packageCountLabel = useMemo(() => {
    if (filteredPackages.length === 1) return "1 ready package";
    return `${filteredPackages.length} ready packages`;
  }, [filteredPackages.length]);

  const sessionReportsStatusLabel = useMemo(() => {
    if (reportsViewSettled) return packageCountLabel;
    if (hasActiveLoadError) return "Report packages unavailable";
    return "Loading ready packages";
  }, [hasActiveLoadError, packageCountLabel, reportsViewSettled]);

  const newestPackageIds = useMemo(() => {
    const newestByProperty = new Map();
    for (const reportPackage of orgFilteredPackages) {
      const propertyId = packagePropertyKey(reportPackage);
      const timestampMs = packageTimestampMs(reportPackage);
      const current = newestByProperty.get(propertyId);
      if (!current || timestampMs > current.timestampMs) {
        newestByProperty.set(propertyId, {
          id: reportPackage.id,
          timestampMs,
        });
      }
    }
    return new Set(
      Array.from(newestByProperty.values()).map((entry) => entry.id)
    );
  }, [orgFilteredPackages]);

  const propertyGroups = useMemo(() => {
    const groups = new Map();
    for (const reportPackage of filteredPackages) {
      const propertyId = packagePropertyKey(reportPackage);
      if (!groups.has(propertyId)) {
        groups.set(propertyId, {
          id: propertyId,
          org: reportPackage.org || null,
          property: reportPackage.property || null,
          packages: [],
        });
      }
      groups.get(propertyId).packages.push(reportPackage);
    }
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        packages: [...group.packages].sort(
          (left, right) => packageTimestampMs(right) - packageTimestampMs(left)
        ),
      }))
      .sort((left, right) =>
        propertyLine(left.property).localeCompare(propertyLine(right.property))
      );
  }, [filteredPackages]);

  const emptyPackagesMessage = useMemo(() => {
    if (orgFilteredPackages.length === 0) {
      return selectedOrg?.name
        ? `No ready PDF packages are available for ${selectedOrg.name}.`
        : "No ready PDF packages are available for this account.";
    }
    if (propertyFilteredPackages.length === 0 && selectedProperty) {
      return `No ready PDF packages are available for ${propertyLine(selectedProperty)}.`;
    }
    if (dateFilter === DATE_FILTER_LATEST) {
      return "No packages match Latest Only for the selected property filter.";
    }
    return "No packages match the selected filters.";
  }, [
    dateFilter,
    orgFilteredPackages.length,
    propertyFilteredPackages.length,
    selectedOrg,
    selectedProperty,
  ]);

  return (
    <div
      style={{ "--brand": BRAND.brandNavy, "--brand-ink": "#23243A" }}
      className="min-h-screen bg-slate-50 text-foreground"
    >
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <a href="/" className="inline-flex items-center">
            <img
              src={BRAND.logos.wordmarkOnly}
              alt="SCOUT"
              className="h-10 w-auto object-contain md:h-11"
              loading="eager"
            />
          </a>
          <div className="flex items-center gap-2">
            <a
              href="/punch-list"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground/75 shadow-sm hover:text-foreground"
            >
              <ClipboardList className="h-4 w-4" />
              Punch List
            </a>
            {session && (
              <>
              {canOpenAdmin && (
                <a
                  href="/admin/portal-access"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground/75 shadow-sm hover:text-foreground"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Admin
                </a>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground/75 shadow-sm hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
        <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <div className="text-sm font-medium text-[var(--brand)]">
              Client Portal
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
              Reports
            </h1>
            {session && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                {orgOptions.length > 1 && (
                  <label className="grid gap-1 text-xs font-semibold text-foreground/60">
                    Organization
                    <select
                      value={selectedOrgId}
                      onChange={(event) => {
                        const nextOrgId = event.target.value;
                        setSelectedOrgId(nextOrgId);
                        setSelectedPropertyId(ALL_PROPERTIES);
                        writePortalContext(session, {
                          orgId: nextOrgId,
                          propertyId: ALL_PROPERTIES,
                        });
                      }}
                      disabled={orgsLoading}
                      className="h-9 max-w-[220px] rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                    >
                      {orgOptions.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name || "Organization"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="grid gap-1 text-xs font-semibold text-foreground/60">
                  Property
                  <select
                    value={selectedPropertyId}
                    onChange={(event) => {
                      setSelectedPropertyId(event.target.value);
                      writePortalContext(session, {
                        orgId: selectedOrgId,
                        propertyId: event.target.value,
                      });
                    }}
                    disabled={reportsLoading || propertyOptions.length === 0}
                    className="h-9 max-w-[280px] rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                  >
                    <option value={ALL_PROPERTIES}>All Properties</option>
                    {propertyOptions.map((property) => (
                      <option key={property.id} value={property.id}>
                        {propertyOptionLabel(property)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-foreground/60">
                  Date
                  <select
                    value={dateFilter}
                    onChange={(event) => setDateFilter(event.target.value)}
                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                  >
                    <option value={DATE_FILTER_LATEST}>Latest Only</option>
                    <option value={DATE_FILTER_ALL}>All Dates</option>
                  </select>
                </label>
              </div>
            )}
          </div>
          {session && (
            <button
              type="button"
              onClick={() => {
                loadReports();
                loadOrgs();
              }}
              disabled={reportsLoading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${reportsLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          )}
        </div>

        {authLoading && (
          <div className="rounded-lg border border-border bg-background p-6 text-sm text-foreground/70 shadow-sm">
            Checking session...
          </div>
        )}

        {!authLoading && !session && (
          <form
            onSubmit={handleSignIn}
            className="max-w-md rounded-lg border border-border bg-background p-5 shadow-sm"
          >
            <div className="text-base font-semibold text-foreground">
              Sign in to view reports
            </div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-base outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-base outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                />
              </label>
            </div>
            {authError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {authError}
              </p>
            )}
            <button
              type="submit"
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm"
            >
              Sign In
            </button>
            <a
              href="/forgot-password"
              className="mt-3 block text-center text-sm font-semibold text-[var(--brand)] hover:underline"
            >
              Forgot password?
            </a>
          </form>
        )}

        {session && (
          <section className="grid gap-4">
            <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground/70 shadow-sm">
              Signed in as{" "}
              <span className="font-semibold text-foreground">
                {session.user?.email || "authenticated user"}
              </span>
              . {sessionReportsStatusLabel}.
            </div>

            {reportsError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {reportsError}
              </div>
            )}

            {reportsViewSettled && filteredPackages.length === 0 && (
              <div className="rounded-lg border border-border bg-background p-6 text-sm text-foreground/70 shadow-sm">
                {emptyPackagesMessage}
              </div>
            )}

            {reportsViewSettled && propertyGroups.map((group) => (
              <div key={group.id} className="grid gap-3">
                {group.packages.map((reportPackage) => (
                  <article
                    key={reportPackage.id}
                    className="rounded-lg border border-border bg-background p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="min-w-0 text-lg tracking-tight">
                          <span className="font-semibold text-foreground">
                            {packageTitle(reportPackage)}
                          </span>
                          {packageDateTime(reportPackage) && (
                            <>
                              <span className="font-normal text-foreground/45">
                                {" · "}
                              </span>
                              <span className="font-normal text-foreground/60">
                                {packageDateTime(reportPackage)}
                              </span>
                            </>
                          )}
                        </div>
                        {propertyAddressLine(reportPackage.property) && (
                          <div className="mt-0.5 text-xs font-normal leading-snug text-foreground/50">
                            {propertyAddressLine(reportPackage.property)}
                          </div>
                        )}
                        <div className="mt-1 text-sm text-foreground/60">
                          {packageSummary(reportPackage)}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {newestPackageIds.has(reportPackage.id) && (
                          <span
                            className="inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold shadow-sm"
                            style={{
                              backgroundColor: "#EFF6FF",
                              borderColor: "#2563EB",
                              color: "#2563EB",
                            }}
                          >
                            Newest
                          </span>
                        )}
                        <span className="inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          Ready
                        </span>
                        <button
                          type="button"
                          onClick={() => togglePackage(reportPackage)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground/70 shadow-sm hover:text-foreground"
                        >
                          {isPackageExpanded(reportPackage) ? "Collapse" : "Expand"}
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${
                              isPackageExpanded(reportPackage) ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {isPackageExpanded(reportPackage) && (
                      <div className="mt-4 grid gap-3">
                        <section>
                          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                            <FileText className="h-4 w-4 text-[var(--brand)]" />
                            Reports
                            <span className="text-xs font-medium text-foreground/55">
                              {countLabel(reportPackage.files.length, "PDF")}
                            </span>
                          </div>
                          <div className="grid gap-2 md:grid-cols-3">
                            {[...reportPackage.files]
                              .sort(
                                (left, right) =>
                                  (REPORT_ORDER[left.reportType] ?? 99) -
                                  (REPORT_ORDER[right.reportType] ?? 99)
                              )
                              .map((file) => {
                                const reportName = REPORT_LABELS[file.reportType] || file.label;
                                const reportDetails = [
                                  file.pageCount ? `${file.pageCount} pages` : "",
                                  file.byteSize ? formatBytes(file.byteSize) : "",
                                ].filter(Boolean);
                                const reportText = [reportName, ...reportDetails].join(" · ");
                                return (
                                  <button
                                    key={file.id}
                                    type="button"
                                    onClick={() => handleDownload(file)}
                                    disabled={downloadId === file.id}
                                    className="flex h-10 items-center justify-between gap-3 rounded-lg bg-[var(--brand)] px-3 text-left text-white shadow-sm transition hover:bg-[var(--brand)]/95 disabled:opacity-60"
                                    aria-label={`Download ${reportName}`}
                                  >
                                    <span
                                      className="min-w-0 flex-1 text-sm font-semibold text-white"
                                      style={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {reportText}
                                    </span>
                                    <span className="inline-flex shrink-0 items-center text-white/90">
                                      <Download className="h-3.5 w-3.5" />
                                    </span>
                                  </button>
                                );
                              })}
                          </div>
                        </section>

                        <section>
                          <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                              <Camera className="h-4 w-4 text-[var(--brand)]" />
                              Photos
                              <span className="text-xs font-medium text-foreground/55">
                                {countLabel(reportPackage.originalPhotoCount || 0, "photo", "photos")}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {(selectedPhotoIdsByPackageId[reportPackage.id] || []).length > 0 && (
                                <span className="text-xs font-medium text-foreground/55">
                                  {(selectedPhotoIdsByPackageId[reportPackage.id] || []).length} selected
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleFlaggedOnly(reportPackage)}
                                className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold ${
                                  isFlaggedOnly(reportPackage)
                                    ? "border-red-200 bg-red-50 text-red-700"
                                    : "border-border bg-background text-foreground/70"
                                }`}
                              >
                                <Flag
                                  className={`h-3.5 w-3.5 ${
                                    isFlaggedOnly(reportPackage) ? "fill-red-600 text-red-600" : ""
                                  }`}
                                />
                                Flagged only
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleSelectAllPhotos(reportPackage)}
                                disabled={visiblePhotos(reportPackage).length === 0}
                                className="h-8 rounded-lg border px-3 text-xs font-semibold shadow-sm disabled:opacity-50"
                                style={
                                  allVisiblePhotosSelected(reportPackage)
                                    ? {
                                        backgroundColor: "#EFF6FF",
                                        borderColor: "#2563EB",
                                        color: "#2563EB",
                                      }
                                    : {
                                        backgroundColor: "white",
                                        borderColor: "var(--border)",
                                        color: "rgba(15, 23, 42, 0.7)",
                                      }
                                }
                              >
                                Select All
                              </button>
                            </div>
                          </div>
                          {photosLoadingId === reportPackage.id && (
                            <div className="rounded-lg border border-border bg-slate-50 p-4 text-sm text-foreground/60">
                              Loading photos...
                            </div>
                          )}
                          {!photosLoadingId &&
                            (photosByPackageId[reportPackage.id] || []).length === 0 && (
                              <div className="rounded-lg border border-border bg-slate-50 p-4 text-sm text-foreground/60">
                                No photos are available for this package.
                              </div>
                            )}
                          {(photosByPackageId[reportPackage.id] || []).length > 0 &&
                            visiblePhotos(reportPackage).length === 0 && (
                              <div className="rounded-lg border border-border bg-slate-50 p-4 text-sm text-foreground/60">
                                No flagged photos are available for this package.
                              </div>
                          )}
                          {visiblePhotos(reportPackage).length > 0 && (
                            <div
                              className="grid gap-3"
                              style={{
                                gridTemplateColumns:
                                  "repeat(auto-fill, minmax(180px, 190px))",
                              }}
                            >
                              {visiblePhotos(reportPackage).map((photo) => {
                                const selected = isPhotoSelected(reportPackage, photo);
                                const photoLabel = compactPhotoLabel(photo);
                                const resolved = photoIsResolved(photo);
                                const flagged = photoIsFlagged(photo);
                                return (
                                  <div key={photo.id} className="min-w-0">
                                    <div
                                      className={`relative overflow-hidden rounded-lg bg-slate-100 shadow-sm transition ${
                                        selected
                                          ? "ring-2 ring-[var(--brand)] ring-offset-2"
                                          : "ring-1 ring-border"
                                      }`}
                                      style={{
                                        aspectRatio: "1 / 1",
                                        position: "relative",
                                        width: "100%",
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setActivePhotoViewer({ reportPackage, photo })
                                        }
                                        className="absolute inset-0 block h-full w-full text-left"
                                        style={{ cursor: "zoom-in", zIndex: 1 }}
                                        aria-label={`Open ${photoLabel}`}
                                      >
                                        {photo.previewUrl ? (
                                          <img
                                            src={photo.previewUrl}
                                            alt={photoLabel}
                                            className="h-full w-full rounded-lg bg-slate-100"
                                            style={{ objectFit: "cover", position: "relative", zIndex: 1 }}
                                          />
                                        ) : (
                                          <span
                                            className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg bg-slate-100 text-center text-[11px] font-medium text-foreground/45"
                                            style={{ position: "relative", zIndex: 1 }}
                                          >
                                            <Camera className="h-5 w-5" />
                                            Original Photo
                                          </span>
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        role="checkbox"
                                        aria-label={`Select ${photoLabel}`}
                                        aria-checked={selected}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          togglePhotoSelected(reportPackage, photo);
                                        }}
                                        className={`absolute left-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border-2 shadow-md ${
                                          selected
                                            ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                                            : "border-white bg-white/95 text-transparent ring-1 ring-slate-900/25"
                                        }`}
                                        style={{
                                          alignItems: "center",
                                          background: selected ? "#111827" : "rgba(255,255,255,0.96)",
                                          border: selected ? "2px solid #111827" : "2px solid white",
                                          borderRadius: "5px",
                                          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.25)",
                                          color: selected ? "white" : "transparent",
                                          display: "inline-flex",
                                          height: "20px",
                                          justifyContent: "center",
                                          left: "6px",
                                          position: "absolute",
                                          top: "6px",
                                          width: "20px",
                                          zIndex: 20,
                                        }}
                                      >
                                        <Check
                                          className="h-3.5 w-3.5"
                                          strokeWidth={4.5}
                                          style={{
                                            filter: "drop-shadow(0 0 1px rgba(255,255,255,0.65))",
                                          }}
                                        />
                                      </button>
                                      {resolved ? (
                                        <span
                                          className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/95 shadow-md ring-1 ring-green-100"
                                          style={{
                                            alignItems: "center",
                                            background: "rgba(255,255,255,0.96)",
                                            borderRadius: "9999px",
                                            boxShadow: "0 2px 8px rgba(15, 23, 42, 0.22)",
                                            display: "inline-flex",
                                            height: "22px",
                                            justifyContent: "center",
                                            position: "absolute",
                                            right: "6px",
                                            top: "6px",
                                            width: "22px",
                                            zIndex: 20,
                                          }}
                                        >
                                          <Check
                                            className="h-3.5 w-3.5"
                                            strokeWidth={4}
                                            style={{
                                              color: "#16a34a",
                                            }}
                                          />
                                        </span>
                                      ) : flagged && (
                                        <span
                                          className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/95 shadow-md ring-1 ring-red-100"
                                          style={{
                                            alignItems: "center",
                                            background: "rgba(255,255,255,0.96)",
                                            borderRadius: "9999px",
                                            boxShadow: "0 2px 8px rgba(15, 23, 42, 0.22)",
                                            display: "inline-flex",
                                            height: "22px",
                                            justifyContent: "center",
                                            position: "absolute",
                                            right: "6px",
                                            top: "6px",
                                            width: "22px",
                                            zIndex: 20,
                                          }}
                                        >
                                          <Flag
                                            className="h-3.5 w-3.5"
                                            style={{
                                              color: "#dc2626",
                                              fill: "#dc2626",
                                              transform: "scale(0.82)",
                                            }}
                                          />
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      className="mt-1 text-[10px] font-medium leading-tight text-foreground/70"
                                      title={photoLabel}
                                      style={{
                                        fontSize: "10.5px",
                                        overflow: "hidden",
                                        textAlign: "center",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {photoLabel}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>

                        {(() => {
                          const selectedCount =
                            (selectedPhotoIdsByPackageId[reportPackage.id] || []).length;
                          const hasSelection = selectedCount > 0;
                          const allVisibleSelected = allVisiblePhotosSelected(reportPackage);
                          const originalLabel =
                            selectedCount === 1
                              ? "Download Original Photo"
                              : allVisibleSelected
                                ? "Download All Original Photos"
                                : "Download Selected Original Photos";
                          const stampedLabel =
                            selectedCount === 1
                              ? "Download Stamped Photo"
                              : allVisibleSelected
                                ? "Download All Stamped Photos"
                                : "Download Selected Stamped Photos";
                          const stampedActionId = `${reportPackage.id}:stamped:selected`;
                          const isStampingPhotos = exportActionId === stampedActionId;

                          return hasSelection ? (
                            <section>
                              <div
                                className="flex w-full flex-wrap items-center justify-end gap-2"
                                style={{
                                  display: "flex",
                                  justifyContent: "flex-end",
                                  width: "100%",
                                }}
                              >
                                <span className="text-xs font-medium text-foreground/55">
                                  {selectedCount} selected
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDownloadOriginalPhotos(reportPackage, "selected")
                                  }
                                  disabled={
                                    photoDownloadId === `${reportPackage.id}:originals:selected`
                                  }
                                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                                >
                                  {originalLabel}
                                  <Download className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadStampedPhotos(reportPackage)}
                                  disabled={isStampingPhotos}
                                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                                >
                                  {isStampingPhotos ? "Stamping Photos..." : stampedLabel}
                                  <Download className="h-4 w-4" />
                                </button>
                              </div>
                            </section>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ))}
          </section>
        )}
      </main>

      {activePhotoViewer &&
        (() => {
          const viewerPhotos = photoViewerPhotos(activePhotoViewer);
          const currentIndex = viewerPhotos.findIndex(
            (photo) => photo.id === activePhotoViewer.photo.id
          );
          const canNavigate = viewerPhotos.length > 1;
          const hasPreview = Boolean(activePhotoViewer.photo.previewUrl);
          const activePhotoLabel = compactPhotoLabel(activePhotoViewer.photo);
          const activePhotoFlagged = Boolean(
            photoIsFlagged(activePhotoViewer.photo)
          );
          const activePhotoResolved = photoIsResolved(activePhotoViewer.photo);
          const activePhotoFlaggedReason = photoFlaggedReason(activePhotoViewer.photo);
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-label={activePhotoLabel}
              onClick={() => setActivePhotoViewer(null)}
            >
              <div
                className="relative flex flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/10"
                style={{
                  maxHeight: "88vh",
                  width: "min(1100px, 92vw)",
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div
                  className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 text-slate-900"
                  style={{
                    alignItems: "center",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadSingleOriginal(
                        activePhotoViewer.reportPackage,
                        activePhotoViewer.photo
                      )
                    }
                    disabled={
                      photoDownloadId ===
                      `${activePhotoViewer.reportPackage.id}:original:${activePhotoViewer.photo.id}`
                    }
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                  >
                    Download Original
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePhotoViewer(null)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-900 shadow-sm hover:bg-slate-50"
                    aria-label="Close photo viewer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div
                  className={`min-h-0 flex-1 items-center gap-3 px-4 py-5 ${
                    hasPreview ? "bg-slate-900" : "bg-slate-100"
                  }`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "52px minmax(0, 1fr) 52px",
                    maxHeight: "72vh",
                  }}
                >
                  <div className="flex justify-center">
                    {canNavigate && (
                      <button
                        type="button"
                        onClick={() => movePhotoViewer(-1)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-lg hover:bg-slate-50"
                        aria-label="Previous photo"
                      >
                        <ChevronLeft className="h-6 w-6" />
                      </button>
                    )}
                  </div>
                  <div className="flex min-w-0 justify-center">
                    {activePhotoViewer.photo.previewUrl ? (
                      <img
                        src={activePhotoViewer.photo.previewUrl}
                        alt={activePhotoLabel}
                        className="rounded-md object-contain shadow-2xl"
                        style={{
                          maxHeight: "72vh",
                          maxWidth: "100%",
                        }}
                      />
                    ) : (
                      <div className="flex min-h-64 w-full max-w-lg flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-slate-600 shadow-xl">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                          <Camera className="h-6 w-6" />
                        </div>
                        <div className="mt-1 max-w-full text-base font-semibold text-slate-900">
                          {activePhotoLabel}
                        </div>
                        <div className="text-sm font-semibold">Preview unavailable</div>
                        <div className="max-w-md text-sm">
                          This original can still be downloaded.
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-center">
                    {canNavigate && (
                      <button
                        type="button"
                        onClick={() => movePhotoViewer(1)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-lg hover:bg-slate-50"
                        aria-label="Next photo"
                      >
                        <ChevronRight className="h-6 w-6" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-200 bg-white px-4 py-3.5 text-center">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {activePhotoLabel}
                  </div>
                  {activePhotoResolved ? (
                    <div className="mt-1.5 flex justify-center text-xs font-semibold text-green-700">
                      <span className="inline-flex max-w-full items-center justify-center gap-1">
                        <Check className="h-3.5 w-3.5 text-green-600" strokeWidth={4} />
                        <span className="truncate">
                          {activePhotoFlaggedReason
                            ? `Resolved: ${activePhotoFlaggedReason}`
                            : "Resolved"}
                        </span>
                      </span>
                    </div>
                  ) : activePhotoFlagged && (
                    <div className="mt-1.5 flex justify-center text-xs font-semibold text-red-700">
                      <span className="inline-flex max-w-full items-center justify-center gap-1">
                        <Flag className="h-3.5 w-3.5 fill-red-600 text-red-600" />
                        <span className="truncate">
                          {activePhotoFlaggedReason
                            ? `Flagged: ${activePhotoFlaggedReason}`
                            : "Flagged"}
                        </span>
                      </span>
                    </div>
                  )}
                  <div className="mt-1.5 text-xs text-slate-500">
                    {canNavigate && currentIndex >= 0 && (
                      <span>
                        {currentIndex + 1} of {viewerPhotos.length}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

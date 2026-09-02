import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  FileText,
  Flag,
  ImageUp,
  LogOut,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "./lib/supabaseClient";
import { readPortalContext, writePortalContext } from "./lib/portalContext";

const BRAND = {
  siteTitle: "Punch List | SCOUT",
  brandNavy: "#1C2742",
  logos: {
    wordmarkOnly: "/Scout Only Logo Navy Dark NEW.png",
  },
};

const ALL = "all";
const TAB_OPEN = "open";
const TAB_RESOLVED = "resolved";
const PUNCH_CACHE_TTL_MS = 3 * 60 * 1000;
const MAX_COMPLETION_PHOTO_BYTES = 25 * 1024 * 1024;
const COMPLETION_PHOTO_ACCEPT = "image/jpeg,image/jpg,image/png,image/heic,image/heif,image/webp,.jpg,.jpeg,.png,.heic,.heif,.webp";

const punchListFilterCache = new Map();
const punchListRowsCache = new Map();
const punchListViewCache = new Map();

function cacheGet(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(cache, key, value) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + PUNCH_CACHE_TTL_MS,
  });
}

function clearPunchListCaches() {
  punchListFilterCache.clear();
  punchListRowsCache.clear();
  punchListViewCache.clear();
}

function sessionCacheScope(session) {
  return session?.user?.id || session?.user?.email || "anonymous";
}

function normalizedCacheValue(value) {
  return value || ALL;
}

function buildFilterCacheKey(session) {
  return [sessionCacheScope(session), "filters"].join("|");
}

function buildRowsScopeKey(session, orgId, propertyId) {
  return [
    sessionCacheScope(session),
    "rows",
    normalizedCacheValue(orgId),
    normalizedCacheValue(propertyId),
  ].join("|");
}

function buildRowsFilterKey(session, orgId, propertyId, tab, priority, trade) {
  return [
    sessionCacheScope(session),
    "view",
    normalizedCacheValue(orgId),
    normalizedCacheValue(propertyId),
    normalizedCacheValue(tab),
    normalizedCacheValue(priority),
    normalizedCacheValue(trade),
  ].join("|");
}

function clearViewCacheForRowsScope(session, orgId, propertyId) {
  const prefix = [
    sessionCacheScope(session),
    "view",
    normalizedCacheValue(orgId),
    normalizedCacheValue(propertyId),
  ].join("|");
  for (const key of punchListViewCache.keys()) {
    if (key === prefix || key.startsWith(`${prefix}|`)) {
      punchListViewCache.delete(key);
    }
  }
}

function patchCachedPunchListRows(session, rowId, patch) {
  const sessionPrefix = `${sessionCacheScope(session)}|`;
  const now = Date.now();
  for (const [key, entry] of punchListRowsCache.entries()) {
    if (!key.startsWith(sessionPrefix)) continue;
    if (!entry || now > entry.expiresAt) {
      punchListRowsCache.delete(key);
      continue;
    }
    if (!Array.isArray(entry.value) || !entry.value.some((row) => row.id === rowId)) continue;
    punchListRowsCache.set(key, {
      ...entry,
      value: entry.value.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    });
  }
  for (const key of punchListViewCache.keys()) {
    if (key.startsWith(sessionPrefix)) punchListViewCache.delete(key);
  }
}

function patchRowList(rows, rowId, patch) {
  return rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row));
}

const PRIORITY_LABELS = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};
const PRIORITY_OPTIONS = [
  { id: "critical", label: "Critical" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];
const STATUS_OPTIONS = [
  { id: "active", label: "Active" },
  { id: "resolved", label: "Resolved" },
];

const TRADE_LABELS = {
  carpentry: "Carpentry",
  concrete: "Concrete",
  doors: "Doors",
  drywall: "Drywall",
  electrical: "Electrical",
  fire_protection: "Fire Protection",
  flooring: "Flooring",
  general: "General",
  gutters: "Gutters",
  hvac: "HVAC",
  landscaping: "Landscaping",
  masonry: "Masonry",
  other: "Other",
  paint: "Paint",
  painting: "Painting",
  plumbing: "Plumbing",
  roofing: "Roofing",
  siding: "Siding",
  sitework: "Sitework",
  steel: "Steel",
  windows: "Windows",
};
const ELEVATION_ORDER = ["interior", "north", "south", "east", "west"];
const ELEVATION_LABELS = {
  interior: "Interior",
  north: "North",
  south: "South",
  east: "East",
  west: "West",
};

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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

function localDateFromDateOnly(value) {
  const match = textValue(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function todayDateOnly() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDueDate(value) {
  const date = localDateFromDateOnly(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
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

function formatRefreshTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function textValue(value) {
  const text = String(value || "").trim();
  return text || "";
}

function optionLabel(value, labels) {
  const key = textValue(value).toLowerCase();
  return labels[key] || textValue(value) || "General";
}

function filenameFromContentDisposition(value, fallback) {
  const header = textValue(value);
  const encodedMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return fallback;
    }
  }
  const match = header.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

function readableToken(value) {
  return textValue(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value) {
  return readableToken(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word.toLowerCase() === "hvac") return "HVAC";
      return `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

function tradeKey(value) {
  return textValue(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeWorkflowFieldValue(field, value) {
  if (field === "priority") return textValue(value).toLowerCase() || "medium";
  if (field === "status") return textValue(value).toLowerCase() === "resolved" ? "resolved" : "active";
  if (field === "trade") return tradeKey(value) || "general";
  if (field === "dueDate") {
    const dateValue = textValue(value);
    return localDateFromDateOnly(dateValue) ? dateValue : null;
  }
  return value;
}

function completionMimeTypeForFile(file) {
  const explicitType = textValue(file?.type).toLowerCase();
  const extension = textValue(file?.name).split(".").pop()?.toLowerCase();
  if (explicitType && explicitType !== "application/octet-stream") {
    if (explicitType === "image/jpg" || explicitType === "image/pjpeg") return "image/jpeg";
    return explicitType;
  }
  if (extension === "png") return "image/png";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

function validateCompletionFile(file) {
  if (!file) return "Choose a completion photo.";
  const mimeType = completionMimeTypeForFile(file);
  if (!["image/jpeg", "image/jpg", "image/png", "image/heic", "image/heif", "image/webp"].includes(mimeType)) {
    return "Completion photo must be a JPEG, PNG, HEIC, HEIF, or WebP image.";
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_COMPLETION_PHOTO_BYTES) {
    return "Completion photo must be 25 MB or smaller.";
  }
  return "";
}

function completionFileLabel(file) {
  if (!file) return "";
  const sizeLabel = Number.isFinite(file.size) && file.size > 0
    ? `${Math.max(1, Math.round(file.size / 1024))} KB`
    : "";
  return [file.name || "Completion photo", sizeLabel].filter(Boolean).join(" · ");
}

function workflowPatch(field, value) {
  if (!field) return {};
  return { [field]: normalizeWorkflowFieldValue(field, value) };
}

function readableDetail(value) {
  return textValue(value)
    .replace(/[_-]+/g, " / ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedOptionId(value) {
  return readableToken(value).toLowerCase();
}

function readableDetailLabel(value) {
  return readableDetail(value).toUpperCase();
}

function tradeOptionFromApi(option) {
  const id = tradeKey(option?.key || option?.id || option?.name || option?.label);
  if (!id) return null;
  return {
    id,
    label: textValue(option?.label || option?.name) || titleCase(id),
    value: option,
  };
}

function tradeLabel(value, options = []) {
  const key = tradeKey(value);
  const option = (options || []).find((item) => item?.id === key);
  return option?.label || TRADE_LABELS[key] || titleCase(key) || "General";
}

function elevationLabel(value) {
  const key = normalizedOptionId(value);
  return ELEVATION_LABELS[key] || readableToken(value);
}

function elevationOptionCompare(left, right) {
  const leftIndex = ELEVATION_ORDER.indexOf(left.id);
  const rightIndex = ELEVATION_ORDER.indexOf(right.id);
  const leftKnown = leftIndex >= 0;
  const rightKnown = rightIndex >= 0;
  if (leftKnown && rightKnown && leftIndex !== rightIndex) return leftIndex - rightIndex;
  if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
  return left.label.localeCompare(right.label);
}

function uppercaseLine(parts) {
  return parts
    .map(textValue)
    .filter(Boolean)
    .join(" | ")
    .toUpperCase();
}

function propertyLine(property) {
  if (!property) return "Property";
  const cityState = [property.city, property.state].filter(Boolean).join(", ");
  const address = [property.addressLine1, cityState, property.postalCode]
    .filter(Boolean)
    .join(" ");
  return property.name || address || "Property";
}

function propertyAddressLine(property) {
  if (!property) return "";
  const cityState = [property.city, property.state].filter(Boolean).join(", ");
  return [property.addressLine1, cityState, property.postalCode]
    .filter(Boolean)
    .join(" ");
}

function PropertyIdentityText({ property }) {
  const name = textValue(property?.name);
  const address = propertyAddressLine(property);
  const primary = name || address || "Property";
  const showAddress = name && address && name !== address;

  if (!showAddress) {
    return <span className={name ? "punch-property-name" : "punch-property-address"}>{primary}</span>;
  }

  return (
    <>
      <span className="punch-property-name">{name} ·</span>
      <span className="punch-property-address">{address}</span>
    </>
  );
}

function PunchMetadataHeader({ row }) {
  return (
    <div className="punch-metadata-header">
      <div className="punch-property-line">
        <PropertyIdentityText property={row.property} />
      </div>
      <div className="punch-org-line">{orgDateTimeLine(row)}</div>
      <div className="punch-location-line">
        {locationCodeLine(row) || "LOCATION NOT SET"}
      </div>
    </div>
  );
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

function locationLine(row) {
  const angle = row.angleIndex ? `A${row.angleIndex}` : "";
  return uppercaseLine([
    readableToken(row.building),
    readableToken(row.elevation),
    readableDetail(row.detailType),
    angle,
  ]);
}

function issueCode(row) {
  if (row.shotKey) return row.shotKey.toUpperCase();
  if (row.angleIndex) return `A${row.angleIndex}`;
  return row.shotId ? row.shotId.slice(0, 8).toUpperCase() : "ISSUE";
}

function locationCodeLine(row) {
  return locationLine(row) || issueCode(row);
}

function orgDateTimeLine(row) {
  return [
    row.org?.name,
    formatDate(row.capturedAt || row.updatedAt),
    formatTime(row.capturedAt || row.updatedAt),
  ]
    .filter(Boolean)
    .join(" · ");
}

function priorityStyle(priority) {
  switch (String(priority || "").toLowerCase()) {
    case "critical":
      return { backgroundColor: "#dc2626", borderColor: "#b91c1c", color: "#ffffff" };
    case "high":
      return { backgroundColor: "#f97316", borderColor: "#ea580c", color: "#ffffff" };
    case "low":
      return { backgroundColor: "#0ea5e9", borderColor: "#0284c7", color: "#ffffff" };
    case "medium":
    default:
      return { backgroundColor: "#facc15", borderColor: "#eab308", color: "#422006" };
  }
}

function statusStyle(status) {
  if (status === "resolved") {
    return { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0", color: "#15803d" };
  }
  if (status === "pending_review") {
    return { backgroundColor: "#fffbeb", borderColor: "#fde68a", color: "#92400e" };
  }
  return { backgroundColor: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c" };
}

function dueDateStyle(value, status) {
  const dateOnly = textValue(value);
  if (!dateOnly || status === "resolved") return undefined;
  const today = todayDateOnly();
  if (dateOnly < today) {
    return { backgroundColor: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c" };
  }
  if (dateOnly === today) {
    return { backgroundColor: "#fffbeb", borderColor: "#fde68a", color: "#92400e" };
  }
  return undefined;
}

function statusLabel(status) {
  if (status === "resolved") return "Resolved";
  if (status === "pending_review") return "Pending Review";
  return "Active";
}

function sourceLabel(source) {
  return source === "observation" ? "Observation" : "Flagged photo";
}

function compactCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function uniqueOptions(rows, getter, labeler) {
  const byId = new Map();
  for (const row of rows) {
    const value = getter(row);
    const id = value?.id || value;
    if (id && !byId.has(id)) {
      byId.set(id, {
        id,
        label: labeler ? labeler(value) : String(value),
        value,
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function uniqueNormalizedOptions(rows, getter, labeler, sorter) {
  const byId = new Map();
  for (const row of rows) {
    const rawValue = getter(row);
    const id = normalizedOptionId(rawValue);
    if (id && !byId.has(id)) {
      byId.set(id, {
        id,
        label: labeler ? labeler(rawValue) : readableToken(rawValue),
        value: rawValue,
      });
    }
  }
  return Array.from(byId.values()).sort(sorter || ((a, b) => a.label.localeCompare(b.label)));
}

function orgOption(org) {
  return {
    id: org.id,
    label: org.name || "Organization",
    value: org,
  };
}

function propertyOption(property) {
  return {
    id: property.id,
    label: propertyOptionLabel(property),
    value: property,
  };
}

function propertyOptionsForOrg(options, orgId) {
  if (!orgId) return options;
  return options.filter((option) => option.value?.orgId === orgId);
}

function defaultPropertyIdForOrg(options, orgId) {
  return propertyOptionsForOrg(options, orgId)[0]?.id || "";
}

function propertyIdIsValidForOrg(options, orgId, propertyId) {
  const orgProperties = propertyOptionsForOrg(options, orgId);
  if (!propertyId) return false;
  if (propertyId === ALL) return orgProperties.length > 1;
  return orgProperties.some((option) => option.id === propertyId);
}

function activityNotes(row) {
  if (!Array.isArray(row?.activity)) return [];
  const approvedCompletionSubmissionIds = new Set(
    row.activity
      .filter((activity) => activity?.activityType === "completion_approved" && textValue(activity.fromValue))
      .map((activity) => activity.fromValue)
  );
  return row.activity
    .filter(
      (activity) =>
        (activity?.activityType === "note_added" ||
          (activity?.activityType === "completion_submitted" &&
            approvedCompletionSubmissionIds.has(activity.id))) &&
        textValue(activity.note)
    )
    .map((activity) => ({
      ...activity,
      id:
        activity.activityType === "completion_submitted"
          ? `${activity.id}:completion-note`
          : activity.id,
      sourceActivityId: activity.id,
      canEdit: activity.activityType === "note_added" && canEditNote(activity),
      canDelete: activity.activityType === "note_added" && canDeleteNote(activity),
      permissions: {
        ...(activity.permissions || {}),
        canEdit: activity.activityType === "note_added" && canEditNote(activity),
        canDelete: activity.activityType === "note_added" && canDeleteNote(activity),
      },
    }));
}

function canDeleteNote(note) {
  return Boolean(note?.permissions?.canDelete || note?.canDelete);
}

function canEditNote(note) {
  return Boolean(note?.permissions?.canEdit || note?.canEdit);
}

function canAddNoteToRow(row) {
  const rowAllowsNotes = Boolean(row?.permissions?.canAddNote || row?.canAddNote || row?.isEditable);
  if (row?.source === "observation") return Boolean(row?.observationId && rowAllowsNotes);
  if (row?.source === "flagged_shot") return Boolean(row?.shotId && rowAllowsNotes);
  return false;
}

function canEditWorkflowForRow(row) {
  const rowAllowsWorkflow = Boolean(row?.permissions?.canEditWorkflow || row?.canEditWorkflow);
  if (row?.source === "observation") return Boolean(row?.observationId && rowAllowsWorkflow);
  if (row?.source === "flagged_shot") return Boolean(row?.shotId && rowAllowsWorkflow);
  return false;
}

function canSubmitCompletionForRow(row) {
  const rowAllowsSubmit = Boolean(row?.permissions?.canSubmitCompletion);
  if (row?.source === "observation") return Boolean(row?.observationId && rowAllowsSubmit);
  if (row?.source === "flagged_shot") return Boolean(row?.shotId && rowAllowsSubmit);
  return false;
}

function canReviewCompletionForRow(row) {
  return Boolean(row?.completionReview?.activityId && row?.permissions?.canReviewCompletion);
}

function completionActivities(row) {
  return Array.isArray(row?.activity)
    ? row.activity.filter((activity) =>
        ["completion_submitted", "completion_approved", "completion_rejected"].includes(
          activity?.activityType
        )
      )
    : [];
}

function completionActivityLabel(activity) {
  if (activity?.activityType === "completion_approved") return "Approved";
  if (activity?.activityType === "completion_rejected") return "Rejected";
  return "Submitted";
}

function historyActivities(row) {
  return Array.isArray(row?.activity) ? row.activity : [];
}

function pendingCompletionActivity(row) {
  if (row?.status !== "pending_review") return null;
  const activityId = row?.completionReview?.activityId;
  const completions = completionActivities(row);
  return (
    completions.find(
      (activity) =>
        activity.activityType === "completion_submitted" &&
        (!activityId || activity.id === activityId)
    ) || null
  );
}

function completionPhotoForActivity(activity, label = "Completion") {
  if (!activity?.attachment?.previewUrl) return null;
  return {
    label,
    activityId: activity.id,
    capturedAt: activity.createdAt || null,
    note: textValue(activity.note),
    status: completionActivityLabel(activity),
    preview: {
      displayName: activity.attachment.filename || "Completion photo",
      previewUrl: activity.attachment.previewUrl,
      previewExpiresInSeconds: activity.attachment.previewExpiresInSeconds || null,
      originalDownload: { available: false },
      stampedFilename: null,
    },
  };
}

function pendingCompletionPhoto(row) {
  const activity = pendingCompletionActivity(row);
  return activity ? completionPhotoForActivity(activity, "Pending Review") : null;
}

function historyActivityLabel(activity) {
  switch (activity?.activityType) {
    case "completion_submitted":
      return "Completion Submitted";
    case "completion_approved":
      return "Completion Approved";
    case "completion_rejected":
      return "Completion Rejected";
    case "status_changed":
      return "Status Changed";
    case "priority_changed":
      return "Priority Changed";
    case "trade_changed":
      return "Trade Changed";
    case "due_date_changed":
      return "Due Date Changed";
    case "note_added":
      return "Note Added";
    default:
      return "Activity";
  }
}

function formatHistoryValue(activity, value, tradeOptions = []) {
  if (!textValue(value)) return "None";
  switch (activity?.activityType) {
    case "status_changed":
    case "completion_submitted":
    case "completion_approved":
    case "completion_rejected":
      return statusLabel(value);
    case "priority_changed":
      return optionLabel(value, PRIORITY_LABELS);
    case "trade_changed":
      return tradeLabel(value, tradeOptions);
    case "due_date_changed":
      return formatDueDate(value) || "None";
    default:
      return value;
  }
}

function historyActivityDetail(activity, tradeOptions = []) {
  if (activity?.activityType === "note_added") return "";
  if (activity?.activityType === "completion_submitted") return "Photo submitted for review";
  if (activity?.activityType === "completion_approved") return "Submission approved";
  if (activity?.activityType === "completion_rejected") return "Submission rejected";
  if (activity?.fromValue !== activity?.toValue) {
    return `${formatHistoryValue(activity, activity?.fromValue, tradeOptions)} -> ${formatHistoryValue(
      activity,
      activity?.toValue,
      tradeOptions
    )}`;
  }
  return "";
}

function tradeOptionsForRow(row, options) {
  const byId = new Map();
  byId.set("general", { id: "general", label: "General" });
  for (const option of options || []) {
    if (option?.id) byId.set(option.id, option);
  }
  const rowTrade = tradeKey(row?.trade);
  if (rowTrade && !byId.has(rowTrade)) {
    byId.set(rowTrade, { id: rowTrade, label: tradeLabel(rowTrade, options) });
  }
  return Array.from(byId.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function noteUnavailableMessage(row) {
  if (row?.source === "flagged_shot") {
    return "Notes can be added after this historical item is backed by an observation.";
  }
  if (!canAddNoteToRow(row)) {
    return "This account can view notes but cannot add them.";
  }
  return "";
}

const PUNCH_LIST_STYLES = `
  .punch-filter-row {
    align-items: end;
    column-gap: 8px;
    row-gap: 10px;
    padding-top: 0;
  }

  .punch-filter-control {
    flex: 0 1 142px;
    min-width: 124px;
  }

  .punch-filter-organization {
    flex: 0 0 320px;
    min-width: 320px;
    max-width: 320px;
  }

  .punch-filter-property {
    flex: 1 1 420px;
    min-width: 320px;
    max-width: 620px;
  }

  .punch-filter-detail {
    flex: 0 1 176px;
    min-width: 148px;
  }

  .punch-filter-row select {
    width: 100%;
  }

  .punch-filter-property select {
    max-width: none;
  }

  .punch-filter-organization select {
    max-width: none;
  }

  .punch-refresh-button {
    flex: 0 0 auto;
    min-width: 144px;
    width: auto;
  }

  .punch-refresh-cluster {
    display: flex;
    align-items: center;
    align-self: end;
    gap: 8px;
    margin-left: auto;
  }

  .punch-refresh-status {
    color: rgb(100 116 139);
    font-size: 12px;
    font-weight: 650;
    line-height: 1;
    white-space: nowrap;
  }

  .punch-mobile-filter-actions {
    display: none;
  }

  .punch-filter-advanced {
    display: flex;
    align-items: end;
    flex: 1 0 100%;
    gap: 8px;
  }

  .punch-row {
    overflow: hidden;
    cursor: default;
  }

  .punch-row-body {
    position: relative;
    display: grid;
    grid-template-columns: 156px minmax(0, 1fr) 232px;
    align-items: stretch;
    gap: 16px;
    width: 100%;
    cursor: default;
  }

  .punch-row-left {
    display: flex;
    align-items: stretch;
    justify-content: stretch;
    overflow: hidden;
    width: 156px;
    height: 156px;
    min-height: 156px;
  }

  .punch-thumbnail {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: rgb(241 245 249);
    color: rgb(100 116 139);
    appearance: none;
    box-sizing: border-box;
    line-height: 0;
    padding: 0;
  }

  .punch-thumbnail:not(.punch-thumbnail-large) {
    width: 156px;
    height: 156px;
    min-width: 156px;
    min-height: 156px;
    max-width: 156px;
    max-height: 156px;
    aspect-ratio: 1 / 1;
    flex: 0 0 156px;
  }

  .punch-thumbnail-button {
    cursor: zoom-in;
  }

  .punch-thumbnail-button,
  .punch-thumbnail-button * {
    cursor: zoom-in;
  }

  .punch-thumbnail img {
    display: block;
    width: 100%;
    height: 100%;
    min-width: 100%;
    min-height: 100%;
    object-fit: cover;
    object-position: center;
  }

  .punch-row-left .punch-thumbnail,
  .punch-row-left .punch-thumbnail img {
    width: 156px;
    height: 156px;
  }

  .punch-row-main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 144px;
    padding-top: 4px;
  }

  .punch-property-line {
    display: flex;
    gap: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgb(15 23 42);
    font-size: 18px;
    line-height: 1.25;
  }

  .punch-property-name {
    flex: 0 0 auto;
    font-weight: 700;
  }

  .punch-property-address {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 400;
  }

  .punch-org-line {
    margin-top: 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgb(71 85 105);
    font-size: 14px;
    font-weight: 650;
    line-height: 1.35;
  }

  .punch-location-line {
    margin-top: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgb(15 23 42);
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0;
    line-height: 1.25;
  }

  .punch-flag-line {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: auto;
    margin-bottom: 11px;
    color: rgb(220 38 38);
    font-size: 15px;
    font-weight: 700;
    line-height: 1.25;
  }

  .punch-flag-line.is-resolved {
    color: rgb(21 128 61);
  }

  .punch-flag-line.is-pending {
    color: rgb(146 64 14);
  }

  .punch-flag-line span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .punch-row-note-button {
    display: inline-flex;
    height: 26px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 5px;
    margin-left: 6px;
    border-radius: 7px;
    border: 1px solid rgb(203 213 225);
    background: white;
    padding: 0 8px;
    color: rgb(28 39 66);
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
  }

  .punch-row-note-button.is-active,
  .punch-row-note-button.has-notes.is-active {
    border-color: rgb(37 99 235);
    background: rgb(239 246 255);
    color: rgb(29 78 216);
    box-shadow: 0 1px 3px rgba(37, 99, 235, 0.16);
  }

  .punch-row-note-button:hover,
  .punch-row-note-button.is-active:hover,
  .punch-row-note-button.has-notes.is-active:hover {
    border-color: rgb(29 78 216);
    background: rgb(219 234 254);
    color: rgb(30 64 175);
  }

  .punch-row-note-button.is-completion {
    border-color: rgb(203 213 225);
    background: white;
    color: rgb(28 39 66);
  }

  .punch-row-note-button.is-completion.is-active {
    border-color: rgb(37 99 235);
    background: rgb(239 246 255);
    color: rgb(29 78 216);
    box-shadow: 0 1px 3px rgba(37, 99, 235, 0.16);
  }

  .punch-row-note-button.is-completion:hover {
    border-color: rgb(37 99 235);
    background: rgb(239 246 255);
    color: rgb(29 78 216);
  }

  .punch-row-note-area {
    border-top: 1px solid rgb(226 232 240);
    margin-top: 12px;
    padding-top: 12px;
  }

  .punch-row-controls {
    display: grid;
    align-content: start;
    gap: 7px;
    width: 232px;
    padding: 10px 12px 10px 0;
  }

  .punch-control {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    min-height: 28px;
  }

  .punch-control-label {
    color: rgb(15 23 42);
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
  }

  .punch-control-value {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-radius: 7px;
    border: 1px solid rgb(226 232 240);
    background: rgb(248 250 252);
    padding: 6px 8px;
    color: rgb(30 41 59);
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
    text-align: center;
  }

  .punch-control-input {
    width: 100%;
    min-width: 0;
    height: 28px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-radius: 7px;
    border: 1px solid rgb(226 232 240);
    background: rgb(248 250 252);
    padding: 0 8px;
    color: rgb(30 41 59);
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
    text-align: center;
    outline: none;
  }

  .punch-control-input:focus {
    border-color: var(--brand);
    box-shadow: 0 0 0 2px rgba(28, 39, 66, 0.12);
  }

  .punch-control-input:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  .punch-date-control {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 26px;
    gap: 4px;
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .punch-date-shell {
    position: relative;
    display: flex;
    width: 100%;
    min-width: 0;
    height: 28px;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 7px;
    border: 1px solid rgb(226 232 240);
    background: rgb(248 250 252);
    padding: 0 8px;
    box-sizing: border-box;
    color: rgb(30 41 59);
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
    text-align: center;
  }

  .punch-date-shell:focus-within {
    border-color: var(--brand);
    box-shadow: 0 0 0 2px rgba(28, 39, 66, 0.12);
  }

  .punch-date-shell.is-disabled {
    cursor: wait;
    opacity: 0.65;
  }

  .punch-date-display {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
  }

  .punch-date-native {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
    pointer-events: none;
  }

  .punch-date-control.is-empty {
    display: block;
  }

  .punch-date-clear {
    display: inline-flex;
    height: 28px;
    width: 26px;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    border: 1px solid rgb(226 232 240);
    background: white;
    color: rgb(71 85 105);
  }

  .punch-date-clear:hover {
    border-color: rgb(248 113 113);
    color: rgb(185 28 28);
  }

  .punch-select-control {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }

  .punch-select-control.has-action {
    grid-template-columns: minmax(0, 1fr) 28px;
  }

  .punch-control-add {
    display: inline-flex;
    height: 28px;
    width: 28px;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    border: 1px solid rgb(226 232 240);
    background: rgb(248 250 252);
    color: rgb(30 41 59);
    font-size: 15px;
    font-weight: 800;
    line-height: 1;
  }

  .punch-control-add:hover {
    border-color: rgb(203 213 225);
    background: white;
    color: rgb(15 23 42);
  }

  .punch-notes-panel {
    display: grid;
    gap: 10px;
  }

  .punch-notes-title {
    display: flex;
    align-items: center;
    gap: 6px;
    color: rgb(15 23 42);
    font-size: 13px;
    font-weight: 800;
    line-height: 1.2;
  }

  .punch-note-list {
    display: grid;
    gap: 7px;
  }

  .punch-note-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    border-radius: 8px;
    border: 1px solid rgb(226 232 240);
    border-left: 3px solid rgb(203 213 225);
    background: rgb(248 250 252);
    padding: 8px 10px;
  }

  .punch-note-meta {
    color: rgb(15 23 42);
    font-size: 12px;
    font-weight: 800;
    line-height: 1.25;
  }

  .punch-note-tools {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .punch-note-tool,
  .punch-note-delete {
    display: inline-flex;
    height: 24px;
    width: 24px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    color: rgb(100 116 139);
  }

  .punch-note-tool:hover {
    background: rgb(219 234 254);
    color: rgb(29 78 216);
  }

  .punch-note-delete:hover {
    background: rgb(254 226 226);
    color: rgb(185 28 28);
  }

  .punch-note-tool:disabled,
  .punch-note-delete:disabled {
    cursor: wait;
    opacity: 0.45;
  }

  .punch-note-text {
    margin-top: 3px;
    color: rgb(51 65 85);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .punch-note-empty {
    margin-top: 8px;
    color: rgb(100 116 139);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }

  .punch-completion-panel {
    display: grid;
    gap: 10px;
    border-top: 1px solid rgb(226 232 240);
    margin-top: 12px;
    padding-top: 12px;
  }

  .punch-completion-heading {
    display: flex;
    align-items: center;
    gap: 6px;
    color: rgb(15 23 42);
    font-size: 13px;
    font-weight: 800;
    line-height: 1.2;
  }

  .punch-completion-upload {
    position: relative;
    display: grid;
    min-height: 118px;
    place-items: center;
    overflow: hidden;
    border-radius: 8px;
    border: 1px dashed rgb(148 163 184);
    background: rgb(248 250 252);
    color: rgb(30 41 59);
    text-align: center;
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }

  .punch-completion-upload:hover,
  .punch-completion-upload:focus-within,
  .punch-completion-upload.is-dragging {
    border-color: var(--brand);
    background: rgb(239 246 255);
    color: var(--brand);
  }

  .punch-completion-upload.is-disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .punch-completion-input {
    position: absolute;
    inset: 0;
    cursor: pointer;
    opacity: 0;
  }

  .punch-completion-input:disabled {
    cursor: wait;
  }

  .punch-completion-upload-copy {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 14px;
    pointer-events: none;
  }

  .punch-completion-upload-title {
    font-size: 14px;
    font-weight: 900;
    line-height: 1.2;
  }

  .punch-completion-upload-subtitle {
    color: rgb(100 116 139);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.35;
  }

  .punch-completion-file-preview {
    display: grid;
    grid-template-columns: 90px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-height: 90px;
    border-radius: 8px;
    border: 1px solid rgb(203 213 225);
    background: white;
    padding: 8px;
  }

  .punch-completion-file-thumb {
    width: 90px;
    height: 72px;
    overflow: hidden;
    border-radius: 7px;
    border: 0;
    background: rgb(15 23 42);
    color: white;
    padding: 0;
  }

  .punch-completion-file-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .punch-completion-file-thumb-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: zoom-in;
  }

  .punch-completion-file-thumb-button:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .punch-completion-file-meta {
    min-width: 0;
  }

  .punch-completion-file-name {
    overflow: hidden;
    color: rgb(15 23 42);
    font-size: 13px;
    font-weight: 900;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .punch-completion-file-status {
    margin-top: 3px;
    color: rgb(71 85 105);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.35;
  }

  .punch-completion-file-tools {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .punch-completion-tool {
    display: inline-flex;
    height: 30px;
    min-width: 30px;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border-radius: 7px;
    border: 1px solid rgb(203 213 225);
    background: white;
    padding: 0 8px;
    color: rgb(30 41 59);
    font-size: 12px;
    font-weight: 800;
  }

  .punch-completion-tool:hover {
    border-color: rgb(148 163 184);
    color: rgb(15 23 42);
  }

  .punch-completion-tool.is-delete:hover {
    border-color: rgb(248 113 113);
    background: rgb(254 242 242);
    color: rgb(185 28 28);
  }

  .punch-completion-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .punch-completion-approve,
  .punch-completion-reject {
    display: inline-flex;
    height: 32px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 8px;
    padding: 0 11px;
    color: white;
    font-size: 13px;
    font-weight: 800;
  }

  .punch-completion-approve {
    background: rgb(22 163 74);
  }

  .punch-completion-reject {
    background: rgb(220 38 38);
  }

  .punch-completion-approve:disabled,
  .punch-completion-reject:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .punch-completion-events {
    display: grid;
    gap: 7px;
  }

  .punch-completion-event {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    border-radius: 8px;
    border: 1px solid rgb(226 232 240);
    background: rgb(248 250 252);
    padding: 8px 10px;
  }

  .punch-completion-event-title {
    color: rgb(15 23 42);
    font-size: 12px;
    font-weight: 800;
    line-height: 1.25;
  }

  .punch-completion-event-note {
    margin-top: 3px;
    color: rgb(51 65 85);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .punch-history-panel {
    display: grid;
    gap: 10px;
  }

  .punch-history-events {
    position: relative;
  }

  .punch-history-event {
    border-left: 3px solid rgb(203 213 225);
  }

  .punch-completion-modal {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.62);
  }

  .punch-completion-modal-panel {
    display: grid;
    gap: 12px;
    width: min(520px, 100%);
    border-radius: 10px;
    background: white;
    padding: 16px;
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.35);
  }

  .punch-completion-modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .punch-completion-modal-title {
    color: rgb(15 23 42);
    font-size: 18px;
    font-weight: 900;
    line-height: 1.2;
  }

  .punch-completion-modal-subtitle {
    margin-top: 4px;
    color: rgb(71 85 105);
    font-size: 13px;
    font-weight: 650;
    line-height: 1.4;
  }

  .punch-completion-modal-close {
    display: inline-flex;
    width: 34px;
    height: 34px;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border-radius: 999px;
    border: 1px solid rgb(226 232 240);
    background: white;
    color: rgb(30 41 59);
  }

  .punch-completion-modal-preview {
    overflow: hidden;
    border-radius: 8px;
    background: rgb(15 23 42);
  }

  .punch-completion-modal-preview img {
    display: block;
    width: 100%;
    max-height: 260px;
    object-fit: contain;
  }

  .punch-completion-modal-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .punch-completion-submit {
    display: inline-flex;
    height: 36px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 8px;
    background: var(--brand);
    padding: 0 13px;
    color: white;
    font-size: 13px;
    font-weight: 900;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
  }

  .punch-completion-submit:disabled,
  .punch-completion-tool:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .punch-note-form {
    display: grid;
    gap: 8px;
  }

  .punch-note-input {
    min-height: 76px;
    resize: vertical;
    border-radius: 8px;
    border: 1px solid rgb(203 213 225);
    background: white;
    padding: 9px 10px;
    color: rgb(15 23 42);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.45;
    outline: none;
  }

  .punch-note-input:focus {
    border-color: var(--brand);
    box-shadow: 0 0 0 2px rgba(28, 39, 66, 0.12);
  }

  .punch-note-edit-form {
    display: grid;
    gap: 8px;
    margin-top: 7px;
  }

  .punch-note-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .punch-note-cancel,
  .punch-note-submit {
    display: inline-flex;
    height: 34px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 8px;
    background: var(--brand);
    padding: 0 12px;
    color: white;
    font-size: 13px;
    font-weight: 800;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
  }

  .punch-note-cancel {
    border: 1px solid rgb(203 213 225);
    background: white;
    color: rgb(30 41 59);
    box-shadow: none;
  }

  .punch-note-submit:disabled {
    opacity: 0.55;
  }

  .punch-lightbox {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.72);
  }

  .punch-lightbox-panel {
    position: relative;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: min(980px, 100%);
    max-height: calc(100vh - 40px);
    border-radius: 10px;
    background: white;
    box-shadow: 0 24px 80px rgba(15, 23, 42, 0.35);
    overflow: hidden;
  }

  .punch-lightbox-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px;
  }

  .punch-lightbox-property {
    min-width: 0;
  }

  .punch-lightbox-header .punch-property-line {
    font-size: 18px;
    line-height: 1.2;
  }

  .punch-lightbox-header .punch-org-line {
    margin-top: 4px;
    color: rgb(71 85 105);
    font-size: 13px;
    font-weight: 700;
    line-height: 1.35;
  }

  .punch-lightbox-header .punch-location-line {
    margin-top: 8px;
    color: rgb(15 23 42);
    font-size: 14px;
    font-weight: 800;
    line-height: 1.25;
  }

  .punch-lightbox-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-top: 1px solid rgb(226 232 240);
    padding: 12px 16px 14px;
    background: white;
  }

  .punch-lightbox-issue {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    color: rgb(220 38 38);
    font-size: 14px;
    font-weight: 800;
    line-height: 1.3;
  }

  .punch-lightbox-issue.is-resolved {
    color: rgb(21 128 61);
  }

  .punch-lightbox-issue span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .punch-lightbox-caption {
    display: grid;
    gap: 2px;
    min-width: 0;
    color: rgb(71 85 105);
    font-size: 12px;
    font-weight: 650;
    line-height: 1.35;
  }

  .punch-lightbox-priority {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    color: rgb(15 23 42);
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
  }

  .punch-lightbox-priority-value {
    display: inline-flex;
    align-items: center;
    border: 1px solid;
    border-radius: 999px;
    padding: 4px 9px;
  }

  .punch-lightbox-media {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    background: rgb(15 23 42);
  }

  .punch-lightbox-image {
    display: block;
    width: 100%;
    height: 100%;
    max-height: min(66vh, 640px);
    object-fit: contain;
  }

  .punch-lightbox-photo-label {
    position: absolute;
    left: 14px;
    top: 14px;
    z-index: 2;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.86);
    color: white;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0;
    line-height: 1;
    padding: 6px 9px;
    text-transform: uppercase;
  }

  .punch-lightbox-nav {
    position: absolute;
    top: 50%;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.58);
    background: rgba(15, 23, 42, 0.62);
    color: white;
    transform: translateY(-50%);
  }

  .punch-lightbox-nav:hover,
  .punch-lightbox-nav:focus-visible {
    background: rgba(15, 23, 42, 0.86);
  }

  .punch-lightbox-nav-previous {
    left: 14px;
  }

  .punch-lightbox-nav-next {
    right: 14px;
  }

  .punch-lightbox-filmstrip {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    border-top: 1px solid rgb(30 41 59);
    background: rgb(15 23 42);
    padding: 9px 12px;
  }

  .punch-lightbox-filmstrip-button {
    position: relative;
    display: inline-flex;
    flex: 0 0 58px;
    width: 58px;
    height: 42px;
    overflow: hidden;
    border-radius: 6px;
    border: 2px solid transparent;
    background: rgb(30 41 59);
    padding: 0;
  }

  .punch-lightbox-filmstrip-button.is-active {
    border-color: white;
  }

  .punch-lightbox-filmstrip-button img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .punch-lightbox-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 999px;
    border: 1px solid rgb(226 232 240);
    background: rgb(248 250 252);
    color: rgb(15 23 42);
  }

  .punch-report-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }

  .punch-report-button {
    display: inline-flex;
    height: 40px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: 8px;
    border: 1px solid rgb(203 213 225);
    background: white;
    padding: 0 12px;
    color: rgb(28 39 66);
    font-size: 14px;
    font-weight: 800;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  }

  .punch-report-button:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .punch-report-modal {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    background: rgba(15, 23, 42, 0.54);
  }

  .punch-report-panel {
    width: min(520px, 100%);
    max-height: calc(100vh - 36px);
    overflow: hidden;
    border-radius: 10px;
    border: 1px solid rgb(226 232 240);
    background: white;
    box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
  }

  .punch-report-header,
  .punch-report-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px;
  }

  .punch-report-header {
    border-bottom: 1px solid rgb(226 232 240);
  }

  .punch-report-footer {
    border-top: 1px solid rgb(226 232 240);
    background: rgb(248 250 252);
  }

  .punch-report-title {
    color: rgb(15 23 42);
    font-size: 18px;
    font-weight: 800;
    line-height: 1.2;
  }

  .punch-report-subtitle {
    margin-top: 4px;
    color: rgb(71 85 105);
    font-size: 13px;
    font-weight: 650;
    line-height: 1.35;
  }

  .punch-report-close {
    display: inline-flex;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid rgb(226 232 240);
    color: rgb(15 23 42);
  }

  .punch-report-body {
    max-height: min(520px, calc(100vh - 190px));
    overflow: auto;
    padding: 14px 16px;
  }

  .punch-report-trades {
    display: grid;
    gap: 8px;
  }

  .punch-report-trade {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border-radius: 8px;
    border: 1px solid rgb(226 232 240);
    background: white;
    padding: 10px;
    color: rgb(15 23 42);
    font-size: 14px;
    font-weight: 800;
  }

  .punch-report-trade.is-disabled {
    background: rgb(248 250 252);
    color: rgb(148 163 184);
  }

  .punch-report-trade input {
    width: 16px;
    height: 16px;
    accent-color: var(--brand);
  }

  .punch-report-trade-count {
    color: rgb(100 116 139);
    font-size: 12px;
    font-weight: 800;
  }

  .punch-report-generate,
  .punch-report-cancel {
    display: inline-flex;
    height: 38px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: 8px;
    padding: 0 13px;
    font-size: 14px;
    font-weight: 800;
  }

  .punch-report-generate {
    background: var(--brand);
    color: white;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
  }

  .punch-report-cancel {
    border: 1px solid rgb(203 213 225);
    background: white;
    color: rgb(30 41 59);
  }

  .punch-report-generate:disabled,
  .punch-report-cancel:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  @media (max-width: 767px) {
    .punch-filter-row {
      align-items: stretch;
      padding-top: 0;
      gap: 10px;
    }

    .punch-filter-row label,
    .punch-filter-row select {
      width: 100%;
      max-width: none;
    }

    .punch-filter-row > .punch-filter-control,
    .punch-filter-row > .punch-filter-property {
      flex: 1 1 100%;
      min-width: 0;
      max-width: none;
    }

    .punch-mobile-filter-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      width: 100%;
    }

    .punch-mobile-filter-button {
      display: inline-flex;
      height: 36px;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: white;
      padding: 0 12px;
      color: rgb(15 23 42);
      font-size: 14px;
      font-weight: 700;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    }

    .punch-refresh-button {
      align-self: flex-start;
      min-width: 126px;
    }

    .punch-refresh-cluster {
      position: static;
      justify-content: flex-start;
      width: auto;
    }

    .punch-refresh-desktop {
      display: none;
    }

    .punch-refresh-mobile {
      justify-content: flex-end;
      min-width: 0;
    }

    .punch-filter-advanced {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
      gap: 10px;
      width: 100%;
    }

    .punch-filter-advanced:not(.is-open) {
      display: none;
    }

    .punch-filter-advanced .punch-filter-control,
    .punch-filter-advanced .punch-filter-detail {
      align-self: start;
      min-width: 0;
      width: 100%;
      max-width: none;
    }

    .punch-filter-advanced .punch-filter-control,
    .punch-filter-advanced .punch-filter-detail {
      grid-template-rows: auto 36px;
      min-height: 54px;
    }

    .punch-row-body {
      grid-template-columns: 96px minmax(0, 1fr);
      gap: 10px;
    }

    .punch-row {
      padding: 10px !important;
    }

    .punch-row-left {
      width: 96px;
      height: 96px;
      min-height: 96px;
    }

    .punch-row-left .punch-thumbnail,
    .punch-row-left .punch-thumbnail img {
      width: 96px;
      height: 96px;
    }

    .punch-thumbnail:not(.punch-thumbnail-large) {
      width: 96px !important;
      height: 96px !important;
      min-width: 96px !important;
      min-height: 96px !important;
      max-width: 96px !important;
      max-height: 96px !important;
      flex-basis: 96px !important;
    }

    .punch-row-controls {
      grid-column: 1 / -1;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
      gap: 7px 10px;
      padding: 7px 6px 0;
    }

    .punch-control {
      grid-template-columns: 1fr;
      gap: 3px;
      min-height: 0;
    }

    .punch-control-label {
      font-size: 10.5px;
    }

    .punch-control-value,
    .punch-control-input {
      height: 27px;
      font-size: 11.5px;
      padding-left: 7px;
      padding-right: 7px;
    }

    .punch-control-value {
      text-align: left;
    }

    .punch-location-line {
      margin-top: 6px;
      font-size: 12.5px;
      white-space: normal;
    }

    .punch-row-main {
      min-height: 96px;
    }

    .punch-flag-line {
      margin-top: 8px;
      margin-bottom: 0;
      flex-wrap: wrap;
      font-size: 13px;
    }

    .punch-property-line,
    .punch-org-line,
    .punch-flag-line span {
      white-space: normal;
    }

    .punch-property-line {
      flex-wrap: wrap;
      font-size: 15px;
      line-height: 1.2;
    }

    .punch-org-line {
      margin-top: 3px;
      font-size: 12.5px;
      line-height: 1.25;
    }

    .punch-date-clear,
    .punch-control-add {
      height: 27px;
      width: 27px;
    }

    .punch-date-shell {
      height: 27px;
      font-size: 11.5px;
      padding-left: 7px;
      padding-right: 7px;
    }

    .punch-date-control {
      grid-template-columns: minmax(0, 1fr) 27px;
      gap: 4px;
    }

    .punch-date-control.is-empty {
      display: block;
    }

    .punch-select-control.has-action {
      grid-template-columns: minmax(0, 1fr) 27px;
    }

    .punch-lightbox-summary {
      align-items: flex-start;
      flex-direction: column;
    }

    .punch-lightbox-issue span {
      white-space: normal;
    }

    .punch-report-actions {
      justify-content: flex-start;
    }
  }
`;

function currentPhotoLabel(row) {
  return row?.status === "resolved" ? "Resolved" : "Current";
}

function photoIdentity(photo) {
  return [
    photo?.shotId,
    photo?.preview?.originalDownload?.apiPath,
    photo?.preview?.previewUrl,
  ]
    .map((value) => textValue(value).toLowerCase())
    .find(Boolean);
}

function rowHistoryPhotos(row) {
  const history = row?.photoHistory;
  const photos = [];
  if (history?.prior) photos.push(history.prior);
  return photos.filter((photo) => photo?.preview?.previewUrl);
}

function previewPhotosForRow(row) {
  if (!row?.preview?.previewUrl) return [];
  const current = {
    label: currentPhotoLabel(row),
    shotId: row.shotId,
    packageId: row.packageId,
    capturedAt: row.capturedAt,
    preview: row.preview,
  };
  const seen = new Set([photoIdentity(current)].filter(Boolean));
  const photos = [current];

  for (const photo of rowHistoryPhotos(row)) {
    const normalized = {
      label: row.status === "resolved" ? photo.label || "Before" : photo.label || "Previous",
      shotId: photo.shotId,
      packageId: photo.packageId,
      capturedAt: photo.capturedAt,
      preview: photo.preview,
    };
    const identity = photoIdentity(normalized);
    if (identity && seen.has(identity)) continue;
    if (identity) seen.add(identity);
    photos.push(normalized);
  }

  const pendingPhoto = pendingCompletionPhoto(row);
  if (pendingPhoto) {
    const identity = photoIdentity(pendingPhoto);
    if (!identity || !seen.has(identity)) {
      if (identity) seen.add(identity);
      photos.push(pendingPhoto);
    }
  }

  return photos;
}

function IssueThumbnail({ row, large = false, onPreview }) {
  const sizeClass = large ? "w-full" : "";
  const frameStyle = large
    ? { width: "100%", height: 176, minHeight: 176 }
    : {
        width: 156,
        height: 156,
        minWidth: 156,
        maxWidth: 156,
        maxHeight: 156,
        flexBasis: 156,
        minHeight: 156,
        aspectRatio: "1 / 1",
      };
  const label = locationLine(row) || row.title || "Punch list photo";
  const canPreviewCurrent = Boolean(row.preview?.previewUrl && onPreview);
  const content = row.preview?.previewUrl ? (
    <img
      src={row.preview.previewUrl}
      alt={label}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  ) : (
    <Camera className={large ? "h-8 w-8" : "h-5 w-5"} />
  );
  const className = `${sizeClass} punch-thumbnail ${
    large ? "punch-thumbnail-large" : ""
  } ${row.preview?.previewUrl && onPreview ? "punch-thumbnail-button" : ""}`;

  if (canPreviewCurrent) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onPreview(row);
        }}
        className={className}
        style={frameStyle}
        aria-label="Open photo preview"
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className} style={frameStyle}>
      {content}
    </div>
  );
}

function ReadOnlyControl({ label, value, style }) {
  return (
    <div className="punch-control" aria-readonly="true">
      <div className="punch-control-label">{label}</div>
      <div className="punch-control-value" style={style}>
        {value || "None"}
      </div>
    </div>
  );
}

function WorkflowControl({
  row,
  field,
  label,
  value,
  displayValue,
  style,
  type = "select",
  options = [],
  canEdit,
  saving,
  onChange,
  onAddOption,
  addOptionLabel = "Add",
}) {
  const dateInputRef = useRef(null);
  const dateOpenStartedAtRef = useRef(0);
  const dateAutoGuardValueRef = useRef("");

  if (!canEdit) {
    return <ReadOnlyControl label={label} value={displayValue || value} style={style} />;
  }

  function handleChange(nextValue) {
    if (saving) return;
    onChange(row, field, nextValue);
  }

  if (type === "date") {
    const dateValue = textValue(value);
    const isEmpty = !dateValue;

    function openDatePicker(event) {
      event.stopPropagation();
      if (saving) return;
      const input = dateInputRef.current;
      if (!input) return;

      dateOpenStartedAtRef.current = Date.now();
      dateAutoGuardValueRef.current = isEmpty ? todayDateOnly() : "";
      input.focus({ preventScroll: true });

      if (typeof input.showPicker === "function") {
        try {
          input.showPicker();
          return;
        } catch {
          // Fall back to a normal programmatic click below.
        }
      }

      input.click();
    }

    function handleDateChange(event) {
      const input = event.currentTarget;
      const nextValue = input.value;
      const openedRecently = Date.now() - dateOpenStartedAtRef.current < 800;

      if (isEmpty && openedRecently && nextValue === dateAutoGuardValueRef.current) {
        input.value = "";
        return;
      }

      handleChange(nextValue);
      window.setTimeout(() => input.blur(), 0);
    }

    return (
      <div className="punch-control">
        <div className="punch-control-label">{label}</div>
        <div className={`punch-date-control ${isEmpty ? "is-empty" : ""}`}>
          <span
            className={`punch-date-shell ${saving ? "is-disabled" : ""}`}
            style={style}
            onClick={openDatePicker}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openDatePicker(event);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <span className="punch-date-display">{isEmpty ? "None" : displayValue || dateValue}</span>
            <input
              ref={dateInputRef}
              type="date"
              value={dateValue}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              onChange={handleDateChange}
              disabled={saving}
              className="punch-date-native"
              aria-label={`Set ${label}`}
            />
          </span>
          {!isEmpty && (
            <button
              type="button"
              className="punch-date-clear"
              onClick={(event) => {
                event.stopPropagation();
                handleChange(null);
                event.currentTarget.blur();
              }}
              disabled={saving}
              aria-label={`Clear ${label}`}
              title={`Clear ${label}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <label className="punch-control">
      <span className="punch-control-label">{label}</span>
      <span className={`punch-select-control ${onAddOption ? "has-action" : ""}`}>
        <select
          value={value}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onChange={(event) => handleChange(event.target.value)}
          disabled={saving}
          className="punch-control-input"
          style={style}
          aria-label={label}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {onAddOption && (
          <button
            type="button"
            className="punch-control-add"
            onClick={(event) => {
              event.stopPropagation();
              onAddOption(row);
            }}
            disabled={saving}
            aria-label={addOptionLabel}
            title={addOptionLabel}
          >
            +
          </button>
        )}
      </span>
    </label>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase text-foreground/45">
        {label}
      </div>
      <div className="mt-1 min-h-5 text-sm font-semibold text-foreground">
        {value || "None"}
      </div>
    </div>
  );
}

function CompletionFilePreview({ file, className = "" }) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  if (!file || !previewUrl) return null;
  return (
    <img
      src={previewUrl}
      alt="Selected completion photo"
      className={className}
    />
  );
}

function CompletionPanel({
  row,
  completionDraft,
  onCompletionFileChange,
  onRemoveCompletionFile,
  onOpenCompletionPrompt,
  onSubmitCompletion,
  onReviewCompletion,
  onPreview,
  completionSaving,
  completionReviewSavingKey,
}) {
  const pendingActivity = pendingCompletionActivity(row);
  const pendingPhoto = pendingActivity ? completionPhotoForActivity(pendingActivity, "Pending Review") : null;
  const canSubmitCompletion = canSubmitCompletionForRow(row);
  const canReviewCompletion = canReviewCompletionForRow(row);
  const completionFile = completionDraft?.file || null;
  const completionFileError = completionFile ? validateCompletionFile(completionFile) : "";
  const [dragging, setDragging] = useState(false);
  const inputId = `completion-photo-${row.id}`;

  function useCompletionFile(file) {
    if (!file || completionSaving) return;
    onCompletionFileChange(row.id, file);
  }

  return (
    <div className="punch-completion-panel">
      <div className="punch-completion-heading">
        <ImageUp className="h-4 w-4" />
        Completion Photo
      </div>
      {pendingActivity && (
        <div className="punch-completion-file-preview">
          <button
            type="button"
            className="punch-completion-file-thumb punch-completion-file-thumb-button"
            onClick={() => pendingPhoto && onPreview?.(row, pendingPhoto)}
            disabled={!pendingPhoto}
            aria-label="Open pending completion photo"
            title="Open pending completion photo"
          >
            {pendingPhoto ? (
              <img
                src={pendingPhoto.preview.previewUrl}
                alt="Pending completion photo"
              />
            ) : (
              <Camera className="h-5 w-5" />
            )}
          </button>
          <div className="punch-completion-file-meta">
            <div className="punch-completion-file-name">
              Pending Review
            </div>
            <div className="punch-completion-file-status">
              Submitted {formatDateTime(pendingActivity.createdAt) || "recently"}
              {pendingActivity.note ? ` · ${pendingActivity.note}` : ""}
            </div>
          </div>
          {canReviewCompletion && (
            <div className="punch-completion-actions">
              <button
                type="button"
                className="punch-completion-reject"
                onClick={() => onReviewCompletion(row, "reject")}
                disabled={Boolean(completionReviewSavingKey)}
              >
                <X className="h-4 w-4" />
                {completionReviewSavingKey === `${row.id}:reject` ? "Rejecting..." : "Reject"}
              </button>
              <button
                type="button"
                className="punch-completion-approve"
                onClick={() => onReviewCompletion(row, "approve")}
                disabled={Boolean(completionReviewSavingKey)}
              >
                <Check className="h-4 w-4" />
                {completionReviewSavingKey === `${row.id}:approve` ? "Approving..." : "Approve"}
              </button>
            </div>
          )}
        </div>
      )}
      {canSubmitCompletion && (
        <>
          {completionFile ? (
            <div className="punch-completion-file-preview">
              <div className="punch-completion-file-thumb">
                <CompletionFilePreview file={completionFile} />
              </div>
              <div className="punch-completion-file-meta">
                <div className="punch-completion-file-name">{completionFileLabel(completionFile)}</div>
                <div className="punch-completion-file-status">
                  {completionFileError || "Ready to submit for review."}
                </div>
              </div>
              <div className="punch-completion-file-tools">
                <label className="punch-completion-tool">
                  Replace
                  <input
                    type="file"
                    accept={COMPLETION_PHOTO_ACCEPT}
                    className="sr-only"
                    onChange={(event) => useCompletionFile(event.target.files?.[0] || null)}
                    disabled={completionSaving}
                  />
                </label>
                <button
                  type="button"
                  className="punch-completion-tool is-delete"
                  onClick={() => onRemoveCompletionFile(row.id)}
                  disabled={completionSaving}
                  aria-label="Remove completion photo"
                  title="Remove completion photo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="punch-completion-tool"
                  onClick={() => onOpenCompletionPrompt(row.id)}
                  disabled={Boolean(completionFileError) || completionSaving}
                >
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <label
              htmlFor={inputId}
              className={`punch-completion-upload ${dragging ? "is-dragging" : ""} ${
                completionSaving ? "is-disabled" : ""
              }`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                useCompletionFile(event.dataTransfer.files?.[0] || null);
              }}
            >
              <input
                id={inputId}
                type="file"
                accept={COMPLETION_PHOTO_ACCEPT}
                className="punch-completion-input"
                onChange={(event) => useCompletionFile(event.target.files?.[0] || null)}
                disabled={completionSaving}
                aria-label="Upload completion photo"
              />
              <span className="punch-completion-upload-copy">
                <ImageUp className="h-7 w-7" />
                <span className="punch-completion-upload-title">Upload Photo</span>
                <span className="punch-completion-upload-subtitle">
                  Drag photo here or choose from files. JPG, PNG, HEIC, HEIF, and WebP are supported.
                </span>
              </span>
            </label>
          )}
        </>
      )}
      {row.status === "pending_review" && !pendingActivity && (
        <div className="punch-note-empty">
          Pending review{row.completionReview?.submittedAt ? ` since ${formatDateTime(row.completionReview.submittedAt)}` : ""}.
        </div>
      )}
      {!canSubmitCompletion && row.status !== "pending_review" && (
        <div className="punch-note-empty">Completion upload is not available for this item.</div>
      )}
    </div>
  );
}

function CompletionNoteModal({
  row,
  completionDraft,
  onCompletionDraftChange,
  onRemoveCompletionFile,
  onSubmitCompletion,
  onClose,
  completionSaving,
}) {
  const file = completionDraft?.file || null;
  const note = completionDraft?.note || "";
  const fileError = file ? validateCompletionFile(file) : "Choose a completion photo.";

  if (!row || !file) return null;

  return (
    <div
      className="punch-completion-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Submit completion photo"
      onClick={onClose}
    >
      <div className="punch-completion-modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="punch-completion-modal-header">
          <div>
            <div className="punch-completion-modal-title">Submit Photo For Review</div>
            <div className="punch-completion-modal-subtitle">
              This will move the item to Pending Review until it is approved.
            </div>
          </div>
          <button
            type="button"
            className="punch-completion-modal-close"
            onClick={onClose}
            disabled={completionSaving}
            aria-label="Close completion submission"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="punch-completion-modal-preview">
          <CompletionFilePreview file={file} />
        </div>
        <textarea
          value={note}
          onChange={(event) => onCompletionDraftChange(row.id, { note: event.target.value })}
          maxLength={1000}
          className="punch-note-input"
          placeholder="Optional note"
          disabled={completionSaving}
        />
        {fileError && <div className="punch-note-empty">{fileError}</div>}
        <div className="punch-completion-modal-actions">
          <button
            type="button"
            className="punch-note-cancel"
            onClick={() => onRemoveCompletionFile(row.id)}
            disabled={completionSaving}
          >
            Remove Photo
          </button>
          <button
            type="button"
            className="punch-note-cancel"
            onClick={onClose}
            disabled={completionSaving}
          >
            Later
          </button>
          <button
            type="button"
            className="punch-completion-submit"
            onClick={() => onSubmitCompletion(row)}
            disabled={Boolean(fileError) || completionSaving}
          >
            <ImageUp className="h-4 w-4" />
            {completionSaving ? "Submitting..." : "Submit for Review"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NotesPanel({
  row,
  noteDraft,
  noteEditDrafts = {},
  onNoteDraftChange,
  onNoteEditDraftChange,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onStartEditNote,
  onCancelEditNote,
  noteSaving,
  noteEditingId,
  noteDeletingId,
  activeNoteEditId,
}) {
  const notes = activityNotes(row);
  const canAddNote = canAddNoteToRow(row);
  const unavailableMessage = noteUnavailableMessage(row);
  const trimmedDraft = textValue(noteDraft);

  return (
    <div className="punch-notes-panel">
      <div className="punch-notes-title">
        <FileText className="h-4 w-4" />
        Notes
      </div>
      {notes.length > 0 ? (
        <div className="punch-note-list">
          {notes.map((note) => {
            const isEditing = activeNoteEditId === note.id;
            const editDraft = noteEditDrafts[note.id] ?? note.note ?? "";
            const trimmedEditDraft = textValue(editDraft);
            const noteCanEdit = canEditNote(note);
            const noteCanDelete = canDeleteNote(note);
            return (
              <div key={note.id} className="punch-note-item">
                <div>
                  <div className="punch-note-meta">
                    Note Added · {formatDateTime(note.createdAt) || "Recently"}
                  </div>
                  {isEditing ? (
                    <form
                      className="punch-note-edit-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (trimmedEditDraft) onEditNote(row, note, trimmedEditDraft);
                      }}
                    >
                      <textarea
                        value={editDraft}
                        onChange={(event) => onNoteEditDraftChange(note.id, event.target.value)}
                        maxLength={1000}
                        className="punch-note-input"
                        placeholder="Edit note"
                      />
                      <div className="punch-note-actions">
                        <button
                          type="button"
                          className="punch-note-cancel"
                          onClick={() => onCancelEditNote(note.id)}
                          disabled={noteEditingId === note.id}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={
                            !trimmedEditDraft ||
                            trimmedEditDraft === textValue(note.note) ||
                            noteEditingId === note.id
                          }
                          className="punch-note-submit"
                        >
                          {noteEditingId === note.id ? "Saving..." : "Save Note"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="punch-note-text">{note.note}</div>
                  )}
                </div>
                {(noteCanEdit || noteCanDelete) && (
                  <div className="punch-note-tools">
                    {noteCanEdit && (
                      <button
                        type="button"
                        className="punch-note-tool"
                        onClick={() => onStartEditNote(row, note)}
                        disabled={noteEditingId === note.id || noteDeletingId === note.id}
                        aria-label="Edit note"
                        title="Edit note"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {noteCanDelete && (
                      <button
                        type="button"
                        className="punch-note-delete"
                        onClick={() => onDeleteNote(row, note)}
                        disabled={noteDeletingId === note.id || noteEditingId === note.id}
                        aria-label="Delete note"
                        title="Delete note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="punch-note-empty">No notes yet.</div>
      )}
      {canAddNote ? (
        <form
          className="punch-note-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmedDraft) onAddNote(row, trimmedDraft);
          }}
        >
          <textarea
            value={noteDraft}
            onChange={(event) => onNoteDraftChange(row.id, event.target.value)}
            maxLength={1000}
            className="punch-note-input"
            placeholder="Add a note"
          />
          <div className="punch-note-actions">
            <button
              type="submit"
              disabled={!trimmedDraft || noteSaving}
              className="punch-note-submit"
            >
              <FileText className="h-4 w-4" />
              {noteSaving ? "Adding..." : "Add Note"}
            </button>
          </div>
        </form>
      ) : (
        <div className="punch-note-empty">{unavailableMessage}</div>
      )}
    </div>
  );
}

function HistoryPanel({ row, tradeOptions = [], onPreview }) {
  const history = historyActivities(row);

  return (
    <div className="punch-history-panel">
      <div className="punch-notes-title">
        <Clock className="h-4 w-4" />
        History
      </div>
      {history.length > 0 ? (
        <div className="punch-completion-events punch-history-events">
          {history.map((activity) => {
            const detail = historyActivityDetail(activity, tradeOptions);
            const completionPhoto = completionPhotoForActivity(
              activity,
              completionActivityLabel(activity)
            );
            return (
              <div key={activity.id} className="punch-completion-event punch-history-event">
                <div>
                  <div className="punch-completion-event-title">
                    {historyActivityLabel(activity)} · {formatDateTime(activity.createdAt) || "Recently"}
                  </div>
                  {detail && <div className="punch-completion-event-note">{detail}</div>}
                  {activity.note && activity.activityType !== "note_added" && (
                    <div className="punch-completion-event-note">{activity.note}</div>
                  )}
                </div>
                {completionPhoto && onPreview && (
                  <button
                    type="button"
                    className="punch-note-tool"
                    onClick={() => onPreview(row, completionPhoto)}
                    aria-label="Open completion photo"
                    title="Open completion photo"
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="punch-note-empty">No history yet.</div>
      )}
    </div>
  );
}

function RowDetail({
  row,
  tradeOptions,
  onDownloadOriginal,
  downloadId,
  onPreview,
}) {
  if (!row) {
    return (
      <div className="rounded-lg border border-border bg-background p-5 text-sm text-foreground/60 shadow-sm">
        Select an issue to view details.
      </div>
    );
  }

  const originalDownload = row.preview?.originalDownload || {};
  const reportHref = row.packageId ? `/reports` : "";

  return (
    <aside className="rounded-lg border border-border bg-background p-4 shadow-sm">
      <IssueThumbnail row={row} large onPreview={onPreview} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold"
          style={priorityStyle(row.priority)}
        >
          {optionLabel(row.priority, PRIORITY_LABELS)}
        </span>
        <span
          className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold"
          style={statusStyle(row.status)}
        >
          {statusLabel(row.status)}
        </span>
        <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
          {row.permissions?.canAddNote ? "Notes Enabled" : "Read Only"}
        </span>
      </div>

      <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
        {row.title || "Flagged observation"}
      </h2>
      {row.reason && row.reason !== row.title && (
        <p className="mt-2 text-sm leading-6 text-foreground/70">{row.reason}</p>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <ReadOnlyField label="Location" value={locationCodeLine(row)} />
        <ReadOnlyField label="Code" value={issueCode(row)} />
        <ReadOnlyField label="Property" value={propertyLine(row.property)} />
        <ReadOnlyField label="Organization" value={row.org?.name} />
        <ReadOnlyField label="Trade" value={tradeLabel(row.trade, tradeOptions)} />
        <ReadOnlyField label="Source" value={sourceLabel(row.source)} />
        <ReadOnlyField label="Captured" value={formatDateTime(row.capturedAt)} />
        <ReadOnlyField
          label={row.status === "resolved" ? "Resolved" : "Updated"}
          value={formatDateTime(row.resolvedAt || row.updatedAt)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {originalDownload.available && (
          <button
            type="button"
            onClick={() => onDownloadOriginal(row)}
            disabled={downloadId === row.id}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Original
          </button>
        )}
        {reportHref && (
          <a
            href={reportHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground/75 shadow-sm hover:text-foreground"
          >
        <FileText className="h-4 w-4" />
        Reports
          </a>
        )}
      </div>
    </aside>
  );
}

function IssueRow({
  row,
  selected,
  onSelect,
  onPreview,
  tradeOptions,
  canAddTradeOption,
  onWorkflowChange,
  onAddTrade,
  workflowSavingKey,
  notePanelOpen,
  onToggleNotePanel,
  historyPanelOpen,
  onToggleHistoryPanel,
  noteDraft,
  noteEditDrafts,
  onNoteDraftChange,
  onNoteEditDraftChange,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onStartEditNote,
  onCancelEditNote,
  completionPanelOpen,
  onToggleCompletionPanel,
  completionDraft,
  onCompletionFileChange,
  onRemoveCompletionFile,
  onOpenCompletionPrompt,
  onSubmitCompletion,
  onReviewCompletion,
  canEditStatus,
  noteSaving,
  noteEditingId,
  noteDeletingId,
  activeNoteEditId,
  completionSaving,
  completionReviewSavingKey,
}) {
  const flagNote = row.title || row.reason || "Flagged observation";
  const notes = activityNotes(row);
  const history = historyActivities(row);
  const canAddNote = canAddNoteToRow(row);
  const canEditWorkflow = canEditWorkflowForRow(row);
  const canSubmitCompletion = canSubmitCompletionForRow(row);
  const canReviewCompletion = canReviewCompletionForRow(row);
  const showCompletionButton = canSubmitCompletion || canReviewCompletion || row.status === "pending_review";
  const showNoteButton = canAddNote || notes.length > 0;
  const showHistoryButton = history.length > 0;
  const tradeValue = tradeKey(row.trade || "general") || "general";
  const dueDateValue = row.dueDate || "";
  const workflowTradeOptions = tradeOptionsForRow(row, tradeOptions);
  const resolved = row.status === "resolved";
  const pendingReview = row.status === "pending_review";
  const flagLineClass = resolved ? "is-resolved" : pendingReview ? "is-pending" : "";

  return (
    <article
      className={`punch-row rounded-lg border bg-background p-3 shadow-sm transition ${
        selected ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/10" : "border-border"
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        className="punch-row-body text-left outline-none"
        aria-expanded={selected}
      >
        <div className="punch-row-left">
          <IssueThumbnail row={row} onPreview={onPreview} />
        </div>
        <div className="punch-row-main">
          <PunchMetadataHeader row={row} />
          <div className={`punch-flag-line ${flagLineClass}`}>
            {resolved ? (
              <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={4} />
            ) : (
              <Flag className="h-3.5 w-3.5 shrink-0 fill-current" />
            )}
            <span>
              {resolved ? `Resolved: ${flagNote}` : pendingReview ? `Pending Review: ${flagNote}` : flagNote}
            </span>
            {showCompletionButton && (
              <button
                type="button"
                className={`punch-row-note-button is-completion ${
                  completionPanelOpen ? "is-active" : ""
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleCompletionPanel(row.id);
                }}
              >
                <ImageUp className="h-3.5 w-3.5" />
                Upload Photo
              </button>
            )}
            {showNoteButton && (
              <button
                type="button"
                className={`punch-row-note-button ${notePanelOpen ? "is-active" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleNotePanel(row.id);
                }}
              >
                <FileText className="h-3.5 w-3.5" />
                Notes
              </button>
            )}
            {showHistoryButton && (
              <button
                type="button"
                className={`punch-row-note-button ${historyPanelOpen ? "is-active" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleHistoryPanel(row.id);
                }}
              >
                <Clock className="h-3.5 w-3.5" />
                History
              </button>
            )}
          </div>
        </div>
        <div className="punch-row-controls">
          <WorkflowControl
            row={row}
            field="priority"
            label="Priority"
            value={row.priority || "medium"}
            displayValue={optionLabel(row.priority, PRIORITY_LABELS)}
            options={PRIORITY_OPTIONS}
            style={priorityStyle(row.priority)}
            canEdit={canEditWorkflow}
            saving={workflowSavingKey === `${row.id}:priority`}
            onChange={onWorkflowChange}
          />
          <WorkflowControl
            row={row}
            field="status"
            label="Status"
            value={row.status === "resolved" ? "resolved" : "active"}
            displayValue={statusLabel(row.status)}
            options={STATUS_OPTIONS}
            style={statusStyle(row.status)}
            canEdit={canEditStatus}
            saving={workflowSavingKey === `${row.id}:status`}
            onChange={onWorkflowChange}
          />
          <WorkflowControl
            row={row}
            field="dueDate"
            label="Due Date"
            value={dueDateValue}
            displayValue={formatDueDate(dueDateValue) || "None"}
            type="date"
            style={dueDateStyle(dueDateValue, row.status)}
            canEdit={canEditWorkflow}
            saving={workflowSavingKey === `${row.id}:dueDate`}
            onChange={onWorkflowChange}
          />
          <WorkflowControl
            row={row}
            field="trade"
            label="Trade"
            value={tradeValue}
            displayValue={tradeLabel(row.trade, tradeOptions)}
            options={workflowTradeOptions}
            canEdit={canEditWorkflow}
            saving={workflowSavingKey === `${row.id}:trade`}
            onChange={onWorkflowChange}
            onAddOption={canEditWorkflow && canAddTradeOption ? onAddTrade : null}
            addOptionLabel="Add Trade"
          />
        </div>
      </div>
      {completionPanelOpen && (
        <CompletionPanel
          row={row}
          completionDraft={completionDraft}
          onCompletionFileChange={onCompletionFileChange}
          onRemoveCompletionFile={onRemoveCompletionFile}
          onOpenCompletionPrompt={onOpenCompletionPrompt}
          onSubmitCompletion={onSubmitCompletion}
          onReviewCompletion={onReviewCompletion}
          onPreview={onPreview}
          completionSaving={completionSaving}
          completionReviewSavingKey={completionReviewSavingKey}
        />
      )}
      {notePanelOpen && (
        <div className="punch-row-note-area grid gap-3">
          {row.reason && row.reason !== row.title && (
            <p className="text-sm leading-6 text-foreground/70">{row.reason}</p>
          )}
          <NotesPanel
            row={row}
            noteDraft={noteDraft}
            noteEditDrafts={noteEditDrafts}
            onNoteDraftChange={onNoteDraftChange}
            onNoteEditDraftChange={onNoteEditDraftChange}
            onAddNote={onAddNote}
            onEditNote={onEditNote}
            onDeleteNote={onDeleteNote}
            onStartEditNote={onStartEditNote}
            onCancelEditNote={onCancelEditNote}
            noteSaving={noteSaving}
            noteEditingId={noteEditingId}
            noteDeletingId={noteDeletingId}
            activeNoteEditId={activeNoteEditId}
          />
        </div>
      )}
      {historyPanelOpen && (
        <div className="punch-row-note-area">
          <HistoryPanel
            row={row}
            tradeOptions={tradeOptions}
            onPreview={onPreview}
          />
        </div>
      )}
    </article>
  );
}

function PunchReportModal({
  open,
  tradeItems,
  selectedTrades,
  generating,
  onToggleTrade,
  onGenerate,
  onClose,
}) {
  if (!open) return null;

  const selectedCount = tradeItems.filter((item) => item.enabled && selectedTrades[item.id]).length;
  const orderedTradeItems = tradeItems
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      if (left.item.enabled !== right.item.enabled) return left.item.enabled ? -1 : 1;
      return left.index - right.index;
    })
    .map(({ item }) => item);

  return (
    <div
      className="punch-report-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Generate punch list report"
      onClick={() => {
        if (!generating) onClose();
      }}
    >
      <div className="punch-report-panel" onClick={(event) => event.stopPropagation()}>
        <div className="punch-report-header">
          <div>
            <div className="punch-report-title">Generate Punchlist</div>
            <div className="punch-report-subtitle">Open issues only. Choose trades to include.</div>
          </div>
          <button
            type="button"
            className="punch-report-close"
            onClick={onClose}
            disabled={generating}
            aria-label="Close report options"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="punch-report-body">
          {tradeItems.length === 0 ? (
            <div className="rounded-lg border border-border bg-slate-50 p-4 text-sm font-semibold text-foreground/60">
              No master trades are available.
            </div>
          ) : (
            <div className="punch-report-trades">
              {orderedTradeItems.map((item) => (
                <label
                  key={item.id}
                  className={`punch-report-trade ${item.enabled ? "" : "is-disabled"}`}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(item.enabled && selectedTrades[item.id])}
                    onChange={() => onToggleTrade(item.id)}
                    disabled={!item.enabled || generating}
                    aria-label={item.label}
                  />
                  <span>{item.label}</span>
                  <span className="punch-report-trade-count">
                    {item.count > 0 ? compactCount(item.count, "issue") : "No open issues"}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="punch-report-footer">
          <button
            type="button"
            className="punch-report-cancel"
            onClick={onClose}
            disabled={generating}
          >
            Cancel
          </button>
          <button
            type="button"
            className="punch-report-generate"
            onClick={onGenerate}
            disabled={generating || selectedCount === 0}
          >
            <Download className="h-4 w-4" />
            {generating ? "Generating..." : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}

function previewTargetRow(target) {
  return target?.row || target || null;
}

function previewTargetPhoto(target) {
  return target?.row ? target.photo || null : null;
}

function ImagePreviewModal({ target, onClose }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const row = previewTargetRow(target);
  const targetPhoto = previewTargetPhoto(target);
  const photos = useMemo(
    () => (targetPhoto ? [targetPhoto] : previewPhotosForRow(row)),
    [row, targetPhoto]
  );
  const activeIndex = Math.min(photoIndex, Math.max(photos.length - 1, 0));
  const activePhoto = photos[activeIndex] || null;
  const hasMultiplePhotos = photos.length > 1;

  useEffect(() => {
    setPhotoIndex(0);
  }, [row?.id, targetPhoto?.activityId, targetPhoto?.preview?.previewUrl]);

  useEffect(() => {
    if (!hasMultiplePhotos) return undefined;
    function handleKeyDown(event) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPhotoIndex((index) => (index + photos.length - 1) % photos.length);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setPhotoIndex((index) => (index + 1) % photos.length);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasMultiplePhotos, photos.length]);

  if (!activePhoto) return null;
  const flagNote = row.title || row.reason || "Flagged observation";
  const resolved = row.status === "resolved";
  const issueResolved = resolved && activePhoto.label === "Resolved";
  const issuePrefix = activePhoto.label ? `${activePhoto.label}: ` : "";
  const activePhotoMeta = [
    activePhoto.status,
    formatDateTime(activePhoto.capturedAt),
  ].filter(Boolean);
  const goPrevious = (event) => {
    event.stopPropagation();
    setPhotoIndex((index) => (index + photos.length - 1) % photos.length);
  };
  const goNext = (event) => {
    event.stopPropagation();
    setPhotoIndex((index) => (index + 1) % photos.length);
  };
  return (
    <div
      className="punch-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Punch list photo preview"
      onClick={onClose}
    >
      <div className="punch-lightbox-panel" onClick={(event) => event.stopPropagation()}>
        <div className="punch-lightbox-header">
          <div className="punch-lightbox-property">
            <PunchMetadataHeader row={row} />
          </div>
          <button
            type="button"
            className="punch-lightbox-close"
            onClick={onClose}
            aria-label="Close photo preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="punch-lightbox-media">
          <img
            src={activePhoto.preview.previewUrl}
            alt={locationCodeLine(row) || row.title || "Punch list photo preview"}
            className="punch-lightbox-image"
          />
          <span className="punch-lightbox-photo-label">{activePhoto.label}</span>
          {hasMultiplePhotos && (
            <>
              <button
                type="button"
                className="punch-lightbox-nav punch-lightbox-nav-previous"
                onClick={goPrevious}
                aria-label="Show previous punch list photo"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="punch-lightbox-nav punch-lightbox-nav-next"
                onClick={goNext}
                aria-label="Show next punch list photo"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
        {hasMultiplePhotos && (
          <div className="punch-lightbox-filmstrip" aria-label="Punch list photo history">
            {photos.map((photo, index) => (
              <button
                key={`${photo.label}:${photoIdentity(photo) || index}`}
                type="button"
                className={`punch-lightbox-filmstrip-button ${
                  index === activeIndex ? "is-active" : ""
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  setPhotoIndex(index);
                }}
                aria-label={`Show ${photo.label.toLowerCase()} photo`}
                aria-current={index === activeIndex ? "true" : undefined}
              >
                <img
                  src={photo.preview.previewUrl}
                  alt={`${photo.label} photo thumbnail`}
                />
              </button>
            ))}
          </div>
        )}
        <div className="punch-lightbox-summary">
          <div className={`punch-lightbox-issue ${issueResolved ? "is-resolved" : ""}`}>
            {issueResolved ? (
              <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={4} />
            ) : (
              <Flag className="h-3.5 w-3.5 shrink-0 fill-current" />
            )}
            <span>{`${issuePrefix}${flagNote}`}</span>
          </div>
          {(activePhotoMeta.length > 0 || activePhoto.note) && (
            <div className="punch-lightbox-caption">
              {activePhotoMeta.length > 0 && (
                <span>{activePhotoMeta.join(" · ")}</span>
              )}
              {activePhoto.note && <span>{activePhoto.note}</span>}
            </div>
          )}
          <div className="punch-lightbox-priority">
            Priority
            <span className="punch-lightbox-priority-value" style={priorityStyle(row.priority)}>
              {optionLabel(row.priority, PRIORITY_LABELS)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScoutPunchListPage() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [rows, setRows] = useState([]);
  const [orgOptions, setOrgOptions] = useState([]);
  const [allPropertyOptions, setAllPropertyOptions] = useState([]);
  const [masterTradeOptions, setMasterTradeOptions] = useState([]);
  const [canAddTradeOption, setCanAddTradeOption] = useState(false);
  const [punchListError, setPunchListError] = useState("");
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);
  const [punchListLoading, setPunchListLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState(TAB_OPEN);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState(ALL);
  const [selectedPriority, setSelectedPriority] = useState(ALL);
  const [selectedTrade, setSelectedTrade] = useState(ALL);
  const [selectedElevation, setSelectedElevation] = useState(ALL);
  const [selectedDetail, setSelectedDetail] = useState(ALL);
  const [selectedRowId, setSelectedRowId] = useState("");
  const [downloadId, setDownloadId] = useState("");
  const [previewRow, setPreviewRow] = useState(null);
  const [loadedRowsScope, setLoadedRowsScope] = useState({ orgId: "", propertyId: "" });
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState({});
  const [noteEditDrafts, setNoteEditDrafts] = useState({});
  const [noteSavingId, setNoteSavingId] = useState("");
  const [noteEditingId, setNoteEditingId] = useState("");
  const [noteDeletingId, setNoteDeletingId] = useState("");
  const [completionDrafts, setCompletionDrafts] = useState({});
  const [completionSavingId, setCompletionSavingId] = useState("");
  const [completionReviewSavingKey, setCompletionReviewSavingKey] = useState("");
  const [workflowSavingKey, setWorkflowSavingKey] = useState("");
  const [activeNoteRowId, setActiveNoteRowId] = useState("");
  const [activeCompletionRowId, setActiveCompletionRowId] = useState("");
  const [activeHistoryRowId, setActiveHistoryRowId] = useState("");
  const [completionPromptRowId, setCompletionPromptRowId] = useState("");
  const [activeNoteEditId, setActiveNoteEditId] = useState("");
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportSelectedTrades, setReportSelectedTrades] = useState({});
  const [reportGenerating, setReportGenerating] = useState(false);
  const [canOpenAdmin, setCanOpenAdmin] = useState(false);
  const sessionScopeRef = useRef("");
  const filterRequestRef = useRef(0);
  const bootstrapTokenRef = useRef("");
  const pendingManualRefreshRef = useRef(false);

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
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session || null);
        setAuthLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setAuthLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  function applyPunchListFilterBody(body, activeSession = session) {
    const nextOrgOptions = body.orgs.map(orgOption);
    const nextPropertyOptions = body.properties
      .map(propertyOption)
      .sort((left, right) => left.label.localeCompare(right.label));
    const nextTradeOptions = Array.isArray(body.tradeOptions)
      ? body.tradeOptions
          .map(tradeOptionFromApi)
          .filter(Boolean)
          .sort((left, right) => left.label.localeCompare(right.label))
      : [];
    const savedContext = readPortalContext(activeSession);
    const nextOrgId = nextOrgOptions.some((option) => option.id === selectedOrgId)
      ? selectedOrgId
      : nextOrgOptions.some((option) => option.id === savedContext.orgId)
        ? savedContext.orgId
      : nextOrgOptions[0]?.id || "";
    const selectedPropertyStillAvailable = propertyIdIsValidForOrg(
      nextPropertyOptions,
      nextOrgId,
      selectedPropertyId
    );
    const savedPropertyStillAvailable = propertyIdIsValidForOrg(
      nextPropertyOptions,
      nextOrgId,
      savedContext.propertyId
    );
    const nextPropertyId = selectedPropertyStillAvailable
      ? selectedPropertyId
      : savedPropertyStillAvailable
        ? savedContext.propertyId
      : defaultPropertyIdForOrg(nextPropertyOptions, nextOrgId);

    setOrgOptions(nextOrgOptions);
    setAllPropertyOptions(nextPropertyOptions);
    setMasterTradeOptions(nextTradeOptions);
    setCanAddTradeOption(Boolean(body.permissions?.canAddTradeOption));
    setSelectedOrgId(nextOrgId);
    setSelectedPropertyId(nextPropertyId);
    setFiltersReady(true);
    if (nextOrgId) {
      writePortalContext(activeSession, {
        orgId: nextOrgId,
        propertyId: nextPropertyId,
      });
    }
  }

  async function loadPunchListFilters(activeSession = session, { force = false } = {}) {
    if (!activeSession?.access_token) return false;
    const requestId = filterRequestRef.current + 1;
    filterRequestRef.current = requestId;
    const isLatestRequest = () => filterRequestRef.current === requestId;
    const cacheKey = buildFilterCacheKey(activeSession);
    if (!force) {
      const cachedFilters = cacheGet(punchListFilterCache, cacheKey);
      if (cachedFilters) {
        if (!isLatestRequest()) return;
        setPunchListError("");
        setFiltersLoading(false);
        setFiltersReady(false);
        applyPunchListFilterBody(cachedFilters, activeSession);
        return true;
      }
    }
    setFiltersLoading(true);
    setFiltersReady(false);
    setPunchListError("");
    try {
      const response = await fetch("/api/punch-list?mode=filters", {
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`,
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(body.orgs) || !Array.isArray(body.properties)) {
        throw new Error(body.error || "Unable to load punch list filters.");
      }

      const filterBody = {
        orgs: body.orgs,
        properties: body.properties,
        tradeOptions: Array.isArray(body.tradeOptions) ? body.tradeOptions : [],
        permissions: body.permissions || {},
      };
      if (!isLatestRequest()) return;
      cacheSet(punchListFilterCache, cacheKey, filterBody);
      applyPunchListFilterBody(filterBody, activeSession);
      return true;
    } catch (error) {
      if (!isLatestRequest()) return;
      setPunchListError(error.message || "Unable to load punch list filters.");
      setOrgOptions([]);
      setAllPropertyOptions([]);
      setMasterTradeOptions([]);
      setCanAddTradeOption(false);
      setRows([]);
      setSelectedOrgId("");
      setSelectedPropertyId("");
      setFiltersReady(true);
      return false;
    } finally {
      if (isLatestRequest()) {
        setFiltersLoading(false);
      }
    }
  }

  async function loadPunchList(activeSession = session, { force = false } = {}) {
    if (!activeSession?.access_token) return false;
    if (!selectedOrgId) {
      setRows([]);
      setLoadedRowsScope({ orgId: "", propertyId: "" });
      return false;
    }
    const selectedOrgProperties = propertyOptionsForOrg(allPropertyOptions, selectedOrgId);
    if (filtersReady && selectedOrgProperties.length === 0) {
      setRows([]);
      setLoadedRowsScope({ orgId: "", propertyId: "" });
      return false;
    }
    const propertyScope = selectedPropertyId && selectedPropertyId !== ALL ? selectedPropertyId : ALL;
    const rowsScopeKey = buildRowsScopeKey(activeSession, selectedOrgId, propertyScope);
    const rowsFilterKey = buildRowsFilterKey(
      activeSession,
      selectedOrgId,
      propertyScope,
      selectedTab,
      selectedPriority,
      selectedTrade
    );
    if (!force) {
      const cachedViewRows = cacheGet(punchListViewCache, rowsFilterKey);
      if (cachedViewRows) {
        setPunchListError("");
        setPunchListLoading(false);
        setLoadedRowsScope({ orgId: selectedOrgId, propertyId: propertyScope });
        setRows(cachedViewRows);
        return true;
      }

      const cachedRows = cacheGet(punchListRowsCache, rowsScopeKey);
      if (cachedRows) {
        cacheSet(punchListViewCache, rowsFilterKey, cachedRows);
        setPunchListError("");
        setPunchListLoading(false);
        setLoadedRowsScope({ orgId: selectedOrgId, propertyId: propertyScope });
        setRows(cachedRows);
        return true;
      }
    }
    setPunchListLoading(true);
    setPunchListError("");
    try {
      const params = new URLSearchParams({ orgId: selectedOrgId });
      if (selectedPropertyId && selectedPropertyId !== ALL) {
        params.set("propertyId", selectedPropertyId);
      }
      const response = await fetch(`/api/punch-list?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`,
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(body.rows)) {
        throw new Error(body.error || "Unable to load punch list.");
      }
      clearViewCacheForRowsScope(activeSession, selectedOrgId, propertyScope);
      cacheSet(punchListRowsCache, rowsScopeKey, body.rows);
      cacheSet(punchListViewCache, rowsFilterKey, body.rows);
      setLoadedRowsScope({ orgId: selectedOrgId, propertyId: propertyScope });
      setRows(body.rows);
      return true;
    } catch (error) {
      setPunchListError(error.message || "Unable to load punch list.");
      setRows([]);
      setLoadedRowsScope({ orgId: "", propertyId: "" });
      return false;
    } finally {
      setPunchListLoading(false);
    }
  }

  useEffect(() => {
    if (!session?.access_token) {
      clearPunchListCaches();
      pendingManualRefreshRef.current = false;
      sessionScopeRef.current = "";
      setCanOpenAdmin(false);
      return;
    }
    const nextScope = sessionCacheScope(session);
    if (sessionScopeRef.current && sessionScopeRef.current !== nextScope) {
      clearPunchListCaches();
    }
    sessionScopeRef.current = nextScope;
  }, [session?.access_token, session?.user?.email, session?.user?.id]);

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
    if (session?.access_token) {
      const nextBootstrapScope = sessionCacheScope(session);
      if (bootstrapTokenRef.current !== nextBootstrapScope) {
        setRows([]);
        setOrgOptions([]);
        setAllPropertyOptions([]);
        setMasterTradeOptions([]);
        setCanAddTradeOption(false);
        setSelectedOrgId("");
        setSelectedPropertyId("");
        setSelectedElevation(ALL);
        setSelectedDetail(ALL);
        setSelectedRowId("");
        setLoadedRowsScope({ orgId: "", propertyId: "" });
        setLastRefreshedAt(null);
        setPunchListError("");
        setNoteDrafts({});
        setNoteEditDrafts({});
        setNoteSavingId("");
        setNoteEditingId("");
        setNoteDeletingId("");
        setCompletionDrafts({});
        setCompletionSavingId("");
        setCompletionReviewSavingKey("");
        setWorkflowSavingKey("");
        setActiveNoteRowId("");
        setActiveCompletionRowId("");
        setActiveHistoryRowId("");
        setActiveNoteEditId("");
        setReportModalOpen(false);
        setReportSelectedTrades({});
        setReportGenerating(false);
        setFiltersReady(false);
      }
      bootstrapTokenRef.current = nextBootstrapScope;
      loadPunchListFilters(session);
    } else {
      filterRequestRef.current += 1;
      bootstrapTokenRef.current = "";
      setRows([]);
      setOrgOptions([]);
      setAllPropertyOptions([]);
      setMasterTradeOptions([]);
      setCanAddTradeOption(false);
      setSelectedOrgId("");
      setSelectedPropertyId("");
      setSelectedElevation(ALL);
      setSelectedDetail(ALL);
      setLoadedRowsScope({ orgId: "", propertyId: "" });
      setLastRefreshedAt(null);
      setPunchListError("");
      setNoteDrafts({});
      setNoteEditDrafts({});
      setNoteSavingId("");
      setNoteEditingId("");
      setNoteDeletingId("");
      setCompletionDrafts({});
      setCompletionSavingId("");
      setCompletionReviewSavingKey("");
      setWorkflowSavingKey("");
      setActiveNoteRowId("");
      setActiveCompletionRowId("");
      setActiveHistoryRowId("");
      setActiveNoteEditId("");
      setReportModalOpen(false);
      setReportSelectedTrades({});
      setReportGenerating(false);
      setFiltersReady(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token || !filtersReady || filtersLoading) return;
    let active = true;
    const force = pendingManualRefreshRef.current;
    loadPunchList(session, { force }).then((refreshed) => {
      if (!active || !force || !pendingManualRefreshRef.current) return;
      pendingManualRefreshRef.current = false;
      if (refreshed) {
        setLastRefreshedAt(new Date());
      }
      setManualRefreshing(false);
    });
    return () => {
      active = false;
    };
  }, [
    session?.access_token,
    filtersReady,
    filtersLoading,
    selectedOrgId,
    selectedPropertyId,
    selectedTab,
    selectedPriority,
    selectedTrade,
  ]);

  useEffect(() => {
    if (!previewRow) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") setPreviewRow(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewRow]);

  useEffect(() => {
    if (!reportModalOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape" && !reportGenerating) setReportModalOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reportGenerating, reportModalOpen]);

  async function handleSignIn(event) {
    event.preventDefault();
    setAuthError("");
    if (!hasSupabaseConfig || !supabase) {
      setAuthError("Supabase is not configured for this site.");
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setAuthError(error.message || "Unable to sign in.");
      return;
    }
    if (data?.session) {
      bootstrapTokenRef.current = sessionCacheScope(data.session);
      setSession(data.session);
      setAuthLoading(false);
      await loadPunchListFilters(data.session, { force: true });
    }
  }

  async function handleSignOut() {
    clearPunchListCaches();
    await supabase?.auth.signOut();
    setRows([]);
    setOrgOptions([]);
    setAllPropertyOptions([]);
    setMasterTradeOptions([]);
    setCanAddTradeOption(false);
    setSelectedOrgId("");
    setSelectedPropertyId("");
    setSelectedElevation(ALL);
    setSelectedDetail(ALL);
    setLoadedRowsScope({ orgId: "", propertyId: "" });
    setLastRefreshedAt(null);
    setManualRefreshing(false);
    setNoteDrafts({});
    setNoteEditDrafts({});
    setNoteSavingId("");
    setNoteEditingId("");
    setNoteDeletingId("");
    setCompletionDrafts({});
    setCompletionSavingId("");
    setCompletionReviewSavingKey("");
    setWorkflowSavingKey("");
    setActiveNoteRowId("");
    setActiveCompletionRowId("");
    setActiveHistoryRowId("");
    setCompletionPromptRowId("");
    setActiveNoteEditId("");
    setReportModalOpen(false);
    setReportSelectedTrades({});
    setReportGenerating(false);
  }

  async function handleRefresh() {
    setManualRefreshing(true);
    setLastRefreshedAt(null);
    clearPunchListCaches();
    pendingManualRefreshRef.current = true;
    const filtersRefreshed = await loadPunchListFilters(session, { force: true });
    if (!filtersRefreshed) {
      pendingManualRefreshRef.current = false;
      setManualRefreshing(false);
    }
  }

  function handleNoteDraftChange(rowId, value) {
    setNoteDrafts((current) => ({
      ...current,
      [rowId]: value,
    }));
  }

  function handleNoteEditDraftChange(noteId, value) {
    setNoteEditDrafts((current) => ({
      ...current,
      [noteId]: value,
    }));
  }

  function handleCompletionDraftChange(rowId, patch) {
    setCompletionDrafts((current) => ({
      ...current,
      [rowId]: {
        ...(current[rowId] || {}),
        ...patch,
      },
    }));
  }

  function handleCompletionFileChange(rowId, file, options = {}) {
    handleCompletionDraftChange(rowId, { file });
    setPunchListError("");
    if (file && options.prompt) {
      setCompletionPromptRowId(rowId);
    }
  }

  function handleRemoveCompletionFile(rowId) {
    setCompletionDrafts((current) => {
      const next = {
        ...(current[rowId] || {}),
        file: null,
      };
      return {
        ...current,
        [rowId]: next,
      };
    });
    setCompletionPromptRowId((current) => (current === rowId ? "" : current));
  }

  function handleToggleCompletionPanel(rowId) {
    setSelectedRowId(rowId);
    setActiveCompletionRowId((current) => (current === rowId ? "" : rowId));
    setActiveNoteRowId("");
    setActiveHistoryRowId("");
    setActiveNoteEditId("");
    setNoteEditDrafts({});
  }

  function handleOpenCompletionPrompt(rowId) {
    setCompletionPromptRowId(rowId);
  }

  function handleToggleNotePanel(rowId) {
    setSelectedRowId(rowId);
    const isClosing = activeNoteRowId === rowId;
    setActiveNoteRowId(isClosing ? "" : rowId);
    setActiveCompletionRowId("");
    setActiveHistoryRowId("");
    if (isClosing) {
      setActiveNoteEditId("");
      setNoteEditDrafts({});
    }
  }

  function handleToggleHistoryPanel(rowId) {
    setSelectedRowId(rowId);
    setActiveHistoryRowId((current) => (current === rowId ? "" : rowId));
    setActiveCompletionRowId("");
    setActiveNoteRowId("");
    setActiveNoteEditId("");
    setNoteEditDrafts({});
  }

  function handleOpenPreview(row, photo = null) {
    if (!row) return;
    setPreviewRow(photo ? { row, photo } : row);
  }

  function handleStartEditNote(_row, note) {
    if (!canEditNote(note)) return;
    setActiveNoteEditId(note.id);
    setNoteEditDrafts((current) => ({
      ...current,
      [note.id]: note.note || "",
    }));
  }

  function handleCancelEditNote(noteId) {
    setActiveNoteEditId((current) => (current === noteId ? "" : current));
    setNoteEditDrafts((current) => {
      const next = { ...current };
      delete next[noteId];
      return next;
    });
  }

  async function handleWorkflowChange(row, field, value) {
    if (!session?.access_token || !canEditWorkflowForRow(row)) return;
    const nextPatch = workflowPatch(field, value);
    const previousPatch = { [field]: row[field] ?? null };
    if ((previousPatch[field] || null) === (nextPatch[field] || null)) return;
    const saveKey = `${row.id}:${field}`;
    setWorkflowSavingKey(saveKey);
    setPunchListError("");
    setRows((current) => patchRowList(current, row.id, nextPatch));
    setPreviewRow((current) => (current?.id === row.id ? { ...current, ...nextPatch } : current));
    patchCachedPunchListRows(session, row.id, nextPatch);
    try {
      const response = await fetch("/api/punch-list", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          observationId: row.observationId,
          shotId: row.observationId ? null : row.shotId,
          packageId: row.observationId ? null : row.packageId,
          field,
          value: nextPatch[field],
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.updated) {
        throw new Error(body.error || "Unable to update punch list field.");
      }
      if (body.observationId && !row.observationId) {
        const observationPatch = { observationId: body.observationId };
        setRows((current) => patchRowList(current, row.id, observationPatch));
        setPreviewRow((current) => (current?.id === row.id ? { ...current, ...observationPatch } : current));
        patchCachedPunchListRows(session, row.id, observationPatch);
      }
    } catch (error) {
      setRows((current) => patchRowList(current, row.id, previousPatch));
      setPreviewRow((current) => (current?.id === row.id ? { ...current, ...previousPatch } : current));
      patchCachedPunchListRows(session, row.id, previousPatch);
      setPunchListError(error.message || "Unable to update punch list field.");
    } finally {
      setWorkflowSavingKey("");
    }
  }

  async function handleAddTrade(row) {
    if (!session?.access_token || !canEditWorkflowForRow(row) || !canAddTradeOption) return;
    const name = window.prompt("New trade name");
    const tradeName = textValue(name).replace(/\s+/g, " ");
    if (!tradeName) return;

    setPunchListError("");
    try {
      const response = await fetch("/api/punch-list?mode=trade-options", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: tradeName }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.tradeOption) {
        throw new Error(body.error || "Unable to add trade.");
      }
      clearPunchListCaches();
      await loadPunchListFilters(session, { force: true });
    } catch (error) {
      setPunchListError(error.message || "Unable to add trade.");
    }
  }

  async function handleAddNote(row, note) {
    if (!session?.access_token || !canAddNoteToRow(row)) return;
    const trimmedNote = textValue(note);
    if (!trimmedNote) return;

    setNoteSavingId(row.id);
    setPunchListError("");
    try {
      const response = await fetch("/api/punch-list", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          observationId: row.observationId,
          shotId: row.observationId ? null : row.shotId,
          packageId: row.observationId ? null : row.packageId,
          note: trimmedNote,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.activity) {
        throw new Error(body.error || "Unable to add note.");
      }
      clearPunchListCaches();
      setNoteDrafts((current) => ({
        ...current,
        [row.id]: "",
      }));
      await loadPunchList(session, { force: true });
    } catch (error) {
      setPunchListError(error.message || "Unable to add note.");
    } finally {
      setNoteSavingId("");
    }
  }

  async function handleSubmitCompletion(row) {
    if (!session?.access_token || !supabase || !canSubmitCompletionForRow(row)) return;
    const draft = completionDrafts[row.id] || {};
    const file = draft.file || null;
    const fileError = validateCompletionFile(file);
    if (fileError) {
      setPunchListError(fileError);
      return;
    }

    setCompletionSavingId(row.id);
    setPunchListError("");
    try {
      const mimeType = completionMimeTypeForFile(file);
      const uploadResponse = await fetch("/api/punch-list?mode=completion-upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          observationId: row.observationId,
          shotId: row.observationId ? null : row.shotId,
          packageId: row.observationId ? null : row.packageId,
          file: {
            filename: file.name,
            mimeType,
            byteSize: file.size,
          },
        }),
      });
      const uploadBody = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok || !uploadBody.upload?.bucket || !uploadBody.upload?.path || !uploadBody.upload?.token) {
        throw new Error(uploadBody.error || "Unable to prepare completion photo upload.");
      }

      const { error: storageError } = await supabase.storage
        .from(uploadBody.upload.bucket)
        .uploadToSignedUrl(uploadBody.upload.path, uploadBody.upload.token, file, {
          contentType: mimeType,
        });
      if (storageError) {
        throw new Error(storageError.message || "Unable to upload completion photo.");
      }

      const submitResponse = await fetch("/api/punch-list?mode=completion-submit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          observationId: uploadBody.observationId || row.observationId,
          shotId: row.observationId ? null : row.shotId,
          packageId: row.observationId ? null : row.packageId,
          note: draft.note || "",
          upload: uploadBody.upload,
        }),
      });
      const submitBody = await submitResponse.json().catch(() => ({}));
      if (!submitResponse.ok || !submitBody.submitted) {
        throw new Error(submitBody.error || "Unable to submit completion.");
      }

      clearPunchListCaches();
      setCompletionDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setCompletionPromptRowId("");
      setActiveCompletionRowId(row.id);
      await loadPunchList(session, { force: true });
    } catch (error) {
      setPunchListError(error.message || "Unable to submit completion.");
    } finally {
      setCompletionSavingId("");
    }
  }

  async function handleReviewCompletion(row, action) {
    if (!session?.access_token || !canReviewCompletionForRow(row)) return;
    const normalizedAction = action === "reject" ? "reject" : "approve";
    const note =
      normalizedAction === "reject"
        ? textValue(window.prompt("Reason for rejection (optional)") || "")
        : "";
    const saveKey = `${row.id}:${normalizedAction}`;
    setCompletionReviewSavingKey(saveKey);
    setPunchListError("");
    try {
      const response = await fetch("/api/punch-list?mode=completion-review", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          activityId: row.completionReview.activityId,
          action: normalizedAction,
          note,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.reviewed) {
        throw new Error(body.error || "Unable to review completion.");
      }
      clearPunchListCaches();
      await loadPunchList(session, { force: true });
    } catch (error) {
      setPunchListError(error.message || "Unable to review completion.");
    } finally {
      setCompletionReviewSavingKey("");
    }
  }

  async function handleEditNote(row, note, nextNote) {
    if (!session?.access_token || !canEditNote(note)) return;
    const trimmedNote = textValue(nextNote);
    if (!trimmedNote || trimmedNote === textValue(note.note)) return;

    setNoteEditingId(note.id);
    setPunchListError("");
    try {
      const response = await fetch("/api/punch-list", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          noteId: note.id,
          note: trimmedNote,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.updated) {
        throw new Error(body.error || "Unable to edit note.");
      }
      clearPunchListCaches();
      setActiveNoteEditId("");
      setNoteEditDrafts((current) => {
        const next = { ...current };
        delete next[note.id];
        return next;
      });
      await loadPunchList(session, { force: true });
    } catch (error) {
      setPunchListError(error.message || "Unable to edit note.");
    } finally {
      setNoteEditingId("");
    }
  }

  async function handleDeleteNote(row, note) {
    if (!session?.access_token || !canDeleteNote(note)) return;
    const confirmed = window.confirm("Delete this note?");
    if (!confirmed) return;

    setNoteDeletingId(note.id);
    setPunchListError("");
    try {
      const response = await fetch("/api/punch-list", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          noteId: note.id,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.deleted) {
        throw new Error(body.error || "Unable to delete note.");
      }
      clearPunchListCaches();
      await loadPunchList(session, { force: true });
    } catch (error) {
      setPunchListError(error.message || "Unable to delete note.");
    } finally {
      setNoteDeletingId("");
    }
  }

  async function handleDownloadOriginal(row) {
    if (!session?.access_token || !row.preview?.originalDownload?.apiPath) return;
    setDownloadId(row.id);
    setPunchListError("");
    try {
      const response = await fetch(row.preview.originalDownload.apiPath, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.downloadUrl) {
        throw new Error(body.error || "Unable to prepare original photo download.");
      }
      window.location.assign(body.downloadUrl);
    } catch (error) {
      setPunchListError(error.message || "Unable to prepare original photo download.");
    } finally {
      setDownloadId("");
    }
  }

  function handleOpenReportModal() {
    const selected = {};
    for (const item of reportTradeItems) {
      if (item.enabled) selected[item.id] = true;
    }
    setReportSelectedTrades(selected);
    setReportModalOpen(true);
  }

  function handleToggleReportTrade(tradeId) {
    const item = reportTradeItems.find((trade) => trade.id === tradeId);
    if (!item?.enabled || reportGenerating) return;
    setReportSelectedTrades((current) => ({
      ...current,
      [tradeId]: !current[tradeId],
    }));
  }

  async function handleGenerateReport() {
    if (!session?.access_token || !selectedOrgId || selectedReportTradeIds.length === 0) return;
    setReportGenerating(true);
    setPunchListError("");
    try {
      const response = await fetch("/api/punch-list?mode=pdf", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orgId: selectedOrgId,
          propertyId: selectedPropertyId || ALL,
          trades: selectedReportTradeIds,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        const body = contentType.includes("application/json")
          ? await response.json().catch(() => ({}))
          : {};
        throw new Error(body.error || "Unable to generate punch list PDF.");
      }

      const blob = await response.blob();
      const filename = filenameFromContentDisposition(
        response.headers.get("content-disposition"),
        "Punch_List_Report.pdf"
      );
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setReportModalOpen(false);
    } catch (error) {
      setPunchListError(error.message || "Unable to generate punch list PDF.");
    } finally {
      setReportGenerating(false);
    }
  }

  function hasCachedRowsForScope(orgId, propertyId) {
    if (!session?.access_token || !orgId) return false;
    const propertyScope = propertyId && propertyId !== ALL ? propertyId : ALL;
    const rowsFilterKey = buildRowsFilterKey(
      session,
      orgId,
      propertyScope,
      selectedTab,
      selectedPriority,
      selectedTrade
    );
    const rowsScopeKey = buildRowsScopeKey(session, orgId, propertyScope);
    return (
      cacheGet(punchListViewCache, rowsFilterKey) !== null ||
      cacheGet(punchListRowsCache, rowsScopeKey) !== null
    );
  }

  function prepareRowsForScope(orgId, propertyId) {
    setLastRefreshedAt(null);
    if (!orgId || !propertyId) {
      setRows([]);
      setLoadedRowsScope({ orgId: "", propertyId: "" });
      setSelectedRowId("");
      setPunchListLoading(false);
      return;
    }
    if (hasCachedRowsForScope(orgId, propertyId)) return;
    setRows([]);
    setLoadedRowsScope({ orgId: "", propertyId: "" });
    setSelectedRowId("");
    setPunchListLoading(true);
  }

  const displayedOrgId = loadedRowsScope.orgId || selectedOrgId;
  const displayedPropertyId = loadedRowsScope.propertyId || selectedPropertyId || ALL;

  const orgFilteredRows = useMemo(() => {
    if (!displayedOrgId) return rows;
    return rows.filter((row) => row.org?.id === displayedOrgId);
  }, [displayedOrgId, rows]);

  const propertyOptions = useMemo(
    () => propertyOptionsForOrg(allPropertyOptions, selectedOrgId),
    [allPropertyOptions, selectedOrgId]
  );

  useEffect(() => {
    if (!session?.access_token || !filtersReady || !selectedOrgId) return;
    if (!orgOptions.some((option) => option.id === selectedOrgId)) return;
    if (
      selectedPropertyId &&
      !propertyIdIsValidForOrg(allPropertyOptions, selectedOrgId, selectedPropertyId)
    ) {
      return;
    }

    writePortalContext(session, {
      orgId: selectedOrgId,
      propertyId: selectedPropertyId,
    });
  }, [allPropertyOptions, filtersReady, orgOptions, selectedOrgId, selectedPropertyId, session]);

  useEffect(() => {
    if (!filtersReady) return;
    if (propertyOptions.length === 0) {
      if (selectedPropertyId) setSelectedPropertyId("");
      return;
    }
    if (
      !selectedPropertyId ||
      (selectedPropertyId === ALL && propertyOptions.length <= 1) ||
      (selectedPropertyId !== ALL && !propertyOptions.some((option) => option.id === selectedPropertyId))
    ) {
      setSelectedPropertyId(propertyOptions[0].id);
    }
  }, [filtersReady, propertyOptions, selectedPropertyId]);

  const priorityOptions = useMemo(
    () =>
      uniqueOptions(
        orgFilteredRows,
        (row) => row.priority || "medium",
        (priority) => optionLabel(priority, PRIORITY_LABELS)
      ),
    [orgFilteredRows]
  );

  const tradeOptions = useMemo(
    () => {
      const byId = new Map();
      for (const option of masterTradeOptions) {
        if (option?.id) byId.set(option.id, option);
      }
      for (const option of uniqueOptions(
        orgFilteredRows,
        (row) => tradeKey(row.trade || "general"),
        (trade) => tradeLabel(trade, masterTradeOptions)
      )) {
        if (option?.id) byId.set(option.id, option);
      }
      if (!byId.has("general")) {
        byId.set("general", { id: "general", label: "General" });
      }
      return Array.from(byId.values()).sort((left, right) => left.label.localeCompare(right.label));
    },
    [masterTradeOptions, orgFilteredRows]
  );

  const elevationOptions = useMemo(
    () =>
      uniqueNormalizedOptions(
        orgFilteredRows,
        (row) => row.elevation,
        elevationLabel,
        elevationOptionCompare
      ),
    [orgFilteredRows]
  );

  const detailOptions = useMemo(
    () =>
      uniqueNormalizedOptions(
        orgFilteredRows,
        (row) => row.detailType,
        readableDetailLabel
      ),
    [orgFilteredRows]
  );

  useEffect(() => {
    if (selectedElevation !== ALL && !elevationOptions.some((option) => option.id === selectedElevation)) {
      setSelectedElevation(ALL);
    }
  }, [elevationOptions, selectedElevation]);

  useEffect(() => {
    if (selectedDetail !== ALL && !detailOptions.some((option) => option.id === selectedDetail)) {
      setSelectedDetail(ALL);
    }
  }, [detailOptions, selectedDetail]);

  useEffect(() => {
    if (selectedTrade !== ALL && !tradeOptions.some((option) => option.id === selectedTrade)) {
      setSelectedTrade(ALL);
    }
  }, [selectedTrade, tradeOptions]);

  const tabRows = useMemo(() => {
    const wantsResolved = selectedTab === TAB_RESOLVED;
    return orgFilteredRows.filter((row) =>
      wantsResolved ? row.status === "resolved" : row.status !== "resolved"
    );
  }, [orgFilteredRows, selectedTab]);

  const filteredRows = useMemo(() => {
    return tabRows.filter((row) => {
      if (displayedPropertyId !== ALL && row.property?.id !== displayedPropertyId) return false;
      if (selectedPriority !== ALL && row.priority !== selectedPriority) return false;
      if (selectedTrade !== ALL && tradeKey(row.trade) !== selectedTrade) return false;
      if (selectedElevation !== ALL && normalizedOptionId(row.elevation) !== selectedElevation) return false;
      if (selectedDetail !== ALL && normalizedOptionId(row.detailType) !== selectedDetail) return false;
      return true;
    });
  }, [displayedPropertyId, selectedDetail, selectedElevation, selectedPriority, selectedTrade, tabRows]);

  useEffect(() => {
    if (filteredRows.length === 0) {
      if (selectedRowId) setSelectedRowId("");
      if (activeNoteRowId) setActiveNoteRowId("");
      if (activeCompletionRowId) setActiveCompletionRowId("");
      if (activeHistoryRowId) setActiveHistoryRowId("");
      return;
    }
    if (!selectedRowId || !filteredRows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId(filteredRows[0].id);
    }
    if (activeNoteRowId && !filteredRows.some((row) => row.id === activeNoteRowId)) {
      setActiveNoteRowId("");
    }
    if (activeCompletionRowId && !filteredRows.some((row) => row.id === activeCompletionRowId)) {
      setActiveCompletionRowId("");
    }
    if (activeHistoryRowId && !filteredRows.some((row) => row.id === activeHistoryRowId)) {
      setActiveHistoryRowId("");
    }
  }, [activeCompletionRowId, activeHistoryRowId, activeNoteRowId, filteredRows, selectedRowId]);

  const selectedRow = useMemo(
    () => filteredRows.find((row) => row.id === selectedRowId) || null,
    [filteredRows, selectedRowId]
  );

  const reportOpenRows = useMemo(
    () =>
      orgFilteredRows.filter(
        (row) =>
          row.status !== "resolved" &&
          (displayedPropertyId === ALL || row.property?.id === displayedPropertyId)
      ),
    [displayedPropertyId, orgFilteredRows]
  );

  const reportTradeCounts = useMemo(() => {
    const counts = new Map();
    for (const row of reportOpenRows) {
      const id = tradeKey(row.trade || "general") || "general";
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }, [reportOpenRows]);

  const reportTradeItems = useMemo(
    () =>
      masterTradeOptions.map((option) => {
        const count = reportTradeCounts.get(option.id) || 0;
        return {
          id: option.id,
          label: option.label,
          count,
          enabled: count > 0,
        };
      }),
    [masterTradeOptions, reportTradeCounts]
  );

  const selectedReportTradeIds = useMemo(
    () =>
      reportTradeItems
        .filter((item) => item.enabled && reportSelectedTrades[item.id])
        .map((item) => item.id),
    [reportSelectedTrades, reportTradeItems]
  );

  const openCount = orgFilteredRows.filter((row) => row.status !== "resolved").length;
  const resolvedCount = orgFilteredRows.filter((row) => row.status === "resolved").length;
  const completionPromptRow = rows.find((row) => row.id === completionPromptRowId) || null;
  const showAllPropertiesOption = propertyOptions.length > 1;
  const propertySelectValue =
    propertyOptions.length === 0
      ? ""
      : selectedPropertyId === ALL && !showAllPropertiesOption
        ? propertyOptions[0]?.id || ""
        : selectedPropertyId || propertyOptions[0]?.id || "";
  const noPunchListProperties =
    Boolean(session) && filtersReady && !filtersLoading && orgOptions.length > 0 && propertyOptions.length === 0;
  const noPunchListSources =
    Boolean(session) && filtersReady && !filtersLoading && orgOptions.length === 0;

  return (
    <div
      style={{ "--brand": BRAND.brandNavy, "--brand-ink": "#23243A" }}
      className="min-h-screen bg-slate-50 text-foreground"
    >
      <style>{PUNCH_LIST_STYLES}</style>
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
          {session && (
            <div className="flex items-center gap-2">
              <a
                href="/reports"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground/75 shadow-sm hover:text-foreground"
              >
                <FileText className="h-4 w-4" />
                Reports
              </a>
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
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
        <div className="mb-6">
          <div>
            <div className="text-sm font-medium text-[var(--brand)]">
              Client Portal
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
              Punch List
            </h1>
            {session && (
              <div className="punch-filter-row mt-3 flex flex-wrap gap-2">
                <label className="punch-filter-control punch-filter-organization grid gap-1 text-xs font-semibold text-foreground/60">
                  Organization
                  <select
                    value={selectedOrgId}
                    onChange={(event) => {
                      const nextOrgId = event.target.value;
                      const nextPropertyId = defaultPropertyIdForOrg(allPropertyOptions, nextOrgId);
                      prepareRowsForScope(nextOrgId, nextPropertyId);
                      setSelectedOrgId(nextOrgId);
                      setSelectedPropertyId(nextPropertyId);
                      writePortalContext(session, {
                        orgId: nextOrgId,
                        propertyId: nextPropertyId,
                      });
                      setSelectedElevation(ALL);
                      setSelectedDetail(ALL);
                    }}
                    disabled={filtersLoading || orgOptions.length <= 1}
                    className="h-9 max-w-[220px] rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15 disabled:cursor-default disabled:opacity-100"
                  >
                    {orgOptions.length === 0 && (
                      <option value="">No Organizations</option>
                    )}
                    {orgOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="punch-filter-property grid gap-1 text-xs font-semibold text-foreground/60">
                  Property
                  <select
                    value={propertySelectValue}
                    onChange={(event) => {
                      const nextPropertyId = event.target.value;
                      prepareRowsForScope(selectedOrgId, nextPropertyId);
                      setSelectedPropertyId(nextPropertyId);
                      writePortalContext(session, {
                        orgId: selectedOrgId,
                        propertyId: nextPropertyId,
                      });
                      setSelectedElevation(ALL);
                      setSelectedDetail(ALL);
                    }}
                    disabled={filtersLoading || propertyOptions.length === 0}
                    className="h-9 max-w-[280px] rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                  >
                    {propertyOptions.length === 0 && (
                      <option value="">No Properties</option>
                    )}
                    {showAllPropertiesOption && (
                      <option value={ALL}>All Properties</option>
                    )}
                    {propertyOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="punch-refresh-cluster punch-refresh-desktop">
                  {lastRefreshedAt && (
                    <span className="punch-refresh-status">
                      Last refreshed {formatRefreshTime(lastRefreshedAt)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={manualRefreshing || punchListLoading || filtersLoading || !selectedOrgId}
                    className="punch-refresh-button inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${punchListLoading ? "animate-spin" : ""}`}
                    />
                    {manualRefreshing ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
                <div className="punch-mobile-filter-actions">
                  <button
                    type="button"
                    className="punch-mobile-filter-button"
                    onClick={() => setMobileFiltersOpen((isOpen) => !isOpen)}
                    aria-expanded={mobileFiltersOpen}
                  >
                    Filters
                    <ChevronDown
                      className={`h-4 w-4 transition ${
                        mobileFiltersOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <div className="punch-refresh-cluster punch-refresh-mobile">
                    {lastRefreshedAt && (
                      <span className="punch-refresh-status">
                        Last refreshed {formatRefreshTime(lastRefreshedAt)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleRefresh}
                      disabled={manualRefreshing || punchListLoading || filtersLoading || !selectedOrgId}
                      className="punch-refresh-button inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${punchListLoading ? "animate-spin" : ""}`}
                      />
                      {manualRefreshing ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                </div>
                <div className={`punch-filter-advanced ${mobileFiltersOpen ? "is-open" : ""}`}>
                  <label className="punch-filter-control grid gap-1 text-xs font-semibold text-foreground/60">
                    Elevation
                    <select
                      value={selectedElevation}
                      onChange={(event) => setSelectedElevation(event.target.value)}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                    >
                      <option value={ALL}>All Elevations</option>
                      {elevationOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="punch-filter-detail grid gap-1 text-xs font-semibold text-foreground/60">
                    Detail
                    <select
                      value={selectedDetail}
                      onChange={(event) => setSelectedDetail(event.target.value)}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                    >
                      <option value={ALL}>All Details</option>
                      {detailOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="punch-filter-control grid gap-1 text-xs font-semibold text-foreground/60">
                    Priority
                    <select
                      value={selectedPriority}
                      onChange={(event) => setSelectedPriority(event.target.value)}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                    >
                      <option value={ALL}>All Priorities</option>
                      {priorityOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="punch-filter-control grid gap-1 text-xs font-semibold text-foreground/60">
                    Trade
                    <select
                      value={selectedTrade}
                      onChange={(event) => setSelectedTrade(event.target.value)}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                    >
                      <option value={ALL}>All Trades</option>
                      {tradeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}
          </div>
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
              Sign in to view punch list
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
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-background px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-foreground/70">
                Signed in as{" "}
                <span className="font-semibold text-foreground">
                  {session.user?.email || "authenticated user"}
                </span>
                . {compactCount(filteredRows.length, "visible issue")}.
              </div>
              <div className="punch-report-actions">
                <button
                  type="button"
                  onClick={handleOpenReportModal}
                  disabled={filtersLoading || punchListLoading || reportGenerating || !selectedOrgId}
                  className="punch-report-button"
                >
                  <Download className="h-4 w-4" />
                  Generate Punchlist
                </button>
                <div className="inline-flex w-fit rounded-lg border border-border bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setSelectedTab(TAB_OPEN)}
                    className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-semibold ${
                      selectedTab === TAB_OPEN
                        ? "bg-[var(--brand)] text-white shadow-sm"
                        : "text-foreground/65"
                    }`}
                  >
                    <ClipboardList className="h-4 w-4" />
                    Open {openCount}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTab(TAB_RESOLVED)}
                    className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-semibold ${
                      selectedTab === TAB_RESOLVED
                        ? "bg-[var(--brand)] text-white shadow-sm"
                        : "text-foreground/65"
                    }`}
                  >
                    Resolved {resolvedCount}
                  </button>
                </div>
              </div>
            </div>

            {punchListError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {punchListError}
              </div>
            )}

            {(filtersLoading || (punchListLoading && rows.length === 0)) && (
              <div className="rounded-lg border border-border bg-background p-6 text-sm text-foreground/70 shadow-sm">
                Loading punch list...
              </div>
            )}

            {!filtersLoading && !punchListLoading && noPunchListSources && (
              <div className="rounded-lg border border-border bg-background p-6 text-sm text-foreground/70 shadow-sm">
                No punch list properties are available for this account.
              </div>
            )}

            {!filtersLoading && !punchListLoading && noPunchListProperties && (
              <div className="rounded-lg border border-border bg-background p-6 text-sm text-foreground/70 shadow-sm">
                No properties are available for the selected organization.
              </div>
            )}

            {!filtersLoading &&
              !punchListLoading &&
              !noPunchListSources &&
              !noPunchListProperties &&
              filteredRows.length === 0 && (
                <div className="rounded-lg border border-border bg-background p-6 text-sm text-foreground/70 shadow-sm">
                  No punch list items match the selected filters.
                </div>
              )}

            {filteredRows.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="grid gap-2">
                  {filteredRows.map((row) => (
                    <IssueRow
                      key={row.id}
                      row={row}
                      selected={row.id === selectedRowId}
                      onSelect={() => setSelectedRowId(row.id)}
                      onPreview={handleOpenPreview}
                      tradeOptions={tradeOptions}
                      canAddTradeOption={canAddTradeOption}
                      onWorkflowChange={handleWorkflowChange}
                      onAddTrade={handleAddTrade}
                      workflowSavingKey={workflowSavingKey}
                      notePanelOpen={activeNoteRowId === row.id}
                      onToggleNotePanel={handleToggleNotePanel}
                      historyPanelOpen={activeHistoryRowId === row.id}
                      onToggleHistoryPanel={handleToggleHistoryPanel}
                      noteDraft={noteDrafts[row.id] || ""}
                      noteEditDrafts={noteEditDrafts}
                      onNoteDraftChange={handleNoteDraftChange}
                      onNoteEditDraftChange={handleNoteEditDraftChange}
                      onAddNote={handleAddNote}
                      onEditNote={handleEditNote}
                      onDeleteNote={handleDeleteNote}
                      onStartEditNote={handleStartEditNote}
                      onCancelEditNote={handleCancelEditNote}
                      completionPanelOpen={activeCompletionRowId === row.id}
                      onToggleCompletionPanel={handleToggleCompletionPanel}
                      completionDraft={completionDrafts[row.id] || {}}
                      onCompletionFileChange={handleCompletionFileChange}
                      onRemoveCompletionFile={handleRemoveCompletionFile}
                      onOpenCompletionPrompt={handleOpenCompletionPrompt}
                      onSubmitCompletion={handleSubmitCompletion}
                      onReviewCompletion={handleReviewCompletion}
                      canEditStatus={canEditWorkflowForRow(row) && row.status !== "pending_review"}
                      noteSaving={noteSavingId === row.id}
                      noteEditingId={noteEditingId}
                      noteDeletingId={noteDeletingId}
                      activeNoteEditId={activeNoteEditId}
                      completionSaving={completionSavingId === row.id}
                      completionReviewSavingKey={completionReviewSavingKey}
                    />
                  ))}
                </div>
                <div className="hidden lg:block">
                  <div className="sticky top-4">
                    <RowDetail
                      row={selectedRow}
                      tradeOptions={tradeOptions}
                      onDownloadOriginal={handleDownloadOriginal}
                      downloadId={downloadId}
                      onPreview={handleOpenPreview}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
      <PunchReportModal
        open={reportModalOpen}
        tradeItems={reportTradeItems}
        selectedTrades={reportSelectedTrades}
        generating={reportGenerating}
        onToggleTrade={handleToggleReportTrade}
        onGenerate={handleGenerateReport}
        onClose={() => setReportModalOpen(false)}
      />
      <ImagePreviewModal target={previewRow} onClose={() => setPreviewRow(null)} />
      <CompletionNoteModal
        row={completionPromptRow}
        completionDraft={completionPromptRow ? completionDrafts[completionPromptRow.id] || {} : {}}
        onCompletionDraftChange={handleCompletionDraftChange}
        onRemoveCompletionFile={handleRemoveCompletionFile}
        onSubmitCompletion={handleSubmitCompletion}
        onClose={() => setCompletionPromptRowId("")}
        completionSaving={completionPromptRow ? completionSavingId === completionPromptRow.id : false}
      />
    </div>
  );
}

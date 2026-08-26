import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  Download,
  FileText,
  Flag,
  LogOut,
  RefreshCw,
  X,
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "./lib/supabaseClient";

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

const PRIORITY_LABELS = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const TRADE_LABELS = {
  carpentry: "Carpentry",
  concrete: "Concrete",
  drywall: "Drywall",
  electrical: "Electrical",
  fire_protection: "Fire Protection",
  flooring: "Flooring",
  general: "General",
  hvac: "HVAC",
  masonry: "Masonry",
  painting: "Painting",
  plumbing: "Plumbing",
  roofing: "Roofing",
  sitework: "Sitework",
  steel: "Steel",
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

function readableToken(value) {
  return textValue(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  return { backgroundColor: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c" };
}

function statusLabel(status) {
  if (status === "resolved") return "Resolved";
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

const PUNCH_LIST_STYLES = `
  .punch-filter-row {
    align-items: end;
    padding-top: 42px;
  }

  .punch-filter-control {
    flex: 0 1 142px;
    min-width: 124px;
  }

  .punch-filter-property {
    flex: 1 1 260px;
    min-width: 220px;
    max-width: 360px;
  }

  .punch-filter-detail {
    flex: 0 1 176px;
    min-width: 148px;
  }

  .punch-filter-row select {
    width: 100%;
  }

  .punch-refresh-button {
    flex: 0 0 auto;
    min-width: 144px;
    width: auto;
  }

  .punch-refresh-cluster {
    position: absolute;
    right: 0;
    bottom: calc(100% + 6px);
    display: flex;
    align-items: center;
    align-self: end;
    gap: 8px;
  }

  .punch-refresh-status {
    color: rgb(100 116 139);
    font-size: 12px;
    font-weight: 650;
    line-height: 1;
    white-space: nowrap;
  }

  .punch-trade-refresh-stack {
    position: relative;
    flex: 0 1 142px;
    min-width: 124px;
    margin-left: auto;
  }

  .punch-trade-refresh-stack .punch-filter-control {
    width: 100%;
  }

  .punch-mobile-filter-actions {
    display: none;
  }

  .punch-filter-advanced {
    display: contents;
  }

  .punch-row {
    overflow: hidden;
    cursor: default;
  }

  .punch-row-body {
    position: relative;
    display: grid;
    grid-template-columns: 156px minmax(0, 1fr) 196px;
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

  .punch-flag-line span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .punch-row-controls {
    display: grid;
    align-content: start;
    gap: 7px;
    width: 196px;
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

  .punch-lightbox-issue span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

    .punch-trade-refresh-stack {
      display: contents;
      margin-left: 0;
    }

    .punch-trade-refresh-stack .punch-filter-control {
      width: 100%;
    }

    .punch-row-body {
      grid-template-columns: 96px minmax(0, 1fr);
      gap: 10px;
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
      padding: 8px 8px 2px;
    }

    .punch-control {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .punch-control-value {
      text-align: left;
    }

    .punch-location-line {
      font-size: 13px;
      white-space: normal;
    }

    .punch-row-main {
      min-height: 96px;
    }

    .punch-flag-line {
      margin-top: 10px;
      margin-bottom: 0;
    }

    .punch-property-line,
    .punch-org-line,
    .punch-flag-line span {
      white-space: normal;
    }

    .punch-property-line {
      flex-wrap: wrap;
    }

    .punch-lightbox-summary {
      align-items: flex-start;
      flex-direction: column;
    }

    .punch-lightbox-issue span {
      white-space: normal;
    }
  }
`;

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

  if (row.preview?.previewUrl && onPreview) {
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

function RowDetail({ row, onDownloadOriginal, downloadId, onPreview }) {
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
          Read Only
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
        <ReadOnlyField label="Trade" value={optionLabel(row.trade, TRADE_LABELS)} />
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

function IssueRow({ row, selected, onSelect, onPreview }) {
  const flagNote = row.title || row.reason || "Flagged observation";

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
          <div className="punch-flag-line">
            <Flag className="h-3.5 w-3.5 shrink-0 fill-current" />
            <span>{flagNote}</span>
          </div>
        </div>
        <div className="punch-row-controls">
          <ReadOnlyControl
            label="Priority"
            value={optionLabel(row.priority, PRIORITY_LABELS)}
            style={priorityStyle(row.priority)}
          />
          <ReadOnlyControl
            label="Status"
            value={statusLabel(row.status)}
            style={statusStyle(row.status)}
          />
          <ReadOnlyControl label="Due Date" value={formatShortDate(row.dueDate || row.dueAt)} />
          <ReadOnlyControl label="Trade" value={optionLabel(row.trade, TRADE_LABELS)} />
        </div>
      </div>
      {selected && row.reason && row.reason !== row.title && (
        <div className="mt-3 grid gap-3 border-t border-border pt-3 md:hidden">
          <p className="text-sm leading-6 text-foreground/70">{row.reason}</p>
        </div>
      )}
    </article>
  );
}

function ImagePreviewModal({ row, onClose }) {
  if (!row?.preview?.previewUrl) return null;
  const flagNote = row.title || row.reason || "Flagged observation";
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
            src={row.preview.previewUrl}
            alt={locationCodeLine(row) || row.title || "Punch list photo preview"}
            className="punch-lightbox-image"
          />
        </div>
        <div className="punch-lightbox-summary">
          <div className="punch-lightbox-issue">
            <Flag className="h-3.5 w-3.5 shrink-0 fill-current" />
            <span>{flagNote}</span>
          </div>
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
  const sessionScopeRef = useRef("");
  const filterRequestRef = useRef(0);
  const bootstrapTokenRef = useRef("");

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

  function applyPunchListFilterBody(body) {
    const nextOrgOptions = body.orgs.map(orgOption);
    const nextPropertyOptions = body.properties
      .map(propertyOption)
      .sort((left, right) => left.label.localeCompare(right.label));
    const nextOrgId = nextOrgOptions.some((option) => option.id === selectedOrgId)
      ? selectedOrgId
      : nextOrgOptions[0]?.id || "";
    const orgProperties = propertyOptionsForOrg(nextPropertyOptions, nextOrgId);
    const selectedPropertyStillAvailable =
      selectedPropertyId !== ALL &&
      orgProperties.some((option) => option.id === selectedPropertyId);
    const nextPropertyId = selectedPropertyStillAvailable
      ? selectedPropertyId
      : defaultPropertyIdForOrg(nextPropertyOptions, nextOrgId);

    setOrgOptions(nextOrgOptions);
    setAllPropertyOptions(nextPropertyOptions);
    setSelectedOrgId(nextOrgId);
    setSelectedPropertyId(nextPropertyId);
    setFiltersReady(true);
  }

  async function loadPunchListFilters(activeSession = session, { force = false } = {}) {
    if (!activeSession?.access_token) return;
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
        applyPunchListFilterBody(cachedFilters);
        return;
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
      };
      if (!isLatestRequest()) return;
      cacheSet(punchListFilterCache, cacheKey, filterBody);
      applyPunchListFilterBody(filterBody);
    } catch (error) {
      if (!isLatestRequest()) return;
      setPunchListError(error.message || "Unable to load punch list filters.");
      setOrgOptions([]);
      setAllPropertyOptions([]);
      setRows([]);
      setSelectedOrgId("");
      setSelectedPropertyId("");
      setFiltersReady(true);
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
      sessionScopeRef.current = "";
      return;
    }
    const nextScope = sessionCacheScope(session);
    if (sessionScopeRef.current && sessionScopeRef.current !== nextScope) {
      clearPunchListCaches();
    }
    sessionScopeRef.current = nextScope;
  }, [session?.access_token, session?.user?.email, session?.user?.id]);

  useEffect(() => {
    if (session?.access_token) {
      const nextBootstrapScope = sessionCacheScope(session);
      if (bootstrapTokenRef.current !== nextBootstrapScope) {
        setRows([]);
        setOrgOptions([]);
        setAllPropertyOptions([]);
        setSelectedOrgId("");
        setSelectedPropertyId("");
        setSelectedElevation(ALL);
        setSelectedDetail(ALL);
        setSelectedRowId("");
        setLoadedRowsScope({ orgId: "", propertyId: "" });
        setLastRefreshedAt(null);
        setPunchListError("");
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
      setSelectedOrgId("");
      setSelectedPropertyId("");
      setSelectedElevation(ALL);
      setSelectedDetail(ALL);
      setLoadedRowsScope({ orgId: "", propertyId: "" });
      setLastRefreshedAt(null);
      setPunchListError("");
      setFiltersReady(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token || !filtersReady || filtersLoading) return;
    loadPunchList(session);
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
    setSelectedOrgId("");
    setSelectedPropertyId("");
    setSelectedElevation(ALL);
    setSelectedDetail(ALL);
    setLoadedRowsScope({ orgId: "", propertyId: "" });
    setLastRefreshedAt(null);
    setManualRefreshing(false);
  }

  async function handleRefresh() {
    setManualRefreshing(true);
    const refreshed = await loadPunchList(session, { force: true });
    if (refreshed) {
      setLastRefreshedAt(new Date());
    }
    setManualRefreshing(false);
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
    () =>
      uniqueOptions(
        orgFilteredRows,
        (row) => row.trade || "general",
        (trade) => optionLabel(trade, TRADE_LABELS)
      ),
    [orgFilteredRows]
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
      if (selectedTrade !== ALL && row.trade !== selectedTrade) return false;
      if (selectedElevation !== ALL && normalizedOptionId(row.elevation) !== selectedElevation) return false;
      if (selectedDetail !== ALL && normalizedOptionId(row.detailType) !== selectedDetail) return false;
      return true;
    });
  }, [displayedPropertyId, selectedDetail, selectedElevation, selectedPriority, selectedTrade, tabRows]);

  useEffect(() => {
    if (filteredRows.length === 0) {
      if (selectedRowId) setSelectedRowId("");
      return;
    }
    if (!selectedRowId || !filteredRows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId(filteredRows[0].id);
    }
  }, [filteredRows, selectedRowId]);

  const selectedRow = useMemo(
    () => filteredRows.find((row) => row.id === selectedRowId) || null,
    [filteredRows, selectedRowId]
  );

  const openCount = orgFilteredRows.filter((row) => row.status !== "resolved").length;
  const resolvedCount = orgFilteredRows.filter((row) => row.status === "resolved").length;
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
                <ChevronLeft className="h-4 w-4" />
                Reports
              </a>
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
                <label className="punch-filter-control grid gap-1 text-xs font-semibold text-foreground/60">
                  Organization
                  <select
                    value={selectedOrgId}
                    onChange={(event) => {
                      const nextOrgId = event.target.value;
                      const nextPropertyId = defaultPropertyIdForOrg(allPropertyOptions, nextOrgId);
                      prepareRowsForScope(nextOrgId, nextPropertyId);
                      setSelectedOrgId(nextOrgId);
                      setSelectedPropertyId(nextPropertyId);
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
                <div className="punch-trade-refresh-stack">
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
                      onPreview={setPreviewRow}
                    />
                  ))}
                </div>
                <div className="hidden lg:block">
                  <div className="sticky top-4">
                    <RowDetail
                      row={selectedRow}
                      onDownloadOriginal={handleDownloadOriginal}
                      downloadId={downloadId}
                      onPreview={setPreviewRow}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
      <ImagePreviewModal row={previewRow} onClose={() => setPreviewRow(null)} />
    </div>
  );
}

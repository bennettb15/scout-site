const DEFAULT_TRADE_LABELS = {
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

export function textValue(value) {
  const text = String(value || "").trim();
  return text || "";
}

export function tradeKey(value) {
  return textValue(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function titleCase(value) {
  return textValue(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word.toLowerCase() === "hvac") return "HVAC";
      return `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

export function todayDateOnlyFromDate(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizedDateOnly(value) {
  const text = textValue(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function tradeLabel(value, tradeOptions = []) {
  const key = tradeKey(value) || "general";
  const option = (tradeOptions || []).find((item) => item?.id === key || item?.key === key);
  return option?.label || option?.name || DEFAULT_TRADE_LABELS[key] || titleCase(key) || "Unassigned";
}

function priorityLabel(value) {
  return DEFAULT_PRIORITY_LABELS[textValue(value).toLowerCase()] || textValue(value) || "Medium";
}

const DEFAULT_PRIORITY_LABELS = {
  critical: "Critical",
  high: "High",
  low: "Low",
  medium: "Medium",
};

export function punchListIssueLabel(row = {}) {
  return textValue(row.title) || textValue(row.reason) || "Flagged observation";
}

export function isOpenPunchListRow(row = {}) {
  return row.status !== "resolved";
}

export function isOverduePunchListRow(row = {}, todayDate = todayDateOnlyFromDate()) {
  if (!isOpenPunchListRow(row)) return false;
  const dueDate = normalizedDateOnly(row.dueDate || row.due_date);
  return Boolean(dueDate && todayDate && dueDate < todayDate);
}

export function filterPunchListRowsForOverdue(rows = [], todayDate = todayDateOnlyFromDate()) {
  return (Array.isArray(rows) ? rows : []).filter((row) =>
    isOverduePunchListRow(row, todayDate)
  );
}

export function nextPunchListTradeFilter(currentTradeId, clickedTradeId, allValue = "all") {
  const current = textValue(currentTradeId) || allValue;
  const clicked = textValue(clickedTradeId) || allValue;
  return current === clicked ? allValue : clicked;
}

export function nextPunchListOverdueFilter(currentOverdueOnly, overdueCount = 0) {
  return overdueCount > 0 ? !currentOverdueOnly : false;
}

export function buildPunchListSummary(rows = [], { tradeOptions = [], todayDate = todayDateOnlyFromDate() } = {}) {
  const visibleOpenRows = (Array.isArray(rows) ? rows : []).filter(isOpenPunchListRow);
  const tradeCountsByKey = new Map();
  const overdueItems = [];

  for (const row of visibleOpenRows) {
    const key = tradeKey(row.trade) || "unassigned";
    const label = key === "unassigned" ? "Unassigned" : tradeLabel(key, tradeOptions);
    const current = tradeCountsByKey.get(key) || { id: key, label, count: 0 };
    current.count += 1;
    tradeCountsByKey.set(key, current);

    if (isOverduePunchListRow(row, todayDate)) {
      overdueItems.push({
        id: row.id,
        title: punchListIssueLabel(row),
        trade: label,
        priority: priorityLabel(row.priority),
        dueDate: normalizedDateOnly(row.dueDate || row.due_date),
      });
    }
  }

  const tradeCounts = Array.from(tradeCountsByKey.values()).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.label.localeCompare(right.label);
  });

  overdueItems.sort((left, right) => {
    const dateCompare = left.dueDate.localeCompare(right.dueDate);
    if (dateCompare !== 0) return dateCompare;
    return left.title.localeCompare(right.title);
  });

  return {
    openCount: visibleOpenRows.length,
    tradeCounts,
    overdueCount: overdueItems.length,
    overdueItems,
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  canActorCancelPendingInvite,
  canActorChangePortalRole,
  canActorInvitePortalRole,
  canActorRevokePortalRole,
  inviteRolesForActor,
  membershipNeedsRequiredAdminRepair,
  membershipSummary,
  portalAccessRoleLabel,
  wouldRemoveLastOwner,
} from "../api-lib/portalAdminAccess.js";
import {
  actorCanManagePropertyScope,
  allowedPropertyIdsForPortalAccess,
  filterRowsByAllowedPropertyIds,
  filterRowsByCurrentPortalPropertyAccess,
  filterRowsByPortalPropertyAccess,
  portalAccessAllowsProperty,
  propertyScopeSummary,
  visiblePropertyIdsForAccess,
} from "../api-lib/portalPropertyAccess.js";
import {
  canEditPortalPropertyScope,
  checkedPropertyIdsForScopeSelection,
  formatPortalPropertyLabel,
  normalizePortalPropertyScopeDraft,
  nextPortalPropertyScopeSelection,
  nextPortalPropertyToggleSelection,
  portalPropertyScopeDisplay,
  portalPropertyScopeSelectionFromCheckedIds,
  portalPropertyScopeDraftCanSave,
  portalPropertyScopeDraftChanged,
} from "../src/lib/portalAccessDisplay.js";
import {
  allowedPropertyIdsFromOptions,
  filterReportPackagesByAllowedProperties,
  filterReportPackagesBySelectedProperty,
} from "../src/lib/reportPortalFilters.js";
import {
  buildPunchListSummary,
  filterPunchListRowsForOverdue,
  nextPunchListOverdueFilter,
  nextPunchListTradeFilter,
  tradeKey,
} from "../src/lib/punchListSummary.js";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

function mapsFor(email) {
  return {
    profileById: new Map([[userId, { email }]]),
    orgById: new Map([[orgId, { name: "Test New" }]]),
    authById: new Map([[userId, { id: userId, email, email_confirmed_at: "2026-09-07T00:00:00Z" }]]),
  };
}

test("approved admin owner membership appears as active non-revocable access", () => {
  const maps = mapsFor("bennettb15@gmail.com");
  const row = membershipSummary(
    {
      id: "membership-1",
      org_id: orgId,
      user_id: userId,
      role: "owner",
      access_scope: "org",
      created_at: "2026-09-07T00:00:00Z",
      updated_at: "2026-09-07T00:00:00Z",
      deleted_at: null,
    },
    maps.profileById,
    maps.orgById,
    maps.authById,
    true
  );

  assert.equal(row.email, "bennettb15@gmail.com");
  assert.equal(row.role, "owner");
  assert.equal(row.accessScope, "org");
  assert.equal(row.canRevoke, false);
});

test("ordinary org-level viewer access remains revocable", () => {
  const maps = mapsFor("client@example.com");
  const row = membershipSummary(
    {
      id: "membership-2",
      org_id: orgId,
      user_id: userId,
      role: "viewer",
      access_scope: "org",
      created_at: "2026-09-07T00:00:00Z",
      updated_at: "2026-09-07T00:00:00Z",
      deleted_at: null,
    },
    maps.profileById,
    maps.orgById,
    maps.authById,
    true
  );

  assert.equal(row.canRevoke, true);
});

test("portal role labels use the simplified names", () => {
  assert.equal(portalAccessRoleLabel("viewer"), "Viewer");
  assert.equal(portalAccessRoleLabel("field"), "Field");
  assert.equal(portalAccessRoleLabel("manager"), "Manager");
  assert.equal(portalAccessRoleLabel("owner"), "Owner");
});

test("owner can change viewer to field", () => {
  assert.equal(
    canActorChangePortalRole({
      actorRole: "owner",
      currentRole: "viewer",
      nextRole: "field",
    }),
    true
  );
});

test("owner can change field to manager", () => {
  assert.equal(
    canActorChangePortalRole({
      actorRole: "owner",
      currentRole: "field",
      nextRole: "manager",
    }),
    true
  );
});

test("manager can change viewer, field, and manager roles except to owner", () => {
  assert.equal(
    canActorChangePortalRole({
      actorRole: "manager",
      currentRole: "viewer",
      nextRole: "field",
    }),
    true
  );
  assert.equal(
    canActorChangePortalRole({
      actorRole: "manager",
      currentRole: "field",
      nextRole: "manager",
    }),
    true
  );
  assert.equal(
    canActorChangePortalRole({
      actorRole: "manager",
      currentRole: "manager",
      nextRole: "viewer",
    }),
    true
  );
  assert.equal(
    canActorChangePortalRole({
      actorRole: "manager",
      currentRole: "viewer",
      nextRole: "owner",
    }),
    false
  );
});

test("manager cannot change or revoke owner access", () => {
  assert.equal(
    canActorChangePortalRole({
      actorRole: "manager",
      currentRole: "owner",
      nextRole: "manager",
    }),
    false
  );
  assert.equal(
    canActorRevokePortalRole({
      actorRole: "manager",
      targetRole: "owner",
    }),
    false
  );
});

test("owner invite dropdown allows viewer, field, manager, and owner", () => {
  assert.deepEqual(inviteRolesForActor("owner"), ["viewer", "field", "manager", "owner"]);
  assert.equal(canActorInvitePortalRole({ actorRole: "owner", targetRole: "manager" }), true);
  assert.equal(canActorInvitePortalRole({ actorRole: "owner", targetRole: "owner" }), true);
});

test("manager invite dropdown allows viewer, field, and manager", () => {
  assert.deepEqual(inviteRolesForActor("manager"), ["viewer", "field", "manager"]);
  assert.equal(canActorInvitePortalRole({ actorRole: "manager", targetRole: "manager" }), true);
});

test("manager cannot invite or grant owner", () => {
  assert.equal(canActorInvitePortalRole({ actorRole: "manager", targetRole: "owner" }), false);
});

test("owner can cancel pending invites for any role", () => {
  assert.equal(canActorCancelPendingInvite({ actorRole: "owner", inviteRole: "viewer" }), true);
  assert.equal(canActorCancelPendingInvite({ actorRole: "owner", inviteRole: "field" }), true);
  assert.equal(canActorCancelPendingInvite({ actorRole: "owner", inviteRole: "manager" }), true);
  assert.equal(canActorCancelPendingInvite({ actorRole: "owner", inviteRole: "owner" }), true);
});

test("manager can cancel viewer, field, and manager pending invites", () => {
  assert.equal(canActorCancelPendingInvite({ actorRole: "manager", inviteRole: "viewer" }), true);
  assert.equal(canActorCancelPendingInvite({ actorRole: "manager", inviteRole: "field" }), true);
  assert.equal(canActorCancelPendingInvite({ actorRole: "manager", inviteRole: "manager" }), true);
});

test("manager cannot cancel owner pending invite", () => {
  assert.equal(canActorCancelPendingInvite({ actorRole: "manager", inviteRole: "owner" }), false);
});

test("last active owner cannot be downgraded or removed", () => {
  assert.equal(
    wouldRemoveLastOwner({
      currentRole: "owner",
      nextRole: "manager",
      activeOwnerCount: 1,
    }),
    true
  );
  assert.equal(
    wouldRemoveLastOwner({
      currentRole: "owner",
      nextRole: "",
      activeOwnerCount: 1,
    }),
    true
  );
  assert.equal(
    wouldRemoveLastOwner({
      currentRole: "owner",
      nextRole: "manager",
      activeOwnerCount: 2,
    }),
    false
  );
});

test("required admin repair upgrades missing, deleted, property-scoped, or non-owner rows", () => {
  assert.equal(membershipNeedsRequiredAdminRepair(null), true);
  assert.equal(
    membershipNeedsRequiredAdminRepair({
      role: "owner",
      access_scope: "org",
      deleted_at: "2026-09-07T00:00:00Z",
    }),
    true
  );
  assert.equal(
    membershipNeedsRequiredAdminRepair({
      role: "manager",
      access_scope: "org",
      deleted_at: null,
    }),
    true
  );
  assert.equal(
    membershipNeedsRequiredAdminRepair({
      role: "owner",
      access_scope: "property",
      deleted_at: null,
    }),
    true
  );
  assert.equal(
    membershipNeedsRequiredAdminRepair({
      role: "owner",
      access_scope: "org",
      deleted_at: null,
    }),
    false
  );
});

test("owner access is always org-wide for property visibility", () => {
  assert.equal(
    portalAccessAllowsProperty(
      { role: "owner", accessScope: "property", propertyIds: [] },
      "property-a"
    ),
    true
  );
});

test("property-scoped access allows only selected properties", () => {
  assert.equal(
    portalAccessAllowsProperty(
      { role: "viewer", accessScope: "property", propertyIds: ["property-a"] },
      "property-a"
    ),
    true
  );
  assert.equal(
    portalAccessAllowsProperty(
      { role: "viewer", accessScope: "property", propertyIds: ["property-a"] },
      "property-b"
    ),
    false
  );
});

test("org-wide manager can manage org-wide or selected-property access", () => {
  assert.equal(
    actorCanManagePropertyScope({
      actorRole: "manager",
      actorAccessScope: "org",
      actorPropertyIds: [],
      targetRole: "field",
      targetAccessScope: "org",
      targetPropertyIds: [],
    }),
    true
  );
  assert.equal(
    actorCanManagePropertyScope({
      actorRole: "manager",
      actorAccessScope: "org",
      actorPropertyIds: [],
      targetRole: "viewer",
      targetAccessScope: "property",
      targetPropertyIds: ["property-a"],
    }),
    true
  );
});

test("property-scoped manager cannot grant org-wide or outside selected properties", () => {
  assert.equal(
    actorCanManagePropertyScope({
      actorRole: "manager",
      actorAccessScope: "property",
      actorPropertyIds: ["property-a"],
      targetRole: "field",
      targetAccessScope: "org",
      targetPropertyIds: [],
    }),
    false
  );
  assert.equal(
    actorCanManagePropertyScope({
      actorRole: "manager",
      actorAccessScope: "property",
      actorPropertyIds: ["property-a"],
      targetRole: "viewer",
      targetAccessScope: "property",
      targetPropertyIds: ["property-b"],
    }),
    false
  );
  assert.equal(
    actorCanManagePropertyScope({
      actorRole: "manager",
      actorAccessScope: "property",
      actorPropertyIds: ["property-a", "property-b"],
      targetRole: "manager",
      targetAccessScope: "property",
      targetPropertyIds: ["property-a"],
    }),
    true
  );
});

test("property-scoped manager cannot manage owner access", () => {
  assert.equal(
    actorCanManagePropertyScope({
      actorRole: "manager",
      actorAccessScope: "property",
      actorPropertyIds: ["property-a"],
      targetRole: "owner",
      targetAccessScope: "org",
      targetPropertyIds: [],
    }),
    false
  );
});

test("visible property ids collapse to all when any org-wide access exists", () => {
  assert.equal(
    visiblePropertyIdsForAccess(
      [
        {
          org_id: orgId,
          role: "viewer",
          access_scope: "property",
          propertyIds: ["property-a"],
        },
        {
          org_id: orgId,
          role: "field",
          access_scope: "org",
          propertyIds: [],
        },
      ],
      orgId
    ),
    null
  );
});

test("report rows filter by portal property access", () => {
  assert.deepEqual(
    filterRowsByPortalPropertyAccess(
      [
        { id: "report-a", org_id: orgId, property_id: "property-a" },
        { id: "report-b", org_id: orgId, property_id: "property-b" },
      ],
      [
        {
          org_id: orgId,
          role: "viewer",
          access_scope: "property",
          propertyIds: ["property-a"],
        },
      ]
    ).map((row) => row.id),
    ["report-a"]
  );
});

test("scoped Viewer with one property sees only that property's report packages", () => {
  assert.deepEqual(
    filterRowsByCurrentPortalPropertyAccess(
      [
        { id: "package-a", org_id: orgId, property_id: "property-a" },
        { id: "package-b", org_id: orgId, property_id: "property-b" },
      ],
      [
        {
          org_id: orgId,
          role: "viewer",
          access_scope: "property",
          propertyIds: ["property-a"],
        },
      ],
      ["property-a", "property-b"]
    ).map((row) => row.id),
    ["package-a"]
  );
});

test("scoped Field with selected property sees only that property's report packages under All Properties", () => {
  assert.deepEqual(
    filterReportPackagesByAllowedProperties(
      [
        { id: "package-a", property: { id: "property-a" } },
        { id: "package-b", property: { id: "property-b" } },
      ],
      [{ id: "property-b", name: "QA Test 9.17" }],
      true
    ).map((row) => row.id),
    ["package-b"]
  );
});

test("scoped Viewer does not see unscoped packages when All Properties is selected", () => {
  assert.deepEqual(
    filterReportPackagesByAllowedProperties(
      [
        { id: "package-a", property: { id: "property-a" } },
        { id: "package-b", property: { id: "property-b" } },
      ],
      [{ id: "property-a", name: "QA Test 9.16" }],
      true
    ).map((row) => row.id),
    ["package-a"]
  );
});

test("property dropdown and package list use the same allowed property IDs", () => {
  const propertyOptions = [
    { id: "property-a", name: "QA Test 9.16" },
    { id: "property-c", name: "QA Test 9.18" },
  ];
  const visiblePackages = filterReportPackagesByAllowedProperties(
    [
      { id: "package-a", property: { id: "property-a" } },
      { id: "package-b", property: { id: "property-b" } },
      { id: "package-c", property: { id: "property-c" } },
    ],
    propertyOptions,
    true
  );
  const allowedIds = allowedPropertyIdsFromOptions(propertyOptions);

  assert.deepEqual(visiblePackages.map((row) => row.id), ["package-a", "package-c"]);
  assert.equal(
    visiblePackages.every((row) => allowedIds.has(row.property.id)),
    true
  );
});

test("All Properties keeps scoped report package list inside allowed property IDs", () => {
  const visiblePackages = filterReportPackagesBySelectedProperty(
    filterReportPackagesByAllowedProperties(
      [
        { id: "package-a", property: { id: "property-a" } },
        { id: "package-b", property: { id: "property-b" } },
      ],
      [{ id: "property-a", name: "QA Test 9.16" }],
      true
    ),
    "all",
    "all"
  );

  assert.deepEqual(visiblePackages.map((row) => row.id), ["package-a"]);
});

test("selected-property access excludes QA Test 9.16 when only QA Test 9.17 is selected", () => {
  const allowedIds = allowedPropertyIdsForPortalAccess(
    {
      rows: [
        {
          org_id: orgId,
          role: "viewer",
          access_scope: "property",
          propertyIds: ["qa-9-17"],
        },
      ],
      orgWideOrgIds: new Set(),
      isApprovedAdmin: false,
    },
    orgId,
    ["qa-9-16", "qa-9-17"]
  );

  assert.deepEqual(
    filterRowsByAllowedPropertyIds(
      [
        { id: "package-9-16", org_id: orgId, property_id: "qa-9-16" },
        { id: "package-9-17", org_id: orgId, property_id: "qa-9-17" },
      ],
      allowedIds
    ).map((row) => row.id),
    ["package-9-17"]
  );
});

test("org-wide access still sees QA Test 9.16 and QA Test 9.17", () => {
  const allowedIds = allowedPropertyIdsForPortalAccess(
    {
      rows: [
        {
          org_id: orgId,
          role: "field",
          access_scope: "org",
          propertyIds: [],
        },
      ],
      orgWideOrgIds: new Set([orgId]),
      isApprovedAdmin: false,
    },
    orgId,
    ["qa-9-16", "qa-9-17"]
  );

  assert.deepEqual(
    filterRowsByAllowedPropertyIds(
      [
        { id: "package-9-16", org_id: orgId, property_id: "qa-9-16" },
        { id: "package-9-17", org_id: orgId, property_id: "qa-9-17" },
      ],
      allowedIds
    ).map((row) => row.id),
    ["package-9-16", "package-9-17"]
  );
});

test("deleted or non-visible property packages are excluded", () => {
  assert.deepEqual(
    filterRowsByCurrentPortalPropertyAccess(
      [
        { id: "package-a", org_id: orgId, property_id: "property-a" },
        { id: "package-deleted", org_id: orgId, property_id: "property-deleted" },
      ],
      [
        {
          org_id: orgId,
          role: "manager",
          access_scope: "org",
          propertyIds: [],
        },
      ],
      ["property-a"]
    ).map((row) => row.id),
    ["package-a"]
  );
});

test("scoped Viewer sees only scoped Punch List items", () => {
  assert.deepEqual(
    filterRowsByCurrentPortalPropertyAccess(
      [
        { id: "punch-a", org_id: orgId, property_id: "property-a" },
        { id: "punch-b", org_id: orgId, property_id: "property-b" },
      ],
      [
        {
          org_id: orgId,
          role: "viewer",
          access_scope: "property",
          propertyIds: ["property-a"],
        },
      ],
      ["property-a", "property-b"]
    ).map((row) => row.id),
    ["punch-a"]
  );
});

test("deleted or non-visible property Punch List items are excluded", () => {
  assert.deepEqual(
    filterRowsByCurrentPortalPropertyAccess(
      [
        { id: "punch-a", org_id: orgId, property_id: "property-a" },
        { id: "punch-deleted", org_id: orgId, property_id: "property-deleted" },
      ],
      [
        {
          org_id: orgId,
          role: "owner",
          access_scope: "org",
          propertyIds: [],
        },
      ],
      ["property-a"]
    ).map((row) => row.id),
    ["punch-a"]
  );
});

test("punch list summary trade counts include pending review and exclude resolved", () => {
  const summary = buildPunchListSummary(
    [
      { id: "punch-a", status: "active", trade: "HVAC" },
      { id: "punch-b", status: "pending_review", trade: "HVAC" },
      { id: "punch-c", status: "resolved", trade: "HVAC" },
      { id: "punch-d", status: "active", trade: "" },
    ],
    {
      tradeOptions: [{ id: "hvac", label: "HVAC" }],
      todayDate: "2026-09-08",
    }
  );

  assert.equal(summary.openCount, 3);
  assert.deepEqual(summary.tradeCounts, [
    { id: "hvac", label: "HVAC", count: 2 },
    { id: "unassigned", label: "Unassigned", count: 1 },
  ]);
});

test("punch list summary overdue excludes resolved and uses dates before today", () => {
  const summary = buildPunchListSummary(
    [
      {
        id: "overdue-active",
        title: "Loose flashing",
        status: "active",
        trade: "roofing",
        priority: "high",
        dueDate: "2026-09-07",
      },
      {
        id: "overdue-pending",
        reason: "Needs review",
        status: "pending_review",
        trade: "general",
        priority: "medium",
        dueDate: "2026-09-01",
      },
      {
        id: "today",
        status: "active",
        trade: "hvac",
        dueDate: "2026-09-08",
      },
      {
        id: "resolved",
        status: "resolved",
        trade: "roofing",
        dueDate: "2026-09-01",
      },
    ],
    { todayDate: "2026-09-08" }
  );

  assert.equal(summary.overdueCount, 2);
  assert.deepEqual(
    summary.overdueItems.map((item) => item.id),
    ["overdue-pending", "overdue-active"]
  );
  assert.deepEqual(summary.overdueItems[0], {
    id: "overdue-pending",
    title: "Needs review",
    trade: "General",
    priority: "Medium",
    dueDate: "2026-09-01",
  });
});

test("punch list summary counts only rows visible to property-scoped users", () => {
  const allowedRows = filterRowsByCurrentPortalPropertyAccess(
    [
      { id: "punch-a", org_id: orgId, property_id: "property-a", status: "active", trade: "HVAC" },
      { id: "punch-b", org_id: orgId, property_id: "property-b", status: "active", trade: "HVAC" },
    ],
    [
      {
        org_id: orgId,
        role: "viewer",
        access_scope: "property",
        propertyIds: ["property-a"],
      },
    ],
    ["property-a", "property-b"]
  );

  const summary = buildPunchListSummary(allowedRows, {
    tradeOptions: [{ id: "hvac", label: "HVAC" }],
    todayDate: "2026-09-08",
  });

  assert.equal(summary.openCount, 1);
  assert.deepEqual(summary.tradeCounts, [{ id: "hvac", label: "HVAC", count: 1 }]);
});

test("punch list summary respects already-applied trade filters", () => {
  const rows = [
    { id: "punch-a", status: "active", trade: "HVAC" },
    { id: "punch-b", status: "active", trade: "plumbing" },
  ];
  const visibleRows = rows.filter((row) => tradeKey(row.trade) === "hvac");
  const summary = buildPunchListSummary(visibleRows, {
    tradeOptions: [
      { id: "hvac", label: "HVAC" },
      { id: "plumbing", label: "Plumbing" },
    ],
    todayDate: "2026-09-08",
  });

  assert.deepEqual(summary.tradeCounts, [{ id: "hvac", label: "HVAC", count: 1 }]);
});

test("punch list trade chip click filters visible rows through selected trade", () => {
  const rows = [
    { id: "punch-a", status: "active", trade: "HVAC" },
    { id: "punch-b", status: "active", trade: "plumbing" },
    { id: "punch-c", status: "active", trade: "HVAC" },
  ];
  const selectedTrade = nextPunchListTradeFilter("all", "hvac", "all");
  const visibleRows = rows.filter((row) => tradeKey(row.trade) === selectedTrade);
  const summary = buildPunchListSummary(visibleRows, {
    tradeOptions: [{ id: "hvac", label: "HVAC" }],
    todayDate: "2026-09-08",
  });

  assert.equal(selectedTrade, "hvac");
  assert.deepEqual(visibleRows.map((row) => row.id), ["punch-a", "punch-c"]);
  assert.deepEqual(summary.tradeCounts, [{ id: "hvac", label: "HVAC", count: 2 }]);
});

test("punch list active trade chip click clears selected trade", () => {
  assert.equal(nextPunchListTradeFilter("hvac", "hvac", "all"), "all");
  assert.equal(nextPunchListTradeFilter("hvac", "plumbing", "all"), "plumbing");
});

test("punch list trade chip filter works inside overdue filter", () => {
  const rows = [
    { id: "overdue-hvac", status: "active", trade: "HVAC", dueDate: "2026-09-07" },
    { id: "future-hvac", status: "active", trade: "HVAC", dueDate: "2026-09-09" },
    { id: "overdue-plumbing", status: "pending_review", trade: "plumbing", dueDate: "2026-09-01" },
  ];
  const selectedTrade = nextPunchListTradeFilter("all", "hvac", "all");
  const tradeRows = rows.filter((row) => tradeKey(row.trade) === selectedTrade);
  const visibleRows = filterPunchListRowsForOverdue(tradeRows, "2026-09-08");

  assert.deepEqual(visibleRows.map((row) => row.id), ["overdue-hvac"]);
  assert.deepEqual(
    buildPunchListSummary(visibleRows, {
      tradeOptions: [{ id: "hvac", label: "HVAC" }],
      todayDate: "2026-09-08",
    }).tradeCounts,
    [{ id: "hvac", label: "HVAC", count: 1 }]
  );
});

test("punch list overdue chip toggles filter on and off", () => {
  assert.equal(nextPunchListOverdueFilter(false, 2), true);
  assert.equal(nextPunchListOverdueFilter(true, 2), false);
});

test("punch list overdue chip stays off when there are no overdue items", () => {
  assert.equal(nextPunchListOverdueFilter(false, 0), false);
  assert.equal(nextPunchListOverdueFilter(true, 0), false);
});

test("punch list overdue filter limits visible rows to overdue open items", () => {
  const rows = [
    { id: "overdue-active", status: "active", dueDate: "2026-09-07" },
    { id: "overdue-pending", status: "pending_review", dueDate: "2026-09-01" },
    { id: "due-today", status: "active", dueDate: "2026-09-08" },
    { id: "resolved-overdue", status: "resolved", dueDate: "2026-09-01" },
    { id: "no-due-date", status: "active", dueDate: "" },
  ];

  assert.deepEqual(
    filterPunchListRowsForOverdue(rows, "2026-09-08").map((row) => row.id),
    ["overdue-active", "overdue-pending"]
  );
});

test("clearing punch list overdue filter restores normal filtered open rows", () => {
  const baseFilteredRows = [
    { id: "overdue", status: "active", dueDate: "2026-09-07" },
    { id: "not-overdue", status: "active", dueDate: "2026-09-09" },
  ];
  const overdueRows = filterPunchListRowsForOverdue(baseFilteredRows, "2026-09-08");

  assert.deepEqual(overdueRows.map((row) => row.id), ["overdue"]);
  assert.deepEqual(baseFilteredRows.map((row) => row.id), ["overdue", "not-overdue"]);
});

test("punch list summary trade counts reflect overdue-filtered visible rows", () => {
  const rows = [
    { id: "overdue-hvac", status: "active", trade: "HVAC", dueDate: "2026-09-07" },
    { id: "future-hvac", status: "active", trade: "HVAC", dueDate: "2026-09-09" },
    { id: "overdue-plumbing", status: "pending_review", trade: "plumbing", dueDate: "2026-09-01" },
  ];
  const overdueRows = filterPunchListRowsForOverdue(rows, "2026-09-08");
  const summary = buildPunchListSummary(overdueRows, {
    tradeOptions: [
      { id: "hvac", label: "HVAC" },
      { id: "plumbing", label: "Plumbing" },
    ],
    todayDate: "2026-09-08",
  });

  assert.deepEqual(summary.tradeCounts, [
    { id: "hvac", label: "HVAC", count: 1 },
    { id: "plumbing", label: "Plumbing", count: 1 },
  ]);
});

test("Owner sees all current properties but not deleted property packages", () => {
  assert.deepEqual(
    filterRowsByCurrentPortalPropertyAccess(
      [
        { id: "package-a", org_id: orgId, property_id: "property-a" },
        { id: "package-b", org_id: orgId, property_id: "property-b" },
        { id: "package-deleted", org_id: orgId, property_id: "property-deleted" },
      ],
      [
        {
          org_id: orgId,
          role: "owner",
          access_scope: "org",
          propertyIds: [],
        },
      ],
      ["property-a", "property-b"]
    ).map((row) => row.id),
    ["package-a", "package-b"]
  );
});

test("property scope summaries are readable", () => {
  const propertyById = new Map([["property-a", { name: "Warehouse" }]]);
  assert.equal(propertyScopeSummary({ accessScope: "org", propertyIds: [] }), "All properties");
  assert.equal(
    propertyScopeSummary({ accessScope: "property", propertyIds: ["property-a"], propertyById }),
    "Warehouse"
  );
  assert.equal(
    propertyScopeSummary({ accessScope: "property", propertyIds: ["property-a", "property-b"], propertyById }),
    "2 properties"
  );
});

test("property label formatter separates name from full address", () => {
  assert.equal(
    formatPortalPropertyLabel({
      name: "Rental Unit 1",
      addressLine1: "123 Main St",
      city: "Lancaster",
      state: "OH",
      postalCode: "43130",
    }),
    "Rental Unit 1 - 123 Main St, Lancaster, OH 43130"
  );
  assert.equal(
    formatPortalPropertyLabel({
      name: "Rental Unit 2",
      city: "Lancaster",
      state: "OH",
    }),
    "Rental Unit 2 - Lancaster, OH"
  );
});

test("property scope display separates main text and subtext", () => {
  assert.deepEqual(
    portalPropertyScopeDisplay({ accessScope: "org", role: "viewer" }),
    { mainText: "All properties", subText: "Org-wide scope" }
  );
  assert.deepEqual(
    portalPropertyScopeDisplay({ accessScope: "org", role: "owner" }),
    { mainText: "All properties", subText: "Owner access is org-wide" }
  );
});

test("selected property scope summary is readable and not concatenated", () => {
  assert.deepEqual(
    portalPropertyScopeDisplay({
      accessScope: "property",
      role: "field",
      propertyIds: ["property-a"],
      properties: [
        {
          id: "property-a",
          name: "QA Test 9.17",
          addressLine1: "917 W Coshocton St",
          city: "Johnstown",
          state: "OH",
          postalCode: "43031",
        },
      ],
    }),
    {
      mainText: "Selected properties",
      subText: "1 selected",
    }
  );
  assert.equal(
    formatPortalPropertyLabel({
      name: "QA Test 9.17",
      addressLine1: "917 W Coshocton St",
      city: "Johnstown",
      state: "OH",
      postalCode: "43031",
    }),
    "QA Test 9.17 - 917 W Coshocton St, Johnstown, OH 43031"
  );
});

test("owner active row is locked to all properties", () => {
  assert.equal(
    canEditPortalPropertyScope({
      role: "owner",
      canChangeScope: true,
    }),
    false
  );
});

test("active row can switch from all properties to selected property scope", () => {
  assert.deepEqual(
    nextPortalPropertyScopeSelection({
      currentPropertyIds: [],
      nextScope: "property",
      properties: [{ id: "property-a", name: "Rental Unit 1" }],
    }),
    { accessScope: "property", propertyIds: ["property-a"] }
  );
});

test("active row can switch selected property scope back to all properties", () => {
  assert.deepEqual(
    nextPortalPropertyScopeSelection({
      currentPropertyIds: ["property-a"],
      nextScope: "org",
      properties: [{ id: "property-a", name: "Rental Unit 1" }],
    }),
    { accessScope: "org", propertyIds: [] }
  );
});

test("active selected property checklist keeps at least one property selected", () => {
  assert.deepEqual(
    nextPortalPropertyToggleSelection({
      currentPropertyIds: ["property-a"],
      propertyId: "property-a",
      checked: false,
      properties: [{ id: "property-a", name: "Rental Unit 1" }],
    }),
    { accessScope: "property", propertyIds: ["property-a"] }
  );
});

test("active row property-scope editing batches changes and saves on confirm", () => {
  const properties = [
    { id: "property-a", name: "Rental Unit 1" },
    { id: "property-b", name: "Rental Unit 2" },
  ];
  const row = {
    role: "viewer",
    accessScope: "org",
    propertyIds: [],
    canChangeScope: true,
  };
  const draft = normalizePortalPropertyScopeDraft({
    role: row.role,
    accessScope: "property",
    propertyIds: ["property-a", "property-b"],
    properties,
  });

  assert.deepEqual(draft, {
    accessScope: "property",
    propertyIds: ["property-a", "property-b"],
  });
  assert.equal(portalPropertyScopeDraftChanged(row, draft, properties), true);
  assert.equal(portalPropertyScopeDraftCanSave(row, draft, properties), true);
});

test("active row property-scope editing blocks saving zero selected properties", () => {
  const properties = [
    { id: "property-a", name: "Rental Unit 1" },
    { id: "property-b", name: "Rental Unit 2" },
  ];
  const row = {
    role: "viewer",
    accessScope: "property",
    propertyIds: ["property-a"],
    canChangeScope: true,
  };
  const draft = {
    accessScope: "property",
    propertyIds: [],
  };

  assert.equal(portalPropertyScopeDraftCanSave(row, draft, properties), false);
});

test("checkbox picker saves all checked properties as org-wide when permitted", () => {
  assert.deepEqual(
    portalPropertyScopeSelectionFromCheckedIds({
      checkedPropertyIds: ["property-a", "property-b"],
      properties: [
        { id: "property-a", name: "Rental Unit 1" },
        { id: "property-b", name: "Rental Unit 2" },
      ],
      canUseOrgScope: true,
    }),
    { accessScope: "org", propertyIds: [] }
  );
});

test("checkbox picker keeps selected-property scope when org-wide is not permitted", () => {
  assert.deepEqual(
    portalPropertyScopeSelectionFromCheckedIds({
      checkedPropertyIds: ["property-a", "property-b"],
      properties: [
        { id: "property-a", name: "Rental Unit 1" },
        { id: "property-b", name: "Rental Unit 2" },
      ],
      canUseOrgScope: false,
    }),
    { accessScope: "property", propertyIds: ["property-a", "property-b"] }
  );
});

test("checkbox picker expands org-wide scope to checked property IDs for editing", () => {
  assert.deepEqual(
    checkedPropertyIdsForScopeSelection({
      role: "viewer",
      accessScope: "org",
      propertyIds: [],
      properties: [
        { id: "property-a", name: "Rental Unit 1" },
        { id: "property-b", name: "Rental Unit 2" },
      ],
    }),
    ["property-a", "property-b"]
  );
});

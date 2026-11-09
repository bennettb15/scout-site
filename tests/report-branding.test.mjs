import assert from "node:assert/strict";
import test from "node:test";
import {
  brandingEnabledForOrg,
  loadReportLogo,
  validReportLogoPath,
} from "../api-lib/reportBranding.js";

const orgId = "11111111-1111-4111-8111-111111111111";
const otherOrgId = "22222222-2222-4222-8222-222222222222";
const logoPath = `orgs/${orgId}/logos/33333333-3333-4333-8333-333333333333.png`;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

test("report branding is available to every organization", () => {
  assert.equal(brandingEnabledForOrg(orgId), true);
  assert.equal(brandingEnabledForOrg(otherOrgId), true);
  assert.equal(brandingEnabledForOrg("not-an-org-id"), false);
});

test("logo paths cannot cross organization boundaries", () => {
  assert.equal(validReportLogoPath(orgId, logoPath), true);
  assert.equal(validReportLogoPath(otherOrgId, logoPath), false);
  assert.equal(validReportLogoPath(orgId, `orgs/${orgId}/logos/../../other.png`), false);
});

test("report logo lookup falls back without a row or migration", async () => {
  for (const error of [null, { code: "42P01" }]) {
    const service = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error }) }) }) }),
    };
    assert.equal(await loadReportLogo(service, orgId), null);
  }
});

test("report logo lookup rejects an out-of-scope path before downloading", async () => {
  const service = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { logo_path: `orgs/${otherOrgId}/logos/other.png` }, error: null }) }) }) }),
    storage: { from: () => { throw new Error("download should not happen"); } },
  };
  await assert.rejects(loadReportLogo(service, orgId), /Invalid organization logo path/);
});

test("report logo lookup returns the private PNG for the matching organization", async () => {
  const service = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { logo_path: logoPath }, error: null }) }) }) }),
    storage: { from: () => ({ download: async () => ({ data: new Blob([png]), error: null }) }) },
  };
  assert.deepEqual(await loadReportLogo(service, orgId), png);
});

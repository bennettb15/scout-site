import test from "node:test";
import assert from "node:assert/strict";
import { canNavigateAdminInPlace, navigateAdminPage } from "../src/lib/adminNavigation.js";

test("Admin section links switch in place and keep normal modified-click behavior", () => {
  const click = { button: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  assert.equal(canNavigateAdminInPlace("/admin/portal-access", "/admin/customers", click), true);
  assert.equal(canNavigateAdminInPlace("/reports", "/admin/customers", click), false);
  assert.equal(canNavigateAdminInPlace("/admin/portal-access", "/admin/customers", { ...click, metaKey: true }), false);
  const originalWindow = globalThis.window;
  const calls = [];
  globalThis.window = {
    location: { pathname: "/admin/portal-access" },
    history: { pushState: (_state, _unused, path) => calls.push(["push", path]) },
    dispatchEvent: (event) => calls.push(["event", event.type]),
    scrollTo: (x, y) => calls.push(["scroll", x, y]),
  };
  try {
    navigateAdminPage({ ...click, preventDefault: () => calls.push(["prevent"]) }, "/admin/customers");
    assert.deepEqual(calls, [["prevent"], ["push", "/admin/customers"], ["event", "admin-route-change"], ["scroll", 0, 0]]);
  } finally {
    globalThis.window = originalWindow;
  }
});

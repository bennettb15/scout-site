import assert from "node:assert/strict";
import test from "node:test";
import { loadActiveAttributionEmails } from "../api-lib/activeAttributionEmails.js";

test("active attribution lookup returns only existing profiles", async () => {
  const queried = [];
  const service = {
    from(table) {
      assert.equal(table, "users_profile");
      return {
        select(columns) {
          assert.equal(columns, "email");
          return {
            in(column, emails) {
              queried.push([column, emails]);
              return {
                async is(field, value) {
                  assert.equal(field, "deleted_at");
                  assert.equal(value, null);
                  return { data: [{ email: "active@example.com" }], error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  const active = await loadActiveAttributionEmails(service, [
    "ACTIVE@example.com", "former@example.com", "active@example.com", "System",
  ]);
  assert.deepEqual(queried, [["email", ["active@example.com", "former@example.com"]]]);
  assert.deepEqual([...active], ["active@example.com"]);
});

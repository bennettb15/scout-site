import {
  authenticateRequest,
  methodAllowed,
  sendJson,
} from "./_reportPortalShared.js";

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ["GET", "OPTIONS"])) return;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, 401, { error: auth.error });

    const { data, error } = await auth.client
      .from("orgs")
      .select("id,name")
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (error) {
      return sendJson(res, 500, { error: "Unable to load organizations." });
    }

    return sendJson(res, 200, {
      orgs: (data || []).map((row) => ({
        id: row.id,
        name: row.name,
      })),
    });
  } catch {
    return sendJson(res, 500, { error: "Unable to load organizations." });
  }
}

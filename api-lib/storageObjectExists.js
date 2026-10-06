// Supabase Storage's exists() may return data: false together with a 400
// error for an absent object. Listing the exact parent folder lets us
// distinguish absence from an actual Storage failure without ignoring 400s.
export async function storageObjectExists(storage, path) {
  const slash = path.lastIndexOf("/");
  const folder = slash < 0 ? "" : path.slice(0, slash);
  const filename = path.slice(slash + 1);
  if (!filename) throw new Error("Storage object path is missing a filename.");

  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const { data, error } = await storage.list(folder, { search: filename, limit, offset });
    if (error) throw new Error(`List Storage object ${path}: ${error.message}`);
    if (!Array.isArray(data)) throw new Error(`Storage object list was invalid: ${path}`);
    if (data.some((item) => item.name === filename && item.id !== null)) return true;
    if (data.length < limit) return false;
  }
}

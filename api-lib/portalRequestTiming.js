export function startPortalRequestTiming(res, route, mode) {
  const startedAt = performance.now();
  let previousMark = startedAt;
  const stages = {};

  const timing = {
    mark(name) {
      const now = performance.now();
      stages[name] = Math.round((now - previousMark) * 10) / 10;
      previousMark = now;
    },
  };

  if (typeof res.once === "function") {
    res.once("finish", () => {
      console.info("portal_timing", JSON.stringify({
        route,
        mode,
        status: res.statusCode,
        totalMs: Math.round((performance.now() - startedAt) * 10) / 10,
        stages,
      }));
    });
  }

  return timing;
}

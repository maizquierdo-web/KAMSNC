// Set once at production rollout; later builds must preserve the same value.
// Missing/invalid configuration keeps the existing manual access available.
export function hunterManualAccessEnabled(launchedAt, now = new Date()) {
  if (!launchedAt) return true;
  const start = new Date(launchedAt);
  if (!Number.isFinite(start.getTime())) return true;
  const end = new Date(start);
  const day = start.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return now < end;
}

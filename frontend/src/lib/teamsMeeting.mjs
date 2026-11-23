const TEAMS_HOSTS = new Set(['teams.microsoft.com', 'teams.live.com', 'teams.cloud.microsoft']);

export function teamsMeetingUrl(value) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !TEAMS_HOSTS.has(url.hostname) ||
        url.username || url.password || url.port ||
        !/^\/(?:l\/meetup-join|meet)\/[^/]+/.test(url.pathname)) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function teamsMeetingInfo(notes) {
  const value = notes || '';
  const firstLine = value.split('\n', 1)[0];
  if (!firstLine.startsWith('Teams: ')) return { url: '', notes: value };
  const url = teamsMeetingUrl(firstLine.slice(7));
  return url ? { url, notes: value.slice(firstLine.length).trim() } : { url: '', notes: value };
}

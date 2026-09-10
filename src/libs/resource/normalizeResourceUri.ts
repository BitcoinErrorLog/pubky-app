export function normalizeResourceUri(uri: string): string {
  const parsed = new URL(uri);
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.username = '';
  parsed.password = '';

  if (
    (parsed.protocol === 'https:' && parsed.port === '443') ||
    (parsed.protocol === 'http:' && parsed.port === '80')
  ) {
    parsed.port = '';
  }

  parsed.hash = '';
  return parsed.toString();
}

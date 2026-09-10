export function normalizeResourceUri(uri: string): string {
  const colon = uri.indexOf(':');
  if (colon < 1) throw new Error('invalid URI');
  const scheme = uri.slice(0, colon);
  if (!/^[A-Za-z][A-Za-z0-9+.-]*$/.test(scheme)) throw new Error('invalid URI scheme');

  const normalizedScheme = scheme.toLowerCase();
  const remainder = uri.slice(colon + 1);
  const fragment = remainder.indexOf('#');
  const withoutFragment = fragment >= 0 ? remainder.slice(0, fragment) : remainder;

  if (!remainder.startsWith('//')) return `${normalizedScheme}:${withoutFragment}`;

  // This intentionally mirrors Nexus, including lowercasing CIDv0 ipfs hosts.
  const parsed = new URL(uri);
  const hostname = parsed.hostname.toLowerCase();
  const port =
    (normalizedScheme === 'http' && parsed.port === '80') || (normalizedScheme === 'https' && parsed.port === '443')
      ? ''
      : parsed.port;
  const query = withoutFragment.indexOf('?');
  const exactQuery = query >= 0 ? withoutFragment.slice(query) : '';
  return `${normalizedScheme}://${hostname}${port ? `:${port}` : ''}${parsed.pathname || '/'}${exactQuery}`;
}

import { describe, expect, it } from 'vitest';
import { getNexusUrl } from '@/config/nexus';
import { resourceApi } from './resource.api';

describe('resourceApi', () => {
  it('builds resource endpoint URLs with query parameters', () => {
    expect(resourceApi.byTag({ tag: 'docs', limit: 20, limit_tags: 5 })).toBe(
      `${getNexusUrl()}/v0/stream/resources?tags=docs&limit=20&limit_tags=5`,
    );
    expect(resourceApi.byId({ id: 'resource-1', limit_tags: 20, skip_tags: 0 })).toBe(
      `${getNexusUrl()}/v0/resource/resource-1/tags?limit_tags=20&skip_tags=0`,
    );
    expect(resourceApi.byUri({ uri: 'https://Example.com/path', limit_tags: 20, skip_tags: 0 })).toBe(
      `${getNexusUrl()}/v0/resource/by-uri?uri=https%3A%2F%2FExample.com%2Fpath&limit_tags=20&skip_tags=0`,
    );
    expect(resourceApi.stream({ app: 'jeb.pubky.app', limit: 20, limit_tags: 5 })).toBe(
      `${getNexusUrl()}/v0/stream/resources?app=jeb.pubky.app&limit=20&limit_tags=5`,
    );
  });
});

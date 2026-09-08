import { buildNexusUrl, buildUrlWithQuery, encodePathSegment } from '@/services/nexus/nexus.utils';
import type { TResourceByIdParams, TResourceByUriParams, TResourcesByTagParams } from './resource.types';

const PREFIX = 'v0/resource';
const STREAM_PREFIX = 'v0/stream/resources';

export const resourceApi = {
  byTag: ({ tag, ...params }: TResourcesByTagParams) =>
    buildUrlWithQuery({
      baseRoute: STREAM_PREFIX,
      params: { tags: tag, ...params },
    }),
  byId: ({ id }: TResourceByIdParams) => buildNexusUrl(`${PREFIX}/${encodePathSegment(id)}/tags`),
  byUri: ({ uri, ...params }: TResourceByUriParams) =>
    buildUrlWithQuery({
      baseRoute: `${PREFIX}/by-uri`,
      params: { uri, ...params },
    }),
};

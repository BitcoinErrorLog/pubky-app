import { buildUrlWithQuery, encodePathSegment } from '@/services/nexus/nexus.utils';
import type {
  TResourceByIdParams,
  TResourceByUriParams,
  TResourcesByTagParams,
  TResourceStreamParams,
} from './resource.types';

const PREFIX = 'v0/resource';
const STREAM_PREFIX = 'v0/stream/resources';

export const resourceApi = {
  byTag: ({ tag, ...params }: TResourcesByTagParams) =>
    buildUrlWithQuery({
      baseRoute: STREAM_PREFIX,
      params: { tags: tag, ...params },
    }),
  byId: ({ id, ...params }: TResourceByIdParams) =>
    buildUrlWithQuery({
      baseRoute: `${PREFIX}/${encodePathSegment(id)}/tags`,
      params,
    }),
  byUri: ({ uri, ...params }: TResourceByUriParams) =>
    buildUrlWithQuery({
      baseRoute: `${PREFIX}/by-uri`,
      params: { uri, ...params },
    }),
  stream: (params: TResourceStreamParams) =>
    buildUrlWithQuery({
      baseRoute: STREAM_PREFIX,
      params,
    }),
};

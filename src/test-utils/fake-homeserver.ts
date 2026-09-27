import { vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import type { THomeserverListParams, THomeserverRequestParams } from '@/services/homeserver/homeserver.types';

export function homeserverHttpError(statusCode: number): AppError {
  return new AppError({
    category: ErrorCategory.Client,
    code: statusCode === 404 ? ClientErrorCode.NOT_FOUND : ClientErrorCode.BAD_REQUEST,
    message: `HTTP ${statusCode}`,
    service: ErrorService.Homeserver,
    operation: 'test',
    context: { statusCode },
  });
}

export type FakeHomeserver = {
  /** Stored JSON bodies by full `pubky://` URL. */
  files: Map<string, unknown>;
  /** Every request in order, as `METHOD url`. */
  log: string[];
  /** Makes the next request matching `method` and `url` fail with `statusCode`. */
  failNext: (method: HttpMethod, url: string | RegExp, statusCode: number) => void;
  /** Stores `transform(body)` instead of the body for the next PUT to a matching URL. */
  corruptNextPut: (url: string | RegExp, transform: (body: unknown) => unknown) => void;
};

/**
 * An in-memory homeserver behind `HomeserverService.request` and
 * `HomeserverService.list`, so application code runs its real service calls
 * (and real crypto) against stored bytes the test can inspect.
 */
export function installFakeHomeserver(): FakeHomeserver {
  const files = new Map<string, unknown>();
  const log: string[] = [];
  const failures: { method: HttpMethod; url: string | RegExp; statusCode: number }[] = [];
  const corruptions: { url: string | RegExp; transform: (body: unknown) => unknown }[] = [];
  const matches = (pattern: string | RegExp, url: string) =>
    typeof pattern === 'string' ? pattern === url : pattern.test(url);

  vi.spyOn(HomeserverService, 'request').mockImplementation(async (params: THomeserverRequestParams) => {
    const { method, url, bodyJson } = params;
    log.push(`${method} ${url}`);
    const failure = failures.findIndex((entry) => entry.method === method && matches(entry.url, url));
    if (failure >= 0) {
      const [{ statusCode }] = failures.splice(failure, 1);
      throw homeserverHttpError(statusCode);
    }
    if (method === HttpMethod.GET) {
      if (!files.has(url)) throw homeserverHttpError(404);
      return structuredClone(files.get(url)) as never;
    }
    if (method === HttpMethod.PUT) {
      const corruption = corruptions.findIndex((entry) => matches(entry.url, url));
      const body = structuredClone(bodyJson);
      files.set(url, corruption >= 0 ? corruptions.splice(corruption, 1)[0].transform(body) : body);
      return undefined as never;
    }
    if (method === HttpMethod.DELETE) {
      files.delete(url);
      return undefined as never;
    }
    throw homeserverHttpError(405);
  });

  vi.spyOn(HomeserverService, 'list').mockImplementation(async ({ baseDirectory, limit }: THomeserverListParams) => {
    log.push(`LIST ${baseDirectory}`);
    const failure = failures.findIndex((entry) => entry.method === HttpMethod.GET && matches(entry.url, baseDirectory));
    if (failure >= 0) {
      const [{ statusCode }] = failures.splice(failure, 1);
      throw homeserverHttpError(statusCode);
    }
    return [...files.keys()].filter((url) => url.startsWith(baseDirectory)).slice(0, limit);
  });

  return {
    files,
    log,
    failNext: (method, url, statusCode) => failures.push({ method, url, statusCode }),
    corruptNextPut: (url, transform) => corruptions.push({ url, transform }),
  };
}

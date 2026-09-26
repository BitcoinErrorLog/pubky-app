import { DIGITAL_DELIVERABLE_LOG_PATH } from '@/libs/commerce/digital-file';
import { HttpMethod } from '@/libs/http/http.types';
import { HomeserverService } from '@/services/homeserver/homeserver';

export class CommerceHomeserverService {
  private constructor() {}

  static async fetchJson(url: string): Promise<unknown> {
    return await HomeserverService.request<unknown>({ method: HttpMethod.GET, url });
  }

  static async putJson(url: string, bodyJson: Record<string, unknown>): Promise<void> {
    await HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson });
  }

  static async putMedia(url: string, bytes: Uint8Array): Promise<void> {
    await HomeserverService.putBlob({ url, blob: bytes });
  }

  static async delete(url: string): Promise<void> {
    await HomeserverService.request({ method: HttpMethod.DELETE, url });
  }

  /**
   * Writes an encrypted digital deliverable. Its path appears in no public
   * record, so errors and logs carry the redacted deliverables path only.
   */
  static async putDeliverable(url: string, ciphertext: Uint8Array): Promise<void> {
    await HomeserverService.putBlob({ url, blob: ciphertext, logUrl: DIGITAL_DELIVERABLE_LOG_PATH });
  }

  /** Deletes an encrypted deliverable no version references, logging the redacted path only. */
  static async deleteDeliverable(url: string): Promise<void> {
    await HomeserverService.request({ method: HttpMethod.DELETE, url, logUrl: DIGITAL_DELIVERABLE_LOG_PATH });
  }

  /** Reads a seller's encrypted deliverable (a public read), logging the redacted path only. */
  static async getDeliverable(url: string): Promise<Uint8Array<ArrayBuffer>> {
    return await HomeserverService.getBlob({ url, logUrl: DIGITAL_DELIVERABLE_LOG_PATH });
  }

  static async list(directoryUrl: string, limit: number): Promise<string[]> {
    return await HomeserverService.list({ baseDirectory: directoryUrl, limit });
  }

  static async exists(url: string): Promise<boolean> {
    return await HomeserverService.exists(url);
  }
}

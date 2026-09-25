import { z } from 'zod';

// -----------------------------------------------------------------------------
// Digital delivery (docs: digital-delivery-design.md rev 3).
//
// The Marketplace Transaction Service is the source of truth for these
// shapes: `crates/domain/src/commands.rs` (`DigitalDeliveryKind`,
// `DigitalDelivery`), `crates/service/src/model.rs`
// (`digital_delivery_projection`) and `crates/service/src/http.rs` (the
// /health capability). Schemas here are camelCase — the wire-casing layer
// converts at the transport boundary, as with every marketplace contract.
// -----------------------------------------------------------------------------

/** How a digital listing reaches the buyer (§2). */
export const marketplaceDigitalDeliveryKindSchema = z.enum(['file', 'link', 'text', 'email', 'message']);
export type MarketplaceDigitalDeliveryKind = z.infer<typeof marketplaceDigitalDeliveryKindSchema>;

/** File, link and text are released automatically at payment confirmation. */
export function isInstantDigitalDeliveryKind(kind: MarketplaceDigitalDeliveryKind): boolean {
  return kind === 'file' || kind === 'link' || kind === 'text';
}

/**
 * The public digital-delivery facts on the service's listing projection:
 * the kind, and for a file its content type and size. Null when the seller
 * has not set delivery yet.
 */
export const marketplaceListingDigitalDeliverySchema = z
  .object({
    kind: marketplaceDigitalDeliveryKindSchema,
    contentType: z.string().max(255).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
  })
  .passthrough();
export type MarketplaceListingDigitalDelivery = z.infer<typeof marketplaceListingDigitalDeliverySchema>;

/**
 * The projection field, tolerant by construction: an absent field (a
 * service predating digital delivery) and a malformed one both read as
 * null, so one bad sub-object never fails the listing, and the listing is
 * then treated as not digitally purchasable (§7 input inventory).
 */
export const marketplaceListingDigitalDeliveryFieldSchema = z
  .unknown()
  .transform((value): MarketplaceListingDigitalDelivery | null => {
    const parsed = marketplaceListingDigitalDeliverySchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  });

const CONTENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  'application/pdf': 'PDF',
  'application/zip': 'ZIP',
  'application/epub+zip': 'EPUB',
  'audio/mpeg': 'MP3',
  'audio/wav': 'WAV',
  'video/mp4': 'MP4',
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'text/plain': 'Text file',
};

/** A short label for a well-known content type, or null (never echoes an arbitrary seller string). */
export function digitalContentTypeLabel(contentType: string | undefined): string | null {
  if (!contentType) return null;
  return CONTENT_TYPE_LABELS[contentType.toLowerCase()] ?? null;
}

/** Bytes as buyers read them: `820 KB`, `4.2 MB`, `12 MB`. */
export function formatDigitalFileSize(sizeBytes: number): string {
  const kilobytes = sizeBytes / 1024;
  if (kilobytes < 1024) return `${Math.max(1, Math.round(kilobytes))} KB`;
  const megabytes = kilobytes / 1024;
  return megabytes < 10 ? `${megabytes.toFixed(1)} MB` : `${Math.round(megabytes)} MB`;
}

export const DIGITAL_DELIVERY_COPY = {
  badge: 'Digital delivery',
  instantDownload: 'Instant download',
  instantAccess: 'Instant access',
  emailed: 'Emailed by the seller after payment',
  messaged: 'Sent by the seller in messages after payment',
  offersUnavailable: "Offers aren't available on digital items yet.",
  offersBuyShipped: 'Offers buy the shipped version.',
  paypalWarning:
    "PayPal can reverse payments after delivery and does not cover 'not as described' claims for digital items.",
  unavailable: "Digital delivery isn't available on this deployment.",
  auctionsShipOnly: 'Auctions ship only — pickup and digital delivery are available on Buy now listings.',
  atLeastOneMethod: 'Choose at least one delivery option.',
} as const;

/**
 * The listing-page badge (§3): "Instant download · PDF · 12 MB", "Instant
 * access", or the manual-delivery line. A listing whose delivery is not set
 * yet shows the plain "Digital delivery".
 */
export function digitalDeliveryBadgeLabel(delivery: MarketplaceListingDigitalDelivery | null): string {
  if (!delivery) return DIGITAL_DELIVERY_COPY.badge;
  switch (delivery.kind) {
    case 'file': {
      const parts: string[] = [DIGITAL_DELIVERY_COPY.instantDownload];
      const typeLabel = digitalContentTypeLabel(delivery.contentType);
      if (typeLabel) parts.push(typeLabel);
      if (delivery.sizeBytes !== undefined) parts.push(formatDigitalFileSize(delivery.sizeBytes));
      return parts.join(' · ');
    }
    case 'link':
    case 'text':
      return DIGITAL_DELIVERY_COPY.instantAccess;
    case 'email':
      return DIGITAL_DELIVERY_COPY.emailed;
    case 'message':
      return DIGITAL_DELIVERY_COPY.messaged;
  }
}

/** The deployment's digital delivery capability, from `/health`. */
export type MarketplaceDigitalDeliveryCapability = {
  available: boolean;
  /** The per-file cap the service enforces; null when the service does not report one. */
  maxBytes: number | null;
};

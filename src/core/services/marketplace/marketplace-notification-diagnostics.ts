import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

const reportedInvalidTypeSets = new Set<string>();

export function reportMarketplaceNotificationInvalidTypes(invalidTypes: readonly string[]): void {
  const key = invalidTypes.join('\u0000');
  if (reportedInvalidTypeSets.has(key)) return;
  reportedInvalidTypeSets.add(key);

  Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace notification history was partially unrecognized.', {
    service: ErrorService.Marketplace,
    operation: 'getNotifications',
    context: { invalidTypes },
  });
}

export function resetMarketplaceNotificationDiagnostics(): void {
  reportedInvalidTypeSets.clear();
}

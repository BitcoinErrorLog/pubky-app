'use client';

import { Bot } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { usePubchiEnrollment } from '@/hooks/usePubchiEnrollment/usePubchiEnrollment';
import { ENROLL_FORM_FIELDS } from '@/hooks/usePubchiEnrollment/usePubchiEnrollment.types';
import { PUBCHI_DEGRADED_SESSION_MESSAGE } from '@/libs/pubchi/capabilities';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';

export const PUBCHI_SETTINGS_SURFACE = 'pubchi-settings';

export function PubchiSettings() {
  const {
    form,
    submit,
    remove,
    revokeDevice,
    revokeAllDevices,
    reapprove,
    needsReapproval,
    binding,
    devices = [],
    currentSigner,
    loading,
    enabled,
  } =
    usePubchiEnrollment();

  if (!enabled || !isPubchiEnabled()) {
    return null;
  }

  return (
    <div data-surface={PUBCHI_SETTINGS_SURFACE} data-testid={PUBCHI_SETTINGS_SURFACE}>
      <SettingsSectionCard
        icon={Bot}
        title="Pubchi"
        description="Public bot state. Paste a bot pubky to write the U → B binding on your homeserver."
      >
        {needsReapproval ? (
          <div className="flex flex-col gap-3 px-6" data-testid="pubchi-degraded-session">
            <Typography size="sm">{PUBCHI_DEGRADED_SESSION_MESSAGE}</Typography>
            <Button type="button" disabled={loading} onClick={() => void reapprove()}>
              Re-approve
            </Button>
          </div>
        ) : null}
        {binding ? (
          <div className="flex flex-col gap-4 px-6">
            <Typography size="sm">
              Active bot: <span className="font-mono break-all">{binding.bot}</span>
            </Typography>
            <Button
              type="button"
              variant="destructive"
              data-testid="pubchi-remove-bot"
              disabled={loading || needsReapproval}
              onClick={() => {
                void remove();
              }}
            >
              Remove bot
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4 px-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Typography data-testid="pubchi-not-enrolled" size="sm">
              not enrolled
            </Typography>
            <ControlledInputField
              name={ENROLL_FORM_FIELDS.BOT}
              control={form.control}
              label="Bot pubky"
              placeholder="52-character z-base-32 pubky"
              dataCy="pubchi-bot-input"
            />
            <Button type="submit" data-testid="pubchi-enroll-bot" disabled={loading || needsReapproval}>
              Enroll bot
            </Button>
          </form>
        )}
        {devices.length ? (
          <div className="flex flex-col gap-3 px-6 pb-6" data-testid="pubchi-device-signers">
            <Typography size="sm">Device signers</Typography>
            {devices.map((device) => (
              <div className="flex items-center justify-between gap-3" key={device.signer}>
                <Typography size="sm" className="break-all">
                  {device.signer}
                  {device.signer === currentSigner ? ' (this browser)' : ''}
                  <span className="block text-xs opacity-70">
                    Created {new Date(device.created_at * 1000).toLocaleDateString()} · Expires{' '}
                    {new Date(device.expires_at * 1000).toLocaleDateString()}
                  </span>
                </Typography>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={loading || needsReapproval}
                  onClick={() => void revokeDevice(device.signer)}
                >
                  Revoke
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              disabled={loading || needsReapproval}
              onClick={() => void revokeAllDevices()}
            >
              Revoke all
            </Button>
          </div>
        ) : null}
      </SettingsSectionCard>
    </div>
  );
}

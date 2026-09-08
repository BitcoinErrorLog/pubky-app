'use client';

import { Bot } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { usePubchiEnrollment } from '@/hooks/usePubchiEnrollment/usePubchiEnrollment';
import {
  BACKUP_FORM_FIELDS,
  ENROLL_FORM_FIELDS,
} from '@/hooks/usePubchiEnrollment/usePubchiEnrollment.types';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';

export const PUBCHI_SETTINGS_SURFACE = 'pubchi-settings';

export function PubchiSettings() {
  const {
    form,
    backupForm,
    submit,
    confirmBackup,
    openBackup,
    closeBackup,
    remove,
    revokeDevice,
    revokeAllDevices,
    reapprove,
    needsReapproval,
    binding,
    pubchi,
    creating,
    backupOpen,
    backupPositions,
    backupController,
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
        description="Create a personal bot identity bound to your Pubky account."
      >
        {needsReapproval ? (
          <div className="flex flex-col gap-3 px-6">
            <Typography size="sm">Re-approve Pubky Ring to enable Pubchi.</Typography>
            <Button type="button" disabled={loading} onClick={() => void reapprove()}>
              Re-approve Pubky Ring
            </Button>
          </div>
        ) : null}
        {creating ? (
          <div className="flex flex-col gap-3 px-6" role="status" data-testid="pubchi-create-progress">
            <Typography size="sm">Creating your Pubchi…</Typography>
            <Typography size="xs">Minting the key, verifying the binding, and authorizing this browser.</Typography>
          </div>
        ) : null}
        {pubchi || binding ? (
          <div className="flex flex-col gap-4 px-6">
            <Typography size="sm">
              {pubchi?.displayName ?? 'Active bot'}:{' '}
              <span className="font-mono break-all">{pubchi?.bot ?? binding?.bot}</span>
            </Typography>
            {pubchi ? (
              <>
                <Typography size="sm">
                  Created {new Date(pubchi.createdAt * 1000).toLocaleDateString()} ·{' '}
                  {pubchi.verified ? 'Verified' : 'Not verified'} ·{' '}
                  {pubchi.backupConfirmedAt ? 'Backed up' : 'Not backed up'}
                </Typography>
                {!pubchi.backupConfirmedAt ? (
                  <Button type="button" variant="secondary" disabled={loading} onClick={openBackup}>
                    Back up your Pubchi&apos;s key
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button
              type="button"
              variant="destructive"
              data-testid="pubchi-remove-bot"
              disabled={loading}
              onClick={() => {
                void remove();
              }}
            >
              Remove Pubchi
            </Button>
          </div>
        ) : !creating ? (
          <form
            className="flex flex-col gap-4 px-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Typography data-testid="pubchi-not-enrolled" size="sm">
              Create a Pubchi for this account.
            </Typography>
            <ControlledInputField
              name={ENROLL_FORM_FIELDS.DISPLAY_NAME}
              control={form.control}
              label="Name"
              placeholder="Pubchi"
              dataCy="pubchi-name-input"
            />
            <Button type="submit" data-testid="pubchi-create" disabled={loading}>
              Create
            </Button>
          </form>
        ) : null}
        {backupOpen ? (
          <div className="flex select-none flex-col gap-4 px-6" data-testid="pubchi-backup-reveal">
            <Typography size="sm">Write these words down. They cannot be copied or shown again after you leave.</Typography>
            <div className="grid grid-cols-2 gap-2 select-none" aria-label="Pubchi recovery words">
              {backupController.words().map((word, index) => (
                <span className="rounded-md border p-2 text-sm" key={index}>
                  {index + 1}. {word}
                </span>
              ))}
            </div>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void confirmBackup();
              }}
            >
              {backupPositions.map((position, index) => (
                <ControlledInputField
                  key={position}
                  name={[
                    BACKUP_FORM_FIELDS.WORD_ONE,
                    BACKUP_FORM_FIELDS.WORD_TWO,
                    BACKUP_FORM_FIELDS.WORD_THREE,
                  ][index]!}
                  control={backupForm.control}
                  label={`Word ${position + 1}`}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              ))}
              <Button type="submit" disabled={loading}>
                Confirm backup
              </Button>
              <Button type="button" variant="secondary" disabled={loading} onClick={closeBackup}>
                Not now
              </Button>
            </form>
          </div>
        ) : null}
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
                <Button type="button" variant="destructive" disabled={loading} onClick={() => void revokeDevice(device.signer)}>
                  Revoke
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" disabled={loading} onClick={() => void revokeAllDevices()}>
              Revoke all
            </Button>
          </div>
        ) : null}
      </SettingsSectionCard>
    </div>
  );
}

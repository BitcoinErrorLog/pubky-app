'use client';

import { Bot } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { usePubchiEnrollment } from '@/hooks/usePubchiEnrollment/usePubchiEnrollment';
import { ENROLL_FORM_FIELDS } from '@/hooks/usePubchiEnrollment/usePubchiEnrollment.types';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';

export const PUBCHI_SETTINGS_SURFACE = 'pubchi-settings';

export function PubchiSettings() {
  const { form, submit, remove, binding, loading, enabled } = usePubchiEnrollment();

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
        {binding ? (
          <div className="flex flex-col gap-4 px-6">
            <Typography size="sm">
              Active bot: <span className="font-mono break-all">{binding.bot}</span>
            </Typography>
            <Button
              type="button"
              variant="destructive"
              data-testid="pubchi-remove-bot"
              disabled={loading}
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
            <Button type="submit" data-testid="pubchi-enroll-bot" disabled={loading}>
              Enroll bot
            </Button>
          </form>
        )}
      </SettingsSectionCard>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Lock, RotateCcw } from 'lucide-react';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { RadioGroup, RadioGroupItem } from '@/atoms/RadioGroup/RadioGroup';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { Typography } from '@/atoms/Typography/Typography';
import type { PubchiOwnerContextV1 } from '@/libs/pubchi/schemas';
import { scanForbiddenPublicState } from '@/libs/pubchi/schemas';
import { toast } from '@/molecules/Toaster/toast';

export const PUBCHI_BRAIN_PANEL_SURFACE = 'pubchi-brain-panel';
export const PUBCHI_HOSTED_BRAIN: PubchiBrainChoice = {
  execution: 'synonym-hosted',
  provider_id: 'moonshot',
  model_id: 'kimi-k3',
  endpoint: null,
};

export type PubchiBrainChoice =
  | { execution: 'synonym-hosted'; provider_id: 'moonshot'; model_id: 'kimi-k3'; endpoint: null }
  | { execution: 'self-hosted'; provider_id: 'openai-compatible' | 'ollama'; model_id: string; endpoint: string };

export type PubchiBrainPanelProps = {
  value: PubchiBrainChoice;
  previous?: PubchiBrainChoice;
  onChange: (next: PubchiBrainChoice) => void | Promise<void>;
  onRollback?: () => void | Promise<void>;
  saving?: boolean;
  context?: PubchiOwnerContextV1 | null;
  contextEditable?: boolean;
  onSaveContext?: (context: Pick<PubchiOwnerContextV1, 'about' | 'instructions'>) => void | Promise<unknown>;
  onReapprove?: () => void | Promise<unknown>;
};

const API_KEY_QUERY_PATTERN = /^(?:api[-_]?key|access[-_]?key|token|secret|password|authorization|key)$/i;

function isSafeEndpoint(endpoint: string) {
  try {
    const parsed = new URL(endpoint);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return false;
    return ![...parsed.searchParams.keys()].some((key) => API_KEY_QUERY_PATTERN.test(key));
  } catch {
    return false;
  }
}

export function PubchiBrainPanel({
  value,
  previous,
  onChange,
  onRollback,
  saving = false,
  context,
  contextEditable = true,
  onSaveContext,
  onReapprove,
}: PubchiBrainPanelProps) {
  const [draft, setDraft] = useState<PubchiBrainChoice>(value);
  const [endpointError, setEndpointError] = useState(false);
  const [contextDraft, setContextDraft] = useState({ about: context?.about ?? '', instructions: context?.instructions ?? '' });
  const [contextError, setContextError] = useState(false);
  const isSelfHosted = draft.execution === 'self-hosted';

  useEffect(() => {
    setDraft(value);
    setEndpointError(false);
  }, [value]);

  useEffect(() => {
    setContextDraft({ about: context?.about ?? '', instructions: context?.instructions ?? '' });
  }, [context]);

  function changeContext(field: 'about' | 'instructions', next: string) {
    const candidate = { ...contextDraft, [field]: next };
    const safe = scanForbiddenPublicState(candidate).ok;
    setContextError(!safe);
    if (safe) setContextDraft(candidate);
  }

  function selectExecution(execution: string) {
    if (saving) return;
    if (execution === 'synonym-hosted') {
      setDraft(PUBCHI_HOSTED_BRAIN);
      void onChange(PUBCHI_HOSTED_BRAIN);
      setEndpointError(false);
      return;
    }
    setDraft({
      execution: 'self-hosted',
      provider_id: value.execution === 'self-hosted' ? value.provider_id : 'openai-compatible',
      model_id: value.execution === 'self-hosted' ? value.model_id : '',
      endpoint: value.execution === 'self-hosted' ? value.endpoint : '',
    });
  }

  function changeEndpoint(endpoint: string) {
    const valid = endpoint.length === 0 || isSafeEndpoint(endpoint);
    setEndpointError(!valid);
    if (valid) {
      setDraft((current) => (current.execution === 'self-hosted' ? { ...current, endpoint } : current));
    }
  }

  function changeProvider(provider_id: 'openai-compatible' | 'ollama') {
    setDraft((current) => (current.execution === 'self-hosted' ? { ...current, provider_id } : current));
  }

  function changeModel(model_id: string) {
    setDraft((current) => (current.execution === 'self-hosted' ? { ...current, model_id } : current));
  }

  const selfHostedIsValid =
    draft.execution === 'self-hosted' && Boolean(draft.model_id.trim()) && isSafeEndpoint(draft.endpoint);

  return (
    <Card data-surface={PUBCHI_BRAIN_PANEL_SURFACE} data-testid={PUBCHI_BRAIN_PANEL_SURFACE}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Brain</CardTitle>
            <Typography size="sm" className="mt-1 text-muted-foreground">
              Choose how your Pubchi thinks.
            </Typography>
          </div>
          <Badge variant="secondary">{isSelfHosted ? 'Self-hosted' : 'Kimi K3'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <RadioGroup value={draft.execution} onValueChange={selectExecution} aria-label="Pubchi brain">
          <div className="flex gap-3 rounded-lg border border-border p-4 has-[[data-state=checked]]:border-brand">
            <RadioGroupItem value="synonym-hosted" id="pubchi-brain-hosted" disabled={saving} />
            <div>
              <label htmlFor="pubchi-brain-hosted" className="cursor-pointer font-medium">
                Kimi K3, hosted by Synonym (default)
              </label>
              <Typography size="sm" className="mt-1 text-muted-foreground">
                The recommended default.
              </Typography>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg border border-border p-4 has-[[data-state=checked]]:border-brand">
            <RadioGroupItem value="self-hosted" id="pubchi-brain-self-hosted" disabled={saving} />
            <div>
              <label htmlFor="pubchi-brain-self-hosted" className="cursor-pointer font-medium">
                My own endpoint
              </label>
              <Typography size="sm" className="mt-1 text-muted-foreground">
                Use an OpenAI-compatible or Ollama server you control.
              </Typography>
            </div>
          </div>
        </RadioGroup>

        {isSelfHosted ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pubchi-brain-provider">Provider</Label>
              <Select
                value={draft.provider_id}
                onValueChange={(provider) => changeProvider(provider as 'openai-compatible' | 'ollama')}
                disabled={saving}
              >
                <SelectTrigger id="pubchi-brain-provider" className="w-full">
                  <SelectValue placeholder="Choose a provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai-compatible">OpenAI-compatible</SelectItem>
                  <SelectItem value="ollama">Ollama</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pubchi-brain-endpoint">Endpoint URL</Label>
              <Input
                id="pubchi-brain-endpoint"
                type="url"
                value={draft.endpoint}
                onChange={(event) => changeEndpoint(event.target.value)}
                placeholder="https://your-machine.example/v1"
                aria-invalid={endpointError}
                disabled={saving}
              />
              <Typography size="sm" className={endpointError ? 'text-destructive' : 'text-muted-foreground'}>
                Never put an API key in this URL. Keys stay on your own machine.
              </Typography>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pubchi-brain-model">Model ID</Label>
              <Input
                id="pubchi-brain-model"
                value={draft.model_id}
                onChange={(event) => changeModel(event.target.value)}
                placeholder="Model ID"
                disabled={saving}
              />
            </div>
          </div>
        ) : null}

        {isSelfHosted ? (
          <Button type="button" disabled={saving || !selfHostedIsValid} onClick={() => void onChange(draft)}>
            Save
          </Button>
        ) : null}

        <div className="flex flex-col gap-3 border-t pt-5" data-testid="pubchi-private-context">
          <div className="flex items-center gap-2">
            <Lock aria-hidden="true" className="size-4" />
            <Typography className="font-medium">Private context</Typography>
          </div>
          <Typography size="sm" className="text-muted-foreground">
            Private: stored in your homeserver&apos;s private area and sent only inside your signed questions. Never public.
          </Typography>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pubchi-context-about">About you</Label>
            <textarea
              id="pubchi-context-about"
              value={contextDraft.about}
              onChange={(event) => changeContext('about', event.target.value)}
              maxLength={1500}
              readOnly={!contextEditable}
              className="min-h-24 rounded-md border bg-background p-3 text-sm"
            />
            <Typography size="xs" className="text-muted-foreground">{Array.from(contextDraft.about).length}/1500</Typography>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pubchi-context-instructions">How to answer</Label>
            <textarea
              id="pubchi-context-instructions"
              value={contextDraft.instructions}
              onChange={(event) => changeContext('instructions', event.target.value)}
              maxLength={1000}
              readOnly={!contextEditable}
              className="min-h-24 rounded-md border bg-background p-3 text-sm"
            />
            <Typography size="xs" className="text-muted-foreground">{Array.from(contextDraft.instructions).length}/1000</Typography>
          </div>
          {contextError ? <Typography size="sm" className="text-destructive">That value looks like a secret or key and cannot be saved.</Typography> : null}
          {contextEditable ? (
            <Button
              type="button"
              disabled={saving || contextError || !onSaveContext}
              onClick={() =>
                void Promise.resolve(onSaveContext?.(contextDraft)).catch(() => {
                  toast({ variant: 'error', title: 'Could not save private context', dismissButton: true });
                })
              }
            >
              Save private context
            </Button>
          ) : (
            <>
              <Typography size="sm">Re-approve in Ring to edit your private context.</Typography>
              <Button type="button" variant="outline" disabled={saving || !onReapprove} onClick={() => void onReapprove?.()}>
                Re-approve in Ring
              </Button>
            </>
          )}
        </div>

        <Typography className="rounded-lg bg-muted/30 p-3 text-sm">
          Your Pubchi&apos;s identity, settings, and history live on your homeserver. Changing the brain changes how it
          thinks, not who it is.
        </Typography>

        {previous && onRollback && JSON.stringify(previous) !== JSON.stringify(value) ? (
          <Button type="button" variant="outline" disabled={saving} onClick={() => void onRollback()}>
            <RotateCcw aria-hidden="true" />
            Roll back to previous brain
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

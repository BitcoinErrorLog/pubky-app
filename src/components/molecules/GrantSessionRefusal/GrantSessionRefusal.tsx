import { Typography } from '@/atoms/Typography/Typography';

export const GRANT_SESSION_REFUSAL_COPY = {
  default: 'Bitkit sign-in does not cover this step yet. Sign in with Pubky Ring to continue.',
  inventory: 'Inventory edits need a Pubky Ring sign-in for now.',
  messaging: 'Messages need a Pubky Ring sign-in for now.',
} as const;

/** Shown instead of a Pubky Ring approval QR when the Shop session came from a Bitkit sign-in. */
export function GrantSessionRefusal({ message = GRANT_SESSION_REFUSAL_COPY.default }: { message?: string }) {
  return (
    <div
      role="status"
      data-testid="grant-session-refusal"
      className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
    >
      <Typography as="p" className="text-sm text-muted-foreground">
        {message}
      </Typography>
    </div>
  );
}

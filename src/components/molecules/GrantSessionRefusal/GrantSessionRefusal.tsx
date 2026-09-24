import { Typography } from '@/atoms/Typography/Typography';

/** Shown instead of a Pubky Ring approval QR when the Shop session came from a Bitkit sign-in. */
export function GrantSessionRefusal() {
  return (
    <div
      role="status"
      data-testid="grant-session-refusal"
      className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
    >
      <Typography as="p" className="text-sm text-muted-foreground">
        {'Bitkit sign-in does not cover this step yet. Sign in with Pubky Ring to continue.'}
      </Typography>
    </div>
  );
}

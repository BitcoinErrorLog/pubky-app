import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';

const dialogFixtures = [
  ['restore-encrypted-file', 'Restore with encrypted file', 'max-w-full gap-6 overflow-hidden p-8'],
  ['backup-phrase', 'Backup recovery phrase', 'max-w-sm md:max-w-2xl'],
  ['crop-image', 'Cropped image', 'max-w-xl gap-6 rounded-2xl border-border bg-popover p-8 sm:p-6'],
  ['backup', 'Back up your pubky', 'max-w-sm p-6 md:max-w-xl md:p-8'],
  ['packing-slip', 'Packing slip', 'max-w-2xl border-border bg-popover'],
  ['backup-export', 'Export backup', 'max-w-md'],
  ['add-link', 'Add link', 'w-xl max-w-xl'],
  ['emoji-picker', 'Emoji picker', 'max-w-sm overflow-hidden p-0 outline-none sm:p-0'],
] as const;

function DialogWidthFixture({ title, className }: { title: string; className: string }) {
  return (
    <Dialog open>
      <DialogContent centered className={className} hiddenTitle={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p>Dialog content remains within its declared desktop width.</p>
      </DialogContent>
    </Dialog>
  );
}

describe('Marketplace dialog widths — visual regression', () => {
  for (const [name, title, className] of dialogFixtures) {
    it(`renders the ${name} dialog centered at 1280px`, async () => {
      const screen = await renderForVRT(<DialogWidthFixture title={title} className={className} />, {
        viewport: { width: 1280, height: 900 },
      });

      await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot(`dialog-${name}-desktop-1280`);
    });
  }
});

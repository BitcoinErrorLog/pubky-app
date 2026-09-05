import { describe, expect, it, vi } from 'vitest';
import { PUBCHI_SETTINGS_SURFACE, PubchiSettings } from '@/templates/Settings/Pubchi/Pubchi';
import { renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

vi.mock('@/hooks/usePubchiEnrollment/usePubchiEnrollment', () => ({
  usePubchiEnrollment: () => ({
    form: { control: {} },
    submit: vi.fn(),
    remove: vi.fn(),
    binding: undefined,
    loading: false,
    enabled: true,
  }),
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiEnabled: () => true,
}));

vi.mock('@/molecules/ControlledInputField/ControlledInputField', () => ({
  ControlledInputField: () => <input aria-label="Bot pubky" />,
}));

describe('PubchiSettings — visual regression', () => {
  it('guards the production surface marker', async () => {
    const screen = await renderForVRT(<PubchiSettings />, { viewport: VRT_VIEWPORT_DESKTOP });
    const surface = screen.getByTestId(PUBCHI_SETTINGS_SURFACE);
    await expect.element(surface).toHaveAttribute('data-surface', PUBCHI_SETTINGS_SURFACE);
  });

  it('captures the production settings surface only', async () => {
    const screen = await renderForVRT(<PubchiSettings />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(PUBCHI_SETTINGS_SURFACE)).toMatchScreenshot('pubchi-settings-desktop');
  });
});

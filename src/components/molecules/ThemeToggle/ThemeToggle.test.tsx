import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

const themeState = vi.hoisted(() => ({
  resolvedTheme: 'dark' as string | undefined,
  setTheme: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: themeState.resolvedTheme,
    setTheme: themeState.setTheme,
  }),
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    themeState.resolvedTheme = 'dark';
    themeState.setTheme.mockClear();
  });

  it('renders a sun button in dark mode', () => {
    render(<ThemeToggle />);

    const button = screen.getByTestId('theme-toggle');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Switch to light mode');
    expect(document.querySelector('.lucide-sun')).toBeInTheDocument();
  });

  it('renders a moon button in light mode', () => {
    themeState.resolvedTheme = 'light';
    render(<ThemeToggle />);

    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('aria-label', 'Switch to dark mode');
    expect(document.querySelector('.lucide-moon')).toBeInTheDocument();
  });

  it('toggles from dark to light', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(themeState.setTheme).toHaveBeenCalledWith('light');
  });

  it('toggles from light to dark', () => {
    themeState.resolvedTheme = 'light';
    render(<ThemeToggle />);
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(themeState.setTheme).toHaveBeenCalledWith('dark');
  });
});

describe('ThemeToggle - Snapshots', () => {
  beforeEach(() => {
    themeState.resolvedTheme = 'dark';
    themeState.setTheme.mockClear();
  });

  it('matches snapshot in dark mode', () => {
    const { container } = render(<ThemeToggle />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot in light mode', () => {
    themeState.resolvedTheme = 'light';
    const { container } = render(<ThemeToggle />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ghost variant', () => {
    const { container } = render(<ThemeToggle variant="ghost" className="size-12" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

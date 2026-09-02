'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/atoms/Button/Button';
import { cn } from '@/libs/utils/utils';

export interface ThemeToggleProps {
  className?: string;
  variant?: 'secondary' | 'ghost';
}

export function ThemeToggle({ className, variant = 'secondary' }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isLight = mounted && resolvedTheme === 'light';
  const label = isLight ? 'Switch to dark mode' : 'Switch to light mode';

  return (
    <Button
      type="button"
      variant={variant}
      size="icon"
      data-cy="theme-toggle"
      data-testid="theme-toggle"
      aria-label={label}
      className={cn('h-12 w-12 shrink-0', variant === 'secondary' && 'border bg-foreground/5', className)}
      onClick={() => setTheme(isLight ? 'dark' : 'light')}
    >
      {isLight ? <Moon className="size-6" /> : <Sun className="size-6" />}
    </Button>
  );
}

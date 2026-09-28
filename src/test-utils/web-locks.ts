/**
 * A Web Locks stand-in shared by every "tab" of a test: one exclusive holder
 * per name, granted in request order. jsdom has no `navigator.locks`.
 */
export function installWebLocks(): void {
  const tails = new Map<string, Promise<void>>();
  const request = async <T>(name: string, callback: () => Promise<T>): Promise<T> => {
    const previous = tails.get(name) ?? Promise.resolve();
    let release = () => {};
    const next = new Promise<void>((resolve) => (release = resolve));
    tails.set(
      name,
      previous.then(() => next),
    );
    await previous;
    try {
      return await callback();
    } finally {
      release();
    }
  };
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
}

/** A lock manager whose every request is refused, as a browser may do. */
export function installRefusingWebLocks(error: unknown): void {
  const request = async () => {
    throw error;
  };
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
}

export function removeWebLocks(): void {
  Reflect.deleteProperty(navigator, 'locks');
}

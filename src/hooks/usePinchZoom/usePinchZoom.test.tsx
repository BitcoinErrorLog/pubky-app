import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clampZoomTransform, PINCH_ZOOM_MAX_SCALE, usePinchZoom, zoomAround } from './usePinchZoom';

// The frame is 400 x 300 with its top-left at the origin, so its centre is (200, 150).
const FRAME = { left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0 };

function Harness({ enabled = true }: { enabled?: boolean }) {
  const { frameRef, transform, isZoomed, handlers } = usePinchZoom({ enabled });
  return (
    <div ref={frameRef} data-testid="frame" data-zoomed={isZoomed} {...handlers}>
      <span data-testid="transform">{`${transform.scale.toFixed(2)},${transform.x},${transform.y}`}</span>
    </div>
  );
}

const frame = () => screen.getByTestId('frame');
const reading = () => screen.getByTestId('transform').textContent;

const tap = (x: number, y: number, pointerId = 1) => {
  fireEvent.pointerDown(frame(), { pointerId, clientX: x, clientY: y, pointerType: 'touch' });
  fireEvent.pointerUp(frame(), { pointerId, clientX: x, clientY: y, pointerType: 'touch' });
};

describe('usePinchZoom', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ ...FRAME, toJSON: () => FRAME });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('starts at the fitted size', () => {
    render(<Harness />);
    expect(reading()).toBe('1.00,0,0');
    expect(frame()).toHaveAttribute('data-zoomed', 'false');
  });

  it('zooms in on a double tap and back out on the next one', () => {
    render(<Harness />);

    tap(200, 150);
    tap(200, 150);
    expect(reading()).toBe('2.50,0,0');
    expect(frame()).toHaveAttribute('data-zoomed', 'true');

    tap(200, 150);
    tap(200, 150);
    expect(reading()).toBe('1.00,0,0');
  });

  it('keeps the tapped point under the finger when zooming off-centre', () => {
    render(<Harness />);

    // 100px right of centre: x = 100 - 2.5 * 100 = -150, inside the 300px pan bound
    tap(300, 150);
    tap(300, 150);
    expect(reading()).toBe('2.50,-150,0');
  });

  it('does not treat two slow taps as a double tap', () => {
    vi.useFakeTimers();
    render(<Harness />);

    tap(200, 150);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    tap(200, 150);
    expect(reading()).toBe('1.00,0,0');
  });

  it('scales with the distance between two fingers, capped at the maximum', () => {
    render(<Harness />);

    fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 150, clientY: 150, pointerType: 'touch' });
    fireEvent.pointerDown(frame(), { pointerId: 2, clientX: 250, clientY: 150, pointerType: 'touch' });
    // 100px apart becomes 300px apart around the same midpoint: three times larger
    fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 50, clientY: 150, pointerType: 'touch' });
    fireEvent.pointerMove(frame(), { pointerId: 2, clientX: 350, clientY: 150, pointerType: 'touch' });
    expect(reading()).toBe('3.00,0,0');

    fireEvent.pointerMove(frame(), { pointerId: 2, clientX: 1000, clientY: 150, pointerType: 'touch' });
    expect(reading()?.startsWith(`${PINCH_ZOOM_MAX_SCALE.toFixed(2)},`)).toBe(true);
  });

  it('never shrinks below the fitted size on a pinch in', () => {
    render(<Harness />);

    fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 100, clientY: 150, pointerType: 'touch' });
    fireEvent.pointerDown(frame(), { pointerId: 2, clientX: 300, clientY: 150, pointerType: 'touch' });
    fireEvent.pointerMove(frame(), { pointerId: 2, clientX: 150, clientY: 150, pointerType: 'touch' });
    expect(reading()).toBe('1.00,0,0');
  });

  it('pans a zoomed image with one finger, stopping at the image edge', () => {
    render(<Harness />);
    tap(200, 150);
    tap(200, 150);

    fireEvent.pointerDown(frame(), { pointerId: 3, clientX: 200, clientY: 150, pointerType: 'touch' });
    fireEvent.pointerMove(frame(), { pointerId: 3, clientX: 260, clientY: 170, pointerType: 'touch' });
    expect(reading()).toBe('2.50,60,20');

    // Bound: (400 * 2.5 - 400) / 2 = 300 horizontally, (300 * 2.5 - 300) / 2 = 225 vertically
    fireEvent.pointerMove(frame(), { pointerId: 3, clientX: 1200, clientY: 1200, pointerType: 'touch' });
    expect(reading()).toBe('2.50,300,225');
  });

  it('leaves a one-finger drag alone at the fitted size, so the carousel can swipe', () => {
    render(<Harness />);

    fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 200, clientY: 150, pointerType: 'touch' });
    fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 50, clientY: 150, pointerType: 'touch' });
    fireEvent.pointerUp(frame(), { pointerId: 1, clientX: 50, clientY: 150, pointerType: 'touch' });
    expect(reading()).toBe('1.00,0,0');
  });

  it('zooms on the mouse wheel and keeps the page from scrolling or zooming', () => {
    render(<Harness />);

    const notPrevented = fireEvent.wheel(frame(), { deltaY: -200, clientX: 200, clientY: 150 });
    expect(notPrevented).toBe(false);
    expect(frame()).toHaveAttribute('data-zoomed', 'true');
  });

  it('keeps a drag going from the wheel zoom instead of snapping back to where the drag started', () => {
    render(<Harness />);
    tap(200, 150);
    tap(200, 150);

    fireEvent.pointerDown(frame(), { pointerId: 3, clientX: 200, clientY: 150, pointerType: 'touch' });
    fireEvent.pointerMove(frame(), { pointerId: 3, clientX: 260, clientY: 170, pointerType: 'touch' });
    expect(reading()).toBe('2.50,60,20');

    // 2.5 * e^(100 * 0.002) = 3.05, around the frame centre
    fireEvent.wheel(frame(), { deltaY: -100, clientX: 200, clientY: 150 });
    const [wheelScale, wheelX, wheelY] = (reading() ?? '').split(',');
    expect(wheelScale).toBe('3.05');

    // The next 10px of drag moves on from the wheel's result
    fireEvent.pointerMove(frame(), { pointerId: 3, clientX: 270, clientY: 170, pointerType: 'touch' });
    expect(reading()).toBe(`3.05,${Number(wheelX) + 10},${wheelY}`);
  });

  it('pulls the pan back inside the image edge when the frame shrinks, e.g. a phone rotates', () => {
    const resizeCallbacks: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resizeCallbacks.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    render(<Harness />);
    tap(200, 150);
    tap(200, 150);
    fireEvent.pointerDown(frame(), { pointerId: 3, clientX: 200, clientY: 150, pointerType: 'touch' });
    fireEvent.pointerMove(frame(), { pointerId: 3, clientX: 1200, clientY: 150, pointerType: 'touch' });
    fireEvent.pointerUp(frame(), { pointerId: 3, clientX: 1200, clientY: 150, pointerType: 'touch' });
    expect(reading()).toBe('2.50,300,0');

    // 400px wide becomes 320px: the horizontal bound drops from 300 to (320 * 2.5 - 320) / 2 = 240
    const narrow = { ...FRAME, width: 320, right: 320 };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ ...narrow, toJSON: () => narrow });
    act(() => resizeCallbacks.forEach((callback) => callback()));
    expect(reading()).toBe('2.50,240,0');
  });

  it('resets when it is disabled, e.g. the slide is swiped away', () => {
    const { rerender } = render(<Harness />);
    tap(200, 150);
    tap(200, 150);
    expect(reading()).toBe('2.50,0,0');

    rerender(<Harness enabled={false} />);
    expect(reading()).toBe('1.00,0,0');
  });
});

describe('zoom maths', () => {
  it('zoomAround keeps the focal point fixed', () => {
    const next = zoomAround({ scale: 2, x: 40, y: -20 }, 4, { x: 100, y: 50 });
    // The content point under (100, 50) was ((100 - 40) / 2, (50 + 20) / 2) = (30, 35); at scale 4 it stays there.
    expect(next).toEqual({ scale: 4, x: 100 - 4 * 30, y: 50 - 4 * 35 });
  });

  it('clampZoomTransform allows no pan on an axis where the content is smaller than the frame', () => {
    // A tall image letterboxed to 150px wide inside a 400px frame: at 2x it is 300px wide, still narrower.
    const clamped = clampZoomTransform(
      { scale: 2, x: 120, y: 500 },
      { width: 400, height: 300 },
      { width: 150, height: 300 },
    );
    expect(clamped).toEqual({ scale: 2, x: 0, y: 150 });
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadgeCircle, type BadgeView } from '@/components/badges/BadgeCircle';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function renderBadge(badge: BadgeView, extra: Partial<Parameters<typeof BadgeCircle>[0]> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<BadgeCircle badge={badge} language="ar" {...extra} />);
  });
  return container;
}

function labelOf(node: HTMLElement) {
  return node.querySelector('button')?.getAttribute('aria-label') || '';
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('BadgeCircle', () => {
  it('announces an unlocked badge with its name and date state', () => {
    const node = renderBadge({
      id: 1,
      name: 'أول حكاية',
      state: 'unlocked',
      unlocked: true,
      tier: 'bronze',
      progress: { currentValue: 1, targetValue: 1, ratio: 1 }
    });
    expect(labelOf(node)).toContain('أول حكاية');
    expect(labelOf(node)).toContain('مفتوحة');
  });

  it('shows the progress values while in progress', () => {
    const node = renderBadge({
      id: 2,
      name: 'رفيق العلم',
      state: 'in_progress',
      tier: 'silver',
      progress: { currentValue: 3, targetValue: 7, ratio: 3 / 7 }
    });
    expect(node.textContent).toContain('3/7');
    expect(labelOf(node)).toContain('3/7');
  });

  it('marks locked badges as locked', () => {
    const node = renderBadge({
      id: 3,
      name: 'سراج المعرفة',
      state: 'locked',
      progress: { currentValue: 0, targetValue: 30, ratio: 0 }
    });
    expect(labelOf(node)).toContain('مقفلة');
  });

  it('never reveals a secret badge name before it is unlocked', () => {
    const node = renderBadge({
      id: 4,
      name: 'داعم مبكر',
      state: 'secret',
      isSecret: true,
      progress: { currentValue: 0, targetValue: 1, ratio: 0 }
    });
    expect(labelOf(node)).toBe('شارة سرية');
    expect(node.textContent).not.toContain('داعم مبكر');
  });

  it('opens the detail modal callback when pressed', () => {
    const onOpen = vi.fn();
    const badge: BadgeView = {
      id: 5,
      name: 'علامة كاملة',
      state: 'unlocked',
      unlocked: true,
      progress: { currentValue: 1, targetValue: 1, ratio: 1 }
    };
    const node = renderBadge(badge, { onOpen });
    const button = node.querySelector('button');
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
  });

  it('renders a static image role when not interactive', () => {
    const node = renderBadge({
      id: 6,
      name: 'أول اختبار',
      state: 'unlocked',
      unlocked: true,
      progress: { currentValue: 1, targetValue: 1, ratio: 1 }
    }, { interactive: false });
    expect(node.querySelector('[role="img"]')).not.toBeNull();
    expect(node.querySelector('button')).toBeNull();
  });
});

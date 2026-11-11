import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useAppStore } from '../../store/app';
import { resetViewAids, useViewAids } from './aids';
import { forgetPlans } from './memory';
import { PlayScreen } from './PlayScreen';
import {
  canvasHarness,
  openMap,
  skipMap,
  ROUTE_FULL,
  ROUTE_IMAGE,
  routeProps,
} from './screen.fixture';

// SPEC-play-shell › Amendment 2026-11-02 (b) U2–U5: the one-screen Play HUD. The layout follows
// `(min-width: 900px)`; jsdom has no media queries, so the phone tests stub one.

vi.setConfig({ testTimeout: 30_000 });

function phone() {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  forgetPlans();
  resetViewAids();
  useAppStore.setState(useAppStore.getInitialState());
  useAppStore.setState({ image: ROUTE_IMAGE });
});
afterEach(() => vi.unstubAllGlobals());

const panel = () => screen.getByRole('complementary', { name: 'Play controls' });
const limb = (short: string) => screen.getByRole('button', { name: new RegExp(`^${short}\\b`) });

describe('wide (U2)', () => {
  it('puts the header, COACH, the 2×2 pad, Undo, Redo and the hint row in the side panel', () => {
    render(<PlayScreen {...routeProps()} />);
    skipMap();
    const p = panel();
    expect(within(p).getByRole('region', { name: 'Coach' })).toBeInTheDocument();
    const pad = within(p).getByRole('group', { name: 'Moves' });
    // The pad's order mirrors the body: hands over feet, left on the left.
    expect(
      [...pad.querySelectorAll('.play-limbs .play-limb')].map((b) => b.getAttribute('data-limb')),
    ).toEqual(['lh', 'rh', 'lf', 'rf']);
    expect(within(p).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(within(p).getByRole('button', { name: 'Redo' })).toBeInTheDocument();
    const row = within(p).getByRole('group', { name: 'Hints' });
    for (const name of ['Hold directions', 'Plausible holds', 'Numbers', 'Hints'])
      expect(within(row).getByRole('switch', { name })).toBeInTheDocument();
    // The header stays the page's banner (its own landmark), beside the panel.
    expect(screen.getByRole('banner')).toHaveTextContent('Synthetic wall');
    // The photo is the main content.
    expect(
      within(screen.getByRole('main')).getByRole('region', { name: 'Wall' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hints and tools' })).toBeNull();
  });

  it('opens Numbers in the panel', () => {
    render(
      <PlayScreen {...routeProps({ profile: { level: 'pro', hints: false, numbers: true } })} />,
    );
    skipMap();
    expect(within(panel()).getByRole('region', { name: 'Numbers' })).toBeInTheDocument();
  });
});

describe('phone (U3)', () => {
  it('has a bottom bar with the pad, Undo, Redo and ☰, and the hint row in a closed drawer', () => {
    phone();
    render(<PlayScreen {...routeProps()} />);
    skipMap();
    const bar = panel().querySelector('.play-bar')!;
    expect(within(bar as HTMLElement).getByRole('group', { name: 'Moves' })).toBeInTheDocument();
    expect(within(bar as HTMLElement).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    const toggle = within(bar as HTMLElement).getByRole('button', { name: 'Hints and tools' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Closed, the drawer's switches aren't on screen (nor in the accessibility tree).
    expect(screen.queryByRole('switch', { name: 'Hold directions' })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const drawer = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(within(drawer).getByRole('switch', { name: 'Hold directions' })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'List targets' })).toBeInTheDocument();
  });

  it('shows the COACH as a one-line strip under the photo, expanded by a tap', () => {
    phone();
    render(<PlayScreen {...routeProps()} />);
    const coach = within(screen.getByRole('main')).getByRole('region', { name: 'Coach' });
    expect(coach).toHaveAttribute('data-strip', 'true');
    const fold = within(coach).getByRole('button', { name: 'Show the whole coach line' });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(coach);
    expect(coach).not.toHaveAttribute('data-strip');
    // The verdict's live region is the same either way (U6).
    expect(coach.querySelector('.play-verdict')).toHaveAttribute('aria-live', 'polite');
  });
});

describe('phone: the bar’s room (review suggestions)', () => {
  it('measures the bar into --play-bar-h, so the page keeps it clear (scroll padding)', () => {
    phone();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private cb: ResizeObserverCallback) {}
        observe() {
          this.cb([], this as never);
        }
        disconnect() {}
      },
    );
    const h = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(171);
    const { unmount } = render(<PlayScreen {...routeProps()} />);
    skipMap();
    expect(document.documentElement.style.getPropertyValue('--play-bar-h')).toBe('171px');
    unmount();
    // Gone with the Play screen, so the rest of the app has no bar to keep clear.
    expect(document.documentElement.style.getPropertyValue('--play-bar-h')).toBe('');
    h.mockRestore();
  });

  it('shows no ☰ where the drawer would be empty (the check, opened on a baked level)', () => {
    phone();
    render(<PlayScreen {...routeProps()} />);
    // R7: a baked level starts on the tray, ☰ and all.
    expect(screen.getByRole('button', { name: 'Hints and tools' })).toBeInTheDocument();
    openMap();
    expect(screen.getByRole('region', { name: 'Wall' })).toHaveAttribute('data-map', 'check');
    expect(screen.queryByRole('button', { name: 'Hints and tools' })).toBeNull();
    skipMap();
    expect(screen.getByRole('button', { name: 'Hints and tools' })).toBeInTheDocument();
  });
});

describe('phone: plausible holds (review 6)', () => {
  it('shows and announces the count line with the drawer closed', () => {
    phone();
    useViewAids.setState({ plausible: true });
    render(<PlayScreen {...routeProps()} />);
    skipMap();
    fireEvent.click(limb('LH'));
    expect(screen.getByRole('button', { name: 'Hints and tools' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const line = document.querySelector<HTMLElement>('.play-plausible')!;
    expect(line).not.toBeNull();
    // Not inside the hidden drawer: on screen, and its live region in the accessibility tree.
    expect(line.closest('[hidden]')).toBeNull();
    expect(screen.getByRole('status', { name: '', hidden: false, busy: true })).toBe(line);
    expect(within(line).getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });
});

describe('across the breakpoint (review suggestion)', () => {
  it('keeps the COACH strip expanded when the layout switches and back', () => {
    let matches = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', (q: string) => ({
      get matches() {
        return matches;
      },
      media: q,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    }));
    const flip = (wide: boolean) =>
      act(() => {
        matches = wide;
        listeners.forEach((fn) => fn());
      });
    render(<PlayScreen {...routeProps()} />);
    const coach = () => screen.getByRole('region', { name: 'Coach' });
    expect(coach()).toHaveAttribute('data-strip', 'true');
    fireEvent.click(within(coach()).getByRole('button', { name: 'Show the whole coach line' }));
    expect(coach()).not.toHaveAttribute('data-strip');
    flip(true);
    flip(false);
    // Remounted under the photo again, and still expanded.
    expect(coach()).not.toHaveAttribute('data-strip');
  });
});

describe('the direction check (U4)', () => {
  it('is a banner on the photo; Edit and Start planning work', () => {
    render(<PlayScreen {...routeProps()} />);
    openMap();
    const wall = screen.getByRole('region', { name: 'Wall' });
    const banner = within(wall).getByRole('region', { name: 'Do these directions look right?' });
    fireEvent.click(within(banner).getByRole('button', { name: 'Edit directions' }));
    expect(wall).toHaveAttribute('data-map', 'edit');
    // Edit mode's hold list is in the side panel.
    expect(within(panel()).getByRole('slider', { name: 'Pull of hold 1S' })).toBeInTheDocument();
    // Done is with the hold list in the side panel (wide edit mode, review suggestion).
    fireEvent.click(within(panel()).getByRole('button', { name: 'Done' }));
    expect(wall).toHaveAttribute('data-map', 'closed');
  });

  it('review 7: after Edit directions, focus is never lost to the body, whatever `detail` says', async () => {
    phone();
    // A touch screen reader may activate with detail 1, like a pointer: no keyboard guess.
    for (const detail of [0, 1]) {
      forgetPlans();
      const { unmount } = render(<PlayScreen {...routeProps()} />);
      openMap();
      const edit = screen.getByRole('button', { name: 'Edit directions' });
      edit.focus();
      fireEvent.click(edit, { detail });
      await waitFor(() => expect(document.activeElement).not.toBe(document.body));
      // On a phone it goes to the bar: the edit actions there, by the ☰ with the hold list.
      const at = document.activeElement as HTMLElement;
      expect(at.closest('.play-bar'), `detail ${detail}`).not.toBeNull();
      // The drawer stays shut either way, so the photo's handles stay in view.
      expect(screen.getByRole('button', { name: 'Hints and tools' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      unmount();
    }
  });

  it('review 7: on a wide screen, focus goes to the hold list’s first pull', async () => {
    render(<PlayScreen {...routeProps()} />);
    openMap();
    const edit = screen.getByRole('button', { name: 'Edit directions' });
    edit.focus();
    fireEvent.click(edit, { detail: 1 });
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('slider', { name: 'Pull of hold 1S' })),
    );
  });
});

describe('the banner, compact (review suggestions)', () => {
  it('on a phone, "Pulls not drawn" collapses behind a toggle', () => {
    phone();
    useAppStore.setState({ image: ROUTE_FULL });
    const hz = canvasHarness();
    render(<PlayScreen {...routeProps({ photo: ROUTE_FULL })} />);
    openMap();
    act(() => hz.flush());
    const wall = screen.getByRole('region', { name: 'Wall' });
    const toggle = within(wall).getByRole('button', { name: /^Pulls not drawn/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Pulls not drawn on the photo' })).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole('list', { name: 'Pulls not drawn on the photo' })).toHaveTextContent(
      'Hold 7F: pulls down (180°)',
    );
    vi.restoreAllMocks();
  });

  it('in wide edit mode, Reset all and Done are in the side panel, not over the photo', () => {
    render(<PlayScreen {...routeProps()} />);
    openMap();
    fireEvent.click(screen.getByRole('button', { name: 'Edit directions' }));
    const wall = screen.getByRole('region', { name: 'Wall' });
    expect(within(wall).queryByRole('button', { name: 'Done' })).toBeNull();
    expect(within(panel()).getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('"Check directions" closes the drawer and puts the focus on the banner', async () => {
    for (const layout of ['wide', 'phone'] as const) {
      if (layout === 'phone') phone();
      forgetPlans();
      const { unmount } = render(<PlayScreen {...routeProps()} />);
      skipMap();
      const drawer = screen.queryByRole('button', { name: 'Hints and tools' });
      if (drawer) fireEvent.click(drawer);
      const check = screen.getByRole('button', { name: 'Check directions' });
      check.focus();
      fireEvent.click(check);
      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole('button', { name: 'Edit directions' }),
        ),
      );
      const t = screen.queryByRole('button', { name: 'Hints and tools' });
      if (t) expect(t, layout).toHaveAttribute('aria-expanded', 'false');
      unmount();
    }
  });
});

describe('List targets (U5)', () => {
  it('hides the list until asked, then is the whole keyboard path for a move', () => {
    render(<PlayScreen {...routeProps()} />);
    skipMap();
    fireEvent.click(limb('LH'));
    expect(screen.queryByRole('region', { name: 'Targets for the left hand' })).toBeNull();
    const toggle = screen.getByRole('button', { name: 'List targets' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('region', { name: 'Targets for the left hand' });
    expect(list.id).toBe(toggle.getAttribute('aria-controls'));
    fireEvent.click(within(list).getByRole('button', { name: '3' }));
    expect(screen.getByRole('region', { name: 'Wall' })).toHaveAttribute('data-moves', '1');
    // Still open, with no limb waiting it says how to use it.
    expect(document.getElementById('play-targets')).toHaveTextContent('Pick a limb');
  });
});

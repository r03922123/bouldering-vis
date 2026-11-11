import { fireEvent, render, screen, within } from '@testing-library/react';
import { useAppStore } from '../../store/app';
import { SYNTHETIC } from './synthetic.fixture';
import { forgetPlans } from './memory';
import { keysIgnored, limbForKey, LIMB_KEYS } from './keys';
import { PlayScreen } from './PlayScreen';
import { ROUTE_IMAGE, routeProps, targetsRegion } from './screen.fixture';

// SPEC-play-shell › Amendment 2026-11-02 K1 and acceptance 1: Q/W/A/S and 1–4 pick limbs, Esc
// drops the selection, and a text field or a dialog keeps its keys.

vi.setConfig({ testTimeout: 30_000 });

const key = (code: string, over: Partial<KeyboardEventInit> = {}) => ({ code, key: '', ...over });

describe('limbForKey', () => {
  it('maps the 2×2 block (hands on top, left limbs on the left) and 1–4 to the limbs', () => {
    expect(limbForKey(key('KeyQ'))).toBe('lh');
    expect(limbForKey(key('KeyW'))).toBe('rh');
    expect(limbForKey(key('KeyA'))).toBe('lf');
    expect(limbForKey(key('KeyS'))).toBe('rf');
    expect(['Digit1', 'Digit2', 'Digit3', 'Digit4'].map((c) => limbForKey(key(c)))).toEqual([
      'lh',
      'rh',
      'lf',
      'rf',
    ]);
    expect(limbForKey(key('Numpad3'))).toBe('lf');
    expect(limbForKey(key('Escape', { key: 'Escape' }))).toBe('clear');
  });

  it('leaves other keys, shortcuts with a modifier and key repeats alone', () => {
    expect(limbForKey(key('KeyE'))).toBeNull();
    expect(limbForKey(key('KeyQ', { ctrlKey: true }))).toBeNull();
    expect(limbForKey(key('KeyW', { metaKey: true }))).toBeNull();
    expect(limbForKey(key('KeyA', { altKey: true }))).toBeNull();
    expect(limbForKey(key('KeyS', { repeat: true }))).toBeNull();
  });

  it('names each limb’s keys for its button', () => {
    expect(LIMB_KEYS).toEqual({
      lh: { letter: 'Q', digit: '1' },
      rh: { letter: 'W', digit: '2' },
      lf: { letter: 'A', digit: '3' },
      rf: { letter: 'S', digit: '4' },
    });
  });
});

describe('keysIgnored', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });
  const el = (id: string) => document.getElementById(id);

  it('is true in a text field, a select or an editable element, not on a switch or a button', () => {
    document.body.innerHTML = `
      <input id="text" type="text"><input id="search" type="search"><input id="box" type="checkbox">
      <textarea id="area"></textarea><select id="sel"></select><div id="edit" contenteditable="true"></div>
      <button id="plain">y</button>`;
    for (const id of ['text', 'search', 'area', 'sel', 'edit'])
      expect(keysIgnored(el(id)), id).toBe(true);
    // A switch or a plain button is not a text field: the limb keys still work there.
    expect(keysIgnored(el('box'))).toBe(false);
    expect(keysIgnored(el('plain'))).toBe(false);
    expect(keysIgnored(document.body)).toBe(false);
  });

  it('is true everywhere while a dialog is open: its keys are its own', () => {
    document.body.innerHTML = `<button id="plain">y</button>
      <div role="alertdialog"><button id="in-dialog">x</button></div>`;
    expect(keysIgnored(el('in-dialog'))).toBe(true);
    expect(keysIgnored(el('plain'))).toBe(true);
    expect(keysIgnored(document.body)).toBe(true);
  });
});

describe('PlayScreen: keyboard limbs (K1)', () => {
  beforeEach(() => {
    forgetPlans();
    useAppStore.setState(useAppStore.getInitialState());
    useAppStore.setState({ image: ROUTE_IMAGE });
  });
  const limb = (short: string) => screen.getByRole('button', { name: new RegExp(`^${short}\\b`) });
  const pressed = () =>
    ['LH', 'RH', 'LF', 'RF'].filter((l) => limb(l).getAttribute('aria-pressed') === 'true');
  const startPlanning = () => {
    const start = screen.queryByRole('button', { name: 'Start planning' });
    if (start) fireEvent.click(start);
  };

  it('Q/W/A/S and 1–4 pick limbs, Esc drops the selection (acceptance 1)', () => {
    render(<PlayScreen {...routeProps()} />);
    startPlanning();
    fireEvent.keyDown(document.body, { code: 'KeyQ', key: 'q' });
    expect(pressed()).toEqual(['LH']);
    expect(targetsRegion('Targets for the left hand')).toBeInTheDocument();
    // R0-1 (amendment 2026-11-03): the armed limb pressed again stays armed; another key
    // replaces it, and Shift + key adds a second limb.
    fireEvent.keyDown(document.body, { code: 'KeyQ', key: 'q' });
    expect(pressed()).toEqual(['LH']);
    fireEvent.keyDown(document.body, { code: 'KeyA', key: 'a' });
    expect(pressed()).toEqual(['LF']);
    fireEvent.keyDown(document.body, { code: 'Digit4', key: '$', shiftKey: true });
    expect(pressed()).toEqual(['LF', 'RF']);
    fireEvent.keyDown(document.body, { code: 'Escape', key: 'Escape' });
    expect(pressed()).toEqual([]);
    fireEvent.keyDown(document.body, { code: 'KeyW', key: 'w' });
    fireEvent.keyDown(document.body, { code: 'Digit2', key: '2' });
    expect(pressed()).toEqual(['RH']);
    fireEvent.keyDown(document.body, { code: 'Digit3', key: '3' });
    expect(pressed()).toEqual(['LF']);
  });

  it('a key works from a focused button, as a click on the limb would', () => {
    render(<PlayScreen {...routeProps()} />);
    startPlanning();
    const undo = screen.getByRole('button', { name: 'Undo' });
    undo.focus();
    fireEvent.keyDown(undo, { code: 'KeyS', key: 's' });
    expect(pressed()).toEqual(['RF']);
  });

  it('Esc also clears a fall preview, so the plan shows again', () => {
    render(<PlayScreen {...routeProps()} />);
    startPlanning();
    fireEvent.keyDown(document.body, { code: 'KeyQ', key: 'q' });
    const list = targetsRegion('Targets for the left hand');
    fireEvent.click(list.querySelectorAll('button')[6]!); // 7F, far out of reach
    const stage = screen.getByRole('region', { name: 'Wall' });
    expect(stage).toHaveAttribute('data-preview', 'fall');
    fireEvent.keyDown(document.body, { code: 'Escape', key: 'Escape' });
    expect(stage).not.toHaveAttribute('data-preview');
    expect(pressed()).toEqual([]);
  });

  it('does nothing in Tag, where there is no tray', () => {
    render(<PlayScreen {...routeProps({ level: null, tagReady: true })} />);
    fireEvent.keyDown(document.body, { code: 'KeyQ', key: 'q' });
    expect(screen.getByRole('button', { name: 'Plan this route' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^LH\b/ })).not.toBeInTheDocument();
  });

  it('ignores the keys in a text field and while the edit-route dialog is open', () => {
    render(
      <>
        <input aria-label="Name" />
        <PlayScreen {...routeProps({ level: null, tagReady: true, tagged: SYNTHETIC })} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Plan this route' }));
    startPlanning();
    const field = screen.getByRole('textbox', { name: 'Name' });
    field.focus();
    fireEvent.keyDown(field, { code: 'KeyQ', key: 'q' });
    expect(pressed()).toEqual([]);
    field.blur();
    // One move, then "Edit route" asks first: while its dialog is open, the keys are its own.
    fireEvent.keyDown(document.body, { code: 'KeyQ', key: 'q' });
    const list = targetsRegion('Targets for the left hand');
    fireEvent.click(within(list).getByRole('button', { name: '3' }));
    expect(screen.getByRole('region', { name: 'Wall' })).toHaveAttribute('data-moves', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Edit route' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.keyDown(document.body, { code: 'KeyW', key: 'w' });
    expect(pressed()).toEqual([]);
    fireEvent.keyDown(document.body, { code: 'Escape', key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('shows each limb’s key on its button, and names it as a shortcut', () => {
    render(<PlayScreen {...routeProps()} />);
    startPlanning();
    expect(limb('LH')).toHaveAttribute('aria-keyshortcuts', 'Q 1');
    expect(limb('RF')).toHaveAttribute('aria-keyshortcuts', 'S 4');
    expect(limb('LF').querySelector('kbd')).toHaveTextContent('A');
    // The key is shown, not read twice: the name stays "LF (left foot)".
    expect(limb('LF').getAttribute('aria-label')).toBeNull();
    expect(limb('LF')).toHaveAccessibleName(/^LF ?\(left foot\)$/);
  });
});

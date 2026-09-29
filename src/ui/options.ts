import type { Settings, SettingsStore } from './settings';

/**
 * The Options screen: Picture, Sound and Keys (Touch on a phone), edited on a working copy that the game
 * puts to use at once. Accept keeps it, Cancel goes back to what was kept, Default resets. Built from the
 * tables below, so a new setting is one row here and one field in settings.ts.
 */
export interface OptionsDeps {
  mute: { get(): boolean; toggle(): boolean };
  /** Leave the screen; `reload` when the weather was changed and the world must be built again. */
  leave(reload: boolean): void;
}

type SliderKey = 'brightness' | 'saturation' | 'master' | 'street' | 'bells' | 'steps' | 'music';
type Row =
  | { kind: 'seg'; key: 'weather' | 'mapLook' | 'quality' | 'reflections'; label: string; opts: [string, string][]; note?: string }
  | { kind: 'slider'; key: SliderKey; label: string; peek?: boolean }
  | { kind: 'mute'; label: string }
  | { kind: 'keys'; label: string; keys: string[] }
  | { kind: 'text'; label: string; text: string };
interface Section { title: string; rows: Row[] }
interface Tab { id: string; label: string; sections: Section[] }

const onOff: [string, string][] = [['off', 'Off'], ['on', 'On']];

function tabs(touch: boolean): Tab[] {
  return [
    { id: 'picture', label: 'Picture', sections: [
      { title: 'Scene', rows: [
        { kind: 'seg', key: 'weather', label: 'Weather', opts: [['rain', 'Rain'], ['clear', 'Clear']], note: 'The walk reloads to change the weather.' },
        { kind: 'slider', key: 'brightness', label: 'Brightness', peek: true },
        { kind: 'slider', key: 'saturation', label: 'Saturation', peek: true },
      ] },
      { title: 'Map', rows: [{ kind: 'seg', key: 'mapLook', label: 'Look of the map', opts: [['pastel', 'Pastel'], ['dark', 'Dark'], ['glow', 'Glow']] }] },
      { title: 'Quality', rows: [
        { kind: 'seg', key: 'quality', label: 'Overall', opts: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
        { kind: 'seg', key: 'reflections', label: 'Wet-street reflections', opts: onOff },
      ] },
    ] },
    { id: 'sound', label: 'Sound', sections: [
      { title: 'Volume', rows: [
        { kind: 'slider', key: 'master', label: 'Master' },
        { kind: 'slider', key: 'street', label: 'Street and market' },
        { kind: 'slider', key: 'bells', label: 'Bells' },
        { kind: 'slider', key: 'steps', label: 'Footsteps' },
        { kind: 'slider', key: 'music', label: 'Music' },
      ] },
      { title: 'Mute', rows: [{ kind: 'mute', label: 'All sound' }] },
    ] },
    touch
      ? { id: 'keys', label: 'Touch', sections: [
        { title: 'Walk', rows: [
          { kind: 'text', label: 'Walk', text: 'the ring, bottom left' },
          { kind: 'text', label: 'Jog', text: 'push the ring to its edge' },
          { kind: 'text', label: 'Look', text: 'drag anywhere else' },
          { kind: 'text', label: 'Zoom the view', text: 'pinch' },
        ] },
        { title: 'Screen', rows: [
          { kind: 'text', label: 'Map', text: 'tap the round map' },
          { kind: 'text', label: 'Mute', text: 'the speaker button' },
          { kind: 'text', label: 'Pause', text: 'the pause button' },
        ] },
      ] }
      : { id: 'keys', label: 'Keys', sections: [
        { title: 'Walk', rows: [
          { kind: 'keys', label: 'Walk', keys: ['W', 'A', 'S', 'D'] },
          { kind: 'keys', label: 'Jog', keys: ['Shift'] },
          { kind: 'keys', label: 'Look', keys: ['Mouse'] },
          { kind: 'keys', label: 'Zoom the view', keys: ['Wheel'] },
        ] },
        { title: 'Screen', rows: [
          { kind: 'keys', label: 'Map', keys: ['Tab'] },
          { kind: 'keys', label: 'Mute', keys: ['M'] },
          { kind: 'keys', label: 'Pause', keys: ['Esc'] },
        ] },
      ] },
  ];
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

export interface Options {
  readonly el: HTMLElement;
  /** Shows the first tab and brings every control up to date. */
  open(): void;
  sync(): void;
  /** While a picture slider is held, the panel steps aside so the picture can be judged. */
  onPeek(fn: (on: boolean) => void): void;
}

export function createOptions(store: SettingsStore, deps: OptionsDeps, touch: boolean): Options {
  const root = h('div', 'opt');
  const bar = h('div', 'tabs');
  bar.setAttribute('role', 'tablist');
  const sheet = h('div', 'sheet');
  const foot = h('div', 'foot');
  root.append(bar, sheet, foot);
  let peekFn: (on: boolean) => void = () => {};
  const syncers: (() => void)[] = [];

  const list = tabs(touch);
  const tabBtns: HTMLButtonElement[] = [];
  const panels: HTMLElement[] = [];

  const segValue = (key: Row & { kind: 'seg' }): string => {
    const v = store.current[key.key as keyof Settings];
    return typeof v === 'boolean' ? (v ? 'on' : 'off') : String(v);
  };

  for (const tab of list) {
    const btn = h('button', 'tab', tab.label);
    btn.type = 'button';
    btn.id = `opt-tab-${tab.id}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', `opt-panel-${tab.id}`);
    bar.append(btn);
    tabBtns.push(btn);

    const panel = h('div', 'pane');
    panel.id = `opt-panel-${tab.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', btn.id);
    panel.hidden = true;
    panels.push(panel);
    sheet.append(panel);

    for (const sec of tab.sections) {
      const head = h('h3', 'sec', sec.title);
      panel.append(head);
      for (const r of sec.rows) {
        const row = h('div', `row ${r.kind}`);
        const lab = h('span', 'lab', r.label);
        row.append(lab);
        if (r.kind === 'seg') {
          const g = h('div', 'seg');
          g.setAttribute('role', 'radiogroup');
          g.setAttribute('aria-label', r.label);
          const bs = r.opts.map(([v, t]) => {
            const b = h('button', '', t);
            b.type = 'button';
            b.dataset.v = v;
            b.setAttribute('role', 'radio');
            b.addEventListener('click', () => {
              const val: Settings[typeof r.key] = (r.key === 'reflections' ? v === 'on' : v) as never;
              store.set(r.key, val);
            });
            g.append(b);
            return b;
          });
          row.append(g);
          panel.append(row);
          const note = r.note ? h('p', 'note', r.note) : null;
          if (note) panel.append(note);
          syncers.push(() => {
            const cur = segValue(r);
            for (const b of bs) b.setAttribute('aria-checked', String(b.dataset.v === cur));
            if (note) note.hidden = !(r.key === 'weather' && store.current.weather !== store.running);
          });
        } else if (r.kind === 'slider') {
          const wrap = h('div', 'sl');
          const val = h('span', 'val');
          const input = h('input');
          input.type = 'range';
          input.min = '0'; input.max = '100'; input.step = '1';
          input.setAttribute('aria-label', r.label);
          input.addEventListener('input', () => store.set(r.key, Number(input.value)));
          if (r.peek) {
            const on = () => peekFn(true), off = () => peekFn(false);
            input.addEventListener('pointerdown', on);
            input.addEventListener('pointerup', off);
            input.addEventListener('pointercancel', off);
            input.addEventListener('blur', off);
            input.addEventListener('keydown', on);
            input.addEventListener('keyup', off);
          }
          wrap.append(val, input);
          row.append(wrap);
          panel.append(row);
          syncers.push(() => {
            const v = store.current[r.key];
            input.value = String(v);
            input.setAttribute('aria-valuetext', `${v} of 100`);
            input.style.setProperty('--fill', `${v}%`);
            val.textContent = String(v);
          });
        } else if (r.kind === 'mute') {
          const hint = h('span', 'lab-key', ' (M)');
          lab.append(hint);
          const sw = h('button', 'switch');
          sw.type = 'button';
          sw.setAttribute('role', 'switch');
          sw.setAttribute('aria-label', 'All sound');
          const txt = h('span', 'on', 'On');
          const knob = h('i');
          sw.append(txt, knob);
          sw.addEventListener('click', () => { deps.mute.toggle(); sync(); });
          row.append(sw);
          panel.append(row);
          syncers.push(() => { const on = !deps.mute.get(); sw.setAttribute('aria-checked', String(on)); txt.textContent = on ? 'On' : 'Off'; });
        } else if (r.kind === 'keys') {
          const caps = h('div', 'caps');
          for (const k of r.keys) caps.append(h('kbd', 'cap', k));
          row.append(caps);
          panel.append(row);
        } else {
          row.append(h('span', 'what', r.text));
          panel.append(row);
        }
      }
    }
  }

  const show = (i: number) => {
    list.forEach((_, k) => {
      tabBtns[k].setAttribute('aria-selected', String(k === i));
      tabBtns[k].tabIndex = k === i ? 0 : -1;
      panels[k].hidden = k !== i;
    });
    sheet.scrollTop = 0;
  };
  tabBtns.forEach((b, i) => b.addEventListener('click', () => { show(i); sync(); }));
  bar.addEventListener('keydown', e => {
    const i = tabBtns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0 || (e.code !== 'ArrowRight' && e.code !== 'ArrowLeft')) return;
    const n = (i + (e.code === 'ArrowRight' ? 1 : list.length - 1)) % list.length;
    show(n);
    tabBtns[n].focus();
    e.preventDefault();
  });

  const action = (cls: string, text: string, fn: () => void) => {
    const b = h('button', `abtn ${cls}`, text);
    b.type = 'button';
    b.addEventListener('click', fn);
    foot.append(b);
  };
  action('', 'Default', () => store.reset());
  action('', 'Cancel', () => { store.cancel(); deps.leave(false); });
  action('red', 'Accept', () => deps.leave(store.accept()));

  const sync = () => { for (const f of syncers) f(); };
  store.onChange(sync);
  return {
    el: root,
    open() { show(0); sync(); },
    sync,
    onPeek(fn) { peekFn = fn; },
  };
}

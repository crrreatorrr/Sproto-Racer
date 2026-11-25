import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIONS, createInput, isDrivingKey } from '../src/input.js';
import {
  HUB_GAME_ID, attachFeedbackSdk, createFeedbackHold, feedbackContext, feedbackMode,
  installRaceFeedback, raceBreadcrumbs, raceFeedbackTransport,
} from '../src/feedback.js';

const note = { categories: ['other'], note: 'the spiral', image: '', clientTime: '2026-11-25T00:00:00.000Z', source: 'manual', meta: {} };

function memory() {
  const map = new Map();
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); }, removeItem: (key) => { map.delete(key); } };
}

function snapshot(over = {}) {
  return {
    racing: true, garage: false, modal: '', circuitId: 'track01', circuitName: 'Test Track 01', mode: 'race',
    elapsed: 42.25, lap: 2, sectorName: 'Uphill Drift Spiral', place: 3, rivals: 5,
    driver: 'Sproto', car: 'Apex', x: 12.44, y: 3.06, z: -80.02, speedKmh: 186.2,
    item: 'Soda Turbo', boost: 1, stun: 0, offTrack: false, done: false, countdown: 0, ...over,
  };
}

describe('feedback context', () => {
  it('names the hub game id the server has to register', () => {
    expect(HUB_GAME_ID).toBe('sproto-racer');
  });

  it('reports the circuit, mode, world position and the kart', () => {
    const context = feedbackContext(snapshot());
    expect(context).toMatchObject({
      level: 'track01', mode: 'quick-race', position: { x: 12.4, y: 3.1, z: -80 }, gameTime: 42.25,
      player: { driver: 'Sproto', car: 'Apex', speedKmh: 186, lap: 2, sector: 'Uphill Drift Spiral', place: 3, item: 'Soda Turbo', boost: 1, stunned: false, offTrack: false },
      extra: { circuit: 'Test Track 01', screen: 'race', countdown: false, rivals: 5 },
    });
  });

  it('names the paddock, the garage and every race mode', () => {
    expect(feedbackMode(snapshot({ racing: false }))).toBe('paddock');
    expect(feedbackMode(snapshot({ racing: false, garage: true }))).toBe('garage');
    expect(feedbackContext(snapshot({ racing: false, garage: true }))).toMatchObject({ level: 'track01', mode: 'garage', extra: { screen: 'garage' } });
    expect(feedbackMode(snapshot({ mode: 'trial' }))).toBe('time-trial');
    expect(feedbackMode(snapshot({ mode: 'test', place: null }))).toBe('test-drive');
    expect(feedbackContext(snapshot({ modal: 'pause' })).extra.screen).toBe('pause');
  });

  it('records a lap, a finish, an off-track drop and a stun once each', () => {
    const first = snapshot({ lap: 1 });
    expect(raceBreadcrumbs(null, first)).toEqual([]);
    expect(raceBreadcrumbs(snapshot({ racing: false }), first)).toEqual([]);
    expect(raceBreadcrumbs(first, snapshot({ lap: 2 }))).toEqual([{ type: 'lap', data: { lap: 2 } }]);
    expect(raceBreadcrumbs(first, snapshot({ lap: 1, done: true, place: 1, elapsed: 90.04 }))).toEqual([{ type: 'finish', data: { place: 1, time: 90 } }]);
    expect(raceBreadcrumbs(first, snapshot({ lap: 1, offTrack: true }))).toEqual([{ type: 'off_track' }]);
    expect(raceBreadcrumbs(first, snapshot({ lap: 1, stun: 0.9 }))).toEqual([{ type: 'stunned' }]);
    expect(raceBreadcrumbs(snapshot({ stun: 0.4, offTrack: true, done: true, lap: 2 }), snapshot({ stun: 0.2, offTrack: true, done: true, lap: 2 }))).toEqual([]);
  });
});

describe('feedback transport', () => {
  afterEach(() => {
    attachFeedbackSdk(null);
    delete globalThis.hubSdk;
  });

  it('answers standalone until a hub session exists', async () => {
    const transport = raceFeedbackTransport();
    expect(await transport.access()).toEqual({ ok: false, reason: 'standalone' });
    await expect(transport.submit(note)).rejects.toThrow(/hub session/);
  });

  it('forwards a note through the attached session, or one published on the page', async () => {
    const sent = [];
    const sdk = {
      feedbackAccess: async () => ({ ok: true, username: 'ken' }),
      submitFeedback: async (input) => { sent.push(input); return { id: 'RACER-0007' }; },
    };
    const transport = raceFeedbackTransport();
    expect(await transport.access()).toEqual({ ok: false, reason: 'standalone' });
    attachFeedbackSdk(sdk);
    expect(await transport.access()).toEqual({ ok: true, username: 'ken' });
    expect(await transport.submit(note)).toEqual({ id: 'RACER-0007' });
    expect(sent[0].categories).toEqual(['other']);
    attachFeedbackSdk(null);
    globalThis.hubSdk = sdk;
    expect(await transport.access()).toEqual({ ok: true, username: 'ken' });
  });
});

describe('feedback shortcut', () => {
  let clock = 1000;
  const frames = [];
  const handles = [];
  const inputs = [];

  function queueFrame(fn) {
    frames.push(fn);
    return frames.length;
  }
  function flush() {
    const batch = frames.splice(0, frames.length);
    for (const fn of batch) fn(clock);
  }
  function press(code, target = window) {
    target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, composed: true, cancelable: true }));
  }

  afterEach(() => {
    for (const handle of handles.splice(0)) handle.dispose();
    for (const input of inputs.splice(0)) input.destroy();
    frames.splice(0);
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  function install(over = {}) {
    vi.stubGlobal('requestAnimationFrame', queueFrame);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    window.requestAnimationFrame = queueFrame;
    window.cancelAnimationFrame = () => {};
    const nativeTimeout = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...args) => (ms >= 200 ? 0 : nativeTimeout(fn, ms, ...args));
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const held = [];
    const host = {
      hold: () => { held.push(clock); return { at: clock }; },
      release: () => {},
      snapshot: () => snapshot({ racing: false }),
      canvases: () => [],
      enabled: () => true,
      overlay: false,
      transport: { access: async () => ({ ok: false, reason: 'standalone' }), submit: async () => { throw new Error('Feedback needs a hub session'); } },
      storage: memory(),
      ...over,
    };
    const handle = installRaceFeedback(host);
    handles.push(handle);
    flush();
    return { handle, held, host };
  }

  it('leaves N off the driving keys and off the pad map', () => {
    expect(isDrivingKey('KeyN')).toBe(false);
    expect(isDrivingKey('KeyW')).toBe(true);
    expect(isDrivingKey('Digit1')).toBe(true);
    expect(ACTIONS.map(([name]) => name)).not.toContain('feedback');
  });

  it('opens on N twice within 400 ms and ignores a slower pair', () => {
    const { held } = install();
    press('KeyN');
    flush();
    expect(held).toEqual([]);
    clock += 500;
    press('KeyN');
    flush();
    expect(held).toEqual([]);
    clock += 100;
    press('KeyN');
    clock += 100;
    press('KeyN');
    flush();
    expect(held.length).toBe(1);
    expect(document.querySelector('[data-hub-feedback]')?.shadowRoot?.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('does not open while typing, or while the game turns the shortcut off', () => {
    const typing = install();
    const field = document.createElement('textarea');
    document.body.append(field);
    field.focus();
    press('KeyN', field);
    clock += 50;
    press('KeyN', field);
    flush();
    expect(typing.held).toEqual([]);
    typing.handle.dispose();

    const closed = install({ enabled: () => false });
    press('KeyN');
    clock += 50;
    press('KeyN');
    flush();
    expect(closed.held).toEqual([]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('holds the pad so a button pressed underneath is not a fresh action when the window closes', () => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[0] = { pressed: true, value: 1 };
    const pad = { index: 0, connected: true, id: 'Test Pad', mapping: 'standard', buttons, axes: [0, 0, 0, 0] };
    vi.stubGlobal('navigator', { ...navigator, getGamepads: () => [pad] });
    const input = createInput();
    inputs.push(input);
    expect(input.poll().throttle).toBe(1);
    const hold = createFeedbackHold(input);
    const token = hold.hold();
    expect(hold.held()).toBe(true);
    expect(input.poll().throttle).toBe(0);
    buttons[1] = { pressed: true, value: 1 };
    hold.release({ at: -1 });
    expect(hold.held()).toBe(true);
    hold.release(token);
    expect(hold.held()).toBe(false);
    const after = input.poll();
    expect(after.throttle).toBe(1);
    expect(after.itemPressed).toBe(false);
  });

  it('keeps test-item number keys from firing while the window is open', () => {
    const input = createInput();
    inputs.push(input);
    const hold = createFeedbackHold(input);
    install({
      hold: () => hold.hold(),
      release: (token) => hold.release(token),
    });
    press('KeyN');
    clock += 40;
    press('KeyN');
    flush();
    expect(hold.held()).toBe(true);
    press('Digit1');
    press('KeyW');
    expect(input.poll().slot).toBeNull();
    expect(input.poll().throttle).toBe(0);
  });
});

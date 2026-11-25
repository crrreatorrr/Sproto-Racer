/**
 * In-game feedback. Press N twice: the hub SDK opens the same window the other Sproto games use
 * (options, a note, a screenshot from just before the window). This file is Racer's adapter:
 * what "right now" means on a lap, the paddock colours, and the hub session to send through.
 * The window, the shortcut and the transport live in `@metaverse/hub-sdk/feedback`
 * (metaverse-hub docs/feedback.md). Nothing here steps the driving simulation.
 *
 * Keyboard follows that SDK: N twice within 400 ms, ignored while a text field is focused, and
 * the game never sees N. The pad does not open the window and does not drive it. Open World is
 * the same (owner's call). Racer has no spare pad button: face buttons, sticks, Menu, View and
 * the bumpers are already drive or menu controls. While the window is open the race is held and
 * `input.block` latches the pad, so a held accelerator cannot steer or confirm a menu underneath.
 */
import { feedbackTransportFromSdk, installFeedback } from '@metaverse/hub-sdk/feedback';

/** Nakama game id. The hub must register this before a visit can store a note. */
export const HUB_GAME_ID = 'sproto-racer';
export const FEEDBACK_TITLE = 'Sproto Racing';
/** package.json version. The hub note stores it as the build. */
export const BUILD_ID = '1.0.0';

const round1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);

/** `quick-race`, `time-trial`, `test-drive`, `garage` or `paddock`. */
export function feedbackMode(snapshot) {
  if (!snapshot?.racing) return snapshot?.garage ? 'garage' : 'paddock';
  if (snapshot.mode === 'trial') return 'time-trial';
  if (snapshot.mode === 'test') return 'test-drive';
  return 'quick-race';
}

/** Shape a plain snapshot into the SDK's context. Pure, so it is tested without a browser. */
export function feedbackContext(snapshot) {
  const mode = feedbackMode(snapshot);
  const circuit = snapshot?.circuitName || '';
  const circuitId = snapshot?.circuitId || '';
  if (!snapshot?.racing) {
    return {
      level: circuitId,
      mode,
      extra: {
        circuit,
        screen: snapshot?.garage ? 'garage' : 'paddock',
        ...(snapshot?.modal ? { modal: snapshot.modal } : {}),
      },
    };
  }
  return {
    level: circuitId,
    mode,
    position: { x: round1(snapshot.x), y: round1(snapshot.y), z: round1(snapshot.z) },
    gameTime: Number.isFinite(snapshot.elapsed) ? snapshot.elapsed : 0,
    player: {
      driver: snapshot.driver || '',
      car: snapshot.car || '',
      speedKmh: Math.round(Number.isFinite(snapshot.speedKmh) ? snapshot.speedKmh : 0),
      lap: snapshot.lap ?? 1,
      sector: snapshot.sectorName || '',
      ...(snapshot.place == null ? {} : { place: snapshot.place }),
      item: snapshot.item || '',
      boost: snapshot.boost || 0,
      stunned: (snapshot.stun ?? 0) > 0,
      offTrack: !!snapshot.offTrack,
    },
    extra: {
      circuit,
      screen: snapshot.modal || 'race',
      countdown: (snapshot.countdown ?? 0) > 0,
      rivals: snapshot.rivals ?? 0,
    },
  };
}

/**
 * Sim events worth a breadcrumb (the SDK keeps the last 24). `prev` is the previous racing
 * snapshot; the first frame of a run, and anything off the track clock, adds nothing.
 */
export function raceBreadcrumbs(prev, next) {
  if (!next?.racing || !prev?.racing) return [];
  const out = [];
  if ((next.lap ?? 1) > (prev.lap ?? 1)) out.push({ type: 'lap', data: { lap: next.lap } });
  if (!prev.done && next.done) out.push({ type: 'finish', data: { place: next.place ?? null, time: round1(next.elapsed) } });
  if (!prev.offTrack && next.offTrack) out.push({ type: 'off_track' });
  if ((prev.stun ?? 0) <= 0 && (next.stun ?? 0) > 0) out.push({ type: 'stunned' });
  return out;
}

// Paddock colours from src/style.css (--paper, --lime, --bg, the pause panel).
export const FEEDBACK_THEME = Object.freeze({
  font: '"Barlow Condensed", "Arial Narrow", sans-serif',
  titleFont: '"Barlow Condensed", "Arial Narrow", sans-serif',
  background: '#0c171ac7',
  panel: '#182326',
  text: '#f4f2e8',
  muted: '#a7b2b1',
  accent: '#d5ee7a',
  accentText: '#19211c',
  border: '#64736a',
  radius: '2px',
  css: `
.panel { box-shadow: 0 20px 70px #0007; }
.title { font-style: italic; font-weight: 800; letter-spacing: -0.03em; font-size: 28px; color: #d5ee7a; }
.btn.primary { font-weight: 800; letter-spacing: 0.04em; }
.chip, .btn, .mini { border-radius: 2px; }`,
});

let assignedSdk = undefined;

/**
 * Hand the page's hub session to the feedback window. The login flow calls this once the SDK
 * exists. Until then, and whenever it is cleared, `globalThis.hubSdk` is used if something else
 * published the session there. With neither, the window says to play from the hub while signed in.
 */
export function attachFeedbackSdk(sdk) {
  assignedSdk = sdk ?? null;
}

export function resolveFeedbackSdk() {
  if (assignedSdk) return assignedSdk;
  const published = globalThis.hubSdk;
  return published ?? null;
}

/**
 * Standalone play answers `standalone`. The session is read on each call, so a hub login that
 * arrives after the window was installed is used. `feedback.can` / `feedback.submit` are forwarded.
 */
export function raceFeedbackTransport() {
  return {
    async access() {
      const sdk = resolveFeedbackSdk();
      if (!sdk?.feedbackAccess) return { ok: false, reason: 'standalone' };
      return feedbackTransportFromSdk(sdk).access();
    },
    async submit(input) {
      const sdk = resolveFeedbackSdk();
      if (!sdk?.submitFeedback) throw Object.assign(new Error('Feedback needs a hub session'), { code: 'standalone' });
      return feedbackTransportFromSdk(sdk).submit(input);
    },
  };
}

/**
 * Freeze driving input across the window. `hold` may be called twice (screenshot, then the
 * window); both return the same token. `release` ignores a token that is not the current hold,
 * so a late close cannot drop a newer one. Audio is paused for the hold and left for the race
 * loop to bring back.
 */
export function createFeedbackHold(input, hooks = {}) {
  let token = null;
  return {
    held: () => token !== null,
    hold() {
      if (token) return token;
      input.block(true);
      hooks.pauseAudio?.();
      token = { at: typeof performance !== 'undefined' ? performance.now() : 0 };
      return token;
    },
    release(value) {
      if (!token || value !== token) return;
      token = null;
      input.block(false);
    },
  };
}

/**
 * Install the N-N shortcut and window. `enabled` should be false while Controller setup is
 * capturing a button, so N can be read there and the window does not cover the remapper.
 * Returns the SDK handle (open, close, isOpen, breadcrumb, dispose).
 */
export function installRaceFeedback(host) {
  let token = null;
  return installFeedback({
    title: FEEDBACK_TITLE,
    version: host.version || BUILD_ID,
    transport: host.transport ?? raceFeedbackTransport(),
    beforeCapture() {
      token = host.hold();
      host.renderNow?.();
    },
    pause: () => token,
    resume(value) {
      host.release(value);
      token = null;
    },
    context: () => feedbackContext(host.snapshot()),
    canvases: () => host.canvases?.() ?? [],
    enabled: () => (host.enabled ? host.enabled() !== false : true),
    theme: FEEDBACK_THEME,
    storage: host.storage,
    // Omitted in the game, so the SDK draws the page's HTML over the canvas. Tests pass `false`.
    ...(host.overlay === undefined ? {} : { overlay: host.overlay }),
  });
}

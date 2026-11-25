import assert from 'node:assert/strict';
import { createHubSdk, GAME_IDS, memoryKeyValue, mintMockTicket } from '@metaverse/hub-sdk/core';

const tests = [];
const describe = (_name, fn) => fn();
const it = (name, fn) => tests.push([name, fn]);
import { HUB_GAME_ID } from '../src/hub/config.js';
import { readFileSync } from 'node:fs';
import { createHubPortal, HUB_PORTAL_POSITION } from '../src/hub/portal-mesh.js';
import {
  controlRole, createReturn, hubConfirmCopy, hubExitUrl, leaveForHub, lobbyPadAction,
  menuKeyAction, modalPadAction, nakamaServerKey, padEdges, trustedHubUrl,
} from '../src/hub/portal.js';

describe('hub page', () => {
  it('keeps a same-origin path and refuses a token or a plain http host', () => {
    assert.equal(trustedHubUrl(undefined), '/hub/');
    assert.equal(trustedHubUrl('/hub'), '/hub/');
    assert.equal(trustedHubUrl('https://hub.example.com/hub/#x'), 'https://hub.example.com/hub/');
    assert.equal(trustedHubUrl('http://127.0.0.1:5173/hub/'), 'http://127.0.0.1:5173/hub/');
    assert.equal(trustedHubUrl('http://localhost:5173/hub/', { dev: true }), 'http://localhost:5173/hub/');
    assert.throws(() => trustedHubUrl('http://evil.example.com/hub/'), /hub_origin/);
    assert.throws(() => trustedHubUrl('//evil.example.com/'), /hub_url/);
    assert.throws(() => trustedHubUrl('/hub/../secret'), /hub_url/);
    assert.throws(() => trustedHubUrl('https://hub.example.com/?t=abc'), /hub_url_token/);
  });

  it('returns to this game’s ring', () => {
    assert.equal(HUB_GAME_ID, 'sproto-racer');
    assert.equal(hubExitUrl('/hub/'), '/hub/#from=sproto-racer');
    assert.equal(hubExitUrl('https://hub.example.com/hub/'), 'https://hub.example.com/hub/#from=sproto-racer');
  });

  it('uses the dev server key on loopback and refuses a blank production host', () => {
    assert.equal(nakamaServerKey({ dev: true }), 'defaultkey');
    assert.equal(nakamaServerKey({ hostname: '127.0.0.1' }), 'defaultkey');
    assert.equal(nakamaServerKey({ envKey: 'pages-key', hostname: 'play.example' }), 'pages-key');
    assert.equal(nakamaServerKey({ hostname: 'play.example' }), '');
  });
});

describe('leaving for the hub', () => {
  it('closes a live session for this game through the SDK', () => {
    const reasons = [];
    const result = leaveForHub({
      api: {
        getSession: () => ({ game: 'sproto-racer', playerId: 'p1' }),
        exit(reason) { reasons.push(reason); },
      },
      navigate() { throw new Error('the SDK navigates'); },
      page: '/hub/',
    });
    assert.equal(result.via, 'sdk');
    assert.deepEqual(reasons, ['return']);
  });

  it('still leaves when there is no session', () => {
    const urls = [];
    const result = leaveForHub({
      api: { getSession: () => null, exit() { throw new Error('no session'); } },
      navigate: (url) => urls.push(url),
      page: '/hub/',
    });
    assert.equal(result.via, 'page');
    assert.deepEqual(urls, ['/hub/#from=sproto-racer']);
  });

  it('does not exit a different game’s session', async () => {
    // hub-sdk 0.10.0 has no sproto-racer id. A session for another game must not
    // be closed with exit, because that would return the player to that ring.
    assert.equal(GAME_IDS.includes('sproto-racer'), false);
    assert.equal(GAME_IDS.includes('sproto-open-world'), true);
    const assign = [];
    let hash = '';
    const now = 1_700_000_000_000;
    const sdk = createHubSdk({
      useMock: true,
      hubUrl: '/hub/',
      local: memoryKeyValue(),
      session: memoryKeyValue(),
      assign: (url) => assign.push(url),
      readHash: () => hash,
      writeHash: (value) => { hash = value; },
      now: () => now,
    });
    hash = `#t=${await mintMockTicket({ game: 'sproto-open-world', playerId: 'p1', now })}`;
    await sdk.init('sproto-open-world');
    const urls = [];
    const result = leaveForHub({ api: sdk, navigate: (url) => urls.push(url), page: 'https://hub.example/hub/' });
    assert.equal(result.via, 'page');
    assert.deepEqual(urls, ['https://hub.example/hub/#from=sproto-racer']);
    assert.deepEqual(assign, []);
    assert.equal(sdk.getSession().game, 'sproto-open-world');
  });

  it('uses the SDK exit format for a game the hub already lists', async () => {
    const assign = [];
    let hash = '';
    const now = 1_700_000_000_000;
    const sdk = createHubSdk({
      useMock: true,
      hubUrl: '/hub/',
      local: memoryKeyValue(),
      session: memoryKeyValue(),
      assign: (url) => assign.push(url),
      readHash: () => hash,
      writeHash: (value) => { hash = value; },
      now: () => now,
    });
    hash = `#t=${await mintMockTicket({ game: 'nobu', playerId: 'p1', now })}`;
    await sdk.init('nobu');
    sdk.exit('return');
    assert.deepEqual(assign, ['/hub/#from=nobu']);
    assert.equal(sdk.getSession(), null);
  });

  it('ignores a second press', () => {
    const urls = [];
    const leave = createReturn(() => ({ api: null, navigate: (url) => urls.push(url), page: '/hub/' }));
    assert.equal(leave().via, 'page');
    assert.equal(leave().via, 'again');
    assert.deepEqual(urls, ['/hub/#from=sproto-racer']);
  });
});

describe('keyboard and gamepad', () => {
  const edges = (on) => [false, false, false, false, false, false, false].map((_, i) => on.includes(i));

  it('reads the pad the paddock already uses', () => {
    const pad = {
      buttons: { 0: { pressed: true }, 9: { pressed: true }, 12: { pressed: false } },
      axes: [0, -0.8],
    };
    assert.deepEqual(padEdges(pad), [true, false, true, false, false, false, true]);
  });

  it('moves to the portal and enters it with A or Menu', () => {
    const count = 5;
    const portal = 3;
    assert.equal(lobbyPadAction({ edges: edges([3]), index: 2, count, role: 'launch' }).index, portal);
    assert.equal(lobbyPadAction({ edges: edges([0]), index: portal, count, role: 'portal' }).type, 'portal');
    assert.equal(lobbyPadAction({ edges: edges([6]), index: portal, count, role: 'portal' }).type, 'portal');
    assert.equal(lobbyPadAction({ edges: edges([6]), index: 2, count, role: 'launch' }).type, 'launch');
    assert.equal(lobbyPadAction({ edges: edges([0]), index: 0, count, role: 'track' }).type, 'click');
    assert.equal(lobbyPadAction({ edges: edges([6]), index: 4, count, role: 'controls' }).type, 'controller');
  });

  it('asks before leaving a race, and the pad can stay or go', () => {
    const copy = hubConfirmCopy();
    assert.equal(copy.stay, 'KEEP RACING');
    assert.equal(copy.leave, 'RETURN TO HUB');
    assert.equal(modalPadAction({ modal: 'hub-exit', edges: edges([0]), index: 0, count: 2, tagName: 'BUTTON' }).type, 'click');
    assert.equal(modalPadAction({ modal: 'hub-exit', edges: edges([3]), index: 0, count: 2, tagName: 'BUTTON' }).index, 1);
    assert.equal(modalPadAction({ modal: 'hub-exit', edges: edges([1]), index: 1, count: 2, tagName: 'BUTTON' }).type, 'back-to-pause');
    assert.equal(modalPadAction({ modal: 'hub-exit', edges: edges([6]), index: 1, count: 2, tagName: 'BUTTON' }).type, 'back-to-pause');
    assert.equal(modalPadAction({ modal: 'pause', edges: edges([6]), index: 0, count: 4, tagName: 'BUTTON' }).type, 'close');
    assert.equal(modalPadAction({ modal: 'finish', edges: edges([1]), index: 0, count: 3, tagName: 'BUTTON' }).type, 'home');
  });

  it('Escape steps back, and Enter on the portal button is the button’s own click', () => {
    assert.equal(menuKeyAction({ modal: 'hub-exit', code: 'Escape', activeRole: 'button' }).type, 'back-to-pause');
    assert.equal(menuKeyAction({ modal: 'pause', code: 'Escape', activeRole: 'button' }).type, 'close');
    assert.equal(menuKeyAction({ modal: 'finish', code: 'Escape', activeRole: 'button' }).type, 'home');
    assert.equal(menuKeyAction({ modal: '', code: 'Enter', activeRole: 'body' }).type, 'launch');
    assert.equal(menuKeyAction({ modal: '', code: 'Enter', activeRole: 'portal' }).type, 'none');
    assert.equal(controlRole({ dataset: { role: 'portal' } }), 'portal');
    assert.equal(controlRole({ dataset: { track: 'ridge' } }), 'track');
  });
});

describe('paddock ring', () => {
  it('builds a named portal and keeps it inside the hero frame', () => {
    const portal = createHubPortal();
    assert.equal(portal.name, 'hub-portal');
    assert.ok(portal.getObjectByName('hub-portal-ring'));
    assert.ok(portal.getObjectByName('hub-portal-disc'));
    const paddock = readFileSync(new URL('../src/paddock.js', import.meta.url), 'utf8');
    assert.match(paddock, /createHubPortal\(\)/);
    assert.match(paddock, /hubPortal\.visible=!garage/);
    assert.ok(Math.hypot(HUB_PORTAL_POSITION.x, HUB_PORTAL_POSITION.z) > 1.5);
    assert.equal(portal.position.x, HUB_PORTAL_POSITION.x);
    assert.equal(portal.position.z, HUB_PORTAL_POSITION.z);
  });
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok ${name}`);
    console.error(err);
  }
}
if (failed) {
  process.exitCode = 1;
  throw new Error(`${failed} hub portal test${failed === 1 ? '' : 's'} failed`);
}

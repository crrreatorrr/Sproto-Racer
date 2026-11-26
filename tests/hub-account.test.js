import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHubSdk, GAME_IDS, isGameId, memoryKeyValue } from '@metaverse/hub-sdk/core';
import { chipFrom, hubChipText, paintAccount } from '../src/hub/account.js';
import { HUB_GAME_ID, TRIAL_LAYOUT } from '../src/hub/config.js';
import { bootHub } from '../src/hub/boot.js';
import {
  errorCode, hubExitUrl, startHub, trustedHubUrl, usernameFromToken,
} from '../src/hub/link.js';
import {
  acceptTrial, betterTrial, cloudBytes, createRecordBook, mergeRecords, normalizeRecords,
  noteTrial, recordsCloudBody, recordsFromCloud, SAVE_MAX_BYTES,
} from '../src/hub/records.js';
import { nakamaServerKey } from '../src/hub/serverKey.js';
import { createSession } from '../src/session.js';

const jwt = (claims) => `h.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.s`;

function memory() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    keys: () => [...map.keys()],
  };
}

function trial(time, extra = {}) {
  return { time, length: 100, car: 'apex', driver: 'sproto', layout: TRIAL_LAYOUT, ...extra };
}

function frames(n = 2) {
  return Array.from({ length: n }, (_, i) => [i + 1, i, 0, 0, 0, 0]);
}

function api(session, init = async () => ({})) {
  const cloud = { data: null };
  const client = {
    cloud,
    init,
    exit(reason) {
      client.exit.reason = reason;
      client.exit.called = true;
    },
    getSession: () => session,
    loadSave: async () => ({ data: cloud.data, updatedAt: cloud.data ? 1 : 0 }),
    writeSave: async (data, opts) => {
      cloud.data = data;
      cloud.opts = opts;
      return { data, updatedAt: 1 };
    },
  };
  return client;
}

function sessionFor(over = {}) {
  return {
    token: jwt({ usn: 'ken' }),
    playerId: 'player-1',
    game: HUB_GAME_ID,
    ranked: false,
    expiresAt: 0,
    ...over,
  };
}

describe('hub login', () => {
  it('asks for sproto-racer, which this SDK lists', () => {
    assert.equal(HUB_GAME_ID, 'sproto-racer');
    assert.equal(isGameId(HUB_GAME_ID), true);
    assert.equal(GAME_IDS.includes(HUB_GAME_ID), true);
    assert.equal(GAME_IDS.at(-1), 'sproto-racer');
  });

  it('init accepts sproto-racer and stays standalone when there is no ticket', async () => {
    const sdk = createHubSdk({
      serverUrl: 'http://127.0.0.1:9',
      serverKey: 'defaultkey',
      hubUrl: '/hub/',
      local: memoryKeyValue(),
      session: memoryKeyValue(),
      readHash: () => '',
      writeHash: () => {},
      assign: () => {},
    });
    const profile = await sdk.init(HUB_GAME_ID);
    assert.notEqual(errorCode(profile), 'bad_game');
    assert.equal(sdk.getSession(), null);
    assert.equal(typeof profile.playerId, 'string');
  });

  it('without an SDK, a portal visit says bad_game and standalone play stays offline', async () => {
    const blocked = await startHub({ api: null, starting: true }).ready;
    assert.equal(blocked.status, 'error');
    assert.equal(blocked.code, 'bad_game');
    assert.equal(blocked.bankable, false);

    const solo = await startHub({ api: null, starting: false }).ready;
    assert.equal(solo.status, 'offline');
    assert.equal(solo.bankable, false);
  });

  it('a signed-in visit shows that hub username, and a blank name is a guest', async () => {
    const link = await startHub({ api: api(sessionFor()), starting: true }).ready;
    assert.equal(link.status, 'connected');
    assert.equal(link.bankable, true);
    assert.equal(link.playerId, 'player-1');
    assert.equal(link.accountLabel, 'ken');

    const guest = await startHub({ api: api(sessionFor({ token: jwt({}) })), starting: true }).ready;
    assert.equal(guest.status, 'guest');
    assert.equal(guest.accountLabel, 'Guest');
    assert.equal(guest.bankable, true);
  });

  it('a failed redeem, an expired session, or another game stays out of this account', async () => {
    const bad = await startHub({
      api: api(null, async () => { throw Object.assign(new Error('ticket_used'), { code: 'ticket_used' }); }),
      starting: true,
    }).ready;
    assert.equal(bad.status, 'error');
    assert.equal(bad.code, 'ticket_used');

    const expired = await startHub({
      api: api(sessionFor({ expiresAt: 5 })),
      starting: true,
      now: () => 10,
    }).ready;
    assert.equal(expired.code, 'session_expired');

    const other = await startHub({ api: api(sessionFor({ game: 'sproto-fighter' })), starting: true }).ready;
    assert.equal(other.status, 'offline');
  });

  it('reads the display name from the token', () => {
    assert.equal(usernameFromToken(jwt({ usn: ' ken ' })), 'ken');
    assert.equal(usernameFromToken(jwt({})), '');
    assert.equal(usernameFromToken('nope'), '');
    assert.equal(usernameFromToken(undefined), '');
  });

  it('checks the hub page the way the other games do', () => {
    assert.equal(trustedHubUrl(undefined), '/hub/');
    assert.equal(trustedHubUrl('/hub'), '/hub/');
    assert.equal(trustedHubUrl('https://hub.example.com/hub/#x'), 'https://hub.example.com/hub/');
    assert.equal(trustedHubUrl('http://127.0.0.1:5173/hub/'), 'http://127.0.0.1:5173/hub/');
    assert.throws(() => trustedHubUrl('http://evil.example.com/hub/'), /hub_origin/);
    assert.throws(() => trustedHubUrl('//evil.example.com/'), /hub_url/);
    assert.throws(() => trustedHubUrl('https://hub.example.com/?t=abc'), /hub_url_token/);
    assert.equal(hubExitUrl('https://hub.example.com/hub/'), 'https://hub.example.com/hub/#from=sproto-racer');
  });

  it('uses the stock server key only for dev and loopback', () => {
    assert.equal(nakamaServerKey({ envKey: 'shipped' }), 'shipped');
    assert.equal(nakamaServerKey({ dev: true }), 'defaultkey');
    assert.equal(nakamaServerKey({ hostname: '127.0.0.1' }), 'defaultkey');
    assert.equal(nakamaServerKey({ hostname: 'play.example.com' }), '');
  });

  it('Return to hub closes a live session through the SDK and still leaves standalone', async () => {
    const live = api(sessionFor());
    const navigate = (url) => { navigate.url = url; };
    const link = await startHub({ api: live, starting: true, navigate }).ready;
    link.exitToHub();
    assert.equal(live.exit.called, true);
    assert.equal(live.exit.reason, 'return');
    assert.equal(navigate.url, undefined);

    const away = (url) => { away.url = url; };
    const solo = await startHub({ api: null, starting: false, navigate: away }).ready;
    solo.exitToHub();
    assert.equal(away.url, '/hub/#from=sproto-racer');
  });
});

describe('the account chip', () => {
  const chip = (over) => ({ status: 'connected', label: 'ken', error: '', owner: 'account', sync: 'synced', ...over });

  it('says who is signed in and where the times live', () => {
    assert.equal(hubChipText(chip({})), 'ken · times in the cloud');
    assert.equal(hubChipText(chip({ status: 'guest', label: 'Guest', sync: 'syncing' })), 'Guest · syncing your times…');
    assert.equal(hubChipText(chip({ status: 'offline', label: '', owner: 'device', sync: 'local' })), 'Not signed in · saves on this browser');
    assert.equal(hubChipText(chip({ status: 'connecting', owner: 'pending' })), 'Signing in to the hub…');
    assert.equal(hubChipText(chip({ status: 'error', error: 'bad_game', owner: 'device', sync: 'local' })), 'Hub: bad_game · saves on this browser');
  });

  it('paints the paddock chip and hides the race chip until an account is signed in', () => {
    const paddock = { textContent: '', dataset: {} };
    const race = { textContent: '', dataset: {}, hidden: false, hasAttribute: (name) => name === 'data-hub-race' };
    paintAccount(paddock, chip({ status: 'offline', label: '', owner: 'device', sync: 'local' }));
    paintAccount(race, chip({ status: 'offline', label: '', owner: 'device', sync: 'local' }));
    assert.equal(paddock.dataset.hub, 'offline');
    assert.equal(race.hidden, true);
    paintAccount(race, chip({}));
    assert.equal(race.hidden, false);
    assert.equal(race.textContent, 'ken · times in the cloud');
  });
});

describe('time-trial records', () => {
  it('keeps the faster time, and a ghost when the times are equal', () => {
    const slow = trial(20, { frames: frames() });
    const fast = trial(12);
    assert.equal(betterTrial(slow, fast).time, 12);
    assert.equal(betterTrial(fast, slow).time, 12);
    const tied = betterTrial(trial(12, { frames: frames() }), trial(12));
    assert.equal(tied.frames.length, 2);
    const merged = mergeRecords(
      normalizeRecords({ trials: { track01: slow, track02: trial(8) } }),
      normalizeRecords({ trials: { track01: fast, track03: trial(9) } }),
    );
    assert.equal(merged.trials.track01.time, 12);
    assert.equal(merged.trials.track02.time, 8);
    assert.equal(merged.trials.track03.time, 9);
  });

  it('puts times in the cloud and leaves ghost frames on this browser', () => {
    const ghost = frames(8000);
    const local = normalizeRecords({ trials: { track01: trial(15.5, { frames: ghost }), track02: trial(40, { car: 'shopping-cart', driver: 'pip' }) } });
    const body = recordsCloudBody(local);
    assert.equal(JSON.stringify(body).includes('frames'), false);
    assert.ok(cloudBytes(body) < SAVE_MAX_BYTES);
    const round = recordsFromCloud(body);
    assert.equal(round.trials.track01.time, 15.5);
    assert.equal(round.trials.track01.frames, undefined);
    const kept = mergeRecords(local, round);
    assert.equal(kept.trials.track01.frames.length, 8000);
    const faster = recordsFromCloud({ v: 1, trials: { track01: { t: 14000, len: 100, car: 'apex', driver: 'sproto', lay: TRIAL_LAYOUT } } });
    const won = mergeRecords(local, faster);
    assert.equal(won.trials.track01.time, 14);
    assert.equal(won.trials.track01.frames, undefined);
  });

  it('keeps an account\'s times apart from this browser and from another account', async () => {
    const storage = memory();
    storage.setItem('sproto.track01.ghost.v1', JSON.stringify(trial(50, { frames: frames() })));
    const book = createRecordBook({ storage, pushDelayMs: 1 });
    assert.equal(book.get('track01').time, 50);
    assert.equal(book.owner(), 'device');

    book.hold();
    assert.equal(book.owner(), 'pending');
    assert.equal(book.get('track01'), null);
    noteTrial(book, 'track01', null, trial(18, { frames: frames(3) }));
    assert.equal(book.get('track01').time, 18);

    const cloud = api(null);
    const link = { bankable: true, playerId: 'player-a', api: cloud, noteSessionError() {} };
    await book.follow(link);
    assert.equal(book.owner(), 'account');
    assert.equal(book.get('track01').time, 18);
    assert.equal(cloud.cloud.data.trials.track01.t, 18000);
    assert.equal(JSON.parse(storage.getItem('sproto.track01.ghost.v1')).time, 50);
    assert.equal(storage.getItem('sproto.racer.progress@player-a').includes('"frames"'), true);
    assert.equal(JSON.stringify(cloud.cloud.data).includes('frames'), false);

    const other = api(null);
    other.cloud.data = { v: 1, trials: { track01: { t: 11000, len: 100, car: 'needle', driver: 'rook', lay: TRIAL_LAYOUT } } };
    await book.follow({ bankable: true, playerId: 'player-b', api: other, noteSessionError() {} });
    assert.equal(book.get('track01').time, 11);
    assert.equal(book.get('track01').car, 'needle');
    assert.equal(JSON.parse(storage.getItem('sproto.racer.progress@player-a')).trials.track01.time, 18);
  });

  it('a slower run does not replace the record, and an equal run can add the ghost', () => {
    const storage = memory();
    const book = createRecordBook({ storage });
    noteTrial(book, 'track01', null, trial(10));
    const kept = noteTrial(book, 'track01', book.get('track01'), trial(12, { frames: frames() }));
    assert.equal(kept.time, 10);
    assert.equal(kept.frames, undefined);
    const withGhost = noteTrial(book, 'track01', kept, trial(10, { frames: frames() }));
    assert.equal(withGhost.time, 10);
    assert.equal(withGhost.frames.length, 2);
  });

  it('drops a broken ghost and still keeps the time', () => {
    const trialWith = acceptTrial({ time: 9, length: 100, car: 'apex', driver: 'sproto', layout: TRIAL_LAYOUT, frames: [[1, 0, 0, 0, 0], [1, 1, 0, 0, 0]] }, 100);
    assert.equal(trialWith.frames, undefined);
    assert.equal(trialWith.time, 9);
    assert.equal(acceptTrial(trialWith, 101), null);
  });

  it('drops records set on an older circuit layout, on this browser, an account and the cloud', async () => {
    const old = (time) => ({ time, length: 100, car: 'apex', driver: 'sproto', frames: frames() });
    const storage = memory();
    storage.setItem('sproto.track01.ghost.v1', JSON.stringify(old(9)));
    storage.setItem('sproto.racer.progress', JSON.stringify({ trials: { track02: old(8) } }));
    storage.setItem('sproto.racer.progress@player-a', JSON.stringify({ trials: { track03: old(7) } }));
    const book = createRecordBook({ storage, pushDelayMs: 1 });
    assert.equal(book.get('track01'), null);
    assert.equal(book.get('track02'), null);
    assert.equal(acceptTrial(old(9), 100), null);
    assert.deepEqual(Object.keys(recordsFromCloud({ v: 1, trials: { track01: { t: 5000, len: 100, car: 'apex', driver: 'sproto' } } }).trials), []);

    const cloud = api(null);
    cloud.cloud.data = { v: 1, trials: { track01: { t: 5000, len: 100, car: 'apex', driver: 'sproto' } } };
    await book.follow({ bankable: true, playerId: 'player-a', api: cloud, noteSessionError() {} });
    assert.equal(book.get('track01'), null);
    assert.equal(book.get('track03'), null);

    // A slower run on the new layout is the record now, and replaces the old cloud time.
    const saved = noteTrial(book, 'track01', null, { time: 30, length: 100, car: 'apex', driver: 'sproto' });
    assert.equal(saved.time, 30);
    assert.equal(saved.layout, TRIAL_LAYOUT);
    await book.flush();
    assert.equal(cloud.cloud.data.trials.track01.t, 30000);
    assert.equal(cloud.cloud.data.trials.track01.lay, TRIAL_LAYOUT);
  });
});

describe('a session follows the account record', () => {
  it('loads the account time and reloads when the account changes', () => {
    const storage = memory();
    const book = createRecordBook({ storage });
    book.commit('track01', trial(33, { frames: frames() }));
    const session = createSession({ id: 'track01', length: 100 }, {}, {}, book);
    assert.equal(session.best, 33);
    book.hold();
    session.reloadBest();
    assert.equal(session.best, null);
    book.commit('track01', trial(21));
    session.reloadBest();
    assert.equal(session.best, 21);
  });
});

describe('boot', () => {
  it('holds records while signing in, then keeps a new time on that account', async () => {
    const storage = memory();
    const records = createRecordBook({ storage, pushDelayMs: 1 });
    records.commit('track01', trial(40));
    const live = api(sessionFor());
    const handle = bootHub({ force: true, bindPage: false, records, starting: true, api: live });
    assert.equal(handle.link.status, 'connecting');
    assert.equal(records.owner(), 'pending');
    noteTrial(records, 'track02', null, trial(16, { length: 200 }));
    const link = await handle.ready;
    assert.equal(link.accountLabel, 'ken');
    assert.equal(records.owner(), 'account');
    assert.equal(records.get('track01'), null);
    assert.equal(records.get('track02').time, 16);
    assert.equal(live.cloud.data.trials.track02.t, 16000);
    assert.equal(chipFrom(link, records).label, 'ken');
    assert.equal(handle.saveBeforeLeaving(), false);
  });

  it('without an SDK, a portal visit releases the hold and says bad_game', async () => {
    const records = createRecordBook({ storage: memory() });
    records.commit('track01', trial(10, { frames: frames() }));
    const handle = bootHub({ force: true, bindPage: false, records, starting: true, api: null });
    const link = await handle.ready;
    assert.equal(link.code, 'bad_game');
    assert.equal(records.owner(), 'device');
    assert.equal(records.get('track01').time, 10);
    assert.match(hubChipText(chipFrom(link, records)), /bad_game/);
  });
});

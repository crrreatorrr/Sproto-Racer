import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CARS, DRIVERS } from '../src/roster.js';
import { HUB_GAME_ID } from '../src/hub/config.js';
import { bootHub } from '../src/hub/boot.js';
import { startHub } from '../src/hub/link.js';
import {
  RELIC_CACHE_KEY, createRelicBook, readRelicCache, relicSummary, relicView, relicsFromProfile,
  writeRelicCache,
} from '../src/hub/relics.js';
import {
  RELIC_UNLOCKS, activeUnlocks, isUnlocked, lockReason, playableId, relicName,
} from '../src/hub/unlocks.js';

const jwt = (claims) => `h.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.s`;

function memory() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
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

function api(session, profile = {}) {
  return {
    init: async () => profile,
    exit() {},
    getSession: () => session,
    loadSave: async () => ({ data: null, updatedAt: 0 }),
    writeSave: async (data) => ({ data, updatedAt: 1 }),
  };
}

function records() {
  return {
    hold() {},
    async follow() {},
    flushKeepalive() { return false; },
    refresh() {},
    watches() { return false; },
    subscribe() { return () => {}; },
    owner() { return 'device'; },
    sync() { return 'local'; },
  };
}

const ONE_CAR = [{ relic: 'cones_tip', kind: 'car', id: 'manta' }];
const ONE_EACH = [
  { relic: 'cones_tip', kind: 'car', id: 'manta' },
  { relic: 'tidebreaker_belt', kind: 'character', id: 'pip' },
];

describe('unlock table', () => {
  it('ships placeholder rows and no rewards', () => {
    assert.deepEqual(RELIC_UNLOCKS, [
      { relic: '', kind: 'car', id: '' },
      { relic: '', kind: 'character', id: '' },
    ]);
    assert.deepEqual(activeUnlocks(), []);
    for (const car of CARS) assert.equal(isUnlocked('car', car.id, []), true, car.id);
    for (const driver of DRIVERS) assert.equal(isUnlocked('character', driver.id, []), true, driver.id);
    assert.equal(playableId('car', 'manta', []), 'manta');
    assert.equal(lockReason('car', 'manta'), null);
  });

  it('ignores a blank relic, a blank id, an unknown id, and a bad kind', () => {
    const table = [
      { relic: '', kind: 'car', id: 'apex' },
      { relic: 'cones_tip', kind: 'car', id: '' },
      { relic: 'cones_tip', kind: 'car', id: 'not-a-car' },
      { relic: 'cones_tip', kind: 'pet', id: 'apex' },
      { relic: 'Not A Relic', kind: 'car', id: 'apex' },
      { relic: 'cones_tip', kind: 'character', id: 'pip' },
    ];
    assert.deepEqual(activeUnlocks(table), [{ relic: 'cones_tip', kind: 'character', id: 'pip' }]);
    assert.equal(isUnlocked('car', 'apex', [], table), true);
    assert.equal(isUnlocked('character', 'pip', [], table), false);
  });

  it('locks a car or character until the account owns any one of its Relics', () => {
    assert.equal(isUnlocked('car', 'manta', [], ONE_CAR), false);
    assert.equal(isUnlocked('car', 'apex', [], ONE_CAR), true);
    assert.equal(lockReason('car', 'manta', ONE_CAR), "Needs Cone's Tip");
    assert.equal(isUnlocked('car', 'manta', ['cones_tip'], ONE_CAR), true);
    assert.equal(isUnlocked('car', 'manta', ['future_relic'], ONE_CAR), false);
    assert.equal(playableId('car', 'manta', [], ONE_CAR), 'apex');
    assert.equal(playableId('character', 'pip', [], ONE_EACH), 'sproto');
    assert.equal(playableId('character', 'pip', ['tidebreaker_belt'], ONE_EACH), 'pip');

    const either = [
      { relic: 'cones_tip', kind: 'car', id: 'needle' },
      { relic: 'dragon_scale', kind: 'car', id: 'needle' },
    ];
    assert.equal(lockReason('car', 'needle', either), "Needs Cone's Tip or Dragon Scale");
    assert.equal(isUnlocked('car', 'needle', ['dragon_scale'], either), true);
    assert.equal(isUnlocked('car', 'needle', [], either), false);
  });

  it('returns null only when every entry of that kind is locked', () => {
    const table = CARS.map((car) => ({ relic: 'cones_tip', kind: 'car', id: car.id }));
    assert.equal(playableId('car', 'apex', [], table), null);
    assert.equal(playableId('car', 'needle', ['cones_tip'], table), 'needle');
    assert.equal(playableId('character', 'rook', [], table), 'rook');
  });

  it('names the hub Relics and leaves an unknown id as itself', () => {
    assert.equal(relicName('cones_tip'), "Cone's Tip");
    assert.equal(relicName('future_relic'), 'future_relic');
  });
});

describe('relics from the hub account', () => {
  it('keeps typed ids and otherRelics, and drops junk', () => {
    assert.deepEqual(relicsFromProfile({
      relics: ['cones_tip', 'cones_tip', '', 'Nope', 4, 'dragon_scale'],
      otherRelics: ['future_relic', 'cones_tip', '../x', 'future_relic'],
    }), ['cones_tip', 'dragon_scale', 'future_relic']);
    assert.deepEqual(relicsFromProfile(null), []);
    assert.deepEqual(relicsFromProfile({}), []);
  });

  it('stores the init list on a signed-in visit, including a guest and an unknown id', async () => {
    const link = await startHub({
      api: api(sessionFor(), { relics: ['cones_tip'], otherRelics: ['future_relic'] }),
      starting: true,
    }).ready;
    assert.equal(link.status, 'connected');
    assert.equal(link.relicsFromAccount, true);
    assert.deepEqual(link.relics, ['cones_tip', 'future_relic']);

    const guest = await startHub({
      api: api(sessionFor({ token: jwt({}) }), { relics: ['marina_anchor'] }),
      starting: true,
    }).ready;
    assert.equal(guest.status, 'guest');
    assert.deepEqual(guest.relics, ['marina_anchor']);
  });

  it('does not treat a failed or other-game visit as an account list', async () => {
    const other = await startHub({
      api: api(sessionFor({ game: 'sproto-fighter' }), { relics: ['cones_tip'] }),
      starting: true,
    }).ready;
    assert.equal(other.relicsFromAccount, false);
    assert.deepEqual(other.relics, []);

    const expired = await startHub({
      api: api(sessionFor({ expiresAt: 5 }), { relics: ['cones_tip'] }),
      starting: true,
      now: () => 10,
    }).ready;
    assert.equal(expired.status, 'error');
    assert.deepEqual(expired.relics, []);

    const solo = await startHub({ api: null, starting: false }).ready;
    assert.equal(solo.relicsFromAccount, false);
    assert.deepEqual(solo.relics, []);
  });

  it('replaces the cache from the account, and a later miss keeps that list', () => {
    const store = memory();
    const book = createRelicBook(store);
    assert.equal(book.source(), 'unknown');
    book.follow({ settled: false, status: 'connecting', relicsFromAccount: false, relics: [] });
    assert.equal(book.source(), 'unknown');

    book.follow({
      settled: true, status: 'connected', relicsFromAccount: true, relics: ['cones_tip', 'Nope', 'future_relic'],
    });
    assert.equal(book.source(), 'account');
    assert.deepEqual(book.owned(), ['cones_tip', 'future_relic']);
    assert.deepEqual(readRelicCache(store), ['cones_tip', 'future_relic']);

    book.follow({ settled: true, status: 'offline', relicsFromAccount: false, relics: [] });
    assert.equal(book.source(), 'visit');
    assert.deepEqual(book.owned(), ['cones_tip', 'future_relic']);
    assert.match(relicSummary(book.view()), /Cone's Tip/);
    assert.match(relicSummary(book.view()), /future_relic/);
  });

  it('an account that owns none clears the previous visit', () => {
    const store = memory();
    writeRelicCache(store, ['dragon_scale']);
    const book = createRelicBook(store);
    assert.equal(book.source(), 'visit');
    book.follow({ settled: true, status: 'guest', relicsFromAccount: true, relics: [] });
    assert.equal(book.source(), 'account');
    assert.deepEqual(book.owned(), []);
    assert.equal(relicSummary(book.view()), 'No Relics on this hub account');
    book.follow({ settled: true, status: 'error', relicsFromAccount: false, relics: ['dragon_scale'] });
    assert.equal(book.source(), 'unknown');
    assert.deepEqual(book.owned(), []);
    assert.equal(store.getItem(RELIC_CACHE_KEY), '[]');
  });

  it('bootHub gives the book the visit list', async () => {
    const store = memory();
    const book = createRelicBook(store);
    const handle = bootHub({
      force: true,
      bindPage: false,
      relics: book,
      records: records(),
      api: api(sessionFor(), { relics: ['breakwater_coin'], otherRelics: ['racer_relic'] }),
      starting: true,
    });
    await handle.ready;
    assert.equal(handle.relics, book);
    assert.deepEqual(book.owned(), ['breakwater_coin', 'racer_relic']);
    assert.equal(book.view().items.find((item) => item.id === 'breakwater_coin').owned, true);
    assert.equal(book.view().items.find((item) => item.id === 'cones_tip').owned, false);
    assert.equal(book.view().caption, 'Relics on this hub account');
  });

  it('describes a browser that has never seen an account', () => {
    const view = relicView([], 'unknown');
    assert.equal(view.caption, 'Sign in through the hub to see which Relics you own');
    assert.equal(view.items.every((item) => item.owned === null), true);
    assert.equal(relicSummary(view), view.caption);
    assert.ok(view.items.some((item) => item.id === 'cones_tip' && item.name === "Cone's Tip"));
  });
});

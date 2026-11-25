import { beforeEach, describe, expect, it } from 'vitest';
import { createGarage } from '../src/garage.js';
import { createRelicBook, paintRelics } from '../src/hub/relics.js';

const GARAGE_KEY = 'sproto.racing.garage.v1';
const TABLE = [
  { relic: 'cones_tip', kind: 'car', id: 'manta' },
  { relic: 'tidebreaker_belt', kind: 'character', id: 'pip' },
];

function memory() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

function mount() {
  document.body.innerHTML = `
    <main id="lobby">
      <p id="hub-relic-caption"></p>
      <ul id="hub-relics"></ul>
      <section id="hero">
        <button id="turn-model" hidden>Rear view</button>
        <span id="tag-driver"></span>
        <b id="tag-car"></b>
      </section>
      <section id="garage" hidden></section>
      <button id="launch" data-action="START RACE">START RACE</button>
    </main>`;
}

function choice(id) {
  return document.querySelector(`[data-choice="${id}"]`);
}

describe('garage relic locks', () => {
  beforeEach(() => {
    localStorage.removeItem(GARAGE_KEY);
    mount();
  });

  it('keeps every current car and character selectable when the table has no filled rows', () => {
    const book = createRelicBook(memory());
    const launched = [];
    const garage = createGarage({
      preview() {},
      setGarage() {},
      turn() {},
    }, () => launched.push(garage.selection()), book);
    expect(garage.selection()).toEqual({ car: 'apex', driver: 'sproto' });
    garage.open();
    for (const id of ['sproto', 'pip', 'miso', 'rook']) {
      expect(choice(id).dataset.locked).toBe('false');
    }
    expect(document.querySelector('.garage-relics').textContent)
      .toBe('Sign in through the hub to see which Relics you own');
    choice('pip').click();
    document.getElementById('garage-next').click();
    choice('manta').click();
    document.getElementById('garage-next').click();
    expect(launched).toEqual([{ car: 'manta', driver: 'pip' }]);
  });

  it('shows a locked car and character, and will not start the race in them', () => {
    const book = createRelicBook(memory());
    const seen = [];
    const garage = createGarage({
      preview(car, driver) { seen.push([car.id, driver.id]); },
      setGarage() {},
      turn() {},
    }, () => seen.push('launch'), book, TABLE);
    localStorage.setItem(GARAGE_KEY, JSON.stringify({ car: 'apex', driver: 'sproto' }));
    garage.open();
    expect(choice('pip').dataset.locked).toBe('true');
    expect(choice('pip').getAttribute('aria-disabled')).toBe('true');
    expect(choice('pip').querySelector('small').textContent).toBe('Needs Tidebreaker Belt');
    expect(choice('sproto').dataset.locked).toBe('false');
    expect(choice('sproto').getAttribute('aria-pressed')).toBe('true');
    choice('pip').click();
    expect(choice('sproto').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.garage-detail').textContent).toBe('Needs Tidebreaker Belt');
    expect(document.getElementById('garage-next').disabled).toBe(false);
    document.getElementById('garage-next').click();
    expect(choice('manta').dataset.locked).toBe('true');
    expect(choice('apex').dataset.locked).toBe('false');
    expect(choice('needle').dataset.locked).toBe('false');
    choice('manta').click();
    expect(choice('apex').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.garage-detail').textContent).toBe("Needs Cone's Tip");
    choice('needle').click();
    document.getElementById('garage-next').click();
    expect(seen.at(-1)).toBe('launch');
    expect(garage.selection()).toEqual({ car: 'needle', driver: 'sproto' });
    expect(JSON.parse(localStorage.getItem(GARAGE_KEY))).toEqual({ car: 'needle', driver: 'sproto' });
  });

  it('falls back to a free car and character, then restores the saved pair once the Relics arrive', () => {
    localStorage.setItem(GARAGE_KEY, JSON.stringify({ car: 'manta', driver: 'pip' }));
    const store = memory();
    const book = createRelicBook(store);
    const tags = [];
    const garage = createGarage({
      preview(car, driver) { tags.push(`${driver.id}:${car.id}`); },
      setGarage() {},
      turn() {},
    }, () => {}, book, TABLE);
    expect(garage.selection()).toEqual({ car: 'apex', driver: 'sproto' });
    expect(JSON.parse(localStorage.getItem(GARAGE_KEY))).toEqual({ car: 'manta', driver: 'pip' });

    book.follow({
      settled: true, status: 'connected', relicsFromAccount: true, relics: ['cones_tip', 'tidebreaker_belt'],
    });
    expect(garage.selection()).toEqual({ car: 'manta', driver: 'pip' });
    expect(tags.at(-1)).toBe('pip:manta');
    garage.open();
    expect(choice('manta')).toBeNull();
    expect(choice('pip').dataset.locked).toBe('false');
    expect(document.querySelector('.garage-relics').dataset.relicSource).toBe('account');
    expect(document.querySelector('.garage-relics').textContent)
      .toBe("Relics on this hub account: Cone's Tip, Tidebreaker Belt");
    document.getElementById('garage-next').click();
    expect(choice('manta').dataset.locked).toBe('false');
    expect(choice('manta').getAttribute('aria-pressed')).toBe('true');
  });

  it('paints owned, missing, and unknown Relics as text', () => {
    const book = createRelicBook(memory());
    book.follow({
      settled: true, status: 'connected', relicsFromAccount: true, relics: ['cones_tip', 'future_relic'],
    });
    paintRelics(
      document.getElementById('hub-relic-caption'),
      document.getElementById('hub-relics'),
      book.view(),
    );
    const list = document.getElementById('hub-relics');
    expect(document.getElementById('hub-relic-caption').textContent).toBe('Relics on this hub account');
    expect(list.querySelector('[data-relic="cones_tip"]').dataset.owned).toBe('true');
    expect(list.querySelector('[data-relic="cones_tip"]').textContent).toBe("Cone's Tip");
    expect(list.querySelector('[data-relic="dragon_scale"]').dataset.owned).toBe('false');
    expect(list.querySelector('[data-relic="future_relic"]').dataset.owned).toBe('true');
    expect(list.querySelector('[data-relic="future_relic"]').textContent).toBe('future_relic');

    const unknown = createRelicBook(memory());
    paintRelics(
      document.getElementById('hub-relic-caption'),
      list,
      unknown.view(),
    );
    expect(list.querySelector('[data-relic="cones_tip"]').dataset.owned).toBe('unknown');
    expect(document.getElementById('hub-relic-caption').textContent)
      .toBe('Sign in through the hub to see which Relics you own');
  });
});

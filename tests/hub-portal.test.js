import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createHubPortal, HUB_PORTAL_POSITION } from '../src/hub/portal-mesh.js';
import {
  controlRole, hubConfirmCopy, lobbyPadAction, menuKeyAction, modalPadAction, padEdges,
} from '../src/hub/portal.js';

const edges = (on) => [false, false, false, false, false, false, false].map((_, i) => on.includes(i));

describe('hub portal controls', () => {
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
  it('stands beside the preview kart and hides while the garage is open', () => {
    const portal = createHubPortal();
    assert.equal(portal.name, 'hub-portal');
    assert.ok(portal.getObjectByName('hub-portal-ring'));
    assert.ok(portal.getObjectByName('hub-portal-disc'));
    assert.equal(portal.position.x, HUB_PORTAL_POSITION.x);
    assert.equal(portal.position.z, HUB_PORTAL_POSITION.z);
    assert.ok(Math.hypot(HUB_PORTAL_POSITION.x, HUB_PORTAL_POSITION.z) > 1.5);
    const paddock = readFileSync(new URL('../src/paddock.js', import.meta.url), 'utf8');
    assert.match(paddock, /createHubPortal\(\)/);
    assert.match(paddock, /hubPortal\.visible=!garage/);
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    assert.match(main, /hub\.leaveForHub\(\)/);
    assert.match(main, /id="pause-hub"/);
    assert.match(main, /id="finish-hub"/);
  });
});

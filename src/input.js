export const ACTIONS = [
  ['steerLeft', 'Steer left'], ['steerRight', 'Steer right'],
  ['throttle', 'Accelerate'], ['brake', 'Brake / rotate'],
  ['drift', 'Hop / powerslide'], ['driftBoost', 'Activate drift boost'], ['reverse','Reverse / pull back'], ['map','Toggle minimap'],
  ['lookBack','Look back'], ['distance','Camera distance'],
  ['item', 'Use item'], ['blasters','Fire Barrage blasters'], ['prev', 'Previous test item'], ['next', 'Switch test item'],
  ['pause', 'Pause'], ['reset', 'Restart section']
];

const triggerBindings={
  steerLeft:'a0-',steerRight:'a0+',throttle:'b7',brake:'b6',drift:'b4',driftBoost:'b5',item:'b0',
  blasters:'b12',reverse:'a1+',map:'none',prev:'b14',next:'b15',pause:'b9',reset:'b3',distance:'b10',lookBack:'b11'
};
export const PRESETS={
  classic:{...triggerBindings, throttle:'b0',brake:'b2',drift:'b5',driftBoost:'b10',item:'b1',
    distance:'b6',lookBack:'b7',prev:'b4',next:'b8',map:'b3',reset:'none'},
  triggers:triggerBindings
};
export const DEFAULT_BINDINGS=PRESETS.classic;

const keyBindings = {
  steerLeft: ['KeyA', 'ArrowLeft'], steerRight: ['KeyD', 'ArrowRight'],
  throttle: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'],
  drift:['KeyQ'],driftBoost:['KeyE'],reverse:['KeyS','ArrowDown'],map:['KeyM'],lookBack:['KeyV'],distance:['KeyC'],
  blasters:['KeyF'], item: ['Space'], prev: ['KeyZ', 'BracketLeft'], next: ['KeyX','KeyI', 'BracketRight'],
  pause: ['Escape', 'KeyP'], reset: ['KeyR']
};
const keysOfInterest = new Set([...Object.values(keyBindings).flat(), ...Array.from({length: 10}, (_, i) => 'Digit' + i)]);
const buttonNames = ['A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2', 'View / Share', 'Menu / Options', 'Left stick click', 'Right stick click', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home'];
const axisNames = ['Left stick X', 'Left stick Y', 'Right stick X', 'Right stick Y'];
const STORAGE = 'sproto-racing.controls.v1';
const validBinding = value => typeof value === 'string' && /^(b([0-9]|[1-5][0-9]|6[0-3])|a([0-9]|[12][0-9]|3[01])[+-]|none)$/.test(value);

export function bindingName(code) {
  if (code === 'none') return 'Unassigned';
  if (code[0] === 'b') return buttonNames[Number(code.slice(1))] ?? ('Button ' + code.slice(1));
  const axis = Number(code.slice(1, -1));
  return (axisNames[axis] ?? ('Axis ' + axis)) + (code.endsWith('+') ? ' +' : ' −');
}

function settingsFromDisk() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE)) || {}; } catch {}
  // Existing installations keep their accelerator, item and chosen drift binding.
  const scheme=saved.scheme==='triggers'||(!saved.scheme&&saved.bindings)?'triggers':'classic';
  const bindings={...PRESETS[scheme]};
  const oldHops=[saved.bindings?.leftHop,saved.bindings?.rightHop].filter(validBinding);
  if(oldHops.length)bindings.drift=oldHops.find(code=>code!=='none')??'none';
  // New actions must not silently shadow a custom binding from the two-shoulder layout.
  if(oldHops.length && !saved.bindings.drift){
    const occupied=Object.values(saved.bindings);
    for(const key of ['lookBack','distance','reverse'])if(occupied.includes(bindings[key]))bindings[key]='none';
  }
  for (const [action] of ACTIONS) if (validBinding(saved.bindings?.[action])) bindings[action] = saved.bindings[action];
  if (!validBinding(saved.bindings?.driftBoost)) {
    const occupied = new Set(ACTIONS.filter(([name]) => name !== 'driftBoost').map(([name]) => bindings[name]));
    bindings.driftBoost = [bindings.driftBoost,'b5','b4','b10','b11','b12','b13'].find(code => !occupied.has(code)) ?? 'none';
  }
  if(!validBinding(saved.bindings?.blasters) && Object.entries(bindings).some(([key,code])=>key!=='blasters' && code===bindings.blasters))bindings.blasters='none';
  return {
    bindings,scheme,
    deadzone: Number.isFinite(saved.deadzone) ? Math.max(0, Math.min(0.4, saved.deadzone)) : 0.14,
    invert: saved.invert === true
  };
}

export function readBinding(pad, code, deadzone = 0.14) {
  if (!pad || !code || code === 'none') return 0;
  if (code.startsWith('b')) {
    const button = pad.buttons[Number(code.slice(1))];
    return button?.value || (button?.pressed ? 1 : 0);
  }
  const value = (pad.axes[Number(code.slice(1, -1))] || 0) * (code.endsWith('-') ? -1 : 1);
  return Math.max(0, Math.min(1, (value - deadzone) / (1 - deadzone)));
}

function listPads() {
  try { return Array.from(navigator.getGamepads?.() || []).filter(p => p && p.connected !== false); }
  catch { return []; }
}

function targetIsUI(event) {
  return event.target instanceof Element && !!event.target.closest('input,select,textarea,[contenteditable="true"],dialog[open]');
}

export function createInput() {
  const settings = settingsFromDisk();
  const keys = new Set();
  const freshKeys = new Set();
  const previous = {};
  let keyDriftReleased=false, pendingSlot=null;
  let activePadIndex = null;
  let activeDevice = 'Keyboard';
  let blocked = false;

  function padHoldsDrift() {
    return readBinding(api.rawPad(),settings.bindings.drift,settings.deadzone)>=0.5;
  }
  function keydown(event) {
    if (blocked || targetIsUI(event) || event.metaKey || event.altKey || event.ctrlKey || !keysOfInterest.has(event.code)) return;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(event.code) && !(event.target instanceof HTMLButtonElement)) event.preventDefault();
    if (!keys.has(event.code) && !event.repeat && (event.code!=='KeyQ' || !padHoldsDrift())) freshKeys.add(event.code);
    if(event.code.startsWith('Digit') && !event.repeat)pendingSlot=(Number(event.code.at(-1))+9)%10+(event.shiftKey?10:0);
    keys.add(event.code);
    activeDevice = 'Keyboard';
  }
  function keyup(event) {
    if(event.code==='KeyQ' && keys.has(event.code) && !padHoldsDrift())keyDriftReleased=true;
    keys.delete(event.code);
  }
  function clear() { keys.clear(); freshKeys.clear(); keyDriftReleased=false; pendingSlot=null; }
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', clear);

  const api = {
    settings,
    get deviceName() { return activeDevice !== 'Keyboard' && !api.rawPad() ? 'Keyboard' : activeDevice; },
    get gamepadName() { return api.rawPad()?.id ?? ''; },
    rawPad() {
      const pads = listPads();
      const active = pads.find(pad => pad.buttons.some(b => b.value > 0.25 || b.pressed) || pad.axes.some(v => Math.abs(v) > 0.45));
      const selected = active || pads.find(p => p.index === activePadIndex) || pads[0] || null;
      if (selected) activePadIndex = selected.index;
      return selected;
    },
    save() { try { localStorage.setItem(STORAGE, JSON.stringify(settings)); } catch {} },
    setBinding(action, code) {
      if (!Object.hasOwn(DEFAULT_BINDINGS, action) || !validBinding(code)) return;
      settings.bindings[action] = code;
      api.save();
    },
    preset(scheme) {
      if(!Object.hasOwn(PRESETS,scheme))return;
      settings.scheme=scheme;settings.bindings={...PRESETS[scheme]};api.save();
    },
    restore() {
      settings.bindings = {...PRESETS[settings.scheme]};
      settings.deadzone = 0.14;
      settings.invert = false;
      api.save();
    },
    block(value) {
      blocked = value;
      clear();
      // Retain only buttons already held across the modal boundary. Keeping the
      // throttle down must never swallow a fresh drift, item, or pause press.
      const pad = value ? null : api.rawPad();
      for (const [action] of ACTIONS) {
        previous[action] = readBinding(pad, settings.bindings[action], settings.deadzone) >= 0.5;
      }
    },
    poll() {
      const pad = blocked ? null : api.rawPad();
      const values = {}, pressed = {}, released = {}, padValues = {}, keyValues = {};
      for (const [action] of ACTIONS) {
        const padValue = readBinding(pad, settings.bindings[action], settings.deadzone);
        if (padValue > 0.25) activeDevice = pad.id || 'Gamepad';
        const bindings = keyBindings[action];
        const keyboardHeld = bindings.some(key => keys.has(key));
        const keyboardEdge = bindings.some(key => freshKeys.has(key));
        const digital = padValue >= 0.5 || keyboardHeld;
        padValues[action] = padValue;
        keyValues[action] = keyboardHeld ? 1 : 0;
        values[action] = Math.max(keyboardHeld ? 1 : 0, padValue);
        pressed[action] = !blocked && ((digital && !previous[action]) || keyboardEdge);
        released[action]=!digital&&previous[action];
        previous[action] = digital;
      }
      const slot=pendingSlot;
      pendingSlot=null;
      freshKeys.clear();
      const fromKeys = keyValues.steerRight - keyValues.steerLeft;
      const fromPad = padValues.steerRight - padValues.steerLeft;
      const used=Object.values(settings.bindings);
      const dpad=settings.scheme==='classic' ?
        ((!used.includes('b15')&&pad?.buttons[15]?.pressed?1:0)-(!used.includes('b14')&&pad?.buttons[14]?.pressed?1:0)):0;
      const raw=fromPad||dpad;
      const steer=fromKeys||(settings.invert?-raw:raw);
      const driftReleased=released.drift||keyDriftReleased;
      keyDriftReleased=false;
      return {
        throttle: values.throttle, brake: values.brake, reverse:values.reverse, mapPressed:pressed.map, steer,
        driftHeld:!!previous.drift,driftPressed:pressed.drift,driftReleased,driftBoostPressed:pressed.driftBoost,
        distancePressed:pressed.distance,lookBack:!!previous.lookBack,
        blasters:!!previous.blasters,blastersPressed:pressed.blasters,
        item: !!previous.item, itemPressed: pressed.item, prevPressed: pressed.prev,
        nextPressed: pressed.next, pausePressed: pressed.pause, resetPressed: pressed.reset, slot
      };
    },
    destroy() {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', clear);
    }
  };
  return api;
}

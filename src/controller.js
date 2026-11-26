import { ACTIONS, bindingName, readBinding } from './input.js';
import './controller.css';

let openPanel = null;

/** True while Controller setup is on screen, including while it waits for a button. */
export function controllerIsOpen() {
  return !!openPanel;
}

function optionCodes(pad, settings) {
  const codes = new Set(['none']);
  for (let i = 0; i < Math.max(17, pad?.buttons.length || 0); i++) codes.add('b' + i);
  for (let i = 0; i < Math.max(4, pad?.axes.length || 0); i++) {
    codes.add('a' + i + '-'); codes.add('a' + i + '+');
  }
  Object.values(settings.bindings).forEach(code => codes.add(code));
  return [...codes];
}

export function openController(input, onClose = () => {}) {
  if (openPanel) { openPanel.focus(); return; }
  const origin = document.activeElement;
  const dialog = document.createElement('dialog');
  openPanel = dialog;
  dialog.className = 'ctrl-panel';
  dialog.setAttribute('aria-labelledby','ctrl-title');
  dialog.innerHTML = `
    <div class="ctrl-header">
      <div><p class="ctrl-kicker">SPROTO RACING</p><h2 id="ctrl-title">Controller setup</h2></div>
      <button class="ctrl-close" type="button" aria-label="Close controller setup">×</button>
    </div>
    <div class="ctrl-device"><span class="ctrl-led"></span><span class="ctrl-device-text"></span></div>
    <div class="ctrl-body">
      <div class="ctrl-tools">
        <label for="ctrl-scheme">Controller layout</label>
        <select id="ctrl-scheme"><option value="classic">CTR Classic</option><option value="triggers">Trigger Drive</option></select>
        <label for="ctrl-dz">Stick dead zone <output id="ctrl-out"></output></label>
        <input id="ctrl-dz" type="range" min="0" max="40" step="1">
        <label class="ctrl-check"><input id="ctrl-invert" type="checkbox"> Reverse steering</label>
        <label class="ctrl-check"><input id="ctrl-invert-pitch" type="checkbox"> Invert Sky Lane pitch</label>
        <label class="ctrl-check"><input id="ctrl-speed-lines" type="checkbox"> Reduce Sky Lane speed lines</label>
      </div>
      <p class="ctrl-sky">Sky Lanes: left stick up dives, down climbs. Hold Drift to carve; tap Drift while steering to barrel-roll. Keyboard: W dives, S climbs.</p>
      <div class="ctrl-rowhead"><span>Driving control</span><span>Gamepad input</span><span>Assign</span></div>
      <div class="ctrl-rows"></div>
      <p class="ctrl-help" role="status" aria-live="polite"></p>
    </div>
    <div class="ctrl-footer"><button type="button" class="ctrl-restore">Restore defaults</button><button type="button" class="ctrl-done">Done</button></div>`;
  const el = selector => dialog.querySelector(selector);
  const status = el('.ctrl-help');
  const help = 'Choose an input, or use Bind and press a controller button or move a stick.';
  status.textContent = help;
  document.body.append(dialog);
  input.block(true);
  let raf = 0, capture = '', captureReady = false, captureSince = 0;
  const selects = {}, rows = {}, binders = {};
  let lastSignature = '';
  const deadzone = el('#ctrl-dz'), inverted = el('#ctrl-invert'), invertedPitch = el('#ctrl-invert-pitch');
  const calmLines = el('#ctrl-speed-lines');

  function fillOptions(pad) {
    const codes = optionCodes(pad, input.settings);
    const signature = codes.join('/');
    if (lastSignature === signature) return;
    lastSignature = signature;
    for (const [name] of ACTIONS) {
      selects[name].replaceChildren(...codes.map(code => new Option(bindingName(code), code)));
      selects[name].value = input.settings.bindings[name];
    }
  }
  function render() {
    fillOptions(input.rawPad());
    for (const [name] of ACTIONS) {
      selects[name].value = input.settings.bindings[name];
      binders[name].textContent = capture === name ? 'Cancel' : 'Bind';
      rows[name].classList.toggle('is-capturing', capture === name);
    }
    el('#ctrl-scheme').value=input.settings.scheme;
    deadzone.value = Math.round(input.settings.deadzone * 100);
    el('#ctrl-out').value = deadzone.value + '%';
    inverted.checked = input.settings.invert;
    invertedPitch.checked = !!input.settings.invertPitch;
    calmLines.checked = !!input.settings.reduceSpeedLines;
  }
  function endCapture(text = help) {
    capture = '';
    captureReady = false;
    status.textContent = text;
    render();
  }
  function commit(name, code) {
    const oldCode = input.settings.bindings[name];
    const other = code !== 'none' && ACTIONS.find(([other]) => other !== name && input.settings.bindings[other] === code);
    if (other && oldCode !== code) input.setBinding(other[0], oldCode);
    input.setBinding(name, code);
    endCapture(other ? 'Bindings swapped. ' + other[1] + ' now uses ' + bindingName(oldCode) + '.' : 'Binding saved.');
  }
  for (const [name, label] of ACTIONS) {
    const row = document.createElement('div');
    row.className = 'ctrl-row';
    const title = document.createElement('label');
    title.htmlFor = 'ctrl-map-' + name;
    title.textContent = label;
    const select = document.createElement('select');
    select.id = title.htmlFor;
    select.addEventListener('change', () => commit(name, select.value));
    const bind = document.createElement('button');
    bind.type = 'button';
    bind.setAttribute('aria-label', 'Detect controller input for ' + label);
    bind.addEventListener('click', () => {
      if (capture === name) { endCapture(); return; }
      capture = name; captureSince = performance.now(); captureReady = false;
      status.textContent = 'Release controls, then press a button or move a stick for ' + label + '.';
      render();
    });
    rows[name] = row; selects[name] = select; binders[name] = bind;
    row.append(title, select, bind);
    el('.ctrl-rows').append(row);
  }
  el('#ctrl-scheme').addEventListener('change',()=>{
    input.preset(el('#ctrl-scheme').value); endCapture('Layout applied.');
  });
  deadzone.addEventListener('input', () => {
    input.settings.deadzone = Number(deadzone.value) / 100;
    el('#ctrl-out').value = deadzone.value + '%';
    input.save();
  });
  inverted.addEventListener('change', () => { input.settings.invert = inverted.checked; input.save(); });
  invertedPitch.addEventListener('change', () => { input.settings.invertPitch = invertedPitch.checked; input.save(); });
  calmLines.addEventListener('change', () => { input.settings.reduceSpeedLines = calmLines.checked; input.save(); });
  el('.ctrl-restore').addEventListener('click', () => { input.restore(); endCapture('Default controller bindings restored.'); });

  const close = () => dialog.close();
  el('.ctrl-close').addEventListener('click', close);
  el('.ctrl-done').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { if (capture) { event.preventDefault(); endCapture(); } });
  dialog.addEventListener('close', () => {
    cancelAnimationFrame(raf);
    dialog.remove();
    openPanel = null;
    input.block(false);
    if (origin?.isConnected) origin.focus({preventScroll:true});
    onClose();
  }, {once:true});
  render();
  dialog.showModal();
  el('.ctrl-close').focus({preventScroll:true});

  let lastPadButtons = null, previousDevice;
  function navigate(pad, buttons) {
    if (!pad || !lastPadButtons || !buttons) return;
    const press = i => buttons[i] && !lastPadButtons[i];
    if (press(1) || press(9)) { close(); return; }
    if (press(12) || press(13)) {
      const controls = [...dialog.querySelectorAll('button,select,input')];
      const current = controls.indexOf(document.activeElement);
      controls[(current + (press(13) ? 1 : -1) + controls.length) % controls.length].focus();
    }
    const target = document.activeElement;
    const dir = press(15) ? 1 : press(14) ? -1 : 0;
    if (dir && target instanceof HTMLSelectElement) {
      target.selectedIndex = (target.selectedIndex + dir + target.options.length) % target.options.length;
      target.dispatchEvent(new Event('change'));
    }
    if (dir && target === deadzone) {
      deadzone.value = Number(deadzone.value) + dir;
      deadzone.dispatchEvent(new Event('input'));
    }
    if (press(0) && (target instanceof HTMLButtonElement || target === inverted || target === invertedPitch || target === calmLines)) target.click();
  }
  function frame() {
    if (!dialog.open) return;
    const pad = input.rawPad();
    const name = pad?.id || '';
    if (name !== previousDevice) {
      previousDevice = name;
      fillOptions(pad);
      el('.ctrl-device-text').textContent = name || 'Press a button on your gamepad to connect.';
      dialog.classList.toggle('ctrl-connected', !!pad);
      lastPadButtons = null;
    }
    const buttons = pad && Array.from(pad.buttons, b => b.pressed || b.value > 0.55);
    for (const [key] of ACTIONS) {
      const strength = readBinding(pad, input.settings.bindings[key], input.settings.deadzone);
      rows[key].classList.toggle('is-live', strength > 0.2);
    }
    if (capture) {
      if (performance.now() - captureSince > 15000) endCapture('Binding timed out. Choose an input manually or select Bind to try again.');
      else if (pad) {
        const button = buttons.findIndex(Boolean);
        const axis = Array.from(pad.axes).findIndex(value => Math.abs(value) > 0.65);
        if (button < 0 && axis < 0) captureReady = true;
        else if (captureReady) commit(capture, button >= 0 ? 'b' + button : 'a' + axis + (pad.axes[axis] > 0 ? '+' : '-'));
      }
    } else navigate(pad, buttons);
    lastPadButtons = buttons;
    if (dialog.open) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
}

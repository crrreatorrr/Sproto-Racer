/** Copy for the mid-race confirm. Keep racing is the default. */
export function hubConfirmCopy() {
  return {
    title: 'Return to hub?',
    body: 'This race ends here.',
    stay: 'KEEP RACING',
    leave: 'RETURN TO HUB',
  };
}

/** Standard mapping: A, B, up, down, left, right, Menu / Options. */
export function padEdges(pad) {
  const axis = (index) => Number(pad.axes?.[index]) || 0;
  const button = (index) => !!pad.buttons?.[index]?.pressed;
  return [
    button(0),
    button(1),
    button(12) || axis(1) < -0.65,
    button(13) || axis(1) > 0.65,
    button(14) || axis(0) < -0.65,
    button(15) || axis(0) > 0.65,
    button(9),
  ];
}

export function controlRole(el) {
  if (!el) return '';
  if (el.dataset?.role) return el.dataset.role;
  if (el.dataset?.track) return 'track';
  if (el.dataset?.mode) return 'mode';
  return '';
}

/**
 * Paddock focus order is tracks, modes, launch, the hub portal, then controller setup.
 * A / Cross activates the focused control. Menu / Options launches, except on the portal
 * and on controller setup, where it activates that control.
 */
export function lobbyPadAction({ edges, index, count, role }) {
  const [confirm, , up, down, left, right, menu] = edges;
  if (up || down || left || right) {
    const direction = left || up ? -1 : 1;
    return { type: 'focus', index: (index + direction + count) % count };
  }
  if (confirm || menu) {
    if (role === 'controls') return { type: 'controller' };
    if (role === 'portal') return { type: 'portal' };
    if (confirm && role === 'track') return { type: 'click' };
    return { type: 'launch' };
  }
  return { type: 'none' };
}

/**
 * Pause, finish, test tools and the mid-race hub confirm. B / Circle and Menu / Options step back.
 * Leaving a race asks first: the confirm panel's back action returns to the pause menu.
 */
export function modalPadAction({ modal, edges, index, count, tagName }) {
  const [confirm, cancel, up, down, left, right, menu] = edges;
  if (cancel || menu) {
    if (modal === 'finish') return { type: 'home' };
    if (modal === 'hub-exit') return { type: 'back-to-pause' };
    return { type: 'close' };
  }
  if (up || down) {
    const direction = up ? -1 : 1;
    return { type: 'focus', index: (index + direction + count) % count };
  }
  if (tagName === 'SELECT' && (left || right)) return { type: 'select', direction: left ? -1 : 1 };
  if (confirm && tagName === 'BUTTON') return { type: 'click' };
  return { type: 'none' };
}

/**
 * Escape leaves a panel the same way B does. Enter on the page background starts the race.
 * Enter on a focused button is left to the button, including Return to hub.
 */
export function menuKeyAction({ modal, code, activeRole }) {
  if (code === 'Escape' && modal) {
    if (modal === 'finish') return { type: 'home' };
    if (modal === 'hub-exit') return { type: 'back-to-pause' };
    return { type: 'close' };
  }
  if (code === 'Enter' && !modal && activeRole === 'body') return { type: 'launch' };
  return { type: 'none' };
}

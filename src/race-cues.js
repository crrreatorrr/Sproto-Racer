// Plays what a race runner reports (`runner.drainEvents()`) as sounds and effects.
//
// One place for both kinds of race, so a cue is tied to the seat this player drives
// rather than to seat 0, and so an online race can take a cue back: when a rollback
// shows that something announced earlier did not happen after all, the runner sends
// `{ type: 'cancel', event }` and the sound or effect started for `event` is stopped.
//
// No DOM and no Three.js here: the caller supplies the sound and effect functions.
//
//   fx.tone(name)      plays a sound; may return a function that stops it
//   cue(visualCue)     shows an item effect; may return a token for `cancelCue`
//   cancelCue(token)   removes that effect
//   localSeat()        the seat this player drives
//   track()            the circuit being raced (for where a pickup sits on the road)

export function createCuePlayer({ fx, cue, cancelCue, localSeat = () => 0, track = () => null } = {}) {
  // What to undo for each announced event that can still be cancelled.
  const undo = new WeakMap();

  function show(ev, visual) {
    const token = cue(visual);
    if (token != null && cancelCue) undo.set(ev, () => cancelCue(token));
  }

  function play(ev) {
    const type = ev.type;
    if (type === 'cancel') {
      const stop = undo.get(ev.event);
      if (stop) {
        undo.delete(ev.event);
        stop();
      }
      return;
    }
    if (type === 'tone' || ((type === 'bump' || type === 'boost') && ev.seat === localSeat())) {
      const stop = fx?.tone?.(type === 'tone' ? ev.name : type);
      if (typeof stop === 'function') undo.set(ev, stop);
    } else if (type === 'pickup' && cue) {
      const p = track()?.pickups[ev.pickupIndex];
      if (p) show(ev, { phase: 'pickup', type: 'pickup', seat: ev.seat, isPlayer: ev.seat === localSeat(), s: p.s, x: p.x, height: 1.05 });
    } else if (type === 'cue' && cue && ev.cue) {
      // An item effect reported by the simulation's visual hook (see runner.noteEvent).
      ev.cue.isPlayer = ev.seat === localSeat();
      show(ev, ev.cue);
    }
  }

  return {
    play,
    playAll(events) {
      for (let i = 0; i < events.length; i++) play(events[i]);
    },
  };
}

/** Wraps an item visual cue as a runner event, so rollback can filter and cancel it. */
export function cueEvent(visual) {
  return { type: 'cue', seat: visual.seat, name: visual.phase + ':' + visual.type, cue: visual };
}

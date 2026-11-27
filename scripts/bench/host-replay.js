// Replays a recorded online match against the match host inside build/racer-sim.js.
//
// Plain script, no imports: it runs unchanged in Node's vm and in Goja (the engine the
// Nakama server uses), with `RacerSim` as a global. host-transcript.mjs records the
// transcript and runs this in Node; gojabench -host runs it in Goja. The two summaries
// must be identical: same messages in, same bytes out, same final race state.
//
//   hostReplayLoad(json)   parse a transcript and build the host
//   hostReplayNext()       run the next recorded call; returns 't' for a tick, another
//                          letter for anything else, '' when the transcript is done
//   hostReplaySummary()    JSON: results, counters and a checksum of every byte sent

var hostReplay = null;

function hostReplayHexToBytes(hex) {
  var out = new Uint8Array(hex.length >> 1);
  for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function hostReplayLoad(json) {
  var transcript = JSON.parse(json);
  var state = { calls: transcript.calls, at: 0, sends: 0, bytes: 0, sum: 2166136261, host: null };
  // FNV-1a over the recipient, the op code and every byte or character of the payload.
  function mix(n) {
    state.sum = Math.imul(state.sum ^ (n & 0xff), 16777619) >>> 0;
  }
  var options = {};
  for (var key in transcript.options) options[key] = transcript.options[key];
  options.send = function (playerId, op, data) {
    state.sends++;
    state.bytes += data.length;
    for (var i = 0; i < playerId.length; i++) mix(playerId.charCodeAt(i));
    mix(op);
    if (typeof data === 'string') {
      for (var j = 0; j < data.length; j++) { mix(data.charCodeAt(j)); mix(data.charCodeAt(j) >> 8); }
    } else {
      for (var k = 0; k < data.length; k++) mix(data[k]);
    }
  };
  state.host = RacerSim.createMatchHost(options);
  hostReplay = state;
  return state.calls.length;
}

function hostReplayNext() {
  var state = hostReplay;
  if (state.at >= state.calls.length) return '';
  var call = state.calls[state.at++];
  var kind = call[0];
  if (kind === 't') state.host.tick();
  else if (kind === 'r') state.host.receive(call[1], call[2], call[3] === 1 ? hostReplayHexToBytes(call[4]) : call[4]);
  else if (kind === 'j') state.host.join(call[1], { name: call[2] });
  else if (kind === 'l') state.host.leave(call[1]);
  return kind;
}

function hostReplaySummary() {
  var host = hostReplay.host;
  return JSON.stringify({
    phase: host.phase,
    serverTick: host.serverTick,
    raceTick: host.raceTick,
    hash: host.world ? RacerSim.stateHash(host.world) : null,
    results: host.results,
    stats: host.stats,
    sends: hostReplay.sends,
    bytes: hostReplay.bytes,
    checksum: hostReplay.sum,
  });
}

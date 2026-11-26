// Sparse delta/RLE input-log recorder, 4 KB chunker, and deterministic replay verifier
// modeled after Sproto Duel's DuelSim.replay(log) contract.

import {
  EDGE_BUTTON_MASK,
  HELD_BUTTON_MASK,
  controlsToIntentFrame,
  createReplayIntentSource,
  intentFramesEqualPayload,
  intentFrameToTuple,
  neutralIntentFrame,
  tupleToIntentFrame,
} from './intent.js';
import { createSimWorld } from './world.js';
import { stateHash } from './hash.js';

export const REPLAY_SCHEMA = 1;
export const MAX_REPLAY_TICKS = 60 * 60 * 20; // 20 minutes ceiling
export const LOG_CHUNK_BYTES = 4096;

export function createLogRecorder(meta) {
  const streams = Object.create(null);
  const lastHeld = Object.create(null);
  let ticks = 0;

  for (const seat of meta.seats || []) {
    if (seat.kind !== 'ai') {
      streams[seat.id] = [];
      lastHeld[seat.id] = neutralIntentFrame(0);
    }
  }

  return {
    record(tick, seatId, rawOrFrame) {
      if (!(seatId in streams)) return null;
      const frame =
        rawOrFrame && typeof rawOrFrame.buttons === 'number' && typeof rawOrFrame.steer === 'number' && Number.isInteger(rawOrFrame.steer)
          ? { ...rawOrFrame, tick: tick >>> 0 }
          : controlsToIntentFrame(tick, rawOrFrame || {});
      const prev = lastHeld[seatId];
      const hasEdges = (frame.buttons & EDGE_BUTTON_MASK) !== 0;
      if (tick === 0 || hasEdges || !intentFramesEqualPayload(frame, prev)) {
        streams[seatId].push(intentFrameToTuple(frame));
      }
      lastHeld[seatId] = { ...frame, buttons: frame.buttons & HELD_BUTTON_MASK };
      ticks = Math.max(ticks, tick + 1);
      return frame;
    },
    noteTick(tick) {
      ticks = Math.max(ticks, tick + 1);
    },
    finish(world, simVersion = '') {
      const standings = world.standings();
      const inputs = Object.create(null);
      for (const [seatId, list] of Object.entries(streams)) inputs[seatId] = list;
      return {
        schema: REPLAY_SCHEMA,
        simVersion,
        courseId: world.course.id,
        mode: world.state.mode,
        laps: world.state.laps,
        finishRule: meta.finishRule ?? 'primary',
        seed: world.state.seed,
        seats: world.state.seats.map((s) => ({
          id: s.id,
          kind: s.kind === 'ai' ? 'ai' : 'replay',
          car: s.car,
          driver: s.driver,
          gridIndex: s.gridIndex,
        })),
        ticks: Math.max(ticks, world.state.tick),
        inputs,
        claimed: {
          winnerSeat: standings[0]?.seat ?? null,
          standings: standings.map((r) => ({ seat: r.seat, place: r.place, finishUs: r.finishUs })),
          endHash: stateHash(world),
        },
      };
    },
  };
}

export function replayLog(logInput, expectedSimVersion = null) {
  try {
    const log = typeof logInput === 'string' ? JSON.parse(logInput) : logInput;
    if (!log || typeof log !== 'object' || log.schema !== REPLAY_SCHEMA) {
      return { ok: false, error: 'bad_schema', simVersion: expectedSimVersion || '', endHash: '0000000000000000' };
    }
    if (expectedSimVersion && log.simVersion && log.simVersion !== expectedSimVersion) {
      return { ok: false, error: 'version_mismatch', simVersion: expectedSimVersion, endHash: '0000000000000000' };
    }
    if (!Number.isInteger(log.ticks) || log.ticks < 0 || log.ticks > MAX_REPLAY_TICKS) {
      return { ok: false, error: 'bad_ticks', simVersion: expectedSimVersion || log.simVersion || '', endHash: '0000000000000000' };
    }
    if (!Array.isArray(log.seats) || log.seats.length < 1 || log.seats.length > 12) {
      return { ok: false, error: 'bad_seats', simVersion: expectedSimVersion || log.simVersion || '', endHash: '0000000000000000' };
    }

    const sources = Object.create(null);
    const rawInputs = log.inputs && typeof log.inputs === 'object' ? log.inputs : {};
    for (let i = 0; i < log.seats.length; i++) {
      const s = log.seats[i];
      if (s.kind === 'ai') continue;
      const tuples = rawInputs[s.id] || [];
      if (!Array.isArray(tuples)) {
        return { ok: false, error: 'bad_inputs', simVersion: expectedSimVersion || log.simVersion || '', endHash: '0000000000000000' };
      }
      const frames = [];
      let prevTick = -1;
      for (let j = 0; j < tuples.length; j++) {
        const f = tupleToIntentFrame(tuples[j]);
        if (!f || f.tick <= prevTick || f.tick >= log.ticks) {
          return { ok: false, error: 'bad_frame', simVersion: expectedSimVersion || log.simVersion || '', endHash: '0000000000000000' };
        }
        prevTick = f.tick;
        frames.push(f);
      }
      sources[s.id] = createReplayIntentSource(frames);
    }

    const world = createSimWorld({
      courseId: log.courseId,
      mode: log.mode || 'race',
      laps: log.laps ?? 3,
      seed: log.seed >>> 0,
      finishRule: log.finishRule || 'primary',
      seats: log.seats,
    });

    const seatInputs = Object.create(null);
    for (let t = 0; t < log.ticks; t++) {
      if (world.state.done) {
        return { ok: false, error: 'ticks_past_end', simVersion: expectedSimVersion || log.simVersion || '', endHash: stateHash(world) };
      }
      for (const [seatId, source] of Object.entries(sources)) {
        seatInputs[seatId] = source.sample(t);
      }
      world.step(seatInputs);
    }

    const endHash = stateHash(world);
    const standings = world.standings();
    const winnerSeat = standings[0]?.seat ?? null;

    if (log.claimed) {
      if (log.claimed.winnerSeat !== undefined && log.claimed.winnerSeat !== winnerSeat) {
        return { ok: false, error: 'claimed_winner_mismatch', simVersion: expectedSimVersion || log.simVersion || '', endHash };
      }
      if (log.claimed.endHash && log.claimed.endHash !== endHash) {
        return { ok: false, error: 'claimed_hash_mismatch', simVersion: expectedSimVersion || log.simVersion || '', endHash };
      }
    }

    return {
      ok: true,
      simVersion: expectedSimVersion || log.simVersion || '',
      winnerSeat,
      standings,
      ticks: world.state.tick,
      elapsed: world.state.elapsed,
      done: world.state.done,
      endHash,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'replay_exception',
      simVersion: expectedSimVersion || '',
      endHash: '0000000000000000',
    };
  }
}

export function chunkLog(jsonString, id = 'r0') {
  const chunks = [];
  const prefixMax = id.length + 16;
  const partLen = Math.max(256, LOG_CHUNK_BYTES - prefixMax);
  const total = Math.max(1, Math.ceil(jsonString.length / partLen));
  for (let i = 0; i < total; i++) {
    const part = jsonString.slice(i * partLen, (i + 1) * partLen);
    chunks.push(`${id}:${i}:${total}:${part}`);
  }
  return chunks;
}

export function joinChunks(chunks) {
  if (!Array.isArray(chunks) || !chunks.length) return null;
  let expectedId = null;
  let total = 0;
  const parts = [];
  for (let i = 0; i < chunks.length; i++) {
    const raw = String(chunks[i] ?? '');
    const c1 = raw.indexOf(':');
    const c2 = raw.indexOf(':', c1 + 1);
    const c3 = raw.indexOf(':', c2 + 1);
    if (c1 <= 0 || c2 <= c1 + 1 || c3 <= c2 + 1) return null;
    const id = raw.slice(0, c1);
    const idx = Number(raw.slice(c1 + 1, c2));
    const count = Number(raw.slice(c2 + 1, c3));
    const body = raw.slice(c3 + 1);
    if (!Number.isInteger(idx) || !Number.isInteger(count) || count < 1 || idx < 0 || idx >= count) return null;
    if (expectedId === null) {
      expectedId = id;
      total = count;
    } else if (id !== expectedId || count !== total) {
      return null;
    }
    parts[idx] = body;
  }
  for (let i = 0; i < total; i++) {
    if (parts[i] === undefined) return null;
  }
  return parts.join('');
}

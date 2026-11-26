import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMockRealtimeServer, mockLabelMatches } from '@metaverse/hub-sdk/mock';

import {
  BTN_DRIFT_BOOST_PRESSED,
  BTN_DRIFT_HELD,
  BTN_DRIFT_PRESSED,
  BTN_ITEM_PRESSED,
  controlsToIntentFrame,
} from '../src/sim/intent.js';
import { createSimWorld } from '../src/sim/world.js';
import { captureSnapshot, encodeWireSnapshot } from '../src/sim/snapshot.js';
import { stateHash } from '../src/sim/hash.js';
import { createLogRecorder, replayLog } from '../src/sim/replay.js';
import {
  buildOpenMatchQuery,
  createClientPredictor,
  createHubLobby,
  createLoopbackRoom,
  createManualScheduler,
  createRemoteInputBuffer,
  createSnapshotBuffer,
  decodeInputPacket,
  encodeInputPacket,
  generateRoomCode,
  makeMatchLabel,
  normalizeRoomCode,
  OP,
  RACER_SIM_VERSION,
  realtimeForHub,
  RPC_IDS,
  validateRacerChoice,
} from '../src/net/index.js';

describe('protocol, room codes, Bleve labels, and Relic/hostile-key guards', () => {
  it('generates and normalizes unambiguous 6-char room codes and rejects invalid characters', () => {
    let i = 0;
    const code = generateRoomCode(() => ((i += 5) % 30) / 30);
    assert.equal(code.length, 6);
    assert.equal(normalizeRoomCode(` ${code.slice(0, 3)}-${code.slice(3).toLowerCase()} `), code);
    assert.equal(normalizeRoomCode('OOOO00'), null, 'ambiguous 0/O excluded');
    assert.equal(normalizeRoomCode('111III'), null, 'ambiguous 1/I excluded');
    assert.equal(normalizeRoomCode('ABC'), null);
  });

  it('builds +label.open:T queries that match boolean open labels in @metaverse/hub-sdk/mock', () => {
    const openLabel = makeMatchLabel({ open: true, courseId: 'track02', mode: 'race', players: 3, maxSeats: 6 });
    const closedLabel = makeMatchLabel({ open: false, courseId: 'track02', mode: 'race', players: 6, maxSeats: 6 });
    const query = buildOpenMatchQuery({ courseId: 'track02', mode: 'race', maxSeats: 6 });

    assert.ok(query.includes('+label.open:T') && !query.includes(':true'));
    assert.equal(mockLabelMatches(openLabel, query), true);
    assert.equal(mockLabelMatches(closedLabel, query), false);
  });

  it('enforces Relic unlock rules and rejects hostile economy/prototype keys', () => {
    const table = [
      { relic: 'cones_tip', kind: 'car', id: 'manta' },
      { relic: 'dragon_scale', kind: 'character', id: 'sproto' },
    ];
    assert.equal(validateRacerChoice({ car: 'manta', driver: 'pip' }, [], table).error, 'locked_car');
    assert.equal(validateRacerChoice({ car: 'apex', driver: 'sproto' }, [], table).error, 'locked_driver');
    assert.equal(validateRacerChoice({ car: 'manta', driver: 'sproto' }, ['cones_tip', 'dragon_scale'], table).ok, true);

    for (const bad of [
      { car: 'apex', driver: 'pip', winner: 0 },
      { car: 'apex', driver: 'pip', tickets: 999 },
      { car: 'apex', driver: 'pip', meta: { earn: 50 } },
      { car: 'apex', driver: 'pip', god: true },
    ]) {
      assert.equal(validateRacerChoice(bad, []).error, 'forbidden_field');
    }
  });

  it('encodes and decodes redundant binary OP.INPUT packets cleanly', () => {
    const f2 = controlsToIntentFrame(12, { throttle: 1, steer: -0.73, driftHeld: true, driftBoostPressed: true });
    const f1 = controlsToIntentFrame(11, { throttle: 1, steer: -0.70, driftHeld: true });
    const f0 = controlsToIntentFrame(10, { throttle: 1, steer: -0.65, driftPressed: true, driftHeld: true });
    const bytes = encodeInputPacket(3, [f2, f1, f0]);
    assert.equal(bytes.byteLength, 2 + 3 * 12);

    const decoded = decodeInputPacket(bytes);
    assert.equal(decoded.seat, 3);
    assert.equal(decoded.frames.length, 3);
    assert.equal(decoded.frames[0].tick, 12);
    assert.ok(decoded.frames[0].buttons & BTN_DRIFT_BOOST_PRESSED);
    assert.ok(decoded.frames[2].buttons & BTN_DRIFT_PRESSED);
  });

  it('realtimeForHub returns null safely when standalone or hub game is unregistered', async () => {
    assert.equal(await realtimeForHub(null), null);
    assert.equal(await realtimeForHub({ ready: Promise.resolve(), link: { api: null, status: 'bad_game' } }), null);
  });
});

describe('RemoteInputBuffer, SnapshotBuffer, and ClientPredictor', () => {
  it('preserves button edges across late/skipped ticks and strips edges on hold-last & disconnect', () => {
    const buf = createRemoteInputBuffer({ seatCount: 4, maxHoldTicks: 4 });
    buf.push(1, controlsToIntentFrame(5, { throttle: 1, steer: 0.5, driftHeld: true, driftPressed: true, itemPressed: true }));

    // Consume at tick 6 (tick 5 was skipped/coalesced): edge flags from tick 5 must carry into tick 6 once!
    const at6 = buf.seat(1).next(6);
    assert.ok(at6.buttons & BTN_DRIFT_PRESSED, 'driftPressed carried from skipped tick 5');
    assert.ok(at6.buttons & BTN_ITEM_PRESSED, 'itemPressed carried from skipped tick 5');
    assert.ok(at6.buttons & BTN_DRIFT_HELD, 'driftHeld maintained');

    // Tick 7 has no new packet: held state persists, one-shot edges MUST be cleared!
    const at7 = buf.seat(1).next(7);
    assert.equal(at7.buttons & (BTN_DRIFT_PRESSED | BTN_ITEM_PRESSED), 0, 'edges never repeat on hold-last');
    assert.ok(at7.buttons & BTN_DRIFT_HELD, 'held drift continues during brief jitter');

    // Disconnect clears held buttons and throttle immediately.
    buf.markDisconnected(1);
    const at8 = buf.seat(1).next(8);
    assert.equal(at8.throttle, 0);
    assert.equal(at8.buttons, 0);
  });

  it('interpolates unwrapped multi-lap kart.s, shortest-arc yaw, and snaps on rescue teleports', () => {
    const snaps = createSnapshotBuffer({ interpolationDelayMs: 50 });
    // Lap 1 -> Lap 2 seam around s = 6616.87m (unwrapped!).
    snaps.push({
      tick: 600,
      elapsed: 10,
      actors: [{ id: 0, kart: { s: 6610, x: -2, y: 0, yaw: Math.PI - 0.1, travelYaw: Math.PI - 0.1, rescues: 0, fall: null } }],
    });
    snaps.push({
      tick: 603,
      elapsed: 10.05,
      actors: [{ id: 0, kart: { s: 6626, x: 2, y: 0, yaw: -Math.PI + 0.1, travelYaw: -Math.PI + 0.1, rescues: 0, fall: null } }],
    });

    // Render at target = 10025 ms (halfway between tick 600 = 10000ms and tick 603 = 10050ms, +50ms interp delay = 10075ms).
    const mid = snaps.sample(10075);
    assert.ok(Math.abs(mid.karts[0].s - 6618) < 1e-6, 'kart.s stays unwrapped across lap boundary');
    assert.ok(Math.abs(Math.abs(mid.karts[0].yaw) - Math.PI) < 0.15, 'shortest-arc yaw crosses +-PI without spinning');

    // Rescue increment between snapshots must snap instead of lerping backwards across the map!
    snaps.push({
      tick: 606,
      elapsed: 10.10,
      actors: [{ id: 0, kart: { s: 6520, x: 0, y: 0, yaw: 0, travelYaw: 0, rescues: 1, fall: null } }],
    });
    const duringRescue = snaps.sample(10125);
    assert.equal(duringRescue.karts[0].s, 6626, 'does not drag kart mid-teleport');
  });

  it('forward-steps remote pack karts during ClientPredictor reconciliation without phantom stalls', () => {
    const seats = [
      { id: 0, kind: 'local', car: 'apex', driver: 'sproto', gridIndex: 1 },
      { id: 1, kind: 'remote', car: 'manta', driver: 'cone', gridIndex: 0 },
    ];
    const authWorld = createSimWorld({ courseId: 'track01', seed: 1234, seats });
    const predWorld = createSimWorld({ courseId: 'track01', seed: 1234, seats });
    authWorld.state.countdown = 0;
    predWorld.state.countdown = 0;
    // Put remote kart 9m ahead at 65 m/s (234 km/h) and local kart right behind at 65 m/s!
    for (const w of [authWorld, predWorld]) {
      w.state.actors[0].kart.s = 100;
      w.state.actors[0].kart.speed = 65;
      w.state.actors[1].kart.s = 109;
      w.state.actors[1].kart.speed = 65;
    }

    const remoteBuf = createRemoteInputBuffer({ seatCount: 2 });
    remoteBuf.push(1, controlsToIntentFrame(0, { throttle: 1, steer: 0 }));
    const predictor = createClientPredictor({ world: predWorld, localSeat: 0, remoteInputBuffer: remoteBuf });

    // Step 6 ticks (100 ms RTT) locally while server steps with real remote input.
    for (let t = 0; t < 6; t++) {
      const localIn = controlsToIntentFrame(t, { throttle: 1, steer: 0.05 });
      const remoteIn = controlsToIntentFrame(t, { throttle: 1, steer: 0 });
      predictor.stepLocal(localIn);
      if (t < 3) authWorld.step({ 0: localIn, 1: remoteIn });
    }
    const authSnapAt3 = captureSnapshot(authWorld);
    // Finish stepping authWorld to tick 6 with slight remote steer change on ticks 3..5.
    for (let t = 3; t < 6; t++) {
      authWorld.step({
        0: controlsToIntentFrame(t, { throttle: 1, steer: 0.05 }),
        1: controlsToIntentFrame(t, { throttle: 1, steer: 0.12 }),
      });
    }

    // Reconcile predWorld from authoritative tick 3 back up to tick 6:
    const rec = predictor.reconcile(authSnapAt3);
    assert.equal(rec.resimulatedTicks, 3);
    assert.equal(rec.hardSnapped, false);
    assert.equal(predWorld.state.actors[0].kart.kartImpact, 0, 'no phantom pack collision during rollback');
    assert.ok(predictor.smoother.errorMagnitude < 0.25);
    predictor.smoother.update(0.1);
    assert.ok(predictor.smoother.errorMagnitude < 0.05);
  });
});

describe('@metaverse/hub-sdk/mock & LoopbackRoom multiplayer race simulation', () => {
  it('runs matchmaking, room codes, authoritative 6-kart ticks, and drop/onRejoin resync over MockRealtimeServer', async () => {
    const server = createMockRealtimeServer();
    const roomsByCode = new Map();

    // Register authoritative Sproto Racer match handler on the mock Hub server.
    server.registerMatch('sproto_racer', {
      init(params) {
        const courseId = params.courseId || 'track01';
        const code = params.code || null;
        const seats = Array.from({ length: 6 }, (_, i) => ({
          id: i,
          kind: i < 2 ? 'remote' : 'ai',
          car: ['apex', 'barrage', 'manta', 'saucer', 'ironhide', 'geep'][i],
          driver: ['sproto', 'cone', 'milady', 'pepe', 'remilio', 'wojak'][i],
          gridIndex: i === 0 ? 5 : i - 1,
        }));
        const world = createSimWorld({ courseId, seed: 0x5150, seats, finishRule: 'all_humans' });
        const inputBuf = createRemoteInputBuffer({ seatCount: 6 });
        const seatByUser = new Map();
        const label = makeMatchLabel({ open: !code, courseId, mode: 'race', players: 0, maxSeats: 6, code });
        return { state: { world, inputBuf, seatByUser, courseId, code }, label };
      },
      join(st, presences, dispatcher) {
        for (const p of presences) {
          if (!st.seatByUser.has(p.userId)) {
            st.seatByUser.set(p.userId, st.seatByUser.size);
          }
          const seat = st.seatByUser.get(p.userId);
          dispatcher.broadcast(OP.WELCOME, {
            seat,
            simVersion: RACER_SIM_VERSION,
            snapshot: captureSnapshot(st.world),
          }, [p]);
        }
        dispatcher.setLabel(
          makeMatchLabel({
            open: !st.code && st.seatByUser.size < 2,
            courseId: st.courseId,
            players: st.seatByUser.size,
            maxSeats: 6,
            code: st.code,
          }),
        );
      },
      loop(st, messages, dispatcher) {
        for (const m of messages) {
          const seat = st.seatByUser.get(m.sender.userId);
          if (seat === undefined) continue;
          if (m.opCode === OP.INPUT) {
            const pkt = decodeInputPacket(m.data);
            if (pkt && pkt.seat === seat) st.inputBuf.push(seat, pkt.frames, st.world.state.tick);
          } else if (m.opCode === OP.RESYNC) {
            dispatcher.broadcast(OP.SNAPSHOT, { full: captureSnapshot(st.world) }, [m.sender]);
          }
        }
        const inputs = {
          0: st.inputBuf.seat(0).next(st.world.state.tick),
          1: st.inputBuf.seat(1).next(st.world.state.tick),
        };
        st.world.step(inputs);
        if (st.world.state.tick % 3 === 0) {
          dispatcher.broadcast(OP.SNAPSHOT, encodeWireSnapshot(st.world));
        }
      },
    });

    server.registerRpc(RPC_IDS.ROOM_CREATE, (_ctx, body) => {
      const code = generateRoomCode(() => 0.42);
      const matchId = server.createMatch('sproto_racer', { courseId: body?.courseId || 'track02', code });
      roomsByCode.set(code, matchId);
      return { matchId, code };
    });
    server.registerRpc(RPC_IDS.ROOM_JOIN, (_ctx, body) => {
      const matchId = roomsByCode.get(body?.code);
      return matchId ? { matchId } : {};
    });
    server.registerRpc(RPC_IDS.ONLINE_COUNT, () => ({ count: 14 }));

    const rtHost = server.connect({ userId: 'u-host', username: 'HostRacer' });
    const rtGuest = server.connect({ userId: 'u-guest', username: 'GuestRacer' });
    const hostLobby = createHubLobby(rtHost);
    const guestLobby = createHubLobby(rtGuest);

    assert.equal(await hostLobby.onlineCount(), 14);

    // Create private room and join with lowercase/hyphenated code.
    const created = await hostLobby.createRoom({ courseId: 'track02' });
    const joined = await guestLobby.joinRoom(`${created.code.slice(0, 3).toLowerCase()}-${created.code.slice(3)}`);
    assert.equal(joined.matchId, created.matchId);
    await server.flush();

    const guestSnaps = createSnapshotBuffer();
    let fullResyncCount = 0;
    joined.transport.onMessage((msg) => {
      if (msg.opCode === OP.SNAPSHOT) {
        const data = msg.json();
        if (data.full) {
          guestSnaps.resync(data.full);
          fullResyncCount++;
        } else {
          guestSnaps.push(data);
        }
      }
    });
    joined.transport.onRejoin(() => {
      joined.transport.send(OP.RESYNC, {});
    });

    for (let t = 0; t < 30; t++) {
      created.transport.send(OP.INPUT, encodeInputPacket(0, controlsToIntentFrame(t, { throttle: 1, steer: 0.2 })));
      joined.transport.send(OP.INPUT, encodeInputPacket(1, controlsToIntentFrame(t, { throttle: 1, steer: -0.15 })));
      server.tick(1);
      await server.flush();
    }
    assert.ok(guestSnaps.latestTick >= 27);

    // Simulate WebSocket drop on guest -> automatic reconnect -> onRejoin -> OP.RESYNC -> fast snapshot resync!
    server.drop('u-guest');
    server.tick(15);
    await server.flush();
    // Wait briefly for mock client reconnect timer / microtasks if scheduled, or verify rejoin callback when open.
    await new Promise((r) => setTimeout(r, 650));
    server.tick(1);
    await server.flush();
    assert.equal(rtGuest.state, 'open');
    assert.ok(fullResyncCount >= 1, 'onRejoin requested and applied full snapshot resync');
    assert.ok(guestSnaps.latestTick >= 45);

    await created.transport.leave();
    await joined.transport.leave();
    rtHost.disconnect();
    rtGuest.disconnect();
  });

  it('completes a deterministic LoopbackRoom session under 100ms RTT, 20ms jitter, and 5% packet loss', () => {
    const scheduler = createManualScheduler();
    const room = createLoopbackRoom({
      scheduler,
      seed: 0x13572468,
      latencyMs: 50, // 50ms one-way = 100ms RTT
      jitterMs: 20,
      lossRate: 0.05,
    });
    const hostPeer = room.joinPeer({ userId: 'p0' });
    const clientPeer = room.joinPeer({ userId: 'p1' });

    const seats = [
      { id: 0, kind: 'local', car: 'apex', driver: 'sproto', gridIndex: 1 },
      { id: 1, kind: 'remote', car: 'barrage', driver: 'cone', gridIndex: 0 },
      { id: 2, kind: 'ai', car: 'saucer', driver: 'milady', gridIndex: 2 },
    ];
    const hostWorld = createSimWorld({ courseId: 'track01', seed: 8080, seats });
    const hostInBuf = createRemoteInputBuffer({ seatCount: 3 });
    const recorder = createLogRecorder({ seats });
    const clientSnaps = createSnapshotBuffer({ interpolationDelayMs: 66 });

    hostPeer.onMessage((msg) => {
      if (msg.opCode === OP.INPUT) {
        const pkt = decodeInputPacket(msg.data);
        if (pkt) hostInBuf.push(pkt.seat, pkt.frames, hostWorld.state.tick + 12);
      }
    });
    clientPeer.onMessage((msg) => {
      if (msg.opCode === OP.SNAPSHOT) clientSnaps.push(msg.json());
    });

    const recentClientFrames = [];
    for (let t = 0; t < 240; t++) {
      const cf = controlsToIntentFrame(t, { throttle: 1, steer: Math.sin(t * 0.06) * 0.5 });
      recentClientFrames.unshift(cf);
      if (recentClientFrames.length > 3) recentClientFrames.pop();
      // Send unreliable input with 3-frame redundant tail over lossy jittered link.
      clientPeer.send(OP.INPUT, encodeInputPacket(1, recentClientFrames), { reliable: false });

      scheduler.advance(1000 / 60);

      const hf = controlsToIntentFrame(t, { throttle: 1, steer: -0.1 });
      const rf = hostInBuf.seat(1).next(t);
      recorder.record(t, 0, hf);
      recorder.record(t, 1, rf);
      hostWorld.step({ 0: hf, 1: rf });

      if (t % 3 === 0) {
        hostPeer.send(OP.SNAPSHOT, encodeWireSnapshot(hostWorld), { reliable: false });
      }
    }
    scheduler.advance(200);

    assert.ok(clientSnaps.size > 0, 'client received snapshots across lossy link');
    const log = recorder.finish(hostWorld, RACER_SIM_VERSION);
    const verified = replayLog(log, RACER_SIM_VERSION);
    assert.equal(verified.ok, true);
    assert.equal(verified.endHash, stateHash(hostWorld));
  });
});

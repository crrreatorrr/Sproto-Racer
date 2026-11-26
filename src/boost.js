import {driftBoostReady} from './driving.js';
import {exp} from './sim/math.js';

const GOOD = 0.70;
export const PERFECT_CHARGE = 0.90;
const GOOD_SECONDS = 0.8;
const PERFECT_SECONDS = 1.2;

// gain is the car's Boost stat: every grant lasts this many times longer. It belongs to the car,
// so resets carry it over.
export function createBoost(gain = 1) {
  return {
    gain,
    tier: 0, reserve: 0, reservePeak: 0, meter: 0, pips: 0, rev: 0,
    feedback: '', feedbackTime: 0, chainClosed: false,
    activeSlide: null, comboLength: 0, interrupted: false, ignition: 0, plume: 0, flameTier: 1, revThrottle: 0,
    skyChain: 0, skyTier: 0, skyTimer: 0, skyCells: 0
  };
}

// Sky Lane chain. Boost Cells are the only boost source in the air: each one adds
// boost time and chain, and chain thresholds set the flight speed tier. A tier
// drop falls back one step, never to zero.
export const TRICK_SECONDS_BOOST = 0.5;
export const SKY_TIER_CHAIN = [0, 3, 6, 10];
export const SKY_CHAIN_SECONDS = 2.5;
export const CELL_SECONDS = 0.35;
export const MEGA_CELL_SECONDS = 1.5;

function tierForChain(chain) {
  let tier = 0;
  for (let i = 1; i < SKY_TIER_CHAIN.length; i++) if (chain >= SKY_TIER_CHAIN[i]) tier = i;
  return tier;
}

export function grantCell(boost, mega = false) {
  const before = boost.skyTier;
  grantBoost(boost, mega ? MEGA_CELL_SECONDS : CELL_SECONDS, mega ? 2 : 1);
  boost.skyChain += mega ? 2 : 1;
  boost.skyCells++;
  boost.skyTier = tierForChain(boost.skyChain);
  boost.skyTimer = SKY_CHAIN_SECONDS;
  report(boost, `${mega ? 'MEGA CELL' : 'CELL'} +${(mega ? MEGA_CELL_SECONDS : CELL_SECONDS).toFixed(mega ? 1 : 2)}s`);
  return boost.skyTier > before;
}

export function dropSkyTier(boost, steps = 1) {
  if (!boost.skyChain && !boost.skyTier) return;
  boost.skyTier = Math.max(0, boost.skyTier - steps);
  boost.skyChain = Math.min(boost.skyChain, SKY_TIER_CHAIN[boost.skyTier]);
  boost.skyTimer = SKY_CHAIN_SECONDS;
}

export function stepSkyChain(boost, kart, dt) {
  if (!kart.flying) return;
  if (kart.skyScraped) boost.skyTimer -= 0.8;
  boost.skyTimer -= dt;
  if (boost.skyTimer <= 0) {
    if (boost.skyTier > 0) dropSkyTier(boost, 1);
    else {
      boost.skyChain = 0;
      boost.skyTimer = 0;
    }
  }
}

export function clearSky(boost) {
  boost.skyChain = 0;
  boost.skyTier = 0;
  boost.skyTimer = 0;
  boost.skyCells = 0;
}

function report(boost, label) {
  boost.feedback = label;
  boost.feedbackTime = 0.85;
  return label;
}

// Impacts win over pads, items and drift rewards collected in the same tick.
export function interruptBoost(boost,kart,label) {
  Object.assign(boost,createBoost(boost.gain),{
    interrupted:true, activeSlide:kart.sliding?kart.slideId:null, chainClosed:kart.sliding
  });
  if(label)report(boost,label);
}

// `scaled` is false for boost that isn't the car's own to earn (stolen boost, test setups).
/**
 * The meter's GOOD and PERFECT bands. During the countdown the meter shows the launch revs,
 * which every car grades on the same 0.70 / 0.90; while racing it shows the car's drift windows.
 */
export function meterBands(kart, launching) {
  if (launching) return { good: GOOD, perfect: PERFECT_CHARGE };
  return { good: kart?.tuning?.goodAt ?? GOOD, perfect: kart?.tuning?.perfectAt ?? PERFECT_CHARGE };
}

/** The grade a drift release would get right now: 'PERFECT', 'GOOD' or null. Windows follow the car. */
export function driftGrade(boost, kart) {
  if (!driftBoostReady(boost, kart)) return null;
  return boost.meter + 1e-9 >= (kart?.tuning?.perfectAt ?? PERFECT_CHARGE) ? 'PERFECT' : 'GOOD';
}

export function grantBoost(boost, seconds, tier = 1, scaled = true) {
  if (seconds <= 0 || boost.interrupted) return;
  if (scaled) seconds *= boost.gain ?? 1;
  if(seconds>.15 || !boost.tier || tier>boost.tier)boost.ignition=1;
  boost.reserve += seconds;
  boost.reservePeak = Math.max(boost.reservePeak, boost.reserve);
  boost.tier = Math.min(2, Math.max(1, tier, boost.tier));
}

export function updateRevs(boost, throttle, dt) {
  boost.revThrottle = throttle;
  // The needle saturates when held. Lifting in time lets the player recover.
  const delta = throttle > 0.15 ? throttle * 1.45 : -2.15;
  boost.rev = Math.max(0, Math.min(1, boost.rev + delta * dt));
}

export function gradeLaunch(boost) {
  const {rev, revThrottle} = boost;
  if (revThrottle <= 0.15 || rev < GOOD) return report(boost, 'GO');
  if (rev >= 1) return report(boost, 'OVER-REV');
  if (rev >= PERFECT_CHARGE) {
    grantBoost(boost, 1);
    return report(boost, 'PERFECT LAUNCH');
  }
  grantBoost(boost, 0.5);
  return report(boost, 'GOOD LAUNCH');
}

export function stepBoost(boost, kart, input, dt) {
  boost.interrupted=false;
  boost.ignition*=exp(-dt*8);
  if(boost.tier)boost.flameTier=boost.tier;
  const target=boost.tier?1:0;
  boost.plume=target+(boost.plume-target)*exp(-dt*(target?20:9));
  boost.reserve = Math.max(0, boost.reserve - dt);
  if (!boost.reserve) {
    boost.tier = 0;
    boost.reservePeak = 0;
  }
  boost.feedbackTime = Math.max(0, boost.feedbackTime - dt);
  if (!boost.feedbackTime) boost.feedback = '';

  if(kart.stunRemaining>0)return;
  const slide=kart.sliding ? kart.slideId : null;
  if(slide!==boost.activeSlide){
    boost.meter=0;
    boost.pips=0;
    boost.comboLength=0;
    boost.chainClosed=false;
    boost.activeSlide=slide;
  }
  if (kart.wallImpact > 0) {
    interruptBoost(boost,kart,'RAIL HIT');
    return;
  }
  // Sky Lanes give boost only through Boost Cells, so their landing earns none.
  if (kart.trickSloppy) {
    // Landing mid-trick forfeits both the trick and the air boost.
    report(boost, 'SLOPPY LANDING');
    kart.trickSloppy = false;
  } else {
    if (kart.landed && kart.lastAirTime > 0.43 && !(kart.skyCarry > 0)) {
      grantBoost(boost, Math.min(1.35, (kart.lastAirTime - 0.24) * 0.85));
      report(boost, 'AIR BOOST');
    }
    // Ramp tricks pay out on a clean landing, on top of any air boost.
    if (kart.trickLanded > 0) {
      const n = kart.trickLanded;
      grantBoost(boost, TRICK_SECONDS_BOOST * n);
      report(boost, `TRICK${n > 1 ? ' ×' + n : ''} +${(TRICK_SECONDS_BOOST * n).toFixed(1)}s`);
      kart.trickLanded = 0;
    }
  }
  if(slide===null || boost.chainClosed)return;
  const pressed=input.driftHeld && input.driftBoostPressed;
  const grade=driftGrade(boost,kart);
  if((kart.boostRelease || pressed) && grade){
    const perfect = grade==='PERFECT';
    const reserve=(perfect ? PERFECT_SECONDS : GOOD_SECONDS)*(boost.gain??1);
    boost.comboLength++;
    grantBoost(boost,reserve,1,false);
    boost.pips++;
    boost.meter = 0;
    boost.chainClosed = boost.pips === 3;
    const combo=boost.comboLength>1 ? `COMBO ×${boost.comboLength} · ` : '';
    report(boost, `${combo}${grade} +${reserve.toFixed(1)}s`);
    return;
  }
  if(pressed){
    boost.comboLength=0;
    report(boost,'TOO EARLY');
  }
  if(input.driftHeld){
    boost.meter=Math.min(1,boost.meter+dt);
    if(boost.meter>=1-1e-9){
      boost.meter=1;
      boost.comboLength=0;
      boost.chainClosed=true;
      report(boost,'TOO LATE');
    }
  }
}

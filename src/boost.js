import {driftBoostReady} from './driving.js';
import {exp} from './sim/math.js';

const GOOD = 0.70;
export const PERFECT_CHARGE = 0.90;
const GOOD_SECONDS = 0.8;
const PERFECT_SECONDS = 1.2;

export function createBoost() {
  return {
    tier: 0, reserve: 0, reservePeak: 0, meter: 0, pips: 0, rev: 0,
    feedback: '', feedbackTime: 0, chainClosed: false,
    activeSlide: null, comboLength: 0, interrupted: false, ignition: 0, plume: 0, flameTier: 1, revThrottle: 0
  };
}

function report(boost, label) {
  boost.feedback = label;
  boost.feedbackTime = 0.85;
  return label;
}

// Impacts win over pads, items and drift rewards collected in the same tick.
export function interruptBoost(boost,kart,label) {
  Object.assign(boost,createBoost(),{
    interrupted:true, activeSlide:kart.sliding?kart.slideId:null, chainClosed:kart.sliding
  });
  if(label)report(boost,label);
}

export function grantBoost(boost, seconds, tier = 1) {
  if (seconds <= 0 || boost.interrupted) return;
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
  if (kart.landed && kart.lastAirTime > 0.43) {
    grantBoost(boost, Math.min(1.35, (kart.lastAirTime - 0.24) * 0.85));
    report(boost, 'AIR BOOST');
  }
  if(slide===null || boost.chainClosed)return;
  const pressed=input.driftHeld && input.driftBoostPressed;
  if((kart.boostRelease || pressed) && driftBoostReady(boost)){
    const perfect = boost.meter + 1e-9 >= PERFECT_CHARGE;
    const grade=perfect?'PERFECT':'GOOD';
    const reserve=perfect ? PERFECT_SECONDS : GOOD_SECONDS;
    boost.comboLength++;
    grantBoost(boost,reserve);
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

import {HARD_WALL_IMPACT,driftBoostReady} from './driving.js';

const GOOD = 0.70;
const PERFECT = 0.90;
const MAX_RESERVE = 5;

export function createBoost() {
  return {
    tier: 0, reserve: 0, meter: 0, pips: 0, rev: 0,
    feedback: '', feedbackTime: 0, chainClosed: false,
    activeSlide: null, ignition: 0, plume: 0, flameTier: 1, revThrottle: 0
  };
}

function report(boost, label) {
  boost.feedback = label;
  boost.feedbackTime = 0.85;
  return label;
}

export function grantBoost(boost, seconds, tier = 1) {
  if (seconds <= 0) return;
  if(seconds>.15 || !boost.tier || tier>boost.tier)boost.ignition=1;
  boost.reserve = Math.min(MAX_RESERVE, boost.reserve + seconds);
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
  if (rev >= PERFECT) {
    grantBoost(boost, 1);
    return report(boost, 'PERFECT LAUNCH');
  }
  grantBoost(boost, 0.5);
  return report(boost, 'GOOD LAUNCH');
}

export function stepBoost(boost, kart, input, dt) {
  boost.ignition*=Math.exp(-dt*8);
  if(boost.tier)boost.flameTier=boost.tier;
  const target=boost.tier?1:0;
  boost.plume=target+(boost.plume-target)*Math.exp(-dt*(target?20:9));
  boost.reserve = Math.max(0, boost.reserve - dt);
  if (!boost.reserve) boost.tier = 0;
  boost.feedbackTime = Math.max(0, boost.feedbackTime - dt);
  if (!boost.feedbackTime) boost.feedback = '';

  if(kart.stunRemaining>0)return;
  const slide=kart.sliding ? kart.slideId : null;
  if(slide!==boost.activeSlide){
    boost.meter=0;
    boost.pips=0;
    boost.chainClosed=false;
    boost.activeSlide=slide;
  }
  if (kart.wallImpact > HARD_WALL_IMPACT) {
    boost.reserve = 0;
    boost.tier = 0;
    report(boost, 'RAIL HIT');
    return;
  }
  if (kart.landed && kart.lastAirTime > 0.43) {
    grantBoost(boost, Math.min(1.35, (kart.lastAirTime - 0.24) * 0.85));
    report(boost, 'AIR BOOST');
  }
  if(slide===null || boost.chainClosed)return;
  const pressed=input.driftHeld && input.driftBoostPressed;
  if((kart.boostRelease || pressed) && driftBoostReady(boost)){
    const perfect = boost.meter + 1e-9 >= PERFECT;
    const precision=Math.max(0,Math.min(1,(boost.meter-GOOD)/(1-GOOD)));
    const reserve=.70+precision*.60+(perfect ? .20 : 0)+(boost.pips===2 ? .28 : 0);
    grantBoost(boost,reserve);
    boost.pips++;
    boost.meter = 0;
    boost.chainClosed = boost.pips === 3;
    report(boost, perfect ? 'PERFECT' : 'GOOD');
    return;
  }
  if(pressed)report(boost,'TOO EARLY');
  if(input.driftHeld){
    boost.meter=Math.min(1,boost.meter+dt);
    if(boost.meter>=1-1e-9){
      boost.meter=1;
      boost.chainClosed=true;
      report(boost,'TOO LATE');
    }
  }
}

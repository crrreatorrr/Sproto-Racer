// The two weights describe a first-place and a last-place pickup respectively.
export const ITEMS = [
  {name:'Soda Turbo', model:'soda', description:'A quick burst of speed.', color:'#dcff54', weights:[19,8]},
  {name:'Bumper Ball', model:'ball', description:'Roll a bouncing ball. Brake to fire backward.', color:'#ff884b', weights:[16,5]},
  {name:'Bubble Wrap', model:'bubble', description:'Block one hit. Lasts up to six seconds.', color:'#84efff', weights:[13,5]},
  {name:'Sticky Blob', model:'slip', description:'Drop a slippery jelly patch behind you.', color:'#b79aff', weights:[15,2]},
  {name:'Pop-Up Box', model:'box', description:'Drop a hitchhiking box. Hop twice to shake it off.', color:'#ff715c', weights:[12,2]},
  {name:'Homing Cursor', model:'cursor', description:'Chase the nearest rival within 125 m ahead.', color:'#ff7ab2', weights:[2,8]},
  {name:'Bass Speaker', model:'speaker', description:'Knock nearby rivals aside with a bass pulse.', color:'#cca3ff', weights:[6,5]},
  {name:'Tow Cable', model:'spool', description:'Hook a reachable kart ahead and pull into its slipstream.', color:'#7defff', weights:[0,6]},
  {name:'Triple Soda', model:'triple', description:'Three turbo bursts. Press once for each charge.', color:'#ffe36c', weights:[1,12], charges:3},
  {name:'Express Lane', model:'strip', description:'Lay four boost strips that any kart can use.', color:'#6bf7ce', weights:[1,5]},
  {name:'Ricochet Disc', model:'disc', description:'Skim a disc forward or backward with up to three rail bounces.', color:'#46d8ff', weights:[7,4]},
  {name:'Confetti Fan', model:'fan', description:'Fire three candy bolts in a spread. Brake to cover the rear.', color:'#ff9ecf', weights:[4,7]},
  {name:'Jelly Lob', model:'lob', description:'Toss a jelly pod. It bursts on landing and catches nearby rivals.', color:'#a6ed48', weights:[5,6]},
  {name:'Return Ring', model:'ring', description:'A returning ring tags each rival once on its round trip.', color:'#ffbf4c', weights:[4,5]},
  {name:'Static Puck', model:'puck', description:'Drop a proximity trap. It arms after a short delay and zaps a group.', color:'#c8a1ff', weights:[9,2]},
  {name:'Broom Bot', model:'broom', description:'For 2.8 seconds, sweep nearby rival shots and traps off the road.', color:'#9ff4da', weights:[7,4]},
  {name:'Spring Shoes', model:'spring', description:'Launch into a high jump from the ground to clear low attacks.', color:'#ffad75', weights:[6,4]},
  {name:'Soda Siphon', model:'siphon', description:'Steal up to 1.5 seconds of boost from a charged rival within 55 m ahead.', color:'#62f4eb', weights:[0,8]},
  {name:'Relay Rocket', model:'rocket', description:'Chase the frontmost rival within 240 m ahead. Watch for the warning.', color:'#ff685f', weights:[0,11]},
  {name:'Comet Candy', model:'comet', description:'Gain super turbo and a single-hit bubble for up to three seconds.', color:'#fff275', weights:[0,14]},
];

export function pickupWeights(actor,pack){
  let ahead=0, gap=0;
  for(const other of pack){
    if(other===actor)continue;
    const distance=(other.kart.fall?.exitS??other.kart.s)-actor.kart.s;
    if(distance>0 || other.finish!=null)ahead++;
    gap=Math.max(gap,distance);
  }
  const rank=ahead/Math.max(1,pack.length-1);
  const trailing=Math.min(1,rank*(1+Math.min(gap/150,1)*.22));
  return ITEMS.map(({weights:[first,last]})=>first+(last-first)*trailing);
}

export const PICKUP_SPIN_SECONDS=1.5;

export function startPickup(actor,pack,now){
  if(actor.finish!=null || actor.held!=null || actor.roulette || actor.unlimited)return;
  const weights=pickupWeights(actor,pack);
  let ticket=Math.random()*weights.reduce((sum,w)=>sum+w,0);
  const item=weights.findIndex(w=>(ticket-=w)<0);
  actor.roulette={item:Math.max(0,item),started:now};
}

export function pickupPreview(roulette,now){
  const progress=Math.min(1,Math.max(0,(now-roulette.started)/PICKUP_SPIN_SECONDS));
  // Cycle quickly at first, then linger on the final candidates before the reveal.
  const stepsLeft=Math.ceil(12*(1-progress)**1.5);
  return (roulette.item+stepsLeft*7)%ITEMS.length;
}

export function settlePickup(actor,now){
  const roll=actor.roulette;
  if(!roll)return;
  if(actor.finish==null){
    if(now-roll.started<PICKUP_SPIN_SECONDS)return;
    actor.held=roll.item;
    actor.charges=ITEMS[roll.item].charges??1;
  }
  actor.roulette=null;
}

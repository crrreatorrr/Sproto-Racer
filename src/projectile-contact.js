import {kartFootprint} from './kart-footprint.js';

// The window of the tick, 0 to 1, in which every slab tested so far overlaps. Kept at module
// level so a sweep creates no closures: this runs for every item against every kart each tick.
let enter=0,exit=1;

function slab(start,travel,extent,center){
  start-=center;
  if(Math.abs(travel)<1e-8)return Math.abs(start)<=extent;
  const t1=(-extent-start)/travel,t2=(extent-start)/travel;
  enter=Math.max(enter,Math.min(t1,t2));
  exit=Math.min(exit,Math.max(t1,t2));
  return enter<=exit;
}

// Sweep two moving centers in road distance, lane position and world elevation.
// Return the first contact in the tick. Distances wrap across the finish line.
export function contactTime(a,b,halfS,halfX,halfY,length,hull=null,scale=1,centerY=0){
  enter=0;exit=1;
  const gap=a.s0-b.s0,moveA=a.s-a.s0,moveB=b.s-b.s0;
  const s0=(gap-Math.round(gap/length)*length)*scale;
  const ds=((moveA-Math.round(moveA/length)*length)-(moveB-Math.round(moveB/length)*length))*scale;
  const x0=a.x0-b.x0,dx=(a.x-a.x0)-(b.x-b.x0);
  if(hull){
    const along=hull.along,across=hull.across;
    if(!slab(s0,ds,(along.hi-along.lo)/2+halfS,(along.hi+along.lo)/2) ||
      !slab(x0,dx,(across.hi-across.lo)/2+halfX,(across.hi+across.lo)/2))return Infinity;
    // Sweep the item's box against the rotated edges as well as road axes.
    const axes=hull.axes;
    for(let i=0;i<axes.length;i++){
      const n=axes[i];
      if(!slab(s0*n.s+x0*n.x,ds*n.s+dx*n.x,(n.hi-n.lo)/2+(halfS*Math.abs(n.s)+halfX*Math.abs(n.x)),(n.hi+n.lo)/2))return Infinity;
    }
  }else if(!slab(s0,ds,halfS,0) || !slab(x0,dx,halfX,0))return Infinity;
  return slab(a.y0-b.y0,(a.y-a.y0)-(b.y-b.y0),halfY,centerY)?enter:Infinity;
}

// Slack on the far-apart test below: far larger than any rounding in the sweep.
const REACH_MARGIN=.05;

// Actor paths are recorded 0.8 m above the tire contact plane. Sweep each
// height band separately so a high projectile can clear the hood.
//
// The answer is the earliest contact over all bands, exactly as if each band were passed to
// contactTime in turn. Two things make it cheap without changing that answer:
// - An item that stays further from the kart's center than the car's reach all tick cannot
//   overlap any band along the road or across it, so every band would report no contact.
// - A sweep is a set of overlap windows that must all intersect, so the order they are tested
//   in does not change the result. Height is tested first because it needs no outline, which
//   leaves most bands never turned to the kart's heading at all.
export function shapedItemContactTime(item,path,kart,padX,length){
  const shape=kartFootprint(kart),scale=path.roadScale===undefined?1:path.roadScale;
  const gap=item.s0-path.s0,moveA=item.s-item.s0,moveB=path.s-path.s0;
  const s0=(gap-Math.round(gap/length)*length)*scale;
  const ds=((moveA-Math.round(moveA/length)*length)-(moveB-Math.round(moveB/length)*length))*scale;
  const reach=shape.reach+REACH_MARGIN;
  if(Math.abs(s0)-Math.abs(ds)>reach+.70)return Infinity;
  const x0=item.x0-path.x0,dx=(item.x-item.x0)-(path.x-path.x0);
  if(Math.abs(x0)-Math.abs(dx)>reach+padX)return Infinity;
  const y0=item.y0-path.y0,dy=(item.y-item.y0)-(path.y-path.y0);
  const bands=shape.bands;
  let first=Infinity;
  for(let i=0;i<bands.length;i++){
    const part=bands[i],low=part.low,high=part.high;
    enter=0;exit=1;
    if(!slab(y0,dy,.80+(high-low)/2,(low+high)/2-.8))continue;
    const hull=part.hull,along=hull.along,across=hull.across;
    if(!slab(s0,ds,(along.hi-along.lo)/2+.70,(along.hi+along.lo)/2) ||
      !slab(x0,dx,(across.hi-across.lo)/2+padX,(across.hi+across.lo)/2))continue;
    const axes=hull.axes;
    let hit=true;
    for(let j=0;j<axes.length;j++){
      const n=axes[j];
      if(!slab(s0*n.s+x0*n.x,ds*n.s+dx*n.x,(n.hi-n.lo)/2+(.70*Math.abs(n.s)+padX*Math.abs(n.x)),(n.hi+n.lo)/2)){hit=false;break;}
    }
    if(hit)first=Math.min(first,enter);
  }
  return first;
}

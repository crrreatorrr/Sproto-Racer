import {kartFootprint} from './kart-footprint.js';

// Sweep two moving centers in road distance, lane position and world elevation.
// Return the first contact in the tick. Distances wrap across the finish line.
export function contactTime(a,b,halfS,halfX,halfY,length,hull=null,scale=1,centerY=0){
  const wrap=d=>d-Math.round(d/length)*length;
  let enter=0,exit=1;
  function slab(start,travel,extent,center=0){
    start-=center;
    if(Math.abs(travel)<1e-8)return Math.abs(start)<=extent;
    const t1=(-extent-start)/travel,t2=(extent-start)/travel;
    enter=Math.max(enter,Math.min(t1,t2));
    exit=Math.min(exit,Math.max(t1,t2));
    return enter<=exit;
  }
  const s0=wrap(a.s0-b.s0)*scale,ds=(wrap(a.s-a.s0)-wrap(b.s-b.s0))*scale;
  const x0=a.x0-b.x0,dx=(a.x-a.x0)-(b.x-b.x0);
  function band(start,travel,range,padding){
    return slab(start,travel,(range.hi-range.lo)/2+padding,(range.hi+range.lo)/2);
  }
  if(hull){
    if(!band(s0,ds,hull.along,halfS) || !band(x0,dx,hull.across,halfX))return Infinity;
    // Sweep the item's box against the rotated edges as well as road axes.
    for(const n of hull.axes){
      if(!band(s0*n.s+x0*n.x,ds*n.s+dx*n.x,n,halfS*Math.abs(n.s)+halfX*Math.abs(n.x)))return Infinity;
    }
  }else if(!slab(s0,ds,halfS) || !slab(x0,dx,halfX))return Infinity;
  return slab(a.y0-b.y0,(a.y-a.y0)-(b.y-b.y0),halfY,centerY)?enter:Infinity;
}

// Actor paths are recorded 0.8 m above the tire contact plane. Sweep each
// height band separately so a high projectile can clear the hood.
export function shapedItemContactTime(item,path,kart,padX,length){
  const shape=kartFootprint(kart);
  function sweep(hull,bottom,top){
    const centerY=(bottom+top)/2-.8;
    return contactTime(item,path,.70,padX,.80+(top-bottom)/2,length,hull,path.roadScale,centerY);
  }
  let first=Infinity;
  for(const {hull,low,high} of shape.bands)first=Math.min(first,sweep(hull,low,high));
  return first;
}

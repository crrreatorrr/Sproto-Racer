// What is drawn for a race must follow the seat the player holds. Single player is always
// seat 0; in an online race the player can be in any seat.
import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {makeKart,animateKart,disposeKart,updateKartDetail,KART_LOD_FAR} from '../src/kart-art.js';
import {updateRivalVisibility,kartIsFaded} from '../src/kart-visibility.js';
import {CARS,DRIVERS} from '../src/roster.js';

// happy-dom has no 2D canvas; the kart art only needs one that accepts drawing calls.
HTMLCanvasElement.prototype.getContext=function(){
  const canvas=this,gradient={addColorStop(){}};
  return new Proxy({canvas,createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,
    getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(Math.max(0,w*h*4))}),
    measureText:()=>({width:20})},{get:(obj,key)=>key in obj?obj[key]:(()=>{})});
};

const car=id=>CARS.find(c=>c.id===id);
// The way the game builds karts for a race: only rivals carry the cheaper distant build.
const build=(seat,localSeat,id='ironhide')=>makeKart(seat,car(id),DRIVERS[seat%DRIVERS.length],false,{flightWings:true,lowDetail:seat!==localSeat,player:seat===localSeat});
const hasHeadlightPool=kart=>{let found=false;kart.traverse(o=>{if(o.name==='headlight-pool')found=true;});return found;};

describe('a player in a seat other than 0',()=>{
  it('fades the rival in seat 0 when it hides the player, and never fades the player',()=>{
    const camera=new T.PerspectiveCamera(62,16/9,.15,2300);
    camera.position.set(0,2.5,9);camera.lookAt(0,1.2,0);camera.updateMatrixWorld(true);
    const localSeat=2;
    const models=[0,1,2].map(seat=>build(seat,localSeat));
    // Seat 0 sits between the camera and the player; seat 1 is in the next lane.
    models[0].position.set(0,0,4.2);models[1].position.set(5.5,0,2);models[2].position.set(0,0,0);
    for(const kart of models)animateKart(kart,{speed:45,s:10},{tier:0},1);
    updateRivalVisibility(camera,models,0,localSeat);
    expect(kartIsFaded(models[0]),'the rival in seat 0 blocks the view and must fade').toBe(true);
    expect(kartIsFaded(models[1])).toBe(false);
    expect(kartIsFaded(models[2]),'the player\'s own kart never fades').toBe(false);
    for(const kart of models)disposeKart(kart);
  });

  it('still treats seat 0 as the player when no seat is given (single player)',()=>{
    const camera=new T.PerspectiveCamera(62,16/9,.15,2300);
    camera.position.set(0,2.5,9);camera.lookAt(0,1.2,0);camera.updateMatrixWorld(true);
    const models=[0,1].map(seat=>build(seat,0));
    models[0].position.set(0,0,0);models[1].position.set(0,0,4.2);
    for(const kart of models)animateKart(kart,{speed:45,s:10},{tier:0},1);
    updateRivalVisibility(camera,models,0);
    expect(kartIsFaded(models[1])).toBe(true);
    expect(kartIsFaded(models[0])).toBe(false);
    for(const kart of models)disposeKart(kart);
  });

  it('switches the rival in seat 0 to its distant build, and leaves the player\'s kart alone',()=>{
    const camera=new T.PerspectiveCamera();
    const localSeat=1;
    const models=[0,1,2].map(seat=>build(seat,localSeat,'skipper'));
    expect(models[localSeat].userData.low,'the player\'s kart has no distant build').toBeUndefined();
    expect(models[0].userData.low).toBeDefined();
    models[0].position.set(0,0,-(KART_LOD_FAR+5));models[2].position.set(0,0,-3);
    updateKartDetail(models,camera);
    expect(models[0].userData.low.active,'a far rival in seat 0 shows its distant build').toBe(true);
    expect(models[2].userData.low.active).toBe(false);
    for(const kart of models)disposeKart(kart);
  });

  it('gives the player\'s own extras to the player\'s kart, whichever seat it is',()=>{
    // The Manta's headlight pool on the road is drawn for its driver only.
    const mine=build(4,4,'manta'),rivalInSeat0=build(0,4,'manta');
    expect(hasHeadlightPool(mine)).toBe(true);
    expect(hasHeadlightPool(rivalInSeat0)).toBe(false);
    expect(mine.userData.player).toBe(true);
    expect(rivalInSeat0.userData.player).toBe(false);
    // Unchanged for callers that do not say: seat 0 is the player.
    const classic=makeKart(0,car('manta')),other=makeKart(3,car('manta'));
    expect(hasHeadlightPool(classic)).toBe(true);
    expect(hasHeadlightPool(other)).toBe(false);
    for(const kart of [mine,rivalInSeat0,classic,other])disposeKart(kart);
  });
});

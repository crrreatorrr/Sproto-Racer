import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {createGameplayCore} from '../src/sim/gameplay-core.js';
import {createKart} from '../src/driving.js';
import {createBoost,grantBoost} from '../src/boost.js';
import {ITEMS} from '../src/items.js';
import {createItemFx,itemCueLook,cueIconType} from '../src/item-fx.js';

const track={length:500,widthAt:()=>34,pads:[],pickups:[],hazards:[],
  sample:(s,x=0)=>({position:{x,y:0,z:s},curvature:0,width:34,forward:{x:0,y:0,z:1},right:{x:1,z:0}})};
function setup(dist=16,hook=true){
  const cues=[],play=createGameplayCore(track,hook?{onVisualCue:e=>cues.push(e)}:{});
  const pack=[100,100+dist].map((s,id)=>({id,isPlayer:!id,kart:{...createKart(),s},boost:createBoost(),finish:null}));
  const fire=(index,n=0)=>{
    pack[n].held=index;
    pack[n].charges=ITEMS[index]?.charges??1;
    return play.use(pack[n],index,pack);
  };
  const tick=(n)=>{for(let i=0;i<n;i++)play.update(1/60,pack);};
  return {cues,fire,tick,pack,play};
}
describe('item presentation cues',()=>{
  it.each(ITEMS.map((item,i)=>[item.model,i]))('observes %s, without changing inventory, objects or actors',(type,index)=>{
    const a=setup(index===7?14:16),b=setup(index===7?14:16,false);
    for(const f of [a,b]){if(index===17)grantBoost(f.pack[1].boost,1.28,1);expect(f.fire(index)).toBe(true);f.tick(24);}
    expect(a.cues.some(e=>e.phase==='use'&&e.type===type)).toBe(true);
    expect(a.play.captureState(a.pack)).toEqual(b.play.captureState(b.pack));
    expect(a.pack).toEqual(b.pack);
    expect(itemCueLook('use',type)).toHaveLength(3);
  });
  it.each([[1,16,'ball'],[3,-3.5,'slip'],[4,-3.7,'box'],[5,18,'cursor'],[6,5,'pulse'],
    [10,12,'disc'],[11,20,'bolt'],[12,24,'lob'],[13,16,'ring'],[14,-3.8,'puck'],[18,50,'rocket']])
  ('fires distinct hit and shield cues for item %i',(id,distance,type)=>{
    for(const blocked of [false,true]){
      const f=setup(distance);if(id===10)f.pack[1].kart.x=2;
      if(blocked)f.fire(2,1);
      f.fire(id);f.tick(200);
      expect(f.cues.some(e=>e.seat===1&&e.type===type&&e.phase===(blocked?'block':'hit'))).toBe(true);
      if(blocked)expect(f.cues.some(e=>e.seat===1&&e.type===type&&e.phase==='hit')).toBe(false);
    }
  });
  it('does not signal a landed hit for a failed target lock',()=>{
    const f=setup(-30);
    f.fire(7);f.fire(17);
    expect(f.cues.map(e=>[e.phase,e.type])).toEqual([['miss','spool'],['miss','siphon']]);
  });
  it('routes bounce FX to the rail, not the driver',()=>{
    const f=setup(90);
    Object.assign(f.pack[0].kart,{x:15,yaw:.65});
    f.fire(10);f.tick(18);
    expect(f.cues.some(e=>e.phase==='bounce'&&e.type==='disc'&&Math.abs(e.x)===16)).toBe(true);
  });
  it('keeps shield art and hit recipes distinct; uses fixed-size emitter pools and clears on reset',()=>{
    const cam=new T.PerspectiveCamera();cam.position.set(5,4,12);
    const scene=new T.Scene(),sig=[],fx=createItemFx(scene,track,{onSignal:e=>sig.push(e)});
    expect(cueIconType('block','rocket')).toBe('bubble');
    expect(itemCueLook('block','rocket')).not.toEqual(itemCueLook('hit','rocket'));
    for(let i=0;i<80;i++)fx.cue({phase:'hit',type:i%2?'bolt':'lob',s:100+i,x:0,height:.4,isPlayer:i===0});
    fx.update(.08,cam);
    expect(sig).toHaveLength(1);
    expect(fx.group.children.some(b=>b.count>0&&b.visible)).toBe(true);
    expect(fx.group.children.every(b=>b.count<=b.instanceMatrix.count)).toBe(true);
    fx.reset();expect(fx.group.children.every(b=>b.count===0&&!b.visible)).toBe(true);
    fx.dispose();expect(scene.children).toHaveLength(0);
    const simpler=createItemFx(scene,track,{reduced:true});
    simpler.cue({phase:'hit',type:'rocket',s:10,x:0,height:.5});simpler.update(.06,cam);
    expect(simpler.group.children.filter(b=>b.count>0)).toHaveLength(1);
    simpler.update(1,cam);expect(simpler.group.children.every(b=>b.count===0)).toBe(true);
    simpler.dispose();
  });
});

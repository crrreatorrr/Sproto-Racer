import * as T from 'three';
import {assembly,alloyReflections} from './kart-assembly.js';
import {kartDetail,lowDetail,once} from './kart-detail.js';
import {saucerProfile,saucerCockpitRadius,saucerLipHeight,saucerSeatBack,screenPoint} from './saucer-layout.js';

const fullTurn=2*Math.PI;
let segments=144;
const templates=[];

function lathe(profile){
  return new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),segments);
}

// The lathe's U coordinate follows the circumference. Long, shallow grooves
// vary the roughness while leaving the panel's silhouette smooth at any zoom.
function machinedFinish(){
  const width=512,height=1024,data=new Uint8Array(width*height*4);
  let seed=73;
  const noise=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
  for(let y=0;y<height;y++){
    const grain=148+35*noise()+18*Math.sin(y*.34);
    for(let x=0;x<width;x++){
      const v=grain+8*noise()+7*Math.sin(fullTurn*x/width+y*.035);
      const i=(y*width+x)*4;
      data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
    }
  }
  const texture=new T.DataTexture(data,width,height);
  texture.wrapS=T.RepeatWrapping;texture.generateMipmaps=true;
  texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;
  texture.needsUpdate=true;
  return texture;
}

function createFinishes(){
  const envMap=alloyReflections();
  const skin=new T.MeshStandardMaterial({color:0xd1d4d6,metalness:.88,roughness:.47,roughnessMap:machinedFinish(),envMap});
  const fittings=new T.MeshStandardMaterial({vertexColors:true,metalness:.72,roughness:.29,envMap});
  const interior=new T.MeshStandardMaterial({vertexColors:true,roughness:.62,side:T.DoubleSide});
  const lift=new T.MeshBasicMaterial({color:0x62ffef,toneMapped:false});
  const light=new T.MeshStandardMaterial({color:0xffbc52,emissive:0xff8619,emissiveIntensity:.77,roughness:.18,metalness:.14,envMap});
  const glass=new T.MeshPhysicalMaterial({color:0xc9e6ea,roughness:.09,transparent:true,opacity:.26,
    envMap,side:T.DoubleSide,depthWrite:false,forceSinglePass:true});
  return {skin,fittings,interior,lift,light,glass};
}

function buildSaucer(){
  const {skin,fittings,interior,lift,light,glass}=once('saucer:finishes',createFinishes);
  // The disc is four metres across: 24 sides keep its rim within a pixel at the switch distance.
  const low=lowDetail();
  segments=low?48:144;
  const a=assembly(fittings);
  a.add(lathe(saucerProfile),skin);
  function ring(r,y,tube,material,color){
    a.add(new T.TorusGeometry(r,tube,8,segments),material,color,[0,y,0],[Math.PI/2,0,0]);
  }
  // Recessed cyan emitter between two bright rolled edges.
  a.add(lathe([[1.925,.693],[1.946,.709],[1.963,.744],[1.963,.766]]),lift);
  ring(1.925,.693,.007,fittings,'#7f9299');
  ring(1.963,.767,.005,fittings,'#c8cccd');
  for(const [r,y] of [[1.18,.426],[1.53,.525],[1.64,1.007],[1.17,1.129]]){
    ring(r,y,.0045,fittings,'#616972');
  }
  for(let i=0;i<8;i++){
    const angle=fullTurn*(i+.16)/8;
    const seam=saucerProfile.filter(([r,y])=>r>=1.17 && y>=.862).map(([r,y])=>
      new T.Vector3(r*Math.sin(angle),y+.001,r*Math.cos(angle)));
    a.add(new T.TubeGeometry(new T.CatmullRomCurve3(seam),24,.0028,5),fittings,'#737a80');
  }
  const lip=saucerLipHeight,rim=saucerCockpitRadius;
  a.add(lathe([[rim,lip],[rim-.025,lip-.027],[rim-.03,.67],[.68,.52],[0,.52]]),interior,'#352e30');
  ring(rim,lip,.023,fittings,'#c8c9c6');
  ring(.905,1.16,.007,fittings,'#7b8085');
  for(let i=0;i<32;i++){
    const t=i*fullTurn/32;
    a.add(new T.SphereGeometry(1,10,6).scale(.013,.006,.013),fittings,'#586269',
      [.864*Math.sin(t),1.167,.864*Math.cos(t)]);
  }
  // A pressed oval bezel and an amber lens sit tangent to the sloping deck.
  for(let i=0;i<10;i++){
    const angle=(i+.5)*fullTurn/10;
    for(const [width,height,depth,r,y,material,color] of [
      [.145,.055,.075,1.865,.901,fittings,'#5d6265'],
      [.124,.044,.059,1.874,.914,light,null]
    ]){
      const lens=new T.SphereGeometry(1,24,12).scale(width,height,depth);
      lens.rotateX(.53);lens.rotateY(angle);
      a.add(lens,material,color,[r*Math.sin(angle),y,r*Math.cos(angle)]);
    }
  }
  // Individual vertical leather pleats and a rolled outer bolster, as in the concept.
  const seat=saucerSeatBack,h=seat.top-seat.bottom;
  a.box('#762e22',[0,.683,.15],[.74,.16,.67],.076,.035,interior);
  a.box('#6a291f',[0,seat.bottom+h/2,seat.z+.033],[2*seat.halfWidth,h,.13],.064,.13,interior);
  for(let i=-3;i<=3;i++){
    const outer=Math.abs(i)/3;
    a.box(outer===1?'#93412c':'#ac4b32',[i*.103,seat.bottom+h*.50-outer*.026,seat.z-.026-outer*.043],
      [.115,h-.065*outer,.13],.055,.13,interior);
  }
  a.box('#242a2c',[0,1.003,-.624],[.62,.15,.13],.04,-.17,interior);
  const panes=low?12:48;
  const windscreen=new T.PlaneGeometry(1,1,panes,1);
  const pos=windscreen.attributes.position;
  for(let j=0;j<2;j++)for(let i=0;i<=panes;i++)pos.setXYZ(j*(panes+1)+i,...screenPoint(2*i/panes-1,j===0));
  windscreen.computeVertexNormals();
  a.add(windscreen,glass);
  const edge=(t,top)=>new T.Vector3(...screenPoint(t,top));
  const topRail=new T.CatmullRomCurve3(Array.from({length:25},(_,i)=>edge(i/12-1,true)));
  a.add(new T.TubeGeometry(topRail,48,.005,8),fittings,'#c6d2d5');
  for(const side of [-1,1]){
    const bottom=screenPoint(side),top=screenPoint(side,true);
    a.pipe('#b4b9bd',bottom,top,.022,fittings,.015);
    a.add(new T.SphereGeometry(1,16,8).scale(.045,.022,.045),fittings,'#92999e',bottom);
  }
  return a.finish();
}

export function attachSaucer(body){
  const built=templates[kartDetail()]??=buildSaucer();
  for(const source of built){
    const mesh=source.clone();mesh.userData.sharedKartPart=true;body.add(mesh);
  }
}

import * as T from 'three';
import {assembly,alloyReflections} from './kart-assembly.js';

// Keep all driver variants sized around the original seated rig and steering grip.
// A shared prebaked mesh is instantiated by garage, race and ghost alike.
const templates=new Map();
const soft=new T.MeshStandardMaterial({vertexColors:true,roughness:.53,envMap:alloyReflections(),envMapIntensity:.22});
const wet=new T.MeshStandardMaterial({vertexColors:true,roughness:.26,envMap:alloyReflections(),envMapIntensity:.45});
const ink='#18241e',white='#fff2cb';
function blueprint(person){
  if(templates.has(person.id))return templates.get(person.id);
  const {skin,accent,cap,suit,id}=person;
  const green=id==='sproto'?'#769e21':skin;
  const face=id==='sproto'?'#8faf29':skin;
  const scarf=id==='sproto'?'#c62524':accent;
  const a=assembly(soft);
  const sphere=(col,p,sz,mat=soft,n=10,m=6)=>a.add(new T.SphereGeometry(1,n,m).scale(...sz),mat,col,p);
  const rod=(col,p,q,r,r2=r)=>a.pipe(col,p,q,r,soft,r2,8);
  sphere(id==='sproto'?'#587628':suit,[0,.29,.13],[.41,.40,.31]);
  sphere(id==='sproto'?'#a6bf41':skin,[0,.34,-.094],[.28,.28,.09]);
  sphere(green,[0,.93,.035],[.60,.523,.52],soft,16,10);
  sphere(face,[0,.768,-.23],[.53,.31,.31],soft,14,8);
  // Continuous eyelids and rounded eyes, like the approved hand-painted driver.
  for(const side of [-1,1]){
    if(id==='sproto'){
      sphere(green,[side*.292,1.184,-.278],[.287,.348,.277],soft,14,8);
      sphere(white,[side*.277,1.182,-.487],[.237,.280,.131],wet,14,8);
      sphere(ink,[side*.251,1.190,-.601],[.113,.155,.047],wet,12,8);
      sphere('#fff7dc',[side*.215,1.252,-.634],[.038,.049,.025]);
      sphere('#4f641a',[side*.131,.868,-.503],[.024,.022,.026]);
    }else{
      sphere(green,[side*.58,1.07,.04],[.22,.15,.128]);
      sphere(white,[side*.23,1.044,-.422],[.244,.232,.138],wet);
      sphere(ink,[side*.215,1.054,-.542],[.101,.145,.040],wet);
      sphere('#faf6d5',[side*.187,1.105,-.572],[.035,.039,.022]);
    }
    rod(suit,[side*.18,.05,.09],[side*.245,.026,-.31],.099,.085);
    rod(suit,[side*.245,.026,-.31],[side*.24,-.096,-.43],.085,.073);
    sphere(ink,[side*.24,-.104,-.465],[.10,.07,.12]);
    const arm=id==='sproto'?green:suit;
    rod(arm,[side*.315,.44,.02],[side*.355,.279,-.23],.100,.100);
    rod(arm,[side*.355,.279,-.23],[side*.29,.33,-.51],.097,.071);
    sphere(id==='sproto'?'#91b643':accent,[side*.29,.33,-.55],[.106,.089,.12]);
  }
  const mouth=[[-.245,.768,-.456],[-.167,.724,-.502],[0,.706,-.535],[.167,.724,-.502],[.245,.768,-.456]];
  for(let i=1;i<mouth.length;i++)rod('#44401c',mouth[i-1],mouth[i],.017);
  a.add(new T.TorusGeometry(.325,.074,7,18).scale(1,.86,1),soft,scarf,[0,.616,.018],[Math.PI/2,.10,.04]);
  sphere(scarf,[.248,.559,.17],[.108,.086,.105]);
  if(id==='sproto'){
    sphere(scarf,[0,.564,-.321],[.299,.089,.046]);
    sphere('#ab211e',[.308,.568,-.258],[.104,.08,.068]);
  }
  // Tucked scarf knot and tail stay inside the old head/seat envelope.
  rod(scarf,[.248,.57,.19],[.327,.481,.38],.067,.050);

  if(id==='pip'){
    sphere(cap,[0,1.347,.056],[.57,.273,.505],soft,16,8);
    for(const s of [-1,1]){
      sphere(accent,[s*.246,1.363,-.353],[.213,.175,.106],wet);
      sphere('#74b9d4',[s*.246,1.380,-.432],[.141,.119,.055],wet);
    }
  }else if(id==='miso'){
    for(const s of [-1,1]){
      a.add(new T.ConeGeometry(.211,.47,10),soft,green,[s*.356,1.465,.03],[.05,0,-s*.29]);
      rod('#c17c66',[s*.365,1.35,-.131],[s*.410,1.60,-.121],.098,.047);
    }
  }else if(id==='rook'){
    sphere(cap,[0,1.30,.065],[.632,.365,.544],soft,16,8);
    for(const s of [-1,1]){
      rod(accent,[s*.50,1.39,.058],[s*.66,1.55,.071],.095,.078);
      rod(accent,[s*.66,1.55,.071],[s*.625,1.69,.051],.078,.029);
    }
    sphere(accent,[0,1.375,-.414],[.286,.055,.086],wet);
  }
  const out=a.finish();templates.set(id,out);return out;
}
export function attachConceptDriver(group,person){
  for(const template of blueprint(person)){
    const part=template.clone();part.userData.sharedKartPart=true;group.add(part);
  }
}

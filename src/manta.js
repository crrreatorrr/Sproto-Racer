import * as T from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import reflectionUrl from './assets/hexshift-reflections.hdr?url';
import {alloyReflections,assembly} from './kart-assembly.js';
import {mantaAxles,mantaHalfTrack,mantaCockpit,mantaDriver,mantaEnds,mantaSection,mantaSweptZ,mantaWheelWidth} from './manta-layout.js';

function grid(rows,reverse=false){
  const points=[],indices=[],count=rows[0].length;
  for(const row of rows)for(const point of row)points.push(...point);
  for(let i=0;i<rows.length-1;i++)for(let j=0;j<count-1;j++){
    const a=i*count+j,b=a+count;
    if(reverse)indices.push(a,a+1,b,a+1,b+1,b);
    else indices.push(a,b,a+1,a+1,b,b+1);
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setIndex(indices);g.computeVertexNormals();
  return g;
}

function createTemplates(){
  const envMap=alloyReflections();
  const pearl=new T.MeshPhysicalMaterial({color:0xc1cadb,metalness:.77,roughness:.21,clearcoat:1,clearcoatRoughness:.095,
    iridescence:.67,iridescenceIOR:1.46,iridescenceThicknessMinimum:270,iridescenceThicknessMaximum:410,envMap,side:T.DoubleSide});
  const hardware=new T.MeshStandardMaterial({vertexColors:true,roughness:.57,side:T.DoubleSide});
  const alloy=new T.MeshStandardMaterial({vertexColors:true,metalness:.86,roughness:.25,envMap,side:T.DoubleSide});
  const dark=new T.MeshStandardMaterial({vertexColors:true,metalness:.42,roughness:.32,envMap,side:T.DoubleSide});
  const lens=new T.MeshBasicMaterial({vertexColors:true,toneMapped:false,side:T.DoubleSide});
  const glass=new T.MeshPhysicalMaterial({color:0x72959d,metalness:.25,roughness:.1,envMap,transparent:true,opacity:.32,depthWrite:false,side:T.DoubleSide,forceSinglePass:true});
  // Use the daylight map immediately, then let the studio panels trace the
  // fenders and rims as soon as the higher-resolution HDR texture is decoded.
  new HDRLoader().load(reflectionUrl,texture=>{
    texture.mapping=T.EquirectangularReflectionMapping;
    for(const finish of [pearl,alloy,dark,glass]){
      finish.envMap=texture;
      finish.envMapRotation.set(.09,.65,-.08);
    }
  });
  pearl.envMapIntensity=.74;
  const glowPoints=[],glowColors=[];
  function emitAt(point,color,strength){
    glowPoints.push(...point);
    new T.Color(color).multiplyScalar(strength).toArray(glowColors,glowColors.length);
  }
  const body=assembly(hardware);
  const charcoal='#191e27',graphite='#323844',bright='#abb8c6';
  function line(points,r,material,color){
    const curve=new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v)));
    body.add(new T.TubeGeometry(curve,Math.max(24,points.length*2),r,8),material,color);
  }
  const [start,end]=mantaEnds;
  const zs=Array.from({length:151},(_,i)=>start+(end-start)*i/150);
  zs.push(mantaCockpit.z-mantaCockpit.length,mantaCockpit.z+mantaCockpit.length);
  zs.sort((a,b)=>a-b);
  const sectionCurve=z=>new T.SplineCurve(mantaSection(z).map(([x,y])=>new T.Vector2(x,y)));
  const lampZ=t=>start+.063+.26*t*t;
  const lampHalfWidth=t=>.100*Math.sin(Math.PI*t)**.76*(.67+.59*t);
  // The lenses sit in milled pockets in the hood. Both the paint and the
  // optical stack evaluate the same surface, including its shallow recess.
  function surfacePoint(side,column,z,curve){
    const p=curve.getPoint(column/11),t=(column-1.05)/2.63;
    if(t>0 && t<1){
      const w=lampHalfWidth(t),v=(z-lampZ(t))/w;
      p.y-=.021*Math.sin(Math.PI*t)*Math.exp(-(v**4));
    }
    return [side*p.x,p.y,z];
  }
  for(const side of [-1,1]){
    const rows=zs.map(z=>{
      const curve=sectionCurve(z);
      return Array.from({length:67},(_,i)=>surfacePoint(side,i/6,z,curve));
    });
    body.add(grid(rows,side<0),pearl);
    // Roll the painted hood into the mouth. The grille is tucked back behind
    // a single swept splitter, with deeper intakes either side of the center.
    const frontProfile=rows[0].slice(0,31).map(([x,y])=>{
      const u=Math.min(1,Math.abs(x)/mantaSection(start)[5][0]);
      const inlet=Math.sin(Math.PI*u)**.72;
      return [[x,y,start],[x,y-.014,start-.014],[x*.994,y-.039,start-.012],
        [x*.991,y-.054,start+.012],[x*.984,y-.077,start+.055+.012*inlet],
        [x*.969,.27+.008*u,start+.075+.090*inlet],
        [x*.99,.236,start+.021],[x*1.01,.219,start-.020],
        [x*1.012,.202,start-.025],[x*1.004,.187,start-.012]];
    });
    body.add(grid(frontProfile.map(r=>r.slice(0,4))),pearl);
    body.add(grid(frontProfile.map(r=>r.slice(3,7))),dark,'#141a22');
    body.add(grid(frontProfile.map(r=>r.slice(6,9))),pearl);
    body.add(grid(frontProfile.map(r=>r.slice(8))),dark,graphite);
    // Blend the ends of the opening back to the exact fender section. The
    // upper and lower lips share vertices across the return into the wheel arch.
    const outerFace=frontProfile.at(-1),outerRow=rows[0];
    const fenderIndices=[30,31,33,35,38,44,49,54,58,60];
    const returnRows=Array.from({length:7},(_,i)=>{
      const t=i/6;
      return outerFace.map((point,j)=>{
        const target=outerRow[fenderIndices[j]];
        return point.map((v,k)=>T.MathUtils.lerp(v,target[k],t));
      });
    });
    body.add(grid(returnRows,side<0),pearl);
    // Short horizontal vanes remain deep behind the leading edge.
    for(const h of [.296,.344]){
      const vanes=frontProfile.slice(3,26).map(r=>{
        const x=r[5][0],z=r[5][2]-.013;
        return [[x,h,z-.009],[x,h+.008,z],[x,h+.006,z+.023]];
      });
      body.add(grid(vanes),dark,'#454d56');
    }
    const tail=rows.at(-1).slice(0,31);
    body.add(grid(tail.map(([x,y])=>[[x,y,end],[x,y-.024,end+.012],
      [x*.975,y-.057,end],[x*.95,.248,end-.073],[x,.212,end]])),dark,charcoal);
    // Return the blade into the underside before the wheel cutouts.
    for(const [a,b] of [[start,-1.86],[1.86,end]]){
      const blade=zs.filter(z=>z>=a && z<=b).map(z=>{
        const [x]=mantaSection(z)[5];
        const outer=x*1.012;
        return [[0,.204,z],[side*x*.77,.204,z],[side*outer,.204,z],
          [side*outer,.184,z],[0,.183,z]];
      });
      body.add(grid(blade,side<0),dark,graphite);
    }
    const lining=zs.filter(z=>Math.abs(z-mantaCockpit.z)<=mantaCockpit.length+.00001).map(z=>{
      const [x,y]=mantaSection(z)[0];
      return [[side*x,y-.002,z],[side*x*.99,y-.035,z],[side*x*.88,.315,z]];
    });
    body.add(grid(lining,side>0),hardware,charcoal);
    line(lining.map(row=>row[0]),.014,dark,graphite);
    function opticalRibbon(begin,finish,near,far,lift,material,color){
      const ribbon=Array.from({length:49},(_,i)=>{
        const t=begin+(finish-begin)*i/48,column=1.05+2.63*t;
        return [near,(near+far)*.5,far].map((across,j)=>{
          const z=lampZ(t)+across*lampHalfWidth(t),p=surfacePoint(side,column,z,sectionCurve(z));
          p[1]+=lift+(j===1?.0015:0);
          return p;
        });
      });
      body.add(grid(ribbon,side>0),material,color);
    }
    opticalRibbon(.003,.997,-1,1,.004,alloy,'#4d5762');
    opticalRibbon(.012,.988,-.87,.88,.006,dark,'#0b1722');
    opticalRibbon(.038,.975,-.72,.08,.011,lens,'#62e8f2');
    opticalRibbon(.065,.95,-.57,-.20,.013,lens,'#e4ffff');
    // Three small projector elements sit behind the continuous light guide.
    for(const t of [.60,.71,.82])opticalRibbon(t,t+.065,.29,.54,.011,lens,'#c5f6ff');
    for(let i=0;i<23;i++){
      const t=(i+.5)/23,z=lampZ(t)-.34*lampHalfWidth(t);
      const [x,y]=surfacePoint(side,1.05+2.63*t,z,sectionCurve(z));
      emitAt([x,y+.026,mantaSweptZ(x,z)-.009],'#46d9ff',.74*Math.sin(Math.PI*t)**.65);
    }
    const tailLamp=Array.from({length:16},(_,i)=>{
      const z=end-.52*i/15,[x,y]=mantaSection(z)[5];
      return [side*(x+.003),y-.032,z];
    });
    // Carry the rear signature around the shoulder so it reads from chase view.
    const rearEdge=tail.slice(6).map(([x,y,z])=>[x,y-.031,z+.017]);
    const rearGuide=[...rearEdge,...tailLamp.slice(1)];
    line(rearGuide,.022,dark,'#40151e');
    const rearCore=rearGuide.map(([x,y,z])=>[x+side*.009,y+.002,z+.014]);
    line(rearCore,.013,lens,'#ff5051');
    const rearCurve=new T.CatmullRomCurve3(rearCore.map(v=>new T.Vector3(...v)));
    for(let i=0;i<24;i++){
      const t=(i+.5)/24,p=rearCurve.getPointAt(t);
      emitAt([p.x+side*.004,p.y+.008,p.z+.012],'#ff2b32',.33*Math.sin(Math.PI*t)**.55);
    }
    // Draw the dark throat of each side duct inside the outer lip.
    const duct=Array.from({length:49},(_,i)=>{
      const u=i/48,z=-.67+1.40*u,s=mantaSection(z),t=Math.sin(Math.PI*u)**.64;
      const [x,y]=s[7];
      return [[side*(x+.008),y+.085*t,z],[side*(x+.012),y,z],[side*(s[8][0]+.014),y-.105*t,z]];
    });
    body.add(grid(duct,side<0),dark,'#151c25');
    for(let j=0;j<3;j++){
      const z=1.37+j*.113;
      const top=mantaSection(z);
      const curve=new T.SplineCurve(top.map(v=>new T.Vector2(...v)));
      const vent=Array.from({length:13},(_,i)=>{
        const v=curve.getPoint((.63+.90*i/12)/11);
        return [side*v.x,v.y+.004,z+.032*Math.sin(Math.PI*i/12)];
      });
      line(vent,.011,dark,graphite);
    }
  }
  // The wind deflector follows the forward half of the actual cockpit opening.
  const screen=Array.from({length:65},(_,i)=>{
    const angle=-1.40+2.80*i/64,z=mantaCockpit.z-mantaCockpit.length*Math.cos(angle);
    const x=mantaCockpit.width*Math.sin(angle),y=mantaSection(z)[0][1];
    const rise=.178*Math.cos(angle);
    return [[x,y,z],[x*.98,y+rise,z+.09*Math.cos(angle)]];
  });
  body.add(grid(screen),glass);
  line(screen.map(p=>p[1]),.008,alloy,bright);
  body.box(charcoal,[0,.26,.12],[1.80,.10,3.72],.045);
  body.box('#313640',[0,.409,mantaDriver.z],[.66,.105,.64],.048);
  body.box('#5a626d',[0,.715,.51],[.65,.65,.125],.055,.15);
  body.box('#444955',[0,1.16,.67],[.39,.34,.13],.06,.12);
  for(const side of [-1,1]){
    line([[side*.29,.49,.02],[side*.31,.49,.35],[side*.29,.70,.49],[side*.25,.93,.53]],.043,hardware,'#414955');
  }
  const wheels=mantaAxles.map(([axle,radius])=>{
    const wheel=assembly(hardware),w=mantaWheelWidth/2;
    function lathe(profile,material,color){
      const g=new T.LatheGeometry(profile.map(([x,r])=>new T.Vector2(r*radius,x)),64);
      g.rotateZ(-Math.PI/2);wheel.add(g,material,color);
    }
    lathe([[-w*.82,.77],[-w,.83],[-w,.925],[-w*.83,.985],[-w*.64,1],[w*.64,1],[w*.83,.985],[w,.925],[w,.83],[w*.82,.77]],hardware,'#191b20');
    lathe([[w*.76,.79],[w*1.03,.81],[w*1.04,.84],[w*.97,.855],[w*.87,.85]],alloy,bright);
    lathe([[-w*.70,.805],[w*.76,.805]],dark,'#232731');
    lathe([[-w*.2,.636],[w*.29,.64],[w*.29,.24],[w*.21,.19]],alloy,'#4c4d52');
    // Recessed rotor perforations, caliper and hub bolts behind the forged spokes.
    for(let i=0;i<25;i++){
      const a=2*Math.PI*i/25;
      for(const rr of [.48,.568]){
        const y=radius*rr*Math.cos(a+rr), z=radius*rr*Math.sin(a+rr);
        wheel.pipe('#202128',[w*.29,y,z],[w*.30,y,z],.011,hardware,.011,7);
      }
    }
    for(const side of [-1,1]){
      body.box('#99663c',[side*(mantaHalfTrack+w*.43),radius+.054,axle-radius*.50],[.046,radius*.62,radius*.17],.018);
    }
    for(let i=0;i<10;i++){
      const a=2*Math.PI*i/10;
      const spoke=[[.17,-.15,w*.90],[.32,-.08,w*1.08],[.76,.13,w*1.03],[.82,.17,w],[.78,.25,w],[.31,.16,w*1.01],[.17,.22,w*.94]];
      const vertices=spoke.map(([r,angle,x])=>[x,r*radius*Math.cos(a+angle),r*radius*Math.sin(a+angle)]);
      const face=new T.BufferGeometry();
      face.setAttribute('position',new T.Float32BufferAttribute(vertices.flat(),3));face.setIndex([0,1,5,0,5,6,1,2,5,2,4,5,2,3,4]);face.computeVertexNormals();
      wheel.add(face,alloy,'#a9b2c3');
      const branch=(r,angle,x)=>[w*x,radius*r*Math.cos(a+angle),radius*r*Math.sin(a+angle)];
      wheel.pipe('#848e9c',branch(.39,.11,1.02),branch(.805,-.105,.98),.012,alloy,.009,8);
    }
    wheel.pipe(graphite,[w*.73,0,0],[w*1.10,0,0],radius*.22,alloy,radius*.19,32);
    for(let i=0;i<5;i++){
      const a=2*Math.PI*i/5,y=.057*Math.cos(a),z=.057*Math.sin(a);
      wheel.pipe(bright,[w*1.10,y,z],[w*1.13,y,z],.011,alloy,.010,8);
    }
    return wheel.finish();
  });
  const shell=body.finish();
  for(const {geometry} of shell){
    const {position,normal}=geometry.attributes;
    const n=new T.Vector3();
    for(let i=0;i<position.count;i++){
      const x=position.getX(i),z=position.getZ(i);
      if(z>=-1.61)continue;
      // Inverse-transpose of the nose deformation keeps the baked paint normals smooth.
      const dzdx=(mantaSweptZ(x+.001,z)-mantaSweptZ(x-.001,z))/.002;
      const dzdz=(mantaSweptZ(x,z+.001)-mantaSweptZ(x,z-.001))/.002;
      n.fromBufferAttribute(normal,i);
      n.z/=dzdz;n.x-=dzdx*n.z;n.normalize();
      position.setZ(i,mantaSweptZ(x,z));normal.setXYZ(i,n.x,n.y,n.z);
    }
  }
  // Accumulate overlapping soft points along each actual emitter. One draw
  // call covers both ends, and the depth buffer occludes lamps behind the car.
  const size=64,pixels=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const r=Math.hypot((x+.5)*2/size-1,(y+.5)*2/size-1);
    const falloff=Math.exp(-6*r*r)*Math.max(0,1-r*r);
    pixels.set([255,255,255,Math.round(255*falloff)],(y*size+x)*4);
  }
  const halo=new T.DataTexture(pixels,size,size);
  halo.magFilter=halo.minFilter=T.LinearFilter;halo.needsUpdate=true;
  const haze=new T.PointsMaterial({map:halo,size:1.02,vertexColors:true,transparent:true,
    opacity:.33,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false});
  const emitters=new T.BufferGeometry();
  emitters.setAttribute('position',new T.Float32BufferAttribute(glowPoints,3));
  emitters.setAttribute('color',new T.Float32BufferAttribute(glowColors,3));
  // Bake the low chassis shadow and four smaller tire contacts in road metres.
  const contactSize=192,contactPixels=new Uint8Array(contactSize*contactSize*4);
  for(let y=0;y<contactSize;y++)for(let x=0;x<contactSize;x++){
    const dx=Math.abs(((x+.5)/contactSize*2-1)*1.65);
    const z=(1-(y+.5)/contactSize*2)*2.60;
    const deck=.64*Math.exp(-((dx/.97)**4)-(z/1.89)**4);
    let shade=deck;
    for(const [axle] of mantaAxles){
      const contact=Math.exp(-(((dx-mantaHalfTrack)/.20)**2)-(((z-axle)/.29)**2));
      shade+=.82*contact*(1-shade);
    }
    const value=Math.round(255*shade);
    contactPixels.set([value,value,value,255],(y*contactSize+x)*4);
  }
  const contact=new T.DataTexture(contactPixels,contactSize,contactSize);
  contact.magFilter=contact.minFilter=T.LinearFilter;contact.needsUpdate=true;
  return {shell,wheels,glow:new T.Points(emitters,haze),contact};
}

let templates;
export function attachManta(body,axles,shadow,player,ghost){
  templates??=createTemplates();
  function attach(parent,parts,flip){
    for(const part of parts){
      const mesh=new T.Mesh(part.geometry,part.material);
      if(flip)mesh.rotation.y=Math.PI;
      mesh.userData.sharedKartPart=true;parent.add(mesh);
    }
  }
  shadow.geometry.dispose();
  shadow.geometry=new T.PlaneGeometry(2,2);
  shadow.scale.set(1.65,2.60,1);shadow.material.alphaMap=templates.contact;
  shadow.material.color.set(0x101723);shadow.material.opacity=.89;
  attach(body,templates.shell,false);
  if(!ghost){
    const glow=templates.glow.clone();
    glow.renderOrder=2;
    body.add(glow);
    if(player)for(const side of [-1,1]){
      const lamp=new T.SpotLight(0xc5faff,27,8,.52,.84,2);
      lamp.position.set(side*.82,.52,-2.18);
      lamp.target.position.set(side*1.05,.06,-4.48);
      body.add(lamp,lamp.target);
    }
  }
  for(const axle of axles)attach(axle,templates.wheels[axle.position.z<0?0:1],axle.position.x<0);
}

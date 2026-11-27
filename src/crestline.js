import * as T from 'three';
import coachworkUrl from './assets/crestline-coachwork.webp';
import {assembly,surface} from './kart-assembly.js';
import {kartDetail,lowDetail} from './kart-detail.js';
import {crestlineDriver,crestlineRoof,crestlineAxles,crestlineHalfTrack} from './crestline-layout.js';

// A small sky reflection gives black lacquer and polished metal readable curves in
// both game scenes. Three filters this panorama by material roughness once per renderer.
function coachworkSky(){
  const w=256,h=128,data=new Uint16Array(w*h*4),half=T.DataUtils.toHalfFloat;
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){
    const lon=i/w*2*Math.PI,alt=(j/h-.5)*Math.PI;
    const ridge=.02+.055*Math.sin(3*lon)+.026*Math.cos(7*lon);
    const sky=T.MathUtils.smoothstep(alt,ridge-.028,ridge+.045);
    const horizon=Math.exp(-(((alt-.13)/.28)**2));
    const cloud=Math.exp(-(((alt-.47-.11*Math.sin(2*lon))/.115)**2))*(.55+.45*Math.cos(lon-1.5))**3;
    const sun=Math.exp(-(((alt-.52)/.24)**2)-14*(1-Math.cos(lon-2.9)));
    const light=.055+sky*(.32+1.3*horizon+2.3*cloud)+5*sun;
    const k=4*(j*w+i);
    data[k]=half(light*(.86+.23*horizon));data[k+1]=half(light);data[k+2]=half(light*(1.16-.23*horizon));data[k+3]=half(1);
  }
  const map=new T.DataTexture(data,w,h,T.RGBAFormat,T.HalfFloatType);
  map.mapping=T.EquirectangularReflectionMapping;map.needsUpdate=true;
  return map;
}
let lacquer,metal,trim,glass,painted,textile,lens;
function initMaterials(){
  if(lacquer)return;
  lacquer=new T.MeshPhysicalMaterial({vertexColors:true,metalness:.10,roughness:.29,envMapIntensity:.27,clearcoat:.68,clearcoatRoughness:.18,side:T.DoubleSide});
  metal=new T.MeshStandardMaterial({vertexColors:true,metalness:.86,roughness:.21});
  trim=new T.MeshStandardMaterial({vertexColors:true,roughness:.73});
  glass=new T.MeshPhysicalMaterial({color:'#b6cbd0',metalness:.18,roughness:.13,transparent:true,opacity:.22,depthWrite:false,side:T.DoubleSide,forceSinglePass:true});
  painted=lacquer.clone();painted.vertexColors=false;
  textile=new T.MeshStandardMaterial({roughness:.89,side:T.DoubleSide});
  lens=new T.MeshStandardMaterial({vertexColors:true,emissive:'#a73c12',emissiveIntensity:.20,roughness:.22});
}
const black='#141619',wing='#101216',roofBlack='#1b1c20',chrome='#c5c7c4',silver='#8b9193',ivory='#f4e7c9',hide='#9b6344';
const brass='#d6ac72',claret='#812d40',enamel='#246869';
// Pixel rectangles share the same mipmapped atlas across every Crestline instance.
const patches={doors:[8,8,2032,472],hood:[8,496,1008,1008],roof:[1032,496,1008,1008],
  trunk:[8,1520,1008,252],pocket:[1032,1520,1008,252],walnut:[8,1788,1008,246],badge:[1032,1788,240,240],tire:[1280,1788,752,244]};
function uv(patch,u,v){
  const [x,y,w,h]=patch;
  return [(x+.5+(w-1)*T.MathUtils.clamp(u,0,1))/2048,1-(y+.5+(h-1)*T.MathUtils.clamp(v,0,1))/2048];
}
function panelFace(p,vertices,patch,material=painted){
  const coords=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>uv(patch,u,v));
  p.add(surface(vertices,[0,1,2,0,2,3],coords),material);
}
function enamelBadge(p,r,position,angle){
  const g=new T.CircleGeometry(r,32),coords=g.attributes.uv;
  for(let i=0;i<coords.count;i++)coords.setXY(i,...uv(patches.badge,coords.getX(i),1-coords.getY(i)));
  p.add(g,painted,null,position,[0,angle,0]);
}
const templates=[];
const contactPlane=new T.PlaneGeometry(3.15/1.32,4.98/2);
let contactShadow,dressed=false;

// Join successive cross-sections and cap the ends. This keeps the curved coachwork
// hollow around the wheels and leaves real openings through the passenger cabin.
function loft(p,rows,color,material=lacquer){
  const faces=[],n=rows[0].length;
  for(let i=1;i<rows.length;i++)for(let j=0;j<n;j++){
    const a=(i-1)*n+j,b=(i-1)*n+(j+1)%n;
    faces.push(a,b,b+n,a,b+n,a+n);
  }
  const end=(rows.length-1)*n;
  for(let i=1;i<n-1;i++)faces.push(0,i+1,i,end,end+i,end+i+1);
  p.add(surface(rows.flat(),faces),material,color);
}
// Rolled panels share vertex normals across their sections, so highlights travel
// continuously around the roof crown, wings and hood shoulders while steering.
function smoothPanel(p,rows,color,texcoords,material=lacquer){
  const n=rows[0].length,indices=[];
  for(let i=1;i<rows.length;i++)for(let j=0;j<n;j++){
    const a=(i-1)*n+j,b=(i-1)*n+(j+1)%n;
    indices.push(a,b,b+n,a,b+n,a+n);
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(rows.flat(2),3));
  if(texcoords){
    const coords=rows.flatMap((row,i)=>row.flatMap((point,j)=>texcoords(point,i,j)));
    g.setAttribute('uv',new T.Float32BufferAttribute(coords,2));
  }
  g.setIndex(indices);g.computeVertexNormals();p.add(g,material,color);
  // Separate end faces keep the lip crisp without flattening the curved skin.
  for(const [row,reverse] of [[rows[0],true],[rows.at(-1),false]]){
    const triangles=[];
    for(let i=1;i<n-1;i++)triangles.push(...(reverse?[0,i+1,i]:[0,i,i+1]));
    p.add(surface(row,triangles),lacquer,color);
  }
}
function crownedRoof(p){
  // Rounded plan corners carry through the rain gutter to the raised fabric insert.
  const sections=[[crestlineRoof.bottom,.758,1.170],[2.168,.785,1.192],[2.194,.806,1.20],
    [2.235,.808,1.204],[2.280,.790,1.170],[2.316,.746,1.130],[2.337,.688,1.065],[2.344,.56,.93],[crestlineRoof.top,.001,.002]];
  // The roof outline is sampled at 28 points on the distant build, 80 up close.
  const around=lowDetail()?28:80;
  const ring=(y,x,z)=>Array.from({length:around},(_,i)=>{
    const a=i*2*Math.PI/around,c=Math.cos(a),sn=Math.sin(a);
    return [x*Math.sign(c)*Math.abs(c)**.32,y,.677+z*Math.sign(sn)*Math.abs(sn)**.32];
  });
  const rings=sections.map(v=>ring(...v).reverse());
  smoothPanel(p,rings.slice(0,7),roofBlack);
  smoothPanel(p,rings.slice(6),roofBlack,([x,,z])=>uv(patches.roof,.5+x/1.376,.5+(z-.677)/2.13),textile);
  const border=ring(2.191,.808,1.201);line(p,silver,[...border,border[0]],.009);
  const welt=ring(2.3375,.689,1.066);line(p,'#825e52',[...welt,welt[0]],.006,trim);
  p.box('#4b3b30',[0,2.169,.69],[1.43,.032,2.22],.015);
}
function deck(p,sections,color){
  loft(p,sections.map(([z,w,low,high])=>{
    const bevel=Math.min(.095,(high-low)*.34);
    return [[-w+bevel,low,z],[w-bevel,low,z],[w,low+bevel,z],[w,high-bevel,z],
      [w-bevel,high,z],[0,high+.018,z],[-w+bevel,high,z],[-w,high-bevel,z],[-w,low+bevel,z]];
  }),color);
}
function line(p,color,points,r,mat=metal){
  const path=new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v)));
  p.add(new T.TubeGeometry(path,Math.max(16,points.length*4),r,8,false),mat,color);
}
function glassPane(p,points){
  const g=surface(points,[0,1,2,0,2,3]);
  p.add(g,glass);
}
function makeWheel(p,x=0,y=0,z=0,scale=1,side=1,spare=false){
  // Sections of a turned wheel, in axial distance and radius. Spokes cross
  // between the recessed rim and the raised hub, leaving the dish visible.
  const at=(d,r,a)=>[x+side*d*scale,y+r*scale*Math.cos(a),z+r*scale*Math.sin(a)];
  function turned(profile,color,mat,patch){
    const g=new T.LatheGeometry(profile.map(([d,r])=>new T.Vector2(r,d)),lowDetail()?12:40);
    if(patch){
      const coords=g.attributes.uv,positions=g.attributes.position;
      for(let i=0;i<coords.count;i++)coords.setXY(i,...uv(patch,coords.getX(i),.5+positions.getY(i)/.272));
    }
    g.rotateZ(-Math.PI/2);g.scale(scale,scale,scale);
    p.add(g,mat,color,[x,y,z],[0,side<0?Math.PI:0,0]);
  }
  turned([[-.116,.295],[-.135,.34],[-.132,.405],[-.112,.452],[-.077,.47],[.077,.47],[.112,.452],[.132,.405],[.136,.34],[.116,.295]],null,textile,patches.tire);
  for(const axial of [-.062,0,.062])
    turned([[axial-.005,.469],[axial,.471],[axial+.005,.469]],'#191a1c',trim);
  p.pipe('#2d2d2d',at(-.13,0,0),at(-.118,0,0),.30*scale,trim,.302*scale,32);
  turned([[.133,.407],[.139,.399],[.142,.329],[.136,.315]],spare?'#38383a':ivory,trim);
  turned([[.135,.318],[.146,.313],[.147,.299],[.115,.290],[.072,.269],[.057,.115]],chrome,metal);
  turned([[.143,.324],[.146,.322],[.145,.314]],brass,metal);
  p.pipe(claret,at(.05,0,0),at(.059,0,0),.276*scale,trim,.276*scale,32);
  for(let i=0;i<24;i++){
    const angle=i*Math.PI/12;
    for(const twist of [-1,1])p.pipe(silver,at(.122,.080,angle),at(.111,.292,angle+twist*.35),.0065*scale,metal,.0065*scale,5);
  }
  p.pipe(chrome,at(.08,0,0),at(.165,0,0),.103*scale,metal,.082*scale,24);
  p.pipe(brass,at(.165,0,0),at(.173,0,0),.077*scale,metal,.072*scale,28);
  enamelBadge(p,.068*scale,at(.174,0,0),side*Math.PI/2);
  p.pipe('#39363a',at(.140,.352,1.94),at(.156,.354,1.94),.008*scale,trim);
}
// Die-stamped window surrounds. The rounded openings go all the way through
// the sheet so the same cabin works from the front, side and chase cameras.
function roundedLoop(path,left,right,bottom,top,r){
  path.moveTo(left+r,bottom);path.lineTo(right-r,bottom);path.quadraticCurveTo(right,bottom,right,bottom+r);
  path.lineTo(right,top-r);path.quadraticCurveTo(right,top,right-r,top);
  path.lineTo(left+r,top);path.quadraticCurveTo(left,top,left,top-r);
  path.lineTo(left,bottom+r);path.quadraticCurveTo(left,bottom,left+r,bottom);
  return path;
}
function stamp(p,outline,openings,transform){
  const sheet=new T.Shape();
  sheet.moveTo(...outline[0]);for(const v of outline.slice(1))sheet.lineTo(...v);sheet.closePath();
  for(const hole of openings)sheet.holes.push(roundedLoop(new T.Path(),...hole));
  const geo=new T.ExtrudeGeometry(sheet,{depth:.029,bevelEnabled:true,bevelSegments:3,
    bevelSize:.012,bevelThickness:.009,curveSegments:10});
  const vertices=geo.attributes.position;
  for(let i=0;i<vertices.count;i++)vertices.setXYZ(i,...transform(vertices.getX(i),vertices.getY(i),vertices.getZ(i)));
  geo.computeVertexNormals();p.add(geo,lacquer,black);
  for(const opening of openings){
    const points=roundedLoop(new T.Path(),...opening).getPoints(12).map(v=>new T.Vector3(...transform(v.x,v.y,.030)));
    const curve=new T.CurvePath();
    for(let i=1;i<points.length;i++)curve.add(new T.LineCurve3(points[i-1],points[i]));
    p.add(new T.TubeGeometry(curve,110,.010,6,false),metal,silver);
  }
}
function windowFrame(p,side){
  const outline=[[-.54,1.156],[1.88,1.156],[1.81,2.19],[1.68,2.218],[-.39,2.212]];
  const lights=[[-.405,.387,1.234,2.119,.084],[.469,1.074,1.234,2.119,.081],[1.149,1.737,1.246,2.106,.143]];
  stamp(p,outline,lights,(z,y,d)=>[side*(.755+d-.021*(y-1.16)),y,z]);
}
function makeBody(){
  const p=assembly(trim);
  const hood=[[-2.0,.435,1.17],[-1.95,.475,1.23],[-1.80,.49,1.256],[-1.08,.565,1.289],[-.70,.62,1.307],[-.50,.71,1.309]];
  const rows=hood.map(([z,w,h])=>[[-.86*w,.40,z],[.86*w,.40,z],[w,.49,z],[w,.97,z],
    [.992*w,h-.132,z],[.965*w,h-.072,z],[.87*w,h-.034,z],[.64*w,h-.009,z],[0,h+.010,z],
    [-.64*w,h-.009,z],[-.87*w,h-.034,z],[-.965*w,h-.072,z],[-.992*w,h-.132,z],[-w,.97,z],[-w,.49,z]]);
  smoothPanel(p,rows,black,([x,,z],i)=>uv(patches.hood,.5+x/(2*hood[i][1]),(z+2)/1.5),painted);
  deck(p,[[-.61,.68,.32,.64],[-.42,.77,.32,.64],[1.70,.77,.34,.64],[1.92,.71,.42,.64]],black);
  // Rear panel below a glazed three-light cabin. The window belt sits below eye level.
  deck(p,[[1.65,.76,.48,1.22],[1.84,.77,.48,1.23],[1.95,.68,.55,1.19]],black);
  crownedRoof(p);
  for(const side of [-1,1]){
    const pt=(x,y,z)=>[side*x,y,z];
    p.box(black,pt(.740,.90,.60),[.107,.62,2.25],.048,0,lacquer);
    line(p,silver,[pt(.708,1.223,-.55),pt(.79,1.229,-.38),pt(.797,1.23,1.62),pt(.738,1.22,1.86)],.013);
    line(p,silver,[pt(.65,2.19,-.53),pt(.785,2.20,-.38),pt(.806,2.20,1.55),pt(.747,2.18,1.80)],.013);
    windowFrame(p,side);
    glassPane(p,[pt(.747,1.23,.47),pt(.747,1.23,1.81),pt(.744,2.17,1.70),pt(.744,2.17,.47)]);
    for(const dz of [.31,1.01]){
      p.box(chrome,pt(.837,1.13,dz),[.031,.036,.133],.012,0,metal);
      p.box('#313135',pt(.810,.91,dz+.092),[.006,.55,.015],.002);
    }
    // Pressed door skins have a convex outer face, recessed reveals and slim handles.
    for(const [front,rear] of [[-.46,.408],[.445,1.10],[1.137,1.75]]){
      const rows=[front,front+.028,front+.085,rear-.085,rear-.028,rear].map((z,i)=>{
        const crown=[0,.012,.021,.021,.012,0][i];
        return [pt(.785,.605,z),pt(.793+crown,.645,z),pt(.805+crown,.84,z),
          pt(.799+crown,1.075,z),pt(.792+crown,1.154,z),pt(.785,1.188,z),pt(.774,1.176,z),pt(.774,.63,z)];
      });
      smoothPanel(p,rows.map(r=>side<0?r.reverse():r),black,([,y,z])=>
        uv(patches.doors,(z+.46)/2.21,(1.188-y)/.583),painted);
    }
    // A continuously rolled fender dips into the running board between the axles.
    const profile=[[-1.98,.68],[-1.83,.90],[-1.60,1.015],[-1.38,1.05],[-1.16,1.02],[-.94,.89],
      [-.71,.69],[-.45,.48],[-.23,.40],[.50,.40],[.71,.48],[.86,.69],[1.03,.92],[1.24,1.03],
      [1.42,1.05],[1.63,.997],[1.80,.86],[1.95,.67]];
    const curve=new T.SplineCurve(profile.map(([z,h])=>new T.Vector2(z,h)));
    // The fender is sampled three times more coarsely on the distant build.
    const low=lowDetail(),samples=curve.getPoints(low?28:84),every=low?1:3;
    smoothPanel(p,samples.map(({x:z,y:h})=>[pt(.69,h-.04,z),pt(1.16,h-.045,z),pt(1.19,h-.028,z),
      pt(1.185,h-.002,z),pt(1.14,h+.017,z),pt(.98,h+.032,z),pt(.70,h+.012,z)]).map(row=>side<0?row.reverse():row),wing);
    line(p,brass,samples.filter((_,i)=>i%every===0).map(({x:z,y:h})=>pt(1.146,h+.016,z)),.008);
    line(p,'#999993',samples.filter((_,i)=>i%every===0).map(({x:z,y:h})=>pt(1.182,h-.018,z)),.009);
    p.box('#303034',pt(.977,.432,.15),[.38,.018,.65],.008);
    for(const x of [.835,.89,.945,1,1.055,1.11])p.pipe(x===.835||x===1.11?brass:silver,
      pt(x,.444,-.15),pt(x,.444,.45),.006,metal);
    for(let i=0;i<6;i++){
      const x=.505+i*.014,z=-1.76+i*.116;
      p.box('#3b262d',pt(x,1.026,z+.014),[.033,.294,.056],.014,.058,lacquer);
      p.box(chrome,pt(x+.009,1.025,z),[.027,.273,.030],.012,.058,metal);
    }
    line(p,silver,[pt(.485,1.148,-1.84),pt(.536,1.170,-1.41),pt(.591,1.185,-.90)],.009);
    const lamp=pt(.655,.998,-1.93);
    p.pipe(silver,pt(.435,.90,-1.86),lamp,.038,metal);
    p.pipe(black,pt(.655,.998,-1.79),lamp,.082,lacquer,.173,28);
    p.pipe(chrome,lamp,pt(.655,.998,-1.968),.173,metal,.168,32);
    p.pipe(brass,pt(.655,.998,-1.966),pt(.655,.998,-1.974),.152,metal,.149,32);
    p.pipe('#ffc770',pt(.655,.998,-1.969),pt(.655,.998,-1.996),.144,lens,.124,32);
    // Pressed ridges catch light across the convex headlamp lens.
    for(let i=-4;i<=4;i++){
      const dx=i*.024,h=Math.sqrt(.121**2-dx**2);
      p.pipe('#ffe9bb',pt(.655+dx,.998-h,-1.997),pt(.655+dx,.998+h,-1.997),.0035,trim);
    }
    // Stepped lamp bezels keep a ruby lens and amber marker legible from behind.
    p.box(brass,pt(.675,.896,1.937),[.167,.230,.080],.034,0,metal);
    p.box('#682030',pt(.675,.896,1.978),[.139,.202,.026],.024,0,lacquer);
    for(const [h,color] of [[.845,'#bb273c'],[.896,'#d83948'],[.951,'#efa33c']])
      p.box(color,pt(.675,h,1.996),[.118,.042,.016],.012,0,lens);
  }
  for(const rear of [false,true]){
    const outline=[[-.73,1.18],[.73,1.18],[.73,2.174],[.65,2.212],[-.65,2.212],[-.73,2.174]];
    const opening=rear?[-.62,.62,1.34,2.065,.132]:[-.674,.674,1.306,2.125,.073];
    stamp(p,outline,[opening],(x,y,d)=>[x,y,rear?1.855-.108*(y-1.2)+d:-.524+.14*(y-1.2)-d]);
  }
  // Rounded rear-window corners and a crowned trunk lid read from the chase camera.
  for(const side of [-1,1]){
    for(const z of [-2.08,2.01])p.box('#555a5b',[side*.61,.42,z],[.051,.055,.23],.014,0,metal);
  }
  deck(p,[[1.69,.66,.70,1.11],[1.81,.724,.68,1.19],[1.91,.696,.66,1.16],[1.99,.595,.66,1.09]],black);
  line(p,silver,[[-.55,.83,1.996],[-.24,.817,2.003],[0,.81,2.005],[.24,.817,2.003],[.55,.83,1.996]],.011);
  // Follow the trunk's taper; the painted belt wraps its rear corners.
  const trunkRows=[[-.66,1.935],[-.59,1.996],[-.45,1.997],[.45,1.997],[.59,1.996],[.66,1.935]];
  for(let i=1;i<trunkRows.length;i++){
    const section=trunkRows.slice(i-1,i+1);
    const points=section.flatMap(([x,z])=>[[x,1.085,z],[x,.856,z]]);
    const coords=points.map(([x,y])=>uv(patches.trunk,(x+.66)/1.32,(1.085-y)/.229));
    p.add(surface(points,[0,1,2,1,3,2],coords),painted);
  }
  p.box(chrome,[0,.848,2.0],[.13,.029,.046],.011,0,metal);
  // Single strapped spare on the driver's side, forward of the door opening.
  makeWheel(p,-.80,.923,-.64,.83,-1,true);
  for(const z of [-.76,-.54]){
    const top=.923+Math.sqrt((.47*.83)**2-(z+.64)**2);
    const strap=[[-.711,top-.028],[-.726,top+.003],[-.863,top+.006],[-.902,top-.016],
      [-.916,top-.054],[-.916,top-.092]];
    const points=strap.flatMap(([x,y])=>[[x,y,z-.018],[x,y,z+.018]]);
    const faces=[];
    for(let i=0;i<points.length-2;i+=2)faces.push(i,i+2,i+1,i+1,i+2,i+3);
    p.add(surface(points,faces),lacquer,'#83472d');
    p.box(brass,[-.92,top-.067,z],[.013,.031,.049],.005,0,metal);
    p.box('#72412b',[-.928,top-.065,z],[.006,.014,.031],.002);
  }
  // Bright radiator surround, narrow vertical flutes and a small winged cap.
  p.box(chrome,[0,.86,-1.99],[.86,.82,.095],.091,0,metal);
  p.box('#191a1b',[0,.86,-2.042],[.75,.71,.022],.064);
  for(let j=-8;j<=8;j++)p.pipe(silver,[j*.041,.545+Math.abs(j)*.002,-2.06],[j*.041,1.178-Math.abs(j)*.003,-2.06],.010,metal);
  p.pipe(brass,[0,1.172,-2.057],[0,1.172,-2.074],.055,metal,.05,28);
  enamelBadge(p,.047,[0,1.172,-2.075],Math.PI);
  p.pipe(chrome,[0,1.25,-1.91],[0,1.36,-1.91],.029,metal);
  line(p,chrome,[[-.085,1.39,-1.84],[0,1.35,-1.96],[.085,1.39,-1.84]],.018);
  line(p,silver,[[0,1.26,-1.89],[0,1.30,-1.36],[0,1.334,-.55]],.013);
  for(const [z,sign] of [[-2.14,-1],[2.08,1]]){
    line(p,chrome,[[-.93,.45,z-sign*.10],[-.81,.46,z],[0,.46,z+sign*.04],[.81,.46,z],[.93,.45,z-sign*.10]],.038);
    for(const x of [-.58,.58])p.box(silver,[x,.48,z],[.065,.19,.08],.024,0,metal);
  }
  glassPane(p,[[-.705,1.28,-.535],[.705,1.28,-.535],[.704,2.174,-.399],[-.704,2.174,-.399]]);
  glassPane(p,[[-.672,1.23,1.88],[.672,1.23,1.88],[.663,2.15,1.76],[-.663,2.15,1.76]]);
  // Slender period wipers, a cowl vent and raised chrome windscreen hinges.
  for(const side of [-1,1]){
    const x=.39*side;
    p.pipe(silver,[x,1.292,-.567],[x+.15,1.482,-.538],.008,metal);
    p.pipe('#303031',[x+.040,1.44,-.543],[x+.23,1.49,-.537],.012,trim);
    p.box(chrome,[side*.692,2.128,-.421],[.05,.039,.044],.008,0,metal);
    for(let i=0;i<4;i++)p.box('#303235',[side*(.22+.065*i),1.306,-.605],[.025,.012,.085],.005);
  }
  for(const [y,z,w] of [[1.28,-.54,.74],[2.17,-.40,.74],[1.23,1.87,.72],[2.16,1.75,.71]])
    p.pipe(chrome,[-w,y,z],[w,y,z],.023,metal);
  for(const [z,w] of [[crestlineDriver.z+.085,1.23],[1.23,1.27]]){
    p.box(hide,[0,.81,z],[w,.16,.59],.064);
    p.box('#713343',[0,1.04,z+.32],[w,.49,.12],.054,.12);
    for(let i=-3;i<=3;i++)p.box(i%2?'#a86746':'#b07550',[i*.15,1.05,z+.256],[.129,.34,.043],.02,.12);
    // The seat back tilts away from the wheel and carries an embossed map pocket.
    const x=w*.465;
    panelFace(p,[[-x,1.233,z+.407],[x,1.233,z+.407],[x,.864,z+.363],[-x,.864,z+.363]],patches.pocket,textile);
    line(p,'#ddae78',[[-x,1.237,z+.406],[0,1.243,z+.409],[x,1.237,z+.406]],.008,trim);
  }
  p.box('#624739',[0,1.12,-.49],[1.34,.19,.14],.033);
  panelFace(p,[[-.638,1.186,-.417],[.638,1.186,-.417],[.638,1.054,-.417],[-.638,1.054,-.417]],patches.walnut);
  for(const [x,r] of [[-.29,.066],[-.12,.096],[.073,.057],[.209,.057]]){
    p.pipe(chrome,[x,1.133,-.419],[x,1.133,-.407],r,metal,r,24);
    p.pipe(enamel,[x,1.133,-.407],[x,1.133,-.402],r*.83,trim,r*.83,24);
    for(let j=0;j<7;j++){
      const a=(j-3)*.64;
      p.pipe(ivory,[x+r*.65*Math.sin(a),1.133+r*.65*Math.cos(a),-.400],
        [x+r*.75*Math.sin(a),1.133+r*.75*Math.cos(a),-.400],.002,trim,.002,5);
    }
    p.pipe(ivory,[x,1.133,-.400],[x+.38*r,1.133+.52*r,-.399],.0035,trim);
  }
  return p.finish();
}

function fitShadow(shadow){
  // Ground the four narrow whitewalls individually, with a softer penumbra
  // under the chassis. The existing animation shrinks this map during jumps.
  if(!contactShadow){
    const width=128,height=192,data=new Uint8Array(width*height*4);
    for(let j=0;j<height;j++)for(let i=0;i<width;i++){
      const x=((i+.5)/width-.5)*3.15,z=(.5-(j+.5)/height)*4.98;
      let alpha=.40*Math.exp(-((x/.82)**4+(z/1.77)**4));
      for(const [axleZ] of crestlineAxles)for(const side of [-1,1]){
        const d=((x-side*crestlineHalfTrack)/.215)**2+((z-axleZ)/.34)**2;
        alpha+=.63*Math.exp(-d);
      }
      const k=(j*width+i)*4;
      data[k]=data[k+1]=data[k+2]=255;data[k+3]=255*Math.min(.80,alpha);
    }
    contactShadow=new T.DataTexture(data,width,height);
    contactShadow.magFilter=contactShadow.minFilter=T.LinearFilter;contactShadow.needsUpdate=true;
  }
  shadow.geometry=contactPlane;
  shadow.material.map=contactShadow;shadow.material.color.set('#121416');shadow.material.opacity=1;
}
export function attachCrestline(body,wheels,shadow){
  if(!dressed){
    dressed=true;
    initMaterials();
    const sheet=new T.TextureLoader().load(coachworkUrl);
    sheet.colorSpace=T.SRGBColorSpace;sheet.anisotropy=8;
    painted.map=textile.map=sheet;
    const sky=coachworkSky();painted.envMap=sky;
    lacquer.envMap=sky;metal.envMap=sky;glass.envMap=sky;
  }
  const built=templates[kartDetail()]??=(()=>{
    const wheel=assembly(trim);
    makeWheel(wheel);
    return {body:makeBody(),wheel:wheel.finish()};
  })();
  function attach(group,parts,flip=false){
    for(const part of parts){
      const mesh=new T.Mesh(part.geometry,part.material);
      mesh.userData.sharedKartPart=true;
      if(flip)mesh.rotation.y=Math.PI;
      group.add(mesh);
    }
  }
  fitShadow(shadow);
  attach(body,built.body);
  for(const axle of wheels)attach(axle,built.wheel,axle.position.x<0);
}

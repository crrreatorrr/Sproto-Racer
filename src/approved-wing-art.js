import * as T from 'three';

// Approved art, authored in Sproto Racer neutral-body units. The build
// output is a transient mesh assembly for the shared kart-wing batcher, not
// a render-time dependency graph. Side is -1 for port and +1 for starboard.

const paint=(color,roughness=.34,metalness=.30)=>new T.MeshStandardMaterial({color,roughness,metalness,side:T.DoubleSide});
const glow=color=>new T.MeshBasicMaterial({color,toneMapped:false,side:T.DoubleSide});
const M={
 dark:paint('#2b3441',.49,.62), carbon:paint('#1e2430',.63,.24), steel:paint('#bac5ca',.27,.57),
 silver:paint('#dceaff',.24,.45), nut:paint('#544c45',.33,.52), light:glow('#feebbd'),
 ice:glow('#afffea'), red:glow('#ff6150'), amber:glow('#ffc361'), cobalt:glow('#77d5ff')
};
// The broad hinge nacelles keep a round profile; fastener/lamp geometry is
// sub-pixel in race view. The sculpture's planform and paint stay unchanged.
const ballG=new T.SphereGeometry(1,12,6);
const smallBallG=new T.SphereGeometry(1,8,4);
const pipeG=new T.CylinderGeometry(1,1,1,8);
const qp=new T.Quaternion();
const v=a=>new T.Vector3(...a);
const mix=T.MathUtils.lerp;
const add=(g,geo,material,p=[0,0,0],scale=[1,1,1])=>{
 const o=new T.Mesh(geo,material);o.position.set(...p);o.scale.set(...scale);
 o.userData.wingTemporaryGeometry=geo!==ballG&&geo!==smallBallG&&geo!==pipeG;
 g.add(o);return o;
};
const dot=(g,m,p,x,y,z)=>add(g,Math.max(x,y,z)>.16?ballG:smallBallG,m,p,[x,y,z]);
function rod(g,m,a,b,r){
 const d=v(b).sub(v(a));const o=add(g,pipeG,m,v(a).addScaledVector(d,.5).toArray(),[r,d.length(),r]);
 o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;
}
function tube(g,m,ps,r,segments=32){
 return add(g,new T.TubeGeometry(new T.CatmullRomCurve3(ps.map(v)),Math.min(r<.013?12:Infinity,Math.ceil(segments/2)),r,r>.02?6:5,false),m);
}
function tri(p,q,r){return [...p,...q,...r];}
function quad(a,b,c,d){return [...tri(a,b,c),...tri(a,c,d)];}
function mesh(g,mat,positions){
 const geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
 geo.computeVertexNormals();
 return add(g,geo,mat);
}
function foilPoint(rows,c,u,t,h=0){
 let i=0;while(i+1<rows.length-1&&rows[i+1][0]<u)i++;
 const [u0,f0,b0,y0]=rows[i], [u1,f1,b1,y1]=rows[i+1], l=(u-u0)/(u1-u0);
 const lead=mix(f0,f1,l), trail=mix(b0,b1,l), y=mix(y0,y1,l);
 return [c.side*(c.start+u*c.wingSpan),c.y+y+Math.sin(Math.PI*t)*.056+h,c.z+mix(lead,trail,t)];
}
const profile=(rows,c)=>((u,v,h)=>foilPoint(rows,c,u,v,h));
function foil(g,c,rows,paint,leading=M.steel,edge=M.dark,thickness=.108){
 const at=profile(rows,c);
 const top=[],bottom=[],front=[],back=[],tips=[];
 const stops=rows.map(r=>r[0]);
 for(let i=0;i<rows.length-1;i++){
  const a=stops[i],b=stops[i+1];
  for(let j=0;j<12;j++){
   const v0=j/12,v1=(j+1)/12;
   top.push(...quad(at(a,v0,.5*thickness),at(b,v0,.5*thickness),at(b,v1,.5*thickness),at(a,v1,.5*thickness)));
   bottom.push(...quad(at(a,v1,-.5*thickness),at(b,v1,-.5*thickness),at(b,v0,-.5*thickness),at(a,v0,-.5*thickness)));
  }
  front.push(...quad(at(a,0,-.5*thickness),at(b,0,-.5*thickness),at(b,0,.5*thickness),at(a,0,.5*thickness)));
  back.push(...quad(at(a,1,.5*thickness),at(b,1,.5*thickness),at(b,1,-.5*thickness),at(a,1,-.5*thickness)));
 }
 for(const u of [stops[0],stops.at(-1)])for(let j=0;j<12;j++){
  const v0=j/12,v1=(j+1)/12;
  tips.push(...quad(at(u,v0,.5*thickness),at(u,v1,.5*thickness),at(u,v1,-.5*thickness),at(u,v0,-.5*thickness)));
 }
 mesh(g,paint,top);mesh(g,edge,bottom);
 mesh(g,leading,front);mesh(g,edge,[...back,...tips]);
 return (u,v,offset=.007)=>at(u,v,.5*thickness+offset);
}
function paintedRibbon(g,m,at,uv,w,offset=.013){
 const pos=[];
 for(let k=0;k<uv.length-1;k++){
  const [u0,v0]=uv[k],[u1,v1]=uv[k+1];
  for(let j=0;j<12;j++){
   const a=j/12,b=(j+1)/12, uA=mix(u0,u1,a),uB=mix(u0,u1,b),vA=mix(v0,v1,a),vB=mix(v0,v1,b);
   pos.push(...quad(at(uA-w*.5,vA,offset),at(uB-w*.5,vB,offset),at(uB+w*.5,vB,offset),at(uA+w*.5,vA,offset)));
  }
 }
 return mesh(g,m,pos);
}
function rib(g,m,at,u,front=.08,back=.91,r=.022){
 return tube(g,m,[at(u,front),at(u,.36,.021),at(u,.67,.021),at(u,back)],r,12);
}
function fastener(g,p,m=M.steel,r=.036){
 const o=add(g,new T.CylinderGeometry(r,r,.031,6),m,p);return o;
}
function tipFin(g,from,rel,mat,tipLight,side){
 const p=(dx,dy,dz)=>[from[0]+side*dx,from[1]+dy,from[2]+dz], a=p(...rel[0]), b=p(...rel[1]), c=p(...rel[2]), d=p(...rel[3]);
 mesh(g,mat,quad(a,b,c,d));tube(g,M.steel,[a,b,c,d,a],.018,26);
 dot(g,tipLight,c,.042,.028,.055);
}
function hinge(g,c,tint,form){
 const x=c.side,y=c.y,z=c.z;
 const [a,b,d]=c.socket;
 const start=[x*c.start,y+.06,z+.01];
 const inboard=[a-x*.10,b,d];
 rod(g,M.dark,inboard,start,.093);
 rod(g,M.steel,[a-x*.07,b-.17,d-.28],[start[0],start[1]-.13,z-.33],.039);
 rod(g,M.steel,[a-x*.07,b-.155,d+.28],[start[0],start[1]-.12,z+.33],.039);
 dot(g,tint,[start[0],y+.075,z],.246,.108,.50);
 dot(g,M.dark,[start[0]+x*.012,y+.008,z],.234,.128,.48);
 for(const dz of [-.322,.321]){
  const cap=add(g,new T.CylinderGeometry(.097,.097,.081,10),form, [start[0]+x*.07,y+.077,z+dz]);cap.rotation.x=Math.PI/2;
  dot(g,M.light,[start[0]+x*.106,y+.14,z+dz],.038,.026,.040);
 }
 for(const dx of [-.135,.148])for(const dz of [-.19,.19])
  fastener(g,[start[0]+x*dx,y+.164,z+dz],M.steel,.026);
 return start;
}
function ringDuct(g,c,p,r,paint,signal){
 const old=g.children.length;
 const [x,y,z]=p;
 const pos=[], bevel=[], inner=[];
 function at(t,r,y){return [x+r*Math.cos(t),y,z+r*Math.sin(t)];}
 const rim=.102*r/.59, depth=.162;
 for(let i=0;i<40;i++){
  const a=i*2*Math.PI/40,b=(i+1)*2*Math.PI/40;
  pos.push(...quad(at(a,r,y+.04),at(b,r,y+.04),at(b,r,y-depth),at(a,r,y-depth)));
  pos.push(...quad(at(a,r-rim,y-depth),at(b,r-rim,y-depth),at(b,r,y-depth),at(a,r,y-depth)));
  bevel.push(...quad(at(a,r-.02,y+.08),at(b,r-.02,y+.08),at(b,r-rim,y+.062),at(a,r-rim,y+.062)));
  pos.push(...quad(at(a,r-.02,y+.08),at(b,r-.02,y+.08),at(b,r,y+.04),at(a,r,y+.04)));
  inner.push(...quad(at(a,r-rim,y+.062),at(b,r-rim,y+.062),at(b,r-rim,y-depth),at(a,r-rim,y-depth)));
 }
 mesh(g,paint,pos);mesh(g,M.steel,bevel);mesh(g,M.carbon,inner);
 for(let i=0;i<7;i++){
  const t=i*2*Math.PI/7+.14, blade=[];
  const q=(r,d,h)=>[x+Math.cos(t)*r-Math.sin(t)*d,y+h,z+Math.sin(t)*r+Math.cos(t)*d];
  blade.push(...quad(q(.095,-.058,-.041),q(r*.79,-.137,-.033),q(r*.83,.019,-.099),q(.17,.088,-.092)));
  blade.push(...quad(q(.095,-.058,-.041),q(.17,.088,-.092),q(.19,.124,-.125),q(.089,-.048,-.090)));
  mesh(g,i%2?M.steel:paint,blade).userData.wingRotor=true;
 }
 dot(g,M.dark,[x,y-.068,z],.134,.081,.134).userData.wingRotor=true;
 dot(g,signal,[x,y-.022,z],.069,.025,.069);
 for(const t of [.0,Math.PI*.5,Math.PI,Math.PI*1.5]){
   fastener(g,[x+Math.cos(t)*(r-.029),y+.091,z+Math.sin(t)*(r-.029)],M.nut,.030);
 }
 const spin=qp.setFromAxisAngle(new T.Vector3(0,0,1),c.side*.14);
 g.userData.wingRotorCenter=v(p);
 g.userData.wingRotorAxis=new T.Vector3(0,1,0).applyQuaternion(spin);
 for(const m of g.children.slice(old)){
  m.position.copy(v(p).add(m.position.clone().sub(v(p)).applyQuaternion(spin)));
  m.quaternion.premultiply(spin);
 }
}
function atlas(g,c){
 const ochre=paint('#777654',.45,.24), orange=paint('#ef6d2e',.31,.25), c2=paint('#454b40',.41,.52);
 const solar=glow('#66eac5'), warning=paint('#e0a640',.47,.21);
 const root=hinge(g,c,ochre,orange);
 const a=[[0,-.48,.52,0],[.11,-.72,.58,.094],[.27,-.93,.56,.246],[.41,-.87,-.38,.31],[.71,-.73,-.32,.40],[.90,-.62,-.09,.52],[1.0,-.38,.06,.59]];
 const b=[[.06,.36,.58,.04],[.28,.38,.86,.24],[.43,.54,.88,.31],[.70,.61,.99,.40],[.92,.34,.85,.51],[1,.05,.67,.59]];
 const front=foil(g,c,a,ochre,orange,M.carbon,.15);
 const back=foil(g,c,b,c2,orange,M.carbon,.145);
 for (const u of [.13,.22,.31])rib(g,warning,front,u,.08,.88,.018);
 for (const u of [.31,.43,.55,.67,.79,.91]){
    const aft=back(u,.42,.045);fastener(g,aft,M.steel,.027);
 }
 const fanX=c.start+c.wingSpan*.57, duct=[c.side*fanX,c.y+.385,c.z+.116];
 ringDuct(g,c,duct,.595,c2,solar);
 for(const z of [-.294,.320])rod(g,M.dark,[root[0],root[1]-.02,root[2]+z],[duct[0]-c.side*.33,duct[1]-.09,duct[2]+z],.053);
 const bridge=foil(g,c,[[.62,-.85,-.56,.39],[.78,-.87,-.48,.43],[.97,-.64,-.12,.56],[1,-.38,.04,.59]],orange,M.steel,M.dark,.075);
 for(const t of [.28,.47,.65])rod(g,M.dark,bridge(.76,t),bridge(.93,t),.022);
 const t=front(.96,.69,.011);
 tipFin(g,t,[[-.01,.012,-.12],[.13,.024,.47],[.19,.41,.555],[-.06,.255,.148]],orange,M.ice,c.side);
 dot(g,c.side>0?M.ice:M.red,front(.96,.25,.025),.074,.034,.048);
 dot(g,M.amber,back(.89,.78,.031),.086,.034,.086);
}
function zephyr(g,c){
 const navy=paint('#263b56',.292,.43), cream=paint('#f2e2bd',.22,.17), champagne=paint('#f5ca78',.29,.58);
 const blue=paint('#325d7e',.29,.47), jetpaint=paint('#172436',.43,.45);
 const root=hinge(g,c,champagne,navy);
 const bladeA=[[0,-.62,.26,.01],[.12,-.72,.305,.052],[.28,-.77,.247,.185],[.46,-.71,.104,.29],[.63,-.56,-.033,.39],[.80,-.43,-.12,.47],[.92,-.27,-.08,.52],[1,-.12,-.095,.55]];
 const bladeB=[[.051,.182,.62,.04],[.20,.20,.647,.10],[.41,.205,.650,.29],[.61,.155,.564,.43],[.77,.17,.46,.53],[.885,.24,.39,.62],[.953,.33,.357,.68]];
 const bladeC=[[.10,.57,.82,.10],[.22,.58,1.02,.17],[.40,.64,1.10,.31],[.56,.65,1.08,.45],[.70,.70,.985,.55],[.81,.762,.947,.67],[.90,.886,.929,.73]];
 const front=foil(g,c,bladeA,navy,champagne,jetpaint,.087);
 const middle=foil(g,c,bladeB,cream,M.steel,navy,.075);
 const tail=foil(g,c,bladeC,blue,champagne,jetpaint,.068);
 for (const [at,from,to,material] of [[front,0,.997,champagne],[middle,.061,.950,navy],[tail,.106,.896,champagne]]){
   for (const [f,r] of [[.16,.025],[.32,.011],[.71,.012]]){
    const ps=Array.from({length:25},(_,i)=>at(mix(from,to,i/24),f,.009));
    tube(g,material,ps,r,34);
   }
 }
 for(const u of [.27,.47]){
   rod(g,M.steel,front(u,.82,.004),middle(u,.57,.013),.023);
   rod(g,champagne,middle(u,.85,.013),tail(u,.27,.012),.021);
 }
 const step=[[.06,-.53,-.29,.115],[.24,-.62,-.382,.170],[.40,-.64,-.432,.230],[.55,-.517,-.384,.356],[.71,-.396,-.341,.435]];
 const inlay=foil(g,c,step,cream,champagne,navy,.040);
 for(const u of [.21,.34,.48])fastener(g,inlay(u,.50,.012),champagne,.027);
 const p=front(.89,.35,.013);
 dot(g,c.side>0?M.ice:M.red,p,.062,.025,.037);
 dot(g,M.amber,tail(.842,.63,.023),.028,.023,.046);
 for(const u of [.73,.802,.88])rib(g,M.steel,front,u,.08,.36,.014);
}
function sunstrike(g,c){
 const yellow=paint('#ffba18',.337,.28), yellow2=paint('#ffc846',.32,.32), mustard=paint('#bd7926',.36,.40);
 const matte=paint('#26303c',.44,.39), ink=paint('#1d2734',.47,.33);const white=paint('#fff3c8',.27,.2);
 const root=hinge(g,c,matte,yellow);
 const frontRows=[[0,-.59,.40,.04],[.14,-.99,.30,.12],[.31,-1.17,.21,.22],[.58,-1.18,.11,.34],[.77,-1.08,-.08,.38],[.91,-.88,-.31,.52],[1,-.72,-.63,.63]];
 const tailRows=[[.12,.43,.63,.08],[.28,.396,.849,.14],[.48,.327,.991,.19],[.62,.329,.941,.24],[.76,.36,.835,.28],[.91,.43,.67,.42],[.97,.506,.603,.49]];
 const top=foil(g,c,frontRows,yellow,white,ink,.102);
 const back=foil(g,c,tailRows,yellow2,matte,ink,.086);
 for(const [at,v,n,w] of [[top,.13,.82,.015],[top,.72,.73,.017],[back,.33,.91,.019]]) {
   const ps=Array.from({length:20},(_,i)=>at(.15+(n-.15)*i/19,v,.007));
   tube(g,matte,ps,w,31);
 }
 // Off-axis overlapping chevrons match the rally car's own double-stripe livery.
 for(const i of [0,1]){
  const a=.49+i*.126;
  const chevron=[[a-.044,.182],[a+.065,.537],[a-.014,.861]];
  paintedRibbon(g,ink,top,chevron,.058);
  paintedRibbon(g,white,top,chevron,.020,.019);
 }
 paintedRibbon(g,ink,back,[[.40,.14],[.58,.41],[.684,.76]],.14,.014);
 for(const [u,v] of [[.3,.21],[.4,.54],[.52,.27],[.75,.31],[.79,.62]])fastener(g,top(u,v,.028),M.steel,.023);
 for(const u of [.27,.49,.67])rod(g,M.steel,top(u,.88,-.014),back(u,.38,-.017),.032);
 const pos=top(.829,.29,.016);
 tipFin(g,pos,[[-.08,.014,-.08],[.17,.04,.39],[.222,.332,.50],[-.011,.204,.154]],matte,M.ice,c.side);
 const pos2=back(.866,.53,.003);
 tipFin(g,pos2,[[0,.014,-.09],[.11,.014,.26],[.207,.30,.351],[.01,.25,.128]],mustard,c.side>0?M.ice:M.red,c.side);
 for(const u of [.83,.876,.915]){
   const p=top(u,.118,.029);const pos=[p[0],p[1]-.020,p[2]-.04];
   dot(g,c.side>0?M.ice:M.red,pos,.051,.027,.057);
 }
 const s=c.side;dot(g,matte,[root[0]+s*.34,root[1]-.148,root[2]+.02],.21,.103,.40);
 rod(g,M.steel,[root[0]+s*.36,root[1]-.17,root[2]-.17],[root[0]+s*.36,root[1]-.16,root[2]+.40],.054);
}


// Original verified sheet sockets, including the independent neutral wing span.
const approved = Object.freeze({
  ironhide: { form:atlas, x:1.2430000305175781, y:1.16, z:.48, span:2.0457238817214964 },
  crestline: { form:zephyr, x:.823538445504691, y:.8, z:.23, span:2.12746153923652 },
  'track-rally': { form:sunstrike, x:.9571121517504402, y:.84, z:.27, span:2.094587852588778 },
});
const hasWing=(id,side)=>Object.hasOwn(approved,id)&&(side===-1||side===1);
export function approvedWingMount(vehicleId,side){
 if(!hasWing(vehicleId,side))return null;
 const {x,y,z}=approved[vehicleId];
 return [side*x,y,z];
}

export function buildApprovedWingArt(vehicleId,side) {
 if(!hasWing(vehicleId,side))return null;
 const {form,span}=approved[vehicleId], group=new T.Group();
 form(group,{side,socket:[0,0,0],start:.26,wingSpan:span,y:.024,z:0});
 group.name=`Approved ${vehicleId} / ${side<0?'port':'starboard'} art`;
 return group;
}

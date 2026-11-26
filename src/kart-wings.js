import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { geepScale } from './geep-layout.js';
import { approvedWingMount, buildApprovedWingArt } from './approved-wing-art.js';

// Stock-pattern wing assemblies inherit the body pose but cannot change gameplay.
// Further one-off designs are supplied by approved-wing-art.js.
// Profile: [name, family, chord, rake, tip-rise, paint, accent, port mount, starboard mount].
// Mount: [x,y,z, panel root distance from vehicle center, panel span]; measured in
// the concept renderer's neutral pose. Design-only cars and native flyers have no entries.
const PROFILES = {
  "apex": ["Grand Prix Glider","arrow",1.22,0.48,0.15,"#f45930","#fff0c7",[-0.944999993,0.64,0.23,1.204999993,1.423500022],[0.944999993,0.64,0.23,1.204999993,1.423500022]],
  "needle": ["High-Speed Spear","knife",0.83,0.77,0.13,"#58b3cf","#e0f5da",[-0.992167162,0.55,0.27,1.252167162,1.556332853],[0.992167162,0.55,0.27,1.252167162,1.556332853]],
  "pogo": ["Springboard Biplane","double",1.13,0.11,0.28,"#efa834","#723b56",[-0.839296729,0.74,0.1,1.099296729,1.349203285],[0.839296724,0.74,0.1,1.099296724,1.34920329]],
  "gecko": ["Canopy Gecko","leaf",1.45,0.35,0.12,"#9bc653","#e6f8a9",[-1.103935955,0.69,0.12,1.363935955,1.21456406],[1.103935955,0.69,0.12,1.363935955,1.21456406]],
  "relay": ["Relay Split-Flap","split",1.25,0.47,0.18,"#ae81dc","#fff0cc",[-0.930000007,0.77,0.34,1.190000007,1.348500007],[0.930000007,0.77,0.34,1.190000007,1.348500007]],
  "geep": ["Bushplane Rally Kit","utility",1.19,0.05,0.2,"#789a49","#dbf67f",[-0.866773561,0.81,0.28,1.126773561,1.690453633],[0.866773561,0.81,0.28,1.126773561,1.690453633]],
  "hexshift": ["Lunar Crescent","crescent",1.34,0.64,0.2,"#71345b","#f9c78f",[-0.717544502,0.62,0.2,1.142999945,1.47],[0.717531238,0.62,0.2,1.142999945,1.47]],
  "barrage": ["Pulse Interceptor","crank",1.05,0.68,0.22,"#ed6327","#ffe9c7",[-1.221553425,0.62,0.23,1.481553425,1.223446572],[1.221553425,0.62,0.23,1.481553425,1.223446572]],
  "manta": ["Manta Hydrofoil","manta",1.45,0.6,0.1,"#aab9d5","#9df8ff",[-0.990934493,0.55,0.12,1.250934493,1.36521489],[0.990934493,0.55,0.12,1.250934493,1.36521489]],
  "shopping-cart": ["Wire-Rack Parafoil","fabric",1.18,0.22,0.19,"#d44737","#d7e5eb",[-0.81528455,0.75,0.51,1.07528455,1.2884324],[0.815284562,0.75,0.51,1.075284562,1.288432389]],
  "skipper": ["Sea-Plane Sponsons","pontoon",1.31,0.16,0.13,"#284e70","#f1dfbc",[-0.290899648,0.74,0.37,1.046999997,1.69],[0.290899648,0.74,0.37,1.046999997,1.69]],
  "track-formula": ["Formula Delta","arrow",1.3,0.54,0.16,"#ea3529","#f3efde",[-0.957998951,0.57,0.22,1.217998951,1.597401044],[0.957998951,0.57,0.22,1.217998951,1.597401044]],
  "track-prototype": ["Endurance Gull","gull",1.24,0.53,0.32,"#6bb4ea","#eff7f7",[-1.075642385,0.67,0.19,1.335642385,1.460857606],[1.075677877,0.67,0.19,1.335677877,1.460822115]],
  "track-hot-rod": ["Barnstormer Biplane","double",1.12,0.06,0.17,"#e9d5a3","#292430",[-0.75729572,0.63,0.23,1.036799996,1.59],[0.75729572,0.63,0.23,1.036799996,1.59]],
  "track-drift": ["Widebody Splitter","split",1.22,0.44,0.15,"#8e43c9","#ffc473",[-1.02983536,0.72,0.36,1.28983536,1.521464648],[1.02983536,0.72,0.36,1.28983536,1.521464648]],
  "track-electric": ["Battery-Blade Kit","fork",1.21,0.32,0.13,"#80caa3","#f2ede0",[-1.213409749,0.6,0.21,1.473409749,1.217890259],[1.155706161,0.6,0.21,1.415706161,1.275593847]],
  "ringrunner": ["Gyro Gull","gull",1.34,0.31,0.19,"#fa872d","#35303a",[-0.246993423,1.32,0.64,0.506993423,1.672206587],[0.252085655,1.32,0.64,0.512085655,1.667114356]],
  "windskiff": ["Land-Yacht Sailwing","fabric",1.2,0.58,0.34,"#e6ab46","#fff1cb",[-0.464812983,0.65,0.06,0.942140001,1.81],[0.46481216,0.65,0.06,0.942140001,1.81]],
  "arctic-skip": ["Ice-Rescue Floatwing","pontoon",1.5,0.4,0.22,"#2859c8","#e6f7fc",[-1.135084562,0.68,0.09,1.395084562,1.368915434],[1.134757454,0.68,0.09,1.394757454,1.369242543]],
  "bamboo-trike": ["Bamboo Kite","kite",1.26,0.25,0.31,"#99ad4e","#f4cb73",[-0.505816353,0.78,0.09,0.765816353,1.53078366],[0.505816044,0.78,0.09,0.765816044,1.530783969]],
  "mud-marauder": ["Six-Wheel Bushwing","cargo",1.57,0.17,0.22,"#838b49","#d0bd7e",[-1.064563597,1.08,0.38,1.324563597,1.381436407],[1.059071739,1.08,0.38,1.319071739,1.386928265]],
  "tarmac-press": ["Roller Lifting Slabs","lift",1.39,0.05,0.21,"#ee7060","#e7ae52",[-0.669073935,1.14,0.16,0.929073935,1.519576071],[0.669073932,1.14,0.16,0.929073932,1.519576074]],
  "volt-fork": ["Ion-Fork Glider","fork",1.3,0.45,0.15,"#a1d934","#83f7f4",[-1.059999943,0.57,0.2,1.319999943,1.122313695],[1.059999943,0.57,0.2,1.319999943,1.122313695]],
  "twin-current": ["Twin-Rotor Current","fan",1.1,0.31,0.18,"#10aeca","#8ff9f4",[-1.146000028,1,0.04,1.406000028,1.188314704],[1.146000028,1,0.04,1.406000028,1.188314704]],
  "rail-ghost": ["Ghost Blade","knife",1.05,0.7,0.17,"#343c4b","#fbb238",[-0.624317283,0.76,0.16,0.884317283,1.705682698],[0.624317283,0.76,0.16,0.884317283,1.705682698]],
  "solar-cushion": ["Solar Panel Wings","solar",1.46,0.2,0.15,"#e7edf0","#f38b37",[-1.437662835,0.67,0.18,1.697662835,1.330131507],[1.437662835,0.67,0.18,1.697662835,1.330131507]],
  "sunny-sidecar": ["Sunburst Sidecar","scallop",1.25,0.25,0.24,"#efc229","#d745a2",[-0.653203876,0.68,0.22,0.959999976,1.61],[1.030108429,0.68,0.22,1.290108429,1.279891547]],
  "market-dragster": ["Checkout Canvas","fabric",1.3,0.27,0.17,"#d74c3f","#cbd3d7",[-0.678047359,0.68,0.2,1.139689992,1.58],[0.678047353,0.68,0.2,1.139689992,1.58]],
  "ramp-tug": ["Airport Service Wings","utility",1.38,0.14,0.2,"#aebb3b","#fff3d7",[-0.912503145,0.75,0.22,1.172503145,1.469796854],[0.91259243,0.75,0.22,1.17259243,1.469707568]],
  "tiki-barrel": ["Carved Tiki Glider","leaf",1.42,0.42,0.21,"#b67b4c","#28a4a1",[-1.043915061,0.76,0.08,1.303915061,1.216508187],[1.043915018,0.76,0.08,1.303915018,1.21650823]],
  "ice-cream-van": ["Pastel Awning Wings","scallop",1.45,0.15,0.22,"#80cad8","#f28eb8",[-0.970000029,0.84,0.32,1.230000029,1.671500015],[0.970000029,0.84,0.32,1.230000029,1.671500015]],
  "groove-racer": ["Vinyl Groove Wings","vinyl",1.36,0.38,0.11,"#372d50","#fa6bc6",[-0.851000011,0.71,0.12,1.111000011,1.505999992],[0.851000011,0.71,0.12,1.111000011,1.505999992]],
  "bumper-bolt": ["Fairground Bump Wings","retro",1.32,0.25,0.13,"#21a1a8","#fff3d7",[-0.910978321,0.67,0.16,1.170978321,1.463611714],[0.911911755,0.67,0.16,1.171911755,1.462678279]],
  "bronze-bell": ["Bellmetal Petals","leaf",1.35,0.45,0.15,"#b97b49","#f8c37b",[-0.395343863,0.83,0.1,0.9421,1.51],[0.395343863,0.83,0.1,0.9421,1.51]],
  "reed-skimmer": ["Reed-Sail Wings","kite",1.35,0.44,0.2,"#29a79d","#f3dfbc",[-1.381619467,0.68,0.13,1.641619467,1.204980613],[1.381665707,0.68,0.13,1.641665707,1.204934372]],
  "steam-sprint": ["Riveted Rail Wings","lift",1.36,0.24,0.19,"#bb4444","#f3bc71",[-0.695142139,0.79,0.22,0.955142139,1.608657862],[0.695142139,0.79,0.22,0.955142139,1.608657862]],
  "amber-beetle": ["Elytra Sail Wings","beetle",1.39,0.49,0.24,"#e99a34","#ffe586",[-0.424326786,0.77,0.15,0.905670006,1.59],[0.423483497,0.77,0.15,0.905670006,1.59]],
  "violet-marble": ["Glasswing Trike","glass",1.24,0.41,0.27,"#6e48b2","#e2b1f8",[-0.829803001,0.66,0.13,1.089803001,1.327247007],[0.82980301,0.66,0.13,1.08980301,1.327246997]],
  "bone-wyrm": ["Ivory Rib Wings","bone",1.45,0.39,0.29,"#d8c397","#998568",[-0.419341359,0.78,0.31,0.897200007,1.74],[0.419341359,0.78,0.31,0.897200007,1.74]],
  "quarry-dumper": ["Quarry Slab Wings","cargo",1.44,0.08,0.2,"#e8b637","#373941",[-1.227081982,1.03,0.55,1.487081982,1.463018009],[1.22708199,1.03,0.55,1.48708199,1.463018]],
  "vermilion-loader": ["Loader Outrigger Wings","crank",1.47,0.46,0.21,"#d74636","#ffca49",[-1.207872191,0.97,0.48,1.467872191,1.43162782],[1.207872157,0.97,0.48,1.467872157,1.431627854]],
  "sky-mixer": ["Mixer Longspan","gull",1.54,0.32,0.26,"#3ea4ce","#ffedce",[-1.104368059,1.02,0.62,1.364368059,1.506731936],[1.104368051,1.02,0.62,1.364368051,1.506731945]],
  "boom-crane": ["Crane Truss Wings","truss",1.44,0.18,0.24,"#a94178","#f5ba42",[-0.959826705,1,0.42,1.219826705,1.665973286],[0.959826705,1,0.42,1.219826705,1.665973286]],
  "mint-digger": ["Excavator Petal Wings","leaf",1.45,0.34,0.16,"#4ac49b","#ffedce",[-0.91271147,0.98,0.42,1.17271147,1.542888538],[0.91271147,0.98,0.42,1.17271147,1.542888538]],
  "forklift-rat": ["Forklift Twin-Blades","fork",1.2,0.21,0.2,"#2967c9","#c6d63b",[-0.824707701,0.78,0.27,1.084707701,1.401092289],[0.824707701,0.78,0.27,1.084707701,1.401092289]],
};

const family={
 arrow:[1,1,.73,.52,.15,.06],knife:[1,.91,.66,.46,.23,.035],double:[1,1.05,.99,.91,.74,.28],
 leaf:[.75,1.05,1.12,.91,.60,.07],split:[1,1,.84,.71,.57,.17],utility:[1,1.13,1.07,1.02,.82,.31],
 crescent:[1.02,1.1,1,.78,.46,.04],crank:[1,1.07,.88,1.02,.68,.10],cargo:[1,1.10,1.14,1.01,.82,.32],
 retro:[1,1,.95,.83,.63,.16],manta:[1,1.08,.95,.66,.49,.05],fabric:[.74,1.05,1.16,.98,.61,.13],
 pontoon:[1,1.04,.87,.70,.47,.18],gull:[1,1.15,1.13,.90,.55,.12],fork:[1,1.03,1.02,1.09,1.11,.74],
 kite:[.66,1.03,1.12,.82,.53,.07],lift:[1,1.06,1.18,1.04,.95,.61],fan:[1,1.12,1.29,1.4,1.21,.29],
 solar:[1,1.11,1.20,1.17,1.12,.63],scallop:[.94,1.08,1.06,1.02,.83,.35],
 vinyl:[.85,1.07,1.13,1,.86,.27],beetle:[.76,1.07,1.09,.85,.62,.06],
 glass:[.76,1.07,1.13,1,.52,.06],bone:[.93,1.23,1.19,.92,.65,.08],
 truss:[1,1.05,1.13,1,.88,.36]
};
const loc=[0,.17,.38,.61,.84,1];
const mat=(c,r=.46,m=.16)=>new T.MeshStandardMaterial({color:c,roughness:r,metalness:m,side:T.DoubleSide,forceSinglePass:true});
const hardware=mat('#30394a',.39,.46), steel=mat('#a0adba',.37,.43);
const gleam=new T.MeshBasicMaterial({color:'#fff6d8'}), running=[new T.MeshBasicMaterial({color:'#ff725a'}),new T.MeshBasicMaterial({color:'#92ffe3'})];
const sphere=new T.SphereGeometry(1,10,7), cube=new T.BoxGeometry(1,1,1), cylinder=new T.CylinderGeometry(1,1,1,10);
const V=(a)=>a.isVector3?a.clone():new T.Vector3(...a);
function put(g,geo,m,pt,scale){const o=new T.Mesh(geo,m);o.position.copy(V(pt));if(scale)o.scale.set(...scale);g.add(o);return o}
function rod(g,m,a,b,r){a=V(a);b=V(b);const d=b.clone().sub(a);if(d.length()<1e-5)return;const o=put(g,cylinder,m,a.lerp(b,.5),[r,d.length(),r]);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o}
function interp(arr,u){let i=0;while(i<loc.length-2&&u>loc[i+1])i++;return T.MathUtils.lerp(arr[i],arr[i+1],(u-loc[i])/(loc[i+1]-loc[i]))}
function meshSurface(g,m,arr){const buff=new T.BufferGeometry();buff.setAttribute('position',new T.Float32BufferAttribute(arr,3));buff.computeVertexNormals();const o=new T.Mesh(buff,m);o.userData.wingTemporaryGeometry=true;g.add(o);return o}
function strip(g,m,at,ua,ub,fa,fb,h,steps=8){const v=[];for(let i=0;i<steps;i++){let a=T.MathUtils.lerp(ua,ub,i/steps),b=T.MathUtils.lerp(ua,ub,(i+1)/steps);
const p=at(a,fa,h),q=at(b,fa,h),r=at(b,fb,h),s=at(a,fb,h);v.push(...p,...r,...q,...p,...s,...r)}return meshSurface(g,m,v)}
const radialMat=mat('#283747',.42,.31);

// Leave real tyre jounce clearance at touchdown, while keeping the broad
// approved outer panels and their span. Short cheek risers clear the axles.
const TYRE_RISERS={geep:.37,hexshift:.23,skipper:.27,'track-formula':.40,'track-hot-rod':.35,'steam-sprint':.29,'bone-wyrm':.23};
const CUSTOM_SWEEPS = {geep:[.37,.07], skipper:[.39,.05], ironhide:[.48,-.045], crestline:[.39,.018]};
const NARROW_SWEEPS=new Set(['pogo','track-hot-rod','ringrunner','windskiff','bamboo-trike','tarmac-press','rail-ghost','sunny-sidecar','groove-racer','bronze-bell','steam-sprint','amber-beetle','bone-wyrm']);
const NARROW_COCKPITS=new Set(['ringrunner','windskiff','bronze-bell','bone-wyrm']);
function buildSide(profile, i, vehicleId) {
 const [,f,chord,rake,tip,paint,accent]=profile, side=i===0?-1:1, group=new T.Group();
 const [x,y,z,start,wingSpan]=profile[7+i], pivot=new T.Vector3(x-side*.035,y,z);
 const base=mat(paint,.40,.19), cap=mat(accent,.42,.22);
 const secondary=mat(paint,.65,.02);secondary.color.lerp(new T.Color('#11192b'),.37);
 const panel=mat(f==='solar'?'#254b82':f==='vinyl'?'#222a3f':f==='glass'?'#b684e6':f==='beetle'?'#ffe0a0':paint,.30,.19);
 const hit={x,y,z};
 const deepRoot=vehicleId==='ringrunner';
 const riser=TYRE_RISERS[vehicleId]??0;
 const rootY=y+.024+riser, rootZ=z;
 const thick=f==='cargo'||f==='lift'?.18:f==='knife'||f==='glass'||f==='fabric'?.082:.13;
 const top=(u,v,h=0)=>{
 let cn=chord*interp(family[f],u);
 let curve=f==='crescent'?rake*u**1.67:f==='crank'?rake*(u<.53?u*.54:.286+(u-.53)*1.52):f==='scallop'?rake*u+.041*Math.sin(19*u):rake*u;
 let bend=f==='gull'?tip*(u<.39?u*2.8:1.092-(u-.39)*.40):tip*u**1.22;
 return [side*(start+wingSpan*u),rootY+bend-riser*.68*T.MathUtils.smootherstep(u,.18,.88)+(v-.40)*cn*.047+h,rootZ+curve+(v-.44)*cn];
 };
 const addRib=(u,v0,v1,material=cap,r=.018)=>rod(group,material,top(u,v0,thick*.61),top(u,v1,thick*.61),r);
 const tight=NARROW_COCKPITS.has(vehicleId), brace=tight?.115:.21;
 const trackLink=vehicleId==='steam-sprint';
 const rootInner=[hit.x-side*(tight?.025:.16),hit.y+(trackLink?.13:0),hit.z+(trackLink?.22:0)], rootOuter=top(.08,.51);
 rod(group,hardware,rootInner,rootOuter,tight?.064:.088);
 for(const dz of (vehicleId==='ringrunner'?[.04,.16]:trackLink?[.16,.33]:[-brace,brace]))rod(group,steel,[hit.x-side*(tight?.018:.14),hit.y-(tight?.019:.055),hit.z+dz],top(.05,.51+dz/chord,-.025),tight?.030:.043);
 put(group,sphere,hardware,[side*(start+(deepRoot?.170:0)),rootY,rootZ],[deepRoot?.155:.25,.117,chord*(deepRoot?.28:.42)]);
 put(group,sphere,cap,[side*(start+(deepRoot?.176:.034)),rootY+.077,rootZ],[deepRoot?.128:.19,.055,chord*(deepRoot?.22:.27)]);
 const pin=side*(start+(deepRoot?.14:-.09));
 rod(group,steel,[pin,rootY+.08,rootZ-chord*(deepRoot?.19:.37)],[pin,rootY+.08,rootZ+chord*.30],.044);
 for(const t of [-.28,.25])put(group,sphere,gleam,[side*(start+(deepRoot?.20:.09)),rootY+.119,rootZ+t*chord],[.03,.013,.03]);
 const skeleton=f==='truss'||f==='bone';
 strip(group,base,top,0,1,0,1,-thick*.33);
 strip(group,skeleton?secondary:base,top,0,1,0,skeleton?.23:.79,thick*.47);
 if(skeleton)strip(group,f==='bone'?panel:hardware,top,0,1,.22,.83,thick*.10);
 strip(group,secondary,top,0,1,skeleton?.83:.79,1,thick*.47);
 for(const v of [0,1])for(let i=0;i<16;i++){
 const u=i/16,w=(i+1)/16;
 const p=top(u,v,-thick*.33),q=top(w,v,-thick*.33),r=top(w,v,thick*.47),s=top(u,v,thick*.47);
 meshSurface(group,v===0?cap:secondary,[...p,...q,...r,...p,...r,...s]);
 }
 for(const u of [0,1]){
 const p=top(u,0,-thick*.33),q=top(u,1,-thick*.33),r=top(u,1,thick*.47),s=top(u,0,thick*.47);
 meshSurface(group,cap,[...p,...q,...r,...p,...r,...s]);
 }
 if(f==='double'){
 const up=(u,v,h)=>{let p=top(u,v,h);p[1]+=.30;p[2]+=.085;return p};
 strip(group,cap,up,.13,.89,.095,.92,.02);strip(group,secondary,up,.13,.89,.095,.92,-.024);
 for(const u of [.25,.69])for(const v of [.25,.73])rod(group,steel,top(u,v,.03),up(u,v,-.02),.024);
 }else if(f==='fabric'||f==='kite'||f==='beetle'||f==='bone'||f==='truss'){
 for(const u of [.16,.34,.51,.68,.85])addRib(u,.10,.81,f==='truss'?cap:f==='bone'?base:cap,f==='truss'?.034:f==='bone'?.049:.017);
 if(f==='truss'||f==='bone')for(const u of [.15,.33,.51,.69])rod(group,cap,top(u,.13,thick*.52),top(u+.18,.77,thick*.67),f==='bone'?.036:.026);
 if(f==='beetle')strip(group,cap,top,.27,.86,.29,.68,thick*.495);
 }else if(f==='solar'||f==='glass'){
 for(let i=0;i<5;i++){const u=.14+i*.155;strip(group,panel,top,u,u+.139,.13,.735,thick*.51);
 for(const v of [.32,.51])strip(group,cap,top,u,u+.137,v,v+.009,thick*.527)}
 }else if(f==='vinyl'){
 for(let j=0;j<8;j++){const v=.19+j*.064;strip(group,j%3===0?cap:panel,top,.11,.91,v,v+.025,thick*.50)}
 }else if(f==='scallop'){
 for(let i=0;i<6;i++){const u=.13+i*.135;strip(group,cap,top,u,u+.057,.12,.77,thick*.51)}
 }else{
 const u=f==='knife'?.59:.68;
 strip(group,cap,top,u,u+.09,.078,.77,thick*.51);
 strip(group,cap,top,u+.112,u+.139,.078,.77,thick*.51);
 if(f==='split'||f==='fork')strip(group,hardware,top,.42,.97,.43,.55,thick*.51);
 else strip(group,secondary,top,.15,.54,.28,.36,thick*.51);
 }
 if(f==='fan'||f==='pontoon'||f==='fork'){
 const pt=top(f==='fork'?.83:.72,.47,.035);
 const fan=f==='fan', pont=f==='pontoon';
 if(fan){
 const ring=put(group,new T.TorusGeometry(.27,.043,6,20),cap,pt);ring.rotation.x=-Math.PI/2;ring.userData.wingTemporaryGeometry=true;
 put(group,sphere,radialMat,[pt[0],pt[1]-.036,pt[2]],[.235,.052,.235]);
 for(let b=0;b<5;b++){const blade=put(group,cube,steel,[pt[0],pt[1]+.021,pt[2]],[.36,.023,.032]);blade.rotation.y=b*Math.PI/5;}
 put(group,sphere,cap,[pt[0],pt[1]+.035,pt[2]],[.067,.038,.067]);
 }else{
 put(group,sphere,hardware,[pt[0],pt[1]-.085,pt[2]],[pont?.18:.13,pont?.10:.077,pont?.58:.40]);
 put(group,sphere,cap,[pt[0],pt[1]-.053,pt[2]-.07],[pont?.137:.097,.089,pont?.51:.34]);
 }}
 if(['utility','cargo','lift','truss'].includes(f)){
 for(let i=0;i<4;i++){const u=.2+i*.15;put(group,sphere,steel,top(u,.18,thick*.54),[.028,.013,.028]);}
 }
 for(const [u,v,r] of [[.92,.30,.048],[.945,.68,.031]])put(group,sphere,running[side<0?0:1],top(u,v,thick*.53),[r,r*.62,r]);

 const batches=batchSide(group,pivot);
 for(const m of [base,cap,secondary,panel])m.dispose();
 return {pivot,batches};
}

// Pooled geometry and opaque color batches: no blended layers nor order dependence
// in race. Deck and fitted metal share one GPU material; nav lights are a second.
const deckMaterial=()=>new T.MeshStandardMaterial({vertexColors:true,roughness:.45,metalness:.21,side:T.DoubleSide,forceSinglePass:true});
const navMaterial=()=>new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,forceSinglePass:true,toneMapped:false});
const assets=new Map();
let materials, hingeGeometry;
let liveCount=0;
function batchSide(group,pivot) {
 const painted=[], lights=[];
 const centering=new T.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z);
 group.updateMatrixWorld(true);
 group.traverse(m=>{
  if(!m.isMesh)return;
  const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();
  g.applyMatrix4(new T.Matrix4().multiplyMatrices(centering,m.matrixWorld));
  g.deleteAttribute('uv');
  const count=g.attributes.position.count, colors=new Float32Array(count*3);
  for(let i=0;i<count;i++)m.material.color.toArray(colors,i*3);
  g.setAttribute('color',new T.BufferAttribute(colors,3));
  (m.material.isMeshBasicMaterial?lights:painted).push(g);
  if(m.userData.wingTemporaryGeometry)m.geometry.dispose();
 });
 return [painted,lights].map(parts=>{
  const merged=mergeGeometries(parts);
  for(const g of parts)g.dispose();
  merged.computeBoundingSphere();
  return merged;
 });
}

function assetsFor(vehicleId) {
 if(assets.has(vehicleId))return assets.get(vehicleId);
 const custom=approvedWingMount(vehicleId,-1);
 if(!custom&&!Object.hasOwn(PROFILES,vehicleId))return null;
 const sides=[-1,1].map((side,i)=>custom
  ? {pivot:new T.Vector3(...approvedWingMount(vehicleId,side)),batches:batchSide(buildApprovedWingArt(vehicleId,side),new T.Vector3())}
  : buildSide(PROFILES[vehicleId],i,vehicleId));
 assets.set(vehicleId,sides);
 return sides;
}

const curve=(p,a,b)=>T.MathUtils.smootherstep(p,a,b);
const DEPLOY_SECONDS=.48, STOW_SECONDS=.42;
const STOWED_YAW=.72, STOWED_ROLL=.78;
const UP=new T.Vector3(0,1,0), hingeDelta=new T.Vector3(), hingeAnchor=new T.Vector3();
function pose(group,state){
 const p=state.progress;
 group.visible=p>0;
 // A fixed socket lets the sleeve slide out first. The nearly edge-on folded
 // panel then swings into airflow, extends along its span, and seats flush.
 const unlock=curve(p,0,.22), swing=curve(p,.12,.72), extension=curve(p,.35,.98);
 const pocket=curve(p,.04,.57), settle=curve(p,.81,1);
 const clearance=curve(p,0,state.tight?.097:.14)*(1-settle);
 const [cabin,lift]=state.route;
 for(let i=0;i<2;i++){
  const s=i===0?-1:1, mount=state.sides[i], node=state.nodes[i], hinge=state.hinges[i];
  node.position.copy(mount.pivot);
  node.position.x+=s*cabin*clearance;
  node.position.y+=lift*clearance;
  node.rotation.y=-s*STOWED_YAW*(1-swing);
  node.rotation.z=s*STOWED_ROLL*(1-swing);
  node.scale.set(.049+.951*extension,.55+.45*unlock,.035+.965*pocket);
  // Only the piston changes length; the socket end remains on the chassis.
  // Blend it under the final static mount so full flight costs no extra draws.
  hingeAnchor.copy(mount.pivot);
  hingeAnchor.x-=s*.01;
  hingeDelta.copy(node.position).sub(hingeAnchor);
  const length=hingeDelta.length();
  hinge.visible=p>0&&p<1&&length>.015;
  if(hinge.visible){
   hinge.position.copy(hingeAnchor).lerp(node.position,.5);
   hinge.quaternion.setFromUnitVectors(UP,hingeDelta.multiplyScalar(1/length));
   const radius=.036*Math.max(.35,unlock);
   hinge.scale.set(radius,length,radius);
  }
 }
}

export function createKartWings(vehicleId){
 const sides=assetsFor(vehicleId);
 if(!sides)return null;
 materials??=[deckMaterial(),navMaterial(),new T.MeshStandardMaterial({color:0x57616a,metalness:.37,roughness:.36})];
 if(!hingeGeometry)hingeGeometry=new T.CylinderGeometry(.72,1,1,8);
 const group=new T.Group();
 group.name='Flight wings / '+(PROFILES[vehicleId]?.[0]??vehicleId);
 // The concept tool measured neutral world rather than Geep's unscaled shell.
 if(vehicleId==='geep')group.scale.setScalar(1/geepScale);
 const nodes=sides.map(({pivot,batches},i)=>{
  const node=new T.Group();
  node.name=i?'Starboard wing':'Port wing';
  node.rotation.order='YXZ';
  node.position.copy(pivot);
  for(let j=0;j<batches.length;j++){
   const m=new T.Mesh(batches[j],materials[j]);
   m.userData.sharedKartPart=true;
   node.add(m);
  }
  group.add(node);
  return node;
 });
 const hinges=sides.map(()=>{
  const mesh=new T.Mesh(hingeGeometry,materials[2]);
  mesh.userData.sharedKartPart=true;
  group.add(mesh);
  return mesh;
 });
 const tight=NARROW_SWEEPS.has(vehicleId)||Object.hasOwn(CUSTOM_SWEEPS,vehicleId);
 const route=CUSTOM_SWEEPS[vehicleId]??(tight?[.36,.035]:[.15,.18]);
 const state={sides,nodes,hinges,tight,route,progress:0};
 group.userData.kartWings=state;
 liveCount++;
 pose(group,state);
 return group;
}

/** Reversible from any frame; render-side seconds only, no wall clock or simulation state. */
export function updateKartWings(group,flying,dtSeconds){
 const state=group?.userData.kartWings;
 if(!state||!(dtSeconds>0)||!Number.isFinite(dtSeconds))return;
 const travel=state.progress+(flying?dtSeconds/DEPLOY_SECONDS:-dtSeconds/STOW_SECONDS);
 const next=travel>=1-1e-9?1:travel<=1e-9?0:travel;
 if(next===state.progress)return;
 state.progress=next;
 pose(group,state);
}

/** Snap at a race boundary or for reduced motion; never carry stale visual progress. */
export function setKartWingsDeployed(group,flying){
 const state=group?.userData.kartWings;
 if(!state)return;
 const progress=flying?1:0;
 if(progress!==state.progress){state.progress=progress;pose(group,state);}
}

export function disposeKartWings(group){
 if(!group?.userData.kartWings)return;
 group.removeFromParent();
 group.clear();
 delete group.userData.kartWings;
 liveCount--;
}

/** Explicit renderer/HMR teardown only; never invalidate shared meshes still in use. */
export function disposeKartWingAssets(){
 if(liveCount)return false;
 for(const sides of assets.values())for(const {batches} of sides)for(const geometry of batches)geometry.dispose();
 assets.clear();
 if(materials)for(const material of materials)material.dispose();
 materials=undefined;
 hingeGeometry?.dispose();
 hingeGeometry=undefined;
 return true;
}

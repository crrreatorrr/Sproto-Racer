// The Geep faces -Z. Its two seats, steering column and driver use the same mount.
import * as T from 'three';
import {geepAxles,geepTireWidthScale} from './geep-layout.js';
export {geepScale,geepAxles} from './geep-layout.js';
import bonnetUrl from './assets/geep-bonnet.webp';
import wingsUrl from './assets/geep-wings.webp';
import {assembly,surface} from './kart-assembly.js';

export const geepDriver = {x: -.456, y: 1.255, z: .183, scale: .59};
const tau = Math.PI * 2;
const frame = '#192723', lip = '#30402c', leather = '#583826';

let hardware,rubber,steel,glass;
function initMaterials(){
  if(hardware)return;
  hardware = new T.MeshStandardMaterial({vertexColors:true, roughness:.59, metalness:.13});
  rubber = new T.MeshStandardMaterial({vertexColors:true, roughness:.94});
  steel = new T.MeshStandardMaterial({vertexColors:true, roughness:.38, metalness:.32});
  glass = new T.MeshBasicMaterial({color:'#80bc49', transparent:true, opacity:.34,
    side:T.DoubleSide, depthWrite:false, toneMapped:false, forceSinglePass:true});
}
let templates;

function canvasMap(width,height,draw) {
  const canvas = document.createElement('canvas');
  canvas.width=width; canvas.height=height;
  draw(canvas.getContext('2d'),width,height);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace=T.SRGBColorSpace; map.anisotropy=4;
  return map;
}

function polygon(ctx,color,points) {
  ctx.fillStyle=color; ctx.beginPath();
  points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
  ctx.closePath(); ctx.fill();
}

function makeLivery() {
  const map=canvasMap(1024,1024,ctx=>{
    // Print coordinates run across the car, from the nose to the tail.
    ctx.scale(10.24,10.24);
    ctx.fillStyle='#739852'; ctx.fillRect(0,0,100,100);
    const shapes=[
      ['#343f24',[[0,0],[22,0],[24,5],[19,9],[31,11],[28,18],[16,16],[9,20],[0,17]]],
      ['#246334',[[34,0],[50,0],[53,6],[47,9],[46,13],[32,11],[36,7]]],
      ['#46522b',[[64,0],[96,0],[91,8],[85,7],[78,12],[68,11],[72,7]]],
      ['#5b5536',[[3,21],[15,19],[22,23],[37,18],[43,21],[39,27],[25,28],[20,33],[10,31],[13,26]]],
      ['#2d6939',[[0,28],[9,26],[14,31],[10,36],[16,38],[13,43],[0,39]]],
      ['#313d24',[[45,14],[55,13],[61,16],[71,13],[84,16],[81,22],[72,20],[70,25],[58,23],[54,20],[47,21]]],
      ['#2d7139',[[80,24],[89,22],[91,17],[100,19],[100,31],[92,34],[85,30],[76,31]]],
      ['#665d37',[[29,32],[43,29],[48,34],[59,32],[65,36],[60,41],[46,39],[37,43],[26,39]]],
      ['#384629',[[25,12],[36,10],[40,7],[51,12],[60,8],[68,11],[64,17],[73,20],[61,23],[52,20],[42,25],[31,21],[35,17],[25,16]]],
      ['#315934',[[0,51],[15,47],[20,52],[27,51],[24,60],[13,58],[8,63],[0,62]]],
      ['#545334',[[66,42],[75,40],[83,43],[96,38],[100,41],[100,48],[85,51],[80,48],[70,51]]],
      ['#313e28',[[3,68],[13,64],[20,66],[19,72],[32,73],[29,80],[18,77],[12,81],[3,78]]],
      ['#356839',[[60,64],[69,60],[79,65],[82,59],[91,58],[94,65],[100,66],[100,72],[89,74],[78,70],[71,73]]],
      ['#565336',[[0,86],[13,88],[18,84],[26,88],[31,84],[39,88],[34,95],[25,94],[21,98],[10,95],[0,99]]],
      ['#34452a',[[50,83],[60,80],[68,85],[78,82],[87,86],[85,92],[75,90],[66,96],[58,92],[50,94]]],
      ['#28633a',[[83,98],[90,94],[100,97],[100,100],[83,100]]]
    ];
    for(const [color,points] of shapes){
      polygon(ctx,color,points);ctx.lineWidth=.23;ctx.strokeStyle='#34412c';ctx.stroke();
    }

  });
  return new T.MeshStandardMaterial({map,roughness:.53,metalness:.08,side:T.DoubleSide});
}

function paintedStrip(part,paint,rows,customUV) {
  const points=rows.flat(), indices=[], width=rows[0].length;
  for(let j=1;j<rows.length;j++)for(let i=1;i<width;i++){
    const a=(j-1)*width+i-1,b=a+1,c=a+width,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  const uv=customUV??points.map(([x,y,z])=>[.5+x/2.53,1-(z+2.25+(y-1.25)*.37)/4.26]);
  part.add(surface(points,indices,uv),paint);
}

function badge(part,material,x,y,z,w,h,rx=0,ry=0) {
  part.add(new T.PlaneGeometry(w,h),material,null,[x,y,z],[rx,ry,0]);
}

function makeBody(){
  const p=assembly(hardware),paint=makeLivery();
  function referencePaint(url){
    const map=new T.TextureLoader().load(url);
    map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
    return new T.MeshStandardMaterial({map,roughness:.54,metalness:.04,side:T.DoubleSide});
  }
  const bonnetPaint=referencePaint(bonnetUrl),wingPaint=referencePaint(wingsUrl);
  // The bonnet curls down into the bumper. The wings stay broad as the bonnet narrows.
  const stations=[
    // longitudinal position, half-width, crown height, shoulder drop, artwork row
    [-2.19,.615,.965,.046,1],[-2.14,.66,1.028,.050,.945],
    [-1.96,.742,1.138,.068,.82],[-1.60,.824,1.302,.081,.56],
    [-1.17,.885,1.461,.087,.29],[-.78,.908,1.567,.069,.07],[-.605,.902,1.609,.044,0]
  ];
  const bonnet=[],hoodUV=[],indices=[];
  for(const [z,w,h,drop,t] of stations){
    for(const f of [-1,-.83,-.46,0,.46,.83,1]){
      const a=Math.abs(f);
      bonnet.push([w*f,h-drop*a*a,z+.033*a*a]);
      hoodUV.push([.5-.5*f,1-t]);
    }
  }
  for(let j=1;j<stations.length;j++)for(let i=0;i<6;i++){
    const a=(j-1)*7+i;indices.push(a,a+7,a+1,a+1,a+7,a+8);
  }
  p.add(surface(bonnet,indices,hoodUV),bonnetPaint);
  p.box(frame,[0,.57,.025],[1.72,.24,3.39],.07);
  // A folded front apron carries the bumper and closes the space behind the lamp buckets.
  const nose=[[-.97,-1.94],[-.913,-2.135],[-.775,-2.196],[-.53,-2.209],
    [.53,-2.209],[.775,-2.196],[.913,-2.135],[.97,-1.94]];
  const apron=nose.flatMap(([x,z])=>[[x,.94,z],[x*.973,.658,z+.032],[x*.83,.594,z+.18]]);
  const apronFaces=[];
  for(let i=0;i<nose.length-1;i++)for(let j=0;j<2;j++){
    const a=i*3+j;apronFaces.push(a,a+3,a+1,a+1,a+3,a+4);
  }
  p.add(surface(apron,apronFaces),hardware,'#1e3025');
  const wing=[
    // Nose to tail. The last two heights describe the inboard seam and the outer rolled edge.
    [-2.19,.61,.77,.919,.920],[-2.08,.675,.932,.997,1.040],
    [-1.86,.76,1.115,1.110,1.197],[-1.59,.811,1.216,1.205,1.295],
    [-1.16,.875,1.212,1.342,1.402],[-.84,.887,1.138,1.377,1.378],
    [-.575,.873,1.102,1.251,1.243],[-.32,.816,1.066,1.197,1.193],
    [.16,.823,1.068,1.232,1.257],[.76,.859,1.083,1.328,1.395],
    [1.28,.89,1.142,1.511,1.558],[1.64,.89,1.144,1.576,1.618],[1.90,.834,1.078,1.52,1.556]
  ];
  for(const side of [-1,1]){
    // The exposed vertical bonnet seam separates the raised cowl from the lower fender.
    paintedStrip(p,paint,stations.map(([z,w,h,drop])=>[[side*w,h-drop,z+.033],[side*(w-.012),h-drop-(z>-.86?.36:.13),z+.033]]));
    const half=side>0?0:.5;
    const wingUV=wing.flatMap((_,j)=>[.008,.64,.972,.992].map(v=>[j/(wing.length-1),1-half-.5*v]));
    paintedStrip(p,wingPaint,wing.map(([z,i,o,hi,ho])=>[
      [side*i,hi,z],[side*(i*.36+o*.64),hi*.35+ho*.65+.018,z],[side*(o-.024),ho,z],[side*o,ho-.026,z]
    ]),wingUV);
    paintedStrip(p,paint,wing.map(([z,i,o,hi,ho])=>[[side*o,ho-.026,z],[side*(o-.018),ho-.090,z]]));
    for(let i=1;i<wing.length;i++){
      const [za,,wa,,ha]=wing[i-1],[zb,,wb,,hb]=wing[i];
      p.pipe('#263c2d',[side*(wa-.008),ha-.081,za],[side*(wb-.008),hb-.081,zb],.017);
    }
    // Close the underside of the fender where it overhangs the tires.
    paintedStrip(p,paint,wing.map(([z,i,o,hi,ho])=>[[side*(o-.018),ho-.091,z],[side*(i-.018),hi-.095,z]]));
    // A deep folded tub is visible in the gap between the tires.
    const wallRows=wing.map(([z,i,o,,h])=>{
      const x=Math.min(o-.03,1.013);
      return [[side*x,h-.068,z],[side*(x-.049),.551+.10*Math.abs(z)/2.19,z]];
    });
    function sidePanel(rows,color){
      const verts=rows.flat(),tris=[];
      for(let j=0;j<rows.length-1;j++){
        const a=2*j;
        if(side>0)tris.push(a,a+3,a+1,a,a+2,a+3);else tris.push(a,a+1,a+3,a,a+3,a+2);
      }
      p.add(surface(verts,tris),hardware,color);
    }
    sidePanel(wallRows,'#18241c');
    sidePanel([[-.46,1.005,1.066,.661],[.87,1.009,1.276,.708]].map(([z,x,h,b])=>
      [[side*(x+.011),h,z],[side*(x-.013),b,z]]),'#435032');
    // Inner returns hide the back of the skins when looking into the open tub.
    paintedStrip(p,paint,wing.slice(6).map(([z,i,,hi])=>[[side*i,hi,z],[side*(i-.014),.888,z]]));
    for(const [z,r] of geepAxles){
      p.pipe(frame,[side*.64,.60,z-.20],[side*1.16,r,z],.050);
      p.pipe('#586054',[side*.59,.58,z+.21],[side*1.16,r,z],.040,steel);
    }
    p.box('#233526',[side*1.078,1.408,-1.36],[.123,.092,.153],.014);
    p.box('#c79746',[side*1.078,1.412,-1.440],[.073,.043,.010],.004);
  }
  // The little kick-up over each rear wheel carries the diamond APEX marking.
  const quarterMark=canvasMap(256,192,ctx=>{
    polygon(ctx,'#273422',[[6,96],[128,5],[250,96],[128,187]]);
    polygon(ctx,'#ece2aa',[[16,96],[128,13],[240,96],[128,179]]);
    polygon(ctx,'#a34032',[[68,58],[128,21],[183,59],[128,49]]);
    polygon(ctx,'#a34032',[[67,133],[128,169],[184,133],[126,144]]);
    ctx.fillStyle='#22291f';ctx.font='900 58px Arial';ctx.textAlign='center';ctx.fillText('APEX',128,116);
  });
  const marking=new T.MeshStandardMaterial({map:quarterMark,alphaTest:.42,roughness:.68});
  for(const side of [-1,1]){
    const profile=[[.93,1.36,.72],[.98,1.51,1.075],[1.029,1.828,1.46],
      [1.038,1.905,1.61],[1.052,1.75,1.80],[1.064,1.575,1.94],[1.036,1.50,1.67]];
    const face=profile.map(([x,y,z])=>[side*x,y,z]);
    const inside=face.map(([x,y,z])=>[x-side*.055,y,z]);
    for(const points of [face,inside]){
      p.add(surface(points,[0,1,6,1,2,6,2,3,6,3,4,6,4,5,6],points.map(([,y,z])=>[(z-.54)*.74,(y-1.05)*.95])),paint);
    }
    paintedStrip(p,paint,[face,inside]);
    badge(p,marking,side*1.052,1.735,1.578,.248,.177,0,side*Math.PI/2);
  }
  // Wide green screen with clipped top corners, a rubber seal and a painted outer channel.
  const outline=[[.921,1.563,-.61],[.848,2.301,-.315],[.793,2.355,-.292],
    [-.793,2.355,-.292],[-.848,2.301,-.315],[-.921,1.563,-.61]];
  p.add(surface(outline,[0,2,1,0,3,2,0,4,3,0,5,4]),glass);
  const screenCenter=[0,1.988,-.453];
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length];
    p.pipe('#263e2d',a,b,i===5?.034:.027);
    const inner=v=>v.map((n,j)=>screenCenter[j]+(n-screenCenter[j])*.957);
    p.pipe('#121e1a',inner(a),inner(b),.010);
  }
  for(const side of [-1,1]){
    p.pipe(frame,[side*.91,1.71,-.571],[side*1.005,1.754,-.553],.018);
    p.box(frame,[side*1.039,1.801,-.55],[.107,.156,.082],.018,-.10);
    p.box('#9fae96',[side*1.039,1.802,-.502],[.079,.119,.011],.008,-.10,steel);
  }
  // A continuous bent tube gives the rear hoop its broad rounded shoulders.
  const hoopPath=new T.CurvePath(),vec=(x,y,z)=>new T.Vector3(x,y,z);
  const line=(a,b)=>hoopPath.add(new T.LineCurve3(a,b));
  const bend=(a,b,c)=>hoopPath.add(new T.QuadraticBezierCurve3(a,b,c));
  const post=.889,top=2.46,corner=.18,z=1.037;
  line(vec(-post,1.34,z),vec(-post,top-corner,z));
  bend(vec(-post,top-corner,z),vec(-post,top,z),vec(-post+corner,top,z));
  line(vec(-post+corner,top,z),vec(post-corner,top,z));
  bend(vec(post-corner,top,z),vec(post,top,z),vec(post,top-corner,z));
  line(vec(post,top-corner,z),vec(post,1.34,z));
  p.add(new T.TubeGeometry(hoopPath,90,.044,10,false),hardware,frame);
  p.box('#343c26',[0,1.415,-.542],[1.74,.265,.145],.024);
  p.box('#352d23',[0,.855,.42],[1.75,.105,2.22],.042);
  for(const side of [-1,1]){
    const x=side*Math.abs(geepDriver.x);
    p.box('#3f2c22',[x,1.132,.260],[.775,.147,.76],.055);
    for(let j=0;j<6;j++)p.box('#795135',[x,1.197,.009+j*.091],[.663,.063,.09],.023);
    p.box('#4c3527',[x,1.490,.700],[.768,.72,.15],.066,.205);
    for(let j=0;j<7;j++)p.box(j%2?'#80583a':'#876041',[x,1.220+j*.089,.560+j*.0185],[.642,.088,.075],.026,.205);
    for(const edge of [-1,1])p.box(leather,[x+edge*.338,1.490,.651],[.085,.65,.125],.031,.205);
  }
  // The rear seat spans the full tub. Its shaped top rail is visible from the chase camera.
  p.box(lip,[0,1.094,1.735],[1.87,.64,.21],.048);
  p.box('#453127',[0,1.522,1.586],[1.79,.58,.154],.045,.12);
  for(let j=0;j<6;j++)p.box(j%2?'#714e35':'#79523a',[0,1.298+j*.091,1.468+j*.011],[1.69,.088,.084],.019,.12);
  p.box('#423529',[0,1.816,1.62],[1.79,.054,.16],.021,.12);
  // The chase view sees the seat shell and the stamped recess in the tail.
  for(const x of [-.852,.852])p.pipe(leather,[x,1.26,1.622],[x,1.793,1.688],.019);
  p.pipe(leather,[-.852,1.793,1.688],[.852,1.793,1.688],.019);
  paintedStrip(p,paint,[[[-1.065,1.491,1.67],[0,1.498,1.67],[1.065,1.491,1.67]],
    [[-.969,1.523,1.908],[0,1.518,1.926],[.969,1.523,1.908]],
    [[-.919,.85,1.86],[0,.81,1.881],[.919,.85,1.86]]]);
  const tail=[[-.882,1.45,1.919],[.882,1.45,1.919],[.837,1.205,1.915],
    [.634,1.154,1.916],[-.634,1.154,1.916],[-.837,1.205,1.915]];
  p.add(surface(tail,[0,2,1,0,3,2,0,4,3,0,5,4],
    [[.08,.77],[.91,.77],[.87,.59],[.74,.52],[.22,.52],[.11,.59]]),paint);
  for(const [y,width] of [[1.47,1.83],[1.173,1.29]])p.box('#33442e',[0,y,1.922],[width,.026,.027],.009);
  p.box(frame,[0,.842,1.895],[1.70,.19,.12],.046);
  // Wrap the bumper ends back into the wings, keeping four recessed lamps immediately under the lip.
  const bumper=[[-.98,.98,-1.97],[-.905,.92,-2.16],[-.779,.906,-2.215],
    [-.53,.908,-2.229],[.53,.908,-2.229],[.779,.906,-2.215],[.905,.92,-2.16],[.98,.98,-1.97]];
  for(let i=1;i<bumper.length;i++)p.pipe('#263c2d',bumper[i-1],bumper[i],.036);
  for(const [i,x] of [-.738,-.252,.252,.738].entries()){
    const z=Math.abs(x)>.6?-2.214:-2.24,y=.793;
    p.pipe(frame,[x,y,z+.112],[x,y,z],.170,hardware,.171,32);
    p.pipe('#a1a087',[x,y,z],[x,y,z-.022],.163,steel,.161,32);
    p.pipe('#7b3037',[x,y,z-.023],[x,y,z-.035],.145,hardware,.141,32);
    p.pipe('#b2a687',[x,y,z-.036],[x,y,z-.040],.118,steel,.117,32);
    const outer=i===0||i===3;
    p.pipe(outer?'#e5c66b':'#913641',[x,y,z-.041],[x,y,z-.056],.106,hardware,.101,32);
    for(let j=-3;j<=3;j++){
      const h=Math.sqrt(.089**2-(j*.022)**2);
      p.pipe(outer?'#ceb064':'#78303b',[x+j*.022,y-h,z-.057],[x+j*.022,y+h,z-.057],.0026);
    }
  }
  for(const s of [-1,1]){
    p.box(frame,[s*.727,1.075,1.902],[.231,.132,.05],.027);
    p.box('#ad4038',[s*.727,1.075,1.93],[.179,.081,.019],.015);
  }
  return p.finish();
}

function makeWheel(){
  const p=assembly(hardware);
  // Turn the rounded tire shoulder, rolled rim lip and recessed hub around the axle.
  function turned(profile,color,mat,segments=36){
    const points=profile.map(([x,r])=>new T.Vector2(r,x));
    p.add(new T.LatheGeometry(points,segments),mat,color,[0,0,0],[0,0,-Math.PI/2]);
  }
  turned([[-.14,.25],[-.17,.28],[-.184,.365],[-.17,.425],[-.134,.451],[-.103,.456],
    [.103,.456],[.134,.451],[.17,.425],[.184,.365],[.17,.28],[.14,.25]],'#292b27',rubber);
  turned([[-.17,.258],[-.171,.281],[-.147,.290],[.150,.290],[.181,.282],[.185,.261],
    [.169,.248],[.158,.248],[.099,.224],[.091,.210]],'#808573',steel);
  // Sculpt the tire crown in cross-section. Each groove runs continuously around the
  // tire in a zigzag, as on the narrow vintage all-terrain tread in the illustration.
  const pts=[],indices=[],steps=96;
  let rowSize=0;
  for(let k=0;k<=steps;k++){
    const angle=k*tau/steps, section=[[-.171,.420],[-.151,.452],[-.128,.467]];
    for(let band=-2;band<=2;band++){
      const phase=(k+Math.abs(band))%4, offset=[-.006,.001,.006,-.001][phase];
      const x=band*.049+offset;
      const r=.480-.010*(x/.13)**2;
      section.push([x-.005,r],[x-.003,r-.012],[x+.003,r-.012],[x+.005,r]);
    }
    section.push([.128,.467],[.151,.452],[.171,.420]);
    rowSize=section.length;
    for(const [x,r] of section)pts.push([x,r*Math.cos(angle),r*Math.sin(angle)]);
    if(k===0)continue;
    for(let j=0;j<rowSize-1;j++){
      const a=(k-1)*rowSize+j,b=a+rowSize;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
  }
  p.add(surface(pts,indices),rubber,'#32362f');
  p.pipe('#20241f',[-.15,0,0],[.063,0,0],.248,hardware,.248,32);
  p.pipe('#6c2926',[.063,0,0],[.074,0,0],.204,hardware,.204,30);
  const disk=new T.Shape();disk.absarc(0,0,.235,0,tau,false);
  for(let i=0;i<5;i++){
    const a=i*tau/5,hole=new T.Path();
    const point=(r,da)=>[r*Math.cos(a+da),r*Math.sin(a+da)];
    hole.moveTo(...point(.119,-.21));
    hole.quadraticCurveTo(...point(.119,0),...point(.119,.21));
    hole.quadraticCurveTo(...point(.135,.30),...point(.188,.36));
    hole.quadraticCurveTo(...point(.214,.36),...point(.215,.23));
    hole.quadraticCurveTo(...point(.228,0),...point(.215,-.23));
    hole.quadraticCurveTo(...point(.214,-.36),...point(.188,-.36));
    hole.quadraticCurveTo(...point(.135,-.30),...point(.119,-.21));
    disk.holes.push(hole);
  }
  const dish=new T.ExtrudeGeometry(disk,{depth:.015,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:1,curveSegments:8});
  p.add(dish,steel,'#626756',[.092,0,0],[0,Math.PI/2,0]);
  p.pipe('#40453b',[.106,0,0],[.142,0,0],.095,steel,.087,16);
  p.pipe('#757666',[.142,0,0],[.196,0,0],.051,steel,.043,12);
  for(let i=0;i<5;i++){
    const a=i*tau/5,y=.068*Math.cos(a),z=.068*Math.sin(a);
    p.pipe('#979782',[.139,y,z],[.159,y,z],.016,steel,.016,6);
  }
  return p.finish();
}

function tireLettering(rear){
  const p=assembly(hardware);
  const lettering=canvasMap(512,512,(ctx,w,h)=>{
    ctx.translate(w/2,h/2); ctx.fillStyle='#d5cba8';ctx.font='900 34px Arial';
    ctx.textAlign='center';ctx.textBaseline='middle';
    for(const [label,bottom,step] of [[rear?'B.F.GOODRICH':'GRABBER 160',false,.175],[rear?'ALL TERRAIN T/A':'GENERAL',true,.175]]){
      [...label].forEach((c,i)=>{
        const a=(i-(label.length-1)/2)*step*(bottom?-1:1)+(bottom?Math.PI:0);
        ctx.save();ctx.rotate(a);ctx.translate(0,-185);if(bottom)ctx.rotate(Math.PI);
        ctx.fillText(c,0,0);ctx.restore();
      });
    }
  });
  badge(p,new T.MeshStandardMaterial({map:lettering,alphaTest:.35,roughness:.94}),.187,0,0,.96,.96,0,Math.PI/2);
  return p.finish();
}

export function attachGeep(body,wheels){
  if(!templates){
    initMaterials();
    const wheel=makeWheel();
    templates={body:makeBody(),front:[...wheel,...tireLettering(false)],rear:[...wheel,...tireLettering(true)]};
  }
  function attach(group,parts,flip=false,radius=0){
    for(const source of parts){
      const mesh=new T.Mesh(source.geometry,source.material);
      mesh.userData.sharedGeepPart=true;
      if(radius){
        // Rear tires grow mainly in diameter and keep their narrow tread.
        mesh.scale.set(geepTireWidthScale(group.position.z<0),radius/.48,radius/.48);
      }
      if(flip)mesh.rotation.y=Math.PI;
      group.add(mesh);
    }
  }
  attach(body,templates.body);
  for(const axle of wheels)attach(axle,axle.position.z<0?templates.front:templates.rear,axle.position.x<0,axle.userData.rideHeight);
}

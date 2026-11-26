// Board 01, Track & Tarmac. Track metres; the bonnet and driver face -Z.
const dark='#24272c', black='#16171b', rubber='#282b30', chrome='#adb6bc', glassColor='#add8f5',
  headWhite='#fff6ce', brakeRed='#fb421e', carbon='#34383f', offwhite='#f3eadb';
const catalog=[
  {id:'track-formula',name:'Pepper Seed',role:'Open-wheel formula racer',color:'#e92921',trim:'#f3efde',
    wheels:[[-1.22,.435,1.05,.35],[1.08,.49,1.07,.46]],driver:{x:0,y:.51,z:.035,scale:.64},extent:[1.44,-2.08,1.89,1.69],tail:1.83},
  {id:'track-rally',name:'Golden Switchback',role:'Classic rally coupe',color:'#fac222',trim:'#29282b',
    wheels:[[-1.14,.41,1.00,.33],[1.14,.41,1.00,.33]],driver:{x:0,y:.61,z:.025,scale:.61},extent:[1.31,-1.95,1.89,1.92],tail:1.89},
  {id:'track-prototype',name:'Glass Dart',role:'Bubble-canopy endurance prototype',color:'#68bcf2',trim:'#eff4f4',
    wheels:[[-1.17,.365,1.075,.3],[1.13,.415,1.075,.35]],driver:{x:0,y:.415,z:.02,scale:.61},extent:[1.39,-2.12,2.11,1.81],tail:1.97},
  {id:'track-hot-rod',name:'Whitewall Wasp',role:'Exposed-engine vintage special',color:'#e9d5a3',trim:'#232328',
    wheels:[[-1.13,.43,.92,.24],[1.17,.50,.97,.32]],driver:{x:0,y:.48,z:.11,scale:.65},extent:[1.28,-1.87,1.95,1.65],tail:1.94},
  {id:'track-drift',name:'Violet Drift',role:'Widebody drift pickup',color:'#933fd1',trim:'#e7af59',
    wheels:[[-1.17,.375,1.04,.36],[1.15,.39,1.04,.37]],driver:{x:0,y:.565,z:-.12,scale:.615},extent:[1.38,-2.15,2.13,2.04],tail:2.08},
  {id:'track-electric',name:'Twin-Plug',role:'Open battery-pod time-attack racer',color:'#8bd5a3',trim:'#f2ede0',
    wheels:[[-1.21,.385,1.06,.35],[1.16,.42,1.06,.37]],driver:{x:0,y:.42,z:.035,scale:.64},extent:[1.39,-2.22,2.08,1.68],tail:1.99}
];

const specs=Object.fromEntries(catalog.map(c=>[c.id,c]));
function trackPainter(h){
  const T=h.T;
  function geometry(g,col,mode='paint',position=[0,0,0],rotation=[0,0,0]){
    if(rotation?.isQuaternion){g.applyQuaternion(rotation);rotation=[0,0,0];}
    h.mesh(col,g,position??[0,0,0],rotation??[0,0,0],mode==='glass'?'glass':mode==='lights'?'glow':mode==='metal'?'metal':'solid');
  }
  const quad=(points,col,mode='paint')=>skin(points,[[0,1,2],[0,2,3]],col,mode);
  function skin(points,faces,col,mode='paint'){
    const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(faces.flatMap(face=>face.flatMap(i=>points[i])),3));
    g.computeVertexNormals();geometry(g,col,mode);
  }
  function block(col,p,d,round=.025,mode='paint',rot=null,dest='body'){
    let g;
    if(round>.001){
      const [w,h,l]=d,b=Math.min(round,w*.25,h*.49,l*.27);
      // Chamfer both width and height, then cap each end with a second smaller ring.
      const oct=(x,y,z)=>[[-x+b,-y,z],[x-b,-y,z],[x,-y+b,z],[x,y-b,z],[x-b,y,z],[-x+b,y,z],[-x,y-b,z],[-x,-y+b,z]];
      const profiles=[oct(w/2-b*.42,h/2-b*.42,-l/2),oct(w/2,h/2,-l/2+b),oct(w/2,h/2,l/2-b),oct(w/2-b*.42,h/2-b*.42,l/2)];
      const points=profiles.flat(),faces=[];
      for(let j=1;j<profiles.length;j++)for(let i=0;i<8;i++){const a=(j-1)*8+i,b=j*8+i,k=(i+1)%8;faces.push([a,(j-1)*8+k,b],[b,(j-1)*8+k,j*8+k]);}
      for(let i=1;i<7;i++)faces.push([0,i+1,i],[24,24+i,25+i]);
      g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(faces.flatMap(f=>f.flatMap(i=>points[i])),3));g.computeVertexNormals();
    }else g=new T.BoxGeometry(...d);
    geometry(g,col,mode,p,rot,dest);
  }
  function rod(col,a,b,r,mode='metal',r2=r,n=12,dest='body'){
    const s=new T.Vector3(...a),axis=new T.Vector3(...b).sub(s);
    const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),axis.clone().normalize());
    geometry(new T.CylinderGeometry(r2,r,axis.length(),n),col,mode,s.addScaledVector(axis,.5).toArray(),q,dest);
  }
  function bulb(col,p,d,mode='paint'){geometry(new T.SphereGeometry(1,20,12).scale(...d),col,mode,p);}
  function path(col,points,r,mode='metal'){
    const c=new T.CatmullRomCurve3(points.map(a=>new T.Vector3(...a)));
    geometry(new T.TubeGeometry(c,Math.min(36,points.length*5),r,8,false),col,mode);
  }
  function loft(col,rows,mode='paint'){
    // Closed, octagonal longitudinal sections: z, half-width, bottom, crown, centre X, shouldering.
    const cross=([z,w,b,t,c=0,shape=.78])=>[
      [c-w*.82,b,z],[c+w*.82,b,z],[c+w,b+(t-b)*.22,z],[c+w,t-(t-b)*.18,z],
      [c+w*shape,t,z],[c-w*shape,t,z],[c-w,t-(t-b)*.18,z],[c-w,b+(t-b)*.22,z]];
    const pts=rows.flatMap(cross),faces=[];
    for(let j=1;j<rows.length;j++)for(let i=0;i<8;i++){const a=(j-1)*8+i,b=j*8+i,k=(i+1)%8;faces.push([a,(j-1)*8+k,b],[b,(j-1)*8+k,j*8+k]);}
    for(let i=1;i<7;i++){const e=pts.length-8;faces.push([0,i+1,i],[e,e+i,e+i+1]);}
    skin(pts,faces,col,mode);
  }
  function stripes(rows,left,right,col,offset=.010){
    for(let j=1;j<rows.length;j++){
      const a=rows[j-1],b=rows[j];
      quad([[left(a),a[3]+offset,a[0]],[left(b),b[3]+offset,b[0]],
        [right(b),b[3]+offset,b[0]],[right(a),a[3]+offset,a[0]]],col);
    }
  }
  function arch(x,z,r,base,w,col,lip=.04){
    const pts=[],faces=[],n=12,diff=x>0?1:-1;
    for(let i=0;i<=n;i++){
      const t=i*Math.PI/n;
      for(const [dx,dr] of [[0,0],[0,lip],[-w*diff,lip*.65],[-w*diff,0]])
        pts.push([x+dx,base+Math.sin(t)*(r+dr),z+Math.cos(t)*(r+dr)]);
    }
    for(let i=1;i<=n;i++)for(let j=0;j<3;j++){const a=(i-1)*4+j,b=i*4+j;if(diff>0)faces.push([a,b,a+1],[a+1,b,b+1]);else faces.push([a,a+1,b],[a+1,b+1,b]);}
    skin(pts,faces,col);
  }
  function headlamp(x,y,z,w,h,style='bar'){
    if(style==='round'){
      rod(chrome,[x,y,z+.07],[x,y,z-.005],w/2,'metal',w/2,22);
      rod(headWhite,[x,y,z-.005],[x,y,z-.030],w*.425,'lights',w*.378,22);
      for(let i=-2;i<=2;i++)block('#eac485',[x+i*w*.095,y,z-.028],[.008,w*.71,.007],.001);
    }else{
      block(black,[x,y,z+.007],[w+.06,h+.046,.062],.024,'matte');
      block(headWhite,[x,y,z-.028],[w,h,.021],.018,'lights');
    }
  }
  function seat(d,style='black'){
    const comfort=style==='brown'?'#5b3525':'#282a2d',insert=style==='brown'?'#71452b':'#3d4146';
    block(dark,[d.x,d.y-.145,d.z+.02],[.93*d.scale,.19,.94*d.scale],.08,'matte');
    block(comfort,[d.x,d.y-.09,d.z-.03],[1.20*d.scale,.16,.78*d.scale],.07,'matte');
    block(comfort,[d.x,d.y+.35,d.z+.45*d.scale],[1.22*d.scale,.83,.14],.068,'matte',[.14,0,0]);
    block(insert,[d.x,d.y+.30,d.z+.36*d.scale],[.86*d.scale,.63,.07],.027,'matte',[.14,0,0]);
    for(const s of [-1,1]){
      block(comfort,[d.x+s*.54*d.scale,d.y+.01,d.z-.035],[.12,.17,.71*d.scale],.038,'matte');
      rod('#bd975d',[d.x+s*.41*d.scale,d.y+.12,d.z+.31*d.scale],[d.x+s*.40*d.scale,d.y+.66,d.z+.49*d.scale],.009,'matte');
    }
  }
  function wing(y,z,width,col,tip=col,mount=[.30,.47,-.10]){
    block(col,[0,y,z],[width,.095,.36],.026,'paint',[.10,0,0]);
    block(col,[0,y-.037,z+.103],[width*.988,.065,.20],.022,'paint',[.035,0,0]);
    for(const s of [-1,1]){
      rod(dark,[s*mount[0],mount[1],z+mount[2]],[s*width*.265,y-.046,z-.06],.053,'matte');
      block(tip,[s*(width*.5+.005),y+.028,z],[.067,.275,.41],.031);
    }
  }
  function tails(y,z,w,square=true){
    for(const s of [-1,1]){
      const x=s*w;
      if(square){
        block(black,[x,y,z],[.29,.14,.060],.025,'matte');
        block(brakeRed,[x,y+.017,z+.034],[.237,.064,.014],.008,'lights');
        block('#ffd158',[x,y-.036,z+.032],[.17,.026,.013],.004,'lights');
      }else{
        rod(dark,[x,y,z-.032],[x,y,z+.016],.105,'metal');
        rod(brakeRed,[x,y,z+.014],[x,y,z+.028],.082,'lights',.076,16);
      }
    }
  }
  function slot(col,p,d){block(col,p,d,.015,'matte');}
  return {geometry,block,rod,path,bulb,skin,quad,loft,stripes,arch,headlamp,seat,wing,tails,slot};
}

function formula(k,c){
  const {loft,block,rod,path,stripes,seat,wing,tails}=k,col=c.color,iv=c.trim;
  loft(dark,[[-1.95,.34,.16,.24],[-1.04,.57,.18,.35],[.68,.77,.19,.36],[1.60,.52,.19,.32]],'matte');
  const nose=[[-2.00,.23,.205,.275],[-1.86,.281,.22,.33],[-1.56,.342,.235,.44],[-1.22,.40,.245,.56],[-.81,.49,.29,.70],[-.48,.52,.36,.735]];
  loft(col,nose);stripes(nose,r=>-Math.min(.16,r[1]*.54),r=>Math.min(.16,r[1]*.54),iv);
  loft(col,[[.50,.55,.24,.71],[.77,.58,.27,.76],[1.14,.46,.29,.70],[1.54,.41,.25,.54],[1.78,.36,.22,.45]]);
  loft(col,[[.39,.232,.63,.92],[.56,.236,.68,1.28],[.76,.187,.64,1.32],[1.12,.108,.62,.93],[1.65,.075,.52,.58]]);
  const p=c.driver;
  seat(p);
  for(const s of [-1,1]){
    const rows=[[-.83,.16,.26,.54,s*.63],[-.56,.22,.27,.75,s*.59],[-.15,.25,.26,.745,s*.65],
      [.30,.26,.27,.70,s*.67],[.74,.22,.29,.62,s*.66],[1.09,.13,.30,.53,s*.57]];
    loft(col,rows);
    path(col,[[s*.49,.69,-.59],[s*.54,.84,-.23],[s*.53,.85,.22],[s*.51,.77,.55],[s*.32,.76,.67]],.051,'paint');
    for(const z of [-1.22,1.08]){
      const r=z<0?.435:.49;
      for(const off of [-.26,.26]){
        rod(carbon,[s*.30,r+.06,z+off],[s*1.025,r,z],.043,'matte');
        rod(carbon,[s*.40,r-.09,z+off*.78],[s*1.025,r-.075,z],.037,'matte');
      }
      rod(chrome,[s*.38,r+.115,z+.10],[s*.95,r+.01,z],.029);
    }
    block(col,[s*.705,.195,-1.865],[.98,.092,.39],.023,'paint',[.18,0,0]);
    block(col,[s*.71,.258,-1.76],[.95,.074,.23],.019,'paint',[.20,0,0]);
    block(iv,[s*1.219,.278,-1.839],[.080,.27,.44],.035,'paint',[.09,0,0]);
    rod(dark,[s*.20,.24,-1.52],[s*.48,.18,-1.82],.05,'matte');
    rod(chrome,[s*.24,.45,1.61],[s*.24,.445,1.83],.079,'metal',.070);
    rod(black,[s*.24,.445,1.826],[s*.24,.445,1.835],.053,'matte');
  }
  wing(1.515,1.50,2.27,col,iv,[.30,.47,-.13]);tails(.42,1.79,.26,false);
}

function coupeCage(k,c,{front,rear,topFront,topRear,belt,roof,half,trim,topStripe=0,sideBack=false}){
  const {rod,quad,loft,path,stripes,block}=k;
  const bx=half,tx=half*.78,rearX=half*(sideBack?.96:.80),tl=roof-.065,w=c.color;
  const roofRows=[[topFront-.055,tx*.90,tl,roof-.031],[topFront+.07,tx,tl,roof],[topRear-.073,tx,tl,roof],[topRear+.028,tx*.91,tl,roof-.022]];
  loft(w,roofRows);
  if(topStripe)for(const s of [-1,1])stripes(roofRows,()=>s*.108-topStripe/2,()=>s*.108+topStripe/2,c.trim);
  for(const s of [-1,1]){
    const lower=[s*bx,belt,front],upper=[s*tx,tl,topFront],backLower=[s*rearX,belt,rear],backUpper=[s*tx,tl,topRear];
    const middle=.27,midTop=.28;
    for(const [a,b,r] of [[lower,upper,.055],[backLower,backUpper,.06],[upper,backUpper,.060],
      [[s*bx,belt+.008,middle],[s*tx,tl,midTop],.039]])rod(w,a,b,r,'paint',r*.94,9);
    path(trim,[lower,[s*(bx-.017),belt+.19,front+(topFront-front)*.25],upper],.017,'matte');
    rod(trim,lower,backLower,.025,'matte');
    rod(trim,upper,backUpper,.023,'matte');
    rod(chrome,[s*(bx+.01),belt+.024,front+.01],[s*(rearX+.009),belt+.024,rear],.011);
    if(sideBack)quad([[s*(bx-.018),belt+.023,middle],[s*(rearX-.015),belt+.023,rear],
      [s*(tx-.008),tl-.02,topRear],[s*(tx-.008),tl-.02,midTop]],glassColor,'glass');
  }
  quad([[-bx+.023,belt+.015,front-.012],[-tx+.02,tl-.023,topFront-.012],[tx-.02,tl-.023,topFront-.012],[bx-.023,belt+.015,front-.012]],glassColor,'glass');
  quad([[rearX-.02,belt+.018,rear+.005],[tx-.02,tl-.026,topRear+.005],[-tx+.02,tl-.026,topRear+.005],[-rearX+.02,belt+.018,rear+.005]],glassColor,'glass');
  rod(trim,[-bx,belt,front],[bx,belt,front],.024,'matte');
  for(const s of [-1,1]){
    rod(carbon,[s*.16,belt+.040,front-.018],[s*.46,belt+.195,front+(topFront-front)*.23-.020],.013,'matte');
    block(black,[s*(bx-.11),belt-.08,front+.07],[.045,.10,.44],.02,'matte');
  }
  block(trim,[0,belt-.067,front+.04],[2*bx-.08,.12,.20],.045,'matte');
}

function rally(k,c){
  const {loft,block,rod,stripes,arch,headlamp,seat,tails,slot,path}=k,col=c.color;
  const bonnet=[[-1.82,.79,.45,.755],[-1.73,.91,.44,.91],[-1.51,.95,.46,.98],[-1.06,.91,.49,1.04],[-.64,.857,.48,1.075]];
  loft(col,bonnet);
  for(const z of [-.105,.105])stripes(bonnet,()=>z-.071,()=>z+.071,c.trim);
  loft('#e8a932',[[-.64,.85,.29,.55],[.52,.84,.31,.57],[.92,.89,.34,.55],[1.75,.83,.38,.59]]);
  loft(col,[[.66,.84,.44,.97],[.96,.90,.44,1.04],[1.45,.92,.48,1.02],[1.73,.88,.46,.92],[1.82,.79,.46,.89]]);
  for(const s of [-1,1]){
    loft(col,[[-.72,.145,.34,1.070,s*.77],[-.50,.17,.41,1.067,s*.76],[.29,.16,.40,1.054,s*.75],[.73,.15,.43,1.043,s*.79],[1.03,.17,.44,1.055,s*.81]]);
    for(const z of [-1.13,1.13])arch(s*1.13,z,.425,.418,.26,col,.087);
    slot('#4d4230',[s*.956,.696,.10],[.021,.018,.99]);
    rod('#a9691d',[s*.934,.41,.32],[s*.935,.98,.36],.010,'matte');
    block(chrome,[s*.952,1.00,.26],[.030,.038,.175],.012,'metal');
    path(chrome,[[s*.73,1.038,-1.255],[s*.74,1.166,-1.244],[s*.80,1.199,-1.244]],.023);
    block(chrome,[s*.828,1.204,-1.244],[.21,.117,.10],.035,'metal');
    block(glassColor,[s*.828,1.204,-1.185],[.167,.075,.010],.007,'metal');
    headlamp(s*.667,.745,-1.878,.306,.255,'round');
  }
  block(dark,[0,.718,-1.78],[1.53,.32,.145],.061,'matte');
  block(chrome,[0,.532,-1.815],[1.87,.11,.125],.028,'metal');
  for(let i=0;i<5;i++)block(i===1?'#a4aaad':'#51555b',[0,.64+i*.042,-1.864],[.98,.017,.013],.003,'metal');
  for(const x of [-.495,-.165,.165,.495])headlamp(x,.59,-1.90,.247,.22,'round');
  block(col,[0,1.082,1.69],[1.50,.13,.21],.045,'paint',[.12,0,0]);
  block(chrome,[0,.493,1.819],[1.78,.091,.105],.03,'metal');
  tails(.74,1.796,.65);
  seat(c.driver);
  coupeCage(k,c,{front:-.67,rear:.94,topFront:-.35,topRear:.57,belt:1.07,roof:1.88,half:.80,trim:black,topStripe:.135,sideBack:true});
}

function prototype(k,c,T){
  const {loft,block,rod,path,stripes,arch,headlamp,seat,wing,tails,slot,geometry}=k,col=c.color,iv=c.trim;
  loft(carbon,[[-2.09,.91,.155,.205],[-1.93,1.22,.155,.229],[-1.60,1.275,.17,.25],[-.58,1.21,.17,.27],
    [1.48,1.23,.18,.28],[1.91,1.155,.185,.268],[2.05,.94,.18,.24]],'matte');
  const nose=[[-2.02,.48,.208,.30],[-1.83,.49,.24,.43],[-1.45,.54,.25,.535],[-1.06,.572,.26,.635],[-.84,.575,.27,.71]];
  loft(col,nose);stripes(nose,()=>-.19,()=>.19,iv);
  loft(col,[[.86,.50,.28,.76],[1.22,.57,.26,.86],[1.52,.63,.27,.798],[1.93,.58,.29,.60],[2.0,.53,.29,.51]]);
  seat(c.driver);
  for(const s of [-1,1]){
    const front=[[-1.92,.24,.241,.388,s*.919],[-1.72,.300,.25,.54,s*.933],[-1.40,.33,.27,.755,s*.913],
      [-1.14,.305,.63,.805,s*.919],[-.89,.30,.55,.76,s*.928],[-.60,.265,.24,.565,s*.933],[-.36,.178,.23,.48,s*.99]];
    loft(col,front);stripes(front.slice(0,3),r=>r[4]-.102,r=>r[4]+.102,iv,.008);
    const rear=[[.30,.190,.27,.51,s*.995],[.60,.257,.28,.58,s*.94],[.88,.31,.39,.744,s*.944],
      [1.11,.325,.74,.905,s*.931],[1.39,.32,.52,.86,s*.92],[1.66,.304,.27,.748,s*.93],
      [1.89,.238,.28,.65,s*.93],[2.00,.20,.29,.57,s*.92]];
    loft(col,rear);
    loft(col,[[-.81,.32,.29,.51,s*.75],[-.48,.32,.29,.69,s*.78],[.05,.27,.27,.76,s*.804],
      [.52,.27,.28,.71,s*.822],[.85,.28,.30,.71,s*.84]]);
    for(const [z,r] of c.wheels)arch(s*1.24,z,r+.045,r,.37,col,.058);
    for(const [y,z] of [[.336,-1.919],[.460,-1.839]])headlamp(s*.924,y,z,.301,.089);
    slot(carbon,[s*.945,.732,-1.24],[.22,.033,.25]);
    slot(black,[s*1.097,.47,.281],[.020,.23,.41]);slot(black,[s*.925,.79,.983],[.20,.03,.22]);
    path(chrome,[[s*.51,.711,-.85],[s*.63,.762,-.60],[s*.66,.796,-.30],[s*.67,.809,.07],[s*.61,.803,.55],[s*.51,.767,.85]],.028);
  }
  const dome=new T.SphereGeometry(1,40,20,0,Math.PI*2,0,Math.PI/2);
  dome.scale(.668,.98,.878);
  geometry(dome,glassColor,'glass',[0,.798,.016]);
  const rail=(theta)=>[.669*Math.cos(theta),.797,.016+.879*Math.sin(theta)];
  path(chrome,Array.from({length:21},(_,j)=>rail(j*Math.PI/10)),.025);
  for(const s of [-1,1]){
    const seam=Array.from({length:15},(_,i)=>{
      const a=i*Math.PI/14,cross=Math.cos(a);
      return [s*.275,.798+.905*Math.sin(a),.016-.802*cross];
    });
    path('#9faab2',seam,.008);
  }
  wing(1.455,1.63,2.28,col,col,[.41,.53,-.16]);tails(.491,2.002,.79);
  for(const s of [-1,1])rod(chrome,[s*.38,.34,1.96],[s*.38,.34,2.069],.088,'metal',.083);
}

function hotRod(k,c){
  const {loft,block,rod,path,stripes,headlamp,seat,tails,quad}=k,iv=c.color,col=c.trim;
  loft(col,[[-1.77,.44,.226,.44],[-1.53,.445,.22,.48],[-.60,.56,.228,.48],[.72,.62,.22,.50],
    [1.38,.53,.23,.49],[1.84,.30,.24,.40]],'matte');
  const bonnet=[[-1.73,.374,.49,.91],[-1.58,.448,.48,1.06],[-1.31,.483,.47,1.13],[-.98,.499,.46,1.16],[-.65,.503,.48,1.12],[-.41,.513,.49,1.09]];
  loft(iv,bonnet);
  for(const z of [-1.28,-.87]){
    const n=.63,points=[[-.502,.73,z],[-.503,.93,z],[-.404,1.153,z],[-.25,1.169,z],[.25,1.169,z],[.404,1.153,z],[.503,.93,z],[.502,.73,z]];
    path('#70422d',points,.022,'matte');
    block('#a66e44',[0,1.167,z],[.095,.019,.079],.008,'matte');
    block(chrome,[0,1.183,z+.012],[.060,.025,.050],.005,'metal');
  }
  const ring=[[0,1.066,-1.766],[-.21,1.014,-1.788],[-.315,.93,-1.797],[-.341,.785,-1.803],[-.328,.462,-1.812],
    [-.229,.285,-1.803],[0,.251,-1.795],[.229,.285,-1.803],[.328,.462,-1.812],[.341,.785,-1.803],[.315,.93,-1.797],[.21,1.014,-1.788],[0,1.066,-1.766]];
  path('#e1b66e',ring,.041);
  const center=[0,.665,-1.804],fac=[];
  for(let i=1;i<ring.length;i++)fac.push([0,i,i+1]);
  k.skin([center,...ring],fac,black,'matte');
  for(let i=-6;i<=6;i++){
    const x=i*.044,ratio=Math.abs(x)/.32;
    rod('#c3a06c',[x,.278+.097*ratio**3,-1.823],[x,1.019-.222*ratio**3,-1.810],.009);
  }
  seat(c.driver,'brown');
  for(const s of [-1,1]){
    const rails=[[-.50,.115,.31,.93,s*.55],[-.23,.125,.32,.962,s*.57],[.30,.125,.32,.915,s*.583],
      [.67,.140,.32,.86,s*.60],[.95,.14,.35,.79,s*.60],[1.40,.13,.32,.62,s*.50]];
    loft(col,rails);
    path('#bc9e68',rails.map(([z,w,,y,xc])=>[xc+s*w*.60,y+.009,z]),.013);
    path(chrome,[[s*.44,.96,-.43],[s*.58,1.015,-.23],[s*.61,.984,.03],[s*.59,.94,.31],[s*.53,.865,.69]],.023);
    for(let i=0;i<5;i++){
      const z=-1.21+i*.143;
      path(chrome,[[s*.457,.785,z],[s*.56,.769,z+.028],[s*.65,.631,z+.121],[s*.70,.486,z+.23],
        [s*.745,.438,z+.355],[s*.762,.436,z+.54]],.048);
    }
    rod('#8c7763',[s*.760,.435,-.88],[s*.760,.435,.64],.076,'metal',.068,20);
    rod(black,[s*.760,.435,.638],[s*.760,.435,.642],.051,'matte');
    headlamp(s*.615,.515,-1.635,.288,.22,'round');
    for(const z of [-1.13,1.17]){
      const r=z<0?.43:.50;
      for(const a of [-1,1])rod(chrome,[s*.35,.29,z+a*.18],[s*.865,r,z],.039,'metal');
      rod('#624736',[s*.37,r+.07,z+.10],[s*.84,r+.012,z],.041,'metal');
    }
  }
  loft(col,[[.61,.44,.49,.90],[.84,.55,.43,1.00],[1.20,.54,.41,.90],[1.62,.42,.36,.75],[1.84,.30,.34,.605]]);
  const fin=[[0,.94,.70],[0,1.295,1.05],[0,1.56,1.62],[0,1.58,1.88],[0,.67,1.79]];
  for(const s of [-1,1]){
    const p=fin.map(([x,y,z],i)=>[s*(i===0?.105:i===4?.097:.025),y,z]);
    k.skin(p,s<0?[[0,1,4],[1,2,4],[2,3,4]]:[[0,4,1],[1,4,2],[2,4,3]],col);
    path(iv,p.slice(0,4),.028,'paint');
  }
  block(chrome,[0,.32,1.87],[.77,.051,.089],.018,'metal');
  tails(.45,1.87,.265,false);
}

function drift(k,c){
  const {loft,block,rod,path,headlamp,seat,tails,arch,slot}=k,col=c.color;
  const nose=[[-2.025,.915,.29,.68],[-1.92,1.039,.27,.77],[-1.64,1.05,.29,.87],[-1.17,1.01,.33,.93],[-.66,.91,.34,.97]];
  loft(col,nose);
  loft('#7330a5',[[-2.105,1.012,.172,.275],[-1.97,1.136,.18,.29],[-1.41,1.115,.19,.31],[-1.28,1.051,.195,.34]]);
  loft('#511b7d',[[-.67,1.055,.192,.33],[.20,1.065,.193,.32],[.69,1.052,.206,.36],[1.58,1.012,.23,.44],[1.98,.977,.27,.42]]);
  block(col,[0,.947,-1.075],[.65,.076,.51],.055,'paint',[.16,0,0]);
  slot(black,[0,.941,-1.335],[.52,.036,.043]);
  block(black,[0,.623,-2.010],[1.788,.296,.097],.046,'matte');
  block('#6335a1',[0,.443,-2.045],[2.07,.136,.154],.04);
  block(black,[0,.299,-2.082],[1.02,.173,.07],.019,'matte');
  for(let i=0;i<4;i++)block('#585563',[0,.263+i*.039,-2.12],[.97,.011,.012],.003,'matte');
  for(let i=0;i<5;i++)block('#545461',[0,.548+i*.037,-2.066],[.89,.011,.012],.002,'matte');
  for(const s of [-1,1]){
    headlamp(s*.697,.626,-2.056,.42,.182);
    block('#ff962a',[s*.705,.414,-2.123],[.217,.056,.022],.012,'lights');
    slot(black,[s*.835,.304,-2.104],[.314,.166,.04]);
    loft(col,[[-.71,.13,.30,.967,s*.857],[-.49,.16,.306,.995,s*.843],[.33,.17,.31,.965,s*.86],[.61,.16,.33,.941,s*.866]]);
    loft(col,[[.43,.12,.45,.95,s*.93],[.72,.14,.47,1.024,s*.96],[1.15,.14,.468,1.012,s*.98],[1.72,.134,.48,.958,s*.95],[1.99,.105,.45,.912,s*.903]]);
    for(const [z,r] of c.wheels){
      arch(s*1.169,z,r+.047,r,.205,'#a64cdf',.064);
      for(let i=0;i<7;i++){
        const angle=(i+.5)*Math.PI/7,rad=r+.089;
        rod(chrome,[s*1.174,r+rad*Math.sin(angle),z+rad*Math.cos(angle)],[s*1.181,r+rad*Math.sin(angle),z+rad*Math.cos(angle)],.011,'metal',.008,7);
      }
    }
    rod(chrome,[s*.805,1.033,-.479],[s*.963,1.091,-.480],.018);
    block('#32303d',[s*1.005,1.091,-.479],[.165,.093,.112],.028,'matte');
    path(chrome,[[s*.39,.65,1.49],[s*.49,.91,1.16],[s*.52,1.62,.96],[s*.48,1.98,.89],[s*.354,1.98,.83]],.045);
    path('#377cf5',[[s*.504,1.35,1.017],[s*.509,1.48,.990],[s*.514,1.57,.968]],.050,'paint');
    rod('#3e2d52',[s*1.027,.57,.303],[s*1.029,.956,.303],.010,'matte');
    block(black,[s*1.017,.92,.28],[.025,.045,.173],.012,'matte');
  }
  block(col,[0,.679,1.978],[1.987,.484,.108],.045);
  block(black,[0,.604,1.151],[1.66,.066,1.51],.027,'matte');
  for(let j=0;j<8;j++)block('#353440',[(j-3.5)*.201,.644,1.186],[.04,.018,1.28],.009,'matte');
  block(black,[0,1.627,.89],[.831,.602,.144],.052,'matte');
  block(chrome,[0,1.634,.97],[.758,.547,.065],.035,'metal');
  for(let i=0;i<10;i++){block(chrome,[0,1.402+i*.049,.798],[.650,.014,.019],.004,'metal');block('#373a43',[0,1.402+i*.049,1.005],[.650,.019,.019],.004,'matte');}
  block(col,[0,.384,2.048],[2.05,.146,.122],.045);
  tails(.76,2.037,.773);
  seat(c.driver);
  coupeCage(k,c,{front:-.68,rear:.58,topFront:-.42,topRear:.47,belt:1.002,roof:1.82,half:.834,trim:black});
}

function electric(k,c){
  const {loft,block,rod,path,stripes,arch,headlamp,seat,wing,tails,slot}=k,col=c.color,iv=c.trim;
  loft(carbon,[[-2.13,.73,.155,.213],[-2.04,1.208,.155,.223],[-1.61,1.26,.155,.238],
    [-.62,1.23,.172,.244],[.82,1.23,.179,.249],[1.72,1.155,.182,.235],[2.015,.912,.187,.23]],'matte');
  const nose=[[-2.114,.185,.212,.284],[-1.94,.22,.24,.351],[-1.62,.26,.25,.477],[-1.15,.31,.26,.584],[-.786,.415,.29,.73],[-.51,.476,.31,.791]];
  loft(col,nose);stripes(nose,r=>-r[1]*.61,r=>r[1]*.61,iv,.018);
  seat(c.driver);
  loft(col,[[.58,.51,.28,.73],[.90,.53,.26,.75],[1.27,.47,.25,.67],[1.89,.51,.25,.61]]);
  for(const s of [-1,1]){
    const left=[[-1.93,.285,.26,.377,s*.896],[-1.74,.328,.267,.492,s*.872],[-1.49,.355,.279,.704,s*.851],
      [-1.30,.339,.58,.839,s*.848],[-1.065,.302,.52,.789,s*.885],[-.839,.309,.28,.678,s*.873],[-.506,.237,.269,.649,s*.857]];
    loft(col,left);
    loft(col,[[-.64,.256,.34,.716,s*.662],[-.36,.175,.35,.756,s*.648],[.00,.176,.36,.755,s*.632],[.38,.175,.40,.739,s*.646],[.96,.218,.30,.664,s*.695]]);
    arch(s*1.201,-1.21,.438,.385,.32,col,.065);
    arch(s*1.22,1.16,.458,.42,.32,col,.059);
    block(col,[s*1.205,.35,-1.969],[.067,.39,.415],.028,'paint',[-.20,0,0]);
    rod(carbon,[s*.407,.218,-1.88],[s*.919,.224,-1.61],.023,'matte');
    headlamp(s*.879,.434,-1.836,.338,.088);
    slot(black,[s*.877,.297,-1.914],[.42,.134,.044]);slot(black,[s*.889,.70,-1.438],[.33,.035,.17]);
    path('#ed6b22',[[s*.638,.50,-.35],[s*.757,.52,-.28],[s*.830,.55,-.18],[s*.825,.627,.012],[s*.793,.668,.198],[s*.842,.704,.38],[s*.955,.752,.54],[s*.994,.81,.788]],.046);
  }
  block('#363d44',[-.878,.758,.494],[.524,.55,.868],.07,'matte',[.03,0,0]);
  block('#535c62',[-.878,.777,.077],[.48,.426,.104],.041,'metal');
  for(const x of [-.99,-.767]){
    block('#e97825',[x,.776,.020],[.105,.258,.032],.015,'paint');
    block('#ffa132',[x,.777,-.002],[.038,.202,.019],.008,'lights');
  }
  for(let i=0;i<3;i++)block('#252e31',[-.872,.985,.345+i*.13],[.337,.044,.05],.008,'matte');
  const pc=[.905,.722,.234],ec=[.905,.729,1.353];
  rod('#404850',pc,ec,.274,'metal',.266,30);
  rod('#f4bb38',[.905,.725,.302],[.905,.726,.377],.274,'lights',.285,28);
  rod('#6b7775',[.905,.724,.165],[.905,.725,.307],.235,'metal',.263,28);
  rod('#293234',[.905,.724,.156],[.905,.724,.170],.161,'matte',.151,24);
  rod(chrome,[.905,.729,1.30],[.905,.728,1.416],.261,'metal',.229,28);
  path(black,[[-.46,.498,.70],[-.435,.810,.71],[-.353,1.318,.73],[-.257,1.563,.746],
    [.248,1.563,.746],[.351,1.314,.73],[.429,.811,.71],[.465,.490,.70]],.052,'matte');
  block(carbon,[0,.568,-.635],[.451,.209,.216],.051,'matte',[-.22,0,0]);
  wing(1.348,1.552,2.275,col,col,[.37,.50,-.18]);tails(.489,1.993,.78);
}

const shapes={
  'track-formula':formula,'track-rally':rally,'track-prototype':prototype,
  'track-hot-rod':hotRod,'track-drift':drift,'track-electric':electric,
};
const crown={
  'track-formula':.52,'track-rally':.57,'track-prototype':.44,
  'track-hot-rod':.47,'track-drift':.55,'track-electric':.44,
};
export const concepts=catalog.map(c=>{
  const [w,minZ,maxZ,height]=c.extent;
  return {id:c.id,name:c.name,role:c.role,color:c.color,trim:c.trim,mount:c.driver,
    wheels:c.wheels.flatMap(([z,r,x,width])=>[-1,1].map(side=>{
      const style=c.id==='track-hot-rod'?'whitewall':c.id==='track-rally'?'offroad':'spoke';
      return {x:x*side,z,r,width,steer:z<0,rim:c.id==='track-drift'?'#a2784a':c.id==='track-hot-rod'?'#9e7850':'#bdc6cb',tire:rubber,style};
    })),
    bounds:[w,minZ,maxZ],height,tail:[crown[c.id],c.tail],seat:false,
    build(h){shapes[c.id](trackPainter(h),c,h.T);}
  };
});

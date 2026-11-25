import {CIRCUITS,blueprint} from './circuits.js';

const storageKey='sproto.racing.circuit.v1';
export function savedCourse(){
  let id;
  try{id=localStorage.getItem(storageKey);}catch{}
  return CIRCUITS.find(course=>course.id===id)??CIRCUITS[0];
}
function drawOutline(canvas,nodes){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  const xs=nodes.map(n=>n.p.x),zs=nodes.map(n=>n.p.z);
  const left=Math.min(...xs),top=Math.min(...zs),dx=Math.max(...xs)-left,dz=Math.max(...zs)-top;
  const scale=Math.min((w-16)/dx,(h-16)/dz);
  ctx.strokeStyle='#cde1bd';ctx.lineWidth=3;ctx.lineJoin='round';ctx.beginPath();
  for(let i=0;i<nodes.length;i+=4){
    const p=nodes[i].p,x=(w-dx*scale)/2+(p.x-left)*scale,y=(h-dz*scale)/2+(p.z-top)*scale;
    if(i===0){ctx.moveTo(x,y);ctx.fillStyle='#ff7546';ctx.fillRect(x-4,y-4,8,8);}else ctx.lineTo(x,y);
  }
  ctx.closePath();ctx.stroke();
}
export function mountTrackSelector(initial,onSelect){
  const entries=document.getElementById('circuits');
  const choose=course=>{
    for(const button of entries.children)button.setAttribute('aria-pressed',String(button.dataset.track===course.id));
    const [first,last]=course.hero;
    document.title='Sproto Racing — '+course.name;
    document.getElementById('hero-name').textContent=first.toUpperCase();
    document.getElementById('hero-suffix').textContent=last.toUpperCase();
    document.getElementById('hero-sectors').textContent=course.names.length;
    onSelect(course);
  };
  for(const course of CIRCUITS){
    const {nodes,length}=blueprint(course);
    const button=document.createElement('button');
    button.dataset.track=course.id;button.className='course-card';
    button.innerHTML='<canvas width="140" height="98" aria-hidden="true"></canvas><span><small>CIRCUIT '+course.number+' · '+(length/1000).toFixed(2)+' KM</small><b>'+course.name+'</b><span>'+course.focus+'</span></span>';
    drawOutline(button.firstElementChild,nodes);
    button.onclick=()=>{
      choose(course);
      try{localStorage.setItem(storageKey,course.id);}catch{}
    };
    entries.append(button);
  }
  choose(initial);
}

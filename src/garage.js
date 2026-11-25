import {CARS,DRIVERS,carById,driverById} from './roster.js';
import {icon} from './icons.js';

const key='sproto.racing.garage.v1';
const descriptions=['Striped race cap','Rally goggles','Pointed ears and scarf','Horned helmet'];
const stats=[['speed','Top speed'],['accel','Acceleration'],['turn','Turning']];
const percent=value=>Math.round((value-1)*1000)/10;
const formatStat=value=>value===1?'Base':(value>1?'+':'')+percent(value)+'%';

export function createGarage(paddock,launch){
  const panel=document.getElementById('garage'),lobby=document.getElementById('lobby');
  const turn=document.getElementById('turn-model');
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(key))||{};}catch{}
  let car=carById(saved.car),driver=driverById(saved.driver),step='';
  const selection=()=>({car:car.id,driver:driver.id});
  function preview(){
    paddock.preview(car,driver);
    document.getElementById('tag-car').textContent=car.name.toUpperCase();
    document.getElementById('tag-driver').textContent=driver.name.toUpperCase();
  }
  function update(){
    const choosingDriver=step==='driver';
    const current=choosingDriver?driver:car;
    for(const b of panel.querySelectorAll('[data-choice]'))b.setAttribute('aria-pressed',String(b.dataset.choice===current.id));
    panel.querySelector('.garage-detail').innerHTML=choosingDriver?'Drivers are cosmetic. Your car sets the handling.':
      '<small>Relative to Apex</small>'+stats.map(([id,title])=>'<span>'+title+' <b>'+formatStat(car[id])+'</b></span>').join('');
    preview();
  }
  function show(nextStep){
    step=nextStep;const choosingDriver=step==='driver';
    const choices=choosingDriver?DRIVERS:CARS;
    const current=choosingDriver?driver:car;
    panel.innerHTML='<div class="section-heading"><h2>'+ (choosingDriver?'Choose your driver':'Choose your car')+'</h2><span class="mode-counter">'+(choosingDriver?'01':'02')+' / 02</span></div>'+
      '<div class="garage-choices" role="group" aria-label="'+(choosingDriver?'Drivers':'Cars')+'">'+choices.map((choice,i)=>
        '<button data-choice="'+choice.id+'" aria-pressed="'+(choice===current)+'" style="--paint:'+(choice.color??choice.skin)+'"><b>'+choice.name+'</b><small>'+(choice.role??descriptions[i])+'</small></button>').join('')+'</div>'+
      '<div class="garage-detail" aria-live="polite"></div><div class="garage-actions"><button class="garage-back">Back</button><button class="launch" id="garage-next">'+(choosingDriver?'CHOOSE CAR':document.getElementById('launch').dataset.action)+' '+icon('arrow')+'</button></div>';
    panel.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{
      if(choosingDriver)driver=driverById(b.dataset.choice);else car=carById(b.dataset.choice);
      update();
    });
    panel.querySelector('.garage-back').onclick=back;
    panel.querySelector('#garage-next').onclick=()=>{
      if(choosingDriver){show('car');return;}
      saved=selection();
      try{localStorage.setItem(key,JSON.stringify(saved));}catch{}
      close();launch();
    };
    update();
    panel.querySelector('[aria-pressed=true]').focus({preventScroll:true});
  }
  function close(){
    car=carById(saved.car);driver=driverById(saved.driver);preview();
    step='';panel.hidden=true;turn.hidden=true;lobby.classList.remove('garage-open');paddock.setGarage(false);
  }
  function back(){
    if(step==='car'){show('driver');return;}
    close();document.getElementById('launch').focus({preventScroll:true});
  }
  function move(direction){
    const controls=[...panel.querySelectorAll('button'),turn];
    let i=controls.indexOf(document.activeElement);
    controls[(i+controls.length+direction)%controls.length].focus({preventScroll:true});
  }
  turn.onclick=()=>{paddock.turn();turn.textContent=turn.textContent==='Rear view'?'Front view':'Rear view';};
  preview();
  return {selection,close,back,move,get active(){return !!step},open(){
    lobby.classList.add('garage-open');panel.hidden=false;turn.hidden=false;turn.textContent='Rear view';
    paddock.setGarage(true);show('driver');
  }};
}

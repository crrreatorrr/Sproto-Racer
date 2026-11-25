import {CARS,DRIVERS,carById,driverById} from './roster.js';
import {icon} from './icons.js';
import {isUnlocked,lockReason,playableId} from './hub/unlocks.js';
import {relicSummary} from './hub/relics.js';

const key='sproto.racing.garage.v1';
const descriptions=['Striped race cap','Rally goggles','Pointed ears and scarf','Horned helmet'];
const stats=[['speed','Top speed'],['accel','Acceleration'],['turn','Turning']];
const percent=value=>Math.round((value-1)*1000)/10;
const formatStat=value=>value===1?'Base':(value>1?'+':'')+percent(value)+'%';
const EMPTY_RELICS={
  owned:()=>[],
  source:()=>'unknown',
  view:()=>({source:'unknown',caption:'Sign in through the hub to see which Relics you own',items:[]}),
  subscribe:()=>()=>{},
};

export function createGarage(paddock,launch,relics=EMPTY_RELICS,table){
  const panel=document.getElementById('garage'),lobby=document.getElementById('lobby');
  const turn=document.getElementById('turn-model');
  const owned=()=>relics.owned();
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(key))||{};}catch{}
  let car=carById(saved.car),driver=driverById(saved.driver),step='',notice='';
  const selection=()=>({car:car.id,driver:driver.id});
  function coerce(){
    const open=!!step;
    const carId=playableId('car',open?car.id:(saved.car||car.id),owned(),table);
    const driverId=playableId('character',open?driver.id:(saved.driver||driver.id),owned(),table);
    if(carId)car=carById(carId);
    if(driverId)driver=driverById(driverId);
  }
  function preview(){
    paddock.preview(car,driver);
    document.getElementById('tag-car').textContent=car.name.toUpperCase();
    document.getElementById('tag-driver').textContent=driver.name.toUpperCase();
  }
  function update(){
    const choosingDriver=step==='driver';
    const now=choosingDriver?driver:car;
    const choiceKind=choosingDriver?'character':'car';
    for(const b of panel.querySelectorAll('[data-choice]')){
      const locked=b.dataset.locked==='true';
      b.setAttribute('aria-pressed',String(!locked&&b.dataset.choice===now.id));
    }
    const detail=panel.querySelector('.garage-detail');
    if(notice)detail.textContent=notice;
    else if(choosingDriver)detail.textContent='Drivers are cosmetic. Your car sets the handling.';
    else detail.innerHTML='<small>Relative to Apex</small>'+stats.map(([id,title])=>'<span>'+title+' <b>'+formatStat(car[id])+'</b></span>').join('');
    const next=panel.querySelector('#garage-next');
    const ready=isUnlocked(choiceKind,now.id,owned(),table);
    next.disabled=!ready;
    if(!ready)next.textContent='LOCKED';
    else if(choosingDriver)next.innerHTML='CHOOSE CAR '+icon('arrow');
    else next.innerHTML=(document.getElementById('launch').dataset.action||'START RACE')+' '+icon('arrow');
    const line=panel.querySelector('.garage-relics');
    if(line){
      line.textContent=relicSummary(relics.view());
      line.dataset.relicSource=relics.source();
    }
    preview();
  }
  function show(nextStep){
    step=nextStep;notice='';
    const choosingDriver=step==='driver';
    const choices=choosingDriver?DRIVERS:CARS;
    const choiceKind=choosingDriver?'character':'car';
    const now=choosingDriver?driver:car;
    panel.innerHTML='<div class="section-heading"><h2>'+(choosingDriver?'Choose your driver':'Choose your car')+'</h2><span class="mode-counter">'+(choosingDriver?'01':'02')+' / 02</span></div>'+
      '<p class="garage-relics"></p>'+
      '<div class="garage-choices" role="group" aria-label="'+(choosingDriver?'Drivers':'Cars')+'">'+choices.map((choice,i)=>{
        const locked=!isUnlocked(choiceKind,choice.id,owned(),table);
        const blurb=locked?(lockReason(choiceKind,choice.id,table)??'Locked'):(choice.role??descriptions[i]??'');
        return '<button data-choice="'+choice.id+'" data-locked="'+locked+'" aria-disabled="'+locked+'" aria-pressed="'+(!locked&&choice===now)+'" style="--paint:'+(choice.color??choice.skin)+'"><b>'+choice.name+'</b><small>'+blurb+'</small></button>';
      }).join('')+'</div>'+
      '<div class="garage-detail" aria-live="polite"></div><div class="garage-actions"><button class="garage-back">Back</button><button class="launch" id="garage-next"></button></div>';
    panel.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{
      if(b.dataset.locked==='true'){
        notice=lockReason(choiceKind,b.dataset.choice,table)??'Locked';
        update();
        return;
      }
      notice='';
      if(choosingDriver)driver=driverById(b.dataset.choice);else car=carById(b.dataset.choice);
      update();
    });
    panel.querySelector('.garage-back').onclick=back;
    panel.querySelector('#garage-next').onclick=()=>{
      if(!isUnlocked(choiceKind,(choosingDriver?driver:car).id,owned(),table)){
        notice=lockReason(choiceKind,(choosingDriver?driver:car).id,table)??'Locked';
        update();
        return;
      }
      if(choosingDriver){show('car');return;}
      if(!isUnlocked('character',driver.id,owned(),table)){show('driver');return;}
      saved=selection();
      try{localStorage.setItem(key,JSON.stringify(saved));}catch{}
      close();launch();
    };
    update();
    panel.querySelector('[aria-pressed=true]')?.focus({preventScroll:true});
  }
  function close(){
    step='';notice='';
    car=carById(saved.car);driver=driverById(saved.driver);
    coerce();
    preview();
    panel.hidden=true;turn.hidden=true;lobby.classList.remove('garage-open');paddock.setGarage(false);
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
  coerce();
  preview();
  relics.subscribe(()=>{
    const prev=car.id+'|'+driver.id;
    coerce();
    if(step)show(step);
    else if(car.id+'|'+driver.id!==prev)preview();
  });
  return {selection,close,back,move,get active(){return !!step},open(){
    lobby.classList.add('garage-open');panel.hidden=false;turn.hidden=false;turn.textContent='Rear view';
    paddock.setGarage(true);show('driver');
  }};
}

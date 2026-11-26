import * as THREE from 'three';
import './style.css';
import {mountUI,MODES} from './ui.js';
import {icon} from './icons.js';
import {createInput,bindingName} from './input.js';
import {PERFECT_CHARGE} from './boost.js';
import {driftBoostReady} from './driving.js';
import {controllerIsOpen,openController} from './controller.js';
import {attachFeedbackSdk,createFeedbackHold,installRaceFeedback,raceBreadcrumbs} from './feedback.js';
import {createPaddock,lightScene} from './paddock.js';
import {updateRivalVisibility} from './kart-visibility.js';
import {makeKart,animateKart,disposeKart,resetKartWingPose} from './kart-art.js';
import {createGarage} from './garage.js';
import {carById,driverById} from './roster.js';
import {createChaseCamera} from './chase-camera.js';
import {mountTrackSelector,savedCourse} from './track-selector.js';
import {createTrack} from './track.js';
import {createGameplay,ITEMS} from './gameplay.js';
import {pickupPreview} from './items.js';
import {createItemFx,cueIconType} from './item-fx.js';
import {createRaceFX} from './race-fx.js';
import {createSession,DEFAULT_TEST,timeText} from './session.js';
import {createPerfMonitor} from './perf.js';
import {lerpAngle} from './sim/math.js';
import {laneCeiling,lapOf,nextCell} from './sim/sky.js';
import {createTrackSample} from './sim/track-core.js';
import {bootHub} from './hub/boot.js';
import {chipFrom,paintAccount} from './hub/account.js';
import {paintRelics} from './hub/relics.js';
import {controlRole,hubConfirmCopy,lobbyPadAction,menuKeyAction,modalPadAction,padEdges} from './hub/portal.js';

mountUI();
const $=id=>document.getElementById(id);
const input=createInput();
const perf=createPerfMonitor();
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}
catch(error){$('hero-canvas').innerHTML='<div class="unavailable">WebGL 2 is unavailable. Enable hardware acceleration in your browser and reload.</div>';$('launch').disabled=true;throw error;}
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
$('hero-canvas').append(renderer.domElement);
const paddock=createPaddock();
const world=new THREE.Scene();
world.background=new THREE.Color('#b9d9dc');world.fog=new THREE.FogExp2(0xc6d9d4,.0017);
lightScene(world,2.1);
const camera=new THREE.PerspectiveCamera(62,1,.15,2300);
let chosenCourse=savedCourse();
// Defer heavy circuit mesh/atlas build until after the first lobby frame paints.
let track=createTrack(world,chosenCourse,{deferVisuals:true});
let trackMountJob=null;
function cancelTrackMount(){
  if(trackMountJob===null)return;
  if(typeof cancelIdleCallback==='function')cancelIdleCallback(trackMountJob);
  else clearTimeout(trackMountJob);
  trackMountJob=null;
}
function scheduleTrackMount(targetTrack){
  cancelTrackMount();
  const mount=()=>{trackMountJob=null;if(targetTrack===track)targetTrack.mountVisuals();};
  trackMountJob=typeof requestIdleCallback==='function'?requestIdleCallback(mount,{timeout:400}):setTimeout(mount,32);
}
function ensureTrackVisuals(){
  cancelTrackMount();
  track.mountVisuals();
}
scheduleTrackMount(track);

const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
let impactUntil=0,shownItemToken='',shownReserveToken='',shownSlotOrder='';
const itemFx=createItemFx(world,track,{reduced:motion.matches,onSignal:paintItemSignal});
const play=createGameplay(world,track,{onVisualCue:itemFx.cue}),fx=createRaceFX(world,track);
const hub=bootHub();
let session=createSession(track,play,fx,undefined,itemFx.cue),state=session.state;
function showAccount(){
  const chip=chipFrom(hub.link,hub.records);
  document.querySelectorAll('[data-hub-account]').forEach(el=>paintAccount(el,chip));
  paintRelics($('hub-relic-caption'),$('hub-relics'),hub.relics.view());
}
hub.link.subscribe(showAccount);
hub.records.subscribe(()=>{session.reloadBest();showAccount();});
hub.relics.subscribe(showAccount);
showAccount();
attachFeedbackSdk(hub.link.api);
function stampAccount(){
  const el=document.createElement('p');
  el.className='hub-line';
  el.setAttribute('data-hub-account','');
  paintAccount(el,chipFrom(hub.link,hub.records));
  $('overlay').querySelector('h2')?.after(el);
}
const models=[];
let ghostModel;
const ghostPaint=new THREE.MeshBasicMaterial({color:'#9ef2e4',transparent:true,opacity:.28,depthWrite:false});
function syncModel(old,id,setup,ghost=false){
  const car=carById(setup.car),driver=driverById(setup.driver);
  if(old?.userData.car===car.id&&old.userData.character===driver.id)return old;
  if(old){
    if(ghost)old.traverse(mesh=>{if(mesh.isMesh)mesh.material=mesh.userData.originalPaint;});
    disposeKart(old);
  }
  const m=makeKart(id,car,driver,ghost,{flightWings:true});
  if(ghost)m.traverse(mesh=>{if(mesh.isMesh){mesh.userData.originalPaint=mesh.material;mesh.material=ghostPaint;}});
  world.add(m);return m;
}
let screen='lobby',selected='race',modal='',controllerOpen=false,muted=false,config={...DEFAULT_TEST};
try{muted=localStorage.getItem('sproto.mute')==='1';}catch{}
fx.mute(muted);
let previous=performance.now(),animation=0,w=0,h=0,accumulator=0,lastHUD=0;
let followKart=createChaseCamera(camera,track);
let wideView=false,lookingBack=false;
const lastPose=[],renderPoses=[];
let cameraRescues=0;
const poseFields=['s','x','y','yaw','pitch','roll','speed','travelYaw','steer','slipAngle','hopLift','suspension','stunRemaining','rollTime','tumble','wobble','trickTime'];
const placeSample=createTrackSample();
function setText(id,value){if($(id).textContent!==String(value))$(id).textContent=value;}
function selectMode(id){
  selected=id;const idx=MODES.findIndex(m=>m.id===id);
  document.querySelectorAll('[data-mode]').forEach(btn=>{const on=btn.dataset.mode===id;btn.classList.toggle('selected',on);btn.setAttribute('aria-pressed',on);});
  document.querySelector('.mode-section .mode-counter').textContent='0'+(idx+1)+' / 03';
  $('launch').dataset.action=MODES[idx].action.toUpperCase();
  $('launch').innerHTML='CHOOSE DRIVER '+icon('arrow');
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{selectMode(b.dataset.mode);fx.tone('click')});
function soundToggle(){muted=!muted;try{localStorage.setItem('sproto.mute',muted?'1':'0');}catch{}
  fx.unlock();fx.mute(muted);updateSound();if(!muted)fx.tone('click');}
function updateSound(){$('audio').innerHTML=icon(muted?'mute':'sound');$('audio').setAttribute('aria-label',muted?'Enable sound':'Mute sound');}
updateSound();$('audio').onclick=soundToggle;
function controller(){controllerOpen=true;openController(input,()=>{const pad=input.rawPad();navPrev=pad?padEdges(pad):[];controllerOpen=false;previous=performance.now();});}
$('controls').onclick=controller;
function showPanel(name,html){
  const pad=input.rawPad();
  navPrev=pad?padEdges(pad):[];
  pendingEdges={};pendingSlot=null;itemHold=-1;hudItemDown=false;modal=name;$('overlay').hidden=false;$('overlay').firstElementChild.innerHTML=html;
  $('overlay').querySelector('.primary,button,select')?.focus({preventScroll:true});fx.pause();
}
function closePanel(){modal='';$('overlay').hidden=true;accumulator=0;previous=performance.now();document.activeElement?.blur();}
function home(){
  garage.close();closePanel();screen='lobby';fx.pause();$('lobby').hidden=false;$('game').hidden=true;
  document.querySelector('.topbar').hidden=false;$('hero-canvas').append(renderer.domElement);w=0;h=0;
  selectMode(selected);
}
$('brand').onclick=e=>{e.preventDefault();home();};
function feedbackSnapshot(){
  const racing=screen==='game',kart=state.player?.kart;
  const sample=racing&&kart?track.sampleInto(kart.s,kart.x,placeSample):null;
  const pos=sample?.position;
  return {
    racing,screen,garage:!!garage.active,modal,circuitId:track.id,circuitName:track.name,mode:state.mode,
    elapsed:state.elapsed,lap:state.lap,sectorName:track.sections[state.sector]?.name??'',
    place:racing&&state.mode==='race'?session.position():null,rivals:Math.max(0,state.actors.length-1),
    driver:state.player?driverById(state.player.driver).name:'',car:state.player?carById(state.player.car).name:'',
    x:pos?.x??0,y:pos?.y??0,z:pos?.z??0,speedKmh:kart?(kart.reverseSpeed||kart.speed)*3.6:0,
    item:state.player?.held!=null?ITEMS[state.player.held].name:'',boost:state.player?.boost?.tier??0,
    stun:kart?.stunRemaining??0,offTrack:!!kart?.fall,done:!!state.done,countdown:state.countdown,
  };
}
let lastCrumb=null;
function noteCrumbs(){
  const snap=feedbackSnapshot();
  for(const crumb of raceBreadcrumbs(lastCrumb,snap))feedbackHandle.breadcrumb(crumb.type,crumb.data);
  lastCrumb=snap;
}
const feedbackHold=createFeedbackHold(input,{pauseAudio:()=>fx.pause()});
function renderFeedbackFrame(){
  if(screen==='lobby')paddock.render(renderer,animation,w||1,h||1);
  else{ensureTrackVisuals();renderer.render(world,camera);}
}
const feedbackHandle=installRaceFeedback({
  hold(){pendingEdges={};pendingSlot=null;return feedbackHold.hold();},
  release(token){
    feedbackHold.release(token);
    const pad=input.rawPad();
    navPrev=pad?padEdges(pad):[];
    accumulator=0;previous=performance.now();
  },
  renderNow:renderFeedbackFrame,
  snapshot:feedbackSnapshot,
  canvases:()=>renderer?.domElement?[renderer.domElement]:[],
  enabled:()=>!controllerIsOpen(),
});
function begin(mode=selected,options=config){
  ensureTrackVisuals();
  closePanel();fx.unlock();fx.mute(muted);lastCrumb=null;
  pendingEdges={};pendingSlot=null;itemHold=-1;hudItemDown=false;screen='game';$('lobby').hidden=true;$('game').hidden=false;document.querySelector('.topbar').hidden=true;
  $('race-canvas').append(renderer.domElement);w=0;h=0;accumulator=0;previous=performance.now();
  itemFx.reset();impactUntil=0;shownItemToken='';shownReserveToken='';shownSlotOrder='';$('item-impact').hidden=true;
  session.start(mode,{...options,...garage.selection()});
  for(const actor of state.actors){
    const model=models[actor.id]=syncModel(models[actor.id],actor.id,actor);
    // A checkpoint may already be in midair; don't carry the previous race's hinge pose.
    resetKartWingPose(model,actor.kart.flying);
  }
  if(mode==='trial'&&session.best)ghostModel=syncModel(ghostModel,0,session.ghostSetup,true);
  resetKartWingPose(ghostModel);
  $('drive-toolbar').hidden=mode!=='test';
  inventory.hidden=mode!=='test';
  setText('mode-tag',track.name.toUpperCase()+' · '+MODES.find(m=>m.id===mode).title.toUpperCase());
  for(const m of models)if(m)m.visible=false;
  if(state.countdown>0)fx.tone('count');
  lookingBack=false;lastPose.length=0;syncWorld(0,1);hud();timingHUD();
}
function loadSelectedCourse(){
  if(chosenCourse.id===track.id){ensureTrackVisuals();return;}
  cancelTrackMount();
  const next=createTrack(world,chosenCourse);
  track.dispose();track=next;
  play.setTrack(track);fx.setTrack(track);itemFx.setTrack(track);
  session=createSession(track,play,fx,undefined,itemFx.cue);state=session.state;
  followKart=createChaseCamera(camera,track);
  rebuildMap();config={...DEFAULT_TEST};
}
const garage=createGarage(paddock,()=>{
  loadSelectedCourse();
  if(selected==='test')testTools(true);else begin();
},hub.relics);
mountTrackSelector(chosenCourse,course=>{chosenCourse=course;});
selectMode(selected);
$('launch').onclick=()=>garage.open();
let hubLeaving=false;
function returnToHub(){
  if(hubLeaving)return;
  hubLeaving=true;
  hub.leaveForHub();
}
$('return-hub').onclick=()=>returnToHub();
const options=(arr,value)=>arr.map(([v,t])=>`<option value="${v}" ${String(v)===String(value)?'selected':''}>${t}</option>`).join('');
function testTools(first=false){
  ensureTrackVisuals();
  const c=first?config:{...session.settings,sector:state.sector,lap:state.lap,item:state.player.held};
  showPanel('tools',`<h2 id="panel-title">Test Drive</h2><p>${track.name} · Choose a repeatable start. All ${ITEMS.length} items have unlimited uses.</p>
  <label>START SECTION<select id="sector-choice">${options(track.sections.map((s,i)=>[i,String(i+1).padStart(2,'0')+' · '+s.name]),c.sector)}</select></label>
  <div class="pair"><label>ENTRY SPEED<select id="entry">${options([['standstill','Standing start'],['cruise','Cruise'],['turbo','Turbo'],['super','Super turbo']],c.speed)}</select></label>
  <label>RIVALS<select id="rivals">${options([['solo','Solo'],['ahead','One ahead'],['behind','One behind'],['alongside','One alongside'],['pack','Full pack']],c.rivals)}</select></label></div>
  <div class="pair"><label>ACTIVE ITEM<select id="test-item">${options(ITEMS.map((it,i)=>[i,it.name]),c.item)}</select></label><label>LAP STATE<select id="test-lap">${options([[1,'Lap 1'],[2,'Lap 2'],[3,track.switchTrigger?'Lap 3 · door open':'Lap 3']],c.lap)}</select></label></div>
  <p id="item-help"></p><div class="panel-actions"><button class="primary" id="apply-test">${first?'START TEST DRIVE':'RESTART WITH SETTINGS'} ${icon('arrow')}</button><button id="cancel-panel">Back</button></div>`);
  const help=()=>setText('item-help',ITEMS[Number($('test-item').value)].description);
  $('test-item').onchange=help;help();
  $('apply-test').onclick=()=>{config={sector:+$('sector-choice').value,speed:$('entry').value,rivals:$('rivals').value,item:+$('test-item').value,lap:+$('test-lap').value};begin('test',config);};
  $('cancel-panel').onclick=()=>closePanel();
}
function restartSection(){if(state.mode==='test')begin('test',{...session.settings,sector:state.sector,lap:state.lap,item:state.player.held});else begin(state.mode);}
function pause(){
  if(screen!=='game'||state.done||feedbackHold.held())return;
  showPanel('pause',`<h2 id="panel-title">Paused</h2><p>${track.name} · ${track.sections[state.sector].name}</p><div class="keys"><span><kbd>WASD / ↑↓←→</kbd> Drive</span><span><kbd>Q</kbd> Hop & drift</span><span><kbd>E</kbd> Drift boost</span><span><kbd>SPACE</kbd> Item</span><span><kbd>N N</kbd> Feedback</span>${state.player.car==='barrage'&&state.mode!=='trial'?'<span><kbd>F</kbd> Pulse blasters</span>':''}</div><p>Steer and hold drift through the hop. Press boost in the marked zone, then time the next charge. Mix up to three Goods and Perfects per slide. Each Good adds 0.8s and each Perfect adds 1.2s. Boost items add to the same timer. Kart bumps preserve boost. Rail, obstacle, and unblocked item hits cut it.</p><div class="panel-actions"><button class="primary" id="resume">RESUME ${icon('arrow')}</button>${state.mode==='test'?'<button id="panel-tools">Test tools</button>':''}<button id="retry">${state.mode==='test'?'Restart current section':'Restart race'}</button><button id="edit-pad">Controller setup</button><button id="back-home">Return to paddock</button><button id="pause-hub" type="button">Return to hub</button></div>`);
  $('resume').onclick=closePanel;$('retry').onclick=restartSection;$('edit-pad').onclick=controller;$('back-home').onclick=home;$('pause-hub').onclick=confirmHub;if($('panel-tools'))$('panel-tools').onclick=()=>testTools();
  stampAccount();
}
function confirmHub(){
  const copy=hubConfirmCopy();
  showPanel('hub-exit',`<h2 id="panel-title">${copy.title}</h2><p>${copy.body}</p><div class="panel-actions"><button class="primary" id="stay-racing" type="button">${copy.stay}</button><button id="confirm-hub" type="button">${copy.leave}</button></div>`);
  $('stay-racing').onclick=()=>pause();
  $('confirm-hub').onclick=()=>returnToHub();
  stampAccount();
}
function finish(){
  fx.tone('go');showPanel('finish',`<h2 id="panel-title">${state.mode==='trial'?'Time trial complete':'Race complete'}</h2><p class="result-time">${timeText(state.elapsed)}</p><p>${state.mode==='trial'?'Personal best · '+timeText(session.best):'Finished '+session.position()+' / '+state.actors.length+' · 3 laps'}</p><div class="panel-actions"><button class="primary" id="again">RACE AGAIN ${icon('arrow')}</button><button id="back-home">Return to paddock</button><button id="finish-hub" type="button">Return to hub</button></div>`);
  $('again').onclick=()=>begin(state.mode);$('back-home').onclick=home;$('finish-hub').onclick=()=>returnToHub();
  stampAccount();
}
$('game').addEventListener('keydown',e=>{
  if(e.code==='Space'&&!modal)e.preventDefault();
});
$('pause').onclick=pause;$('test-tools').onclick=()=>testTools();
// The item button: a tap uses the front item; with two items, holding it swaps them.
const ITEM_HOLD_SWAP=.3;
let itemHold=-1,hudItemDown=false,hudItemPressed=false;
const itemHudLive=()=>screen==='game'&&!modal&&!controllerOpen&&!state.countdown;
const itemHud=$('item-hud');
itemHud.onpointerdown=event=>{
  if(event.button!==0||!event.isPrimary||!itemHudLive())return;
  event.preventDefault();
  itemHud.setPointerCapture?.(event.pointerId);
  hudItemDown=true;hudItemPressed=true;
};
itemHud.onpointerup=itemHud.onpointercancel=itemHud.onlostpointercapture=()=>{hudItemDown=false;};
itemHud.onclick=event=>{if(event.detail===0&&itemHudLive())hudItemPressed=true;};
function itemGesture(c,dt){
  const pressed=c.itemPressed||hudItemPressed,down=c.item||hudItemDown;
  c.itemPressed=false;hudItemPressed=false;
  const a=state.player;
  if(pressed&&itemHold<0){
    // One item fires on the press itself; two wait to tell a tap from a hold.
    if(a&&!a.unlimited&&a.held!=null&&a.reserve!=null)itemHold=0;
    else pendingEdges.itemPressed=true;
  }
  if(itemHold<0)return;
  if(!down){
    if(itemHold<ITEM_HOLD_SWAP)pendingEdges.itemPressed=true;
    itemHold=-1;
  }else if((itemHold+=dt)>=ITEM_HOLD_SWAP){
    pendingEdges.itemSwapPressed=true;
    itemHold=-1;
  }
}
const boostButton=$('drift-boost');
function requestDriftBoost(){
  if(screen==='game' && !modal && !controllerOpen && !boostButton.disabled)pendingEdges.driftBoostPressed=true;
}
boostButton.onpointerdown=event=>{
  if(event.button!==0 || !event.isPrimary)return;
  event.preventDefault();
  requestDriftBoost();
};
boostButton.onclick=event=>{if(event.detail===0)requestDriftBoost();};
boostButton.onkeydown=event=>{
  if(event.key==='Enter' || event.code==='Space'){
    event.stopPropagation();
    if(event.repeat)event.preventDefault();
  }
};
$('prev-item').onclick=()=>session.select(state.player.held-1);$('next-item').onclick=()=>session.select(state.player.held+1);
const itemSignalLabels={block:'SHIELD BLOCK',hit:'ITEM HIT',pickup:'ITEM PICKUP',clear:'SHOT CLEARED'};
function paintItemSignal(signal,color){
  const el=$('item-impact');
  const label=itemSignalLabels[signal.phase];
  const item=ITEMS.findIndex(row=>row.model===cueIconType(signal.phase,signal.type));
  if(!label){
    if(signal.phase==='use'||signal.phase==='miss')$('item-hud').dataset.using=signal.phase;
    return;
  }
  const picture=$('item-impact-picture');
  picture.hidden=item<0;
  if(item>=0)picture.style.backgroundPosition=itemImagePosition(item);
  el.dataset.kind=signal.phase;
  el.style.setProperty('--item-signal','#'+color.toString(16).padStart(6,'0'));
  setText('item-impact-label',label);
  impactUntil=state.elapsed+.78;
  el.hidden=false;
}
function paintReserve(a,rolling){
 const button=$('reserve-hud');
 // Test Drive's unlimited inventory and Time Trial carry no second slot.
 button.hidden=state.mode==='trial'||!!a.unlimited;
 if(button.hidden)return;
 const shown=rolling??a.reserve;
 const slot=rolling!=null?'drawing':shown==null?'empty':'ready';
 setText('reserve-key',slot==='empty'?'2ND':slot==='drawing'?'…':'HOLD ⇄');
 button.setAttribute('aria-label',slot==='drawing'?'Drawing a second item':shown==null?'Second item slot':'Second item: '+ITEMS[shown].name+(shown===8?' ('+a.reserveCharges+' charges)':'')+'. Hold the item button to swap.');
 const token=slot+':'+(shown??'');
 if(token!==shownReserveToken){
   shownReserveToken=token;button.dataset.slot=slot;
   if(shown!=null){
     $('reserve-picture').style.backgroundPosition=itemImagePosition(shown);
     button.style.setProperty('--slot-accent',ITEMS[shown].color);
   }
 }
 // A swap exchanges the two items in place: replay the nudge on the second slot.
 const order=a.held!=null&&a.reserve!=null?a.held+'/'+a.reserve:'';
 if(order&&order!==shownSlotOrder&&order===shownSlotOrder.split('/').reverse().join('/')){
   button.classList.remove('swapped');void button.offsetWidth;button.classList.add('swapped');
 }
 shownSlotOrder=order;
}
function itemImagePosition(index){return (index%5)*25+'% '+(Math.floor(index/5)*100/3)+'%';}
const inventory=$('test-inventory');
for(const [index,item] of ITEMS.entries()){
  const button=document.createElement('button');
  const picture=document.createElement('i');picture.className='item-picture';
  picture.setAttribute('aria-hidden','true');
  picture.style.backgroundPosition=itemImagePosition(index);
  const number=document.createElement('span');number.textContent=String(index+1);
  button.append(picture,number);
  button.title=item.name+' · '+item.description;button.setAttribute('aria-label','Equip '+item.name);
  button.onclick=()=>{session.select(index);hud();};
  inventory.append(button);
}
let navPrev=[];
function lobbyButtons(){return [...document.querySelectorAll('[data-track],.mode'),$('launch'),$('return-hub'),$('controls')];}
function menuPad(){
 const pad=input.rawPad();if(!pad){navPrev=[];return;}
 const down=padEdges(pad);
 const edge=down.map((v,i)=>v&&!navPrev[i]);navPrev=down;
 if(!edge.some(Boolean)||controllerOpen)return;
 if(garage.active){
   if(edge[1])garage.back();
   else if(edge[2]||edge[3]||edge[4]||edge[5])garage.move(edge[4]||edge[2]?-1:1);
   else if(edge[6])$('garage-next').click();
   else if(edge[0])document.activeElement?.click();
 }else if(!modal&&screen==='lobby'){
   const buttons=lobbyButtons();
   const index=Math.max(0,buttons.indexOf(document.activeElement));
   const step=lobbyPadAction({edges:edge,index,count:buttons.length,role:controlRole(buttons[index])});
   if(step.type==='focus'){buttons[step.index].focus();if(buttons[step.index].dataset.mode)selectMode(buttons[step.index].dataset.mode);}
   else if(step.type==='controller')controller();
   else if(step.type==='portal')returnToHub();
   else if(step.type==='click')buttons[index].click();
   else if(step.type==='launch')$('launch').click();
 }else if(modal){
   const list=Array.from($('overlay').querySelectorAll('button,select'));
   const index=Math.max(0,list.indexOf(document.activeElement));
   const step=modalPadAction({modal,edges:edge,index,count:list.length,tagName:list[index]?.tagName||''});
   if(step.type==='home')home();
   else if(step.type==='back-to-pause')pause();
   else if(step.type==='close')closePanel();
   else if(step.type==='focus')list[step.index].focus();
   else if(step.type==='select'){const el=list[index];el.selectedIndex=(el.selectedIndex+step.direction+el.length)%el.length;el.dispatchEvent(new Event('change'));}
   else if(step.type==='click')list[index].click();
 }
}
window.addEventListener('keydown',e=>{
 if(controllerOpen)return;
 if(garage.active&&!modal){
   if(e.key==='Escape'){e.preventDefault();garage.back();}
   else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();garage.move(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1);}
   return;
 }
 if(e.key==='Tab'&&modal){
   const buttons=$('overlay').querySelectorAll('button,select');
   const first=buttons[0],last=buttons[buttons.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
 }
 const keyStep=menuKeyAction({modal,code:e.code,activeRole:document.activeElement===document.body?'body':controlRole(document.activeElement)});
 if(keyStep.type==='home'||keyStep.type==='back-to-pause'||keyStep.type==='close'){
   e.preventDefault();
   if(keyStep.type==='home')home();else if(keyStep.type==='back-to-pause')pause();else closePanel();
   input.block(true);input.block(false);
 }
 if(keyStep.type==='launch'&&screen==='lobby')$('launch').click();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&screen==='game'&&!modal&&!controllerOpen)pause();});
function placeModel(model,k,b,dt){
  const f=track.sampleInto(k.s,k.x,placeSample);
  model.visible=true;
  model.position.set(f.position.x,f.position.y,f.position.z);
  model.rotation.order='YXZ';
  model.rotation.y=Math.atan2(-f.forward.x,-f.forward.z)-(k.yaw||0);
  model.rotation.x=k.pitch??Math.atan(f.grade);
  model.rotation.z=k.roll??f.bank;
  animateKart(model,k,b,animation,dt,motion.matches);
}
function syncWorld(dt,alpha){
  let k;
  for(let i=0;i<state.actors.length;i++){
    const a=state.actors[i];
    const pose=renderPoses[a.id]??={};
    Object.assign(pose,a.kart);
    const prev=lastPose[a.id];
    if(prev && prev.rescues===pose.rescues){
      for(let j=0;j<poseFields.length;j++){
        const key=poseFields[j];
        // A new hit starts upright. Interpolate only the countdown of the active roll.
        if((key==='stunRemaining'||key==='rollTime'||key==='tumble'||key==='trickTime') && pose[key]>prev[key])continue;
        if(key==='yaw' || key==='travelYaw')pose[key]=lerpAngle(prev[key],pose[key],alpha);
        else pose[key]=THREE.MathUtils.lerp(prev[key],pose[key],alpha);
      }
    }
    placeModel(models[a.id],pose,a.boost,dt);
    if(a.isPlayer)k=pose;
  }
  const ghost=state.done?null:session.ghost();
  if(ghostModel)ghostModel.visible=!!ghost;
  if(ghost)placeModel(ghostModel,ghost,{tier:0},dt);

  followKart(k,k.rescues===cameraRescues?dt:0,wideView,lookingBack,state.player.boost.skyTier||0);
  const pk=state.player.kart;
  const boxKey=pk.flying?pk.skyLane*4+Math.min(3,Math.max(1,Math.floor(pk.s/track.length)+1)):-2;
  track.setSkyCollected?.(pk.skyLane,play.skyGot(state.player),pk.skyBoxKey===boxKey?pk.skyBoxGot:0);
  cameraRescues=k.rescues;
  updateRivalVisibility(camera,models,dt);
}
const map=$('minimap'),ctx=map.getContext('2d');
const mapBgCanvas=document.createElement('canvas');
mapBgCanvas.width=map.width;mapBgCanvas.height=map.height;
const mapBgCtx=mapBgCanvas.getContext('2d');
const mapPtScratch={x:0,z:0};
let mapScale=1,mapOriginX=0,mapOriginZ=0,mapMinX=0,mapMinZ=0;
function rebuildMap(){
  const points=track.mapPoints,xs=points.map(p=>p.x),zs=points.map(p=>p.z);
  mapMinX=Math.min(...xs);mapMinZ=Math.min(...zs);
  const dx=Math.max(...xs)-mapMinX,dz=Math.max(...zs)-mapMinZ;
  mapScale=Math.min((map.width-24)/dx,(map.height-17)/dz);
  mapOriginX=(map.width-dx*mapScale)/2;
  mapOriginZ=(map.height-dz*mapScale)/2;
  mapBgCanvas.width=map.width;mapBgCanvas.height=map.height;
  mapBgCtx.clearRect(0,0,map.width,map.height);
  mapBgCtx.strokeStyle='#80968e';mapBgCtx.lineWidth=3;mapBgCtx.lineJoin='round';
  mapBgCtx.beginPath();
  for(let i=0;i<points.length;i++){
    const p=points[i];
    const x=mapOriginX+(p.x-mapMinX)*mapScale,y=mapOriginZ+(p.z-mapMinZ)*mapScale;
    if(i)mapBgCtx.lineTo(x,y);else mapBgCtx.moveTo(x,y);
  }
  mapBgCtx.closePath();mapBgCtx.stroke();
  // Sky Lanes: dashed over the route, cyan for the main lane, lime for a Sky Gate.
  mapBgCtx.lineWidth=2;mapBgCtx.setLineDash([4,3]);
  for(const lane of track.sky?.lanes??[]){
    mapBgCtx.strokeStyle=lane.optional?'#ddff53':'#6ff6ff';
    mapBgCtx.beginPath();
    for(let s=lane.start,i=0;s<=lane.end;s+=20,i++){
      track.mapXYAt(s,mapPtScratch);
      const x=mapOriginX+(mapPtScratch.x-mapMinX)*mapScale,y=mapOriginZ+(mapPtScratch.z-mapMinZ)*mapScale;
      if(i)mapBgCtx.lineTo(x,y);else mapBgCtx.moveTo(x,y);
    }
    mapBgCtx.stroke();
  }
  mapBgCtx.setLineDash([]);
}
rebuildMap();
function timingHUD(){
 const {kart:k,boost:b}=state.player;
 const pips=$('pips');
 if(pips.getAttribute('aria-valuenow')!==String(b.pips)){
   pips.setAttribute('aria-valuenow',String(b.pips));
   for(let i=0;i<pips.children.length;i++)pips.children[i].classList.toggle('filled',i<b.pips);
 }
 const charging=k.sliding && k.driftWasHeld && !b.chainClosed && !state.done;
 const ready=charging && driftBoostReady(b);
 boostButton.disabled=!charging;
 boostButton.classList.toggle('ready',ready);
 setText('meter-label',state.countdown?'LAUNCH':ready && b.meter+1e-9>=PERFECT_CHARGE?'PERFECT':ready?'READY':k.sliding?'DRIFT':b.tier===2?'SUPER TURBO':b.tier?'TURBO':'DRIFT');
 $('meterfill').style.width=((state.countdown?b.rev:b.meter)*100)+'%';
 $('reservefill').style.width=(100*b.reserve/Math.max(5,b.reservePeak))+'%';
 setText('reserve-time',b.reserve>0?(Math.ceil(b.reserve*10)/10).toFixed(1)+'s':'');
}
let finalLapAt=-1,flightStartedAt=-1,lastCue={flying:false,cells:0,tier:0,notice:'',lap:1,place:0,placeAt:-9};
// Sounds and timed banners from what changed for the player since the last frame.
function raceCues(){
 const a=state.player,k=a.kart,b=a.boost;
 if(state.elapsed<lastCue.at){
   lastCue={flying:false,cells:0,tier:0,notice:'',lap:state.lap,place:0,placeAt:-9};
   finalLapAt=-1;flightStartedAt=-1;
 }
 lastCue.at=state.elapsed;
 if(k.flying&&!lastCue.flying){flightStartedAt=state.elapsed;fx.tone('launch');}
 if(k.flying&&b.skyCells>lastCue.cells)fx.tone(b.feedback.startsWith('MEGA')?'mega':'cell',1+Math.min(10,b.skyChain)*.06);
 if(k.flying&&b.skyTier>lastCue.tier)fx.tone('tier',1+b.skyTier*.18);
 const fresh=a.noticeTime>1.2&&a.notice!==lastCue.notice;
 if(fresh&&(a.notice==='CRASH'||a.notice==='RAMMED'))fx.tone('crash');
 if(state.lap===3&&lastCue.lap<3&&state.mode!=='test'){finalLapAt=state.elapsed;fx.tone('final');
   const plate=document.querySelector('.clockplate');plate.classList.remove('pulse');void plate.offsetWidth;plate.classList.add('pulse');}
 if(state.mode==='race'&&state.countdown===0){
   const place=session.position();
   if(lastCue.place&&place!==lastCue.place){
     const pop=$('position-pop');pop.textContent=(place<lastCue.place?'▲ P':'▼ P')+place;
     pop.className='show '+(place<lastCue.place?'up':'down');lastCue.placeAt=state.elapsed;
   }
   lastCue.place=place;
 }
 if(state.elapsed-lastCue.placeAt>1.4)$('position-pop').classList.remove('show');
 Object.assign(lastCue,{flying:k.flying,cells:k.flying?b.skyCells:0,tier:k.flying?b.skyTier:0,notice:a.notice,lap:state.lap});
}
function skyHUD(){
 const a=state.player,k=a.kart,b=a.boost,panel=$('sky-hud');
 panel.hidden=!k.flying;
 // Speed lines build from air base speed up to the 2.2× ceiling; the reduce
 // setting keeps them faint and still.
 const lines=$('speed-lines'),calm=!!input.settings.reduceSpeedLines;
 const rush=k.flying?Math.min(1,Math.max(0,(k.speed-80)/45)):0;
 const opacity=(k.flying?.18+.62*rush:0)*(calm?.3:1);
 if(Math.abs((+lines.dataset.o||0)-opacity)>.02){lines.style.opacity=opacity.toFixed(2);lines.dataset.o=opacity.toFixed(2);}
 lines.classList.toggle('reduced',calm);
 if(!k.flying)return;
 const lane=track.sky.lanes[k.skyLane];
 panel.dataset.tier=String(b.skyTier);
 setText('sky-chain','×'+b.skyChain);
 setText('sky-tier','TIER '+b.skyTier+' · '+[1.6,1.8,2,2.2][b.skyTier].toFixed(1)+'×');
 $('sky-timer-fill').style.width=(100*Math.max(0,b.skyTimer)/2.5)+'%';
 const layout=lane.layouts[lapOf(k.s,track.length)-1];
 const local=k.s-Math.floor(k.s/track.length)*track.length;
 const cell=nextCell(layout,play.skyGot(a),local,160);
 const arrow=$('sky-arrow');
 arrow.toggleAttribute('data-none',!cell);
 arrow.toggleAttribute('data-mega',!!cell?.mega);
 if(cell){
   const dx=cell.x-k.x,dy=cell.y-k.skyY;
   const angle=Math.hypot(dx,dy)<1.5?0:Math.atan2(dx,dy);
   arrow.firstElementChild.style.transform='rotate('+angle.toFixed(3)+'rad)';
 }
 const top=laneCeiling(lane,k.s,track.length);
 $('sky-alt-tick').style.bottom=(100*Math.min(1,Math.max(0,(k.skyY-lane.floor)/Math.max(1,top-lane.floor))))+'%';
}
function hud(){
 const a=state.player,k=a.kart,b=a.boost;
 const binding=input.settings.bindings.driftBoost;
 setText('boost-key',input.deviceName==='Keyboard'?'E':binding==='none'?'':bindingName(binding));
 setText('position',state.mode==='race'?session.position()+' / '+state.actors.length:state.mode==='trial'?'GHOST':'∞ ITEMS');
 setText('lap','LAP '+state.lap+' / 3');setText('clock',timeText(state.elapsed));
 setText('sector-read',String(state.sector+1).padStart(2,'0')+' / '+track.sections[state.sector].name.toUpperCase());
 setText('speed',Math.round((k.reverseSpeed||k.speed)*3.6));
 const incoming=a.incoming||'';
 setText('incoming-warning',incoming);$('incoming-warning').hidden=!incoming;
 const notice=a.noticeTime>0&&!a.notice.endsWith(' INCOMING')?a.notice:'';
 const grade=b.feedbackTime>0?b.feedback:'';
 // The first seconds of each flight teach the Sky Lane controls.
 const skyTip=k.flying&&state.elapsed-flightStartedAt<2.6&&!notice&&!grade?(input.deviceName==='Keyboard'?'W DIVE · S CLIMB · Q CARVE · Q+A/D ROLL':'STICK PITCH · DRIFT CARVE · DRIFT+STEER ROLL'):'';
 const feedback=k.fall?['OFF TRACK']:[notice,k.stunRemaining>0?'STUNNED':k.tumble>0?'TUMBLE':grade,skyTip].filter(Boolean);
 setText('feedback',feedback.join('\n')||(state.splitUntil>state.elapsed?state.split:''));
 const finalLap=state.mode!=='test'&&finalLapAt>=0&&state.elapsed-finalLapAt<2.4&&!state.done;
 $('announce').classList.toggle('final-lap',finalLap);
 setText('announce',state.countdown?Math.ceil(state.countdown):state.elapsed<.7&&state.mode!=='test'?'GO!':finalLap?'FINAL LAP':'');
 // The roulette fills the front slot when it is empty, otherwise the second slot.
 const rolling=a.roulette?pickupPreview(a.roulette,state.elapsed):null;
 const frontRolling=!!a.roulette&&a.held==null;
 const shownItem=frontRolling?rolling:a.held;
 const itemButton=$('item-hud');
 itemButton.disabled=a.held==null;
 itemButton.title=frontRolling?'Drawing an item':a.held==null?'Empty item slot':'Use '+ITEMS[a.held].name+(a.reserve!=null&&!a.unlimited?' · hold to swap':'');
 setText('item-name',frontRolling?'Drawing…':a.held!=null?ITEMS[a.held].name:'EMPTY');
 const art=$('held-picture');art.hidden=shownItem==null;
 const slotState=frontRolling?'drawing':shownItem==null?'empty':'ready';
 const token=slotState+':'+(shownItem??'');
 if(token!==shownItemToken){
   shownItemToken=token;itemButton.dataset.slot=slotState;
   if(shownItem!=null){
     art.style.backgroundPosition=itemImagePosition(shownItem);
     itemButton.style.setProperty('--slot-accent',ITEMS[shownItem].color);
   }
 }
 if(!a.noticeTime&&itemButton.dataset.using)delete itemButton.dataset.using;
 $('item-impact').hidden=state.elapsed>=impactUntil;
 paintReserve(a,a.roulette&&!frontRolling?rolling:null);
 setText('item-key',frontRolling?'ITEM ROULETTE':state.mode==='test'?'UNLIMITED  ∞':'ITEM');
 if(state.mode==='test'){
   for(let i=0;i<inventory.children.length;i++)inventory.children[i].setAttribute('aria-pressed',String(i===a.held));
   const switchKey=input.deviceName==='Keyboard'?'X / I':bindingName(input.settings.bindings.next);
   setText('item-cycle',(a.held===8?a.charges+' CHARGES · ':'')+switchKey+' · NEXT');
 }else setText('item-cycle',a.held===8?a.charges+' CHARGES':'');
 $('item-hud').hidden=state.mode==='trial';
 ctx.clearRect(0,0,map.width,map.height);
 ctx.drawImage(mapBgCanvas,0,0);
 for(let i=state.actors.length-1;i>=0;i--){
   const actor=state.actors[i];
   track.mapXYAt(actor.kart.s,mapPtScratch);
   const x=mapOriginX+(mapPtScratch.x-mapMinX)*mapScale,y=mapOriginZ+(mapPtScratch.z-mapMinZ)*mapScale;
   ctx.beginPath();ctx.fillStyle=actor.isPlayer?'#d5ee7a':'#ff7853';ctx.arc(x,y,actor.isPlayer?4.8:2.7,0,Math.PI*2);ctx.fill();
 }
}
const edgeFlags=['driftPressed','driftReleased','driftBoostPressed','itemPressed','itemSwapPressed','blastersPressed','prevPressed','nextPressed'];
const tickInputScratch={};
let pendingEdges={},pendingSlot=null;
function frame(now){
 const rawDt=Math.max(0,(now-previous)/1000);
 const dt=Math.min(.1,rawDt);previous=now;animation+=dt;
 const host=screen==='lobby'?$('hero-canvas'):$('race-canvas');const W=host.clientWidth,H=host.clientHeight;
 if(W&&H&&(W!==w||H!==h)){w=W;h=H;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
 if(feedbackHold.held()){accumulator=0;requestAnimationFrame(frame);return;}
 const c=input.poll();
 if(controllerOpen){menuPad();requestAnimationFrame(frame);return;}
 if(screen==='lobby'){
   menuPad();paddock.render(renderer,animation,w,h);
   perf.recordFrame(rawDt*1000,renderer,now);
   const label=input.gamepadName?'GAMEPAD CONNECTED':'KEYBOARD';
   if($('device-info').lastElementChild.textContent!==label)$('device-info').innerHTML=icon(input.gamepadName?'pad':'keyboard')+'<span>'+label+'</span>';
   const bindings=input.settings.bindings;
   const hints=input.gamepadName
     ? [[bindingName(bindings.throttle),'Drive'],[bindingName(bindings.drift),'Drift'],[bindingName(bindings.driftBoost),'Boost'],[bindingName(bindings.item),'Item']]
     : [['WASD','Drive'],['Q','Drift'],['E','Boost'],['SPACE','Item']];
   const key=hints.map(([k,v])=>k+v).join('|');
   if($('driving-keys').dataset.key!==key){$('driving-keys').dataset.key=key;$('driving-keys').innerHTML=hints.map(([k,v])=>'<kbd>'+k+'</kbd> '+v).join(' ');}
 }else if(modal){
   if(modal==='hub-exit'&&c.pausePressed)pause();
   else if(modal==='pause'&&c.pausePressed)closePanel();
   else menuPad();
 }
 else if(c.pausePressed){pause();}
 else if(c.resetPressed){restartSection();}
 else{
   if(c.distancePressed)wideView=!wideView;
   if(c.mapPressed)$('minimap').hidden=!$('minimap').hidden;
   lookingBack=c.lookBack;
   itemGesture(c,dt);
   // Preserve button edges between render frames, including on high-refresh screens.
   for(let i=0;i<edgeFlags.length;i++){const key=edgeFlags[i];if(c[key])pendingEdges[key]=true;}
   if(c.slot!=null)pendingSlot=c.slot;
   accumulator+=dt;
   while(accumulator>=1/60&&!state.done){
     for(let i=0;i<state.actors.length;i++){
       const a=state.actors[i];
       const pose=lastPose[a.id]??={};
       pose.rescues=a.kart.rescues;
       for(let j=0;j<poseFields.length;j++){const key=poseFields[j];pose[key]=a.kart[key];}
     }
     Object.assign(tickInputScratch,c);
     for(let i=0;i<edgeFlags.length;i++){const key=edgeFlags[i];tickInputScratch[key]=!!pendingEdges[key];}
     tickInputScratch.slot=pendingSlot;
     perf.beginSim();
     session.tick(tickInputScratch,1/60);
     perf.endSim();
     for(let i=0;i<edgeFlags.length;i++)pendingEdges[edgeFlags[i]]=false;
     pendingSlot=null;accumulator-=1/60;
   }
   fx.update(dt,state.actors,true,state.countdown>0);syncWorld(dt,Math.min(1,accumulator*60));
   itemFx.update(dt,camera);timingHUD();raceCues();skyHUD();
   if(now-lastHUD>45){hud();lastHUD=now;}
   renderer.render(world,camera);
   perf.recordFrame(rawDt*1000,renderer,now);
   noteCrumbs();
   if(state.done){hud();finish();}
 }
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

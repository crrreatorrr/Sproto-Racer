import * as THREE from 'three';
import './style.css';
import {mountUI,MODES} from './ui.js';
import {icon} from './icons.js';
import {createInput,bindingName} from './input.js';
import {driftGrade,meterBands} from './boost.js';
import {controllerIsOpen,openController} from './controller.js';
import {attachFeedbackSdk,createFeedbackHold,installRaceFeedback,raceBreadcrumbs} from './feedback.js';
import {createPaddock} from './paddock.js';
import {createCircuitLighting} from './circuit-lighting.js';
import {updateRivalVisibility} from './kart-visibility.js';
import {warmRaceShaders} from './shader-warmup.js';
import {makeKart,animateKart,disposeKart,resetKartWingPose,updateKartDetail,forceKartDetail} from './kart-art.js';
import {createGarage} from './garage.js';
import {carById,driverById} from './roster.js';
import {createChaseCamera} from './chase-camera.js';
import {mountTrackSelector,savedCourse} from './track-selector.js';
import {createTrack} from './track.js';
import {CIRCUIT_ATMOSPHERE} from './circuit-skyline.js';
import {createGameplay,ITEMS} from './gameplay.js';
import {pickupPreview} from './items.js';
import {createItemFx,cueIconType} from './item-fx.js';
import {createRaceFX} from './race-fx.js';
import {createSession,DEFAULT_TEST,SPLIT_SHOWN,splitText,timeText} from './session.js';
import {createCuePlayer,cueEvent} from './race-cues.js';
import {onlineSwitch} from './online-switch.js';
import {createPerfMonitor} from './perf.js';
import {TIERS,TIER_IDS,basePixelRatio,createResolutionScaler,loadTier,minScaleFor,saveTier,tierFor} from './quality.js';
import {saveMuted,soundLabel,startMuted} from './sound-pref.js';
import {lerpAngle} from './sim/math.js';
import {laneCeiling,lapOf,nextCell} from './sim/sky.js';
import {createTrackSample} from './sim/track-core.js';
import {createSimWorld} from './sim/world.js';
import {bootHub} from './hub/boot.js';
import {chipFrom,paintAccount} from './hub/account.js';
import {paintRelics} from './hub/relics.js';
import {controlRole,hubConfirmCopy,lobbyPadAction,menuKeyAction,modalPadAction,padEdges} from './hub/portal.js';

mountUI();
const $=id=>document.getElementById(id);
const input=createInput();
const perf=createPerfMonitor();
// Graphics tier: the ?quality= override, then the saved choice, then Auto.
let storage=null;
try{storage=window.localStorage;}catch{}
let gfx=loadTier(storage,location.search);
// Antialiasing is a WebGL context attribute, so a tier change reaches it on the next page load.
const bootAntialias=gfx.antialias;
const scaler=createResolutionScaler();
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:bootAntialias,alpha:false,powerPreference:'high-performance'});}
catch(error){$('hero-canvas').innerHTML='<div class="unavailable">WebGL 2 is unavailable. Enable hardware acceleration in your browser and reload.</div>';$('launch').disabled=true;throw error;}
// The frame loop keeps these current: the screen's ratio is re-read every frame, and during a race
// the scaler lowers the pixel ratio when frames run slow.
let seenDpr=0,seenArea=0,pixelRatio=basePixelRatio(gfx,window.devicePixelRatio),debugFrameMs=0;
renderer.setPixelRatio(pixelRatio);perf.noteQuality(gfx.id,pixelRatio,1);
function setGraphics(id){
  gfx=tierFor(id);saveTier(storage,gfx.id);
  scaler.reset();seenDpr=0;seenArea=0;
}
if(perf.enabled)window.__sprotoQuality={
  // Test hook, ?perf=1 only: feed the scaler this frame time instead of the real one (0 = real).
  simulateFrameMs(ms){debugFrameMs=ms>0?ms:0;},
  state:()=>({tier:gfx.id,pixelRatio,scale:scaler.scale,level:scaler.level,levels:scaler.levels,changes:scaler.changes,holding:scaler.holding,budgetMs:scaler.budget,
    canvas:[renderer.domElement.width,renderer.domElement.height],antialias:renderer.getContextAttributes().antialias}),
};
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
$('hero-canvas').append(renderer.domElement);
const paddock=createPaddock();
const world=new THREE.Scene();
// Like antialiasing, the shadow map is set up once: the Low tier (or ?shadows=off) starts without it.
const sceneLight=createCircuitLighting(world,renderer,{enabled:gfx.shadows&&new URLSearchParams(location.search).get('shadows')!=='off'});
function setCircuitAtmosphere(course){
  const look=CIRCUIT_ATMOSPHERE[course.id]??CIRCUIT_ATMOSPHERE.track01;
  world.background=new THREE.Color(look.background);
  world.fog=new THREE.FogExp2(look.fog,look.density);
  sceneLight.atmosphere(course.id);
}
const camera=new THREE.PerspectiveCamera(62,1,.15,6500);
let chosenCourse=savedCourse();
setCircuitAtmosphere(chosenCourse);
// Defer heavy circuit mesh/atlas build until after the first lobby frame paints.
let track=createTrack(world,chosenCourse,{deferVisuals:true});track.setVisualsPerFrame(true);
let trackMountJob=null;
function cancelTrackMount(){
  if(trackMountJob===null)return;
  if(typeof cancelIdleCallback==='function')cancelIdleCallback(trackMountJob);
  else clearTimeout(trackMountJob);
  trackMountJob=null;
}
function scheduleTrackMount(targetTrack){
  cancelTrackMount();
  const mount=()=>{trackMountJob=null;if(targetTrack===track){targetTrack.mountVisuals();sceneLight.prepareTrack(targetTrack.trackGroup);}};
  trackMountJob=typeof requestIdleCallback==='function'?requestIdleCallback(mount,{timeout:400}):setTimeout(mount,32);
}
function ensureTrackVisuals(){
  cancelTrackMount();
  track.mountVisuals();
  sceneLight.prepareTrack(track.trackGroup);
}
scheduleTrackMount(track);

const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
let impactUntil=0,shownItemToken='',shownReserveToken='',shownSlotOrder='';
const itemFx=createItemFx(world,track,{reduced:motion.matches,onSignal:paintItemSignal});
// Item effects the simulation reports as it runs. Single player shows them at once. An
// online race re-runs old ticks when it corrects itself, so there they go through the
// runner, which shows each one once and says when one has to be taken back.
function coreCue(cue){if(online)runner.noteEvent(cueEvent(cue));else itemFx.cue(cue);}
const play=createGameplay(world,track,{onVisualCue:coreCue,replaying:()=>keepItemMeshes&&runner.resimulating}),fx=createRaceFX(world,track);
const hub=bootHub();
let session=createSession(track,play,fx,undefined,itemFx.cue),state=session.state;
// The race on screen, driven through the RaceRunner interface (src/race-runner.js): single
// player's runner, or an online one. `player` is the kart this player drives and `view`
// its lap, sector and place; neither is tied to seat 0.
let runner=session.runner,player=null,view=null;
// The online test race behind the ?online= development switch, or null (src/online-dev.js).
let online=null;
const onlineDev=import.meta.env.DEV?onlineSwitch(location.search,true):null;
// Item meshes are kept through a correction. Only a measurement run turns that off.
const keepItemMeshes=!onlineDev||onlineDev.reuseItemMeshes;
// Written so a production build drops the import, and with it the in-page match.
const loadOnlineDev=import.meta.env.DEV?()=>import('./online-dev.js'):null;
// Test hook for the measuring harness: the development server with ?perf=1 only. A production
// build drops it, so the live race is not reachable from the console where records are saved.
if(import.meta.env.DEV&&perf.enabled)window.__sprotoRace={get runner(){return runner;},get online(){return online;},get play(){return play;}};
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
function syncModel(old,id,setup,{ghost=false,local=false}={}){
  const car=carById(setup.car),driver=driverById(setup.driver);
  // Only rivals carry the cheaper distant build, and only the player's kart its own extras.
  const mine=ghost||local,lowDetail=!mine;
  if(old?.userData.car===car.id&&old.userData.character===driver.id&&old.userData.player===mine&&!!old.userData.low===lowDetail)return old;
  if(old){
    if(ghost)old.traverse(mesh=>{if(mesh.isMesh)mesh.material=mesh.userData.originalPaint;});
    disposeKart(old);
  }
  // Rivals carry a cheaper build for when they are far from the camera (kart-lod.js).
  const m=makeKart(id,car,driver,ghost,{flightWings:true,lowDetail,player:mine});
  if(ghost)m.traverse(mesh=>{if(mesh.isMesh){mesh.userData.originalPaint=mesh.material;mesh.material=ghostPaint;}});
  sceneLight.prepareKart(m,ghost);
  world.add(m);
  // Compile both builds' shaders now, while the race loads, not at the first switch.
  if(m.userData.low)renderer.compile(m,camera,world);
  return m;
}
// ?kartlod=low or ?kartlod=full pins every rival to one build, for side-by-side checks.
forceKartDetail(new URLSearchParams(location.search).get('kartlod'));
let screen='lobby',selected='race',modal='',controllerOpen=false,config={...DEFAULT_TEST};
// ?mute=1 starts this visit muted; a test server (npm run dev:muted) always starts muted.
let muted=startMuted(storage,location.search,import.meta.env.VITE_START_MUTED==='1');
fx.mute(muted);
let previous=performance.now(),animation=0,w=0,h=0,lastHUD=0;
let followKart=createChaseCamera(camera,track);
let wideView=false,lookingBack=false;
const renderPoses=[];
let cameraRescues=0;
const poseFields=['s','x','y','yaw','pitch','roll','speed','travelYaw','steer','slipAngle','hopLift','suspension','stunRemaining','rollTime','tumble','wobble','trickTime'];
const placeSample=createTrackSample();
function setText(id,value){if($(id).textContent!==String(value))$(id).textContent=value;}
// The HUD repaints many times a second; touch the page only when a value is new.
function setAttr(el,name,value){if(el.getAttribute(name)!==value)el.setAttribute(name,value);}
function setHidden(el,hidden){if(el.hidden!==hidden)el.hidden=hidden;}
function selectMode(id){
  selected=id;const idx=MODES.findIndex(m=>m.id===id);
  document.querySelectorAll('[data-mode]').forEach(btn=>{const on=btn.dataset.mode===id;btn.classList.toggle('selected',on);btn.setAttribute('aria-pressed',on);});
  document.querySelector('.mode-section .mode-counter').textContent='0'+(idx+1)+' / 03';
  $('launch').dataset.action=MODES[idx].action.toUpperCase();
  $('launch').innerHTML='CHOOSE DRIVER '+icon('arrow');
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{selectMode(b.dataset.mode);fx.tone('click')});
function soundToggle(){muted=!muted;saveMuted(storage,muted);
  fx.unlock();fx.mute(muted);updateSound();if(!muted)fx.tone('click');}
// The paddock's speaker button and the pause panel's Sound button show the same choice.
function updateSound(){$('audio').innerHTML=icon(muted?'mute':'sound');$('audio').setAttribute('aria-label',muted?'Enable sound':'Mute sound');
  const inPause=$('pause-sound');if(inPause){inPause.textContent=soundLabel(muted);inPause.setAttribute('aria-pressed',String(!muted));}}
updateSound();$('audio').onclick=soundToggle;
function controller(){controllerOpen=true;openController(input,()=>{const pad=input.rawPad();navPrev=pad?padEdges(pad):[];controllerOpen=false;previous=performance.now();});}
$('controls').onclick=controller;
function showPanel(name,html){
  const pad=input.rawPad();
  navPrev=pad?padEdges(pad):[];
  pendingEdges={};pendingSlot=null;itemHold=-1;hudItemDown=false;modal=name;$('overlay').hidden=false;$('overlay').firstElementChild.innerHTML=html;
  $('overlay').querySelector('.primary,button,select')?.focus({preventScroll:true});fx.pause();
}
function closePanel(){
  const closed=modal;
  modal='';$('overlay').hidden=true;previous=performance.now();document.activeElement?.blur();
  // Backing out of the online lobby before the race is set up leaves the match.
  if(closed==='online-lobby'&&online&&!runner.world)leaveOnline();
}
function home(){
  leaveOnline();
  garage.close();closePanel();screen='lobby';fx.pause();$('lobby').hidden=false;$('game').hidden=true;
  document.querySelector('.topbar').hidden=false;$('hero-canvas').append(renderer.domElement);w=0;h=0;
  selectMode(selected);
}
$('brand').onclick=e=>{e.preventDefault();home();};
function feedbackSnapshot(){
  const racing=screen==='game',kart=player?.kart;
  const sample=racing&&kart?track.sampleInto(kart.s,kart.x,placeSample):null;
  const pos=sample?.position;
  return {
    racing,screen,garage:!!garage.active,modal,circuitId:track.id,circuitName:track.name,mode:state.mode,
    elapsed:state.elapsed,lap:view?.lap??1,sectorName:track.sections[view?.sector??0]?.name??'',
    place:racing&&state.mode==='race'?view.position:null,rivals:Math.max(0,state.actors.length-1),
    driver:player?driverById(player.driver).name:'',car:player?carById(player.car).name:'',
    x:pos?.x??0,y:pos?.y??0,z:pos?.z??0,speedKmh:kart?(kart.reverseSpeed||kart.speed)*3.6:0,
    item:player?.held!=null?ITEMS[player.held].name:'',boost:player?.boost?.tier??0,
    stun:kart?.stunRemaining??0,offTrack:!!kart?.fall,done:!!state.done,countdown:state.countdown,
  };
}
// The four things a breadcrumb can come from, compared every frame. The full snapshot
// (25 fields and a track sample) is built only on the frame one of them changes.
const crumbWatch={live:false,lap:1,done:false,offTrack:false,stunned:false};
function noteCrumbs(){
  const kart=player?.kart,w=crumbWatch;
  const lap=view?.lap??1,done=!!state.done,offTrack=!!kart?.fall,stunned=(kart?.stunRemaining??0)>0;
  if(w.live&&(lap>w.lap||(done&&!w.done)||(offTrack&&!w.offTrack)||(stunned&&!w.stunned))){
    const before={racing:true,lap:w.lap,done:w.done,offTrack:w.offTrack,stun:w.stunned?1:0};
    for(const crumb of raceBreadcrumbs(before,feedbackSnapshot()))feedbackHandle.breadcrumb(crumb.type,crumb.data);
  }
  w.live=true;w.lap=lap;w.done=done;w.offTrack=offTrack;w.stunned=stunned;
}
const feedbackHold=createFeedbackHold(input,{pauseAudio:()=>fx.pause()});
function renderFeedbackFrame(){
  if(screen==='lobby')paddock.render(renderer,animation,w||1,h||1);
  else{ensureTrackVisuals();track.drawVisuals();sceneLight.focus(track,player?.kart,animation,true);renderer.render(world,camera);}
}
const feedbackHandle=installRaceFeedback({
  hold(){pendingEdges={};pendingSlot=null;return feedbackHold.hold();},
  release(token){
    feedbackHold.release(token);
    const pad=input.rawPad();
    navPrev=pad?padEdges(pad):[];
    previous=performance.now();
  },
  renderNow:renderFeedbackFrame,
  snapshot:feedbackSnapshot,
  canvases:()=>renderer?.domElement?[renderer.domElement]:[],
  enabled:()=>!controllerIsOpen(),
});
function begin(mode=selected,options=config){
  ensureTrackVisuals();
  leaveOnline();
  showRaceScreen();
  runner=session.runner;
  session.start(mode,{...options,...garage.selection()});
  if(mode==='trial'&&session.best)ghostModel=syncModel(ghostModel,0,session.ghostSetup,{ghost:true});
  if(session.state.countdown>0)fx.tone('count');
  raceReady(MODES.find(m=>m.id===mode).title);
}
// Switches the page from the paddock to the race view. The race itself is started next.
function showRaceScreen(){
  closePanel();fx.unlock();fx.mute(muted);crumbWatch.live=false;
  pendingEdges={};pendingSlot=null;itemHold=-1;hudItemDown=false;screen='game';$('lobby').hidden=true;$('game').hidden=false;document.querySelector('.topbar').hidden=true;
  $('race-canvas').append(renderer.domElement);w=0;h=0;previous=performance.now();
  itemFx.reset();impactUntil=0;impactToken=-1;shownItemToken='';shownReserveToken='';shownSlotOrder='';$('item-impact').hidden=true;
}
// Builds what is drawn for the race `runner` has just set up: single player or online.
function raceReady(title){
  state=runner.world.state;player=runner.localActor;view=runner.hud();
  const mode=state.mode,seat=runner.localSeat;
  for(const actor of state.actors){
    const model=models[actor.id]=syncModel(models[actor.id],actor.id,actor,{local:actor.id===seat});
    // A checkpoint may already be in midair; don't carry the previous race's hinge pose.
    resetKartWingPose(model,actor.kart.flying);
  }
  resetKartWingPose(ghostModel);
  $('drive-toolbar').hidden=mode!=='test';
  inventory.hidden=mode!=='test';
  setText('mode-tag',track.name.toUpperCase()+' · '+title.toUpperCase());
  for(const m of models)if(m)m.visible=false;
  if(ghostModel)ghostModel.visible=false;
  lookingBack=false;syncWorld(0);hud();timingHUD();
  // Compile every shader the race can need now, so none of them stalls a frame mid-race.
  const karts=state.actors.map(a=>models[a.id]);
  warmRaceShaders(renderer,world,camera,{built:[track,ghostModel,...karts],rivals:karts.filter((_,i)=>i!==seat),play,itemFx});
}
function loadSelectedCourse(){
  if(chosenCourse.id===track.id){ensureTrackVisuals();return;}
  cancelTrackMount();
  const next=createTrack(world,chosenCourse);
  next.setVisualsPerFrame(true);
  track.dispose();track=next;
  sceneLight.prepareTrack(next.trackGroup);
  setCircuitAtmosphere(chosenCourse);
  play.setTrack(track);fx.setTrack(track);itemFx.setTrack(track);
  session=createSession(track,play,fx,undefined,itemFx.cue);state=session.state;
  runner=session.runner;player=null;view=null;
  followKart=createChaseCamera(camera,track);
  rebuildMap();config={...DEFAULT_TEST};
}
const garage=createGarage(paddock,()=>{
  loadSelectedCourse();
  if(selected==='test')testTools(true);
  else if(onlineDev&&selected==='race')openOnline();
  else begin();
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
  const c=first?config:{...session.settings,sector:view.sector,lap:view.lap,item:player.held};
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
// The Graphics choice, shared by the pause panel and the paddock's Graphics panel.
const graphicsField=()=>`<label>GRAPHICS<select id="graphics-choice">${options(TIER_IDS.map(id=>[id,TIERS[id].label]),gfx.id)}</select></label><p class="subtle" id="graphics-help" aria-live="polite"></p>`;
function bindGraphics(){
  const paint=()=>{
    const waits=gfx.antialias!==bootAntialias;
    setText('graphics-help',gfx.blurb+(waits?' Edge smoothing turns '+(gfx.antialias?'on':'off')+' the next time the page loads.':''));
    if($('graphics-reload'))$('graphics-reload').hidden=!waits;
  };
  $('graphics-choice').onchange=event=>{setGraphics(event.target.value);paint();fx.tone('click');};
  paint();
}
function graphicsPanel(){
  showPanel('graphics',`<h2 id="panel-title">Graphics</h2><p>Lower settings trade sharpness for a smoother frame rate. Resolution changes straight away.</p>${graphicsField()}<div class="panel-actions"><button class="primary" id="graphics-done">DONE ${icon('arrow')}</button><button id="graphics-reload" hidden>Reload now to apply</button></div>`);
  bindGraphics();
  $('graphics-done').onclick=closePanel;
  $('graphics-reload').onclick=()=>{const url=new URL(location.href);url.searchParams.delete('quality');location.replace(url);};
}
$('graphics').onclick=graphicsPanel;
function restartSection(){
  if(online)return;
  if(state.mode==='test')begin('test',{...session.settings,sector:view.sector,lap:view.lap,item:player.held});else begin(state.mode);
}
function pause(){
  if(screen!=='game'||state.done||feedbackHold.held())return;
  if(online){onlineMenu();return;}
  showPanel('pause',`<h2 id="panel-title">Paused</h2><p>${track.name} · ${track.sections[view.sector].name}</p><div class="keys"><span><kbd>WASD / ↑↓←→</kbd> Drive</span><span><kbd>Q</kbd> Hop & drift</span><span><kbd>E</kbd> Drift boost</span><span><kbd>SPACE</kbd> Item</span><span><kbd>N N</kbd> Feedback</span>${player.car==='barrage'&&state.mode!=='trial'?'<span><kbd>F</kbd> Pulse blasters</span>':''}</div><p>Steer and hold drift through the hop. Press boost in the marked zone, then time the next charge. Mix up to three Goods and Perfects per slide. Each Good adds 0.8s and each Perfect adds 1.2s. Boost items add to the same timer. Kart bumps preserve boost. Rail, obstacle, and unblocked item hits cut it.</p>${graphicsField()}<div class="panel-actions"><button class="primary" id="resume">RESUME ${icon('arrow')}</button>${state.mode==='test'?'<button id="panel-tools">Test tools</button>':''}<button id="retry">${state.mode==='test'?'Restart current section':'Restart race'}</button><button id="edit-pad">Controller setup</button><button id="pause-sound" type="button"></button><button id="back-home">Return to paddock</button><button id="pause-hub" type="button">Return to hub</button></div>`);
  $('resume').onclick=closePanel;$('retry').onclick=restartSection;$('edit-pad').onclick=controller;$('pause-sound').onclick=soundToggle;updateSound();$('back-home').onclick=home;$('pause-hub').onclick=confirmHub;if($('panel-tools'))$('panel-tools').onclick=()=>testTools();
  bindGraphics();$('resume').focus({preventScroll:true});
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
  fx.tone('go');showPanel('finish',`<h2 id="panel-title">${state.mode==='trial'?'Time trial complete':'Race complete'}</h2><p class="result-time">${timeText(state.elapsed)}</p><p>${state.mode==='trial'?'Personal best · '+timeText(session.best):'Finished '+view.position+' / '+view.racers+' · 3 laps'}</p><div class="panel-actions"><button class="primary" id="again">RACE AGAIN ${icon('arrow')}</button><button id="back-home">Return to paddock</button><button id="finish-hub" type="button">Return to hub</button></div>`);
  $('again').onclick=()=>begin(state.mode);$('back-home').onclick=home;$('finish-hub').onclick=()=>returnToHub();
  stampAccount();
}
// ---- The online test race (development switch only; see src/online-switch.js) ----
const escapeHtml=text=>String(text).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const lapsText=laps=>laps===1?'1 lap':laps+' laps';
const onlineNote=()=>`Test build: the race server and the other players run inside this page, each on a simulated connection of ${onlineDev.latencyMs} ms each way.`;
function leaveOnline(){
  if(!online)return;
  online.dispose();online=null;
  runner=session.runner;state=session.state;player=runner.localActor;view=player?runner.hud():null;
}
async function openOnline(){
  if(!loadOnlineDev)return;
  ensureTrackVisuals();leaveOnline();
  showPanel('online-lobby',`<h2 id="panel-title">Online test race</h2><p>Setting up the match…</p>`);
  const {createLoopbackRace}=await loadOnlineDev();
  if(modal!=='online-lobby'||online)return;
  online=createLoopbackRace({
    settings:onlineDev,courseId:track.id,hello:{...garage.selection(),name:'You'},
    // The race is drawn with the game's own circuit and item layer, like single player.
    createWorld:config=>createSimWorld({...config,track,play}),
  });
  runner=online.runner;
  showPanel('online-lobby',`<h2 id="panel-title">Online test race</h2><p>${track.name} · ${onlineDev.seats} karts · ${lapsText(onlineDev.laps)}</p><p class="subtle">${onlineNote()}</p><ul class="online-list" id="online-players" aria-live="polite"></ul><div class="panel-actions"><button class="primary" id="online-ready" disabled>READY ${icon('arrow')}</button><button id="online-leave">Back to paddock</button></div>`);
  $('online-ready').onclick=()=>{runner.setReady(true);online.saidReady=true;$('online-ready').disabled=true;fx.tone('click');};
  $('online-leave').onclick=()=>closePanel();
}
// Runs every frame the online lobby is up: keeps the connection alive and shows who is in.
function onlineLobbyFrame(dt){
  runner.advance(dt,null);
  if(runner.world){
    // The server has set the race: draw it now. Its countdown starts a moment later.
    showRaceScreen();raceReady('Online test');
    return;
  }
  const list=$('online-players');
  if(!list)return;
  // Ready can only be said once the server has let this player in.
  const ready=$('online-ready'),joined=runner.client.phase==='lobby';
  if(ready.disabled!==(!joined||!!online.saidReady)){
    ready.disabled=!joined||!!online.saidReady;
    if(joined&&!online.saidReady)ready.focus({preventScroll:true});
  }
  const text=runner.error?'error:'+runner.error:JSON.stringify(runner.lobby);
  if(text===online.shownLobby)return;
  online.shownLobby=text;
  if(runner.error){list.innerHTML=`<li>The match refused this racer (${escapeHtml(runner.error)}).</li>`;return;}
  list.innerHTML=runner.lobby.map(p=>`<li><b>${escapeHtml(p.name)}</b><span>${escapeHtml(carById(p.car).name)}</span><em>${p.ready?'READY':'…'}</em></li>`).join('')
    +(runner.lobby.length<onlineDev.seats?`<li class="subtle"><b>${onlineDev.seats-runner.lobby.length} more</b><span>computer drivers</span><em></em></li>`:'');
}
function onlineMenu(){
  showPanel('pause',`<h2 id="panel-title">Online race</h2><p>${track.name} · ${track.sections[view.sector].name}</p><p>An online race cannot pause. It carries on behind this panel.</p><p class="subtle">${onlineNote()}</p>${graphicsField()}<div class="panel-actions"><button class="primary" id="resume">BACK TO THE RACE ${icon('arrow')}</button><button id="edit-pad">Controller setup</button><button id="pause-sound" type="button"></button><button id="back-home">Leave the race</button></div>`);
  $('resume').onclick=closePanel;$('edit-pad').onclick=controller;$('pause-sound').onclick=soundToggle;updateSound();$('back-home').onclick=home;
  bindGraphics();$('resume').focus({preventScroll:true});
}
function onlineResults(){
  const results=runner.results(),report=online.report();
  const mine=results.standings.find(row=>row.seat===runner.localSeat);
  fx.tone('go');
  showPanel('finish',`<h2 id="panel-title">Race complete</h2><p class="result-time">${mine?.finishUs!=null?timeText(mine.finishUs/1e6):'Did not finish'}</p><p>Finished ${mine?.place??'-'} / ${results.standings.length} · ${lapsText(state.laps)}</p><ol class="online-list">${results.standings.map(row=>`<li${row.seat===runner.localSeat?' class="mine"':''}><b>${row.place}. ${escapeHtml(row.name)}</b><span>${escapeHtml(carById(row.car).name)}</span><em>${row.finishUs!=null?timeText(row.finishUs/1e6):'—'}</em></li>`).join('')}</ol><p class="subtle">Compared with the server ${report.hashChecks} times: ${report.hashDifferences===0?'always the same race':report.hashDifferences+' differences'}. Corrections re-ran ${report.replayedTicksPerFrame.mean.toFixed(1)} ticks a frame on average and cost ${report.clientMs.mean.toFixed(2)} ms a frame.</p><div class="panel-actions"><button class="primary" id="again">RACE AGAIN ${icon('arrow')}</button><button id="back-home">Return to paddock</button></div>`);
  $('again').onclick=()=>{home();openOnline();};$('back-home').onclick=home;
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
  const a=player;
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
$('prev-item').onclick=()=>session.select(player.held-1);$('next-item').onclick=()=>session.select(player.held+1);
const itemSignalLabels={block:'SHIELD BLOCK',hit:'ITEM HIT',pickup:'ITEM PICKUP',clear:'SHOT CLEARED'};
// The effect the banner is showing, so an online race can take it back with the effect.
let impactToken=-1;
function cancelItemCue(token){
  itemFx.cancel(token);
  if(token===impactToken){impactToken=-1;impactUntil=0;$('item-impact').hidden=true;}
}
function paintItemSignal(signal,color,token){
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
  impactUntil=state.elapsed+.78;impactToken=token;
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
 setAttr(button,'aria-label',slot==='drawing'?'Drawing a second item':shown==null?'Second item slot':'Second item: '+ITEMS[shown].name+(shown===8?' ('+a.reserveCharges+' charges)':'')+'. Hold the item button to swap.');
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
function lobbyButtons(){return [...document.querySelectorAll('[data-track],.mode'),$('launch'),$('return-hub'),$('controls'),$('graphics')];}
function menuPad(){
 const pad=input.rawPad();if(!pad){navPrev=[];return;}
 const down=padEdges(pad);
 const edge=down.map((v,i)=>v&&!navPrev[i]);navPrev=down;
 if(!edge.some(Boolean)||controllerOpen)return;
 if(garage.active&&!modal){
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
// An online race cannot pause: a hidden page stops, and catches up when it is shown again.
document.addEventListener('visibilitychange',()=>{if(document.hidden&&screen==='game'&&!modal&&!controllerOpen&&!online)pause();});
function placeModel(model,k,b,dt){
  const f=track.sampleInto(k.s,k.x,placeSample);
  model.visible=true;
  model.position.set(f.position.x,f.position.y,f.position.z);
  model.rotation.order='YXZ';
  model.rotation.y=Math.atan2(-f.forward.x,-f.forward.z)-(k.yaw||0);
  model.rotation.x=k.pitch??Math.atan(f.grade);
  model.rotation.z=k.roll??f.bank;
  k.roadCurvature=f.curvature;
  animateKart(model,k,b,animation,dt,motion.matches);
}
function syncWorld(dt){
  // Each kart is drawn between its place one tick ago and now, by how far this frame
  // falls between the two ticks.
  const alpha=runner.alpha,seat=runner.localSeat;
  let k;
  for(let i=0;i<state.actors.length;i++){
    const a=state.actors[i];
    const pose=renderPoses[a.id]??={};
    Object.assign(pose,a.kart);
    const prev=runner.previousKart(a.id);
    if(prev && prev.rescues===pose.rescues){
      for(let j=0;j<poseFields.length;j++){
        const key=poseFields[j];
        // A new hit starts upright. Interpolate only the countdown of the active roll.
        if((key==='stunRemaining'||key==='rollTime'||key==='tumble'||key==='trickTime') && pose[key]>prev[key])continue;
        if(key==='yaw' || key==='travelYaw')pose[key]=lerpAngle(prev[key],pose[key],alpha);
        else pose[key]=THREE.MathUtils.lerp(prev[key],pose[key],alpha);
      }
    }
    // Online, a kart that a correction has just moved glides to its place instead of jumping.
    const fix=runner.correction(a.id);
    if(fix){pose.s+=fix.s;pose.x+=fix.x;pose.y+=fix.y;pose.yaw=(pose.yaw||0)+fix.yaw;}
    placeModel(models[a.id],pose,a.boost,dt);
    if(a.id===seat)k=pose;
  }
  const ghost=state.done||online?null:session.ghost();
  if(ghostModel)ghostModel.visible=!!ghost;
  if(ghost)placeModel(ghostModel,ghost,{tier:0},dt);

  followKart(k,k.rescues===cameraRescues?dt:0,wideView,lookingBack,player.boost.skyTier||0);
  const pk=player.kart;
  const boxKey=pk.flying?pk.skyLane*4+Math.min(3,Math.max(1,Math.floor(pk.s/track.length)+1)):-2;
  track.setSkyCollected?.(pk.skyLane,play.skyGot(player),pk.skyBoxKey===boxKey?pk.skyBoxGot:0);
  cameraRescues=k.rescues;
  updateRivalVisibility(camera,models,dt,seat);
  if(updateKartDetail(models,camera))for(const m of models)if(m?.userData.low)renderer.compile(m,camera,world);
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
 mapBgCtx.strokeStyle='#8be8fd';mapBgCtx.lineWidth=3;
 for(const {s0,s1,type} of [...(track.icePatches??[]),...(track.wetPatches??[]).map(p=>({...p,type:'wet'}))]){
  mapBgCtx.strokeStyle=type==='wet'?'#7db7ea':'#8be8fd';
  mapBgCtx.beginPath();
  for(let i=0;i<=18;i++){
   track.mapXYAt(s0+(s1-s0)*i/18,mapPtScratch);
   const x=mapOriginX+(mapPtScratch.x-mapMinX)*mapScale,y=mapOriginZ+(mapPtScratch.z-mapMinZ)*mapScale;
   if(i===0)mapBgCtx.moveTo(x,y);else mapBgCtx.lineTo(x,y);
  }
  mapBgCtx.stroke();
 }
}
rebuildMap();
let shownMeter=-1,shownReserve=-1;
function timingHUD(){
 const {kart:k,boost:b}=player;
 const pips=$('pips');
 if(pips.getAttribute('aria-valuenow')!==String(b.pips)){
   pips.setAttribute('aria-valuenow',String(b.pips));
   for(let i=0;i<pips.children.length;i++)pips.children[i].classList.toggle('filled',i<b.pips);
 }
 const charging=k.sliding && k.driftWasHeld && !b.chainClosed && !state.done;
 const grade=charging?driftGrade(b,k):null, ready=!!grade;
 // The meter's bands: launch revs share 0.70/0.90; drifts follow the player's car (its Boost stat).
 const meterEl=$('meterfill').parentElement, band=meterBands(k,state.countdown>0), bands=band.good+'/'+band.perfect;
 if(meterEl.dataset.bands!==bands){
   meterEl.dataset.bands=bands;
   meterEl.style.setProperty('--good',(band.good*100)+'%');
   meterEl.style.setProperty('--perfect',(band.perfect*100)+'%');
 }
 boostButton.disabled=!charging;
 boostButton.classList.toggle('ready',ready);
 setText('meter-label',state.countdown?'LAUNCH':grade==='PERFECT'?'PERFECT':ready?'READY':k.sliding?'DRIFT':b.tier===2?'SUPER TURBO':b.tier?'TURBO':'DRIFT');
 const meter=(state.countdown?b.rev:b.meter)*100,reserve=100*b.reserve/Math.max(5,b.reservePeak);
 if(meter!==shownMeter){shownMeter=meter;$('meterfill').style.width=meter+'%';}
 if(reserve!==shownReserve){shownReserve=reserve;$('reservefill').style.width=reserve+'%';}
 setText('reserve-time',b.reserve>0?(Math.ceil(b.reserve*10)/10).toFixed(1)+'s':'');
}
let finalLapAt=-1,flightStartedAt=-1,lastCue={flying:false,cells:0,tier:0,notice:'',lap:1,place:0,placeAt:-9};
// Sounds and timed banners from what changed for the player since the last frame.
function raceCues(){
 const a=player,k=a.kart,b=a.boost;
 if(state.elapsed<lastCue.at){
   lastCue={flying:false,cells:0,tier:0,notice:'',lap:view.lap,place:0,placeAt:-9};
   finalLapAt=-1;flightStartedAt=-1;
 }
 lastCue.at=state.elapsed;
 if(k.flying&&!lastCue.flying){flightStartedAt=state.elapsed;fx.tone('launch');}
 if(k.flying&&b.skyCells>lastCue.cells)fx.tone(b.feedback.startsWith('MEGA')?'mega':'cell',1+Math.min(10,b.skyChain)*.06);
 if(k.flying&&b.skyTier>lastCue.tier)fx.tone('tier',1+b.skyTier*.18);
 const fresh=a.noticeTime>1.2&&a.notice!==lastCue.notice;
 if(fresh&&(a.notice==='CRASH'||a.notice==='RAMMED'))fx.tone('crash');
 if(view.lap===view.laps&&lastCue.lap<view.laps&&state.mode!=='test'){finalLapAt=state.elapsed;fx.tone('final');
   const plate=document.querySelector('.clockplate');plate.classList.remove('pulse');void plate.offsetWidth;plate.classList.add('pulse');}
 if(state.mode==='race'&&state.countdown===0){
   const place=view.position;
   if(lastCue.place&&place!==lastCue.place){
     const pop=$('position-pop');pop.textContent=(place<lastCue.place?'▲ P':'▼ P')+place;
     pop.className='show '+(place<lastCue.place?'up':'down');lastCue.placeAt=state.elapsed;
   }
   lastCue.place=place;
 }
 if(state.elapsed-lastCue.placeAt>1.4)$('position-pop').classList.remove('show');
 Object.assign(lastCue,{flying:k.flying,cells:k.flying?b.skyCells:0,tier:k.flying?b.skyTier:0,notice:a.notice,lap:view.lap});
}
let shownSkyTimer=-1,shownSkyHeight=-1,shownSkyArrow='',linesIdle=true,linesQuietAt=0;
function skyHUD(){
 const a=player,k=a.kart,b=a.boost,panel=$('sky-hud');
 setHidden(panel,!k.flying);
 // Speed lines build from air base speed up to the 2.2× ceiling; the reduce
 // setting keeps them faint and still.
 const lines=$('speed-lines'),calm=!!input.settings.reduceSpeedLines;
 const rush=k.flying?Math.min(1,Math.max(0,(k.speed-80)/45)):0;
 const opacity=(k.flying?.18+.62*rush:0)*(calm?.3:1);
 if(Math.abs((+lines.dataset.o||0)-opacity)>.02){lines.style.opacity=opacity.toFixed(2);lines.dataset.o=opacity.toFixed(2);}
 lines.classList.toggle('reduced',calm);
 // Stop the streak animation once the fade-out has finished, and restart it for the next flight.
 if(opacity>0){linesQuietAt=animation+.3;if(linesIdle){linesIdle=false;lines.classList.remove('idle');}}
 else if(!linesIdle&&animation>=linesQuietAt){linesIdle=true;lines.classList.add('idle');}
 if(!k.flying)return;
 const lane=track.sky.lanes[k.skyLane];
 if(panel.dataset.tier!==String(b.skyTier))panel.dataset.tier=String(b.skyTier);
 setText('sky-chain','×'+b.skyChain);
 setText('sky-tier','TIER '+b.skyTier+' · '+[1.6,1.8,2,2.2][b.skyTier].toFixed(1)+'×');
 const timer=Math.max(0,b.skyTimer);
 if(timer!==shownSkyTimer){shownSkyTimer=timer;$('sky-timer-fill').style.width=(100*timer/2.5)+'%';}
 const layout=lane.layouts[lapOf(k.s,track.length)-1];
 const local=k.s-Math.floor(k.s/track.length)*track.length;
 const cell=nextCell(layout,play.skyGot(a),local,160);
 const arrow=$('sky-arrow');
 arrow.toggleAttribute('data-none',!cell);
 arrow.toggleAttribute('data-mega',!!cell?.mega);
 if(cell){
   const dx=cell.x-k.x,dy=cell.y-k.skyY;
   const angle=Math.hypot(dx,dy)<1.5?0:Math.atan2(dx,dy);
   const turn='rotate('+angle.toFixed(3)+'rad)';
   if(turn!==shownSkyArrow){shownSkyArrow=turn;arrow.firstElementChild.style.transform=turn;}
 }
 const top=laneCeiling(lane,k.s,track.length);
 const height=Math.min(1,Math.max(0,(k.skyY-lane.floor)/Math.max(1,top-lane.floor)));
 if(height!==shownSkyHeight){shownSkyHeight=height;$('sky-alt-tick').style.bottom=(100*height)+'%';}
}
let shownSplit=null,shownSplitText='';
function hud(){
 const a=player,k=a.kart,b=a.boost;
 const binding=input.settings.bindings.driftBoost;
 setText('boost-key',input.deviceName==='Keyboard'?'E':binding==='none'?'':bindingName(binding));
 setText('position',state.mode==='race'?view.position+' / '+view.racers:state.mode==='trial'?'GHOST':'∞ ITEMS');
 // Online, the race goes on after this player crosses the line: their clock stops there.
 setText('lap','LAP '+view.lap+' / '+view.laps);setText('clock',timeText(online&&a.finish!=null?a.finish:state.elapsed));
 setText('sector-read',String(view.sector+1).padStart(2,'0')+' / '+track.sections[view.sector].name.toUpperCase());
 setText('speed',Math.round((k.reverseSpeed||k.speed)*3.6));
 const incoming=a.incoming||'';
 setText('incoming-warning',incoming);$('incoming-warning').hidden=!incoming;
 const notice=a.noticeTime>0&&!a.notice.endsWith(' INCOMING')?a.notice:'';
 const grade=b.feedbackTime>0?b.feedback:'';
 // The first seconds of each flight teach the Sky Lane controls.
 const skyTip=k.flying&&state.elapsed-flightStartedAt<2.6&&!notice&&!grade?(input.deviceName==='Keyboard'?'W DIVE · S CLIMB · Q CARVE · Q+A/D ROLL':'STICK PITCH · DRIFT CARVE · DRIFT+STEER ROLL'):'';
 const iceDistance=!k.flying&&!k.fall?(track.distanceToIce?.(k.s)??Infinity):Infinity;
 const wetDistance=!k.flying&&!k.fall?(track.distanceToWet?.(k.s)??Infinity):Infinity;
 const iceTip=iceDistance===0?'ICE · REDUCED GRIP':iceDistance<60?'ICE AHEAD · BRAKE EARLY'
  :wetDistance===0&&track.wetAt?.(k.s,k.x)>.025?'PUDDLE · REDUCED GRIP'
  :wetDistance>0&&wetDistance<48?'WET PATCH AHEAD':'';

 const lane=k.flying?track.sky.lanes[k.skyLane]:null;
 const laneS=k.s-Math.floor(k.s/track.length)*track.length;
 const crossing=lane?.layouts[Math.min(2,Math.max(0,view.lap-1))]?.obstacles.find(ob=>ob.type==='crossing'&&laneS>=ob.warn&&laneS<ob.s+ob.depth);
 const crossingTip=crossing?(crossing.variant==='plane'?'AIRCRAFT CROSSING':crossing.variant==='birds'?'FLOCK CROSSING':'SATELLITE CROSSING'):'';
 const feedback=k.fall?['OFF TRACK']:[notice,k.stunRemaining>0?'STUNNED':k.tumble>0?'TUMBLE':grade,crossingTip||skyTip,iceTip].filter(Boolean);
 const split=view.split&&view.split.at+SPLIT_SHOWN>state.elapsed?view.split:null;
 if(split!==shownSplit){shownSplit=split;shownSplitText=split?splitText(split):'';}
 setText('feedback',feedback.join('\n')||shownSplitText);
 const finalLap=state.mode!=='test'&&finalLapAt>=0&&state.elapsed-finalLapAt<2.4&&!state.done;
 $('announce').classList.toggle('final-lap',finalLap);
 setText('announce',online&&runner.phase==='waiting'?(state.tick>0?'CATCHING UP':'GET READY'):state.countdown?Math.ceil(state.countdown):state.elapsed<.7&&state.mode!=='test'?'GO!':finalLap?'FINAL LAP':online&&a.finish!=null?'FINISHED':'');
 // The roulette fills the front slot when it is empty, otherwise the second slot.
 const rolling=a.roulette?pickupPreview(a.roulette,state.elapsed):null;
 const frontRolling=!!a.roulette&&a.held==null;
 const shownItem=frontRolling?rolling:a.held;
 const itemButton=$('item-hud');
 itemButton.disabled=a.held==null;
 const itemTitle=frontRolling?'Drawing an item':a.held==null?'Empty item slot':'Use '+ITEMS[a.held].name+(a.reserve!=null&&!a.unlimited?' · hold to swap':'');
 if(itemButton.title!==itemTitle)itemButton.title=itemTitle;
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
   for(let i=0;i<inventory.children.length;i++)setAttr(inventory.children[i],'aria-pressed',String(i===a.held));
   const switchKey=input.deviceName==='Keyboard'?'X / I':bindingName(input.settings.bindings.next);
   setText('item-cycle',(a.held===8?a.charges+' CHARGES · ':'')+switchKey+' · NEXT');
 }else setText('item-cycle',a.held===8?a.charges+' CHARGES':'');
 $('item-hud').hidden=state.mode==='trial';
 ctx.clearRect(0,0,map.width,map.height);
 ctx.drawImage(mapBgCanvas,0,0);
 let mineX=0,mineY=0;
 for(let i=state.actors.length-1;i>=0;i--){
   const actor=state.actors[i];
   track.mapXYAt(actor.kart.s,mapPtScratch);
   const x=mapOriginX+(mapPtScratch.x-mapMinX)*mapScale,y=mapOriginZ+(mapPtScratch.z-mapMinZ)*mapScale;
   // The player's own dot is drawn last so rivals never cover it.
   if(actor===a){mineX=x;mineY=y;continue;}
   ctx.beginPath();ctx.fillStyle='#ff7853';ctx.arc(x,y,2.7,0,Math.PI*2);ctx.fill();
 }
 ctx.beginPath();ctx.fillStyle='#d5ee7a';ctx.arc(mineX,mineY,4.8,0,Math.PI*2);ctx.fill();
}
const edgeFlags=['driftPressed','driftReleased','driftBoostPressed','itemPressed','itemSwapPressed','blastersPressed','prevPressed','nextPressed'];
const tickInputScratch={};
let pendingEdges={},pendingSlot=null;
// This frame's polled controls, or null when the player is not driving (a menu is open).
let frameControls=null;
// The runner asks for the controls once per new tick. Button presses made since the last
// tick go to the first one, so none is lost between frames or doubled on a fast screen.
function sampleControls(){
 if(!frameControls)return null;
 Object.assign(tickInputScratch,frameControls);
 for(let i=0;i<edgeFlags.length;i++){const key=edgeFlags[i];tickInputScratch[key]=!!pendingEdges[key];pendingEdges[key]=false;}
 tickInputScratch.slot=pendingSlot;pendingSlot=null;
 return tickInputScratch;
}
// Sounds and effects for an online race's events. Single player's are played by its
// session as each tick runs (src/session.js), so its runner has none left to hand over.
const onlineCues=createCuePlayer({fx,cue:itemFx.cue,cancelCue:cancelItemCue,localSeat:()=>runner.localSeat,track:()=>track});
// One frame of a race in progress. `c` is the polled controls, or null when the player is
// not driving: an online race keeps running behind a menu.
function raceFrame(now,dt,rawDt,c){
 frameControls=c;
 if(c){
   if(c.distancePressed)wideView=!wideView;
   if(c.mapPressed)$('minimap').hidden=!$('minimap').hidden;
   lookingBack=c.lookBack;
   itemGesture(c,dt);
   // Preserve button edges between render frames, including on high-refresh screens.
   for(let i=0;i<edgeFlags.length;i++){const key=edgeFlags[i];if(c[key])pendingEdges[key]=true;}
   if(c.slot!=null)pendingSlot=c.slot;
 }
 const advanceStart=online?performance.now():0;
 perf.beginSim();
 runner.advance(dt,sampleControls);
 perf.endSim();
 if(online){
   // Item meshes a correction removed and did not bring back go now; the rest are drawn once.
   play.settle();
   onlineCues.playAll(runner.drainEvents());
   online.noteFrame(performance.now()-advanceStart);
   // The first countdown beep, on the frame the race's first tick runs.
   if(!online.counting&&runner.phase!=='waiting'){online.counting=true;fx.tone('count');}
 }
 view=runner.hud();
 if(online)track.setViewLap?.(view.lap);
 fx.update(dt,state.actors,true,state.countdown>0,player);syncWorld(dt);
 itemFx.update(dt,camera);timingHUD();raceCues();skyHUD();
 if(now-lastHUD>45){hud();lastHUD=now;}
 track.drawVisuals();
 sceneLight.focus(track,player?.kart,animation);
 renderer.render(world,camera);
 perf.recordFrame(rawDt*1000,renderer,now);
 scaler.sample(debugFrameMs||rawDt*1000);
 noteCrumbs();
 if(online){if(online.finished()){hud();onlineResults();}}
 else if(state.done){hud();finish();}
}
function frame(now){
 const rawDt=Math.max(0,(now-previous)/1000);
 const dt=Math.min(.1,rawDt);previous=now;animation+=dt;
 const host=screen==='lobby'?$('hero-canvas'):$('race-canvas');const W=host.clientWidth,H=host.clientHeight;
 const dpr=window.devicePixelRatio||1;
 // The tier's pixel budget depends on the canvas size, so the floor follows resizes too.
 const area=W*H;
 if(dpr!==seenDpr||area!==seenArea){seenDpr=dpr;seenArea=area;scaler.setMinScale(minScaleFor(gfx,dpr,area));}
 // The paddock always renders at the tier's full resolution; only a race is scaled.
 const ratio=basePixelRatio(gfx,dpr,area)*(screen==='game'?scaler.scale:1),resized=W&&H&&(W!==w||H!==h);
 // An online race runs on whatever this page shows; only the feedback tool's frozen frame stops it.
 const racingOn=online&&screen==='game';
 if(resized||ratio!==pixelRatio){
   if(ratio!==pixelRatio){pixelRatio=ratio;renderer.setPixelRatio(ratio);}
   if(resized){w=W;h=H;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();scaler.restart();}
   perf.noteQuality(gfx.id,ratio,screen==='game'?scaler.scale:1);
   // Resizing clears the canvas, and a paused race does not draw: repaint it once.
   if(screen==='game'&&w&&h&&(modal||controllerOpen||feedbackHold.held())){track.drawVisuals();renderer.render(world,camera);}
 }
 // Frames outside a running race only teach the scaler how fast this screen refreshes.
 if(screen!=='game'||feedbackHold.held()||(!racingOn&&(modal||controllerOpen)))scaler.observe(rawDt*1000);
 // The in-page server and the other players keep going whatever this page is doing.
 if(online)online.pump(now);
 if(feedbackHold.held()){requestAnimationFrame(frame);return;}
 const c=input.poll();
 if(controllerOpen){menuPad();if(racingOn)raceFrame(now,dt,rawDt,null);requestAnimationFrame(frame);return;}
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
   if(online)onlineLobbyFrame(dt);
 }else if(modal){
   if(modal==='hub-exit'&&c.pausePressed)pause();
   else if(modal==='pause'&&c.pausePressed)closePanel();
   else menuPad();
   if(racingOn)raceFrame(now,dt,rawDt,null);
 }
 else if(c.pausePressed){pause();}
 else if(c.resetPressed&&!online){restartSection();}
 else raceFrame(now,dt,rawDt,c);
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

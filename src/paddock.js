import * as THREE from 'three';
import { makeKart,animateKart,disposeKart } from './kart-art.js';
import { animateHubPortal, createHubPortal } from './hub/portal-mesh.js';

function lightScene(scene, intensity=2.5) {
  scene.add(new THREE.HemisphereLight(0xf8faff,0xb4aaa0,1.85));
  const light=new THREE.DirectionalLight(0xffe7bd,intensity);
  light.position.set(-24,43,-26);scene.add(light);
}
export {lightScene};
export function createPaddock() {
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,2,.1,180);
  scene.background=new THREE.Color('#b8d4d0');scene.fog=new THREE.Fog('#cee0d5',35,112);lightScene(scene);
  const geo=new THREE.BoxGeometry();
  function block(color,x,y,z,w,h,d,ry=0) {
    const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color,flatShading:true}));
    m.scale.set(w,h,d);m.position.set(x,y,z);m.rotation.y=ry;scene.add(m);return m;
  }
  block('#696e70',0,-.25,0,180,.5,130);
  // Grid boxes and pit apron stripes establish the scale of the starting grid.
  for(let i=-6;i<=6;i++){
    const x=i*4.8;
    block('#eee8ce',x,.008,1.8,2.9,.015,.095);
    block('#eee8ce',x-1.42,.008,1.52,.075,.015,.55);
    block('#eee8ce',x+1.42,.008,1.52,.075,.015,.55);
  }
  for(let i=-18;i<=18;i++){
    block(i%2?'#e86241':'#e7e4cc',i*1.7,.065,5.9,1.7,.12,.80);
  }
  block('#dad4b4',0,.015,-3.1,140,.022,.08);
  block('#6c8886',0,.15,12.8,150,.32,12.5);
  for(let i=-8;i<9;i++)block(i%2?'#47655f':'#57746e',i*4,1.0,14.0,3.96,1.8,.9);
  // Faceted mountains remain legible at wide and narrow aspect ratios.
  let seed=31;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
  for(let i=0;i<42;i++){
    const x=(random()-.5)*155,z=17+random()*53;
    const h=3.5+random()*15;
    const m=new THREE.Mesh(new THREE.ConeGeometry(1,1,4),new THREE.MeshStandardMaterial({color:['#77958c','#697f74','#8d9f86','#839d8e'][i%4],flatShading:true}));
    m.position.set(x,h/2-1,z);m.rotation.y=random()*3;m.scale.set(6+random()*14,h,6+random()*7);scene.add(m);
  }
  for(let i=0;i<60;i++){
    const x=(random()-.5)*105,z=13+random()*23,h=2+random()*3;
    const m=new THREE.Mesh(new THREE.ConeGeometry(1,1,5),new THREE.MeshStandardMaterial({color:['#375e54','#436b5c','#587966'][i%3],flatShading:true}));
    m.position.set(x,h/2,z);m.scale.set(h*.31,h,h*.31);scene.add(m);
  }
  for(let i=-2;i<4;i++){
    const x=i*6.5;
    block('#253b3c',x,2.35,8.4,.10,4.70,.10);
    block(i%2?'#e76d4d':'#d7e6a4',x+.53,4.08,8.4,1.04,1.22,.05);
    block('#243738',x+.53,3.68,8.36,1.04,.10,.06);
  }
  let kart=makeKart(0);scene.add(kart);
  const hubPortal=createHubPortal();scene.add(hubPortal);
  let garage=false,rear=false;
  function preview(car,driver) {
    if(kart.userData.car===car.id&&kart.userData.character===driver.id)return;
    disposeKart(kart);kart=makeKart(0,car,driver);scene.add(kart);
  }
  return {preview,setGarage(open){garage=open;rear=false},turn(){rear=!rear},render(renderer,time,w,h){
    const ratio=w/h;
    camera.aspect=ratio;
    const geep=kart.userData.car==='geep';
    const zoom=ratio<1.25?1.18:1;
    const hexshift=kart.userData.car==='hexshift';
    const barrage=kart.userData.car==='barrage';
    const ironhide=kart.userData.car==='ironhide';
    const crestline=kart.userData.car==='crestline';
    const manta=kart.userData.car==='manta';
    const saucer=kart.userData.car==='saucer';
    const skipper=kart.userData.car==='skipper';
    const cart=kart.userData.car==='shopping-cart';
    if(cart&&garage){
      camera.fov=27;
      camera.position.set(5.45*zoom,1.26+2.12*zoom,(rear?5.6:-5.6)*zoom);
      camera.lookAt(0,1.30,0);
    }else if(skipper&&garage){
      camera.fov=26;
      camera.position.set(6.85*zoom,1.42+1.63*zoom,(rear?5.55:-5.95)*zoom);
      camera.lookAt(0,1.42,0);
    }else if(saucer&&garage){
      camera.fov=25;
      camera.position.set(3.65*zoom,1.05+1.75*zoom,(rear?5.6:-5.6)*zoom);
      camera.lookAt(0,1.03,0);
    }else if(manta&&garage&&!rear){
      camera.fov=22;
      camera.position.set(5.25*zoom,.78+1.98*zoom,-6.40*zoom);
      camera.lookAt(0,.76,-.03);
    }else if(crestline&&garage&&!rear){
      camera.fov=24;
      camera.position.set(-6.65*zoom,1.15+1.57*zoom,-4.60*zoom);
      camera.lookAt(0,1.13,0);
    }else if(ironhide&&garage&&!rear){
      camera.fov=20.8;
      camera.position.set(-5.65*zoom,1.32+2.64*zoom,-8.20*zoom);
      camera.lookAt(0,1.32,-.06);
    }else if(barrage&&garage&&!rear){
      camera.fov=24;
      camera.position.set(5.42*zoom,.85+2.20*zoom,-5.80*zoom);
      camera.lookAt(0,.79,-.08);
    }else if(hexshift&&garage&&!rear){
      camera.fov=26;
      camera.position.set(-3.9*zoom,1.03+1.71*zoom,-6.05*zoom);
      camera.lookAt(0,1.03,-.09);
    }else if(geep&&garage&&!rear){
      // A longer lens preserves the illustrated relationship between the front and rear wheels.
      camera.fov=16.6;
      camera.position.set(6.86*zoom,.92+3.09*zoom,-8.85*zoom);
      camera.lookAt(0,.92,-.085);
    }else{
      camera.fov=35;
      camera.position.set((geep?4.65:-4.35)*zoom,garage?2.65:2.37,(garage&&rear?5.55:-5.95)*zoom);
      camera.lookAt(0,geep?.99:1.12,0);
    }
    // Frame the kart opposite the circuit information on wide displays.
    const shift=garage?0:ratio>1.35?.205:.04;
    camera.setViewOffset(w,h,-w*shift,h*.025,w,h);camera.updateProjectionMatrix();
    hubPortal.visible=!garage;
    if(!garage)animateHubPortal(hubPortal,time);
    kart.rotation.y=(cart||skipper||saucer||manta||crestline||geep||hexshift||barrage||ironhide)&&garage?0:(geep?.10:-.28)+Math.sin(time*.3)*.055;
    animateKart(kart,{speed:0,s:0}, {tier:0},time);
    renderer.render(scene,camera);
  }};
}

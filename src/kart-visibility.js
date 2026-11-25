import {MathUtils,Raycaster,Vector3} from 'three';

// Sample the head, shoulders and chassis. Compare the first solid surface on
// each ray so a rival beside the player can keep its natural silhouette.
const probes=[new Vector3(0,1.82,.16),new Vector3(-.36,1.57,.17),
  new Vector3(.36,1.57,.17),new Vector3(0,.75,0)];
const ray=new Raycaster(),hits=[],target=new Vector3(),toPlayer=new Vector3(),toRival=new Vector3();
const center=new Vector3(),rivalCenter=new Vector3();
const fades=new WeakMap();

function coversPlayer(rival,player,camera,playerDistance){
  const data=rival.userData;
  data.body.updateWorldMatrix(true,false);
  rivalCenter.set(0,1.1,0).applyMatrix4(data.body.matrixWorld);
  toRival.subVectors(rivalCenter,camera.position);
  const depth=toRival.dot(toPlayer);
  if(depth < -2 || depth > playerDistance-.35 || toRival.lengthSq()-depth*depth>7.84)return false;
  data.body.updateWorldMatrix(false,true);
  for(const local of probes){
    target.copy(local).applyMatrix4(player.userData.body.matrixWorld).sub(camera.position);
    ray.far=target.length()+.1;
    ray.set(camera.position,target.normalize());
    hits.length=0;
    ray.intersectObjects(player.userData.solidMeshes,false,hits);
    if(!hits.length)continue;
    ray.far=hits[0].distance-.04;
    hits.length=0;
    ray.intersectObjects(data.solidMeshes,false,hits);
    if(hits.length){hits.length=0;return true;}
  }
  return false;
}

function createFade(kart){
  const materials=new Map(),parts=[];
  kart.traverse(mesh=>{
    if(!mesh.isMesh&&!mesh.isPoints)return;
    const source=mesh.material;
    if(!materials.has(source)){
      const faded=source.clone();
      faded.transparent=true;faded.depthWrite=false;
      materials.set(source,faded);
    }
    parts.push({mesh,source,faded:materials.get(source)});
  });
  const state={materials,parts,opacity:1};
  fades.set(kart,state);
  return state;
}
function restore(state){
  for(const {mesh,source} of state.parts)mesh.material=source;
  state.opacity=1;
}
export function releaseKartFade(kart){
  const state=fades.get(kart);
  if(!state)return;
  restore(state);
  for(const faded of state.materials.values())faded.dispose();
  fades.delete(kart);
}

export function updateRivalVisibility(camera,models,dt){
  if(models.length<2)return;
  const player=models[0];
  player.userData.body.updateWorldMatrix(true,true);
  center.set(0,1.1,0).applyMatrix4(player.userData.body.matrixWorld);
  toPlayer.subVectors(center,camera.position);
  const distance=toPlayer.length();
  toPlayer.normalize();
  for(let i=1;i<models.length;i++){
    const rival=models[i];
    if(!rival.visible)continue;
    const covered=coversPlayer(rival,player,camera,distance);
    let state=fades.get(rival);
    if(!covered&&(!state||state.opacity===1))continue;
    if(!state)state=createFade(rival);
    const goal=covered?.075:1;
    const opacity=dt>0?MathUtils.damp(state.opacity,goal,covered?35:19,dt):goal;
    if(opacity>.995&&!covered){restore(state);continue;}
    for(const {mesh,faded} of state.parts)mesh.material=faded;
    for(const [source,faded] of state.materials){
      faded.color.copy(source.color);
      faded.opacity=source.opacity*opacity;
    }
    state.opacity=opacity;
  }
}

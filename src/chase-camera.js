import { MathUtils } from 'three';

const clamp=MathUtils.clamp;
const radians=MathUtils.degToRad;
const wrapAngle=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));

// A critically damped spring following a linearly moving target. Using the
// previous target keeps the response consistent between physics/render rates.
class Spring {
  reset(value) { this.value=value; this.target=value; this.velocity=0; }
  follow(target, frequency, dt) {
    if(dt<=0 || this.value===undefined){this.reset(target);return target;}
    const rate=(target-this.target)/dt;
    const offset=this.value-this.target+2*rate/frequency;
    const v=this.velocity-rate;
    const c=v+frequency*offset;
    const decay=Math.exp(-frequency*dt);
    this.value=target-2*rate/frequency+(offset+c*dt)*decay;
    this.velocity=rate+(v-frequency*c*dt)*decay;
    this.target=target;
    return this.value;
  }
}

export function createChaseCamera(camera,track) {
  const heading=new Spring(),lane=new Spring(),elevation=new Spring();
  const incline=new Spring(),pace=new Spring(),boom=new Spring();
  return function followKart(k,dt,wide=false,lookBack=false) {
    const road=track.sample(k.s,k.x);
    const speed=pace.follow(clamp(k.speed/50,0,1),5,dt);
    const arm=boom.follow((wide?10.7:8.5)+speed,7,dt);
    const distance=lookBack?-arm:arm;
    const near=track.sample(k.s-4,k.x);
    const far=track.sample(k.s+8+speed*4,k.x);
    const roadYaw=Math.atan2(far.position.x-near.position.x,near.position.z-far.position.z);
    // Bias toward travel during a slide, while the nose can swing further
    // across the screen. A short preview keeps switchback exits in sight.
    const tangent=Math.atan2(road.forward.x,-road.forward.z);
    const targetYaw=tangent+k.travelYaw
      +.25*wrapAngle(roadYaw-tangent)+.10*clamp(wrapAngle(k.yaw-k.travelYaw),-.7,.7);
    const unwrapped=dt>0&&heading.target!==undefined
      ? heading.target+wrapAngle(targetYaw-heading.target) : targetYaw;
    const yaw=heading.follow(unwrapped,13,dt);
    const forwardX=Math.sin(yaw),forwardZ=-Math.cos(yaw);
    const smoothLane=lane.follow(k.x,18,dt);
    const anchor=track.sample(k.s,k.x+clamp(smoothLane-k.x,-.65,.65));
    camera.position.x=anchor.position.x-forwardX*distance;
    camera.position.z=anchor.position.z-forwardZ*distance;

    // Keep the camera on this deck when the helix crosses itself. Estimate
    // its position across the rear cross-section and stay inside the rails.
    const rearS=k.s-distance*Math.cos(yaw-tangent)/clamp(1-k.x*road.curvature,.65,1.45);
    const rear=track.sample(rearS);
    const offset=(camera.position.x-rear.position.x)*rear.right.x+
      (camera.position.z-rear.position.z)*rear.right.z;
    const limit=rear.width/2-1.0;
    const rearLane=clamp(offset,-limit,limit);
    camera.position.addScaledVector(rear.right,rearLane-offset);
    const floor=track.sample(rearS,rearLane);
    const grade=Math.atan2(far.deckY-near.deckY,Math.hypot(far.position.x-near.position.x,far.position.z-near.position.z));
    const slope=incline.follow(clamp(grade,-.30,.30),7.5,dt);
    const worldHeight=road.position.y+k.y;
    // Follow the broad jump arc. Ignore a little of the lift so a hop is
    // visible, without pitching the lens at the ramp directly below it.
    const height=elevation.follow(worldHeight-.12*Math.max(0,worldHeight-road.deckY)-.62*(k.hopLift||0),16,dt);
    camera.position.y=Math.max(floor.position.y+1.25,height+3.75+(arm-8.5-speed)*.23-distance*Math.tan(slope));
    const aimYaw=Math.atan2(anchor.position.x-camera.position.x,camera.position.z-anchor.position.z);
    const pitch=-radians(6.8)+(lookBack?-1:1)*slope*.87-(k.fall?clamp(-k.y*.055,0,.52):0);
    camera.rotation.set(pitch,-aimYaw,0,'YXZ');
    const fov=61+3.5*speed;
    if(Math.abs(camera.fov-fov)>.001){camera.fov=fov;camera.updateProjectionMatrix();}
  };
}

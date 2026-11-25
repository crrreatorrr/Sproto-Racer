// Model coordinates use -Z for the nose. Distances are in track metres.
export const barrageDriver={x:0,y:.755,z:.21,scale:.68};
export const barrageAxles=[[-1.22,.46],[1.20,.53]];
export const barrageHalfTrack=1.12, barrageTireWidth=.44, barrageSteeringAngle=.32;
export const barrageMuzzle={x:.91,y:1.095,z:-1.32};
export const barrageTail=1.84;

// Cross sections of the perimeter shared by the low splitter and its contact hull.
export const barragePerimeter=[
  [-2.27,.63],[-2.13,1.10],[-1.91,1.25],[-.80,1.24],
  [.68,1.26],[1.56,1.29],[1.90,1.09],[2.03,.65]
];
export const barrageWing={inner:.14,outer:1.32,front:1.42,rear:2.03,top:1.45};

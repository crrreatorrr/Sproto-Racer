// Model space is in track metres. Negative Z points toward the bow.
export const skipperAxles=[[-1.13,.46],[1.16,.46]];
export const skipperHalfTrack=1.04, skipperWheelWidth=.36;
export const skipperDriver={x:.10,y:1.285,z:.20,scale:.70};
export const skipperCabin={halfWidth:.83,front:-.75,rear:.99,roofFront:-.55,roofRear:1.02,
  sill:1.51,roofBottom:2.65,roofTop:2.79,roofWidth:.94};
export const skipperMotor={x:0,z:1.98,y:1.68,halfWidth:.30,halfDepth:.37,bottom:1.35,top:2.04};
// Each station describes the top edge, then the chine and keel rise and rake.
// The forwardmost station collapses to a stem so the boat has one sharp nose.
export const skipperStations=[
  [-2.28,.016,1.72,1.42,1.20,.16,.34],
  [-2.09,.30,1.68,1.29,.99,.14,.31],
  [-1.79,.59,1.625,1.16,.82,.10,.23],
  [-1.43,.805,1.58,1.075,.72,.06,.15],
  [-1.08,.945,1.55,1.035,.65,.035,.09],
  [-.75,1.015,1.53,1.01,.61,.016,.04],
  [-.12,1.052,1.49,.985,.59,0,0],
  [.66,1.044,1.455,.965,.60,0,0],
  [1.25,.995,1.43,.95,.63,-.025,-.035],
  [1.70,.912,1.415,.95,.68,-.04,-.075]
];
export function skipperSection([z,w,top,chine,keel,rake,foot],side){
  return [[0,keel,z+foot],[side*w*.76,chine,z+rake],[side*w*.91,chine+.105,z+rake*.65],
    [side*w,top-.063,z],[side*w*1.006,top-.045,z],[side*w*.995,top,z]];
}

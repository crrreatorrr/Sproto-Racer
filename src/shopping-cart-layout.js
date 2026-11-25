export const cartAxles=[[-1.28,.245],[1.30,.245]];
export const cartHalfTrack=.84;
export const cartDriver={x:0,y:1.20,z:.19,scale:1};
export const cartHandle={y:2.11,z:1.76,halfWidth:1.08,radius:.074};
export const cartFloor=.82;

// Bilinear basket panels flare outward from the floor and rise toward the handle.
export function basketPoint(side,along,height){
  const halfWidth=.69+.13*along+(.23+.04*along)*height;
  const front=-1.37-.39*height,rear=1.04+.32*height;
  return [side*halfWidth,cartFloor+height*(.66+.38*along),front+(rear-front)*along];
}

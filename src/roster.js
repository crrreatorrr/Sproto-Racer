// The garage and simulation share the same multipliers. Characters are cosmetic.
export const CARS = [
  {id:'apex',name:'Apex',role:'All-rounder',color:'#f65a32',trim:'#fff1c9',speed:1,accel:1,turn:1},
  {id:'needle',name:'Needle',role:'Straight-line speed',color:'#47a6ca',trim:'#e0f5da',speed:1.017,accel:.88,turn:.93},
  {id:'pogo',name:'Pogo',role:'Quick recovery',color:'#efa834',trim:'#522f43',speed:.990,accel:1.18,turn:.95},
  {id:'gecko',name:'Gecko',role:'Tight corners',color:'#99c84d',trim:'#243d39',speed:.989,accel:.96,turn:1.17},
  {id:'relay',name:'Relay',role:'Fast exits',color:'#ae81dc',trim:'#fff0cc',speed:1.009,accel:1.07,turn:.89},
  {id:'geep',name:'Geep',role:'Rally buggy',color:'#729749',trim:'#c2ed66',speed:1,accel:1,turn:1},
  {id:'hexshift',name:'Hexshift',role:'Lunar roadster',color:'#55163d',trim:'#ffdfad',speed:1,accel:1,turn:1},
  {id:'barrage',name:'Barrage',role:'Pulse blasters',color:'#ed6327',trim:'#ffe9c7',speed:1,accel:1,turn:1},
  {id:'ironhide',name:'Ironhide',role:'Hardtop truck',color:'#615640',trim:'#e77632',speed:1,accel:1,turn:1},
  {id:'crestline',name:'Crestline Eight',role:'Vintage tourer',color:'#17181b',trim:'#eee4cd',speed:1,accel:1,turn:1},
  {id:'manta',name:'Manta Speedster',role:'Single-seat speedster',color:'#bdc5da',trim:'#9df8ff',speed:1,accel:1,turn:1},
  {id:'saucer',name:'Silver Saucer',role:'Open-cockpit hovercraft',color:'#bec4c8',trim:'#63f3e8',speed:1,accel:1,turn:1},
  {id:'shopping-cart',name:'Shopping Cart',role:'Wire-basket racer',color:'#dd392b',trim:'#ced7dc',speed:1,accel:1,turn:1},
  {id:'skipper',name:'Skipper',role:'Amphibious racer',color:'#193754',trim:'#f1dfbc',speed:1,accel:1,turn:1}
];
export const DRIVERS = [
  {id:'sproto',name:'Sproto',skin:'#a9c989',suit:'#354448',accent:'#f7663f',cap:'#f7eaca'},
  {id:'pip',name:'Pip',skin:'#8bc9d2',suit:'#326179',accent:'#ffbe4f',cap:'#273d52'},
  {id:'miso',name:'Miso',skin:'#e8ac89',suit:'#773c50',accent:'#fae5ad',cap:'#bb5659'},
  {id:'rook',name:'Rook',skin:'#b8a6cc',suit:'#46425b',accent:'#b5e0aa',cap:'#444b5b'}
];
export const carById = id => CARS.find(car=>car.id===id) ?? CARS[0];
export const driverById = id => DRIVERS.find(driver=>driver.id===id) ?? DRIVERS[0];
export function racerSetup(id, selection={}) {
  const car=carById(selection.car),driver=driverById(selection.driver);
  return {
    car: CARS[(CARS.indexOf(car)+id)%CARS.length],
    driver: DRIVERS[(DRIVERS.indexOf(driver)+id)%DRIVERS.length]
  };
}

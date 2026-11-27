import {CONCEPT_CARS} from './concept-roster.js';
import {withClass} from './car-classes.js';
// The garage and simulation share the same multipliers, set by each car's class (car-classes.js).
// Characters are cosmetic.
const STOCK_CARS = [
  {id:'apex',name:'Apex',role:'All-rounder',color:'#f65a32',trim:'#fff1c9'},
  {id:'needle',name:'Needle',role:'Straight-line speed',color:'#47a6ca',trim:'#e0f5da'},
  {id:'pogo',name:'Pogo',role:'Quick recovery',color:'#efa834',trim:'#522f43'},
  {id:'gecko',name:'Gecko',role:'Tight corners',color:'#99c84d',trim:'#243d39'},
  {id:'relay',name:'Relay',role:'Fast exits',color:'#ae81dc',trim:'#fff0cc'},
  {id:'geep',name:'Geep',role:'Rally buggy',color:'#729749',trim:'#c2ed66'},
  {id:'hexshift',name:'Hexshift',role:'Lunar roadster',color:'#55163d',trim:'#ffdfad'},
  {id:'barrage',name:'Barrage',role:'Pulse blasters',color:'#ed6327',trim:'#ffe9c7'},
  {id:'ironhide',name:'Ironhide',role:'Hardtop truck',color:'#615640',trim:'#e77632'},
  {id:'crestline',name:'Crestline Eight',role:'Vintage tourer',color:'#17181b',trim:'#eee4cd'},
  {id:'manta',name:'Manta Speedster',role:'Single-seat speedster',color:'#bdc5da',trim:'#9df8ff'},
  {id:'saucer',name:'Silver Saucer',role:'Open-cockpit hovercraft',color:'#bec4c8',trim:'#63f3e8'},
  {id:'shopping-cart',name:'Shopping Cart',role:'Wire-basket racer',color:'#dd392b',trim:'#ced7dc'},
  {id:'skipper',name:'Skipper',role:'Amphibious racer',color:'#193754',trim:'#f1dfbc'}
];
const LEGACY_CARS = STOCK_CARS.map(withClass);
export const CARS = [...LEGACY_CARS,...CONCEPT_CARS.map(withClass)];
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
    car: id===0?car:LEGACY_CARS[((LEGACY_CARS.indexOf(car)>=0?LEGACY_CARS.indexOf(car):0)+id)%LEGACY_CARS.length],
    driver: DRIVERS[(DRIVERS.indexOf(driver)+id)%DRIVERS.length]
  };
}

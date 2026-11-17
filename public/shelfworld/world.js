import {location} from './catalog.js';
export const shelves=Array.from({length:24},(_,i)=>location(i*60));
export const obstacles=[...[-10,10].map(x=>({x,z:10,w:3.3,d:1.3})),...[-10,10].flatMap(x=>[-2,0,2].map(dx=>({x:x+dx,z:11.7,w:.7,d:.7}))),...[-16,16].flatMap(x=>[-17,10].map(z=>({x,z,w:1.1,d:1.1})))];
export function blocked(x,z){return Math.abs(x)>16||z>13||z< -18.5||shelves.some(p=>Math.abs(p.x-x)<2.4&&Math.abs(p.z-z)<.95)||obstacles.some(p=>Math.abs(p.x-x)<p.w&&Math.abs(p.z-z)<p.d);}
export function nearestShelf(x,z){let nearest=null,best=1.8;for(const p of shelves){const dx=Math.max(0,Math.abs(p.x-x)-2),dz=z-(p.z+.5);if(dz<0)continue;const d=Math.hypot(dx,dz);if(d<best){best=d;nearest=p.shelf;}}return nearest;}
export function lightPosition(slot){const p=location(slot);return {x:p.x-1.65+(p.column-1)*.3,y:.26+(p.row-1)*.65,z:p.z+.52};}
export function lightOn(elapsed,reduced=false){return reduced||elapsed%1400<700;}

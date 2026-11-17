import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,location,mergeBooks,validBooks,CAPACITY} from '../public/shelfworld/catalog.js';
import {shelves,blocked,nearestShelf,lightPosition,lightOn} from '../public/shelfworld/world.js';
test('all 1440 book and LED positions are distinct and on the correct shelf',()=>{
 const positions=new Set();
 for(let i=0;i<CAPACITY;i++){const p=location(i),l=lightPosition(i);assert.ok(p.shelf>=0&&p.shelf<24);assert.ok(Math.abs(l.x-p.x)<2);assert.ok(l.y>.2&&l.y<3.5);assert.equal(l.z,p.z+.52);positions.add(JSON.stringify(l));}
 assert.equal(positions.size,CAPACITY);
});
test('every book can be approached from the entrance without crossing furniture',()=>{
 const step=.25,key=(x,z)=>`${x},${z}`,queue=[[0,12]],seen=new Set([key(0,12)]);
 for(let i=0;i<queue.length;i++){const [x,z]=queue[i];for(const [dx,dz] of [[step,0],[-step,0],[0,step],[0,-step]]){const nx=x+dx,nz=z+dz,k=key(nx,nz);if(!seen.has(k)&&!blocked(nx,nz)){seen.add(k);queue.push([nx,nz]);}}}
 for(let slot=0;slot<CAPACITY;slot++){const p=location(slot),l=lightPosition(slot),x=Math.round(l.x/step)*step,z=p.z+1.5;assert.ok(seen.has(key(x,z)),`book ${slot} unreachable`);assert.equal(nearestShelf(x,z),p.shelf);}
});
test('existing book positions survive import and malformed rows are skipped',()=>{
 const r=mergeBooks(seed,{books:[null,{}, {title:'새 책',author:'저자'},{title:'코스모스',author:'칼 세이건'}]});assert.equal(r.added,1);assert.equal(r.skipped,3);assert.deepEqual(r.books.slice(0,24),seed);assert.ok(validBooks(r.books));assert.throws(()=>mergeBooks(seed,null));
});
test('ISBN survives export/import without duplicate books',()=>{
 const a=mergeBooks([],{books:[{title:'A',author:'B',isbn:'978-1-234',slot:730}]}).books;
 const b=mergeBooks([],JSON.parse(JSON.stringify({books:a}))).books;
 assert.equal(b[0].slot,730);assert.equal(b[0].isbn,'9781234');assert.equal(mergeBooks(b,[{title:'다른 표기',author:'B',isbn:'9781234'}]).added,0);
});
test('capacity failure does not mutate existing records',()=>{
 const full=Array.from({length:1440},(_,slot)=>({id:String(slot),title:String(slot),author:'a',category:'기타',slot}));const before=JSON.stringify(full);assert.throws(()=>mergeBooks(full,[{title:'new'}]));assert.equal(JSON.stringify(full),before);
});
test('invalid saved slots and duplicate IDs are rejected',()=>{assert.ok(validBooks(seed));assert.equal(validBooks([{...seed[0],slot:-1}]),false);assert.equal(validBooks([{...seed[0]},{...seed[1],id:seed[0].id}]),false);});
test('light repeats 700ms on and 700ms off; reduced-motion stays lit',()=>{for(const [ms,on] of [[0,true],[699,true],[700,false],[1399,false],[1400,true],[2100,false]])assert.equal(lightOn(ms),on);assert.equal(lightOn(700,true),true);});

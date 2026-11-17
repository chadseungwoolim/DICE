export const CAPACITY=1440;
const titles=[['소년이 온다','한강','문학'],['코스모스','칼 세이건','과학'],['사피엔스','유발 하라리','인문'],['어린 왕자','앙투안 드 생텍쥐페리','문학'],['이기적 유전자','리처드 도킨스','과학'],['데미안','헤르만 헤세','문학'],['시간의 역사','스티븐 호킹','과학'],['채식주의자','한강','문학'],['정의란 무엇인가','마이클 샌델','인문'],['1984','조지 오웰','문학'],['멋진 신세계','올더스 헉슬리','문학'],['총 균 쇠','재레드 다이아몬드','인문'],['침묵의 봄','레이첼 카슨','과학'],['페스트','알베르 카뮈','문학'],['노인과 바다','어니스트 헤밍웨이','문학'],['물고기는 존재하지 않는다','룰루 밀러','과학'],['아몬드','손원평','문학'],['오만과 편견','제인 오스틴','문학'],['종의 기원','찰스 다윈','과학'],['국가','플라톤','인문'],['별의 계승자','제임스 P. 호건','문학'],['엔트로피','제레미 리프킨','과학'],['변신','프란츠 카프카','문학'],['월든','헨리 데이비드 소로','인문']];
export const seed=titles.map((b,i)=>({id:'demo-'+i,title:b[0],author:b[1],category:b[2],slot:i*60,source:'예시 도서'}));
export function location(slot){const shelf=Math.floor(slot/60);return {shelf,row:Math.floor(slot%60/12)+1,column:slot%12+1,x:[-13,-8,-3,3,8,13][shelf%6],z:(Math.floor(shelf/6)-1.5)*6-3,address:`A${String(shelf+1).padStart(2,'0')} · ${Math.floor(slot%60/12)+1}단 · ${slot%12+1}번`};}
export function validBooks(data){return Array.isArray(data)&&data.length<=CAPACITY&&data.every(b=>b&&typeof b.id==='string'&&b.id&&typeof b.title==='string'&&b.title.trim()&&typeof b.author==='string'&&typeof b.category==='string'&&Number.isInteger(b.slot)&&b.slot>=0&&b.slot<CAPACITY)&&new Set(data.map(b=>b.id)).size===data.length&&new Set(data.map(b=>b.slot)).size===data.length;}
export function mergeBooks(current,data){
  const rows=Array.isArray(data)?data:data?.books||data?.spines;
  if(!Array.isArray(rows))throw Error('books 또는 spines 배열이 있는 JSON을 선택해 주세요.');
  if(rows.length>CAPACITY)throw Error('이 시제품은 최대 1,440권을 지원합니다.');
  const result=current.map(b=>({...b})),used=new Set(result.map(b=>b.slot)),ids=new Set(result.map(b=>b.id));
  let added=0,skipped=0;
  for(const r of rows){
    if(!r||typeof r.title!=='string'||!r.title.trim()){skipped++;continue;}
    const title=r.title.trim().slice(0,200),author=String(r.author||'저자 미상').slice(0,100);
    const isbn=String(r.isbn||'').replace(/[\s-]/g,'');
    const id=isbn?`isbn:${isbn}`:`book:${title}|${author}`;
    if(ids.has(id)||result.some(b=>b.title===title&&b.author===author)){skipped++;continue;}
    let slot=Number.isInteger(r.slot)&&r.slot>=0&&r.slot<CAPACITY&&!used.has(r.slot)?r.slot:0;
    while(used.has(slot))slot++;
    if(slot>=CAPACITY)throw Error('서가가 가득 찼습니다. 최대 1,440권까지 등록 가능합니다.');
    used.add(slot);ids.add(id);result.push({id,title,author,category:['문학','과학','인문'].includes(r.category)?r.category:'기타',slot,source:'가져온 도서',...(isbn?{isbn}:{}),original:r.original||r});added++;
  }
  return {books:result,added,skipped};
}

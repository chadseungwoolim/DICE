// SHELFWORLD 추천: a small, self-contained recommender. No outside AI service is used.
//
//   1. parseIntent  — reads a free-form Korean request with a hand-made lexicon (slot filling):
//                     literature of which country, fiction or not, subject field, genre/mood, preferences.
//   2. planQueries  — turns the intent into a handful of National Library catalogue searches.
//   3. rank         — groups editions of the same work, scores each work with weighted, explainable
//                     features (class number, genre words in the title, genre authors, number of editions, ...)
//                     and returns the best ones with the reasons.
import type { Book } from "./nl";

// ---------------------------------------------------------------- lexicon

interface Lit { id: string; label: string; words: string[]; code: string; fiction: string; kw: string }
// KDC literature by language/country. fiction = class of novels in that literature.
export const LITS: Lit[] = [
  { id: "ko", label: "한국", words: ["한국", "국내", "우리나라"], code: "81", fiction: "813", kw: "한국" },
  { id: "zh", label: "중국", words: ["중국"], code: "82", fiction: "823", kw: "중국" },
  { id: "ja", label: "일본", words: ["일본"], code: "83", fiction: "833", kw: "일본" },
  { id: "en", label: "영미", words: ["영미", "영국", "미국", "영어권"], code: "84", fiction: "843", kw: "영미" },
  { id: "de", label: "독일", words: ["독일"], code: "85", fiction: "853", kw: "독일" },
  { id: "fr", label: "프랑스", words: ["프랑스"], code: "86", fiction: "863", kw: "프랑스" },
  { id: "es", label: "스페인, 중남미", words: ["스페인", "중남미", "남미", "라틴아메리카"], code: "87", fiction: "873", kw: "스페인" },
  { id: "it", label: "이탈리아", words: ["이탈리아"], code: "88", fiction: "883", kw: "이탈리아" },
  { id: "ru", label: "러시아", words: ["러시아", "소련"], code: "892.8", fiction: "892.83", kw: "러시아" },
];
const LIT_CONTEXT = ["문학", "소설", "작가", "시집", "희곡", "수필", "에세이", "장편", "단편"];

interface Subject { label: string; words: string[]; prefixes: string[] }
// Non-fiction fields → KDC class prefixes.
export const SUBJECTS: Subject[] = [
  { label: "인공지능", words: ["인공지능", "AI", "머신러닝", "딥러닝"], prefixes: ["004.73"] },
  { label: "컴퓨터, 프로그래밍", words: ["컴퓨터", "프로그래밍", "코딩", "파이썬", "자바스크립트", "알고리즘"], prefixes: ["004", "005"] },
  { label: "수학", words: ["수학", "미적분", "기하", "통계학"], prefixes: ["41"] },
  { label: "물리학", words: ["물리", "양자", "상대성"], prefixes: ["42"] },
  { label: "화학", words: ["화학", "원소", "분자"], prefixes: ["43"] },
  { label: "천문학, 우주", words: ["천문", "우주", "블랙홀", "별자리", "은하"], prefixes: ["44"] },
  { label: "과학 일반", words: ["과학책", "교양 과학", "과학 교양", "과학 이야기"], prefixes: ["40"] },
  { label: "지구과학", words: ["지구과학", "지질", "기후", "날씨", "화산", "지진"], prefixes: ["45"] },
  { label: "생명과학", words: ["생물", "생명과학", "유전자", "진화", "세포"], prefixes: ["47"] },
  { label: "식물", words: ["식물", "나무", "꽃"], prefixes: ["48"] },
  { label: "동물", words: ["동물", "곤충", "새", "고양이", "강아지"], prefixes: ["49"] },
  { label: "의학, 건강", words: ["의학", "건강", "질병", "다이어트", "운동법"], prefixes: ["51"] },
  { label: "요리", words: ["요리", "레시피", "베이킹", "음식"], prefixes: ["594"] },
  { label: "건축", words: ["건축", "인테리어"], prefixes: ["54"] },
  { label: "철학", words: ["철학", "사상", "인생론"], prefixes: ["1"] },
  { label: "심리학", words: ["심리", "감정 조절"], prefixes: ["18"] },
  { label: "종교", words: ["종교", "불교", "기독교", "성경"], prefixes: ["2"] },
  { label: "경제, 경영", words: ["경제", "경영", "투자", "주식", "마케팅", "돈"], prefixes: ["32"] },
  { label: "사회", words: ["사회문제", "사회학", "젠더", "인권"], prefixes: ["33"] },
  { label: "정치", words: ["정치", "민주주의"], prefixes: ["34"] },
  { label: "법", words: ["법률", "법학"], prefixes: ["36"] },
  { label: "교육", words: ["교육", "공부법", "학습법"], prefixes: ["37"] },
  { label: "미술, 디자인", words: ["미술", "그림", "디자인", "회화"], prefixes: ["65", "60"] },
  { label: "음악", words: ["음악", "클래식", "작곡"], prefixes: ["67"] },
  { label: "사진", words: ["사진"], prefixes: ["66"] },
  { label: "스포츠", words: ["스포츠", "축구", "야구", "농구"], prefixes: ["69"] },
  { label: "언어", words: ["영어 공부", "외국어", "언어학", "문법"], prefixes: ["7"] },
  { label: "역사", words: ["역사", "세계사", "한국사"], prefixes: ["9"] },
  { label: "여행, 지리", words: ["여행", "지리"], prefixes: ["98"] },
];

interface Genre { id: string; label: string; words: string[]; keywords: string[]; authors: { n: string; lit?: string; w?: number }[]; fiction: boolean }
export const GENRES: Genre[] = [
  {
    id: "mystery", label: "추리, 미스터리", fiction: true,
    words: ["미스터리", "미스테리", "추리", "탐정", "스릴러", "범죄", "살인", "수수께끼", "반전"],
    keywords: ["추리", "미스터리", "미스테리", "탐정", "살인", "사건", "스릴러", "범죄", "수수께끼", "음모", "비밀"],
    authors: [
      { n: "코난 도일", lit: "en" }, { n: "크리스티", lit: "en" }, { n: "히가시노", lit: "ja" }, { n: "엘러리 퀸", lit: "en" },
      { n: "미야베", lit: "ja" }, { n: "르블랑", lit: "fr" }, { n: "챈들러", lit: "en" }, { n: "에도가와", lit: "ja" },
      { n: "요코미조", lit: "ja" }, { n: "심농", lit: "fr" }, { n: "정유정", lit: "ko" }, { n: "김언수", lit: "ko" },
      { n: "아쿠닌", lit: "ru" }, { n: "도스토옙스키", lit: "ru", w: 1.6 }, { n: "도스토예프스키", lit: "ru", w: 1.6 },
      { n: "넬레 노이하우스", lit: "de" }, { n: "피츠제크", lit: "de" }, { n: "움베르토 에코", lit: "it" },
    ],
  },
  {
    id: "uncanny", label: "신비, 기묘", fiction: true,
    words: ["미스터리", "미스테리", "신비", "기묘", "기이", "몽환", "환상적", "초현실"],
    keywords: ["신비", "기묘", "환상", "악마", "유령", "마법", "꿈", "비밀", "그림자"],
    authors: [
      { n: "불가코프", lit: "ru" }, { n: "고골", lit: "ru" }, { n: "카프카", lit: "de" }, { n: "보르헤스", lit: "es" },
      { n: "마르케스", lit: "es" }, { n: "무라카미 하루키", lit: "ja" }, { n: "앨런 포", lit: "en" }, { n: "칼비노", lit: "it" },
    ],
  },
  {
    id: "horror", label: "공포", fiction: true,
    words: ["공포", "호러", "무서운", "괴담", "소름", "오싹"],
    keywords: ["공포", "호러", "괴담", "유령", "귀신", "저주", "악몽", "좀비"],
    authors: [{ n: "스티븐 킹", lit: "en" }, { n: "러브크래프트", lit: "en" }, { n: "앨런 포", lit: "en" }, { n: "셜리 잭슨", lit: "en" }, { n: "고골", lit: "ru" }],
  },
  {
    id: "sf", label: "SF", fiction: true,
    words: ["SF", "에스에프", "공상과학", "과학소설", "우주 소설", "로봇", "디스토피아"],
    keywords: ["SF", "과학소설", "우주", "로봇", "미래", "행성", "인공지능", "디스토피아"],
    authors: [
      { n: "아시모프", lit: "en" }, { n: "필립 K", lit: "en" }, { n: "르 귄", lit: "en" }, { n: "테드 창", lit: "en" },
      { n: "류츠신", lit: "zh" }, { n: "김초엽", lit: "ko" }, { n: "쥘 베른", lit: "fr" }, { n: "자먀찐", lit: "ru" }, { n: "스트루가츠키", lit: "ru" },
    ],
  },
  {
    id: "fantasy", label: "판타지", fiction: true,
    words: ["판타지", "마법", "용사", "이세계"],
    keywords: ["판타지", "마법", "마법사", "드래곤", "왕국", "전설"],
    authors: [{ n: "톨킨", lit: "en" }, { n: "롤링", lit: "en" }, { n: "미하엘 엔데", lit: "de" }, { n: "르 귄", lit: "en" }, { n: "이영도", lit: "ko" }],
  },
  {
    id: "romance", label: "사랑", fiction: true,
    words: ["로맨스", "연애", "사랑 이야기", "설레", "멜로"],
    keywords: ["사랑", "연애", "로맨스", "연인"],
    authors: [{ n: "제인 오스틴", lit: "en" }, { n: "브론테", lit: "en" }, { n: "투르게네프", lit: "ru" }, { n: "톨스토이", lit: "ru" }],
  },
  {
    id: "adventure", label: "모험", fiction: true,
    words: ["모험", "탐험", "항해"],
    keywords: ["모험", "탐험", "보물", "항해", "여행"],
    authors: [{ n: "쥘 베른", lit: "fr" }, { n: "스티븐슨", lit: "en" }, { n: "마크 트웨인", lit: "en" }, { n: "뒤마", lit: "fr" }],
  },
  {
    id: "humor", label: "유머", fiction: true,
    words: ["웃긴", "유머", "코믹", "웃음", "풍자"],
    keywords: ["유머", "웃음", "코믹", "풍자"],
    authors: [{ n: "체호프", lit: "ru" }, { n: "고골", lit: "ru" }, { n: "마크 트웨인", lit: "en" }, { n: "성석제", lit: "ko" }],
  },
  {
    id: "warm", label: "감동, 위로", fiction: true,
    words: ["감동", "힐링", "위로", "따뜻한", "따뜻해", "눈물", "뭉클"],
    keywords: ["위로", "행복", "감동", "기적", "편지"],
    authors: [{ n: "생텍쥐페리", lit: "fr" }, { n: "손원평", lit: "ko" }, { n: "미치 앨봄", lit: "en" }],
  },
  {
    id: "war", label: "전쟁", fiction: true,
    words: ["전쟁"],
    keywords: ["전쟁", "전투", "병사"],
    authors: [{ n: "레마르크", lit: "de" }, { n: "톨스토이", lit: "ru" }, { n: "헤밍웨이", lit: "en" }, { n: "숄로호프", lit: "ru" }],
  },
  {
    id: "growth", label: "성장", fiction: true,
    words: ["성장", "청춘", "사춘기"],
    keywords: ["성장", "소년", "소녀", "청춘"],
    authors: [{ n: "헤세", lit: "de" }, { n: "샐린저", lit: "en" }, { n: "황순원", lit: "ko" }],
  },
];

const POPULAR = ["재미", "재밌", "재밋", "인기", "유명", "명작", "베스트", "대표작", "꿀잼", "흥미"];
const CLASSIC = ["고전", "명작"];
const RECENT = ["최신", "요즘", "최근", "신간", "새로 나온"];
const SHORT = ["짧은", "단편", "가벼운", "가볍게", "얇은"];
const LONG = ["두꺼운", "긴 ", "장편", "대작", "벽돌"];
const KIDS = ["어린이", "초등", "동화", "그림책"];
const EASY = ["쉬운", "쉽게", "쉽고", "입문", "초보", "기초"];
const TEEN = ["청소년", "중학생", "고등학생", "십대"];
const FICTION_WORDS = ["소설", "이야기", "픽션"];
const POEM_WORDS = ["시집", "시인"];
const ESSAY_WORDS = ["수필", "에세이"];

const STOP = new Set(
  "책 책을 책이 책은 지는 해지는 되는 관한 대한 관해 나온 나오는 해지는 읽고 읽을 읽기 읽는 싶어 싶다 싶은 싶어요 추천 추천해 추천해줘 추천해주세요 해줘 해주세요 좋겠어 좋겠어요 좋아 좋은 좋겠다 엄청 되게 정말 진짜 너무 아주 매우 완전 좀 그냥 같은 그런 이런 저런 하는 한데 인데 이면 이고 하고 있는 없는 있고 것 거 게 걸 뭐 무슨 어떤 아무 문학 소설 이야기 작품 내용 느낌 분위기 스타일 장르 쪽 종류 위주 중 중에 요즘 나 저 제가 내가 우리 줘 줘요 알려줘 알려 찾아줘 찾아 원해 원함 원해요 하나 몇 권 개".split(" ")
);
const PARTICLE = /(으로|에서|에게|이랑|하고|이면|이고|이나|처럼|같은|스러운|적인|이라|라는|인데|한데|이다|입니다|이에요|예요|은|는|이|가|을|를|의|로|에|도|만|랑|와|과|면|고|요)$/;

// ---------------------------------------------------------------- intent

export interface Intent {
  raw: string;
  lit: Lit | null;
  form: "fiction" | "poem" | "essay" | null;
  subjects: Subject[];
  subjectWords: string[]; // the subject words actually written (e.g. 파이썬), searched as keywords too
  genres: Genre[];
  popular: boolean;
  classic: boolean;
  recent: boolean;
  short: boolean;
  long: boolean;
  kids: boolean;
  teen: boolean;
  easy: boolean;
  anchor: { n: string; lit?: string } | null; // an author the reader named ("히가시노 같은")
  terms: string[]; // words the lexicon did not explain (author names, titles, topics)
}

const has = (t: string, words: string[]) => words.some((w) => t.includes(w.toLowerCase()));

export function parseIntent(input: string): Intent {
  const raw = input.trim().slice(0, 200);
  const t = " " + raw.toLowerCase().replace(/\s+/g, " ") + " ";
  let rest = t;
  const eat = (words: string[]) => {
    for (const w of words) rest = rest.split(w.toLowerCase()).join(" ");
  };

  const genres = GENRES.filter((g) => has(t, g.words));
  genres.forEach((g) => eat(g.words));
  let form: Intent["form"] = null;
  if (has(t, POEM_WORDS)) form = "poem";
  else if (has(t, ESSAY_WORDS)) form = "essay";
  else if (has(t, FICTION_WORDS) || genres.some((g) => g.fiction)) form = "fiction";
  eat([...FICTION_WORDS, ...POEM_WORDS, ...ESSAY_WORDS]);

  const litHit = LITS.find((l) => has(t, l.words)) || null;
  const literary = has(t, LIT_CONTEXT) || form !== null;
  const lit = litHit && literary ? litHit : null;
  if (lit) eat(lit.words);
  eat(LIT_CONTEXT);

  const subjects = form === "fiction" ? [] : SUBJECTS.filter((s) => has(t, s.words));
  const subjectWords = subjects.flatMap((s) => s.words.filter((w) => t.includes(w.toLowerCase())));
  subjects.forEach((s) => eat(s.words));

  const flags = {
    popular: has(t, POPULAR), classic: has(t, CLASSIC), recent: has(t, RECENT),
    short: has(t, SHORT), long: has(t, LONG), kids: has(t, KIDS), teen: has(t, TEEN), easy: has(t, EASY),
  };
  eat([...POPULAR, ...CLASSIC, ...RECENT, ...SHORT, ...LONG, ...KIDS, ...TEEN, ...EASY]);

  const terms: string[] = [];
  for (let w of rest.split(/[\s,.!?~"'“”‘’()/·]+/)) {
    w = w.trim();
    for (let i = 0; i < 2 && w.length > 2 && PARTICLE.test(w); i++) {
      const c = w.replace(PARTICLE, "");
      if (c.length < 2) break;
      w = c;
    }
    if (w.length > 2 && w.endsWith("책")) w = w.slice(0, -1);
    if (w.length < 2 || STOP.has(w) || /^(있|없|하|되|싶|좋|같|읽)/.test(w) && w.length <= 3) continue;
    if (!terms.includes(w)) terms.push(w);
  }
  // a country named without literary context is just a topic word
  if (litHit && !lit && !terms.includes(litHit.kw)) terms.unshift(litHit.kw);

  // an author from the genre lexicon ("히가시노 게이고 같은 ...") anchors country, form and genre
  let anchor: Intent["anchor"] = null;
  let litOut = lit;
  let formOut = form;
  const flat = t.replace(/\s/g, "");
  for (const g of GENRES)
    for (const a of g.authors)
      if (!anchor && flat.includes(a.n.replace(/\s/g, "").toLowerCase())) {
        anchor = a;
        if (!genres.some((x) => x.id === g.id)) genres.push(g);
      }
  if (anchor) {
    if (!litOut && anchor.lit) litOut = LITS.find((l) => l.id === anchor!.lit) || null;
    if (!formOut) formOut = "fiction";
    subjects.length = 0;
    subjectWords.length = 0;
  }
  return { raw, lit: litOut, form: formOut, subjects, subjectWords, genres, ...flags, anchor, terms: terms.slice(0, 4) };
}

/** what the recommender understood, for display */
export function describe(i: Intent): string[] {
  const out: string[] = [];
  if (i.lit) out.push(`${i.lit.label} ${i.form === "fiction" ? "소설" : i.form === "poem" ? "시" : i.form === "essay" ? "수필" : "문학"}`);
  else if (i.form === "fiction") out.push("소설");
  else if (i.form === "poem") out.push("시");
  else if (i.form === "essay") out.push("수필");
  for (const s of i.subjects) out.push(s.label);
  for (const g of i.genres) out.push(g.label);
  if (i.popular) out.push("재미, 인기작 우선");
  if (i.classic) out.push("고전");
  if (i.recent) out.push("최근 책 우선");
  if (i.short) out.push("짧은 책");
  if (i.long) out.push("긴 책");
  if (i.easy) out.push("쉬운 책");
  if (i.anchor) out.push(`${i.anchor.n} 같은 작가`);
  if (i.kids) out.push("어린이");
  if (i.teen) out.push("청소년");
  for (const w of i.terms) out.push(`"${w}"`);
  return out;
}

// ---------------------------------------------------------------- query plan

export interface PlannedQuery { target: "total" | "title" | "author" | "cheonggu"; kwd: string; size: number; page: number }

export function classPrefix(i: Intent): string | null {
  if (!i.lit) return null;
  if (i.form === "fiction") return i.lit.fiction;
  if (i.form === "poem") return i.lit.code.length === 2 ? i.lit.code + "1" : i.lit.code + "1";
  if (i.form === "essay") return i.lit.code.length === 2 ? i.lit.code + "4" : i.lit.code + "4";
  return i.lit.code;
}

function genreAuthors(i: Intent) {
  const list: string[] = [];
  for (const g of i.genres)
    for (const a of g.authors) if ((!i.lit || a.lit === i.lit.id) && !list.includes(a.n)) list.push(a.n);
  return list;
}

export function planQueries(i: Intent): PlannedQuery[] {
  const q: PlannedQuery[] = [];
  const add = (target: PlannedQuery["target"], kwd: string, size = 100, page = 1) => {
    if (kwd && !q.some((x) => x.target === target && x.kwd === kwd && x.page === page)) q.push({ target, kwd, size, page });
  };
  const prefix = classPrefix(i);
  const fiction = i.form === "fiction";
  const terms = i.terms.join(" ");

  if (i.anchor) add("author", i.anchor.n, 50);
  if (prefix) for (let p = 1; p <= 3; p++) add("cheonggu", prefix, 100, p);
  for (const a of genreAuthors(i).slice(0, i.lit ? 4 : 3)) add("author", a, 50);
  const kws = i.genres.flatMap((g) => g.keywords.slice(0, 2));
  for (const k of kws.slice(0, 3)) add("total", i.lit ? `${i.lit.kw} ${k}` : fiction && !k.endsWith("소설") ? `${k}소설` : k, 100);
  for (const s of i.subjects.slice(0, 2)) add("cheonggu", s.prefixes[0], 100);
  for (const w of i.subjectWords.slice(0, 2)) add("total", w, 100);
  if (prefix && i.form === "fiction" && !i.genres.length) add("total", `${i.lit!.kw} ${i.classic ? "고전 " : ""}소설`, 100);
  if (terms) add("total", terms, 100);
  if (i.terms.length > 1) for (const w of i.terms.slice(0, 2)) add("total", w, 50);
  if (!q.length && i.raw) add("total", i.raw, 100);
  if (fiction && !prefix && !i.genres.length && !terms) add("total", "장편소설", 100);
  return q.slice(0, 10);
}

// ---------------------------------------------------------------- ranking

export interface Rec { book: Book; score: number; reasons: string[]; editions: number }

const ROLE = /(지은이|지음|옮긴이|옮김|글쓴이|글|그림|원작|각색|엮음|엮은이|편저|편역|감수|저자|역자|저|著|譯|역|편|作)\s*[:：]?/g;
export function authorKey(a: string): string {
  const first = a.split(/[;,|]/)[0].replace(ROLE, " ").replace(/\[[^\]]*\]|\([^)]*\)/g, " ");
  return first.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase().replace(/예프스키/g, "옙스키").slice(0, 12);
}
export function titleKey(t: string): string {
  let s = t.split(/\s[:=]\s|\s:\s?|=/)[0];
  s = s.replace(/^\([^)]*\)\s*/, "");
  s = s.replace(/[.,]?\s*(제?\s*\d+(\s*-\s*\d+)?\s*(권|부|편)?|상|중|하|상권|하권|上|下)\s*$/u, "");
  return s.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

const BAD = ["전집", "선집", "총서", "요약", "해설", "연구", "읽기", "이해", "강의", "논문", "개론", "입문", "문제집", "단어", "문법", "독해", "학습", "워크북", "큰글자", "축약"];
const KIDS_WORDS = ["어린이", "동화", "그림책", "초등"];

function isFictionClass(c: string) {
  return /^8[1-8]3/.test(c) || /^89\d\.\d3/.test(c) || /^89\d\.3/.test(c);
}

export function rank(i: Intent, books: Book[], limit = 12): Rec[] {
  const prefix = classPrefix(i);
  const authors = genreAuthors(i);
  const kws = [...new Set(i.genres.flatMap((g) => g.keywords))];
  const year = new Date().getFullYear();

  // group editions of the same work: same title, and the same author or the same 3-digit class
  const groups: Book[][] = [];
  const byTitle = new Map<string, Book[][]>();
  for (const b of books) {
    const tk = titleKey(b.title);
    if (!tk) continue;
    const ak = authorKey(b.author), c3 = b.classNo.slice(0, 3);
    const cands = byTitle.get(tk) || [];
    const g = cands.find((grp) =>
      grp.some((x) => (ak && authorKey(x.author) === ak) || (c3 && x.classNo.slice(0, 3) === c3) || (!c3 && !!x.classNo) || (!x.classNo && !!c3))
    );
    if (g) {
      if (!g.some((x) => x.id === b.id)) g.push(b);
    } else {
      const ng = [b];
      groups.push(ng);
      cands.push(ng);
      byTitle.set(tk, cands);
    }
  }

  const recs: Rec[] = [];
  for (const g of groups) {
    // representative: has a class number, newest year, has a cover
    const fits = (x: Book) => (prefix ? x.classNo.startsWith(prefix) : !!x.classNo);
    const rep = [...g].sort(
      (a, b) =>
        Number(fits(b)) - Number(fits(a)) ||
        Number(!!b.classNo) - Number(!!a.classNo) ||
        (parseInt(b.year) || 0) - (parseInt(a.year) || 0) ||
        Number(!!b.image) - Number(!!a.image)
    )[0];
    const cls = rep.classNo || g.find((x) => x.classNo)?.classNo || "";
    const title = rep.title;
    const r: string[] = [];
    let s = 0;

    if (prefix) {
      if (cls.startsWith(prefix)) {
        s += 3;
        r.push(`${i.lit!.label} ${i.form === "fiction" ? "소설" : "문학"} (${cls})`);
      } else if (cls) s -= 2.5;
      else s -= 0.8;
    } else if (i.form === "fiction") {
      if (isFictionClass(cls)) {
        s += 1.5;
        r.push(`소설 (${cls})`);
      } else if (cls) s -= 2.5;
    }
    for (const sub of i.subjects) {
      if (sub.prefixes.some((p) => cls.startsWith(p))) {
        s += 2.5;
        r.push(`${sub.label} 분야 (${cls})`);
        break;
      }
    }

    const hit = kws.filter((k) => title.includes(k));
    if (hit.length) {
      s += 2.2 + Math.min(1, hit.length - 1) * 0.8;
      r.push(`제목에 '${hit.slice(0, 2).join("', '")}'`);
    }
    const au = authors.find((a) => rep.author.replace(/\s/g, "").includes(a.replace(/\s/g, "")));
    if (au) {
      const gl = i.genres.find((x) => x.authors.some((y) => y.n === au))!;
      s += gl.authors.find((y) => y.n === au)!.w ?? 3;
      r.push(`${gl.label} 작가 ${au}`);
    }

    const termHits = i.terms.filter((w) => title.toLowerCase().includes(w) || rep.author.toLowerCase().includes(w));
    if (termHits.length) {
      s += 2 * termHits.length;
      r.push(`'${termHits.join("', '")}' 일치`);
    }

    // many editions in the catalogue = widely read; the main "재미" signal we have without reviews
    const ed = new Set(g.map((x) => (x.publisher || "") + (x.year || ""))).size;
    const popW = i.popular || i.classic ? 1.1 : 0.45;
    if (ed > 1) {
      s += Math.min(2.6, Math.log2(ed) * popW);
      if (ed >= 3) r.push(`판본 ${ed}종 (많이 읽힘)`);
    }
    const y = parseInt(rep.year) || 0;
    if (i.recent && y >= year - 8) {
      s += 1.5;
      r.push(`${y}년 출간`);
    }
    if (i.classic && y && y < 2000 && ed >= 2) s += 0.5;
    if (i.short && /단편/.test(title)) {
      s += 1.2;
      r.push("단편");
    }
    if (i.long && (/장편/.test(title) || /\d\s*-\s*\d|상권|하권|\.\s*\d+$/.test(title))) {
      s += 1;
      r.push("장편");
    }
    const kid = KIDS_WORDS.some((w) => title.includes(w));
    if (i.kids && kid) s += 1.5;
    else if (!i.kids && kid) s -= 1.5;
    if (i.teen && /청소년/.test(title)) s += 1.2;
    if (!i.teen && !i.kids && /청소년|논술/.test(title)) s -= 0.8;
    if (i.easy && /입문|쉽게|쉬운|처음|이야기|기초|청소년/.test(title)) {
      s += 1.4;
      r.push("쉽게 읽히는 제목");
    }
    const bad = BAD.filter((w) => !(i.easy && /입문|이해|읽기|학습/.test(w)));
    if (bad.some((w) => title.includes(w))) s -= i.form ? 3 : 1.2;
    if (!cls) s -= 0.4;
    if (!/[가-힣]/.test(title)) s -= 1.5; // prefer books in Korean

    if (!r.length) r.push("검색어와 관련된 책");
    recs.push({ book: rep, score: Math.round(s * 100) / 100, reasons: r, editions: ed });
  }
  recs.sort((a, b) => b.score - a.score || b.editions - a.editions || a.book.title.localeCompare(b.book.title, "ko"));
  // keep variety: at most 3 works by the same author
  const per = new Map<string, number>();
  const out: Rec[] = [];
  for (const x of recs) {
    const k = authorKey(x.book.author) || x.book.id;
    const n = per.get(k) || 0;
    if (n >= 3) continue;
    per.set(k, n + 1);
    out.push(x);
    if (out.length >= limit) break;
  }
  return out;
}

/* ═══ ペット：Daylog の星空に住む小さな子 ═══
   ・たまご → ちび → おとな（ほしドラ／よるコウモリ／ゆきうさ／ひだまりオン）。白1色のドット絵（20×20）
   ・ごはんは3種類：おにく（タスク・タイマー）→ ちから、やさい（記録・日記・夜モード・習慣）→ かしこさ、おやつ（早起き・早寝）→ ひかり
     その場で自動で食べる。食べた分は部屋の棚にもたまり、3つで1回「おかわり」をあげられる（1日3回まで）
   ・おとなの姿は能力で決まる：ちから→ほしドラ／かしこさ→ゆきうさ／ひかり→ひだまりオン／ひかりが低く夜ふかしが多い→よるコウモリ
   ・夜モードを終えると寝て、次の日は起きている。就寝の目安を過ぎてからのゲームは、眠そうな顔に出るだけ（叱らない）
   ・不調・休養の日は「何もしない」を肯定する。エサの催促はしない。連続記録は数えない（数えるのは会いに来た日）
   ・3日以上あいたら、旅に出ていたことにして、おみやげ（行った星座の名前）を持って帰る
   ・置き場所：今日のタブ（今日の流れの見出しか、これからの空きのどちらか。開くたびにランダム）と、星空タブの銀河の左下
   データ：pet/main（名前・生まれた日・進化した姿・旅・ステータスの控え）、days/<日付>.pet（seen：会いに来た／snacks：おやつの数）、petmail（チャットのClaudeからの手紙） */
const PET_SPR = {"chibi-happy":".........#........../........#o#........./.........#........../.........#........../.........#........../.........#........../.......######......./......#oooooo#....../.....#oooooooo#...../....#oooooooooo#..../...##ooooooooo#o#.../...#o#o#o#o#o#oo#.../...##ooo#o#ooo#o#.../...#oooooooooooo#.../...#oooooooooooo#.../....#oooooooooo#..../.....#oooooooo#...../.....##oooooo##...../.....#o######o#...../......##....##......","dora-happy":"....#..........#..../....############..../.....##oooooo##...../.....#oooooooo#...../....#oooooooooo#..../...##ooooooooo#o#.../...#o#o#o#o#o#oo#.../.#.##ooo#o#ooo#o#.#./.###oooooooooooo###./.#o##oooooooooo##o#./.#oo##oooooooo##oo#./.#ooo##oooooo##ooo#./.####.########.####./....##ooo#oooo##..../.....#oo###ooo#...../.....#o#####oo#...../.....#oo#o#ooo#...../.....##oooooo##...../.....#o#oooo#o#...../.....##########.....","bat-happy":"..................../.....#........#...../.....##......##...../#....#o######o#....#/##...#o#oooo#o#...##/#o##.##oooooo##.##o#/.#oo##oooooooo##oo#./.#oo#ooooooooo##oo#./.#oo##o#o#o#o#o#oo#./.#oo#ooo#o#ooo##oo#./.#oo#oooooooooo#oo#./###o#oooooooooo#o###/#..##oooooooooo##..#/....##oooooooo##..../....#.#oooooo#.#..../.......#oooo#......./........####......../........#..#......../........#..#......../....................","usa-happy":"......#......#....../.....#o#....#o#...../....#ooo#..#ooo#..../....#o#o#..#o#o#..../#...#o#o#..#o#o#..../....#ooo#..#ooo#.#.#/....#oo######oo#..#./.#..#o#oooooo#o#.#.#/....##oooooooo##..../....#oooooooooo#..../...##ooooooooo#o#.../...#o#o#o#o#o#oo#.../...##ooo#o#ooo#o#.../...#oooooooooooo#.../...#oooooooooooo#.../....#oooooooooo#..../.....#oooooooo#...../.....##oooooo##...../.....#o######o#...../......###..###......","lion-happy":"...#.....#.....#..../...#############..../...#############..../...#####oooo####..../...###oooooooo##..../#####oooooooooo####./#####oooooooooo####./.####ooooooooo#o##../.###o#o#o#o#o#oo##../.####ooo#o#ooo#o##../####oooooooooooo###./#####oooo##oooo####./...##oooooooooo#.##./...###oooooooo######/...#####oooo########/...#############.##./...#..#####.##.#..#./.....#oo##.#oo####../.....#oo#..#oo#...../.....####..####.....","chibi-normal":".........#........../........#o#........./.........#........../.........#........../.........#........../.........#........../.......######......./......#oooooo#....../.....#oooooooo#...../....#oooooooooo#..../...#oooooooooooo#.../...#oo#ooooo#ooo#.../...#oooooooooooo#.../...#ooo#o#o#oooo#.../...#oooo#o#ooooo#.../....#oooooooooo#..../.....#oooooooo#...../.....##oooooo##...../.....#o######o#...../......##....##......","dora-normal":"....#..........#..../....############..../.....##oooooo##...../.....#oooooooo#...../....#oooooooooo#..../...#oooooooooooo#.../...#oo#ooooo#ooo#.../.#.#oooooooooooo#.#./.###ooo#o#o#oooo###./.#o##ooo#o#oooo##o#./.#oo##oooooooo##oo#./.#ooo##oooooo##ooo#./.####.########.####./....##ooo#oooo##..../.....#oo###ooo#...../.....#o#####oo#...../.....#oo#o#ooo#...../.....##oooooo##...../.....#o#oooo#o#...../.....##########.....","bat-normal":"..................../.....#........#...../.....##......##...../#....#o######o#....#/##...#o#oooo#o#...##/#o##.##oooooo##.##o#/.#oo##oooooooo##oo#./.#oo#oooooooooo#oo#./.#oo#o#ooooo#oo#oo#./.#oo#oooooooooo#oo#./.#oo#oo#o#o#ooo#oo#./###o#ooo#o#oooo#o###/#..##oooooooooo##..#/....##oooooooo##..../....#.#oooooo#.#..../.......#oooo#......./........####......../........#..#......../........#..#......../....................","usa-normal":"......#......#....../.....#o#....#o#...../....#ooo#..#ooo#..../....#o#o#..#o#o#..../#...#o#o#..#o#o#..../....#ooo#..#ooo#.#.#/....#oo######oo#..#./.#..#o#oooooo#o#.#.#/....##oooooooo##..../....#oooooooooo#..../...#oooooooooooo#.../...#oo#ooooo#ooo#.../...#oooooooooooo#.../...#ooo#o#o#oooo#.../...#oooo#o#ooooo#.../....#oooooooooo#..../.....#oooooooo#...../.....##oooooo##...../.....#o######o#...../......###..###......","lion-normal":"...#.....#.....#..../...#############..../...#############..../...#####oooo####..../...###oooooooo##..../#####oooooooooo####./#####oooooooooo####./.###oooooooooooo##../.###oo#ooooo#ooo##../.###oooooooooooo##../####ooo#o#o#oooo###./#####ooo###oooo####./...##oooooooooo#.##./...###oooooooo######/...#####oooo########/...#############.##./...#..#####.##.#..#./.....#oo##.#oo####../.....#oo#..#oo#...../.....####..####.....","chibi-blink":".........#........../........#o#........./.........#........../.........#........../.........#........../.........#........../.......######......./......#oooooo#....../.....#oooooooo#...../....#oooooooooo#..../...#oooooooooooo#.../...#o##ooooo##oo#.../...#oooooooooooo#.../...#ooo#o#o#oooo#.../...#oooo#o#ooooo#.../....#oooooooooo#..../.....#oooooooo#...../.....##oooooo##...../.....#o######o#...../......##....##......","dora-blink":"....#..........#..../....############..../.....##oooooo##...../.....#oooooooo#...../....#oooooooooo#..../...#oooooooooooo#.../...#o##ooooo##oo#.../.#.#oooooooooooo#.#./.###ooo#o#o#oooo###./.#o##ooo#o#oooo##o#./.#oo##oooooooo##oo#./.#ooo##oooooo##ooo#./.####.########.####./....##ooo#oooo##..../.....#oo###ooo#...../.....#o#####oo#...../.....#oo#o#ooo#...../.....##oooooo##...../.....#o#oooo#o#...../.....##########.....","bat-blink":"..................../.....#........#...../.....##......##...../#....#o######o#....#/##...#o#oooo#o#...##/#o##.##oooooo##.##o#/.#oo##oooooooo##oo#./.#oo#oooooooooo#oo#./.#oo###ooooo##o#oo#./.#oo#oooooooooo#oo#./.#oo#oo#o#o#ooo#oo#./###o#ooo#o#oooo#o###/#..##oooooooooo##..#/....##oooooooo##..../....#.#oooooo#.#..../.......#oooo#......./........####......../........#..#......../........#..#......../....................","usa-blink":"......#......#....../.....#o#....#o#...../....#ooo#..#ooo#..../....#o#o#..#o#o#..../#...#o#o#..#o#o#..../....#ooo#..#ooo#.#.#/....#oo######oo#..#./.#..#o#oooooo#o#.#.#/....##oooooooo##..../....#oooooooooo#..../...#oooooooooooo#.../...#o##ooooo##oo#.../...#oooooooooooo#.../...#ooo#o#o#oooo#.../...#oooo#o#ooooo#.../....#oooooooooo#..../.....#oooooooo#...../.....##oooooo##...../.....#o######o#...../......###..###......","lion-blink":"...#.....#.....#..../...#############..../...#############..../...#####oooo####..../...###oooooooo##..../#####oooooooooo####./#####oooooooooo####./.###oooooooooooo##../.###o##ooooo##oo##../.###oooooooooooo##../####ooo#o#o#oooo###./#####ooo###oooo####./...##oooooooooo#.##./...###oooooooo######/...#####oooo########/...#############.##./...#..#####.##.#..#./.....#oo##.#oo####../.....#oo#..#oo#...../.....####..####.....","chibi-sleepy":".........#........../........#o#........./.........#........../.........#........../.........#........../.........#........../.......######......./......#oooooo#....../.....#oooooooo#...../....#oooooooooo#..../...##ooooooooo#o#.../...#o##ooooo##oo#.../...#oooooooooooo#.../...#ooo#o#o#oooo#.../...#oooo#o#ooooo#.../....#oooooooooo#..../.....#oooooooo#...../.....##oooooo##...../.....#o######o#...../......##....##......","dora-sleepy":"....#..........#..../....############..../.....##oooooo##...../.....#oooooooo#...../....#oooooooooo#..../...##ooooooooo#o#.../...#o##ooooo##oo#.../.#.#oooooooooooo#.#./.###ooo#o#o#oooo###./.#o##ooo#o#oooo##o#./.#oo##oooooooo##oo#./.#ooo##oooooo##ooo#./.####.########.####./....##ooo#oooo##..../.....#oo###ooo#...../.....#o#####oo#...../.....#oo#o#ooo#...../.....##oooooo##...../.....#o#oooo#o#...../.....##########.....","bat-sleepy":"..................../.....#........#...../.....##......##...../#....#o######o#....#/##...#o#oooo#o#...##/#o##.##oooooo##.##o#/.#oo##oooooooo##oo#./.#oo#ooooooooo##oo#./.#oo###ooooo##o#oo#./.#oo#oooooooooo#oo#./.#oo#oo#o#o#ooo#oo#./###o#ooo#o#oooo#o###/#..##oooooooooo##..#/....##oooooooo##..../....#.#oooooo#.#..../.......#oooo#......./........####......../........#..#......../........#..#......../....................","usa-sleepy":"......#......#....../.....#o#....#o#...../....#ooo#..#ooo#..../....#o#o#..#o#o#..../#...#o#o#..#o#o#..../....#ooo#..#ooo#.#.#/....#oo######oo#..#./.#..#o#oooooo#o#.#.#/....##oooooooo##..../....#oooooooooo#..../...##ooooooooo#o#.../...#o##ooooo##oo#.../...#oooooooooooo#.../...#ooo#o#o#oooo#.../...#oooo#o#ooooo#.../....#oooooooooo#..../.....#oooooooo#...../.....##oooooo##...../.....#o######o#...../......###..###......","lion-sleepy":"...#.....#.....#..../...#############..../...#############..../...#####oooo####..../...###oooooooo##..../#####oooooooooo####./#####oooooooooo####./.####ooooooooo#o##../.###o##ooooo##oo##../.###oooooooooooo##../####ooo#o#o#oooo###./#####ooo###oooo####./...##oooooooooo#.##./...###oooooooo######/...#####oooo########/...#############.##./...#..#####.##.#..#./.....#oo##.#oo####../.....#oo#..#oo#...../.....####..####.....","chibi-sleep":".........#......####/........#o#.......#./.........#.......#../.........#......####/.........#........../.........#........../.......######......./......#oooooo#....../.....#oooooooo#...../....#oooooooooo#..../...#oooooooooooo#.../...#oooooooooooo#.../...#o##ooooo##oo#.../...#oooooooooooo#.../...#oooo###ooooo#.../....#oooooooooo#..../.....#oooooooo#...../.....##oooooo##...../.....#o######o#...../......##....##......","dora-sleep":"....#..........#####/....############..#./.....##oooooo##..#../.....#oooooooo#.####/....#oooooooooo#..../...#oooooooooooo#.../...#oooooooooooo#.../.#.#o##ooooo##oo#.#./.###oooooooooooo###./.#o##ooo###oooo##o#./.#oo##oooooooo##oo#./.#ooo##oooooo##ooo#./.####.########.####./....##ooo#oooo##..../.....#oo###ooo#...../.....#o#####oo#...../.....#oo#o#ooo#...../.....##oooooo##...../.....#o#oooo#o#...../.....##########.....","bat-sleep":"................####/.....#........#...#./.....##......##..#../#....#o######o#.###o/##...#o#oooo#o#...##/#o##.##oooooo##.##o#/.#oo##oooooooo##oo#./.#oo#oooooooooo#oo#./.#oo#oooooooooo#oo#./.#oo###ooooo##o#oo#./.#oo#oooooooooo#oo#./###o#ooo###oooo#o###/#..##oooooooooo##..#/....##oooooooo##..../....#.#oooooo#.#..../.......#oooo#......./........####......../........#..#......../........#..#......../....................","usa-sleep":"......#......#..####/.....#o#....#o#...#./....#ooo#..#ooo#.#../....#o#o#..#o#o#####/#...#o#o#..#o#o#..../....#ooo#..#ooo#.#.#/....#oo######oo#..#./.#..#o#oooooo#o#.#.#/....##oooooooo##..../....#oooooooooo#..../...#oooooooooooo#.../...#oooooooooooo#.../...#o##ooooo##oo#.../...#oooooooooooo#.../...#oooo###ooooo#.../....#oooooooooo#..../.....#oooooooo#...../.....##oooooo##...../.....#o######o#...../......###..###......","lion-sleep":"...#.....#.....#####/...#############..#./...#############.#../...#####oooo########/...###oooooooo##..../#####oooooooooo####./#####oooooooooo####./.###oooooooooooo##../.###oooooooooooo##../.###o##ooooo##oo##../####oooooooooooo###./#####ooo###oooo####./...##oooooooooo#.##./...###oooooooo######/...#####oooo########/...#############.##./...#..#####.##.#..#./.....#oo##.#oo####../.....#oo#..#oo#...../.....####..####.....","egg":"..................../........####......../.......#oooo#......./......#oooooo#....../......#oooooo#....../.....#oooooo#o#...../.....#oooooooo#...../.....#oooooooo#...../.....#ooo#oooo#...../....#ooo#o#oooo#..../....#oooo#ooooo#..../....#oooooooooo#..../....#oooooooooo#..../....#oooooooooo#..../....#ooooooo#oo#..../.....#o#oooooo#...../.....#oooooooo#...../......#oooooo#....../.......#oooo#......./........####........","egg-crack":"..................../........####......../.......#oooo#......./......#oooooo#....../......#oooooo#....../.....#oooooo#o#...../.....#oooooooo#...../.....#oooooooo#...../.....#ooo#oooo#...../....#ooo#o#oooo#..../....##o#o#o#o#o#..../....#o#o#o#o#o##..../....#oooooooooo#..../....#oooooooooo#..../....#ooooooo#oo#..../.....#o#oooooo#...../.....#oooooooo#...../......#oooooo#....../.......#oooo#......./........####........","plant-0":"..................../..................../..................../..................../..................../..................../..................../..................../..................../..................../...........##......./.....##...#oo#....../....#oo#.#.##......./.....##..#........../.........#........../.....##########...../.....##########...../......#oooooo#....../......#oooooo#....../......########......","plant-1":"..................../..................../..................../..................../..................../..................../..................../..................../.....##....##......./....#oo#.##oo#....../.....##..#.##......./.....##..##oo#....../....#oo#.#.##......./.....##..#........../.........#........../.....##########...../.....##########...../......#oooooo#....../......#oooooo#....../......########......","plant-2":"..................../..................../..................../..................../..................../.....##....##......./....#oo#.##oo#....../.....##..#.##......./.....##..##oo#....../....#oo#.#.##......./.....##..#.##......./.....##..##oo#....../....#oo#.#.##......./.....##..#........../.........#........../.....##########...../.....##########...../......#oooooo#....../......#oooooo#....../......########......","plant-3":".........#........../........#o#........./.......#ooo#......../........#o#........./.........#........../.....##..#.##......./....#oo#.##oo#....../.....##..#.##......./.....##..##oo#....../....#oo#.#.##......./.....##..#.##......./.....##..##oo#....../....#oo#.#.##......./.....##..#........../.........#........../.....##########...../.....##########...../......#oooooo#....../......#oooooo#....../......########......"};
const PET_FORMS = {
  dora: { name: 'ほしドラ', theme: '星 × ドラゴン', why: 'ちから（おにく：タスク・タイマー）がいちばん高かった' },
  bat: { name: 'よるコウモリ', theme: '闇 × コウモリ', why: 'ひかり（おやつ：早起き・早寝）が低く、夜ふかしの日が多かった' },
  usa: { name: 'ゆきうさ', theme: '氷 × ウサギ', why: 'かしこさ（やさい：記録・日記）がいちばん高かった' },
  lion: { name: 'ひだまりオン', theme: '太陽 × ライオン', why: 'ひかり（おやつ：早起き・早寝）がいちばん高かった' },
};
const PET_HATCH = 20, PET_ADULT = 300, PET_EXTRA = 3, PET_EXTRA_MAX = 3;
const PET_FOODS = {
  meat: { name: 'おにく', stat: 'ちから', from: 'タスク・タイマー', c: 'var(--rose)', form: 'dora' },
  veg: { name: 'やさい', stat: 'かしこさ', from: '記録・日記・夜モード・習慣', c: 'var(--mint)', form: 'usa' },
  snack: { name: 'おやつ', stat: 'ひかり', from: '早起き・早寝', c: 'var(--gold)', form: 'lion' },
};
const PET_FOOD_KEYS = ['meat', 'veg', 'snack'];
const PET_FOOD_SPR = {"meat":"...####...../..#oooo#..../.#o#oooo#.../.#oo#ooo#.../.#ooo#oo#.../..#oooo##.../...####.##../........##../.......#oo#./......#ooo#./.......###../............","veg":"....#.#.#.../.....###..../....#####.../...#ooooo#../...#oo#oo#../....#ooo#.../....#o#o#.../.....#oo#.../.....#o#..../......#...../............/............","snack":"............/.#........#./.##.####.##./.#o#oooo#o#./.#oo#oo#oo#./.#o#oooo#o#./.##.####.##./.#........#./............/............/............/............"};
function petFoodSVG(k, px) {
  const rows = PET_FOOD_SPR[k].split('/'); let ink = '', pap = '';
  rows.forEach((r, y) => { let x = 0; while (x < r.length) { const ch = r[x]; let n = 1; while (x + n < r.length && r[x + n] === ch) n++; const seg = `M${x} ${y}h${n}v1h-${n}z`; if (ch === '#') ink += seg; else if (ch === 'o') pap += seg; x += n; } });
  return `<svg class="pet-food" viewBox="0 0 12 12" width="${px}" height="${px}" shape-rendering="crispEdges" aria-hidden="true"><path d="${pap}" fill="color-mix(in oklab, currentColor 22%, transparent)"/><path d="${ink}" fill="currentColor"/></svg>`;
}
const PET_PLACES = ['こぐまのランプ座', 'ねむれる時計塔座', '石積みの竪琴座', 'ほうき星の小道', '月うらの図書館', 'しずくの灯台座', 'ゆきどけの丘', 'ひだまりの屋根座', 'みずがめの井戸', '銀のつりばし座', 'あくびの雲海', 'そらいろの郵便局', 'ねこじゃらし星団', 'わたあめの入り江'];
const PET_STAGE_LABEL = { egg: 'たまご', chibi: 'ちび', adult: 'おとな' };
if (S.petSlot == null) S.petSlot = Math.random() < 0.5 ? 'sec' : 'gap'; // 今日のタブの置き場所（開くたびにランダム）

// 絵：横に続くマスを1本の線にまとめて SVG に
const petSvgCache = new Map();
function petSVG(key, px, cls = '') {
  let paths = petSvgCache.get(key);
  if (!paths) {
    const rows = (PET_SPR[key] || PET_SPR['chibi-normal']).split('/'); let ink = '', pap = '';
    rows.forEach((r, y) => { let x = 0; while (x < r.length) { const ch = r[x]; let n = 1; while (x + n < r.length && r[x + n] === ch) n++; const seg = `M${x} ${y}h${n}v1h-${n}z`; if (ch === '#') ink += seg; else if (ch === 'o') pap += seg; x += n; } });
    paths = { ink, pap }; petSvgCache.set(key, paths);
  }
  return `<svg class="pet-svg ${cls}" viewBox="0 0 20 20" width="${px}" height="${px}" shape-rendering="crispEdges" aria-hidden="true"><path d="${paths.pap}" fill="var(--pet-paper)"/><path d="${paths.ink}" fill="currentColor"/></svg>`;
}

/* ── 数える ── */
const petDoc = () => (S.pet && S.pet.main) || null;
const petOn = () => S.ready && !S.fatal && !S.settings.petHide && !!petDoc();
const petSoft = d => ['bad', 'rest'].includes(getDay(d).mode);
function petDoneByDay() { const m = {}; for (const t of Object.values(S.tasks)) if (t.status === 'done' && t.doneAt) (m[logicalDate(t.doneAt)] ||= []).push(t); return m; }
// その日のごはん（ほし）を3種類に分けて数える。あとから数え直すので、端末が2つあっても二重にならない
//  おにく：終えたタスク（軽2・ふつう4・重6）、タイマーの記録（⏱、1つ2・5つまで）
//  やさい：記録・日記（1つ2・5つまで）、夜モード（5）、習慣（1つ3）
//  おやつ：早起き（10時までに起きた5／12時まで3）、早寝（就寝の目安までに寝た4）
function petEarned(d, doneBy) {
  const day = getDay(d); const ents = day.entries || [];
  const timer = ents.filter(e => /^⏱/.test(e.text || '')).length, diary = ents.length - timer;
  let meat = Math.min(5, timer) * 2, veg = Math.min(5, diary) * 2, snack = 0;
  for (const t of (doneBy[d] || [])) meat += ({ light: 2, mid: 4, heavy: 6 })[t.weight] || 3;
  for (const h of habitList()) if (habitDone(day, h.id)) veg += 3;
  if (closedAt(d)) veg += 5;
  const w = wakeAt(d); if (w) { const h = (w - dayStart(d).getTime()) / 36e5; snack += h <= 4 ? 5 : h <= 6 ? 3 : 0; }
  const slept = closedAt(d) || getDay(d).sleepAt; const target = petBedTarget(d);
  if (slept && target && slept <= target) snack += 4;
  return { meat, veg, snack };
}
function petBedTarget(d) {
  const bt = getDay(d).bedtime; const ev = effEvents(d).find(x => !x.canceled && /^🌙\s*就寝の目安/.test(x.title || ''));
  return bt && bt.time ? slotDate(d, bt.time).getTime() : ev ? ev.start : null;
}
// 就寝の目安を過ぎてからのゲーム（分）と、いま目安を過ぎてゲーム中か
function petLate(d) {
  const target = petBedTarget(d); if (!target) return { min: 0, now: false };
  let min = 0, now = false; const t = Date.now();
  for (const g of gameSessions(d)) { if (g.to > target) min += (g.to - Math.max(g.from, target)) / 6e4; if (t > target && t - g.to < 12 * 6e4 && g.to > target) now = true; }
  return { min: Math.round(min), now };
}
// この2週間で夜ふかしだった日（3:30より後に寝た・就寝の目安を過ぎてゲーム30分以上）
function petNightDays() {
  const t = today(); let n = 0;
  for (let i = 0; i < 14; i++) { const d = addDays(t, -i); const s = closedAt(d) || sleepAt(d); if ((s && s - dayStart(d).getTime() > 21.5 * 36e5) || petLate(d).min >= 30) n++; }
  return n;
}
// おとなの姿：能力でいちばん高いもの。ひかりが低く（いちばん高い能力の1/3未満）夜ふかしが5日以上なら、よるコウモリ
function petFormOf(st) {
  const sc = { dora: st.power, usa: st.wisdom, lion: st.light }; const top = Math.max(sc.dora, sc.usa, sc.lion);
  if (top > 0 && st.light < top / 3 && petNightDays() >= 5) return 'bat';
  const order = ['dora', 'usa', 'lion'];
  return order.slice().sort((a, b) => sc[b] - sc[a] || order.indexOf(a) - order.indexOf(b))[0];
}
const petLean = () => petFormOf(petStats());
function petStats() {
  const p = petDoc(); if (!p) return null;
  const t = today(); const doneBy = petDoneByDay();
  const eat = { meat: 0, veg: 0, snack: 0 }, extra = { meat: 0, veg: 0, snack: 0 }; let seen = 0, earnedToday = { meat: 0, veg: 0, snack: 0 }, extraToday = 0;
  for (let d = p.bornDay || t, i = 0; d <= t && i < 800; d = addDays(d, 1), i++) {
    const e = petEarned(d, doneBy); const x = getDay(d).pet || {};
    const ex = { meat: 0, veg: 0, snack: 0, ...(x.extra || {}) }; if (x.snacks) ex.snack += x.snacks; // 前の形（おやつの数）も読む
    for (const k of PET_FOOD_KEYS) { eat[k] += e[k]; extra[k] += ex[k] || 0; }
    if (x.seen) seen++;
    if (d === t) { earnedToday = e; extraToday = PET_FOOD_KEYS.reduce((a, k) => a + (ex[k] || 0), 0); }
  }
  const extraN = PET_FOOD_KEYS.reduce((a, k) => a + extra[k], 0);
  const xp = eat.meat + eat.veg + eat.snack + extraN * 2;
  const stage = xp < PET_HATCH ? 'egg' : xp < PET_ADULT ? 'chibi' : 'adult';
  // 能力：食べたごはんの種類で育つ（おかわりは1回で3）
  const power = eat.meat + extra.meat * PET_EXTRA, wisdom = eat.veg + extra.veg * PET_EXTRA, light = eat.snack + extra.snack * PET_EXTRA;
  // 棚：食べた分がたまり、3つで1回おかわり
  const stock = {}; for (const k of PET_FOOD_KEYS) stock[k] = Math.max(0, Math.floor((eat[k] - extra[k] * PET_EXTRA) / PET_EXTRA));
  // 元気：昨夜の睡眠で決まり、目安を過ぎたゲームで少し減り、おかわりで少し戻る
  const w = wakeAt(t), s = sleepAt(addDays(t, -1)); let energy = 70, sleepH = null;
  if (w && s && w > s && w - s < 20 * 36e5) { sleepH = (w - s) / 36e5; energy = sleepH >= 7 ? 100 : sleepH >= 5 ? 70 + (sleepH - 5) * 15 : sleepH >= 3 ? 40 + (sleepH - 3) * 15 : Math.max(15, sleepH * 13); }
  const late = petLate(t); energy = Math.round(clamp(energy - Math.floor(late.min / 30) * 10 + extraToday * 3, 5, 100));
  const next = stage === 'egg' ? PET_HATCH : PET_ADULT; const prev = stage === 'egg' ? 0 : PET_HATCH;
  const todaySum = earnedToday.meat + earnedToday.veg + earnedToday.snack;
  return { xp, stage, form: p.form || null, power, wisdom, light, stock, bond: seen + extraN, energy, sleepH, late, earnedToday, todaySum, extraToday, grow: stage === 'adult' ? 1 : clamp((xp - prev) / (next - prev), 0, 1) };
}
const petAsleep = () => { const c = closedAt(today()); return !!(c && Date.now() >= c); };
function petFace(st) {
  if (petAsleep()) return 'sleep';
  if (S.petFx && S.petFx.until > Date.now()) return 'happy';
  if (st.late.now || (!petSoft(today()) && st.energy < 45)) return 'sleepy';
  return 'normal';
}
function petKey(st, face) {
  if (st.stage === 'egg') return st.xp >= PET_HATCH * 0.6 ? 'egg-crack' : 'egg';
  const base = st.stage === 'chibi' ? 'chibi' : (st.form || 'dora');
  return base + '-' + face;
}
const petName = st => { const p = petDoc(); return (p && p.name) || ((st || petStats() || {}).stage === 'egg' ? 'たまご' : 'ペット'); };

/* ── 動き：顔（ふつう＋まばたき）を重ね、CSSでゆれる・左右に動く・まばたき。描き直しても動きが途切れないよう、時刻で始まりをずらす ── */
function petBodyHTML(st, px, opts = {}) {
  const face = st.stage === 'egg' ? null : petFace(st);
  const key = petKey(st, face);
  const blink = face === 'normal' && st.stage !== 'egg' ? petSVG(key.replace(/-normal$/, '-blink'), px, 'pet-blink') : '';
  const delay = `animation-delay:-${(Date.now() % 9000) / 1000}s`;
  const cls = ['pet-body', st.stage === 'egg' ? 'is-egg' : '', face ? 'f-' + face : '', S.petFx && S.petFx.until > Date.now() ? 'is-fx' : ''].join(' ');
  const fx = S.petFx && S.petFx.until > Date.now() && S.petFx.gains ? Object.entries(S.petFx.gains).filter(([, v]) => v > 0) : [];
  return `<span class="${cls}" data-k="${key}" style="${delay}">${petSVG(key, px, blink ? 'pet-main' : '')}${blink}${fx.length ? `<i class="pet-gain" aria-hidden="true">${fx.map(([k, v]) => `<span class="pg-${k}">${petFoodSVG(k, 12)}＋${v}</span>`).join('')}</i>` : ''}</span>`;
}
// 今日・星空のタブに置く小さなペット。walk＝左右に動く幅を持つ
function petMiniHTML(where) {
  if (S.ready && !S.fatal && !S.settings.petHide && !petDoc()) petKick(); // はじめて：たまごを置く
  if (!petOn()) return '';
  const st = petStats(); petWatch(st);
  const p = petDoc(); const mail = petUnread().length; const trip = p.trip && !p.trip.seen;
  const still = petSoft(today()) || petAsleep() || st.stage === 'egg'; // しんどい日・寝ている・たまごは、その場でゆれるだけ
  const label = `${petName(st)}（${PET_STAGE_LABEL[st.stage]}）。押すとペットの部屋へ`;
  return `<span class="pet-lane pet-at-${where}${still ? ' still' : ''}" aria-hidden="false"><button class="pet-mini" data-act="petOpen" aria-label="${esc(label)}" title="${esc(petName(st))}" style="animation-delay:-${(Date.now() % 22000) / 1000}s">${petBodyHTML(st, where === 'sky' ? 44 : 40)}${mail || trip ? '<i class="pet-badge" aria-hidden="true">✉</i>' : ''}</button></span>`;
}
// ごはんを食べた瞬間（ほしが増えた）に、うれしい顔
function petKick() { if (!S.petSyncQ) { S.petSyncQ = true; setTimeout(() => { S.petSyncQ = false; petSync(); }, 50); } }
function petWatch(st) {
  const cur = st.earnedToday; const prev = S.petPrevEat;
  if (prev && S.petPrevDay === today()) {
    const gains = {}; for (const k of PET_FOOD_KEYS) if (cur[k] > prev[k]) gains[k] = cur[k] - prev[k];
    if (Object.keys(gains).length) { S.petFx = { until: Date.now() + 2600, gains }; S.petTalkN = 0; setTimeout(render, 2700); }
  }
  S.petPrevEat = { ...cur }; S.petPrevDay = today();
  petKick();
}
const petUnread = () => Object.values(S.petmail || {}).filter(m => m && !m.read && m.text).sort((a, b) => (a.at || 0) - (b.at || 0));

/* ── 書き込み（描いたあとにまとめて） ── */
function petPlace(d) { let h = 0; for (const c of d) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PET_PLACES[h % PET_PLACES.length]; }
function petSync() {
  if (!canWrite() || !S.loaded.pet) return;
  const t = today(); let p = petDoc();
  if (!p) { // はじめて：たまごを置く
    if (S.settings.petHide) return;
    p = { born: Date.now(), bornDay: t, v: 1 }; S.pet = { ...(S.pet || {}), main: p }; putDoc('pet/main', p); return;
  }
  const patch = {};
  if (S.petDailyDone !== t) {
    S.petDailyDone = t;
    // 3日以上あいたら、旅に出ていたことにする（減るものはない）
    let last = null; for (let i = 1; i <= 90; i++) { const d = addDays(t, -i); if (p.bornDay && d < p.bornDay) break; const x = getDay(d).pet; if (x && x.seen) { last = d; break; } }
    if (last && diffDays(last, t) >= 3 && !(p.trip && p.trip.to === t)) {
      const trip = { from: last, to: t, place: petPlace(t), at: Date.now(), seen: false };
      patch.trip = trip; patch.souvenirs = [...(p.souvenirs || []), { place: trip.place, from: last, to: t }].slice(-30);
    }
    const day = getDay(t); if (!(day.pet && day.pet.seen)) patchDay(t, { pet: { ...(day.pet || {}), seen: true } });
  }
  const st = petStats();
  if (st.stage !== 'egg' && !p.hatchedAt) patch.hatchedAt = Date.now();
  if (st.stage === 'adult' && !p.form) { patch.form = petFormOf(st); patch.evolvedAt = Date.now(); patch.evoSeen = false; patch.evoStats = { power: st.power, wisdom: st.wisdom, light: st.light }; }
  // チャットのClaudeが読めるように、今の様子を控えておく（変わったときだけ・30秒に1回まで）
  const stats = { stage: st.stage, form: patch.form || p.form || null, xp: st.xp, bond: st.bond, energy: st.energy, power: st.power, wisdom: st.wisdom, light: st.light, meat: st.stock.meat, veg: st.stock.veg, snack: st.stock.snack };
  const old = p.stats || {}; const changed = Object.keys(stats).some(k => stats[k] !== old[k]);
  if (changed && (Object.keys(patch).length || stats.stage !== old.stage || !S.petStatsAt || Date.now() - S.petStatsAt > 30000)) { patch.stats = { ...stats, at: Date.now() }; S.petStatsAt = Date.now(); }
  if (Object.keys(patch).length) { S.pet.main = { ...p, ...patch }; updDoc('pet/main', patch); render(); }
}

/* ── ひとこと（Daylog の数字から。叱らない。鏡のように今を映すだけ） ── */
function petLines(st) {
  const t = today(); const day = getDay(t); const ents = day.entries || [];
  const pick = (...a) => a;
  if (st.stage === 'egg') return pick('（ことこと……たまごが少しゆれた）', '（あったかい）', `（あと少しで生まれそう。${Math.max(0, PET_HATCH - st.xp)}ほしぶん）`, '（記録を書くと、たまごが育つ）');
  if (petAsleep()) return pick('すう……すう……', '（いい夢を見ているみたい）', '（むにゃ……また明日）');
  if (S.petFx && S.petFx.until > Date.now() && S.petFx.gains) {
    const k = PET_FOOD_KEYS.find(x => S.petFx.gains[x]); const f = PET_FOODS[k];
    return pick({ meat: 'おにく！もぐもぐ。ちからがついた。', veg: 'やさい、しゃきしゃき。かしこくなった気がする。', snack: 'おやつだ！ひかりがぽかぽかする。' }[k], `${f.name}、ありがと！`);
  }
  const out = [];
  if (petSoft(t)) out.push('今日は、ここにいるだけでいいよ。', 'なにもしない日も、ちゃんと一日。', 'ぼくもとなりでごろごろする。', '書かなくても、ちゃんとここにいるよ。', 'ごはんは気にしないで。今日はやすむ日。');
  else {
    if (st.late.now) out.push('（うとうと……）ぼく、先にねむくなってきた。', '目がしょぼしょぼする……。まだ起きてる？');
    else if (st.late.min >= 30) out.push(`目安を過ぎてから${fmtMin(st.late.min)}、いっしょに起きてたね。ちょっとねむい。`);
    if (st.sleepH != null) out.push(st.sleepH >= 7 ? `${fmtMin(st.sleepH * 60)}ねむれたね。ぼくも元気。` : st.sleepH < 5 ? `${fmtMin(st.sleepH * 60)}だったね。ゆっくりでいいよ。` : `おはよ。${fmtMin(st.sleepH * 60)}ねむれたね。`);
    const doneN = Object.values(S.tasks).filter(k => k.status === 'done' && k.doneAt && logicalDate(k.doneAt) === t).length;
    if (doneN) out.push(`今日は${doneN}こ終わったね。ほしがふってきた。`);
    if (ents.length) out.push(`今日は${ents.length}回書いたね。ぜんぶ星になってる。`);
    else out.push('今日はまだ静か。それもいい。');
    out.push('ここにいるよ。', `今夜は${moonName(moonAge(new Date()))}。`, '星がきれいだね。');
  }
  if (petUnread().length) out.unshift('手紙が届いてるよ。');
  return out;
}
const petLine = st => { const l = petLines(st); return l[(S.petTalkN || 0) % l.length]; };

/* ── ペットの部屋 ── */
function petRoomHTML() {
  const p = petDoc(); if (!p) return '';
  const st = petStats(); petWatch(st);
  const h = new Date().getHours(); const night = petAsleep() || h >= 18 || h < 6;
  const soft = petSoft(today());
  const plant = st.stage === 'egg' ? 0 : st.stage === 'chibi' ? (st.grow < 0.5 ? 1 : 2) : 3;
  const form = st.stage === 'adult' && (p.form || st.form) ? PET_FORMS[p.form || st.form] : null;
  const lean = st.stage === 'chibi' ? PET_FORMS[petFormOf(st)] : null;
  const meter = (lb, v, txt, c) => `<div class="pr-m"><div class="pr-ml"><span>${lb}</span><b>${txt}</b></div><div class="pr-bar"><i style="width:${Math.round(clamp(v, 0, 1) * 100)}%;--c:${c}"></i></div></div>`;
  const cards = [];
  if (st.stage !== 'egg' && !p.name) cards.push(`<div class="pr-card"><b>生まれた！</b><p>名前を付けてあげて。あとで変えられる。</p><div class="row" style="gap:8px;margin-top:8px"><input class="field grow" id="pet-name" data-draft maxlength="12" placeholder="名前（12文字まで）" value="${esc(draft('pet-name'))}" data-enter="petName"><button class="btn primary" data-act="petName">決める</button></div></div>`);
  if (S.petRenaming && p.name) cards.push(`<div class="pr-card"><b>名前を変える</b><div class="row" style="gap:8px;margin-top:8px"><input class="field grow" id="pet-name" data-draft maxlength="12" value="${esc(draft('pet-name', p.name))}" data-enter="petName"><button class="btn ghost" data-act="petRenameCancel">やめる</button><button class="btn primary" data-act="petName">決める</button></div></div>`);
  if (form && p.evoSeen === false) cards.push(`<div class="pr-card gold"><b>おとなになった：${form.name}</b><p>${form.theme}。${form.why}から、この姿になった。どの姿も良い・悪いはない。</p><button class="link" data-act="petEvoSeen">わかった</button></div>`);
  if (p.trip && !p.trip.seen) cards.push(`<div class="pr-card post"><b>おかえり</b><p>${diffDays(p.trip.from, p.trip.to)}日のあいだ、${esc(p.trip.place)}のほうまで旅をしていた。おみやげに絵はがきを持って帰ってきた。</p><div class="pr-postcard" aria-hidden="true">${petPostcardSVG(p.trip.place)}</div><button class="link" data-act="petTripSeen">しまっておく</button></div>`);
  for (const m of petUnread().slice(0, 1)) cards.push(`<div class="pr-card mail"><b>✉ 手紙が届いた</b><p class="pr-letter">${esc(m.text)}</p><button class="link" data-act="petLetterRead" data-arg="${esc(m.id)}">読んだ</button></div>`);
  const name = p.name || (st.stage === 'egg' ? 'たまご' : '名前はまだ');
  const stageTxt = st.stage === 'adult' && form ? `${form.name}（${form.theme}）` : PET_STAGE_LABEL[st.stage];
  const asleep = petAsleep(); const full = st.extraToday >= PET_EXTRA_MAX;
  const feedWhy = st.stage === 'egg' ? 'たまごはまだ食べられない（ごはんは育つ力になっている）' : asleep ? 'ねているから、また明日' : full ? '今日はもうおなかいっぱい' : '';
  const statMax = Math.max(30, st.power, st.wisdom, st.light);
  const statRow = k => { const f = PET_FOODS[k]; const v = { meat: st.power, veg: st.wisdom, snack: st.light }[k];
    return `<div class="ps-row" style="--c:${f.c}"><span class="ps-ic">${petFoodSVG(k, 18)}</span><span class="ps-n">${f.stat}</span><span class="ps-bar"><i style="width:${Math.round(v / statMax * 100)}%"></i></span><b class="ps-v">${v}</b></div>`; };
  const feedBtn = k => { const f = PET_FOODS[k]; const n = st.stock[k]; const ok = !feedWhy && n > 0;
    return `<button class="pf-btn" style="--c:${f.c}" data-act="petFeed" data-arg="${k}" ${ok ? '' : 'disabled'} aria-label="${f.name}のおかわりをあげる（棚に${n}回分）"><span class="pf-ic">${petFoodSVG(k, 26)}</span><span class="pf-t">${f.name}</span><span class="pf-n">×${n}</span></button>`; };
  return `<div class="overlay pet-over" role="dialog" aria-modal="true" aria-label="ペットの部屋"><div class="pet-room">
    <div class="pr-top"><button class="iconbtn pr-back" data-act="petClose" aria-label="戻る">‹</button><div class="pr-title"><b>${esc(name)}</b><span>${esc(stageTxt)}</span></div>${p.name && !S.petRenaming ? '<button class="iconbtn" data-act="petRename" aria-label="名前を変える" title="名前を変える">✎</button>' : '<span style="width:36px"></span>'}</div>
    <div class="pr-scene${night ? ' night' : ''}${soft ? ' soft' : ''}">
      <div class="pr-window" aria-hidden="true"><i class="pr-sky"></i>${night ? '<i class="pr-moon"></i>' : '<i class="pr-sun"></i>'}</div>
      <div class="pr-plant" aria-label="いっしょに育つ観葉植物">${petSVG('plant-' + plant, 92)}</div>
      <button class="pr-pet" data-act="petTalk" aria-label="${esc(name)}に話しかける">${petBodyHTML(st, 150)}</button>
      <div class="pr-bubble" aria-live="polite">${esc(petLine(st))}</div>
    </div>
    ${cards.join('')}
    <div class="pr-meters">
      ${soft ? meter('元気', 1, '休む日', 'var(--rest)') : petAsleep() ? meter('元気', 1, 'ねている', 'var(--lav)') : meter('元気', st.energy / 100, String(st.energy), st.energy >= 70 ? 'var(--mint)' : st.energy >= 40 ? 'var(--blue)' : 'var(--warn)')}
      ${meter('なつき', Math.min(1, st.bond / 60), String(st.bond), 'var(--rose)')}
      ${meter('成長', st.grow, stageTxt.split('（')[0], 'var(--gold)')}
    </div>
    <div class="pr-stats"><div class="pr-h">能力</div>${PET_FOOD_KEYS.map(statRow).join('')}${lean ? `<div class="ps-lean">いまの能力なら、おとなになると<b>${lean.name}</b>になりそう</div>` : ''}</div>
    <div class="pr-feed"><div class="pr-h">棚のごはん<span>3つで1回おかわり・1日${PET_EXTRA_MAX}回まで</span></div><div class="pf-row">${PET_FOOD_KEYS.map(feedBtn).join('')}</div>${feedWhy ? `<div class="faint pr-why">${feedWhy}</div>` : ''}</div>
    <div class="pr-legend">${PET_FOOD_KEYS.map(k => `<span style="--c:${PET_FOODS[k].c}">${petFoodSVG(k, 14)}${PET_FOODS[k].name}＝${PET_FOODS[k].from} → ${PET_FOODS[k].stat}${st.earnedToday[k] ? `（今日＋${st.earnedToday[k]}）` : ''}</span>`).join('')}</div>
    <p class="pr-note">ごはんはその場で自動で食べて、能力と成長になる。${st.stage === 'adult' ? '' : `${st.stage === 'egg' ? '生まれる' : 'おとなになる'}まで、あと ${Math.max(0, (st.stage === 'egg' ? PET_HATCH : PET_ADULT) - st.xp)}。`}おとなの姿は能力で決まる：ちから→ほしドラ、かしこさ→ゆきうさ、ひかり→ひだまりオン、ひかりが低くて夜ふかしが多い→よるコウモリ。なつきは会いに来た日とおかわりで増え、減らない。続けた日数は数えない。</p>
  </div></div>`;
}
// おみやげの絵はがき：行った先の星座（日付から決まる星の並び）
function petPostcardSVG(place) {
  let h = 0; for (const c of place) h = (h * 131 + c.charCodeAt(0)) >>> 0;
  const pts = []; for (let i = 0; i < 6; i++) { h = (h * 1103515245 + 12345) >>> 0; const x = 20 + (h % 200); h = (h * 1103515245 + 12345) >>> 0; const y = 18 + (h % 84); pts.push([x, y]); }
  pts.sort((a, b) => a[0] - b[0]);
  return `<svg viewBox="0 0 240 130" width="100%" role="img"><rect x="1" y="1" width="238" height="128" rx="10" fill="#0b1030" stroke="currentColor" stroke-opacity=".35"/><polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="1.2"/>${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="currentColor"/>`).join('')}<text x="14" y="122" fill="currentColor" font-size="11" opacity=".75">${esc(place)}</text></svg>`;
}

/* ── 操作 ── */
A.petOpen = () => { S.petOpen = true; S.petTalkN = 0; S.petRenaming = false; render(); };
A.petClose = () => { S.petOpen = false; S.petRenaming = false; render(); };
A.petTalk = () => { S.petTalkN = (S.petTalkN || 0) + 1; S.petHop = Date.now(); render(); };
A.petFeed = k => {
  if (!PET_FOODS[k]) return; const st = petStats();
  if (!st || st.stage === 'egg' || petAsleep() || st.stock[k] < 1 || st.extraToday >= PET_EXTRA_MAX) return;
  const t = today(); const day = getDay(t); const x = day.pet || {}; const ex = { ...(x.extra || {}) }; ex[k] = (ex[k] || 0) + 1;
  patchDay(t, { pet: { ...x, seen: true, extra: ex } });
  S.petFx = { until: Date.now() + 2600, gains: { [k]: PET_EXTRA } }; S.petTalkN = 0; S.petPrevEat = null; setTimeout(render, 2700);
};
A.petName = () => {
  const v = String(draft('pet-name', (petDoc() || {}).name || '')).trim().slice(0, 12); if (!v) { toast('名前を入れてね。'); return; }
  S.pet.main = { ...petDoc(), name: v }; S.drafts['pet-name'] = ''; S.petRenaming = false; updDoc('pet/main', { name: v }); render();
};
A.petRename = () => { S.petRenaming = true; S.drafts['pet-name'] = (petDoc() || {}).name || ''; render(); };
A.petRenameCancel = () => { S.petRenaming = false; render(); };
A.petEvoSeen = () => { S.pet.main = { ...petDoc(), evoSeen: true }; updDoc('pet/main', { evoSeen: true }); render(); };
A.petTripSeen = () => { const p = petDoc(); if (!p || !p.trip) return; const trip = { ...p.trip, seen: true }; S.pet.main = { ...p, trip }; updDoc('pet/main', { trip }); render(); };
A.petLetterRead = id => { const m = S.petmail[id]; if (!m) return; S.petmail[id] = { ...m, read: true, readAt: Date.now() }; updDoc('petmail/' + id, { read: true, readAt: Date.now() }); render(); };
A.setPet = v => { patchSettings({ petHide: v === 'hide' }); };

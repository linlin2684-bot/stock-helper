// 股票學堂：主程式（儲存、路由、首頁、上課、測驗、字典、設定）
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (x, d = 2) => x == null || isNaN(x) ? '—' : Number(x).toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt0 = x => fmt(x, 0);
const pct = (x, d = 2) => x == null || isNaN(x) ? '—' : (x > 0 ? '+' : '') + fmt(x, d) + '%';
const cls = x => x > 0 ? 'up' : x < 0 ? 'down' : 'flat';
const pad = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dstr(new Date());
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pickOne = a => a[Math.floor(Math.random() * a.length)];

/* ---------------- 儲存（存在這支手機） ---------------- */
const KEY = 'stock-learn-v1';
const DEF = () => ({ done: {}, days: {}, xp: 0, wrong: {}, tm: [], plan: {}, prac: { n: 0, ok: 0 }, settings: { font: 1 }, seen: {}, vs: {} });
let S;
try { S = Object.assign(DEF(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { S = DEF(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} };
const FONT_STEPS = [0.9, 1, 1.15, 1.3, 1.5];
const applyFont = () => document.documentElement.style.setProperty('--fs', FONT_STEPS[S.settings.font] ?? 1);
applyFont();

function addActivity(xp){
  S.days[today()] = (S.days[today()] || 0) + 1;
  S.xp += xp; save();
  if (typeof checkBadges === 'function') checkBadges();
}
function streak(){
  let n = 0; const d = new Date();
  if (!S.days[dstr(d)]) d.setDate(d.getDate() - 1);   // 今天還沒學，不算斷
  while (S.days[dstr(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function toast(msg, ms = 2200){
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}

/* ---------------- 課程索引 ---------------- */
const LESSONS = [];
UNITS.forEach(u => u.lessons.forEach(l => { l.unit = u; l.no = LESSONS.length + 1; LESSONS.push(l); }));
const LBYID = Object.fromEntries(LESSONS.map(l => [l.id, l]));
const GMAP = Object.fromEntries(GLOSSARY.map(g => [g[0], g]));
const TERM_LESSON = {};
LESSONS.forEach(l => l.cards.forEach(c => { for (const m of c.matchAll(/\[\[(.+?)\]\]/g)) { const t = m[1].split('|')[0]; if (!TERM_LESSON[t]) TERM_LESSON[t] = l.id; } }));
GLOSSARY.forEach(([t]) => { if (!TERM_LESSON[t] && t.length >= 2){ const l = LESSONS.find(l => l.cards.some(c => c.replace(/<[^>]+>/g, '').includes(t))); if (l) TERM_LESSON[t] = l.id; } });
const nextLesson = () => LESSONS.find(l => !S.done[l.id]);
const stars = d => !d ? 0 : d.best >= d.of ? 3 : d.best >= Math.ceil(d.of * 0.6) ? 2 : 1;
const lessonLink = id => LBYID[id] ? `<a href="#l-${id}">第 ${LBYID[id].no} 課〈${esc(LBYID[id].title)}〉</a>` : '';

/* ---------------- 資料（股票小幫手每天更新的檔案） ---------------- */
const CACHE = new Map();
async function data(path){
  if (CACHE.has(path)) return CACHE.get(path);
  const p = fetch('../data/' + path, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
  CACHE.set(path, p);
  const d = await p; if (d === null) setTimeout(() => CACHE.delete(path), 20000);
  return d;
}
const stock = (mkt, id) => data(`p/${mkt}/${id.replace('^', '_')}.json`);
let NAMES = null;
async function names(){
  if (NAMES) return NAMES;
  const L = await data('list.json'); NAMES = { tw: {}, us: {} };
  if (L){ L.tw.forEach(r => NAMES.tw[r[0]] = r[1]); L.us.forEach(r => NAMES.us[r[0]] = r[1]); }
  return NAMES;
}
const isTW = id => /^\d/.test(id) || id === 'TAIEX' || id === 'TPEx';
const mktOf = id => isTW(id) ? 'tw' : 'us';
const unitName = mkt => mkt === 'tw' ? '張' : '股';
const volUnit = (v, mkt) => mkt === 'tw' ? v / 1000 : v;

/* ---------------- 路由 ---------------- */
let routeToken = 0;
const alive = t => t === routeToken;
function setTop(title, right = ''){ $('#title').textContent = title; $('#topr').innerHTML = right; }
function route(){
  const h = (location.hash || '#home').slice(1);
  const tok = ++routeToken;
  closeSheet(); stopSpeak();
  const ov = $('.lesson'); if (ov && !h.startsWith('l-')) ov.remove();
  document.body.style.overflow = '';
  const TAB = { cards: 'practice', pattern: 'practice', dcasim: 'sim', market: 'home', badges: 'home', videos: 'home', review: 'home', settings: 'home' };
  const tab = h.startsWith('l-') ? 'home' : h.startsWith('x-') ? 'practice' : TAB[h] || h;
  $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.t === tab));
  if (h.startsWith('l-')) return openLesson(h.slice(2));
  window.scrollTo(0, 0);
  if (h.startsWith('x-')) return pageExplain(decodeURIComponent(h.slice(2)), tok);
  ({ home: pageHome, practice: pagePractice, sim: pageSim, dict: pageDict, settings: pageSettings, review: pageReview, videos: pageVideos, market: pageMarket, cards: pageCards, pattern: pagePattern, dcasim: pageDcaSim, badges: pageBadges }[h] || pageHome)(tok);
}
window.addEventListener('hashchange', route);

/* ---------------- 首頁 ---------------- */
function pageHome(){
  setTop('股票學堂', `<a class="iconbtn" href="#settings" aria-label="設定">⚙️</a>`);
  const nl = nextLesson(), doneN = Object.keys(S.done).filter(k => LBYID[k]).length, st = streak();
  const todayDone = !!S.days[today()];
  const wk = []; const d = new Date(); d.setDate(d.getDate() - 6);
  for (let i = 0; i < 7; i++){ const k = dstr(d); wk.push(`<div>${'日一二三四五六'[d.getDay()]}<i class="${S.days[k] ? 'ok' : ''} ${k === today() ? 'today' : ''}">${S.days[k] ? '✓' : ''}</i></div>`); d.setDate(d.getDate() + 1); }
  const wrongN = Object.keys(S.wrong).length;
  app.innerHTML = `
    ${!S.seen.welcome ? `<div class="card"><h2>👋 歡迎來到股票學堂</h2>
      <p style="margin:.2rem 0">這裡從零開始，一天一小課（5～10 分鐘），每課後面有小測驗。看到<span class="term">底線的字</span>可以點，會跳出白話解釋。</p>
      <p class="sub" style="margin:.3rem 0">學完的課可以到「🎯 練習」用真實股票考考自己、到「🕰️ 模擬」玩時光機挑戰。</p>
      <button class="btn ghost block" id="welok">好，開始吧</button></div>` : ''}
    <div class="card"><div class="hero"><div class="flame">${st ? '🔥' : '🌱'}</div><div class="grow">
      <div style="font-size:1.25rem;font-weight:800">${st ? `連續學習 ${st} 天` : '今天開始第一天'}</div>
      <div class="sub">${todayDone ? '今天的進度完成了，明天見！' : '今天上一課，或做一次練習，就能保持連續紀錄'}</div></div>
      <div class="center"><div style="font-weight:800;color:var(--gold)">${S.xp}</div><div class="sub small">經驗值</div></div></div>
      <div class="week">${wk.join('')}</div></div>
    ${nl ? `<a class="next" href="#l-${nl.id}"><div class="k">${todayDone ? '想多學一點？' : '今天的課'}・${esc(nl.unit.title.replace(/\s+/g, ' '))}</div>
      <div class="t">第 ${nl.no} 課　${esc(nl.title)}</div><span class="go">開始上課（約 ${nl.min} 分鐘）›</span></a>`
      : `<div class="card center"><div class="big">🎓</div><b>全部 ${LESSONS.length} 課都上完了！</b><p class="sub">可以到練習、模擬繼續加強，或重上任何一課。</p></div>`}
    <div id="mktcard"></div>
    <div id="vidcard"></div>
    ${wrongN ? `<a class="card row" href="#review" style="text-decoration:none;color:inherit"><span style="font-size:1.6rem">📝</span><div class="grow"><b>複習答錯的題目</b><div class="sub">還有 ${wrongN} 題，答對就會從清單移除</div></div><span class="sub">›</span></a>` : ''}
    <a class="card row" href="#badges" style="text-decoration:none;color:inherit"><span style="font-size:1.6rem">🏅</span><div class="grow"><b>成就徽章</b><div class="sub">已獲得 ${BADGES.filter(b => S.badges[b[0]]).length} / ${BADGES.length} 個</div></div><span class="sub">›</span></a>
    <div class="card"><div class="row" style="margin-bottom:.4rem"><b class="grow">全部進度</b><span class="sub">${doneN} / ${LESSONS.length} 課</span></div>
      <div class="bar"><b style="width:${doneN / LESSONS.length * 100}%"></b></div></div>
    ${UNITS.map(u => {
      const dn = u.lessons.filter(l => S.done[l.id]).length;
      return `<div class="card unit"><h2><span class="ic">${u.icon}</span>${esc(u.title)}<span class="more sub">${dn}/${u.lessons.length}</span></h2>
      <div class="sub" style="margin:-.4rem 0 .3rem">${esc(u.desc)}</div>
      ${u.lessons.map(l => { const dd = S.done[l.id], s = stars(dd);
        return `<a class="les ${dd ? 'done' : ''} ${nl === l ? 'cur' : ''}" href="#l-${l.id}"><span class="dot">${dd ? '✓' : l.no}</span>
        <span class="grow">${esc(l.title)}<div class="sub small">${l.min} 分鐘・${l.quiz.length} 題</div></span>
        ${dd ? `<span class="stars">${'★'.repeat(s)}${'☆'.repeat(3 - s)}</span>` : ''}</a>`; }).join('')}</div>`;
    }).join('')}
    <p class="disclaimer">學習進度存在這支手機。內容僅供學習，不構成投資建議。<br><a href="../">開啟股票小幫手 ›</a></p>`;
  mountTodayVideos($('#vidcard')); mountMarketCard($('#mktcard'));
  const w = $('#welok'); if (w) w.onclick = () => { S.seen.welcome = 1; save(); pageHome(); };
}

/* ---------------- 上課 ---------------- */
function renderRich(html){
  return html.replace(/\[\[(.+?)\]\]/g, (_, t) => { const [k, show] = t.split('|'); return `<span class="term" data-t="${esc(k)}">${esc(show || k)}</span>`; })
             .replace(/\{\{w:(.+?)\}\}/g, (_, w) => `<div class="w" data-w="${esc(w)}"><div class="skeleton"></div></div>`)
             .replace(/\{\{l:(l\d+)\}\}/g, (_, id) => lessonLink(id));
}
let L = null;  // 目前上課狀態
function openLesson(id){
  const l = LBYID[id]; if (!l) { location.hash = '#home'; return; }
  if (!L || L.l !== l) L = { l, step: 0, ok: 0, ans: {} };
  document.body.style.overflow = 'hidden';
  let ov = $('.lesson');
  if (!ov){ ov = document.createElement('div'); ov.className = 'lesson'; document.body.appendChild(ov); }
  ov.innerHTML = `<div class="lhead"><button class="iconbtn" id="lx" aria-label="離開">✕</button><div class="bar"><b id="lbar"></b></div>
    <button class="iconbtn" id="lsp" aria-label="唸給我聽">🔊</button></div>
    <div class="lbody" id="lbody"></div><div class="lfoot" id="lfoot"></div>`;
  $('#lx', ov).onclick = () => { L = null; location.hash = '#home'; };
  $('#lsp', ov).onclick = () => speaking ? stopSpeak() : speak($('#lbody').innerText);
  lessonStep();
}
function lessonStep(){
  const { l, step } = L, nc = l.cards.length, nq = l.quiz.length, total = nc + nq + 1;
  stopSpeak();
  $('#lbar').style.width = (step / (total - 1) * 100) + '%';
  const body = $('#lbody'), foot = $('#lfoot');
  body.scrollTop = 0;
  if (step < nc){
    body.innerHTML = `<div class="sub small" style="max-width:720px;margin:0 auto .4rem">第 ${l.no} 課・${esc(l.title)}・${step + 1}/${nc}</div>
      <div class="card">${renderRich(l.cards[step])}</div>`;
    mountWidgets(body);
    foot.innerHTML = `${step ? '<button class="btn gray" id="lp">‹ 上一步</button>' : ''}<button class="btn" id="ln">${step === nc - 1 ? '開始小測驗 ›' : '下一步 ›'}</button>`;
  } else if (step < nc + nq){
    const qi = step - nc, q = l.quiz[qi], a = L.ans[qi];
    body.innerHTML = `<div class="sub small" style="max-width:720px;margin:0 auto .4rem">小測驗 ${qi + 1}/${nq}</div>
      <div class="card"><h3>${esc(q.q)}</h3>${q.o.map((o, k) => `<button class="opt" data-k="${k}">${esc(o)}</button>`).join('')}<div id="fb"></div></div>`;
    foot.innerHTML = `<button class="btn" id="ln" disabled>${qi === nq - 1 ? '看結果 ›' : '下一題 ›'}</button>`;
    const show = k => {
      $$('.opt', body).forEach(b => { b.disabled = true; const bk = +b.dataset.k; if (bk === q.a) b.classList.add('right'); else if (bk === k) b.classList.add('wrong'); });
      const ok = k === q.a;
      $('#fb').innerHTML = `<div class="fb ${ok ? 'right' : 'wrong'}"><b>${ok ? '✅ 答對了！' : '❌ 再想想'}</b><div>${esc(q.e)}</div></div>`;
      $('#ln').disabled = false;
    };
    if (a != null) show(a);
    $$('.opt', body).forEach(b => b.onclick = () => {
      if (L.ans[qi] != null) return;
      const k = +b.dataset.k; L.ans[qi] = k;
      const key = l.id + ':' + qi;
      if (k === q.a){ L.ok++; delete S.wrong[key]; } else S.wrong[key] = 1;
      save(); show(k);
    });
  } else {
    const prev = S.done[l.id], first = !prev;
    S.done[l.id] = { best: Math.max(L.ok, prev?.best || 0), of: nq, t: today() };
    const xp = (first ? 10 : 3) + L.ok * 5; addActivity(xp);
    const s = stars({ best: L.ok, of: nq }), nl = LESSONS[l.no];
    body.innerHTML = `<div class="card center"><div class="big">${s === 3 ? '🏆' : s === 2 ? '🎉' : '💪'}</div>
      <h3>第 ${l.no} 課完成！</h3><div style="font-size:1.6rem;color:var(--gold)">${'★'.repeat(s)}${'☆'.repeat(3 - s)}</div>
      <p>答對 <b>${L.ok}</b> / ${nq} 題　<span style="color:var(--gold);font-weight:700">+${xp} 經驗值</span></p>
      <p class="sub">🔥 連續學習 ${streak()} 天</p>
      ${L.ok < nq ? '<p class="sub">答錯的題目已放進「複習答錯的題目」，之後再挑戰一次。</p>' : ''}</div>
      ${nl ? `<div class="card"><div class="sub small">下一課</div><b>第 ${nl.no} 課　${esc(nl.title)}</b></div>` : ''}<div id="lvid"></div>`;
    mountLessonVideo($('#lvid'), l.id);
    foot.innerHTML = `<button class="btn gray" id="lh">回首頁</button>${nl ? '<button class="btn" id="lnext">下一課 ›</button>' : ''}`;
    $('#lh').onclick = () => { L = null; location.hash = '#home'; };
    if (nl) $('#lnext').onclick = () => { L = null; location.hash = '#l-' + nl.id; };
    return;
  }
  const n = $('#ln'), p = $('#lp');
  if (n) n.onclick = () => { L.step++; lessonStep(); };
  if (p) p.onclick = () => { L.step--; lessonStep(); };
}

/* ---------------- 名詞小字典（點底線字跳出） ---------------- */
document.addEventListener('click', e => {
  const t = e.target.closest('.term[data-t]'); if (t) { e.preventDefault(); openTerm(t.dataset.t); }
});
function openTerm(name){ if (window.TermUI) TermUI.open(name); }
window.TERM_LINK = c => TERM_LESSON[c] ? `在 ${lessonLink(TERM_LESSON[c])} 有教` : '';
function closeSheet(){ $$('.sheet,.sheet-bg').forEach(x => x.remove()); if (window.TermUI) TermUI.close(); }

/* ---------------- 語音朗讀 ---------------- */
let speaking = false;
function speak(text){
  if (!('speechSynthesis' in window)) { toast('這支手機不支援朗讀'); return; }
  stopSpeak();
  const u = new SpeechSynthesisUtterance(text.replace(/[💡⚠️📈📉🌏✅❌›‹]/gu, '').replace(/\s+/g, ' '));
  u.lang = 'zh-TW'; u.rate = 0.95;
  const v = speechSynthesis.getVoices().find(v => /zh[-_]TW/i.test(v.lang)); if (v) u.voice = v;
  u.onend = u.onerror = () => { speaking = false; };
  speaking = true; speechSynthesis.speak(u);
}
function stopSpeak(){ if ('speechSynthesis' in window) speechSynthesis.cancel(); speaking = false; }

/* ---------------- 複習答錯 ---------------- */
function pageReview(){
  setTop('複習答錯的題目', `<a class="iconbtn" href="#home">✕</a>`);
  const keys = Object.keys(S.wrong).filter(k => { const [id, qi] = k.split(':'); return LBYID[id]?.quiz[+qi]; });
  if (!keys.length){ app.innerHTML = `<div class="card center"><div class="big">🎉</div><b>沒有要複習的題目了！</b><p><a href="#home">回首頁</a></p></div>`; return; }
  const qs = shuffle(keys).slice(0, 10).map(k => { const [id, qi] = k.split(':'); const q = LBYID[id].quiz[+qi]; return { ...q, key: k, lid: id }; });
  runQuiz(qs, '複習', ok => { addActivity(ok * 3); });
}
// 通用的一題一題測驗（練習、複習用）
function runQuiz(qs, label, onDone, again){
  let i = 0, ok = 0;
  const draw = () => {
    if (i >= qs.length){
      onDone && onDone(ok, qs.length);
      app.innerHTML = `<div class="card center"><div class="big">${ok === qs.length ? '🏆' : ok >= qs.length / 2 ? '🎉' : '💪'}</div>
        <h3>${esc(label)}完成</h3><p>答對 <b>${ok}</b> / ${qs.length} 題</p><p class="sub">🔥 連續學習 ${streak()} 天</p></div>
        <div class="btns"><a class="btn gray" href="#home">回首頁</a><button class="btn" id="again">再來一次</button></div>`;
      $('#again').onclick = () => (again || route)();
      return;
    }
    const q = qs[i];
    app.innerHTML = `<div class="row" style="margin-bottom:.6rem"><div class="bar grow"><b style="width:${i / qs.length * 100}%"></b></div><span class="sub small">${i + 1}/${qs.length}</span></div>
      <div class="card">${q.pre || ''}<h3 style="margin:.3rem 0 .4rem;font-size:1.15rem">${q.html ? q.q : esc(q.q)}</h3>
      ${q.o.map((o, k) => `<button class="opt" data-k="${k}">${esc(o)}</button>`).join('')}<div id="fb"></div></div>
      <button class="btn block hidden" id="nx">${i === qs.length - 1 ? '看結果 ›' : '下一題 ›'}</button>`;
    if (q.mount) q.mount(app);
    $$('.opt').forEach(b => b.onclick = () => {
      const k = +b.dataset.k, right = k === q.a;
      $$('.opt').forEach(x => { x.disabled = true; const xk = +x.dataset.k; if (xk === q.a) x.classList.add('right'); else if (xk === k) x.classList.add('wrong'); });
      if (right) ok++;
      if (q.key){ if (right) delete S.wrong[q.key]; else S.wrong[q.key] = 1; save(); }
      $('#fb').innerHTML = `<div class="fb ${right ? 'right' : 'wrong'}"><b>${right ? '✅ 答對了！' : '❌ 再想想'}</b><div>${q.ehtml ? q.e : esc(q.e)}</div>
        ${q.lid ? `<div class="sub small" style="margin-top:.3rem">複習：${lessonLink(q.lid)}</div>` : ''}</div>`;
      $('#nx').classList.remove('hidden'); $('#nx').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('#nx').onclick = () => { i++; window.scrollTo(0, 0); draw(); };
  };
  draw();
}

/* ---------------- 字典 ---------------- */
function pageDict(){
  setTop('名詞小字典');
  const cats = ['全部', ...new Set(GLOSSARY.map(g => g[1]))];
  let cat = '全部', q = '';
  app.innerHTML = `<div class="search"><span>🔍</span><input id="dq" placeholder="搜尋名詞，例如 本益比、K線" enterkeyhint="search"></div>
    <div class="chips" id="dc">${cats.map(c => `<button data-c="${c}" class="${c === cat ? 'on' : ''}">${c}</button>`).join('')}</div>
    <div class="card list" id="dl" style="margin-top:.7rem"></div>`;
  const draw = () => {
    const k = q.trim().toLowerCase();
    const rows = GLOSSARY.filter(g => (cat === '全部' || g[1] === cat) && (!k || g[0].toLowerCase().includes(k) || g[2].toLowerCase().includes(k)));
    $('#dl').innerHTML = rows.length ? rows.map(g => `<div class="item" data-t="${esc(g[0])}"><div class="grow"><b>${esc(g[0])}</b> <span class="tag">${esc(g[1])}</span>
      <div class="sub small" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(g[2])}</div></div><span class="sub">›</span></div>`).join('')
      : '<p class="sub center">找不到，換個字試試</p>';
    $$('#dl .item').forEach(it => it.onclick = () => openTerm(it.dataset.t));
  };
  $('#dq').oninput = e => { q = e.target.value; draw(); };
  $$('#dc button').forEach(b => b.onclick = () => { cat = b.dataset.c; $$('#dc button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  draw();
}

/* ---------------- 設定 ---------------- */
function pageSettings(){
  setTop('設定', `<a class="iconbtn" href="#home">✕</a>`);
  app.innerHTML = `
    <div class="card"><h2>🔠 字的大小</h2>
      <div class="seg" id="fs">${['小', '標準', '大', '特大', '超大'].map((t, k) => `<button data-k="${k}" class="${k === S.settings.font ? 'on' : ''}">${t}</button>`).join('')}</div>
      <p class="sub" style="margin:.5rem 0 0">這是目前的字體大小</p></div>
    <div class="card"><h2>📲 加到 iPhone 主畫面（建議）</h2>
      <p style="margin:.2rem 0">用 Safari 打開這個網址 → 按下方「分享」<b>⬆️</b> → 選「<b>加入主畫面</b>」。之後點主畫面上的「股票學堂」就能直接上課。</p>
      <div class="warn small">⚠️ 學習進度存在手機的瀏覽器裡。iPhone 的 Safari 對「很久沒打開的網站」可能會清掉資料，加到主畫面比較不會被清，也建議偶爾匯出備份。</div></div>
    <div class="card"><h2>💾 備份進度</h2>
      <div class="btns"><button class="btn ghost" id="exp">複製備份碼</button><button class="btn ghost" id="imp">貼上還原</button></div>
      <textarea id="bk" class="hidden" placeholder="把之前複製的備份碼貼在這裡" style="margin-top:.6rem"></textarea>
      <button class="btn block hidden" id="impok" style="margin-top:.5rem">還原</button>
      <p class="sub small" style="margin:.5rem 0 0">複製後可以貼到 LINE 的「Keep 筆記」或備忘錄保存。</p></div>
    <div class="card"><h2>📈 股票小幫手</h2><p style="margin:.2rem 0 .6rem">查任何股票的走勢、選股、記錄持股。學堂裡的練習也是用它每天更新的真實資料。</p>
      <a class="btn ghost block" href="../">開啟股票小幫手</a></div>
    <div class="card"><h2>🗑️ 重新開始</h2><button class="btn gray block" id="reset">清除全部學習進度</button></div>
    <p class="disclaimer">股票學堂・內容僅供學習參考，不構成投資建議</p>`;
  $$('#fs button').forEach(b => b.onclick = () => { S.settings.font = +b.dataset.k; save(); applyFont(); $$('#fs button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#exp').onclick = async () => {
    const code = 'STOCKLEARN:' + btoa(unescape(encodeURIComponent(JSON.stringify(S))));
    try { await navigator.clipboard.writeText(code); toast('已複製備份碼'); }
    catch (_) { $('#bk').classList.remove('hidden'); $('#bk').value = code; $('#bk').select(); toast('請長按文字框，全選後複製'); }
  };
  $('#imp').onclick = () => { $('#bk').classList.remove('hidden'); $('#bk').value = ''; $('#impok').classList.remove('hidden'); $('#bk').focus(); };
  $('#impok').onclick = () => {
    try {
      const v = $('#bk').value.trim().replace(/^STOCKLEARN:/, '');
      const o = JSON.parse(decodeURIComponent(escape(atob(v))));
      if (!o || typeof o.done !== 'object') throw 0;
      S = Object.assign(DEF(), o); save(); applyFont(); toast('還原成功'); location.hash = '#home';
    } catch (_) { toast('備份碼不正確，請確認有完整貼上'); }
  };
  $('#reset').onclick = () => {
    if (!confirm('確定要清除全部學習進度嗎？清除後無法復原。')) return;
    S = DEF(); save(); applyFont(); toast('已清除'); location.hash = '#home';
  };
}

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('../sw.js').catch(() => {});

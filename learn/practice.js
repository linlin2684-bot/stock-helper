// 股票學堂：練習（真實股票出題、白話體檢）與模擬（時光機挑戰）
'use strict';
const POOL_TW = ['2330', '2317', '2454', '2412', '2881', '2882', '2891', '2303', '2308', '2603', '1301', '2002', '1216', '3711', '2382', '2886', '2357', '3008', '2207', '5880', '2884', '6505', '1303', '2395', '3045', '4904', '2912', '0050', '0056', '00878', '006208', '00919'];
const POOL_US = ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'GOOGL', 'META', 'TSM', 'KO', 'VOO', 'QQQ'];
const closeArr = rows => rows.map(r => r[4]);

async function randStock(pool, minLen = 70, tries = 6, noWatch){
  const okTw = pool.some(p => isTW(p)), okUs = pool.some(p => !isTW(p)), okEtf = pool.some(p => p.startsWith('00'));
  const w = noWatch || typeof watchIds !== 'function' ? [] : watchIds().filter(id => (isTW(id) ? okTw : okUs) && (okEtf || !id.startsWith('00')));
  for (let k = 0; k < tries; k++){
    const fromW = w.length && Math.random() < 0.4, id = fromW ? pickOne(w) : pickOne(pool), mkt = mktOf(id), d = await stock(mkt, id);
    if (d && d.r && d.r.length >= minLen) return { id, mkt, d, nm: (w.includes(id) ? '⭐ ' : '') + ((await names())[mkt][id] || id) };
  }
  return null;
}
// 數字選項：正確答案＋幾個不一樣的錯誤答案
function numOpts(right, wrongs, f){
  const o = [f(right)]; for (const w of wrongs){ const s = f(w); if (!o.includes(s)) o.push(s); if (o.length === 3) break; }
  while (o.length < 3) o.push(f(right * (1.5 + o.length)));
  const sh = shuffle(o); return { o: sh, a: sh.indexOf(f(right)) };
}
const miniChart = (rows, n, opt = {}) => `<div class="w" style="margin-top:0">${chartSVG(rows, { from: rows.length - n, ...opt })}
  ${opt.ma ? `<div class="legend"><span><i style="background:var(--ma5)"></i>5 日</span><span><i style="background:var(--ma20)"></i>20 日（月線）</span><span><i style="background:var(--ma60)"></i>60 日（季線）</span></div>` : ''}</div>`;
const title = s => `<div class="sub small">${esc(s.nm)} ${esc(s.id)}・真實資料</div>`;

/* ---------------- 出題機（每題都用真實股價） ---------------- */
const GEN = [
  { lid: 'l14', name: '漲跌幅', f: async () => {
    const s = await randStock([...POOL_TW, ...POOL_US], 3); if (!s) return null;
    const r = s.d.r, i = r.length - 1 - Math.floor(Math.random() * 15), pc = r[i - 1][4], c = r[i][4], chg = c - pc, cp = chg / pc * 100;
    if (Math.abs(cp) < 0.15) return null;
    const { o, a } = numOpts(cp, [-cp, Math.abs(chg - cp) > 0.3 ? chg : cp * 3, cp * 3, cp / 3], x => pct(x));
    return { pre: title(s), q: `${r[i][0]}：昨天收盤 ${fmtP(pc)}，今天收盤 ${fmtP(c)}。今天的漲跌幅是多少？`, o, a,
      e: `漲跌幅 ＝（今天收盤 − 昨天收盤）÷ 昨天收盤 ＝ (${fmtP(c)} − ${fmtP(pc)}) ÷ ${fmtP(pc)} ≈ ${pct(cp)}。記得分母是「昨天收盤」。` };
  } },
  { lid: 'l15', name: '紅K 黑K', f: async () => {
    const s = await randStock([...POOL_TW, ...POOL_US], 30); if (!s) return null;
    const r = s.d.r; let cand = [];
    for (let i = r.length - 20; i < r.length; i++){ const [, o, , , c] = r[i], pc = r[i - 1][4]; if (Math.abs(c - o) / o > 0.003) cand.push([i, (c > o) !== (c > pc)]); }
    if (!cand.length) return null;
    const trap = cand.filter(x => x[1]); const [i] = trap.length && Math.random() < 0.6 ? pickOne(trap) : pickOne(cand);
    const [d, o, , , c] = r[i], pc = r[i - 1][4], red = c > o;
    return { pre: title(s), q: `${d}：昨天收盤 ${fmtP(pc)}，今天開盤 ${fmtP(o)}、收盤 ${fmtP(c)}。這天畫出來是哪一種 K 線？`,
      o: ['紅K', '黑K（綠色）', '十字線'], a: red ? 0 : 1,
      e: `K 線顏色只看「收盤 vs 開盤」：收盤 ${fmtP(c)} ${red ? '比開盤高 → 紅K' : '比開盤低 → 黑K'}。${(c > pc) !== red ? `注意：這天跟昨天比是${c > pc ? '上漲' : '下跌'}，但 K 線是${red ? '紅' : '黑'}的——這就是新手最容易搞混的地方！` : ''}` };
  } },
  { lid: 'l17', name: '均線位置', f: async () => {
    const s = await randStock([...POOL_TW, ...POOL_US], 90); if (!s) return null;
    const r = s.d.r, m20 = smaArr(closeArr(r), 20), c = r[r.length - 1][4], m = m20[r.length - 1];
    if (Math.abs(c / m - 1) < 0.01) return null;
    const above = c > m;
    return { pre: title(s) + miniChart(r, 90, { ma: true }), html: true, q: '最右邊（最新一天），股價在<b style="color:var(--ma20)">紫色的月線</b>上面還是下面？',
      o: ['在月線上面', '在月線下面'], a: above ? 0 : 1,
      e: `最新收盤 ${fmtP(c)}，月線（20 日均價）${fmtP(m)}，所以股價在月線${above ? '上面：近一個月買的人平均是賺錢的，短線偏強' : '下面：近一個月買的人平均是賠錢的，短線偏弱'}。` };
  } },
  { lid: 'l18', name: '趨勢', f: async () => {
    const s = await randStock([...POOL_TW, ...POOL_US], 70, 10); if (!s) return null;
    const r = s.d.r, n = 60, c0 = r[r.length - n][4], c1 = r[r.length - 1][4], ch = (c1 / c0 - 1) * 100;
    let hi = 0, lo = Infinity; for (let i = r.length - n; i < r.length; i++){ hi = Math.max(hi, r[i][4]); lo = Math.min(lo, r[i][4]); }
    const rng = (hi / lo - 1) * 100;
    const a = ch > 10 ? 0 : ch < -10 ? 1 : (Math.abs(ch) < 4 && rng < 15) ? 2 : -1;
    if (a < 0) return null;
    return { pre: title(s) + miniChart(r, n), q: '這 60 天的走勢，比較像哪一種？', o: ['上升趨勢', '下降趨勢', '盤整（上下震盪）'], a,
      e: `60 天前收盤 ${fmtP(c0)}，現在 ${fmtP(c1)}（${pct(ch, 1)}）。${a === 0 ? '高點、低點大致一路墊高，是上升趨勢。' : a === 1 ? '高點、低點一路往下，是下降趨勢。' : '漲跌幅都不大、在一個區間裡來回，是盤整。'}` };
  } },
  { lid: 'l19', name: '成交量', f: async () => {
    const s = await randStock([...POOL_TW, ...POOL_US], 40, 10); if (!s) return null;
    const r = s.d.r, i = r.length - 1, avg = (r[i - 1][5] + r[i - 2][5] + r[i - 3][5] + r[i - 4][5] + r[i - 5][5]) / 5, ratio = r[i][5] / avg;
    const a = ratio > 1.5 ? 0 : ratio < 0.67 ? 2 : (ratio > 0.85 && ratio < 1.15) ? 1 : -1;
    if (a < 0) return null;
    return { pre: title(s) + miniChart(r, 30, { vol: true }), q: '看下方的成交量柱子：最右邊（最新一天）的量，跟前 5 天比起來？', o: ['明顯放大', '差不多', '明顯縮小'], a,
      e: `最新一天 ${fmt0(volUnit(r[i][5], s.mkt))} ${unitName(s.mkt)}，前 5 天平均 ${fmt0(volUnit(avg, s.mkt))} ${unitName(s.mkt)}，大約是 ${fmt(ratio, 1)} 倍。` };
  } },
  { lid: 'l23', name: '本益比', f: async () => {
    const s = await randStock(POOL_TW.filter(x => !x.startsWith('00')), 2); if (!s) return null;
    const f = s.d.f || {}, c = s.d.r[s.d.r.length - 1][4];
    if (!(f.eps > 0)) return null;
    const pe = c / f.eps; if (pe < 3 || pe > 150) return null; const { o, a } = numOpts(pe, [f.eps / c * 100, pe * 2.2, pe / 2.5], x => fmt(x, 1) + ' 倍');
    return { pre: title(s), q: `${s.nm}股價 ${fmtP(c)} 元，近四季 EPS ${fmt(f.eps)} 元。本益比大約是？`, o, a,
      e: `本益比 ＝ 股價 ÷ EPS ＝ ${fmtP(c)} ÷ ${fmt(f.eps)} ≈ ${fmt(pe, 1)} 倍。意思是照現在的獲利，大約 ${fmt(pe, 0)} 年賺回股價。` };
  } },
  { lid: 'l24', name: '殖利率', f: async () => {
    const s = await randStock(POOL_TW, 2); if (!s) return null;
    const y0 = new Date().getFullYear() - 1, dv = (s.d.dv || []).find(x => x[0] === y0), c = s.d.r[s.d.r.length - 1][4];
    if (!dv || !(dv[1] > 0)) return null;
    const y = dv[1] / c * 100; const { o, a } = numOpts(y, [y * 10, c / dv[1], y / 3], x => fmt(x, 2) + '%');
    return { pre: title(s), q: `${s.nm}股價 ${fmtP(c)} 元，${y0} 年一共配了 ${fmt(dv[1], 2)} 元現金股利。用這個算，殖利率大約是？`, o, a,
      e: `殖利率 ＝ 一年股利 ÷ 股價 ＝ ${fmt(dv[1], 2)} ÷ ${fmtP(c)} ≈ ${fmt(y)}%。買 1 張（1,000 股）約 ${fmt0(c * 1000)} 元，一年約領 ${fmt0(dv[1] * 1000)} 元。` };
  } },
  { lid: 'l25', name: '月營收', f: async () => {
    const s = await randStock(POOL_TW.filter(x => !x.startsWith('00')), 2); if (!s) return null;
    const f = s.d.f || {}; if (f.yoy == null) return null;
    const up = f.yoy >= 0, v = pct(f.yoy, 1);
    return { pre: title(s), q: `${s.nm}最新月營收「年增率 ${v}」，意思是？`, o: shuffle([`這個月營收比去年同一個月${up ? '多' : '少'} ${Math.abs(f.yoy).toFixed(1)}%`, `這個月營收比上個月${up ? '多' : '少'} ${Math.abs(f.yoy).toFixed(1)}%`, `股價今年${up ? '漲' : '跌'}了 ${Math.abs(f.yoy).toFixed(1)}%`]),
      get a(){ return this.o.findIndex(x => x.includes('去年同一個月')); },
      e: `「年增率」是跟「去年同一個月」比，可以避開季節差異（例如過年月份營收本來就比較少）。跟上個月比叫「月增率」。` };
  } },
  { lid: 'l26', name: '三大法人', f: async () => {
    const s = await randStock(POOL_TW, 2); if (!s) return null;
    const ch = (s.d.ch || []).slice(-5); if (ch.length < 5) return null;
    const v = ch.map(x => x[1]), a = v.every(x => x > 0) ? 0 : v.every(x => x < 0) ? 1 : 2;
    return { pre: title(s) + `<div class="w"><table class="tbl"><tr><th>日期</th><th>外資買賣超（張）</th></tr>${ch.map(x => `<tr><td>${x[0].slice(5)}</td><td class="${cls(x[1])}">${x[1] > 0 ? '+' : ''}${fmt0(x[1])}</td></tr>`).join('')}</table></div>`,
      q: '看上面的表，外資最近 5 天是？', o: ['連續買超', '連續賣超', '有買有賣，方向不一致'], a,
      e: '正數（紅色）是買超、負數（綠色）是賣超。' + (a === 2 ? '方向不一致時，就不算「外資連續買超」，別只看一天就下結論。' : `5 天都是同一方向，代表外資這段時間持續${a ? '賣出' : '買進'}。但法人也會看錯，只是參考線索。`) };
  } },
  { lid: 'l23', name: '比本益比', f: async () => {
    const sc = await data('screen-tw.json'); if (!sc) return null;
    const ci = Object.fromEntries(sc.cols.map((c, k) => [c, k])), byInd = {};
    sc.rows.forEach(r => { if (r[ci.pe] > 0 && r[ci.av] > 2000 && r[ci.ind] && !r[0].startsWith('00') && r[ci.ind] !== 'ETF') (byInd[r[ci.ind]] ||= []).push(r); });
    const inds = Object.keys(byInd).filter(k => byInd[k].length >= 2); if (!inds.length) return null;
    const [x, y] = shuffle(byInd[pickOne(inds)]); if (Math.abs(x[ci.pe] - y[ci.pe]) < 2) return null;
    const a = x[ci.pe] < y[ci.pe] ? 0 : 1;
    return { pre: `<div class="sub small">真實資料・同產業：${esc(x[ci.ind])}</div>`, q: `同樣是「${x[ci.ind]}」，${x[ci.n]} 本益比 ${fmt(x[ci.pe], 1)} 倍，${y[ci.n]} 本益比 ${fmt(y[ci.pe], 1)} 倍。單看本益比，哪一支比較「便宜」？`,
      o: [`${x[ci.n]}`, `${y[ci.n]}`], a,
      e: '本益比越低，代表用比較少的錢買到同樣的獲利，看起來比較便宜。但「便宜」也可能是市場覺得它以後賺不了這麼多——還要搭配營收成長、產業前景一起看。' };
  } },
];

async function buildPractice(n = 5){
  const learned = GEN.filter(g => S.done[g.lid]), pool = learned.length >= 3 ? learned : GEN.filter(g => LBYID[g.lid].no <= 16);
  const out = [], used = {};
  for (let tries = 0; out.length < n && tries < n * 6; tries++){
    const g = pickOne(pool); if ((used[g.name] || 0) >= 2) continue;
    let q = null; try { q = await g.f(); } catch (e){ console.error(e); }
    if (q){ q.lid = g.lid; if (!S.done[g.lid]) q.pre = (q.pre || '') + '<div class="sub small">（這題的課還沒上到，可以先猜猜看）</div>'; out.push(q); used[g.name] = (used[g.name] || 0) + 1; }
  }
  return out;
}

/* ---------------- 練習首頁 ---------------- */
function pagePractice(tok){
  setTop('實戰練習');
  const learned = [...new Set(GEN.filter(g => S.done[g.lid]).map(g => g.name))];
  app.innerHTML = `
    <div class="card"><h2>🎯 用真實股票考考自己</h2>
      <p style="margin:.2rem 0 .6rem">每次 5 題，題目用台股、美股的<b>真實股價</b>即時出題，每次都不一樣。</p>
      <div class="sub small" style="margin-bottom:.6rem">${learned.length ? `已解鎖題型：${learned.join('、')}` : '先上完幾課，會解鎖更多題型。現在先出入門題。'}</div>
      <button class="btn block" id="go">開始 5 題練習</button>
      ${S.prac.n ? `<div class="sub small center" style="margin-top:.5rem">累計做了 ${S.prac.n} 題，答對 ${Math.round(S.prac.ok / S.prac.n * 100)}%</div>` : ''}</div>
    <div class="card"><h2>🔎 白話體檢：看懂一支股票</h2>
      <p style="margin:.2rem 0 .6rem">輸入任何股票，把它的走勢、本益比、殖利率、法人動向，<b>一項一項翻成白話</b>。</p>
      <div class="search" style="box-shadow:none;background:var(--bg);margin:0"><span>🔍</span><input id="sq" placeholder="例如 2330、台積電、AAPL" autocomplete="off" enterkeyhint="search"></div>
      <div class="list" id="sr"></div>
      ${hasRealWatch() && watchIds().length ? `<div class="sub small" style="margin-top:.6rem">⭐ 我的自選股（來自股票小幫手）</div><div class="chips" style="margin-top:.3rem">${watchIds().map(k => `<button data-x="${esc(k)}">${esc(k)}</button>`).join('')}</div>` : ''}
      <div class="sub small" style="margin-top:.6rem">熱門</div><div class="chips" style="margin-top:.3rem">${[['2330', '台積電'], ['0050', '元大台灣50'], ['00878', '國泰永續高股息'], ['2412', '中華電'], ['AAPL', '蘋果'], ['NVDA', '輝達']].map(([k, n]) => `<button data-x="${k}">${n}</button>`).join('')}</div></div>
    <a class="card row" href="#cards" style="text-decoration:none;color:inherit"><span style="font-size:1.6rem">🃏</span><div class="grow"><b>名詞閃卡</b><div class="sub">${fcDue().length ? `今天有 ${fcDue().length} 張要複習` : '學過的名詞，隔一段時間再考一次，記得更牢'}</div></div><span class="sub">›</span></a>
    <a class="card row" href="#pattern" style="text-decoration:none;color:inherit"><span style="font-size:1.6rem">🔍</span><div class="grow"><b>看圖找型態</b><div class="sub">在真實走勢圖裡找出長上影線、十字線、爆量、黃金交叉</div></div><span class="sub">›</span></a>
    ${Object.keys(S.wrong).length ? `<a class="card row" href="#review" style="text-decoration:none;color:inherit"><span style="font-size:1.6rem">📝</span><div class="grow"><b>複習課後答錯的題目</b><div class="sub">${Object.keys(S.wrong).length} 題</div></div><span class="sub">›</span></a>` : ''}
    <p class="disclaimer">練習只是幫你看懂數字，不是買賣建議。</p>`;
  $('#go').onclick = startPractice;
  names().then(N => $$('[data-x]').forEach(b => { if (/^[0-9A-Z.^]+$/.test(b.textContent)){ const n = N[mktOf(b.dataset.x)][b.dataset.x]; if (n) b.textContent = n; } }));
  $$('[data-x]').forEach(b => b.onclick = () => location.hash = '#x-' + mktOf(b.dataset.x) + '-' + b.dataset.x);
  let L2 = null;
  $('#sq').oninput = async e => {
    const k = e.target.value.trim().toLowerCase(); if (!L2) L2 = await data('list.json');
    if (!alive(tok)) return;
    if (!k || !L2){ $('#sr').innerHTML = ''; return; }
    const m = [...L2.tw.map(r => ['tw', r[0], r[1]]), ...L2.us.map(r => ['us', r[0], r[1]])]
      .filter(([, id, n]) => id.toLowerCase().startsWith(k) || String(n).toLowerCase().includes(k)).slice(0, 8);
    $('#sr').innerHTML = m.map(([mk, id, n]) => `<a class="item" href="#x-${mk}-${encodeURIComponent(id)}"><b>${esc(n)}</b><span class="sub">${esc(id)}</span><span class="grow"></span><span class="sub">›</span></a>`).join('') || '<p class="sub">找不到這支股票</p>';
  };
}
async function startPractice(){
  setTop('實戰練習', `<a class="iconbtn" href="#practice" onclick="setTimeout(route)">✕</a>`);
  app.innerHTML = '<div class="card"><p class="center">正在用真實資料出題…</p><div class="skeleton"></div><div class="skeleton"></div></div>';
  const tok = routeToken, qs = await buildPractice(5);
  if (tok !== routeToken) return;
  if (qs.length < 2){ app.innerHTML = '<div class="card"><p>📡 股價資料暫時抓不到，等一下再試。</p><a class="btn ghost block" href="#practice" onclick="setTimeout(route)">回練習</a></div>'; return; }
  runQuiz(qs, '實戰練習', (ok, n) => { S.prac.n += n; S.prac.ok += ok; addActivity(ok * 5); }, startPractice);
}

/* ---------------- 白話體檢 ---------------- */
async function pageExplain(p, tok){
  const [mkt, ...rest] = p.split('-'), id = rest.join('-');
  setTop('白話體檢', `<a class="iconbtn" href="#practice">✕</a>`);
  app.innerHTML = '<div class="skeleton" style="height:8rem"></div><div class="skeleton" style="height:12rem"></div>';
  const [d, sc, nm] = await Promise.all([stock(mkt, id), data(`screen-${mkt}.json`), names()]);
  if (!alive(tok)) return;
  if (!d || !d.r || d.r.length < 2){ app.innerHTML = '<div class="card"><p>📡 這支股票的資料暫時抓不到。</p><a href="#practice">回練習</a></div>'; return; }
  S.xn = (S.xn || 0) + 1; save(); checkBadges();
  const ci = sc ? Object.fromEntries(sc.cols.map((c, k) => [c, k])) : {}, row = sc?.rows.find(r => r[0] === id);
  const g = k => row ? row[ci[k]] : null, name = nm[mkt][id] || row?.[ci.n] || id, f = d.f || {};
  const isETF = mkt === 'tw' ? id.startsWith('00') : ['SPY', 'VOO', 'IVV', 'QQQ', 'DIA', 'VTI', 'VT', 'IWM', 'SOXX', 'SMH', 'SCHD', 'JEPI', 'VIG', 'TLT', 'BND', 'GLD'].includes(id);
  const r = d.r, c = r[r.length - 1][4];
  const C = closeArr(r), m20 = smaArr(C, 20)[r.length - 1], m60 = smaArr(C, 60)[r.length - 1];
  const items = [];
  const add = (ic, t, body, lid) => items.push(`<div class="check"><span class="ic">${ic}</span><div class="grow"><b>${t}</b><div>${body}</div>${lid ? `<div class="sub small">👉 ${lessonLink(lid)}</div>` : ''}</div></div>`);
  if (m20 && m60){
    const a20 = c > m20, a60 = c > m60;
    add(a20 && a60 ? '📈' : !a20 && !a60 ? '📉' : '↔️', '趨勢：跟均線比',
      `股價 ${fmtP(c)}，${a20 ? '在' : '低於'}月線 ${fmtP(m20)}、${a60 ? '在' : '低於'}季線 ${fmtP(m60)}。` +
      (a20 && a60 ? '短期、中期都偏強：最近買的人大多是賺錢的。' : !a20 && !a60 ? '短期、中期都偏弱：最近買的人大多在賠錢，上方容易有賣壓。' : a20 ? '短期轉強，但中期還沒站穩。' : '中期還算可以，但短期轉弱，要觀察。'), 'l17');
  }
  const r20 = g('r20'); if (r20 != null) add(r20 > 0 ? '🔺' : '🔻', '近一個月漲跌', `最近 20 個交易日 <b class="${cls(r20)}">${pct(r20, 1)}</b>。${Math.abs(r20) > 20 ? '短時間漲跌很大，波動劇烈，追高殺低都要特別小心。' : ''}`, 'l18');
  const vr = g('vr'); if (vr != null) add('📊', '成交量', `今天的量大約是前 5 天平均的 <b>${fmt(vr, 1)} 倍</b>。${vr > 1.8 ? '明顯放大：今天很多人在搶著買或搶著賣，留意是哪個方向。' : vr < 0.6 ? '明顯縮小：交易冷清，大家在觀望。' : '跟平常差不多。'}`, 'l19');
  const rsi = g('rsi'); if (rsi != null) add('🌡️', 'RSI 熱度', `RSI ${fmt(rsi, 0)}。${rsi > 70 ? '超過 70，短線偏「熱」，追高要小心。' : rsi < 30 ? '低於 30，短線偏「冷」，跌得有點多，但不代表馬上會反彈。' : '在 30～70 之間，不算過熱也不算過冷。'}`, 'l20');
  if (!isETF && mkt === 'tw'){
    const pe = g('pe') ?? f.pe;
    if (pe > 0){
      const peers = (sc?.rows || []).filter(x => x[ci.ind] === g('ind') && x[ci.pe] > 0).map(x => x[ci.pe]).sort((a, b) => a - b), med = peers.length >= 5 ? peers[Math.floor(peers.length / 2)] : null;
      add('🏷️', '本益比：貴不貴', `本益比 <b>${fmt(pe, 1)} 倍</b>（照現在獲利，約 ${fmt(pe, 0)} 年賺回股價）。` + (med ? `同產業「${esc(g('ind'))}」${peers.length} 家公司的中間值約 ${fmt(med, 1)} 倍，這支${pe < med * 0.8 ? '比同業便宜' : pe > med * 1.25 ? '比同業貴，市場對它期待比較高' : '跟同業差不多'}。` : ''), 'l23');
    } else add('🏷️', '本益比', '沒有本益比資料：可能是公司最近在虧錢（EPS 是負的），這時候本益比沒意義。', 'l23');
    const yoy = g('yoy') ?? f.yoy; if (yoy != null) add(yoy >= 0 ? '🧾' : '⚠️', '月營收', `最新月營收${f.revm ? `（${esc(f.revm)}）` : ''}比去年同月 <b class="${cls(yoy)}">${pct(yoy, 1)}</b>。${yoy > 20 ? '成長很明顯，生意變好。' : yoy < -10 ? '衰退中，要了解原因。' : '變化不大。'}`, 'l25');
    const fb = g('fb'), tb = g('tb');
    if (fb != null) add('🏦', '三大法人', `外資${fb > 1 ? `<b class="up">連續買超 ${fb} 天</b>` : fb < -1 ? `<b class="down">連續賣超 ${-fb} 天</b>` : '最近沒有連續買賣'}；投信${tb > 1 ? `<b class="up">連續買超 ${tb} 天</b>` : tb < -1 ? `<b class="down">連續賣超 ${-tb} 天</b>` : '最近沒有連續買賣'}。法人動向只是參考線索，不是跟單訊號。`, 'l26');
  }
  const y = g('y') ?? f.y, dy = g('dy');
  if (y != null || dy) add('💰', '配息', `${y != null ? `殖利率約 <b>${fmt(y)}%</b>。` : ''}${dy ? `已經連續 <b>${dy} 年</b>配息。` : ''}${y > 8 ? '殖利率特別高要小心是不是一次性的。' : ''}`, 'l24');
  if (isETF) add('🧺', '這是 ETF', 'ETF 是一籃子股票，不是單一公司，所以沒有 EPS、本益比；重點看它追蹤什麼、費用率、配息和長期總報酬。', 'l13');
  app.innerHTML = `<div class="card"><div class="w" id="eq" style="margin:0;background:none;padding:0"></div></div>
    <div class="card"><h2>📈 走勢圖（近 120 天）</h2><div class="w" id="ec" style="margin:0"></div></div>
    <div class="card"><h2>🩺 一項一項看</h2>${items.join('') || '<p class="sub">這支股票的指標資料還不夠。</p>'}</div>
    <div class="warn small">這是幫你「看懂數字」，不是叫你買或賣。任何一個指標都不是 100% 準，要綜合判斷，並只用閒錢。</div>
    <a class="btn ghost block" href="../#s-${mkt}-${encodeURIComponent(id)}">在股票小幫手看更多 ›</a>
    <p class="disclaimer">資料日期 ${r[r.length - 1][0]}，每天收盤後更新</p>`;
  W.quote($('#eq'), [id]); W.chart($('#ec'), [id, Math.min(120, r.length), 'ma', 'vol']);
}

/* ---------------- 模擬：時光機挑戰 ---------------- */
function pageSim(){
  setTop('時光機挑戰');
  const tm = S.tm || [], n = tm.length, right = tm.filter(x => (x.c === 'buy') === (x.r > 0)).length;
  const bought = tm.filter(x => x.c === 'buy'), pnl = bought.reduce((a, x) => a + 100000 * x.r, 0);
  app.innerHTML = `
    <div class="card"><h2>🕰️ 回到過去的某一天</h2>
      <p style="margin:.2rem 0">系統隨機挑一支<b>真實股票</b>，帶你回到過去某一天，只給你看<b>那天以前</b>的走勢圖（不告訴你是哪一支）。</p>
      <p style="margin:.4rem 0">你決定：<b class="up">買進</b>（抱 20 個交易日）或<b>不買</b>。然後時光機往前跑，揭曉之後真正發生什麼事。</p>
      <div class="sub small" style="margin-top:.6rem">股票來源</div>
      <div class="seg" id="mk" style="margin:.3rem 0">${[['tw', '台股'], ['us', '美股'], ['etf', 'ETF'], ...(watchIds().length ? [['watch', '⭐自選']] : [])].map(([k, t], i) => `<button data-k="${k}" class="${i ? '' : 'on'}">${t}</button>`).join('')}</div>
      <div class="sub small" style="margin-top:.4rem">買進後抱多久</div>
      <div class="seg" id="hd" style="margin:.3rem 0">${[[5, '5 天'], [20, '20 天'], [60, '60 天']].map(([k, t]) => `<button data-k="${k}" class="${k === 20 ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="sub small" style="margin-top:.4rem">停損（跌到就自動賣）</div>
      <div class="seg" id="sl" style="margin:.3rem 0 .7rem">${[[0, '不設'], [5, '−5%'], [8, '−8%'], [10, '−10%']].map(([k, t]) => `<button data-k="${k}" class="${k ? '' : 'on'}">${t}</button>`).join('')}</div>
      <button class="btn block" id="go">開始一局</button></div>
    <a class="card row" href="#dcasim" style="text-decoration:none;color:inherit"><span style="font-size:1.6rem">⏩</span><div class="grow"><b>快轉定期定額</b><div class="sub">回到兩年前，一個月一個月快轉，體驗大跌時撐不撐得住</div></div><span class="sub">›</span></a>
    ${n ? `<div class="card"><h2>📒 我的紀錄</h2>
      <div class="kv"><div><span>玩了</span><b>${n} 局</b></div><div><span>判斷正確</span><b>${Math.round(right / n * 100)}%</b></div>
      <div><span>選擇買進</span><b>${bought.length} 次</b></div><div><span>每次買 10 萬，合計</span><b class="${cls(pnl)}">${pnl >= 0 ? '+' : ''}${fmt0(pnl)} 元</b></div></div>
      <div class="list" style="margin-top:.5rem">${tm.slice(-8).reverse().map(x => `<div class="item"><span>${x.c === 'buy' ? '🛒' : '✋'}</span><div class="grow"><b>${esc(x.n)}</b> <span class="sub small">${x.d}</span>
        <div class="sub small">${x.c === 'buy' ? '買進' : '不買'} → 之後 ${x.h || 20} 天${x.sl ? `（停損 −${x.sl}%）` : ''} <span class="${cls(x.r)}">${pct(x.r * 100, 1)}</span></div></div><span>${(x.c === 'buy') === (x.r > 0) ? '✅' : '❌'}</span></div>`).join('')}</div>
      <p class="sub small" style="margin:.4rem 0 0">判斷正確＝買了之後有賺，或不買而之後真的跌（已扣買賣成本）。</p></div>` : ''}
    <div class="card"><h2>💼 想用今天的價格練習買賣？</h2><p style="margin:.2rem 0 .6rem">股票小幫手有「模擬買賣」：用虛擬的錢、真實的每日收盤價，練習下單和看損益。</p>
      <a class="btn ghost block" href="../#portfolio">開啟模擬買賣 ›</a></div>
    <p class="disclaimer">玩幾局就會發現：沒有任何一個訊號 100% 準，所以才需要分散、紀律和控制風險。</p>`;
  let mk = 'tw', hd = 20, sl = 0;
  const seg = (id, f) => $$(`#${id} button`).forEach(b => b.onclick = () => { f(b.dataset.k); $$(`#${id} button`).forEach(x => x.classList.toggle('on', x === b)); });
  seg('mk', v => mk = v); seg('hd', v => hd = +v); seg('sl', v => sl = +v);
  $('#go').onclick = () => tmRound(mk, hd, sl);
}
async function tmRound(mk, H = 20, sl = 0){
  setTop('時光機挑戰', `<a class="iconbtn" href="#sim" onclick="setTimeout(route)">✕</a>`);
  app.innerHTML = '<div class="card"><p class="center">時光機啟動中…</p><div class="skeleton" style="height:12rem"></div></div>';
  const tok = routeToken;
  let cand = [];
  if (mk === 'watch') cand = watchIds();
  else {
    const sc = await data(`screen-${mk === 'us' ? 'us' : 'tw'}.json`);
    if (sc){
      const ci = Object.fromEntries(sc.cols.map((c, k) => [c, k]));
      let rows = sc.rows.filter(r => r[ci.c] > 0 && !/^\^|^_|^TAIEX|^TPEx/.test(r[0]));
      rows = mk === 'etf' ? rows.filter(r => r[0].startsWith('00')) : mk === 'tw' ? rows.filter(r => !r[0].startsWith('00')) : rows;
      rows.sort((a, b) => b[ci.av] * b[ci.c] - a[ci.av] * a[ci.c]);
      cand = rows.slice(0, mk === 'etf' ? 40 : 200).map(r => r[0]);
    }
    if (!cand.length) cand = mk === 'us' ? POOL_US : mk === 'etf' ? POOL_TW.filter(x => x.startsWith('00')) : POOL_TW.filter(x => !x.startsWith('00'));
  }
  if (tok !== routeToken) return;
  const s = await randStock(cand, 90 + H, 8, true);
  if (tok !== routeToken) return;
  if (!s){ app.innerHTML = '<div class="card"><p>📡 股價資料暫時抓不到，等一下再試。</p><a class="btn ghost block" href="#sim" onclick="setTimeout(route)">回模擬</a></div>'; return; }
  const mkt = s.mkt, r = s.d.r, t = 70 + Math.floor(Math.random() * (r.length - 70 - H - 1)), from = t - 59;
  const isEtf = mkt === 'tw' && s.id.startsWith('00'), cost = mkt === 'tw' ? (isEtf ? 0.00385 : 0.00585) : 0.001;
  const benchId = mkt === 'tw' ? '0050' : 'VOO';
  app.innerHTML = `<div class="card"><div class="row"><b class="grow">🕵️ 神秘${isEtf ? ' ETF' : '股票'}</b><span class="sub small">${mkt === 'tw' ? '台股' : '美股'}・抱 ${H} 天${sl ? `・停損 −${sl}%` : ''}</span></div>
      <div class="sub small">假設今天是圖上最後一天，收盤價 <b style="color:var(--text)">${fmtP(r[t][4])}</b></div>
      <div id="tc"></div><div id="ti"></div></div>
    <div class="card" id="tq"><b>你會怎麼做？</b><div class="sub small" style="margin:.2rem 0 .6rem">買進的話會抱 ${H} 個交易日再賣${sl ? `，中間跌超過 ${sl}% 就自動停損賣出` : ''}。</div>
      <div class="btns"><button class="btn red" id="buy">🛒 買進</button><button class="btn gray" id="skip">✋ 不買</button></div>
      <button class="btn ghost block" id="hint" style="margin-top:.6rem">💡 給我一點提示</button></div>`;
  const info = $('#ti');
  const ch = bindChart($('#tc'), r, { from, to: t + 1, ma: true, vol: true, sel: t }, i => { info.innerHTML = dayInfo(r, i, mkt, true); });
  info.innerHTML = '<div class="sub small" style="margin-top:.3rem">👆 點圖可以看每一天的 K 線細節</div>';
  $('#hint').onclick = () => {
    const C = closeArr(r), m20 = smaArr(C, 20)[t], m60 = smaArr(C, 60)[t], r20 = (C[t] / C[t - 20] - 1) * 100;
    let v5 = 0; for (let k = 1; k <= 5; k++) v5 += r[t - k][5]; const vr = r[t][5] / (v5 / 5);
    $('#hint').outerHTML = `<div class="res"><div>• 股價${C[t] > m20 ? '在' : '低於'}月線、${C[t] > m60 ? '在' : '低於'}季線</div><div>• 近 20 天 <span class="${cls(r20)}">${pct(r20, 1)}</span></div><div>• 最後一天成交量是前 5 天的 ${fmt(vr, 1)} 倍</div>
      <div class="sub small">這些都是線索，不是答案。</div></div>`;
  };
  const decide = async c => {
    const entry = r[t][4]; let exitI = t + H, exitP = r[t + H][4], stopped = false;
    if (sl){ const stopP = entry * (1 - sl / 100); for (let k = t + 1; k <= t + H; k++){ if (r[k][3] <= stopP){ exitI = k; exitP = Math.min(r[k][1], stopP); stopped = true; break; } } }
    const holdRet = r[t + H][4] / entry - 1, ret = exitP / entry - 1, net = ret - cost, right = (c === 'buy') === (net > 0);
    let mx = -Infinity, mn = Infinity; for (let k = t + 1; k <= t + H; k++){ mx = Math.max(mx, r[k][2]); mn = Math.min(mn, r[k][3]); }
    S.tm.push({ id: s.id, n: s.nm.replace('⭐ ', ''), d: r[t][0], c, r: +net.toFixed(4), h: H, sl }); if (S.tm.length > 200) S.tm.shift();
    addActivity(right ? 4 : 2);
    ch.redraw({ to: t + H + 1, mark: t + 1 }); ch.setSel(exitI);
    info.innerHTML = '';
    // 同期間買大盤 ETF 比較
    let bench = '';
    if (s.id !== benchId){
      const b = await stock(mkt, benchId);
      if (b?.r){ const bi = b.r.findIndex(x => x[0] === r[t][0]), be = b.r.findIndex(x => x[0] === r[t + H][0]);
        if (bi >= 0 && be > bi){ const br = b.r[be][4] / b.r[bi][4] - 1; bench = `<div>同一段時間買 <b>${benchId}</b>（${mkt === 'tw' ? '台灣 50 大' : 'S&P 500'}）：<b class="${cls(br)}">${pct(br * 100, 1)}</b>${c === 'buy' ? `，你${net > br ? '贏' : '輸'}了大盤` : ''}</div>`; } }
    }
    $('#tq').innerHTML = `<div class="center"><div class="big">${right ? '🎯' : '🌀'}</div><h3 style="margin:.2rem 0">${right ? '判斷正確！' : '這次沒猜中'}</h3></div>
      <div class="res"><div>這是 <b>${esc(s.nm)}（${esc(s.id)}）</b>，那天是 <b>${r[t][0]}</b></div>
        <div>${H} 個交易日後股價 ${fmtP(entry)} → ${fmtP(r[t + H][4])}，<b class="${cls(holdRet)}">${pct(holdRet * 100, 1)}</b></div>
        <div>期間最高 ${fmtP(mx)}（${pct((mx / entry - 1) * 100, 1)}），最低 ${fmtP(mn)}（${pct((mn / entry - 1) * 100, 1)}）</div>
        ${stopped && c === 'buy' ? `<div>⛔ 第 ${exitI - t} 天跌到停損價，以 ${fmtP(exitP)} 賣出${holdRet > ret ? '——結果後來又漲回來，停損有時會「被洗掉」' : '——停損幫你擋住了後面更大的跌幅'}。</div>` : ''}
        <div style="margin-top:.3rem">${c === 'buy' ? `你買了：扣掉手續費和稅約 ${fmt(cost * 100, 2)}% 後，<b class="${cls(net)}">${net >= 0 ? '賺' : '賠'} ${fmt(Math.abs(net) * 100, 1)}%</b>（買 10 萬約 ${net >= 0 ? '賺' : '賠'} ${fmt0(Math.abs(net) * 100000)} 元）`
          : `你沒買：${net > 0 ? `錯過了約 ${fmt(net * 100, 1)}% 的漲幅` : `避開了約 ${fmt(-net * 100, 1)}% 的損失`}`}</div>${bench}
        ${!sl && (mn / entry - 1) < -0.08 && c === 'buy' ? '<div class="sub small" style="margin-top:.3rem">中間曾經跌超過 8%——下次試試設停損，看看結果會不會不一樣。</div>' : ''}</div>
      <div class="btns" style="margin-top:.7rem"><a class="btn gray" href="#sim" onclick="setTimeout(route)">看紀錄</a><button class="btn" id="again">再玩一局</button></div>`;
    $('#again').onclick = () => tmRound(mk, H, sl);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  $('#buy').onclick = () => decide('buy'); $('#skip').onclick = () => decide('skip');
}

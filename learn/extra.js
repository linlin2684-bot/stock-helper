// 股票學堂：今日市場白話、名詞閃卡、看圖找型態、快轉定期定額、成就徽章、自選股連動
'use strict';
S.fc = S.fc || {}; S.fcN = S.fcN || 0; S.pat = S.pat || { n: 0, ok: 0 }; S.dcas = S.dcas || []; S.badges = S.badges || {}; S.xn = S.xn || 0;

/* ---------------- 自選股（股票小幫手存在同一個網站的資料） ---------------- */
function watchIds(){
  let w = null;
  try { w = JSON.parse(localStorage.getItem('sh_watch')); } catch (_) {}
  if (!Array.isArray(w)) w = ['tw:2330', 'tw:0050', 'us:AAPL'];
  return w.map(k => String(k).split(':')).filter(([m, id]) => id && (m === 'tw' || m === 'us') && !/^(TAIEX|TPEx|\^)/.test(id)).map(([, id]) => id);
}
const hasRealWatch = () => { try { return Array.isArray(JSON.parse(localStorage.getItem('sh_watch'))); } catch (_) { return false; } };

/* ---------------- 今日市場白話 ---------------- */
async function marketData(){
  const [st, tw, tpex, sc, sp, nq, sox] = await Promise.all([data('status.json'), stock('tw', 'TAIEX'), stock('tw', 'TPEx'), data('screen-tw.json'), stock('us', '^GSPC'), stock('us', '^IXIC'), stock('us', '^SOX')]);
  if (!tw || !tw.r || tw.r.length < 61) return null;
  const r = tw.r, n = r.length, c = r[n - 1][4], pc = r[n - 2][4], C = r.map(x => x[4]);
  const M = { date: r[n - 1][0], c, chg: c - pc, cp: (c / pc - 1) * 100, m20: smaArr(C, 20)[n - 1], m60: smaArr(C, 60)[n - 1], r20: (c / r[n - 21][4] - 1) * 100 };
  const hi = Math.max(...C.slice(-250)); M.fromHi = (c / hi - 1) * 100;
  if (tpex?.r?.length > 1){ const t = tpex.r, k = t.length; M.otc = (t[k - 1][4] / t[k - 2][4] - 1) * 100; }
  if (sc){
    const ci = Object.fromEntries(sc.cols.map((x, k) => [x, k])), rows = sc.rows.filter(x => x[ci.c] > 0 && x[0] !== 'TAIEX');
    M.up = rows.filter(x => x[ci.chg] > 0).length; M.down = rows.filter(x => x[ci.chg] < 0).length;
    M.lu = rows.filter(x => x[ci.chg] >= 9.5).length; M.ld = rows.filter(x => x[ci.chg] <= -9.5).length;
    let f = 0, t = 0, has = false;
    rows.forEach(x => { if (x[ci.fn] != null){ has = true; f += x[ci.fn] * x[ci.c] * 1000; t += (x[ci.tn] || 0) * x[ci.c] * 1000; } });
    if (has){ M.foreign = f / 1e8; M.trust = t / 1e8; }
    const liq = rows.filter(x => x[ci.av] >= 3000 && !x[0].startsWith('00'));
    M.top = liq.slice().sort((a, b) => b[ci.chg] - a[ci.chg]).slice(0, 3).map(x => [x[0], x[ci.n], x[ci.chg]]);
    M.bot = liq.slice().sort((a, b) => a[ci.chg] - b[ci.chg]).slice(0, 3).map(x => [x[0], x[ci.n], x[ci.chg]]);
  }
  const usd = d => { if (!d?.r || d.r.length < 2) return null; const k = d.r.length; return { d: d.r[k - 1][0], cp: (d.r[k - 1][4] / d.r[k - 2][4] - 1) * 100 }; };
  M.sp = usd(sp); M.nq = usd(nq); M.sox = usd(sox);
  if (st?.fx) M.fx = st.fx;
  return M;
}
function marketBullets(M){
  const B = [];
  const big = Math.abs(M.cp) >= 2 ? '，算是很大的波動' : Math.abs(M.cp) < 0.5 ? '，變化不大' : '';
  B.push(['📊', `台股加權指數收 <b>${fmt0(M.c)}</b> 點，${M.chg >= 0 ? '漲' : '跌'} <b class="${cls(M.chg)}">${fmt0(Math.abs(M.chg))} 點（${pct(M.cp)}）</b>${big}。${M.otc != null ? `櫃買指數（中小型股）${pct(M.otc)}。` : ''}`, 'l42', '看漲跌要看百分比']);
  if (M.up != null) B.push(['⚖️', `上漲 <b class="up">${fmt0(M.up)}</b> 家、下跌 <b class="down">${fmt0(M.down)}</b> 家${M.lu ? `，漲停 ${M.lu} 家` : ''}${M.ld ? `，跌停 ${M.ld} 家` : ''}。${M.down > M.up * 2 ? '大部分股票都在跌，賣的人明顯比買的人多。' : M.up > M.down * 2 ? '大部分股票都在漲，買氣很旺。' : '漲跌家數差不多，有漲有跌。'}`, 'l2', '股價為什麼漲跌']);
  if (M.m20) B.push(['〰️', `大盤${M.c > M.m20 ? '在' : '跌破'}月線（${fmt0(M.m20)}）、${M.c > M.m60 ? '在' : '跌破'}季線（${fmt0(M.m60)}）。${M.c > M.m20 && M.c > M.m60 ? '短中期趨勢偏多。' : M.c < M.m20 && M.c < M.m60 ? '短中期都轉弱。' : '短中期方向不一致，在整理。'}近一個月 ${pct(M.r20, 1)}，距離一年內最高點 ${pct(M.fromHi, 1)}。`, 'l17', '均線']);
  if (M.foreign != null) B.push(['🏦', `外資估計${M.foreign >= 0 ? '買超' : '賣超'}約 <b class="${cls(M.foreign)}">${fmt0(Math.abs(M.foreign))} 億元</b>，投信${M.trust >= 0 ? '買超' : '賣超'}約 ${fmt0(Math.abs(M.trust))} 億元。${Math.abs(M.foreign) > 200 ? '外資動作很大，常跟匯率一起變化。' : ''}`, 'l26', '三大法人']);
  if (M.fx){ const d = M.fx.rate - M.fx.prev; B.push(['💱', `美元兌新台幣 <b>${fmt(M.fx.rate, 2)}</b>，${Math.abs(d) < 0.01 ? '幾乎沒變' : d > 0 ? `比前一天多 ${fmt(d, 2)} 元——<b>新台幣貶值</b>` : `比前一天少 ${fmt(-d, 2)} 元——<b>新台幣升值</b>`}。`, 'l41', '匯率']); }
  if (M.sp) B.push(['🇺🇸', `美股（${M.sp.d.slice(5).replace('-', '/')}）：標普 500 <b class="${cls(M.sp.cp)}">${pct(M.sp.cp)}</b>${M.nq ? `、那斯達克 <b class="${cls(M.nq.cp)}">${pct(M.nq.cp)}</b>` : ''}${M.sox ? `、費城半導體 <b class="${cls(M.sox.cp)}">${pct(M.sox.cp)}</b>` : ''}。${M.sox && Math.abs(M.sox.cp) >= 3 ? '費半波動很大，台灣半導體股常會跟著反應。' : ''}`, 'l42', '看懂財經新聞']);
  return B;
}
async function mountMarketCard(el){
  const M = await marketData(); if (!el.isConnected || !M) return;
  const B = marketBullets(M).slice(0, 3);
  el.innerHTML = `<a class="card" href="#market" style="display:block;text-decoration:none;color:inherit"><h2>📰 今日市場白話<span class="more sub">${M.date.slice(5).replace('-', '/')} ›</span></h2>
    ${B.map(([ic, t]) => `<div class="row" style="align-items:flex-start;margin:.25rem 0"><span>${ic}</span><span class="grow small">${t}</span></div>`).join('')}</a>`;
}
async function pageMarket(tok){
  setTop('今日市場白話', `<a class="iconbtn" href="#home">✕</a>`);
  app.innerHTML = '<div class="skeleton" style="height:12rem"></div>';
  const M = await marketData(); if (!alive(tok)) return;
  if (!M){ app.innerHTML = '<div class="card"><p>📡 資料暫時抓不到，等一下再試。</p></div>'; return; }
  const rows = await stock('tw', 'TAIEX');
  app.innerHTML = `<div class="card"><h2>📅 ${M.date} 收盤</h2>${marketBullets(M).map(([ic, t, lid, nm]) => `<div class="check"><span class="ic">${ic}</span><div class="grow"><div>${t}</div><div class="sub small">👉 ${lessonLink(lid)}</div></div></div>`).join('')}</div>
    ${M.top ? `<div class="card"><h2>🔥 今天比較熱門的股票</h2><div class="sub small" style="margin-bottom:.3rem">成交量比較大的股票裡，漲最多、跌最多的（點進去看白話體檢）</div>
      ${[['漲最多', M.top], ['跌最多', M.bot]].map(([t, L]) => `<div style="margin:.4rem 0"><b>${t}</b>${L.map(([id, n, c]) => `<a class="item" href="#x-tw-${id}" style="display:flex;padding:.45rem 0;border-bottom:1px solid var(--line);text-decoration:none;color:inherit"><span class="grow">${esc(n)} <span class="sub">${id}</span></span><b class="${cls(c)}">${pct(c)}</b></a>`).join('')}</div>`).join('')}
      <div class="sub small">⚠️ 漲最多不代表該追，跌最多也不代表便宜。</div></div>` : ''}
    <div class="card"><h2>📈 加權指數（近 120 天）</h2><div class="w" id="mc" style="margin:0"></div></div>
    <p class="disclaimer">每個交易日收盤後更新。外資金額是用各股買賣超張數 × 收盤價估算，跟官方數字會有些差距。</p>`;
  if (rows?.r) W.chart($('#mc'), ['TAIEX', 120, 'ma']);
}

/* ---------------- 名詞閃卡（間隔複習） ---------------- */
const FC_GAP = [1, 2, 4, 8, 16, 32, 64];
function fcPool(){
  const learned = Object.keys(TERM_LESSON).filter(t => S.done[TERM_LESSON[t]] && GMAP[t]);
  if (learned.length >= 8) return learned;
  return Object.keys(TERM_LESSON).filter(t => GMAP[t] && LBYID[TERM_LESSON[t]].no <= 3);
}
const fcDue = () => fcPool().filter(t => S.fc[t] && S.fc[t].due <= today());
const fcNew = () => fcPool().filter(t => !S.fc[t]);
function pageCards(){
  setTop('名詞閃卡', `<a class="iconbtn" href="#practice">✕</a>`);
  const queue = [...shuffle(fcDue()).slice(0, 12), ...shuffle(fcNew()).slice(0, 8)];
  if (!queue.length){ app.innerHTML = `<div class="card center"><div class="big">✅</div><b>今天的閃卡都複習完了！</b><p class="sub">記得的卡片會隔越久才出現，明天再來。</p><a class="btn ghost" href="#practice">回練習</a></div>`; return; }
  let i = 0, ok = 0; const total = queue.length, again = new Set();
  const draw = () => {
    if (i >= queue.length){
      addActivity(Math.min(10, ok));
      app.innerHTML = `<div class="card center"><div class="big">🃏</div><b>複習完 ${total} 張</b><p>這次記得 ${ok} 張</p><p class="sub">不熟的卡片明天會再出現。</p><a class="btn ghost" href="#practice">回練習</a></div>`;
      return;
    }
    const t = queue[i], g = GMAP[t], lid = TERM_LESSON[t];
    app.innerHTML = `<div class="row" style="margin-bottom:.6rem"><div class="bar grow"><b style="width:${i / queue.length * 100}%"></b></div><span class="sub small">${i + 1}/${queue.length}</span></div>
      <div class="card center" style="min-height:14rem;display:flex;flex-direction:column;justify-content:center"><span class="tag" style="align-self:center">${esc(g[1])}</span>
        <div style="font-size:1.8rem;font-weight:800;margin:.6rem 0">${esc(t)}</div><div id="fb" class="hidden" style="text-align:left">${esc(g[2])}${g[3] ? `<div class="tip small" style="margin:.5rem 0 0"><b>例如：</b>${esc(g[3])}</div>` : ''}<div class="sub small" style="margin-top:.4rem">出自 ${lessonLink(lid)}</div></div>
        <div id="hint" class="sub">先在心裡說說看它是什麼意思</div></div>
      <button class="btn block" id="flip">翻面看答案</button>
      <div class="btns hidden" id="judge"><button class="btn gray" id="no">😅 不熟</button><button class="btn" id="yes">🙂 記得</button></div>`;
    $('#flip').onclick = () => { $('#fb').classList.remove('hidden'); $('#hint').classList.add('hidden'); $('#flip').classList.add('hidden'); $('#judge').classList.remove('hidden'); };
    const next = good => {
      const c = S.fc[t] || { b: 0 };
      if (good){ if (!again.has(t)) ok++; c.b = Math.min(c.b + 1, FC_GAP.length - 1); const d = new Date(); d.setDate(d.getDate() + FC_GAP[c.b - 1]); c.due = dstr(d); }
      else { c.b = 0; c.due = today(); if (!again.has(t)){ again.add(t); queue.push(t); } }
      S.fc[t] = c; S.fcN++; save(); i++; draw();
    };
    $('#no').onclick = () => next(false); $('#yes').onclick = () => next(true);
  };
  draw();
}

/* ---------------- 看圖找型態 ---------------- */
const PATTERNS = [
  { k: 'up', name: '長上影線', lid: 'l16', test: ([, o, h, l, c]) => { const b = Math.abs(c - o), u = h - Math.max(o, c), rg = h - l; return rg / c > 0.015 && u > b * 2 && u > rg * 0.5; }, ex: '上影線很長：盤中衝高，後來被賣下來。' },
  { k: 'lo', name: '長下影線', lid: 'l16', test: ([, o, h, l, c]) => { const b = Math.abs(c - o), d = Math.min(o, c) - l, rg = h - l; return rg / c > 0.015 && d > b * 2 && d > rg * 0.5; }, ex: '下影線很長：盤中殺低，後來被買回來。' },
  { k: 'red', name: '長紅K', lid: 'l15', test: ([, o, h, l, c]) => c > o && (c - o) / o >= 0.03 && (c - o) >= (h - l) * 0.7, ex: '實體很長的紅K：從開盤一路漲到收盤，買方很強。' },
  { k: 'blk', name: '長黑K', lid: 'l15', test: ([, o, h, l, c]) => c < o && (o - c) / o >= 0.03 && (o - c) >= (h - l) * 0.7, ex: '實體很長的黑K：從開盤一路跌到收盤，賣方很強。' },
  { k: 'doji', name: '十字線', lid: 'l16', test: ([, o, h, l, c]) => (h - l) / c >= 0.012 && Math.abs(c - o) <= (h - l) * 0.1, ex: '開盤和收盤幾乎一樣：買賣雙方打平。' },
  { k: 'vol', name: '爆量', lid: 'l19', vol: true, testI: (r, i) => { let a = 0; for (let k = 1; k <= 5; k++) a += r[i - k][5]; return r[i][5] >= 2.2 * a / 5; }, notI: (r, i) => { let a = 0; for (let k = 1; k <= 5; k++) a += r[i - k][5]; return r[i][5] <= 1.1 * a / 5; }, ex: '成交量是前 5 天平均的 2 倍以上，很多人搶著買賣。' },
  { k: 'gx', name: '黃金交叉', lid: 'l20', ma: true, testI: (r, i, m5, m20) => m5[i - 1] <= m20[i - 1] && m5[i] > m20[i], notI: (r, i, m5, m20) => { for (let k = i - 3; k <= i + 3; k++) if (k > 0 && k < r.length && (m5[k - 1] <= m20[k - 1]) !== (m5[k] <= m20[k])) return false; return true; }, ex: '橘色的 5 日線由下往上穿過紫色的 20 日線。' },
];
async function patternQ(){
  const pool = [...new Set([...watchIds(), ...POOL_TW, ...POOL_US])];
  for (let tries = 0; tries < 8; tries++){
    const s = await randStock(pool, 90, 4); if (!s) return null;
    const r = s.d.r, N = 50, from = r.length - N, C = r.map(x => x[4]), m5 = smaArr(C, 5), m20 = smaArr(C, 20);
    for (const P of shuffle(PATTERNS)){
      const yes = [], no = [];
      for (let i = from + 2; i < r.length - 1; i++){
        const hit = P.testI ? P.testI(r, i, m5, m20) : P.test(r[i]);
        const miss = P.notI ? P.notI(r, i, m5, m20) : !PATTERNS.slice(0, 5).some(p => p.test(r[i]));
        if (hit) yes.push(i); else if (miss) no.push(i);
      }
      if (!yes.length || no.length < 2) continue;
      const ans = pickOne(yes), ds = shuffle(no.filter(i => Math.abs(i - ans) >= 4)).filter((i, k, a) => a.slice(0, k).every(j => Math.abs(j - i) >= 4)).slice(0, 2);
      if (ds.length < 2) continue;
      const marks = shuffle([ans, ...ds]), L = ['A', 'B', 'C'], a = marks.indexOf(ans);
      const [d, o, h, l, c] = r[ans];
      return { pre: `<div class="sub small">${esc(s.nm)} ${esc(s.id)}・真實資料・近 ${N} 天</div><div class="w" style="margin-top:.3rem">${chartSVG(r, { from, ma: !!P.ma, vol: !!P.vol, labels: marks.map((i, k) => ({ i, t: L[k] })) })}${P.ma ? '<div class="legend"><span><i style="background:var(--ma5)"></i>5 日</span><span><i style="background:var(--ma20)"></i>20 日</span><span><i style="background:var(--ma60)"></i>60 日</span></div>' : ''}</div>`,
        html: true, q: `圖上標了 A、B、C 三天，哪一天是「<b>${P.name}</b>」？`, o: L.map(x => x + ' 那一天'), a, lid: P.lid, pat: 1,
        e: `答案是 ${L[a]}（${d}）：開 ${fmtP(o)}、高 ${fmtP(h)}、低 ${fmtP(l)}、收 ${fmtP(c)}。${P.ex}` };
    }
  }
  return null;
}
async function pagePattern(){
  setTop('看圖找型態', `<a class="iconbtn" href="#practice">✕</a>`);
  app.innerHTML = '<div class="card"><p class="center">正在從真實走勢圖裡找題目…</p><div class="skeleton" style="height:10rem"></div></div>';
  const tok = routeToken, qs = [];
  for (let k = 0; k < 5; k++){ const q = await patternQ(); if (q) qs.push(q); }
  if (tok !== routeToken) return;
  if (qs.length < 2){ app.innerHTML = '<div class="card"><p>📡 股價資料暫時抓不到，等一下再試。</p></div>'; return; }
  runQuiz(qs, '看圖找型態', (ok, n) => { S.pat.n += n; S.pat.ok += ok; addActivity(ok * 4); }, () => pagePattern());
}

/* ---------------- 快轉定期定額 ---------------- */
function pageDcaSim(){
  setTop('快轉定期定額', `<a class="iconbtn" href="#sim">✕</a>`);
  const opts = [['0050', '元大台灣50'], ['006208', '富邦台50'], ['0056', '元大高股息'], ['00878', '國泰永續高股息'], ['2330', '台積電'], ['VOO', '美股 S&P 500'], ['QQQ', '美股 那斯達克100'], ...watchIds().filter(x => !['0050', '006208', '0056', '00878', '2330', 'VOO', 'QQQ'].includes(x)).map(x => [x, '⭐ 自選股'])];
  app.innerHTML = `<div class="card"><h2>⏩ 回到兩年前，開始定期定額</h2>
    <p style="margin:.2rem 0">用<b>真實的歷史股價</b>，一次快轉一個月。每個月你決定：照扣、這個月停扣、或加碼。你只看得到「到那個月為止」的走勢，跟當時的人一樣不知道未來。</p>
    <div class="field"><label>投資標的</label><select id="ds">${opts.map(([k, n]) => `<option value="${k}">${k} ${n}</option>`).join('')}</select></div>
    <div class="field"><label>每月扣款</label><select id="dm"><option>3000</option><option selected>5000</option><option>10000</option></select></div>
    <button class="btn block" id="go">開始</button></div>
    ${S.dcas.length ? `<div class="card"><h2>📒 之前的紀錄</h2><div class="list">${S.dcas.slice(-5).reverse().map(x => `<div class="item"><div class="grow"><b>${esc(x.id)}</b> <span class="sub small">${x.from}～${x.to}</span><div class="sub small">你的報酬 <span class="${cls(x.ret)}">${pct(x.ret, 1)}</span>，一直照扣 <span class="${cls(x.base)}">${pct(x.base, 1)}</span>${x.stops ? `，停扣 ${x.stops} 次` : ''}</div></div><span>${x.ret >= x.base - 0.05 ? '🧘' : '😵'}</span></div>`).join('')}</div></div>` : ''}`;
  $('#go').onclick = () => dcaRun($('#ds').value, +$('#dm').value);
}
async function dcaRun(id, m){
  const tok = routeToken, mkt = mktOf(id);
  app.innerHTML = '<div class="skeleton" style="height:12rem"></div>';
  const d = await stock(mkt, id), fx = mkt === 'us' ? ((await data('status.json'))?.fx?.rate || 32) : 1;
  if (tok !== routeToken) return;
  if (!d?.r || d.r.length < 120){ app.innerHTML = '<div class="card"><p>📡 這支的資料不夠或抓不到，換一支試試。</p><a class="btn ghost block" href="#dcasim" onclick="setTimeout(route)">回上一頁</a></div>'; return; }
  const r = d.r, months = [];
  r.forEach((x, i) => { if (!i || x[0].slice(0, 7) !== r[i - 1][0].slice(0, 7)) months.push(i); });
  const nm = (await names())[mkt][id] || id;
  const st = { k: 0, sh: 0, inv: 0, bsh: 0, binv: 0, stops: 0, adds: 0, worst: 0, stoppedInDD: false, log: [] };
  const buy = (amt, i) => amt / fx / r[i][4];
  const draw = () => {
    const i = months[st.k], last = st.k === months.length - 1;
    const end = i, c = r[end][4], val = st.sh * c * fx, ret = st.inv ? (val / st.inv - 1) * 100 : 0;
    const from = 0, pts = r.slice(0, end + 1).map(x => x[4]);
    const W2 = 320, H2 = 130, mx = Math.max(...pts), mn = Math.min(...pts), px = k => k / Math.max(1, months[months.length - 1]) * W2, py = v => 6 + (mx - v) / ((mx - mn) || 1) * (H2 - 12);
    const avg = st.sh ? st.inv / fx / st.sh : null;
    app.innerHTML = `<div class="card"><div class="row"><b class="grow">${esc(nm)} ${esc(id)}</b><span class="sub small">第 ${st.k + 1} / ${months.length} 個月</span></div>
      <div class="sub small">現在是 <b style="color:var(--text)">${r[i][0]}</b>，股價 ${fmtP(r[i][4])}</div>
      <svg viewBox="0 0 ${W2} ${H2}" style="width:100%;height:auto;margin-top:.3rem"><path d="${pts.map((v, k) => (k ? 'L' : 'M') + px(k).toFixed(1) + ' ' + py(v).toFixed(1)).join('')}" fill="none" stroke="var(--accent)" stroke-width="1.6"/>
        ${avg ? `<line x1="0" x2="${px(end)}" y1="${py(avg)}" y2="${py(avg)}" stroke="var(--gold)" stroke-dasharray="4 3"/><text x="2" y="${py(avg) - 3}" font-size="10" fill="var(--gold)">你的平均成本 ${fmtP(avg)}</text>` : ''}
        <rect x="${px(end)}" y="0" width="${Math.max(0, W2 - px(end))}" height="${H2}" fill="var(--line)" opacity=".5"/><text x="${Math.min(W2 - 40, px(end) + 4)}" y="14" font-size="10" fill="var(--sub)">未來？</text></svg>
      <div class="kv" style="margin-top:.4rem"><div><span>累計投入</span><b>${fmt0(st.inv)} 元</b></div><div><span>現在市值</span><b class="${cls(ret)}">${fmt0(val)} 元</b></div>
        <div><span>報酬率</span><b class="${cls(ret)}">${pct(ret, 1)}</b></div><div><span>停扣／加碼</span><b>${st.stops}／${st.adds} 次</b></div></div>
      ${ret < -10 ? `<div class="warn small" style="margin:.6rem 0 0">😰 帳面虧損 ${fmt(-ret, 1)}%。這時候很多人會想停扣……你呢？</div>` : ret > 20 ? '<div class="tip small" style="margin:.6rem 0 0">😄 賺了不少。很多人這時會想加碼或全部賣掉。</div>' : ''}</div>
    <div class="card"><b>這個月要怎麼做？</b><div class="btns" style="margin-top:.6rem"><button class="btn gray" data-a="0">✋ 停扣</button><button class="btn" data-a="1">✅ 照扣 ${fmt0(m)}</button><button class="btn red" data-a="2">➕ 加碼</button></div>
      <button class="btn ghost block" id="ff" style="margin-top:.6rem">⏩ 剩下全部照扣，直接看結果</button></div>`;
    $$('[data-a]').forEach(b => b.onclick = () => step(+b.dataset.a));
    $('#ff').onclick = () => { while (st.k < months.length) apply(1); finish(); };
  };
  const apply = a => {
    const i = months[st.k];
    const curRet = st.inv ? (st.sh * r[i][4] * fx / st.inv - 1) * 100 : 0;
    if (a === 0){ st.stops++; if (curRet < -10) st.stoppedInDD = true; }
    if (a === 2) st.adds++;
    st.sh += buy(m * a, i); st.inv += m * a; st.bsh += buy(m, i); st.binv += m;
    st.worst = Math.min(st.worst, curRet); st.k++;
  };
  const step = a => { apply(a); if (st.k >= months.length) finish(); else draw(); };
  const finish = () => {
    const c = r[r.length - 1][4], val = st.sh * c * fx, bval = st.bsh * c * fx;
    const ret = st.inv ? (val / st.inv - 1) * 100 : 0, base = (bval / st.binv - 1) * 100;
    const held = st.worst < -10 && !st.stoppedInDD;
    if (held) S.dcaHold = 1;
    S.dcas.push({ id, from: r[0][0], to: r[r.length - 1][0], ret: +ret.toFixed(2), base: +base.toFixed(2), stops: st.stops, adds: st.adds }); if (S.dcas.length > 50) S.dcas.shift();
    addActivity(8);
    app.innerHTML = `<div class="card center"><div class="big">${held ? '🧘' : st.stoppedInDD ? '😵' : '🎉'}</div><h3 style="margin:.2rem 0">快轉結束：${r[r.length - 1][0]}</h3></div>
      <div class="card"><div class="kv"><div><span>你的做法：投入</span><b>${fmt0(st.inv)} 元</b></div><div><span>現在價值</span><b class="${cls(ret)}">${fmt0(val)} 元（${pct(ret, 1)}）</b></div>
        <div><span>一直照扣：投入</span><b>${fmt0(st.binv)} 元</b></div><div><span>現在價值</span><b class="${cls(base)}">${fmt0(bval)} 元（${pct(base, 1)}）</b></div></div>
      <div class="res">${st.worst < -10 ? `過程中帳面最多虧了 ${fmt(-st.worst, 1)}%。${st.stoppedInDD ? '你在虧損時停扣了——這是最常見的反應，但也錯過了用低價買進的機會。' : '你在虧損時沒有停扣，撐住了！這正是定期定額最難、也最重要的部分。'}` : '這段期間沒有遇到超過 10% 的帳面虧損。換一支波動比較大的再挑戰看看。'}
        <div class="sub small" style="margin-top:.3rem">真實歷史股價，不含手續費和配息。報酬率是「現在價值 ÷ 投入金額」，${mkt === 'us' ? '美股以目前匯率換算，' : ''}過去績效不代表未來。</div></div></div>
      <div class="btns"><a class="btn gray" href="#dcasim" onclick="setTimeout(route)">看紀錄</a><button class="btn" id="again">換一支再玩</button></div>`;
    $('#again').onclick = () => { location.hash = '#dcasim'; setTimeout(route); };
  };
  draw();
}

/* ---------------- 成就徽章 ---------------- */
const BADGES = [
  ['first', '🌱', '第一步', '完成第 1 課', () => S.done.l1],
  ['l5', '📗', '入門了', '完成 5 課', () => Object.keys(S.done).length >= 5],
  ['l15', '📘', '漸入佳境', '完成 15 課', () => Object.keys(S.done).length >= 15],
  ['all', '🎓', '全部畢業', '上完全部課程', () => LESSONS.every(l => S.done[l.id])],
  ['star5', '⭐', '滿分王', '5 課拿到三顆星', () => Object.values(S.done).filter(d => stars(d) === 3).length >= 5],
  ['s3', '🔥', '連續 3 天', '連續學習 3 天', () => streak() >= 3],
  ['s7', '🔥', '連續一週', '連續學習 7 天', () => streak() >= 7],
  ['s30', '🏆', '連續一個月', '連續學習 30 天', () => streak() >= 30],
  ['p50', '🎯', '實戰 50 題', '實戰練習答對 50 題', () => S.prac.ok >= 50],
  ['pat20', '🔍', '型態偵探', '看圖找型態答對 20 題', () => S.pat.ok >= 20],
  ['fc100', '🃏', '閃卡 100', '名詞閃卡複習 100 張', () => S.fcN >= 100],
  ['tm10', '🕰️', '時光旅人', '時光機玩 10 局', () => S.tm.length >= 10],
  ['tmgood', '🧭', '判斷達人', '時光機 20 局以上、正確率 60%', () => S.tm.length >= 20 && S.tm.filter(x => (x.c === 'buy') === (x.r > 0)).length / S.tm.length >= 0.6],
  ['hold', '🧘', '撐住了', '快轉定期定額時，虧損超過 10% 也沒停扣', () => S.dcaHold],
  ['x5', '🩺', '小醫生', '白話體檢 5 支股票', () => S.xn >= 5],
  ['vid5', '📺', '影片學習', '看了 5 部推薦影片', () => Object.keys(S.vs || {}).length >= 5],
  ['plan', '📝', '有計畫的人', '寫下自己的投資計畫', () => S.plan && S.plan.touched],
  ['bias', '🧠', '認識自己', '做完投資性格測驗', () => S.biasDone],
];
function checkBadges(quiet){
  const got = [];
  BADGES.forEach(([id, ic, nm, , test]) => { if (!S.badges[id]) { let ok = false; try { ok = !!test(); } catch (_) {} if (ok){ S.badges[id] = today(); got.push(ic + ' ' + nm); } } });
  if (got.length){ save(); if (!quiet) setTimeout(() => toast('🏅 獲得徽章：' + got.join('、'), 3200), 600); }
}
function pageBadges(){
  setTop('成就徽章', `<a class="iconbtn" href="#home">✕</a>`);
  checkBadges(true);
  const n = BADGES.filter(b => S.badges[b[0]]).length;
  app.innerHTML = `<div class="card"><div class="row"><b class="grow">已獲得 ${n} / ${BADGES.length}</b></div><div class="bar" style="margin-top:.4rem"><b style="width:${n / BADGES.length * 100}%"></b></div></div>
    <div class="card"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem">${BADGES.map(([id, ic, nm, ds]) => { const g = S.badges[id];
      return `<div class="center" style="opacity:${g ? 1 : .45};background:var(--bg);border-radius:12px;padding:.6rem .3rem"><div style="font-size:2rem;${g ? '' : 'filter:grayscale(1)'}">${ic}</div><b class="small">${nm}</b><div class="sub" style="font-size:.72rem;line-height:1.3">${ds}</div>${g ? `<div class="sub" style="font-size:.7rem">${g.slice(5).replace('-', '/')}</div>` : ''}</div>`; }).join('')}</div></div>`;
}

/* ---------------- 新單元的練習題（隨機數字，練觀念） ---------------- */
const rnd = (a, b, st = 1) => Math.round((a + Math.random() * (b - a)) / st) * st;
GEN.push(
  { lid: 'l35', name: '毛利率', f: async () => {
    const rv = rnd(50, 500, 10), gm = rnd(15, 60), cost = rv * (100 - gm) / 100;
    const { o, a } = numOpts(gm, [100 - gm, gm / 2, Math.min(95, gm + 20)], x => fmt(x, 0) + '%');
    return { pre: '<div class="sub small">練習題（數字是假設的）</div>', q: `某公司一季營收 ${fmt0(rv)} 億元、營業成本 ${fmt(cost, 0)} 億元，毛利率是？`, o, a,
      e: `毛利 ＝ ${fmt0(rv)} − ${fmt(cost, 0)} ＝ ${fmt(rv - cost, 0)} 億；毛利率 ＝ 毛利 ÷ 營收 ≈ ${gm}%。` };
  } },
  { lid: 'l36', name: '負債比', f: async () => {
    const as = rnd(200, 2000, 50), dr = rnd(20, 80, 5), debt = as * dr / 100;
    const { o, a } = numOpts(dr, [100 - dr, dr / 2, Math.min(95, dr + 15)], x => fmt(x, 0) + '%');
    return { pre: '<div class="sub small">練習題（數字是假設的）</div>', q: `某公司資產 ${fmt0(as)} 億、負債 ${fmt0(debt)} 億，負債比是？`, o, a,
      e: `負債比 ＝ 負債 ÷ 資產 ＝ ${fmt0(debt)} ÷ ${fmt0(as)} ＝ ${dr}%。股東權益 ＝ ${fmt0(as)} − ${fmt0(debt)} ＝ ${fmt0(as - debt)} 億。${dr >= 65 ? '一般產業這個負債比偏高，要多注意。' : ''}` };
  } },
  { lid: 'l39', name: '景氣燈號', f: async () => {
    const L = [[9, 16, '藍燈'], [17, 22, '黃藍燈'], [23, 31, '綠燈'], [32, 37, '黃紅燈'], [38, 45, '紅燈']], k = Math.floor(Math.random() * 5), v = rnd(L[k][0], L[k][1]);
    const opts = shuffle([L[k][2], ...shuffle(L.filter((_, j) => j !== k)).slice(0, 2).map(x => x[2])]);
    return { q: `國發會公布景氣分數 ${v} 分，是什麼燈號？`, o: opts, a: opts.indexOf(L[k][2]),
      e: `藍燈 9–16、黃藍燈 17–22、綠燈 23–31、黃紅燈 32–37、紅燈 38–45。${v} 分是${L[k][2]}。` };
  } },
  { lid: 'l41', name: '匯率', f: async () => {
    const a0 = rnd(29, 34, 0.5), up = Math.random() < 0.5, b0 = up ? a0 - rnd(1, 2, 0.5) : a0 + rnd(1, 2, 0.5);
    return { q: `1 美元從換 ${a0} 元新台幣，變成換 ${b0} 元。新台幣是？`, o: ['升值', '貶值'], a: up ? 0 : 1,
      e: `1 美元換到的台幣${up ? '變少，代表台幣變值錢 → 升值' : '變多，代表台幣變薄 → 貶值'}。${up ? '這時候手上的美股換回台幣會變少。' : '這時候手上的美股換回台幣會變多。'}` };
  } },
  { lid: 'l44', name: '心理陷阱', f: async () => {
    const C = [['小明的股票從 100 跌到 70，他說：「等漲回 100 我就賣。」', '錨定效應'], ['小美賺 5% 就趕快賣掉，賠 30% 的卻一直抱著。', '處分效應'], ['阿華看到同事都在買某支熱門股，怕錯過也跟著買。', '從眾效應'], ['大雄買了股票後，只看說它會漲的文章。', '確認偏誤'], ['小強連賺 3 次，決定借錢加碼。', '過度自信'], ['股市連漲半年，小英覺得以後也會一直漲。', '近因偏誤'], ['股市大跌 15%，阿姨嚇得把全部股票賣掉。', '損失規避']];
    const [q, ans] = pickOne(C), all = [...new Set(C.map(x => x[1]))], opts = shuffle([ans, ...shuffle(all.filter(x => x !== ans)).slice(0, 2)]);
    return { q: q + ' 這比較像哪一種心理陷阱？', o: opts, a: opts.indexOf(ans), e: `${ans}：${GMAP[ans] ? GMAP[ans][2] : ''}` };
  } },
);

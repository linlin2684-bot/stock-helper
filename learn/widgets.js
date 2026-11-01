// 股票學堂：課程裡的互動小工具與 K 線圖
'use strict';
const W = {};
function mountWidgets(root){
  $$('.w[data-w]', root).forEach(el => {
    const [n, ...a] = el.dataset.w.split(':'); el.removeAttribute('data-w');
    try { W[n] ? W[n](el, a) : el.remove(); }
    catch (e){ console.error(e); el.innerHTML = '<p class="sub">這個小工具暫時無法顯示</p>'; }
  });
}
const noData = el => { el.innerHTML = '<p class="sub" style="margin:0">📡 股價資料暫時抓不到（可能是網路不穩），等一下再打開這頁試試。</p>'; };
const smaArr = (a, n) => a.map((_, i) => { if (i < n - 1) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += a[k]; return s / n; });
const nameOf = async (mkt, id) => (await names())[mkt][id] || id;

/* ---------------- K 線圖（SVG，可點、可左右滑） ---------------- */
// rows: [[日期, 開, 高, 低, 收, 量], ...]；opt: from,to,ma,sr,vol,mark(分隔線位置),mkt
function chartSVG(rows, opt){
  const from = opt.from ?? 0, to = opt.to ?? rows.length, n = to - from;
  const Wd = 360, padR = 46, vol = !!opt.vol, PH = vol ? 168 : 200, VH = vol ? 44 : 0, H = PH + VH + (vol ? 8 : 0) + 16;
  const cw = (Wd - padR) / n, bw = Math.max(1, Math.min(cw * 0.66, 12));
  const C = rows.map(r => r[4]);
  const mas = opt.ma ? [[5, 'var(--ma5)'], [20, 'var(--ma20)'], [60, 'var(--ma60)']].map(([k, col]) => [smaArr(C, k), col]) : [];
  let hi = -Infinity, lo = Infinity;
  for (let i = from; i < to; i++){ hi = Math.max(hi, rows[i][2]); lo = Math.min(lo, rows[i][3]); mas.forEach(([m]) => { if (m[i] != null){ hi = Math.max(hi, m[i]); lo = Math.min(lo, m[i]); } }); }
  const padP = (hi - lo) * 0.06 || hi * 0.02; hi += padP; lo -= padP;
  const y = p => 8 + (hi - p) / (hi - lo) * (PH - 8);
  const x = i => (i - from) * cw + cw / 2;
  let s = `<svg class="chart" viewBox="0 0 ${Wd} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  // 價格刻度
  const step = niceStep((hi - lo) / 4);
  for (let p = Math.ceil(lo / step) * step; p <= hi; p += step){
    s += `<line x1="0" x2="${Wd - padR}" y1="${y(p)}" y2="${y(p)}" stroke="var(--line)" stroke-width=".6"/>
      <text x="${Wd - padR + 4}" y="${y(p) + 3.5}" font-size="10" fill="var(--sub)">${fmtP(p)}</text>`;
  }
  if (opt.mark != null && opt.mark < to){
    const mx = (opt.mark - from) * cw;
    s += `<rect x="${mx}" y="0" width="${Wd - padR - mx}" height="${PH + VH + 8}" fill="var(--accent-soft)" opacity=".55"/>`;
  }
  if (opt.sel != null) s += `<rect x="${(opt.sel - from) * cw}" y="0" width="${cw}" height="${PH + VH + 8}" fill="var(--text)" opacity=".08"/>`;
  // 支撐壓力（顯示範圍裡的最高、最低）
  if (opt.sr){
    let hiI = from, loI = from;
    for (let i = from; i < to; i++){ if (rows[i][2] > rows[hiI][2]) hiI = i; if (rows[i][3] < rows[loI][3]) loI = i; }
    [[rows[hiI][2], '壓力', 'var(--up)'], [rows[loI][3], '支撐', 'var(--down)']].forEach(([p, t, col]) => {
      s += `<line x1="0" x2="${Wd - padR}" y1="${y(p)}" y2="${y(p)}" stroke="${col}" stroke-dasharray="4 3" stroke-width="1.1"/>
        <text x="3" y="${y(p) + (t === '壓力' ? -3 : 11)}" font-size="10" fill="${col}" font-weight="700">${t} ${fmtP(p)}</text>`;
    });
  }
  // K 線
  for (let i = from; i < to; i++){
    const [, o, h, l, c] = rows[i], col = c > o ? 'var(--up)' : c < o ? 'var(--down)' : 'var(--flat)';
    s += `<line x1="${x(i)}" x2="${x(i)}" y1="${y(h)}" y2="${y(l)}" stroke="${col}" stroke-width="1"/>
      <rect x="${x(i) - bw / 2}" y="${y(Math.max(o, c))}" width="${bw}" height="${Math.max(1, Math.abs(y(o) - y(c)))}" fill="${col}"/>`;
  }
  mas.forEach(([m, col]) => {
    let d = ''; for (let i = from; i < to; i++) if (m[i] != null) d += (d ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(m[i]).toFixed(1);
    if (d) s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.4"/>`;
  });
  if (vol){
    let vmax = 0; for (let i = from; i < to; i++) vmax = Math.max(vmax, rows[i][5]);
    const vy = PH + 8;
    for (let i = from; i < to; i++){
      const hgt = vmax ? rows[i][5] / vmax * VH : 0, prev = i ? rows[i - 1][4] : rows[i][1];
      s += `<rect x="${x(i) - bw / 2}" y="${vy + VH - hgt}" width="${bw}" height="${hgt}" fill="${rows[i][4] >= prev ? 'var(--up)' : 'var(--down)'}" opacity=".7"/>`;
    }
    s += `<text x="${Wd - padR + 4}" y="${vy + 10}" font-size="10" fill="var(--sub)">成交量</text>`;
  }
  // 日期
  const dy = H - 3;
  s += `<text x="2" y="${dy}" font-size="10" fill="var(--sub)">${rows[from][0].slice(2).replace(/-/g, '/')}</text>
    <text x="${Wd - padR}" y="${dy}" font-size="10" fill="var(--sub)" text-anchor="end">${rows[to - 1][0].slice(2).replace(/-/g, '/')}</text>`;
  if (opt.mark != null && opt.mark < to) s += `<text x="${(opt.mark - from) * cw + 3}" y="${PH + VH - 2}" font-size="10" fill="var(--accent)" font-weight="700">之後</text>`;
  return s + '</svg>';
}
function niceStep(raw){ const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const m = raw / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; }
const fmtP = p => p >= 1000 ? fmt0(p) : p >= 100 ? fmt(p, 1) : fmt(p, 2);

// 把圖放進 el，點／滑動時更新 info 區塊
function bindChart(el, rows, opt, onPick){
  const holder = document.createElement('div'); el.appendChild(holder);
  let sel = opt.sel ?? null;
  const draw = () => { holder.innerHTML = chartSVG(rows, { ...opt, sel }); };
  draw();
  const from = opt.from ?? 0, to = opt.to ?? rows.length, n = to - from;
  const pick = e => {
    const svg = holder.firstChild, rc = svg.getBoundingClientRect();
    const xx = (e.clientX - rc.left) / rc.width * 360, i = Math.floor(xx / ((360 - 46) / n));
    if (i < 0 || i >= n) return;
    if (sel !== from + i){ sel = from + i; draw(); onPick && onPick(sel); }
  };
  let down = false;
  holder.addEventListener('pointerdown', e => { down = true; pick(e); });
  holder.addEventListener('pointermove', e => { if (down) pick(e); });
  window.addEventListener('pointerup', () => { down = false; });
  return { redraw: o => { Object.assign(opt, o); draw(); }, setSel: i => { sel = i; draw(); } };
}

function dayInfo(rows, i, mkt, ma){
  const [d, o, h, l, c, v] = rows[i], prev = i ? rows[i - 1][4] : null;
  const chg = prev ? c - prev : null, cp = prev ? chg / prev * 100 : null;
  const body = Math.abs(c - o), range = h - l, upS = h - Math.max(o, c), loS = Math.min(o, c) - l;
  let type = c > o ? '<b class="up">紅K</b>：收盤比開盤高，盤中越走越強' : c < o ? '<b class="down">黑K</b>（圖上是綠色）：收盤比開盤低，盤中越走越弱' : '<b>十字線</b>：收盤跟開盤一樣';
  if (range > 0 && body < range * 0.1 && c !== o) type += '；實體很小，接近<b>十字線</b>，買賣力量差不多';
  const notes = [];
  if (range > 0 && upS > body * 1.5 && upS > range * 0.35) notes.push('長上影線：衝高後被賣下來，上方有賣壓');
  if (range > 0 && loS > body * 1.5 && loS > range * 0.35) notes.push('長下影線：殺低後被買回來，下方有買盤');
  if (ma){
    const m20 = smaArr(rows.map(r => r[4]), 20)[i];
    if (m20) notes.push(`收盤 ${c >= m20 ? '在<b>月線（20 日均線）之上</b>' : '在<b>月線（20 日均線）之下</b>'}（月線 ${fmtP(m20)}）`);
  }
  const vv = volUnit(v, mkt);
  return `<div class="res"><div class="row"><b class="grow" style="white-space:nowrap">${d}</b>${cp != null ? `<b class="${cls(chg)}">${chg > 0 ? '▲' : chg < 0 ? '▼' : ''} ${fmt(Math.abs(chg))}（${pct(cp)}）</b>` : ''}</div>
    <div class="sub num" style="margin:.2rem 0">開 ${fmtP(o)}　高 ${fmtP(h)}　低 ${fmtP(l)}　收 <b style="color:var(--text)">${fmtP(c)}</b>　量 ${fmt0(vv)} ${unitName(mkt)}</div>
    <div>${type}</div>${notes.map(t => `<div>• ${t}</div>`).join('')}</div>`;
}

W.chart = async (el, [id, n = 60, ...flags]) => {
  const mkt = mktOf(id), d = await stock(mkt, id);
  if (!d || !d.r || d.r.length < 10) return noData(el);
  const rows = d.r, N = Math.min(+n, rows.length), from = rows.length - N;
  const f = new Set(flags), nm = await nameOf(mkt, id);
  el.innerHTML = `<div class="row" style="margin-bottom:.2rem"><b class="grow">${esc(nm)} ${esc(id)}</b><span class="sub small">近 ${N} 個交易日</span></div>`;
  const info = document.createElement('div');
  bindChart(el, rows, { from, ma: f.has('ma'), sr: f.has('sr'), vol: f.has('vol'), sel: rows.length - 1 }, i => { info.innerHTML = dayInfo(rows, i, mkt, f.has('ma')); });
  if (f.has('ma')) el.insertAdjacentHTML('beforeend', `<div class="legend"><span><i style="background:var(--ma5)"></i>5 日（週線）</span><span><i style="background:var(--ma20)"></i>20 日（月線）</span><span><i style="background:var(--ma60)"></i>60 日（季線）</span></div>`);
  el.insertAdjacentHTML('beforeend', '<div class="sub small" style="margin-top:.3rem">👆 點圖或左右滑動，看每一天的 K 線</div>');
  el.appendChild(info); info.innerHTML = dayInfo(rows, rows.length - 1, mkt, f.has('ma'));
};

/* ---------------- 報價看板 ---------------- */
W.quote = async (el, [id]) => {
  const mkt = mktOf(id), d = await stock(mkt, id);
  if (!d || !d.r || d.r.length < 2) return noData(el);
  const r = d.r, [dt, o, h, l, c, v] = r[r.length - 1], pc = r[r.length - 2][4], chg = c - pc, cp = chg / pc * 100;
  const nm = await nameOf(mkt, id);
  const box = (t, val, ex, k = '') => `<div><span>${t}</span><b class="${k}">${val}</b><span>${ex}</span></div>`;
  el.innerHTML = `<div class="row"><b class="grow" style="font-size:1.1rem">${esc(nm)} <span class="sub">${esc(id)}</span></b><span class="sub small">${dt} 收盤</span></div>
    <div class="row" style="margin:.2rem 0 .6rem"><b style="font-size:1.9rem" class="${cls(chg)} num">${fmtP(c)}</b>
      <b class="${cls(chg)}">${chg > 0 ? '▲' : chg < 0 ? '▼' : ''} ${fmt(Math.abs(chg))}　${pct(cp)}</b></div>
    <div class="kv">
      ${box('昨收', fmtP(pc), '前一個交易日最後的價格，今天漲跌就是跟它比')}
      ${box('開盤', fmtP(o), '今天第一筆成交的價格', cls(o - pc))}
      ${box('最高', fmtP(h), '今天成交過的最高價', cls(h - pc))}
      ${box('最低', fmtP(l), '今天成交過的最低價', cls(l - pc))}
      ${box('漲跌', (chg > 0 ? '+' : '') + fmt(chg), '收盤 − 昨收', cls(chg))}
      ${box('成交量', fmt0(volUnit(v, mkt)) + ' ' + unitName(mkt), mkt === 'tw' ? '今天總共買賣了多少張（1 張＝1,000 股）' : '今天總共買賣了多少股')}
    </div>
    <div class="sub small" style="margin-top:.5rem">台灣習慣：<b class="up">紅色＝漲</b>、<b class="down">綠色＝跌</b>。這是 ${dt} 的真實資料。</div>`;
};

/* ---------------- 拉拉看：一根 K 線 ---------------- */
W.candle = el => {
  let o = 100, h = 108, l = 97, c = 105;
  el.innerHTML = `<div class="row" style="align-items:stretch"><div id="cv" style="flex:0 0 42%"></div><div class="grow" id="cs"></div></div><div class="res" id="cd"></div>`;
  const sl = [['開盤', 'o'], ['最高', 'h'], ['最低', 'l'], ['收盤', 'c']];
  $('#cs', el).innerHTML = sl.map(([t, k]) => `<div style="margin:.15rem 0"><div class="row small"><span class="grow sub">${t}</span><b id="v${k}" class="num"></b></div>
    <input type="range" min="85" max="115" step="0.5" id="s${k}" style="width:100%"></div>`).join('');
  const V = { o, h, l, c };
  const draw = (changed) => {
    if (changed === 'h') V.h = Math.max(V.h, V.o, V.c);
    else if (changed === 'l') V.l = Math.min(V.l, V.o, V.c);
    else { V.h = Math.max(V.h, V.o, V.c); V.l = Math.min(V.l, V.o, V.c); }
    sl.forEach(([, k]) => { $('#s' + k, el).value = V[k]; $('#v' + k, el).textContent = V[k].toFixed(1); });
    const y = p => 10 + (115 - p) / 30 * 200, col = V.c > V.o ? 'var(--up)' : V.c < V.o ? 'var(--down)' : 'var(--flat)';
    const top = Math.max(V.o, V.c), bot = Math.min(V.o, V.c);
    $('#cv', el).innerHTML = `<svg viewBox="0 0 120 220" style="width:100%;height:auto">
      <line x1="60" x2="60" y1="${y(V.h)}" y2="${y(V.l)}" stroke="${col}" stroke-width="3"/>
      <rect x="38" y="${y(top)}" width="44" height="${Math.max(2, y(bot) - y(top))}" fill="${col}" rx="2"/>
      <text x="88" y="${y(V.h) + 4}" font-size="11" fill="var(--sub)">高</text><text x="88" y="${y(V.l) + 4}" font-size="11" fill="var(--sub)">低</text>
      <text x="4" y="${y(V.o) + 4}" font-size="11" fill="var(--sub)">開</text><text x="4" y="${y(V.c) + 4}" font-size="11" fill="var(--text)" font-weight="700">收</text></svg>`;
    const body = top - bot, range = V.h - V.l, upS = V.h - top, loS = bot - V.l;
    const t = [];
    t.push(V.c > V.o ? '<b class="up">紅K</b>：收盤比開盤高，買方比較強' : V.c < V.o ? '<b class="down">黑K</b>：收盤比開盤低，賣方比較強' : '<b>十字線</b>：開盤＝收盤，買賣雙方打平');
    if (range > 0 && body <= range * 0.1 && V.c !== V.o) t.push('實體很小，接近十字線：市場在猶豫');
    if (body >= range * 0.8 && range > 4) t.push(V.c > V.o ? '長紅K：買方一路強勢' : '長黑K：賣方一路強勢');
    if (upS > body && upS >= 2) t.push('上影線長：漲上去又被賣下來，上方有賣壓');
    if (loS > body && loS >= 2) t.push('下影線長：跌下去又被買回來，下方有買盤');
    $('#cd', el).innerHTML = t.map(x => `<div>• ${x}</div>`).join('');
  };
  sl.forEach(([, k]) => $('#s' + k, el).oninput = e => { V[k] = +e.target.value; draw(k); });
  draw();
};

/* ---------------- 手續費、交易稅試算 ---------------- */
W.fee = el => {
  el.innerHTML = `<div class="field"><label>股價（元）</label><input id="fp" type="number" inputmode="decimal" value="100"></div>
    <div class="field"><label>股數</label><input id="fn" type="number" inputmode="numeric" value="1000"></div>
    <div class="field"><label>手續費折扣</label><select id="fd"><option value="1">無折扣</option><option value="0.6" selected>6 折</option><option value="0.5">5 折</option><option value="0.28">2.8 折</option></select></div>
    <div class="field"><label>最低手續費</label><select id="fm"><option value="20">20 元（一般）</option><option value="1">1 元（零股優惠）</option></select></div>
    <div class="field"><label>種類</label><select id="ft"><option value="0.003">股票（證交稅 0.3%）</option><option value="0.001">ETF（證交稅 0.1%）</option></select></div>
    <div class="res" id="fr"></div>`;
  const calc = () => {
    const p = +$('#fp', el).value || 0, n = +$('#fn', el).value || 0, d = +$('#fd', el).value, mn = +$('#fm', el).value, tx = +$('#ft', el).value;
    const amt = p * n, fee = amt ? Math.max(mn, Math.floor(amt * 0.001425 * d)) : 0, tax = Math.floor(amt * tx), total = fee * 2 + tax;
    $('#fr', el).innerHTML = `<div>買進金額：<b>${fmt0(amt)}</b> 元</div><div>買進手續費：${fmt0(fee)} 元</div><div>賣出手續費（同價賣出）：${fmt0(fee)} 元</div>
      <div>證交稅（賣出時收）：${fmt0(tax)} 元</div><div style="margin-top:.3rem">一買一賣總成本：<b class="up">${fmt0(total)} 元</b></div>
      <div>股價要漲約 <b>${amt ? fmt(total / amt * 100, 2) : '—'}%</b> 才打平</div>`;
  };
  $$('input,select', el).forEach(x => x.oninput = calc); calc();
};

/* ---------------- 複利 ---------------- */
W.compound = el => {
  el.innerHTML = `<div class="field"><label>每月投入</label><input type="range" id="cm" min="1000" max="30000" step="1000" value="5000"><b id="cmv" class="num" style="min-width:4.5em;text-align:right"></b></div>
    <div class="field"><label>投資幾年</label><input type="range" id="cy" min="1" max="40" value="20"><b id="cyv" class="num" style="min-width:4.5em;text-align:right"></b></div>
    <div class="field"><label>每年報酬</label><input type="range" id="cr" min="0" max="12" step="0.5" value="6"><b id="crv" class="num" style="min-width:4.5em;text-align:right"></b></div>
    <div id="cg"></div><div class="res" id="cres"></div>`;
  const calc = () => {
    const m = +$('#cm', el).value, y = +$('#cy', el).value, r = +$('#cr', el).value / 100;
    $('#cmv', el).textContent = fmt0(m) + ' 元'; $('#cyv', el).textContent = y + ' 年'; $('#crv', el).textContent = r * 100 + '%';
    const mr = Math.pow(1 + r, 1 / 12) - 1, pts = [];
    let v = 0;
    for (let k = 1; k <= y * 12; k++){ v = v * (1 + mr) + m; if (k % 12 === 0) pts.push([k / 12, m * k, v]); }
    const inv = m * y * 12, max = v || 1, bw = 300 / pts.length;
    $('#cg', el).innerHTML = `<svg viewBox="0 0 320 140" style="width:100%;height:auto">${pts.map(([yy, p, val], i) => {
      const hp = p / max * 120, hv = val / max * 120;
      return `<rect x="${10 + i * bw + bw * 0.12}" y="${130 - hv}" width="${bw * 0.76}" height="${hv - hp}" fill="var(--gold)"/><rect x="${10 + i * bw + bw * 0.12}" y="${130 - hp}" width="${bw * 0.76}" height="${hp}" fill="var(--accent)"/>`; }).join('')}
      <line x1="10" x2="310" y1="130" y2="130" stroke="var(--line)"/></svg>
      <div class="legend"><span><i style="background:var(--accent);height:.6rem"></i>自己投入的本金</span><span><i style="background:var(--gold);height:.6rem"></i>錢滾出來的錢</span></div>`;
    $('#cres', el).innerHTML = `<div>總共投入：<b>${fmt0(inv)}</b> 元</div><div>${y} 年後大約：<b class="big2 up">${fmt0(v)}</b> 元</div>
      <div>其中「錢滾錢」賺到：<b>${fmt0(v - inv)}</b> 元（${inv ? fmt((v / inv - 1) * 100, 0) : 0}%）</div>
      <div class="sub small" style="margin-top:.3rem">報酬率是假設的平均值，真實市場每年有漲有跌，不保證。</div>`;
  };
  $$('input', el).forEach(x => x.oninput = calc); calc();
};

/* ---------------- 定期定額（真實歷史股價） ---------------- */
W.dca = async el => {
  const opts = [['0050', '元大台灣50'], ['0056', '元大高股息'], ['00878', '國泰永續高股息'], ['2330', '台積電'], ['VOO', '美股 S&P 500 ETF'], ['QQQ', '美股 那斯達克100 ETF']];
  el.innerHTML = `<div class="field"><label>投資標的</label><select id="ds">${opts.map(([k, n]) => `<option value="${k}">${k} ${n}</option>`).join('')}</select></div>
    <div class="field"><label>每月投入</label><select id="dm"><option>1000</option><option selected>3000</option><option>5000</option><option>10000</option></select></div>
    <div id="dout"><div class="skeleton"></div></div>`;
  const run = async () => {
    const id = $('#ds', el).value, mkt = mktOf(id), m = +$('#dm', el).value, d = await stock(mkt, id), out = $('#dout', el);
    if (!d || !d.r || d.r.length < 40){ noData(out); return; }
    const fx = mkt === 'us' ? ((await data('status.json'))?.fx?.rate || 32) : 1;
    const rows = d.r; let sh = 0, inv = 0, lastM = '', worst = 0, worstD = '';
    const pts = [];
    rows.forEach(([dt, , , , c]) => {
      const mm = dt.slice(0, 7);
      if (mm !== lastM){ lastM = mm; sh += m / fx / c; inv += m; }
      const val = sh * c * fx; pts.push([dt, inv, val]);
      const dd = val / inv - 1; if (dd < worst){ worst = dd; worstD = dt; }
    });
    const [, , val] = pts[pts.length - 1], ret = (val / inv - 1) * 100, months = new Set(rows.map(r => r[0].slice(0, 7))).size;
    const max = Math.max(...pts.map(p => Math.max(p[1], p[2]))), Wd = 320, Hh = 120;
    const px = i => i / (pts.length - 1) * Wd, py = v => 6 + (1 - v / max) * (Hh - 12);
    const path = k => pts.map((p, i) => (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(p[k]).toFixed(1)).join('');
    out.innerHTML = `<svg viewBox="0 0 ${Wd} ${Hh}" style="width:100%;height:auto"><path d="${path(1)}" fill="none" stroke="var(--sub)" stroke-width="1.5" stroke-dasharray="4 3"/>
      <path d="${path(2)}" fill="none" stroke="${ret >= 0 ? 'var(--up)' : 'var(--down)'}" stroke-width="2"/></svg>
      <div class="legend"><span><i style="background:var(--sub)"></i>累計投入</span><span><i style="background:${ret >= 0 ? 'var(--up)' : 'var(--down)'}"></i>帳戶市值</span></div>
      <div class="res">從 <b>${rows[0][0]}</b> 開始，每月第一個交易日買 ${fmt0(m)} 元，共 ${months} 個月：
        <div>總共投入：<b>${fmt0(inv)}</b> 元</div><div>現在價值：<b class="big2 ${cls(ret)}">${fmt0(val)}</b> 元（<b class="${cls(ret)}">${pct(ret, 1)}</b>）</div>
        ${worst < -0.03 ? `<div>過程中最慘的時候（${worstD}）帳面虧損 ${fmt(-worst * 100, 1)}%——有沒有撐住，是定期定額成功的關鍵。</div>` : '<div>過程中帳面幾乎沒有明顯虧損。</div>'}
        <div class="sub small" style="margin-top:.3rem">真實歷史股價試算，不含手續費與配息（${mkt === 'us' ? '美股以目前匯率換算台幣，' : ''}配息再投入的話會更多）。過去績效不代表未來。</div></div>`;
  };
  $('#ds', el).onchange = run; $('#dm', el).onchange = run; run();
};

/* ---------------- 殖利率、本益比 ---------------- */
W.yield = el => {
  el.innerHTML = `<div class="field"><label>股價（元）</label><input id="yp" type="number" inputmode="decimal" value="40"></div>
    <div class="field"><label>一年股利</label><input id="yd" type="number" inputmode="decimal" value="2"></div><div class="res" id="yr"></div>`;
  const calc = () => {
    const p = +$('#yp', el).value, dv = +$('#yd', el).value, y = p ? dv / p * 100 : 0;
    $('#yr', el).innerHTML = `殖利率 ＝ ${fmt(dv)} ÷ ${fmt(p)} ＝ <b class="big2">${fmt(y)}%</b>
      <div>買 1 張（1,000 股）約 ${fmt0(p * 1000)} 元，一年約領 ${fmt0(dv * 1000)} 元股利</div>
      <div class="sub small">${y > 8 ? '⚠️ 殖利率特別高時要小心：可能是股價大跌、或今年獲利是一次性的，明年不一定配得出來。' : y >= 4 ? '台股常見的高股息水準大約 4～6%。' : '殖利率不高，常見於成長型公司——它們把錢留下來擴張。'}</div>`;
  };
  $$('input', el).forEach(x => x.oninput = calc); calc();
};
W.pe = el => {
  el.innerHTML = `<div class="field"><label>股價（元）</label><input id="pp" type="number" inputmode="decimal" value="600"></div>
    <div class="field"><label>EPS（元）</label><input id="pe" type="number" inputmode="decimal" value="30"></div><div class="res" id="pr"></div>`;
  const calc = () => {
    const p = +$('#pp', el).value, e = +$('#pe', el).value;
    if (!(e > 0)){ $('#pr', el).innerHTML = 'EPS 是 0 或負的（公司在虧錢），本益比沒有意義，要改看別的指標。'; return; }
    const r = p / e;
    $('#pr', el).innerHTML = `本益比 ＝ ${fmt(p)} ÷ ${fmt(e)} ＝ <b class="big2">${fmt(r, 1)} 倍</b>
      <div>白話：如果公司每年都賺這麼多，大約 <b>${fmt(r, 0)} 年</b>賺回你買的價格。</div>
      <div class="sub small">${r < 10 ? '偏低：可能真的便宜，也可能市場覺得它以後賺不了這麼多。' : r <= 20 ? '中等：很多成熟公司在這個區間。' : '偏高：市場期待它未來成長很快；萬一成長不如預期，股價可能修正很大。'}</div>`;
  };
  $$('input', el).forEach(x => x.oninput = calc); calc();
};

/* ---------------- 幾家公司的基本面比較（真實資料） ---------------- */
W.fund = async (el, [ids]) => {
  const list = ids.split(','), ds = await Promise.all(list.map(id => stock('tw', id))), nm = await names();
  if (ds.every(x => !x)) return noData(el);
  el.innerHTML = `<div class="scrollx"><table class="tbl"><tr><th>公司</th><th>股價</th><th>EPS</th><th>本益比</th><th>殖利率</th><th>淨值比</th></tr>
    ${list.map((id, k) => { const d = ds[k]; if (!d) return ''; const f = d.f || {}, c = d.r?.[d.r.length - 1]?.[4];
      return `<tr><td><a href="#x-tw-${id}">${esc(nm.tw[id] || id)}</a><div class="sub small">${id}</div></td><td>${fmtP(c)}</td><td>${f.eps != null ? fmt(f.eps) : '—'}</td>
        <td>${f.pe ? fmt(f.pe, 1) : '—'}</td><td>${f.y != null ? fmt(f.y) + '%' : '—'}</td><td>${f.pb ? fmt(f.pb) : '—'}</td></tr>`; }).join('')}</table></div>
    <div class="sub small" style="margin-top:.4rem">EPS 為近四季合計（由股價 ÷ 本益比推算）。ETF 不是公司，沒有 EPS 和本益比，顯示「—」。點名字可以看這支股票的白話體檢。</div>`;
};

/* ---------------- 三大法人（真實資料） ---------------- */
W.chips = async (el, [id]) => {
  const d = await stock('tw', id);
  if (!d || !d.ch || !d.ch.length) return noData(el);
  const nm = await nameOf('tw', id), ch = d.ch.slice(-20);
  const who = [['外資', 1], ['投信', 2], ['自營商', 3]];
  el.innerHTML = `<div class="row"><b class="grow">${esc(nm)} ${id}：近 ${ch.length} 天法人買賣超</b></div>
    <div class="seg" id="cw" style="margin:.4rem 0">${who.map(([t, k], i) => `<button data-k="${k}" class="${i ? '' : 'on'}">${t}</button>`).join('')}</div><div id="cb"></div>`;
  const draw = k => {
    const vals = ch.map(r => r[k]), mx = Math.max(1, ...vals.map(Math.abs)), bw = 320 / vals.length;
    let streakN = 0; for (let i = vals.length - 1; i >= 0; i--){ if (streakN >= 0 && vals[i] > 0) streakN++; else if (streakN <= 0 && vals[i] < 0) streakN--; else break; }
    const sum5 = vals.slice(-5).reduce((a, b) => a + b, 0);
    $('#cb', el).innerHTML = `<svg viewBox="0 0 330 130" style="width:100%;height:auto"><line x1="5" x2="325" y1="65" y2="65" stroke="var(--line)"/>
      ${vals.map((v, i) => { const hh = Math.abs(v) / mx * 58; return `<rect x="${5 + i * bw + bw * 0.15}" y="${v >= 0 ? 65 - hh : 65}" width="${bw * 0.7}" height="${Math.max(0.5, hh)}" fill="${v >= 0 ? 'var(--up)' : 'var(--down)'}"/>`; }).join('')}
      <text x="5" y="127" font-size="10" fill="var(--sub)">${ch[0][0].slice(5)}</text><text x="325" y="127" font-size="10" fill="var(--sub)" text-anchor="end">${ch[ch.length - 1][0].slice(5)}</text></svg>
      <div class="res"><div>最近一天：<b class="${cls(vals[vals.length - 1])}">${vals[vals.length - 1] > 0 ? '買超' : vals[vals.length - 1] < 0 ? '賣超' : '持平'} ${fmt0(Math.abs(vals[vals.length - 1]))} 張</b></div>
        <div>近 5 天合計：<b class="${cls(sum5)}">${sum5 >= 0 ? '買超' : '賣超'} ${fmt0(Math.abs(sum5))} 張</b></div>
        <div>${streakN > 1 ? `已經<b class="up">連續買超 ${streakN} 天</b>` : streakN < -1 ? `已經<b class="down">連續賣超 ${-streakN} 天</b>` : '最近沒有連續同方向'}</div>
        <div class="sub small">紅色柱子＝買超（買比賣多），綠色＝賣超。單位：張。</div></div>`;
  };
  $$('#cw button', el).forEach(b => b.onclick = () => { $$('#cw button', el).forEach(x => x.classList.toggle('on', x === b)); draw(+b.dataset.k); });
  draw(1);
};

/* ---------------- 我的投資計畫 ---------------- */
W.plan = el => {
  const P = Object.assign({ goal: '退休後多一份收入', years: 10, emer: 6, monthly: 5000, etf: 70, stock: 10, cash: 20, picks: '', rules: { r1: 1, r2: 1, r3: 1, r4: 1, r5: 1 }, maxOne: 10, note: '' }, S.plan || {});
  const rules = [['r1', '只用閒錢，不借錢投資'], ['r2', '先存好緊急預備金再投資'], ['r3', '不碰融資融券、不當沖'], ['r4', '每半年檢查一次計畫，不因短期漲跌亂改'], ['r5', '下跌時先檢查「買的理由還在不在」，不憑感覺']];
  el.innerHTML = `
    <div class="field"><label>投資目的</label><select id="pg">${['退休後多一份收入', '存買房頭期款', '存小孩教育金', '讓存款不要被通膨吃掉', '學習、先玩玩看'].map(x => `<option ${x === P.goal ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="field"><label>多久不會用到</label><select id="py">${[1, 3, 5, 10, 20].map(x => `<option value="${x}" ${x == P.years ? 'selected' : ''}>${x} 年以上</option>`).join('')}</select></div>
    <div class="field"><label>緊急預備金</label><select id="pe2">${[0, 3, 6, 12].map(x => `<option value="${x}" ${x == P.emer ? 'selected' : ''}>${x ? `已存好 ${x} 個月生活費` : '還沒存'}</option>`).join('')}</select></div>
    <div class="field"><label>每月投入</label><input id="pm" type="number" inputmode="numeric" value="${P.monthly}"></div>
    <div style="margin:.6rem 0 .2rem"><b>資金怎麼分？</b> <span class="sub small">（三個加起來 100%）</span></div>
    ${[['etf', '市值型／高股息 ETF'], ['stock', '個股'], ['cash', '現金（等機會、備用）']].map(([k, t]) => `<div class="field"><label>${t}</label><input type="range" id="pa_${k}" min="0" max="100" step="5" value="${P[k]}"><b id="pv_${k}" class="num" style="min-width:3em;text-align:right"></b></div>`).join('')}
    <div class="field"><label>想買的標的</label><input id="pk" placeholder="例如 0050、00878" value="${esc(P.picks)}"></div>
    <div class="field"><label>單一個股最多</label><select id="px">${[5, 10, 20, 30].map(x => `<option value="${x}" ${x == P.maxOne ? 'selected' : ''}>總資金的 ${x}%</option>`).join('')}</select></div>
    <div style="margin:.6rem 0 .2rem"><b>我的紀律</b></div>
    ${rules.map(([k, t]) => `<label class="row" style="padding:.3rem 0"><input type="checkbox" id="pr_${k}" ${P.rules[k] ? 'checked' : ''} style="width:1.2rem;height:1.2rem;accent-color:var(--accent)"> <span>${t}</span></label>`).join('')}
    <textarea id="pn" placeholder="其他想提醒自己的話" style="margin-top:.4rem">${esc(P.note)}</textarea>
    <div class="res" id="psum"></div>
    <button class="btn ghost block" id="pcp" style="margin-top:.6rem">複製我的投資計畫</button>`;
  const fix = changed => {
    const ks = ['etf', 'stock', 'cash'], others = ks.filter(k => k !== changed);
    let rest = 100 - P[changed], sumO = P[others[0]] + P[others[1]];
    if (sumO === 0){ P[others[0]] = rest; P[others[1]] = 0; }
    else { P[others[0]] = Math.round(rest * P[others[0]] / sumO / 5) * 5; P[others[1]] = rest - P[others[0]]; }
  };
  const text = () => `【我的投資計畫】\n目的：${P.goal}\n這筆錢 ${P.years} 年以上不會用到\n緊急預備金：${P.emer ? P.emer + ' 個月' : '還沒存（先存！）'}\n每月投入：${fmt0(P.monthly)} 元\n配置：ETF ${P.etf}%、個股 ${P.stock}%、現金 ${P.cash}%\n標的：${P.picks || '（未填）'}\n單一個股不超過總資金 ${P.maxOne}%\n紀律：\n${rules.filter(([k]) => P.rules[k]).map(([, t]) => '・' + t).join('\n')}${P.note ? '\n備註：' + P.note : ''}`;
  const upd = changed => {
    P.goal = $('#pg', el).value; P.years = +$('#py', el).value; P.emer = +$('#pe2', el).value; P.monthly = +$('#pm', el).value || 0;
    P.picks = $('#pk', el).value; P.maxOne = +$('#px', el).value; P.note = $('#pn', el).value;
    rules.forEach(([k]) => P.rules[k] = $('#pr_' + k, el).checked ? 1 : 0);
    if (changed){ P[changed] = +$('#pa_' + changed, el).value; fix(changed); }
    ['etf', 'stock', 'cash'].forEach(k => { $('#pa_' + k, el).value = P[k]; $('#pv_' + k, el).textContent = P[k] + '%'; });
    S.plan = P; save();
    const warn = [];
    if (!P.emer) warn.push('還沒存緊急預備金：建議先存 3～6 個月生活費再開始投資。');
    if (P.years <= 1 && P.etf + P.stock > 30) warn.push('一年內就可能用到的錢，股票比例太高，跌的時候可能被迫賠錢賣。');
    if (P.stock > 50) warn.push('個股比例超過一半，新手建議以 ETF 為主。');
    $('#psum', el).innerHTML = `<div>每月 ${fmt0(P.monthly)} 元 → 約 ${fmt0(P.monthly * P.etf / 100)} 元買 ETF、${fmt0(P.monthly * P.stock / 100)} 元買個股、${fmt0(P.monthly * P.cash / 100)} 元留現金</div>
      ${warn.length ? warn.map(w => `<div class="warn small" style="margin:.4rem 0 0">⚠️ ${w}</div>`).join('') : '<div style="margin-top:.3rem">✅ 這個計畫看起來很穩健！</div>'}`;
  };
  $$('select,input,textarea', el).forEach(x => x.addEventListener('input', () => upd(x.id.startsWith('pa_') ? x.id.slice(3) : null)));
  $('#pcp', el).onclick = async () => { try { await navigator.clipboard.writeText(text()); toast('已複製，可以貼到 LINE 或備忘錄'); } catch (_) { toast('複製失敗，請截圖保存'); } };
  upd();
};

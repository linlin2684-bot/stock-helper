// 名詞小幫手：畫面上的專有名詞自動加底線，點了跳出白話解釋（股票學堂、股票小幫手共用）
// 需要先載入 glossary.js、glossary-more.js
(() => {
  'use strict';
  const G = window.GLOSSARY || [], ALIAS = window.GLOSSARY_ALIAS || {};
  const MAP = new Map(G.map(g => [g[0], g]));
  // 太常見、到處都是的字不自動加底線（字典裡還是查得到）
  const NO_AUTO = new Set(['股票', '股', '張', '美股', '風險', '產業', '成交', '委託', '開盤', '收盤', '股價', '漲跌', '美元']);
  const keys = [...MAP.keys(), ...Object.keys(ALIAS)].filter(k => k.length >= 2 && !NO_AUTO.has(k) && (MAP.has(k) || MAP.has(ALIAS[k])));
  keys.sort((a, b) => b.length - a.length);
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const RE = new RegExp(keys.map(escRe).join('|'), 'g');
  const canon = k => MAP.has(k) ? k : ALIAS[k];
  const isAscii = s => /^[A-Za-z0-9&+ .]+$/.test(s);
  const SKIP = 'a,button,input,textarea,select,option,svg,script,style,.term,.tag,.top,#tabs,.tabs,.opt,.btn,.seg,.chips,.toast,label,[data-noterm],h1,.tsheet .thead,.tsheet .tsub,.tsheet .tlist,.tsheet .tbtns,.tfab';
  const BOX = '.card,.sheet,.res,.fb,.w,.check,.vid,.tip,.warn,.kv>div,li,tr,p';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const seenOf = new WeakMap();
  function seenFor(box){
    let s = seenOf.get(box);
    if (!s){ s = new Set(); box.querySelectorAll && box.querySelectorAll('.term[data-t]').forEach(x => s.add(x.dataset.t)); seenOf.set(box, s); }
    return s;
  }
  function boxOf(node){ const el = node.parentElement; if (!el) return document.body; return el.closest('.tsheet,.card,.res,.fb,.w,.vid') || el.closest(BOX) || el; }

  function link(root){
    if (!root || !keys.length) return;
    const start = root.nodeType === 3 ? root.parentNode : root;
    if (!start || (start.closest && start.closest(SKIP))) return;
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT, {
      acceptNode: n => !n.nodeValue.trim() || (n.parentElement && n.parentElement.closest(SKIP)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      const text = n.nodeValue; RE.lastIndex = 0;
      let m, last = 0, frag = null; const seen = seenFor(boxOf(n));
      while ((m = RE.exec(text))){
        const k = m[0], c = canon(k);
        if (!c || seen.has(c)) continue;
        if (isAscii(k)){ const b = text[m.index - 1], a = text[m.index + k.length]; if ((b && /[A-Za-z0-9]/.test(b)) || (a && /[A-Za-z0-9]/.test(a))) continue; }
        seen.add(c);
        frag = frag || document.createDocumentFragment();
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const sp = document.createElement('span'); sp.className = 'term'; sp.dataset.t = c; sp.textContent = k; frag.appendChild(sp);
        last = m.index + k.length;
      }
      if (frag){ if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last))); n.parentNode.replaceChild(frag, n); }
    });
  }

  // 自動處理畫面上新出現的內容
  let pending = new Set(), scheduled = false, obs = null;
  const flush = () => {
    scheduled = false; const list = [...pending]; pending = new Set();
    obs.disconnect();
    try { list.forEach(n => n.isConnected && link(n)); } finally { obs.observe(document.body, { childList: true, subtree: true, characterData: false }); }
  };
  obs = new MutationObserver(recs => {
    recs.forEach(r => r.addedNodes.forEach(n => { if (n.nodeType === 1 || n.nodeType === 3) pending.add(n); }));
    if (pending.size && !scheduled){ scheduled = true; requestAnimationFrame(flush); }
  });

  // ---------- 解釋視窗 ----------
  const css = `
  .term{color:var(--accent);font-weight:600;border-bottom:1.5px dashed var(--accent);cursor:pointer}
  .tsheet-bg{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:60}
  .tsheet{position:fixed;left:0;right:0;bottom:0;z-index:61;background:var(--card);color:var(--text);border-radius:20px 20px 0 0;padding:1.1rem 1.1rem calc(1.2rem + env(safe-area-inset-bottom));max-height:78vh;overflow-y:auto;max-width:720px;margin:0 auto;box-shadow:0 -4px 20px rgba(0,0,0,.18);line-height:1.65}
  .tsheet h3{margin:0;font-size:1.3rem;flex:1}
  .tsheet .thead{display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem}
  .tsheet .ttag{font-size:.75rem;background:var(--accent-soft);color:var(--accent);border-radius:6px;padding:.05rem .45rem;font-weight:600}
  .tsheet .tex{background:var(--bg);border-radius:12px;padding:.6rem .8rem;margin:.6rem 0}
  .tsheet .tsub{color:var(--sub);font-size:.85rem}
  .tsheet .tbtns{display:flex;gap:.5rem;margin-top:.8rem}
  .tsheet .tbtns button{flex:1;border:0;border-radius:12px;padding:.7rem;font-weight:700;font-size:1rem;cursor:pointer;background:var(--accent-soft);color:var(--accent)}
  .tsheet .tbtns button.pri{background:var(--accent);color:#fff}
  .tsheet .tlist button{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);background:none;padding:.6rem .2rem;font-size:1rem;cursor:pointer;color:var(--text)}
  .tsheet .tlist button small{color:var(--sub);display:block;font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tfab{position:fixed;right:.8rem;bottom:calc(4.8rem + env(safe-area-inset-bottom));z-index:35;border:0;border-radius:999px;background:var(--card);color:var(--accent);box-shadow:0 2px 10px rgba(0,0,0,.18);padding:.5rem .8rem;font-weight:700;font-size:.85rem;cursor:pointer}
  @media (prefers-color-scheme: dark){ .tsheet .tbtns button.pri{color:#05201c} }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  let stack = [];
  const close = () => { document.querySelectorAll('.tsheet,.tsheet-bg').forEach(x => x.remove()); stack = []; stopSpeak(); };
  function sheet(html){
    document.querySelectorAll('.tsheet,.tsheet-bg').forEach(x => x.remove());
    const bg = document.createElement('div'); bg.className = 'tsheet-bg'; bg.onclick = close;
    const sh = document.createElement('div'); sh.className = 'tsheet'; sh.innerHTML = html;
    document.body.append(bg, sh); return sh;
  }
  function open(name, push = true){
    const c = canon(name) || name, g = MAP.get(c);
    if (push){ if (stack[stack.length - 1] !== c) stack.push(c); }
    const lessonHref = window.TERM_LINK ? window.TERM_LINK(c) : '';
    const sh = sheet(`<div class="thead">${stack.length > 1 ? '<button class="tback" style="border:0;background:none;font-size:1.3rem;cursor:pointer;color:var(--accent)" aria-label="返回">‹</button>' : ''}<h3>${esc(c)}</h3>${g ? `<span class="ttag">${esc(g[1])}</span>` : ''}</div>
      <div class="tdef">${g ? esc(g[2]) : '（字典裡還沒有這個詞）'}</div>
      ${g && g[3] ? `<div class="tex"><b>例如：</b>${esc(g[3])}</div>` : ''}
      ${lessonHref ? `<div class="tsub" style="margin-top:.4rem">${lessonHref}</div>` : ''}
      <div class="tsub" style="margin-top:.4rem">解釋裡有底線的字也可以點。</div>
      <div class="tbtns"><button class="tsp">🔊 唸給我聽</button><button class="pri tok">知道了</button></div>`);
    // 解釋文字裡的名詞也可以點（不含自己）
    const own = seenFor(sh); own.add(c); link(sh.querySelector('.tdef')); link(sh.querySelector('.tex'));
    sh.querySelector('.tok').onclick = close;
    sh.querySelector('.tsp').onclick = () => speak(c + '。' + (g ? g[2] + (g[3] ? '。例如：' + g[3] : '') : ''));
    const b = sh.querySelector('.tback'); if (b) b.onclick = () => { stack.pop(); const top = stack[stack.length - 1]; if (top === '__list') pageTerms(); else open(top, false); };
    sh.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  }
  // 這一頁出現的所有名詞（包含按鈕、選單裡的字）
  function pageTerms(){
    const root = document.querySelector('.lesson') || document.querySelector('main') || document.body;
    let text = root.innerText || '';
    root.querySelectorAll('option').forEach(o => text += ' ' + o.textContent);
    const found = []; const set = new Set(); RE.lastIndex = 0; let m;
    const all = new RegExp([...MAP.keys(), ...Object.keys(ALIAS)].filter(k => k.length >= 2 && (MAP.has(k) || MAP.has(ALIAS[k]))).sort((a, b) => b.length - a.length).map(escRe).join('|'), 'g');
    while ((m = all.exec(text))){ const c = canon(m[0]); if (c && !set.has(c)){ set.add(c); found.push(c); } }
    stack = [];
    const sh = sheet(`<div class="thead"><h3>📖 這一頁的名詞</h3></div><div class="tsub">共 ${found.length} 個，點一下看解釋</div>
      <div class="tlist">${found.map(c => `<button data-c="${esc(c)}"><b>${esc(c)}</b><small>${esc(MAP.get(c)[2])}</small></button>`).join('') || '<p class="tsub">這一頁沒有找到專有名詞。</p>'}</div>
      <div class="tbtns"><button class="pri tok">關閉</button></div>`);
    sh.querySelector('.tok').onclick = close;
    sh.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { stack = ['__list']; open(b.dataset.c); });
  }

  // 朗讀
  let speaking = false;
  function speak(t){
    if (!('speechSynthesis' in window)) return;
    stopSpeak();
    const u = new SpeechSynthesisUtterance(t); u.lang = 'zh-TW'; u.rate = 0.95;
    const v = speechSynthesis.getVoices().find(v => /zh[-_]TW/i.test(v.lang)); if (v) u.voice = v;
    u.onend = u.onerror = () => { speaking = false; }; speaking = true; speechSynthesis.speak(u);
  }
  function stopSpeak(){ if ('speechSynthesis' in window) speechSynthesis.cancel(); speaking = false; }

  document.addEventListener('click', e => {
    const t = e.target.closest('.term[data-t]'); if (!t) return;
    e.preventDefault(); e.stopPropagation();
    if (!t.closest('.tsheet')) stack = [];
    open(t.dataset.t);
  }, true);

  function start(){
    link(document.body);
    obs.observe(document.body, { childList: true, subtree: true });
    if (!document.querySelector('.tfab')){
      const b = document.createElement('button'); b.className = 'tfab'; b.textContent = '📖 名詞'; b.setAttribute('aria-label', '這一頁的名詞解釋');
      b.onclick = pageTerms; document.body.appendChild(b);
    }
  }
  // 返回上一個名詞時，清單也算一層
  const _open = open;
  window.TermUI = { link, open: n => { stack = []; _open(n); }, close, pageTerms, map: MAP, canon };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

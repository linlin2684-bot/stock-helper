// 股票學堂：每日 YouTube 影片推薦（清單每天由 Claude 更新 videos.json）
'use strict';
const VIDEO_URL = 'https://raw.githubusercontent.com/linlin2684-bot/stock-helper/main/learn/videos.json';
let VID = null;
async function loadVideos(){
  if (VID) return VID;
  const tryGet = u => fetch(u, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
  VID = (await tryGet(VIDEO_URL + '?d=' + today())) || (await tryGet('videos.json')) || { days: [], lib: [] };
  return VID;
}
S.vs = S.vs || {};   // 看過的影片
const ytThumb = id => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
const ytLink = id => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

function videoItem(v, tag){
  const seen = !!S.vs[v.id], l = LBYID[v.lid];
  return `<div class="vid" data-id="${esc(v.id)}">
    <a href="${ytLink(v.id)}" target="_blank" rel="noopener" class="vthumb" data-open="${esc(v.id)}"><img src="${ytThumb(v.id)}" alt="" loading="lazy"><span>▶</span></a>
    <div class="vbody"><div class="small">${tag ? `<span class="tag">${esc(tag)}</span> ` : ''}${seen ? '<span class="tag" style="background:var(--line);color:var(--sub)">看過了</span>' : ''}</div>
      <b>${esc(v.t)}</b>${v.ch ? `<div class="sub small">${esc(v.ch)}</div>` : ''}
      <div style="margin-top:.25rem">${esc(v.sum)}</div>
      ${v.note ? `<div class="sub small">⚠️ ${esc(v.note)}</div>` : ''}
      ${l ? `<div class="sub small">搭配 ${lessonLink(v.lid)}</div>` : ''}
      <div class="btns" style="margin-top:.5rem"><a class="btn" href="${ytLink(v.id)}" target="_blank" rel="noopener" data-open="${esc(v.id)}">▶ 到 YouTube 看</a>
        <button class="btn gray" data-seen="${esc(v.id)}">${seen ? '↩︎ 標成沒看' : '✓ 看過了'}</button></div></div></div>`;
}
document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]'); if (o){ S.vs[o.dataset.open] = 1; save(); }
  const s = e.target.closest('[data-seen]');
  if (s){ const id = s.dataset.seen; if (S.vs[id]) delete S.vs[id]; else S.vs[id] = 1; save(); const box = s.closest('[data-vbox]'); if (box) box.dispatchEvent(new Event('redraw')); }
});

// 今天推薦：配合目前進度的教學影片 2 部＋最新新片
function todayPicks(V){
  const cur = nextLesson() || LESSONS[LESSONS.length - 1];
  const seed = [...today()].reduce((a, c) => a * 31 + c.charCodeAt(0) >>> 0, 7);
  const rot = arr => arr.length ? arr.map((x, i) => [x, (i * 2654435761 + seed) >>> 0]).sort((a, b) => a[1] - b[1]).map(x => x[0]) : arr;
  const near = l => Math.abs(l.no - cur.no);
  const lib = V.lib.filter(v => LBYID[v.lid]);
  const unseen = lib.filter(v => !S.vs[v.id]);
  // 先找目前這課，再找同單元、前後幾課（偏向已上過或下一課）
  const ranked = rot(unseen).sort((a, b) => {
    const la = LBYID[a.lid], lb = LBYID[b.lid];
    const sa = (a.lid === cur.id ? 0 : la.unit === cur.unit ? 1 : 2) * 100 + near(la), sb = (b.lid === cur.id ? 0 : lb.unit === cur.unit ? 1 : 2) * 100 + near(lb);
    return sa - sb;
  }).filter(v => LBYID[v.lid].no <= cur.no + 3);
  const lesson = ranked.slice(0, 2);
  const day = (V.days || [])[0], news = day ? day.items.filter(v => !lesson.some(x => x.id === v.id)).slice(0, 2) : [];
  return { lesson, news, day: day?.date, cur };
}
async function mountTodayVideos(el){
  el.setAttribute('data-vbox', '');
  const draw = async () => {
    const V = await loadVideos(); if (!el.isConnected) return;
    const { lesson, news, day } = todayPicks(V);
    if (!lesson.length && !news.length){ el.innerHTML = ''; return; }
    el.innerHTML = `<div class="card"><h2>📺 今日推薦影片<a class="more" href="#videos">全部 ›</a></h2>
      ${lesson.map(v => videoItem(v, `第 ${LBYID[v.lid].no} 課延伸`)).join('')}
      ${news.map(v => videoItem(v, '最近的市場')).join('')}
      <div class="sub small" style="margin-top:.4rem">${day ? `${day.slice(5).replace('-', '/')} 更新・` : ''}每天自動更新。簡介是根據影片標題和說明整理，不是逐字看過；影片觀點僅供參考。</div></div>`;
  };
  el.addEventListener('redraw', draw);
  draw();
}
async function mountLessonVideo(el, lid){
  const V = await loadVideos(); if (!el.isConnected) return;
  const vs = V.lib.filter(v => v.lid === lid);
  if (!vs.length) return;
  const v = vs.find(x => !S.vs[x.id]) || vs[0];
  el.innerHTML = `<div class="card"><h2>📺 想多聽一次？看這部影片</h2>${videoItem(v, '')}</div>`;
}

function pageVideos(){
  setTop('影片推薦', `<a class="iconbtn" href="#home">✕</a>`);
  app.innerHTML = '<div class="skeleton" style="height:10rem"></div>';
  const tok = routeToken;
  let mode = 'lesson';
  loadVideos().then(V => {
    if (!alive(tok)) return;
    const draw = () => {
      let body = '';
      if (mode === 'lesson'){
        body = UNITS.map(u => {
          const vs = V.lib.filter(v => LBYID[v.lid]?.unit === u).sort((a, b) => LBYID[a.lid].no - LBYID[b.lid].no);
          return vs.length ? `<div class="card"><h2>${u.icon} ${esc(u.title)}</h2>${vs.map(v => videoItem(v, `第 ${LBYID[v.lid].no} 課`)).join('')}</div>` : '';
        }).join('') || '<p class="sub center">還沒有影片</p>';
      } else {
        body = (V.days || []).map(d => `<div class="card"><h2>📅 ${esc(d.date)}</h2>${d.items.map(v => videoItem(v, '')).join('')}</div>`).join('') || '<p class="sub center">還沒有每日新片</p>';
      }
      app.innerHTML = `<div class="seg" style="margin-bottom:.8rem"><button data-m="lesson" class="${mode === 'lesson' ? 'on' : ''}">配合課程</button><button data-m="day" class="${mode === 'day' ? 'on' : ''}">每日新片</button></div>
        <div data-vbox>${body}</div><p class="disclaimer">簡介是根據影片標題和說明整理，影片觀點僅供參考，不構成投資建議。</p>`;
      $$('[data-m]').forEach(b => b.onclick = () => { mode = b.dataset.m; draw(); });
      $('[data-vbox]').addEventListener('redraw', draw);
    };
    draw();
  });
}

#!/usr/bin/env python3
"""股票小幫手：每日資料更新程式（在 GitHub Actions 上執行）

產生 <out>/ 底下的 JSON 檔，讓 App 直接讀取：
  status.json            更新時間、各資料來源是否成功、美金匯率
  list.json              台股／美股清單（搜尋用）
  screen-tw.json/us.json 選股用的每支股票最新指標
  hist-tw.json/us.json   回測用的歷史資料（成交較活絡的股票）
  div.json               除權息預告
  p/tw/2330.json ...     個股日線、法人買賣、基本資料、配息

用法：python build_data.py --out site/data --state state [--fake] [--limit N]
"""
import argparse, json, math, os, re, sys, time, random, datetime as dt
from io import StringIO
from pathlib import Path

import numpy as np
import pandas as pd

ap = argparse.ArgumentParser()
ap.add_argument('--out', default='site/data')
ap.add_argument('--state', default='state')
ap.add_argument('--fake', action='store_true', help='不連網，用假資料產生（測試用）')
ap.add_argument('--limit', type=int, default=0, help='只處理前 N 支（測試用）')
ARGS = ap.parse_args()
OUT, STATE = Path(ARGS.out), Path(ARGS.state)
OUT.mkdir(parents=True, exist_ok=True); STATE.mkdir(parents=True, exist_ok=True)
TZ = dt.timezone(dt.timedelta(hours=8))
STATUS = {'generated': dt.datetime.now(TZ).strftime('%Y-%m-%d %H:%M'), 'parts': {}}
T0 = time.time()


def log(*a):
    print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)


def part(name, ok, info=''):
    STATUS['parts'][name] = {'ok': bool(ok), 'info': str(info)[:300]}
    log(('OK ' if ok else 'FAIL ') + name, info)


def dump(path, obj):
    p = OUT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def r2(x, d=2):
    if x is None:
        return None
    try:
        x = float(x)
    except Exception:
        return None
    return round(x, d) if math.isfinite(x) else None


def num(x):
    if x is None:
        return None
    if isinstance(x, (int, float, np.integer, np.floating)):
        x = float(x)
        return x if math.isfinite(x) else None
    s = str(x).replace(',', '').replace('%', '').replace('+', '').strip()
    s = re.sub(r'<[^>]+>', '', s)
    if s in ('', '-', '--', '---', 'N/A', 'NaN', 'nan', 'X', '除權息'):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def roc_date(s):
    """把 115/11/03、1151103、2026-11-03、20261103 轉成 2026-11-03"""
    if s is None:
        return None
    s = re.sub(r'[^\d]', '', str(s))
    try:
        if len(s) == 8:
            return f'{s[:4]}-{s[4:6]}-{s[6:]}'
        if len(s) == 7:
            return f'{int(s[:3]) + 1911}-{s[3:5]}-{s[5:]}'
        if len(s) == 6:
            return f'{int(s[:2]) + 1911}-{s[2:4]}-{s[4:]}'
    except ValueError:
        pass
    return None


# ------------------------------------------------------------------ HTTP
if not ARGS.fake:
    import requests
    SESS = requests.Session()
    SESS.headers.update({'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
                         'Accept': 'application/json,text/html,*/*'})


def get(url, params=None, tries=3, wait=3, as_json=True):
    last = None
    for i in range(tries):
        try:
            r = SESS.get(url, params=params, timeout=45)
            if r.status_code == 200:
                if not as_json:
                    return r.text
                txt = r.text.lstrip('﻿')
                return json.loads(txt)
            last = f'HTTP {r.status_code}'
        except Exception as e:  # noqa
            last = repr(e)[:200]
        time.sleep(wait * (i + 1))
    raise RuntimeError(f'{url} -> {last}')


def pick(rec, *cands):
    """在一筆資料裡用「欄位名稱包含的字」找值。cands 可以是字串或字串組合"""
    for c in cands:
        words = c if isinstance(c, (list, tuple)) else [c]
        for k, v in rec.items():
            if all(w.lower() in str(k).lower() for w in words):
                return v
    return None


def tables(obj):
    """在任意 JSON 裡找 {fields:[...], data:[[...]]} 形式的表格"""
    if isinstance(obj, dict):
        if isinstance(obj.get('fields'), list) and isinstance(obj.get('data'), list):
            yield obj['fields'], obj['data']
        for v in obj.values():
            yield from tables(v)
    elif isinstance(obj, list):
        for v in obj:
            if isinstance(v, (dict, list)):
                yield from tables(v)


def as_records(obj):
    """OpenAPI 回傳 list[dict]；舊網站回傳 fields/data。統一成 list[dict]"""
    if isinstance(obj, list) and (not obj or isinstance(obj[0], dict)):
        return obj
    out = []
    for f, d in tables(obj):
        out += [dict(zip(f, row)) for row in d if isinstance(row, list)]
    return out


TWSE_API = 'https://openapi.twse.com.tw/v1'
TPEX_API = 'https://www.tpex.org.tw/openapi/v1'
SWAG = {}


def swagger(base, url):
    if base in SWAG:
        return SWAG[base]
    paths = {}
    try:
        j = get(url)
        for p, v in j.get('paths', {}).items():
            g = v.get('get', {})
            paths[p] = f"{g.get('summary', '')} {g.get('description', '')} {' '.join(g.get('tags', []))}"
        log(f'swagger {base}: {len(paths)} paths')
    except Exception as e:
        log('swagger fail', base, e)
    SWAG[base] = paths
    return paths


def find_paths(base, words, default=None, every=False):
    url = TWSE_API + '/swagger.json' if base == 'twse' else 'https://www.tpex.org.tw/openapi/swagger.json'
    paths = swagger(base, url)
    hits = [p for p, s in paths.items() if all(w in s for w in words)]
    if every:
        return hits or ([default] if default else [])
    return hits[0] if hits else default


def api(base, path):
    return get((TWSE_API if base == 'twse' else TPEX_API) + path)


# ------------------------------------------------------------------ 指標（與 App 內 JavaScript 相同的算法）
def sma(a, n):
    o = np.full(len(a), np.nan)
    if len(a) >= n:
        cs = np.cumsum(np.insert(a, 0, 0.0))
        o[n - 1:] = (cs[n:] - cs[:-n]) / n
    return o


def ema(a, n):
    o = np.empty(len(a)); k = 2 / (n + 1); e = None
    for i, x in enumerate(a):
        e = x if e is None else x * k + e * (1 - k)
        o[i] = e
    return o


def rsi(c, n=14):
    o = np.full(len(c), np.nan); g = l = 0.0
    for i in range(1, len(c)):
        d = c[i] - c[i - 1]; up, dn = max(d, 0), max(-d, 0)
        if i <= n:
            g += up; l += dn
            if i == n:
                g /= n; l /= n; o[i] = 100 if l == 0 else 100 - 100 / (1 + g / l)
        else:
            g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n
            o[i] = 100 if l == 0 else 100 - 100 / (1 + g / l)
    return o


def kd(h, l, c, n=9):
    K = np.full(len(c), np.nan); D = np.full(len(c), np.nan); k = d = 50.0
    for i in range(n - 1, len(c)):
        hh, ll = h[i - n + 1:i + 1].max(), l[i - n + 1:i + 1].min()
        rsv = 50 if hh == ll else (c[i] - ll) / (hh - ll) * 100
        k = k * 2 / 3 + rsv / 3; d = d * 2 / 3 + k / 3; K[i] = k; D[i] = d
    return K, D


def metrics(c, h, l, v, mkt, unit):
    """回傳最後一天的選股指標"""
    n = len(c); i = n - 1
    if n < 2:
        return None
    ma5, ma20, ma60, vma5 = sma(c, 5), sma(c, 20), sma(c, 60), sma(v, 5)
    K, D = kd(h, l, c); R = rsi(c)
    chg = (c[i] / c[i - 1] - 1) * 100 if c[i - 1] else 0
    st = 0
    for k in range(i, 0, -1):
        d = np.sign(c[k] - c[k - 1])
        if d == 0:
            break
        if st == 0:
            st = int(d)
        elif d != np.sign(st):
            break
        else:
            st += int(d)
    gx = kx = None
    for j in range(0, 6):
        a, b = i - j, i - j - 1
        if b < 0:
            break
        if gx is None and not np.isnan(ma20[b]) and ma5[a] > ma20[a] and ma5[b] <= ma20[b]:
            gx = j
        if kx is None and not np.isnan(K[b]) and K[a] > D[a] and K[b] <= D[b] and K[b] < 30:
            kx = j
    nan = lambda x: None if x is None or (isinstance(x, float) and math.isnan(x)) else x
    return {
        'c': r2(c[i]), 'chg': r2(chg), 'st': st,
        'vr': r2(v[i] / vma5[i]) if vma5[i] and not np.isnan(vma5[i]) else None,
        'av': r2(v[max(0, i - 19):].mean() / unit, 1), 'vt': r2(v[i] / unit, 1),
        'a20': None if np.isnan(ma20[i]) else int(c[i] > ma20[i]),
        'a60': None if np.isnan(ma60[i]) else int(c[i] > ma60[i]),
        'gx': gx, 'kx': kx, 'rsi': r2(nan(R[i]), 1),
        'nh20': int(n >= 20 and c[i] >= c[i - 19:].max()), 'nh60': int(n >= 60 and c[i] >= c[i - 59:].max()),
        'dd60': r2((1 - c[i] / c[max(0, i - 59):].max()) * 100, 1),
        'r5': r2((c[i] / c[i - 5] - 1) * 100) if n > 5 else None,
        'r20': r2((c[i] / c[i - 20] - 1) * 100) if n > 20 else None,
        'lu': int(mkt == 'tw' and chg >= 9.5),
    }


# ------------------------------------------------------------------ 股票清單
ETF_US = ['SPY', 'VOO', 'IVV', 'QQQ', 'DIA', 'VTI', 'VT', 'IWM', 'SOXX', 'SMH', 'XLK', 'XLF', 'XLE', 'XLV', 'TLT', 'IEF', 'BND', 'GLD', 'SLV',
          'ARKK', 'SCHD', 'JEPI', 'VIG', 'VEA', 'VWO', 'TQQQ', 'SQQQ', 'SOXL']
EXTRA_US = ['TSM', 'ASML', 'ARM', 'BABA', 'PDD', 'NVO', 'SHOP', 'SE', 'UMC', 'ASX', 'SONY', 'TM', 'SAP', 'MELI', 'SPOT', 'COIN', 'PLTR', 'SMCI', 'MSTR']
US_INDEX = {'^DJI': '道瓊工業指數', '^GSPC': '標普 500 指數', '^IXIC': '那斯達克指數', '^SOX': '費城半導體指數'}
TW_INDEX = {'^TWII': ('TAIEX', '台股加權指數'), '^TWOII': ('TPEx', '櫃買指數')}


def fake_tw():
    base = [('2330', '台積電', '半導體業'), ('2317', '鴻海', '其他電子業'), ('2454', '聯發科', '半導體業'), ('2603', '長榮', '航運業'),
            ('2412', '中華電', '通信網路業'), ('2881', '富邦金', '金融保險業'), ('0050', '元大台灣50', 'ETF'), ('0056', '元大高股息', 'ETF'),
            ('00878', '國泰永續高股息', 'ETF'), ('6488', '環球晶', '半導體業')]
    base += [(str(1100 + k * 7), f'測試{k}', random.choice(['電子零組件業', '塑膠工業', '食品工業'])) for k in range(50)]
    return [dict(id=a, n=b, ind=c, mk='tpex' if a == '6488' else 'twse') for a, b, c in base]


def tw_universe():
    if ARGS.fake:
        return fake_tw()
    rows, seen = [], set()
    ok4 = lambda s: re.fullmatch(r'\d{4}', s) or re.fullmatch(r'00\d{2,4}[A-Z]?', s)
    try:
        j = get('https://api.finmindtrade.com/api/v4/data', {'dataset': 'TaiwanStockInfo'})
        for r in j.get('data', []):
            sid, t = r.get('stock_id', ''), r.get('type')
            if t in ('twse', 'tpex') and sid not in seen and ok4(sid) and r.get('industry_category') not in ('大盤', 'Index', '所有證券'):
                seen.add(sid); rows.append(dict(id=sid, n=r.get('stock_name', sid), ind=r.get('industry_category', ''), mk=t))
        part('tw_list_finmind', len(rows) > 500, f'{len(rows)} 支')
    except Exception as e:
        part('tw_list_finmind', False, e)
    if len(rows) < 500:  # 備援：證交所、櫃買中心
        for base, path, mk in (('twse', '/exchangeReport/STOCK_DAY_ALL', 'twse'), ('tpex', '/tpex_mainboard_daily_close_quotes', 'tpex')):
            try:
                for r in as_records(api(base, path)):
                    sid = str(pick(r, 'Code', '代號') or '').strip(); nm = str(pick(r, 'Name', '名稱') or sid).strip()
                    if sid and sid not in seen and ok4(sid):
                        seen.add(sid); rows.append(dict(id=sid, n=nm, ind='', mk=mk))
                part(f'tw_list_{base}', True, f'{len(rows)} 支')
            except Exception as e:
                part(f'tw_list_{base}', False, e)
    return rows


def us_universe():
    if ARGS.fake:
        return [dict(id=s, n=s + ' Inc.') for s in ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'TSM', 'AMD', 'INTC', 'KO', 'JNJ', 'SPY', 'QQQ']]
    rows, seen = [], set()

    def add(sym, name):
        sym = str(sym).strip().replace('.', '-')
        if sym and sym not in seen and re.fullmatch(r'[A-Z][A-Z\-]{0,6}', sym):
            seen.add(sym); rows.append(dict(id=sym, n=str(name).strip()))
    for name, url in (('sp500', 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies'), ('ndx', 'https://en.wikipedia.org/wiki/Nasdaq-100')):
        try:
            html = get(url, as_json=False); before = len(rows)
            for t in pd.read_html(StringIO(html)):
                cols = [str(c) for c in t.columns]
                sc = next((c for c in ('Symbol', 'Ticker') if c in cols), None); nc = next((c for c in ('Security', 'Company') if c in cols), None)
                if sc and nc and len(t) > 80:
                    for s, n in zip(t[sc], t[nc]):
                        add(s, n)
                    break
            part('us_list_' + name, len(rows) > before, f'新增 {len(rows) - before}，共 {len(rows)} 支')
        except Exception as e:
            part('us_list_' + name, False, e)
    for s in ETF_US + EXTRA_US:
        add(s, s)
    return rows


# ------------------------------------------------------------------ 股價
def fake_prices(symbols, days=1250):
    out = {}
    dates = pd.bdate_range(end=pd.Timestamp('2026-10-30'), periods=days)
    for s in symbols:
        rnd = np.random.default_rng(abs(hash(s)) % 2**32)
        p0 = {'^TWII': 22000, '^DJI': 42000, '^GSPC': 5800, '^IXIC': 18000}.get(s, rnd.uniform(15, 900))
        r = rnd.normal(0.0004, 0.019, days)
        r[-3:] = abs(r[-3:]) if rnd.random() < 0.15 else r[-3:]  # 讓部分股票連漲
        c = p0 * np.exp(np.cumsum(r)); o = c * (1 + rnd.normal(0, 0.006, days))
        h = np.maximum(o, c) * (1 + abs(rnd.normal(0, 0.006, days))); l = np.minimum(o, c) * (1 - abs(rnd.normal(0, 0.006, days)))
        v = rnd.uniform(2e5, 3e7, days) * (1 + (rnd.random(days) < 0.03) * 2)
        df = pd.DataFrame({'Open': o, 'High': h, 'Low': l, 'Close': c, 'Volume': v, 'Dividends': 0.0}, index=dates)
        if rnd.random() < 0.6:
            for y in range(2022, 2027):
                df.loc[df.index[df.index.year == y][len(df.index[df.index.year == y]) // 2], 'Dividends'] = round(c[-1] * 0.04, 2)
        out[s] = df
    return out


def download(symbols, period='5y', chunk=120):
    if ARGS.fake:
        return fake_prices(symbols)
    import yfinance as yf
    out = {}
    for k in range(0, len(symbols), chunk):
        part_syms = symbols[k:k + chunk]
        df = None
        for attempt in range(3):
            try:
                df = yf.download(part_syms, period=period, interval='1d', auto_adjust=False, actions=True,
                                 group_by='ticker', threads=True, progress=False)
                break
            except Exception as e:
                log('yfinance retry', attempt, e); time.sleep(10 * (attempt + 1))
        if df is None or df.empty:
            continue
        for s in part_syms:
            try:
                d = df[s] if isinstance(df.columns, pd.MultiIndex) and s in df.columns.get_level_values(0) else (df if len(part_syms) == 1 else None)
                if d is None:
                    continue
                d = d.dropna(subset=['Close'])
                d = d[d['Close'] > 0]
                if len(d) >= 5:
                    out[s] = d
            except Exception:
                pass
        log(f'下載股價 {min(k + chunk, len(symbols))}/{len(symbols)}，成功 {len(out)}')
        time.sleep(1.5)
    return out


# ------------------------------------------------------------------ 法人買賣（籌碼）
def parse_insti(obj):
    """回傳 {代號: [外資, 投信, 自營商]}（單位：股）"""
    out = {}
    for fields, data in tables(obj):
        f = [str(x) for x in fields]
        def idx(*words, exclude=()):
            for n, name in enumerate(f):
                if all(w in name for w in words) and not any(x in name for x in exclude):
                    return n
            return None
        ic = idx('代號'); i_f = idx('外', '買賣超', exclude=('自營商',)) or idx('外資', '買賣超'); i_t = idx('投信', '買賣超'); i_d = idx('自營商', '買賣超')
        if ic is None or i_f is None:
            continue
        for row in data:
            try:
                code = str(row[ic]).strip()
                out[code] = [num(row[i_f]) or 0, num(row[i_t]) or 0 if i_t is not None else 0, num(row[i_d]) or 0 if i_d is not None else 0]
            except Exception:
                pass
    return out


def chips(trade_dates, codes):
    """回傳 {代號: [[日期, 外資張, 投信張, 自營張], ...]}，保留近 20 個交易日"""
    path = STATE / 'chips_tw.json'
    hist = {}
    if path.exists():
        try:
            hist = json.loads(path.read_text())
        except Exception:
            hist = {}
    want = trade_dates[-20:]
    if ARGS.fake:
        rnd = random.Random(1)
        for d in want:
            hist.setdefault(d, {c: [rnd.randint(-3000000, 3000000), rnd.randint(-500000, 600000), rnd.randint(-300000, 300000)] for c in codes})
    else:
        got = 0
        for d in want:
            if d in hist and len(hist[d]) > 1500:
                continue
            day = dict(hist.get(d, {}))
            ymd = d.replace('-', '')
            try:
                j = get('https://www.twse.com.tw/rwd/zh/fund/T86', {'date': ymd, 'selectType': 'ALLBUT0999', 'response': 'json'}, tries=2)
                day.update(parse_insti(j))
            except Exception as e:
                log('T86 失敗', d, e)
            time.sleep(3)
            try:
                y, m, dd = d.split('-')
                j = get('https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade', {'type': 'Daily', 'sect': 'EW', 'date': f'{y}/{m}/{dd}', 'response': 'json'}, tries=2)
                day.update(parse_insti(j))
            except Exception as e:
                log('櫃買法人失敗', d, e)
            time.sleep(2)
            if day:
                hist[d] = day; got += 1
        part('chips', any(d in hist for d in want), f'新抓 {got} 天，共 {len([d for d in want if d in hist])} 天')
    hist = {d: v for d, v in hist.items() if d in set(trade_dates[-40:])}
    path.write_text(json.dumps(hist, ensure_ascii=False, separators=(',', ':')))
    out = {}
    for d in want:
        for code, (f, t, dl) in hist.get(d, {}).items():
            out.setdefault(code, []).append([d, round(f / 1000), round(t / 1000), round(dl / 1000)])
    return out


def streak_pos(vals):
    n = 0
    for x in reversed(vals):
        if x > 0 and n >= 0:
            n += 1
        elif x < 0 and n <= 0:
            n -= 1
        else:
            break
    return n


# ------------------------------------------------------------------ 基本面
def fundamentals(codes):
    F = {c: {} for c in codes}
    if ARGS.fake:
        rnd = random.Random(2)
        for c in codes:
            F[c] = {'pe': r2(rnd.uniform(6, 40)), 'y': r2(rnd.uniform(0, 8)), 'pb': r2(rnd.uniform(0.6, 6)), 'eps': r2(rnd.uniform(-1, 12)), 'epsq': '115Q2',
                    'rev': rnd.randint(10**8, 10**11), 'yoy': r2(rnd.uniform(-30, 60)), 'revm': '115/09', 'chair': '王大明', 'est': '1987-02-21', 'lst': '1994-09-05', 'cap': rnd.randint(10**9, 3 * 10**11)}
        return F
    # 本益比、殖利率、股價淨值比
    for base, path in (('twse', find_paths('twse', ['本益比', '殖利率'], '/exchangeReport/BWIBBU_ALL')),
                       ('tpex', find_paths('tpex', ['本益比'], '/tpex_mainboard_peratio_analysis'))):
        try:
            recs = as_records(api(base, path)); n = 0
            for r in recs:
                c = str(pick(r, 'Code', '代號') or '').strip()
                if c in F:
                    F[c].update(pe=num(pick(r, 'PEratio', 'PriceEarning', '本益比')), y=num(pick(r, 'DividendYield', 'YieldRatio', 'Yield', '殖利率')),
                                pb=num(pick(r, 'PBratio', 'PriceBook', '淨值比'))); n += 1
            part(f'pe_{base}', n > 100, f'{path} {n} 筆；欄位 {list(recs[0].keys()) if recs else []}')
        except Exception as e:
            part(f'pe_{base}', False, e)
    # 公司基本資料
    for base, words, default in (('twse', ['上市公司基本資料'], '/opendata/t187ap03_L'), ('tpex', ['上櫃公司基本資料'], '/mopsfin_t187ap03_O')):
        try:
            path = find_paths(base, words, default); recs = as_records(api(base, path)); n = 0
            for r in recs:
                c = str(pick(r, '公司代號', 'SecuritiesCompanyCode', 'Code') or '').strip()
                if c in F:
                    F[c].update(chair=pick(r, '董事長', 'Chairman'), est=roc_date(pick(r, '成立日期', 'DateOfIncorporation', 'Incorporation')),
                                lst=roc_date(pick(r, '上市日期', '上櫃日期', 'DateOfListing', 'Listing')),
                                cap=num(pick(r, '實收資本額', 'Paidin', 'Capital'))); n += 1
            part(f'info_{base}', n > 100, f'{path} {n} 筆；欄位 {list(recs[0].keys())[:12] if recs else []}')
        except Exception as e:
            part(f'info_{base}', False, e)
    # 月營收
    for base, words, default in (('twse', ['每月營業收入', '上市'], '/opendata/t187ap05_L'), ('tpex', ['每月營業收入', '上櫃'], '/mopsfin_t187ap05_O')):
        try:
            path = find_paths(base, words, default); recs = as_records(api(base, path)); n = 0
            for r in recs:
                c = str(pick(r, '公司代號', 'CompanyCode', 'Code') or '').strip()
                if c in F:
                    rv = num(pick(r, ['當月營收'], ['MonthlyRevenue'], ['Revenue', 'Current']))
                    F[c].update(rev=rv * 1000 if rv is not None else None,  # 公開資料單位是千元
                                 yoy=num(pick(r, ['去年同月增減'], ['LastYearMonth', '%'], ['YoY'])),
                                revm=str(pick(r, '資料年月', 'YearMonth', 'DataYear') or '')); n += 1
            part(f'rev_{base}', n > 100, f'{path} {n} 筆；欄位 {list(recs[0].keys()) if recs else []}')
        except Exception as e:
            part(f'rev_{base}', False, e)
    # EPS（各產業的綜合損益表）
    for base in ('twse', 'tpex'):
        n = 0; suf = '_L' if base == 'twse' else '_O'
        paths = [x for x in find_paths(base, ['綜合損益表'], every=True) if suf in x]
        for path in paths:
            try:
                recs = as_records(api(base, path)); before = n
                for r in recs:
                    c = str(pick(r, '公司代號', 'CompanyCode', 'Code') or '').strip(); e = num(pick(r, '每股盈餘', 'EPS', 'EarningsPerShare'))
                    if c in F and e is not None:
                        F[c].update(eps=e, epsq=f"{pick(r, '年度', 'Year') or ''}Q{pick(r, '季別', 'Season', 'Quarter') or ''}"); n += 1
                log('EPS 表', path, len(recs), '筆，對到', n - before, '；欄位', list(recs[0].keys())[:8] if recs else [])
                time.sleep(0.5)
            except Exception as e:
                log('EPS 失敗', base, path, e)
        part(f'eps_{base}', n > 100, f'{len(paths)} 個表，{n} 筆')
    return F


def dividends_calendar(names):
    if ARGS.fake:
        today = dt.date(2026, 10, 30)
        return [dict(id=c, n=names.get(c, c), d=str(today + dt.timedelta(days=k + 1)), cash=r2(random.uniform(0.5, 5)), stock=None) for k, c in enumerate(['2412', '0056', '00878', '2881', '1107'])]
    out = []
    for base, default in (('twse', '/exchangeReport/TWT48U_ALL'), ('tpex', '/tpex_exright_prepost')):
        try:
            path = find_paths(base, ['除權除息', '預告'], default); recs = as_records(api(base, path)); n = 0
            for r in recs:
                c = str(pick(r, 'Code', '代號') or '').strip(); d = roc_date(pick(r, ['除權除息日'], ['ExRight', 'Date'], ['Date'], ['日期']))
                if not c or not d:
                    continue
                out.append(dict(id=c, n=str(pick(r, 'Name', '名稱') or names.get(c, c)).strip(), d=d,
                                cash=num(pick(r, ['現金股利'], ['CashDividend'], ['Cash'], ['息'])), stock=num(pick(r, ['無償配股'], ['StockDividend'], ['配股']))))
                n += 1
            part(f'div_{base}', n > 0, f'{path} {n} 筆；欄位 {list(recs[0].keys()) if recs else []}')
        except Exception as e:
            part(f'div_{base}', False, e)
    today = dt.datetime.now(TZ).date().isoformat()
    out = [x for x in out if x['d'] >= today]
    out.sort(key=lambda x: (x['d'], x['id']))
    return out


# ------------------------------------------------------------------ 主流程
def frame_rows(d, keep=520):
    d = d.tail(keep)
    return [[ix.strftime('%Y-%m-%d'), r2(o), r2(h), r2(l), r2(c), int(v) if v == v else 0]
            for ix, o, h, l, c, v in zip(d.index, d['Open'], d['High'], d['Low'], d['Close'], d['Volume'])]


def div_years(d):
    if 'Dividends' not in d:
        return [], 0
    s = d['Dividends'].fillna(0)
    s = s[s > 0]
    by = s.groupby(s.index.year).sum()
    last = dt.datetime.now(TZ).year - 1
    n = 0
    for y in range(last, last - 5, -1):
        if by.get(y, 0) > 0:
            n += 1
        else:
            break
    return [[int(y), r2(v, 3)] for y, v in by.items()], n


def build_hist(frames, ids, dates, unit, keep=330):
    """回測用：c=收盤；h/l=最高、最低相對收盤的萬分比；v=成交量（台股張、美股萬股）"""
    dates = dates[-keep:]
    pos = {d: k for k, d in enumerate(dates)}
    H = {'d': dates, 'ids': [], 'c': [], 'h': [], 'l': [], 'v': []}
    for sid in ids:
        d = frames[sid]
        arr = {k: [None] * len(dates) for k in 'chlv'}
        for ix, h, l, c, v in zip(d.index, d['High'], d['Low'], d['Close'], d['Volume']):
            p = pos.get(ix.strftime('%Y-%m-%d'))
            if p is not None and c > 0:
                arr['c'][p] = r2(c)
                arr['h'][p] = int(round((h / c - 1) * 1e4)) if h == h else 0
                arr['l'][p] = int(round((1 - l / c) * 1e4)) if l == l else 0
                arr['v'][p] = int(round((v if v == v else 0) / unit))
        H['ids'].append(sid)
        for k in 'chlv':
            H[k].append(arr[k])
    return H


def process_market(mkt, universe, frames_by_id, names, extra=None):
    unit = 1000 if mkt == 'tw' else 10000  # 台股：張；美股：萬股
    cols = ['id', 'n', 'ind', 'c', 'chg', 'st', 'vr', 'av', 'vt', 'a20', 'a60', 'gx', 'kx', 'rsi', 'nh20', 'nh60', 'dd60', 'r5', 'r20', 'lu',
            'fb', 'tb', 'fn', 'tn', 'y', 'pe', 'pb', 'dy', 'yoy', 'eps']
    rows, liquid = [], []
    last_date = None
    for u in universe:
        sid = u['id']; d = frames_by_id.get(sid)
        if d is None or len(d) < 25:
            continue
        d = d.tail(520)
        c, h, l, v = (d[k].to_numpy(dtype=float) for k in ('Close', 'High', 'Low', 'Volume'))
        v = np.nan_to_num(v)
        m = metrics(c, h, l, v, mkt, unit)
        if not m:
            continue
        dlast = d.index[-1].strftime('%Y-%m-%d'); last_date = max(last_date or dlast, dlast)
        divs, dy = div_years(frames_by_id[sid])
        ex = (extra or {}).get(sid, {})
        ch = ex.get('ch') or []
        fb = streak_pos([x[1] for x in ch]) if ch else None
        tb = streak_pos([x[2] for x in ch]) if ch else None
        f = ex.get('f') or {}
        m.update(id=sid, n=u['n'], ind=u.get('ind', ''), fb=fb, tb=tb, fn=ch[-1][1] if ch else None, tn=ch[-1][2] if ch else None,
                 y=f.get('y'), pe=f.get('pe'), pb=f.get('pb'), dy=dy, yoy=f.get('yoy'), eps=f.get('eps'))
        rows.append([m.get(k) for k in cols])
        turnover = float(np.mean(c[-20:] * v[-20:]))
        liquid.append((turnover, sid))
        dump(f'p/{mkt}/{sid}.json', {'r': frame_rows(d), 'ch': ch, 'f': {k: v2 for k, v2 in f.items() if v2 not in (None, '')}, 'dv': divs, 'mk': u.get('mk', mkt)})
    STATUS[f'{mkt}_date'] = last_date
    dump(f'screen-{mkt}.json', {'d': last_date, 'cols': cols, 'rows': rows})
    return rows, liquid


def main():
    random.seed(0)
    # ---- 台股
    tw = tw_universe()
    if ARGS.limit:
        tw = tw[:ARGS.limit]
    names_tw = {u['id']: u['n'] for u in tw}
    sym = {u['id']: u['id'] + ('.TWO' if u['mk'] == 'tpex' else '.TW') for u in tw}
    raw = download(list(sym.values()) + list(TW_INDEX))
    frames_tw = {sid: raw[s] for sid, s in sym.items() if s in raw}
    part('tw_prices', len(frames_tw) > (10 if ARGS.fake or ARGS.limit else 800), f'{len(frames_tw)}/{len(tw)} 支')
    for ysym, (sid, nm) in TW_INDEX.items():
        if ysym in raw:
            dump(f'p/tw/{sid}.json', {'r': frame_rows(raw[ysym]), 'ch': [], 'f': {}, 'dv': []})
    idx = raw.get('^TWII')
    trade_dates = [x.strftime('%Y-%m-%d') for x in (idx.index if idx is not None else max(frames_tw.values(), key=len).index)]
    try:
        ch = chips(trade_dates, list(frames_tw))
    except Exception as e:
        part('chips', False, e); ch = {}
    try:
        F = fundamentals(list(frames_tw))
    except Exception as e:
        part('fundamentals', False, e); F = {}
    extra = {sid: {'ch': ch.get(sid, []), 'f': F.get(sid, {})} for sid in frames_tw}
    rows_tw, liq_tw = process_market('tw', tw, frames_tw, names_tw, extra)
    top = [s for _, s in sorted(liq_tw, reverse=True)[:600]]
    dump('hist-tw.json', build_hist(frames_tw, top, trade_dates, 1000))
    try:
        dump('div.json', dividends_calendar(names_tw))
    except Exception as e:
        part('div', False, e); dump('div.json', [])

    # ---- 美股
    us = us_universe()
    if ARGS.limit:
        us = us[:ARGS.limit]
    raw_us = download([u['id'] for u in us] + list(US_INDEX) + ['TWD=X'])
    frames_us = {u['id']: raw_us[u['id']] for u in us if u['id'] in raw_us}
    part('us_prices', len(frames_us) > (5 if ARGS.fake or ARGS.limit else 300), f'{len(frames_us)}/{len(us)} 支')
    for s in US_INDEX:
        if s in raw_us:
            dump(f'p/us/{s.replace("^", "_")}.json', {'r': frame_rows(raw_us[s]), 'ch': [], 'f': {}, 'dv': []})
    rows_us, liq_us = process_market('us', us, frames_us, {u['id']: u['n'] for u in us})
    gidx = raw_us.get('^GSPC')
    us_dates = [x.strftime('%Y-%m-%d') for x in (gidx.index if gidx is not None else max(frames_us.values(), key=len).index)]
    dump('hist-us.json', build_hist(frames_us, [s for _, s in sorted(liq_us, reverse=True)[:500]], us_dates, 10000))
    # ---- 匯率
    fx = raw_us.get('TWD=X') if not ARGS.fake else pd.DataFrame({'Close': [32.05, 32.15]}, index=pd.to_datetime(['2026-10-29', '2026-10-30']))
    if fx is not None and len(fx) >= 2:
        STATUS['fx'] = {'rate': r2(fx['Close'].iloc[-1], 3), 'prev': r2(fx['Close'].iloc[-2], 3), 't': fx.index[-1].strftime('%Y-%m-%d')}
    # ---- 清單
    dump('list.json', {'tw': [[u['id'], u['n'], u.get('ind', ''), u['mk']] for u in tw if u['id'] in frames_tw] + [['TAIEX', '台股加權指數', '大盤', 'twse']],
                       'us': [[u['id'], u['n']] for u in us if u['id'] in frames_us]})
    STATUS['seconds'] = round(time.time() - T0)
    try:  # 抽查幾筆資料，方便看紀錄檢查
        ci = {k: n for n, k in enumerate(['id', 'n', 'ind', 'c', 'chg', 'st', 'vr', 'av', 'vt', 'a20', 'a60', 'gx', 'kx', 'rsi', 'nh20', 'nh60', 'dd60', 'r5', 'r20', 'lu', 'fb', 'tb', 'fn', 'tn', 'y', 'pe', 'pb', 'dy', 'yoy', 'eps'])}
        log('抽查 有值的筆數', {k: sum(1 for r in rows_tw if r[ci[k]] is not None) for k in ('y', 'pe', 'fb', 'yoy', 'eps', 'dy')})
        for sid in ('2330', '0050', '6488'):
            r = next((x for x in rows_tw if x[0] == sid), None); log('抽查', sid, r)
            e = extra.get(sid, {}); log('  法人', (e.get('ch') or [])[-2:], ' 基本', e.get('f'))
        log('抽查 除權息', json.load(open(OUT / 'div.json', encoding='utf-8'))[:3])
        log('抽查 AAPL', next((x for x in rows_us if x[0] == 'AAPL'), None))
    except Exception as e:
        log('抽查失敗', e)
    dump('status.json', STATUS)
    log('完成', STATUS.get('tw_date'), STATUS.get('us_date'), f'台股 {len(rows_tw)} 支、美股 {len(rows_us)} 支')
    bad = [k for k, v in STATUS['parts'].items() if not v['ok']]
    if bad:
        log('⚠️ 以下資料來源失敗（App 其他功能仍可用）：', ', '.join(bad))
    if not rows_tw and not rows_us:
        sys.exit(1)


if __name__ == '__main__':
    main()

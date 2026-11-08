/* UZEX 2035 engine: fees, forecast, intent parser. Pure functions, no DOM. */
(function (G) {
  "use strict";
  // Fees from 2026-10-01 (UZEX): exchange fee seller 0.05%, buyer 0.13%; clearing 0.05% each side.
  // Broker fee is negotiated per client; demo uses 0.10%. Deposit (guarantee) is held, then returned or counted.
  const FEES = {
    buy: { exchange: 0.0013, clearing: 0.0005 },
    sell: { exchange: 0.0005, clearing: 0.0005 },
    broker: 0.001, deposit: 0.03,
  };

  const SYN = {
    cement: ["sement", "cement", "цемент", "семент", "sment"],
    wheat: ["bug'doy", "bugdoy", "bug‘doy", "bugʻdoy", "пшениц", "wheat", "бугдой"],
    flour: ["un ", "unni", "un,", "мука", "муки", "flour"],
    diesel: ["dizel", "solyarka", "дизел", "солярк", "diesel", "дт"],
    lpg: ["gaz", "propan", "газ", "пропан", "lpg", "suyultirilgan"],
    rebar: ["armatura", "арматур", "rebar"],
    sugar: ["shakar", "сахар", "sugar", "шакар"],
    sunflower_oil: ["yog'", "yog‘", "yogʻ", "yog", "масло", "подсолнеч", "oil"],
    rice: ["guruch", "рис", "rice", "гуруч"],
    polyethylene: ["polietilen", "полиэтилен", "polyethylene"],
  };
  const REGIONS = [
    ["Toshkent shahri", ["toshkent shahri", "toshkentga", "toshkent", "ташкент"]], ["Toshkent viloyati", ["toshkent viloyat"]],
    ["Samarqand viloyati", ["samarqand", "самарканд"]], ["Buxoro viloyati", ["buxoro", "бухар"]], ["Andijon viloyati", ["andijon", "андижан"]],
    ["Farg'ona viloyati", ["farg'ona", "fargona", "фергана"]], ["Namangan viloyati", ["namangan", "наманган"]],
    ["Qashqadaryo viloyati", ["qashqadaryo", "qarshi", "кашкадар"]], ["Surxondaryo viloyati", ["surxondaryo", "termiz", "сурхандар"]],
    ["Xorazm viloyati", ["xorazm", "urganch", "хорезм"]], ["Navoiy viloyati", ["navoiy", "навои"]], ["Jizzax viloyati", ["jizzax", "джизак"]],
    ["Sirdaryo viloyati", ["sirdaryo", "guliston", "сырдар"]], ["Qoraqalpog'iston", ["qoraqalpog", "nukus", "каракалп"]],
  ];

  function norm(s) { return (" " + String(s || "").toLowerCase().replace(/[ʻʼ‘’`]/g, "'") + " ").replace(/\s+/g, " "); }

  function findGood(text) {
    const t = norm(text);
    for (const id in SYN) if (SYN[id].some(w => t.includes(w))) return id;
    return null;
  }
  function findRegion(text) {
    const t = norm(text);
    for (const [name, keys] of REGIONS) if (keys.some(k => t.includes(k))) return name;
    return null;
  }
  function findSide(text) {
    const t = norm(text);
    if (/(sot(aman|moqchi|ish|ib bermoq|ay)|sotuv|прода|sell)/.test(t) && !/sotib ol/.test(t)) return "sell";
    if (/(sotib ol|olmoqchi|olaman|kerak|xarid|куп|buy|olish)/.test(t)) return "buy";
    return null;
  }
  const WORDNUM = { bir: 1, ikki: 2, uch: 3, "to'rt": 4, besh: 5, olti: 6, yetti: 7, sakkiz: 8, "to'qqiz": 9, "o'n": 10, yigirma: 20, "o'ttiz": 30, qirq: 40, ellik: 50, oltmish: 60, yetmish: 70, sakson: 80, "to'qson": 90, yuz: 100, ming: 1000 };
  function findQty(text) {
    const t = norm(text);
    const m = t.match(/(\d[\d\s.,]*)\s*(ming\s*)?(tonna|tn|t\b|т\b|тонн|kg|кг|kilogramm|килограмм|vagon|вагон)?/);
    let q = null, unit = null;
    if (m) {
      q = parseFloat(m[1].replace(/\s/g, "").replace(",", "."));
      if (m[2]) q *= 1000;
      unit = m[3] || null;
    } else {
      let acc = 0, cur = 0, hit = false;
      for (const w of t.trim().split(" ")) {
        const v = WORDNUM[w]; if (v == null) continue; hit = true;
        if (v === 100) cur = (cur || 1) * 100; else if (v === 1000) { acc += (cur || 1) * 1000; cur = 0; } else cur += v;
      }
      if (hit) q = acc + cur;
      if (/tonna|тонн/.test(t)) unit = "tonna";
    }
    if (q == null || !isFinite(q) || q <= 0) return null;
    if (unit && /kg|кг|kilo|килограмм/.test(unit)) q = q / 1000;
    if (unit && /vagon|вагон/.test(unit)) q = q * 60; // ~60 t per rail car
    return Math.round(q * 100) / 100;
  }
  function findWhen(text) {
    const t = norm(text);
    if (/bugun|сегодня|today/.test(t)) return "bugun";
    if (/ertaga|завтра/.test(t)) return "ertaga";
    if (/hafta|недел/.test(t)) return "shu hafta";
    if (/oy|месяц/.test(t)) return "shu oy";
    return null;
  }
  function parseIntent(text) {
    return { side: findSide(text), good: findGood(text), qty: findQty(text), region: findRegion(text), when: findWhen(text), raw: text };
  }

  // ---- statistics ----
  function linreg(ys) {
    const n = ys.length, xs = ys.map((_, i) => i);
    const mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    const b = sxx ? sxy / sxx : 0, a = my - b * mx;
    const res = ys.map((y, i) => y - (a + b * i));
    const sd = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / Math.max(1, n - 2));
    return { a, b, sd, n };
  }
  function median(a) { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  // Forecast next `h` weeks: trend over the last 12 weeks + month seasonality from 4+ years of history.
  function forecast(g, h = 4) {
    const w = g.weeks, last = w[w.length - 1];
    const recent = w.slice(-12).map(x => x[1]);
    const lr = linreg(recent);
    const mvals = Object.values(g.month), mmean = mvals.reduce((a, b) => a + b, 0) / mvals.length;
    const season = m => (g.month[String(m)] || mmean) / mmean;
    const lastDate = new Date(last[0] + "T00:00:00");
    const curM = lastDate.getMonth() + 1;
    const now = median(w.slice(-4).map(x => x[1]));
    const pts = [];
    for (let k = 1; k <= h; k++) {
      const d = new Date(lastDate); d.setDate(d.getDate() + 7 * k);
      const m = d.getMonth() + 1;
      const trend = lr.a + lr.b * (recent.length - 1 + k);
      const p = trend * season(m) / season(curM);
      const band = lr.sd * Math.sqrt(1 + k / 3) * 1.28; // ~80% band
      pts.push({ date: d.toISOString().slice(0, 10), p, lo: p - band, hi: p + band });
    }
    const end = pts[pts.length - 1].p;
    const endM = new Date(pts[pts.length - 1].date).getMonth() + 1;
    const seasonChg = season(endM) / season(curM) - 1;
    const chg = (end - now) / now;
    const weekly = lr.b / now;
    const vol = lr.sd / now;
    const yearAgo = w[w.length - 53] ? w[w.length - 53][1] : null;
    // best weekday (last 12 months medians)
    const dn = ["", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
    const dows = Object.entries(g.dow).filter(([d]) => +d <= 5);
    const dmean = dows.reduce((s, [, p]) => s + p, 0) / dows.length;
    dows.sort((a, b) => a[1] - b[1]);
    const cheapDay = dows.length ? { day: dn[+dows[0][0]], diff: (dows[0][1] - dmean) / dmean } : null;
    const dearDay = dows.length ? { day: dn[+dows[dows.length - 1][0]], diff: (dows[dows.length - 1][1] - dmean) / dmean } : null;
    // cheapest / dearest month
    const ms = Object.entries(g.month).sort((a, b) => a[1] - b[1]);
    const mn = ["", "yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
    const conf = vol < 0.01 ? "yuqori" : vol < 0.025 ? "o'rtacha" : "past";
    let buy, sell;
    const th = Math.max(0.01, vol * 0.8);
    if (chg > th) { buy = { k: "buy", h: "Hozir oling", t: "Narx keyingi 4 haftada oshishi kutilmoqda." }; sell = { k: "wait", h: "Shoshilmang", t: "Narx oshmoqda: biroz kutsangiz qimmatroq sotasiz." }; }
    else if (chg < -th) { buy = { k: "wait", h: "Biroz kuting", t: "Narx pasayishi kutilmoqda: 2-4 hafta kutsangiz arzonroq olasiz." }; sell = { k: "buy", h: "Hozir soting", t: "Narx pasayishi kutilmoqda: hozirgi narxda sotish foydaliroq." }; }
    else { buy = { k: "neutral", h: "Narx barqaror", t: "Katta o'zgarish kutilmayapti: kerak bo'lganda oling." }; sell = { k: "neutral", h: "Narx barqaror", t: "Katta o'zgarish kutilmayapti: qulay paytda soting." }; }
    return { now, last, pts, chg, seasonChg, weekly, vol, conf, yearAgo, cheapDay, dearDay,
      cheapMonth: mn[+ms[0][0]], dearMonth: mn[+ms[ms.length - 1][0]], buy, sell,
      deals4w: w.slice(-4).reduce((s, x) => s + x[2], 0) };
  }

  function allIn(side, price, qty) {
    const f = FEES[side], base = price * qty;
    const ex = base * f.exchange, cl = base * f.clearing, br = base * FEES.broker;
    const fees = ex + cl + br;
    return { base, ex, cl, br, fees, total: side === "buy" ? base + fees : base - fees, deposit: base * FEES.deposit,
      exPct: f.exchange, clPct: f.clearing, brPct: FEES.broker };
  }

  G.UZ = { FEES, parseIntent, findGood, findRegion, findSide, findQty, forecast, allIn, median, norm };
})(window);

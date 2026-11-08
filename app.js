/* UZEX 2035 app: views, Niyat flow, cabinet, prices, AI broker chat. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const view = $("#view");
  const CFG = window.UZEX_CONFIG || {};
  let M = null;              // market data
  let tab = "home";
  let priceGood = "cement", priceSide = "buy";
  const chat = [];           // {who:'bot'|'me', text, html}
  let pending = null;        // partial intent the broker is completing

  // ---------- helpers ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = n => Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ");
  const pct = (x, d = 1) => (x > 0 ? "+" : "") + (x * 100).toFixed(d).replace(".", ",") + "%";
  function money(n) {
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2).replace(".", ",") + " mlrd so'm";
    if (a >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",") + " mln so'm";
    return fmt(n) + " so'm";
  }
  const good = id => M.goods.find(g => g.id === id);
  const today = () => new Date().toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" });
  function toast(t, ms = 2600) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), ms); }
  function sheet(html) { $("#sheetBody").innerHTML = html; $("#sheet").hidden = false; $(".sheet-card").scrollTop = 0; }
  function closeSheet() { $("#sheet").hidden = true; }
  document.addEventListener("click", e => { if (e.target.closest("[data-close]")) closeSheet(); });

  // ---------- orders (localStorage) ----------
  const STEPS = [
    ["Buyurtma qabul qilindi", "Siz bir marta tasdiqladingiz"],
    ["Broker tekshirdi", "Hujjatlar va garov joyida"],
    ["Savdo sessiyasida", "Birjada mos taklif qidirilmoqda"],
    ["Bitim tuzildi", "Narx va hajm qayd etildi"],
    ["To'lov o'tdi", "Klirking markazi pulni qabul qildi"],
    ["Yetkazib berildi", "Tovar qabul qilindi, bitim yopildi"],
  ];
  // Practice mode (moomoo-style paper trading): same app, virtual money, separate orders.
  let practice = localStorage.getItem("uzex2035.practice") === "1";
  const KEY = () => practice ? "uzex2035.p.orders.v2" : "uzex2035.orders.v2";
  const PKEY = () => practice ? "uzex2035.p.props.v2" : "uzex2035.props.v2";
  const BKEY = () => practice ? "uzex2035.p.topup" : "uzex2035.topup";
  const START = () => practice ? 1e9 : 850e6;   // demo account / virtual money
  const BROKER = { name: "Aziz Rahimov", firm: "\"Birja Servis\" broker kontorasi", phone: "+998 71 200-00-00" };
  // ts: time each step was reached; fail: {at: step index, why: one sentence, next: what happens now}
  function times(daysAgo, n) { const t0 = Date.now() - daysAgo * 864e5; return Array.from({ length: n }, (_, i) => new Date(t0 + i * 37 * 6e4).toISOString()); }
  function seed() {
    if (practice) return [];
    const d = (k) => { const x = new Date(); x.setDate(x.getDate() - k); return x.toISOString().slice(0, 10); };
    return [
      { id: "UZX-35-0142", side: "buy", good: "cement", qty: 120, price: 968000, region: "Toshkent shahri", step: 3, date: d(1), ts: times(1, 4), counter: "\"Qizilqum sement\" AJ", deal: "№ 2611-0458213" },
      { id: "UZX-35-0139", side: "sell", good: "wheat", qty: 300, price: 4485000, region: "Sirdaryo viloyati", step: 2, date: d(0), ts: times(0.1, 3), counter: "-", deal: "-" },
      { id: "UZX-35-0131", side: "buy", good: "flour", qty: 80, price: 4150000, region: "Samarqand viloyati", step: -1, date: d(3), ts: times(3, 3), counter: "-", deal: "-",
        fail: { at: 2, why: "Sessiya yopildi: siz bergan eng yuqori narxda (4 150 000 so'm) sotuvchi chiqmadi.", next: "Pul yechilmadi, garov qaytdi. Bugungi narx bilan ertangi sessiyaga bir tugmada qayta yuborish mumkin." } },
      { id: "UZX-35-0127", side: "buy", good: "rebar", qty: 40, price: 12210000, region: "Andijon viloyati", step: 5, date: d(12), ts: times(12, 6), counter: "\"O'zmetkombinat\" AJ", deal: "№ 2610-0441877" },
      { id: "UZX-35-0118", side: "buy", good: "lpg", qty: 20, price: 8600000, region: "Buxoro viloyati", step: -1, date: d(20), ts: times(20, 6), counter: "\"Buxoro gaz savdo\" MChJ", deal: "№ 2610-0430056",
        fail: { at: 5, why: "Sotuvchi tovarni muddatida (10 kun) yetkazmadi.", next: "Garovingiz va to'lovingiz to'liq qaytarildi, sotuvchiga jarima qo'llandi." } },
    ];
  }
  function seedProps() {
    return practice ? [] : [{ id: "P-1", side: "buy", good: "cement", qty: 60, region: "Samarqand viloyati", lim: 1.01, status: "new",
      note: "Payshanba sessiyasida sement odatda biroz arzonroq. 60 tonnani shu narxdan qimmat bo'lmagan holda olishni taklif qilaman." }];
  }
  const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) || f(); } catch { return f(); } };
  let orders = load(KEY(), seed), props = load(PKEY(), seedProps);
  const save = () => { localStorage.setItem(KEY(), JSON.stringify(orders)); localStorage.setItem(PKEY(), JSON.stringify(props)); };
  const topup = () => +(localStorage.getItem(BKEY()) || 0);
  // Free funds = start + top-ups − money held for buy orders (deposit while waiting, full sum once paid) + money from finished sales.
  function freeFunds() {
    let f = START() + topup();
    for (const o of orders) {
      const a = UZ.allIn(o.side, o.price, o.qty);
      if (o.side === "buy" && o.step >= 0) f -= o.step >= 4 ? a.total : a.deposit;
      if (o.side === "sell" && o.step >= 5) f += a.total;
    }
    return f;
  }
  const hhmm = iso => { const d = new Date(iso); return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " + d.toTimeString().slice(0, 5); };

  function statusPill(o) {
    if (o.step < 0) return o.fail && o.fail.at <= 2 ? '<span class="pill red">Rad etildi</span>' : '<span class="pill red">Bekor qilindi</span>';
    if (o.step >= 5) return '<span class="pill">Yakunlandi</span>';
    if (o.step === 3) return '<span class="pill warn">To\'lov kutilmoqda</span>';
    return '<span class="pill blue">Jarayonda</span>';
  }

  // ---------- tabs ----------
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => go(b.dataset.tab)));
  function go(t) {
    tab = t;
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
    render(); window.scrollTo(0, 0);
  }
  function render() {
    if (!M) { view.innerHTML = '<div class="card">Yuklanmoqda...</div>'; return; }
    ({ home: renderHome, orders: renderOrders, prices: renderPrices, broker: renderBroker })[tab]();
  }

  // ---------- voice ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function listen(btn, onText) {
    if (!SR) { toast("Bu brauzerda ovoz yo'q. Yozib yuboring."); return; }
    const r = new SR(); r.lang = "uz-UZ"; r.interimResults = false; r.maxAlternatives = 1;
    btn.classList.add("rec"); toast("Gapiring...", 4000);
    r.onresult = e => onText(e.results[0][0].transcript);
    r.onerror = () => toast("Ovoz tushunilmadi. Qaytadan urinib ko'ring.");
    r.onend = () => btn.classList.remove("rec");
    r.start();
  }

  // ---------- HOME ----------
  function renderHome() {
    const active = orders.filter(o => o.step >= 0 && o.step < 5);
    const c = UZ.forecast(good("cement"));
    const mine = orders.filter(o => o.mine), newP = props.filter(p => p.status === "new");
    const coach = practice ? `<div class="card"><p class="kicker">Birinchi bitim: qadamma-qadam</p>
        <ol class="coach">
          <li class="${mine.length ? "ok" : ""}">Niyatni yozing yoki ayting (pastdagi tugmalardan birini bosing)</li>
          <li class="${mine.length ? "ok" : ""}">To'liq narxni va "Narx qanday hosil bo'ldi" kartasini ko'ring</li>
          <li class="${mine.length ? "ok" : ""}">✅ Tasdiqlang: bir marta</li>
          <li class="${mine.some(o => o.step >= 3) ? "ok" : ""}">Holatni kuzating: bitim tuzilguncha</li>
          <li class="${mine.some(o => o.step >= 4) ? "ok" : ""}">To'lovni tasdiqlang va hujjatni oching</li>
        </ol></div>` : "";
    view.innerHTML = `
      ${coach}
      <section class="card hero">
        <p class="kicker">${practice ? "Mashq · virtual pul" : "UZEX 2035 · Niyat"}</p>
        <h1>Nima qilmoqchisiz?</h1>
        <p class="mut">Oddiy so'z bilan yozing yoki 🎤 bosib ayting. Qolganini biz qilamiz.</p>
        <div class="niyat-box">
          <textarea id="niyat" rows="2" placeholder="Masalan: 50 tonna sement olmoqchiman, Samarqandga"></textarea>
          <button class="mic" id="hMic" aria-label="Ovoz bilan">🎤</button>
        </div>
        <button class="btn white" id="hGo">Narxini ko'rish →</button>
        <div class="chips">
          <button class="chip" data-ex="50 tonna sement olmoqchiman">🧱 50 t sement olish</button>
          <button class="chip" data-ex="200 tonna bug'doy sotmoqchiman">🌾 200 t bug'doy sotish</button>
          <button class="chip" data-ex="10 tonna suyultirilgan gaz kerak">🔥 10 t gaz olish</button>
        </div>
      </section>
      ${newP.map(propCard).join("")}
      <div class="card balance"><span><span class="sm mut">${practice ? "Virtual hisob (bo'sh pul)" : "Hisobingizda bo'sh pul"}</span><br><b class="big-num" style="font-size:1.3em">${money(freeFunds())}</b></span>
        <button class="btn ghost" id="hTop" style="width:auto;margin:0;min-height:50px">＋ To'ldirish</button></div>
      ${!practice ? `<div class="card"><p class="b">🎓 Birinchi marta? Avval mashq qiling</p><p class="sm mut">1 mlrd virtual so'm bilan haqiqiy birjadagidek xarid qilib ko'ring. Pul yechilmaydi.</p><button class="btn dark" id="hPractice">Mashqni boshlash</button></div>` : ""}
      ${active.length ? `<h2>Faol buyurtmalaringiz</h2>${active.slice(0, 2).map(orderCard).join("")}` : ""}
      <h2>Bugun bozorda</h2>
      <div class="card">
        <div class="row"><span>🧱 Sement, 1 tonna</span><span class="v b">${money(c.now)}</span></div>
        <div class="row"><span>4 haftalik prognoz</span><span class="v">${pct(c.chg)}</span></div>
        <div class="row"><span>Maslahat (olish)</span><span class="v b">${c.buy.h}</span></div>
        <button class="btn ghost" data-go="prices">Barcha narxlar va prognoz</button>
      </div>
      <div class="grid2">
        <button class="tile" data-go="broker"><span class="e">🤖</span><b>AI-broker</b><span class="sm mut">Savol bering, buyurtma tayyorlaydi</span></button>
        <button class="tile" data-go="orders"><span class="e">📄</span><b>Hujjatlarim</b><span class="sm mut">Shartnoma, to'lov, yetkazish</span></button>
      </div>
      <p class="note" style="margin-top:14px">🛡️ Pulingiz klirking markazida himoyalangan: sotuvchi tovarni bermaguncha pul unga o'tmaydi. Har bir narx va komissiya oldindan ko'rsatiladi.</p>
      <p class="sm mut" style="margin-top:12px">Demo: narxlar UZEX saralash bosqichi ma'lumotlaridan (2022-2026, sintetik). Haqiqiy savdo amalga oshirilmaydi.</p>`;
    const ta = $("#niyat");
    $("#hGo").onclick = () => startNiyat(ta.value);
    $("#hMic").onclick = e => listen(e.currentTarget, t => { ta.value = t; startNiyat(t); });
    view.querySelectorAll("[data-ex]").forEach(b => b.onclick = () => { ta.value = b.dataset.ex; startNiyat(b.dataset.ex); });
    $("#hTop").onclick = () => { localStorage.setItem(BKEY(), topup() + 500e6); toast("＋500 mln so'm hisobga tushdi (demo)"); render(); };
    const hp = $("#hPractice"); if (hp) hp.onclick = () => setPractice(true);
    bindCommon();
  }
  function bindCommon(root = view) {
    root.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { closeSheet(); go(b.dataset.go); });
    root.querySelectorAll("[data-order]").forEach(b => b.onclick = () => openOrder(b.dataset.order));
    root.querySelectorAll("[data-prop]").forEach(b => b.onclick = () => openProp(b.dataset.prop));
    root.querySelectorAll("[data-pok]").forEach(b => b.onclick = () => approveProp(b.dataset.pok));
    root.querySelectorAll("[data-pno]").forEach(b => b.onclick = () => rejectProp(b.dataset.pno));
  }

  // ---------- broker proposes, client approves ----------
  function propIt(p) { return { side: p.side, good: p.good, qty: p.qty, region: p.region }; }
  function propCard(p) {
    const { g, f } = quote(propIt(p)), lim = Math.round(f.now * p.lim), a = UZ.allIn(p.side, lim, p.qty);
    return `<div class="card proposal">
      <div class="who"><span class="av">👨‍💼</span><span><b>Brokeringizdan taklif</b><br><span class="sm mut">${BROKER.name} · ${BROKER.firm}</span></span></div>
      <p class="b">${p.side === "buy" ? "Sotib olish" : "Sotish"}: ${g.emoji} ${g.name}, ${p.qty} ${g.unit}</p>
      <p class="sm">${esc(p.note)}</p>
      <div class="row"><span>${p.side === "buy" ? "Eng yuqori" : "Eng past"} narx (1 ${g.unit})</span><span class="v b">${fmt(lim)} so'm</span></div>
      <div class="row"><span>Eng ko'pi bilan jami</span><span class="v">${money(a.total)}</span></div>
      <div class="btn2"><button class="btn no" data-pno="${p.id}">✕ Kerak emas</button><button class="btn" data-prop="${p.id}">Ko'rib chiqish</button></div>
      <p class="ai-note">Broker faqat taklif qiladi. Siz tasdiqlamaguningizcha hech narsa yuborilmaydi.</p></div>`;
  }
  function openProp(id) {
    const p = props.find(x => x.id === id); if (!p) return;
    niyatPrice(propIt(p), p);
  }
  function approveProp(id) {
    const p = props.find(x => x.id === id); if (!p || p.status !== "new") return;
    const { f } = quote(propIt(p));
    p.status = "ok"; placeOrder(propIt(p), f.now, { by: "broker", limit: Math.round(f.now * p.lim) });
    chat.push({ who: "human", text: "Rahmat! Tasdiqingizni oldim, buyurtmani keyingi sessiyaga yubordim. Har qadamni \"Buyurtmalar\"da ko'rasiz." });
    badge();
  }
  function rejectProp(id) {
    const p = props.find(x => x.id === id); if (!p) return;
    p.status = "no"; save(); closeSheet(); toast("Taklif rad etildi. Brokeringizga xabar berildi.");
    chat.push({ who: "human", text: "Tushunarli, taklifni bekor qildim. Boshqa narx yoki muddat kerak bo'lsa, shu yerga yozing." });
    badge(); render();
  }
  function requestProp() {
    // Demo: the human broker answers a request with a proposal a few seconds later.
    const last = [...chat].reverse().map(m => m.who === "me" ? UZ.parseIntent(m.text) : null).find(x => x && x.good);
    const it = Object.assign({ side: "sell", good: "wheat", qty: 100 }, last || {});
    it.side = it.side || "buy"; it.qty = it.qty || 50;
    chat.push({ who: "me", text: "Brokerim, menga taklif tayyorlab bering" });
    chat.push({ who: "human", text: "Assalomu alaykum! Ko'rib chiqyapman, bir necha daqiqada taklif yuboraman." });
    renderBroker();
    setTimeout(() => {
      const g = good(it.good), f = UZ.forecast(g), adv = it.side === "buy" ? f.buy : f.sell;
      const p = { id: "P-" + Date.now().toString(36), side: it.side, good: it.good, qty: it.qty, region: it.region || "Toshkent shahri",
        lim: it.side === "buy" ? 1.015 : 0.985, status: "new", note: `Bozorni ko'rdim: ${adv.h.toLowerCase()}. ${it.qty} ${g.unit} ${g.name.toLowerCase()}ni ${it.side === "buy" ? "olish" : "sotish"}ni taklif qilaman, narx chegarasi bilan.` };
      props.unshift(p); save();
      chat.push({ who: "human", prop: p.id, text: "Taklifim tayyor:" });
      toast("📨 Brokeringiz taklif yubordi"); badge();
      if (tab === "broker") renderBroker(); else if (tab === "home") render();
    }, 3500);
  }
  function badge() { const n = props.filter(p => p.status === "new").length, b = $("#bBadge"); b.textContent = n; b.hidden = !n; }

  // ---------- practice mode ----------
  function setPractice(on) {
    practice = on; localStorage.setItem("uzex2035.practice", on ? "1" : "0");
    orders = load(KEY(), seed); props = load(PKEY(), seedProps); chat.length = 0; pending = null;
    $("#practiceBar").hidden = !on; $("#btnPractice").classList.toggle("on", on);
    toast(on ? "🎓 Mashq rejimi: 1 mlrd virtual so'm. Bemalol sinab ko'ring!" : "Oddiy rejimga qaytdingiz");
    badge(); go("home");
  }

  // ---------- NIYAT flow ----------
  function startNiyat(text, preset) {
    const it = Object.assign(UZ.parseIntent(text || ""), preset || {});
    it.side = it.side || "buy"; it.good = it.good || "cement"; it.qty = it.qty || 10;
    it.region = it.region || "Toshkent shahri";
    niyatForm(it, text);
  }
  function niyatForm(it, text) {
    const g = good(it.good);
    const regions = ["Toshkent shahri", "Toshkent viloyati", "Samarqand viloyati", "Buxoro viloyati", "Andijon viloyati", "Farg'ona viloyati", "Namangan viloyati", "Qashqadaryo viloyati", "Surxondaryo viloyati", "Xorazm viloyati", "Navoiy viloyati", "Jizzax viloyati", "Sirdaryo viloyati", "Qoraqalpog'iston"];
    sheet(`
      <h1>Sizni to'g'ri tushundikmi?</h1>
      ${text ? `<p class="mut">«${esc(text)}»</p>` : ""}
      <div class="seg" id="side"><button data-v="buy" class="${it.side === "buy" ? "on" : ""}">Sotib olaman</button><button data-v="sell" class="${it.side === "sell" ? "on" : ""}">Sotaman</button></div>
      <div class="field"><span>Tovar</span><div class="goods" id="gSel">${M.goods.map(x => `<button data-v="${x.id}" class="${x.id === it.good ? "on" : ""}">${x.emoji} ${x.name}</button>`).join("")}</div></div>
      <label class="field"><span>Hajmi (${g.unit})</span><div class="stepper"><button id="qm">−</button><input id="qty" inputmode="decimal" value="${it.qty}"><button id="qp">+</button></div></label>
      <label class="field"><span>Qayerga / qayerdan</span><select id="reg">${regions.map(r => `<option ${r === it.region ? "selected" : ""}>${r}</option>`).join("")}</select></label>
      <button class="btn" id="nNext">To'liq narxni ko'rish →</button>`);
    let side = it.side, gid = it.good;
    $("#side").onclick = e => { const b = e.target.closest("button"); if (!b) return; side = b.dataset.v; $("#side").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); };
    $("#gSel").onclick = e => { const b = e.target.closest("button"); if (!b) return; gid = b.dataset.v; $("#gSel").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); };
    const q = $("#qty"), step = v => { const n = Math.max(1, (parseFloat(q.value.replace(",", ".")) || 0) + v); q.value = n; };
    $("#qm").onclick = () => step(-5); $("#qp").onclick = () => step(5);
    $("#nNext").onclick = () => niyatPrice({ side, good: gid, qty: Math.max(0.1, parseFloat(q.value.replace(",", ".")) || 1), region: $("#reg").value });
  }
  function quote(it) {
    const g = good(it.good), f = UZ.forecast(g);
    const limit = Math.round(f.now * (it.side === "buy" ? 1.02 : 0.98));
    return { g, f, limit, a: UZ.allIn(it.side, f.now, it.qty), aMax: UZ.allIn(it.side, limit, it.qty) };
  }
  function niyatPrice(it, prop) {
    let { g, f, limit, a, aMax } = quote(it);
    if (prop) { limit = Math.round(f.now * prop.lim); aMax = UZ.allIn(it.side, limit, it.qty); }
    const buy = it.side === "buy", adv = buy ? f.buy : f.sell;
    // Pre-trade check (Zerodha-style "required vs available"): deposit now, the full sum after the deal.
    const free = freeFunds(), needNow = buy ? aMax.deposit : a.deposit, needAll = buy ? aMax.total : a.deposit, okNow = free >= needNow;
    sheet(`
      ${prop ? `<p class="kicker">👨‍💼 Broker taklifi · ${BROKER.name}</p>` : it.byAI ? `<p class="kicker">🤖 AI tayyorladi · tasdiq sizda</p>` : ""}
      <h1>${buy ? "Siz to'laysiz" : "Siz olasiz"}</h1>
      <p class="mut">${g.emoji} ${g.name}, ${it.qty} ${g.unit} · ${esc(it.region)}</p>
      <div class="card">
        <div class="big-num">${money(a.total)}</div>
        <p class="sm mut">Hamma xarajat ichida. Yashirin to'lov yo'q.</p>
        <div class="row"><span>Tovar narxi<br><small class="mut">${fmt(f.now)} so'm × ${it.qty} ${g.unit}</small></span><span class="v">${money(a.base)}</span></div>
        <div class="row"><span>Birja yig'imi <small class="mut">(${(a.exPct * 100).toFixed(2)}%)</small></span><span class="v">${buy ? "+" : "−"}${money(a.ex)}</span></div>
        <div class="row"><span>Klirking <small class="mut">(${(a.clPct * 100).toFixed(2)}%)</small></span><span class="v">${buy ? "+" : "−"}${money(a.cl)}</span></div>
        <div class="row"><span>Broker xizmati <small class="mut">(${(a.brPct * 100).toFixed(2)}%, misol)</small></span><span class="v">${buy ? "+" : "−"}${money(a.br)}</span></div>
        <div class="row total"><span>Jami</span><span class="v">${money(a.total)}</span></div>
      </div>
      <div class="advice ${adv.k}"><div class="h">${adv.h}</div><p>${adv.t}</p><p class="sm">Prognoz: 4 haftada ${pct(f.chg)} · ishonch: ${f.conf}</p></div>
      <div class="card">
        <p class="b">Sizni himoya qiladigan shartlar</p>
        <div class="row"><span>${buy ? "Eng yuqori narx" : "Eng past narx"} (1 ${g.unit})</span><span class="v b">${fmt(limit)} so'm</span></div>
        <p class="sm mut">Bundan ${buy ? "qimmatga olinmaydi" : "arzonga sotilmaydi"}. Eng yomon holatda jami: ${money(aMax.total)}.</p>
        <div class="row"><span>Garov (qaytariladi)</span><span class="v">${money(a.deposit)}</span></div>
        <p class="sm mut">Garov bitim bajarilguncha klirking markazida turadi, keyin qaytadi yoki to'lovga qo'shiladi.</p>
      </div>
      <div class="card">
        <p class="b">Hisobingizni tekshirdik</p>
        <div class="row"><span>${practice ? "Virtual hisobda bo'sh" : "Hisobingizda bo'sh"}</span><span class="v">${money(free)}</span></div>
        <div class="row ${okNow ? "good" : "bad"}"><span>Hozir kerak (garov)</span><span class="v">${money(needNow)} ${okNow ? "✓" : "✕"}</span></div>
        ${buy ? `<div class="row ${free >= needAll ? "good" : ""}"><span>Bitimdan keyin to'lanadi</span><span class="v">${money(needAll)}${free >= needAll ? " ✓" : ""}</span></div>` : ""}
        ${okNow ? (buy && free < needAll ? `<p class="sm" style="color:var(--warn)">Garov yetadi. To'lov kunigacha hisobni yana ${money(needAll - free)} ga to'ldiring.</p>` : "") :
          `<p class="sm" style="color:var(--red);font-weight:700">Garov uchun ${money(needNow - free)} yetmaydi. Hisobni to'ldiring yoki hajmni kamaytiring.</p><button class="btn ghost" id="nTop">＋ Hisobni to'ldirish (demo)</button>`}
      </div>
      ${formedCard(g, f)}
      ${prop ? `<div class="btn2"><button class="btn no" id="nNo">✕ Rad etaman</button><button class="btn" id="nOk" ${okNow ? "" : "disabled"}>✅ Roziman</button></div>`
        : `<button class="btn" id="nOk" ${okNow ? "" : "disabled"}>✅ Tasdiqlayman</button><button class="btn ghost" id="nBack">← O'zgartirish</button>`}
      <p class="sm mut" style="text-align:center">${practice ? "Mashq: pul yechilmaydi, hammasi xuddi haqiqiydek ishlaydi." : "Bir marta tasdiqlaysiz. Brokeringiz va AI qolganini bajaradi, har qadamni shu yerda ko'rasiz."}</p>`);
    const nb = $("#nBack"); if (nb) nb.onclick = () => niyatForm(it);
    const nt = $("#nTop"); if (nt) nt.onclick = () => { localStorage.setItem(BKEY(), topup() + Math.ceil((needAll - free) / 1e7) * 1e7 + 1e7); toast("Hisob to'ldirildi (demo)"); niyatPrice(it, prop); };
    const nn = $("#nNo"); if (nn) nn.onclick = () => rejectProp(prop.id);
    $("#nOk").onclick = () => prop ? approveProp(prop.id) : placeOrder(it, f.now, { by: it.byAI ? "ai" : "me", limit });
  }
  // LME-style "how this price was formed": window, deal count, volume, method, publication time, physical goods.
  function formedCard(g, f) {
    const w = g.weeks.slice(-4), deals = w.reduce((s, x) => s + x[2], 0), vol = w.reduce((s, x) => s + x[3], 0);
    const mx = Math.max(...w.map(x => x[1])), mn = Math.min(...w.map(x => x[1]));
    const top = g.regions.slice().sort((a, b) => b[2] - a[2])[0];
    const end = new Date(w[3][0]); end.setDate(end.getDate() + 6);
    const d = s => new Date(s).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    return `<div class="card formed"><p class="kicker">Ochiq narx · tekshirsa bo'ladi</p><p class="b">Narx qanday hosil bo'ldi?</p>
      <div class="wk">${w.map((x, i) => `<div class="${i === 3 ? "last" : ""}" style="height:${30 + 70 * (x[1] - mn) / ((mx - mn) || 1)}%"><span>${x[1] >= 1e6 ? (x[1] / 1e6).toFixed(2).replace(".", ",") + " mln" : Math.round(x[1] / 1e3) + " ming"}</span></div>`).join("")}</div>
      <div class="wl">${w.map(x => `<span>${d(x[0])}<br>${x[2]} bitim</span>`).join("")}</div>
      <div class="row"><span>Davr</span><span class="v">${d(w[0][0])} – ${d(end)}</span></div>
      <div class="row"><span>Bitimlar soni</span><span class="v">${fmt(deals)} ta</span></div>
      <div class="row"><span>Sotilgan hajm</span><span class="v">${fmt(vol)} ${g.unit}</span></div>
      <div class="row"><span>Usul</span><span class="v">o'rtacha (mediana)</span></div>
      <div class="row"><span>Natija, 1 ${g.unit}</span><span class="v b">${fmt(f.now)} so'm</span></div>
      <ul class="why sm">
        <li>Har bir haqiqiy bitim narxi olindi, eng o'rtadagisi tanlandi: bitta juda qimmat yoki arzon bitim narxni buzmaydi.</li>
        <li>Bekor qilingan bitimlar (${(g.annul * 100).toFixed(1).replace(".", ",")}%) hisobga olinmadi.</li>
        <li>Narx haqiqiy yetkazilgan tovardan: eng ko'p savdo ${top ? esc(top[0]) : "—"} bo'yicha.</li>
        <li>Har dushanba yangilanadi. Yig'imlar UZEX tarifi bo'yicha (2026-10-01 dan).</li>
      </ul></div>`;
  }
  function placeOrder(it, price, meta = {}) {
    const n = 143 + orders.filter(o => o.mine).length;
    const o = { id: (practice ? "MASHQ-" : "UZX-35-0") + n, side: it.side, good: it.good, qty: it.qty, price: Math.round(price), region: it.region, step: 0,
      date: new Date().toISOString().slice(0, 10), ts: [new Date().toISOString()], counter: "-", deal: "-", mine: true, by: meta.by || "me", limit: meta.limit };
    orders.unshift(o); save(); closeSheet();
    toast("✅ Buyurtma qabul qilindi: " + o.id);
    go("orders"); openOrder(o.id);
    simulate(o.id);
  }
  function simulate(id) {
    const tick = () => {
      const o = orders.find(x => x.id === id); if (!o || o.step >= 3 || o.step < 0) return;
      o.step++; (o.ts = o.ts || [])[o.step] = new Date().toISOString(); if (o.step === 3) { o.counter = o.side === "buy" ? "\"Demo Sotuvchi\" MChJ" : "\"Demo Xaridor\" MChJ"; o.deal = "№ 2611-04" + (60000 + Math.floor(Math.random() * 9999)); }
      save(); toast((o.step === 3 ? "🤝 " : "⏳ ") + o.id + ": " + STEPS[o.step][0]);
      if (!$("#sheet").hidden && $("#oid") && $("#oid").dataset.id === id) openOrder(id);
      if (tab === "orders" || tab === "home") render();
      if (o.step < 3) setTimeout(tick, 6000);
    };
    setTimeout(tick, 5000);
  }

  // ---------- ORDERS / cabinet ----------
  function orderCard(o) {
    const g = good(o.good), p = o.step < 0 ? 100 : Math.round((o.step + 1) / STEPS.length * 100);
    return `<button class="order" data-order="${o.id}">
      <div class="t"><b>${g.emoji} ${g.name}, ${o.qty} ${g.unit}</b>${statusPill(o)}</div>
      <div class="sm mut">${o.side === "buy" ? "Sotib olish" : "Sotish"} · ${o.id} · ${o.date}</div>
      <div class="sm ${o.fail ? "why" : ""}">${o.fail ? "Sabab: " + esc(o.fail.why) : STEPS[Math.min(o.step, 5)][0]}</div>
      <div class="bar"><i style="width:${p}%;${o.step < 0 ? "background:#c9a19d" : ""}"></i></div></button>`;
  }
  function renderOrders() {
    const act = orders.filter(o => o.step >= 0 && o.step < 5), done = orders.filter(o => o.step >= 5 || o.step < 0);
    view.innerHTML = `
      <h1>Buyurtmalarim${practice ? ' <span class="pill ink">MASHQ</span>' : ""}</h1>
      <p class="mut">Hamma narsa shu yerda: holat, pul, hujjatlar. Brokerga qo'ng'iroq qilish shart emas.</p>
      <button class="btn" data-go="home">＋ Yangi buyurtma</button>
      <h2>Jarayonda (${act.length})</h2>${act.map(orderCard).join("") || '<p class="mut">Hozircha yo\'q.</p>'}
      <h2>Tarix</h2>${done.map(orderCard).join("")}
      <button class="btn ghost" id="reset">Demoni qaytadan boshlash</button>`;
    $("#reset").onclick = () => { orders = seed(); props = seedProps(); localStorage.removeItem(BKEY()); chat.length = 0; save(); badge(); render(); toast("Demo tiklandi"); };
    bindCommon();
  }
  function docsFor(o) {
    return [
      ["📝", "Topshiriq (buyurtma)", 0], ["📑", "Birja bitimi shartnomasi", 3], ["🏦", "Klirking hisoboti (to'lov)", 4],
      ["🧾", "Hisob-faktura", 5], ["🚚", "Yuk xati (yetkazish)", 5],
    ].map(([e, t, s], i) => ({ e, t, i, ok: o.fail ? s < o.fail.at : o.step >= s }));
  }
  function openOrder(id) {
    const o = orders.find(x => x.id === id); if (!o) return;
    const g = good(o.good), a = UZ.allIn(o.side, o.price, o.qty);
    sheet(`
      <span id="oid" data-id="${o.id}"></span>
      <h1>${g.emoji} ${g.name}, ${o.qty} ${g.unit}</h1>
      <p>${statusPill(o)} <span class="mut sm">${o.id} · ${o.date}</span></p>
      ${o.fail ? `<div class="reason"><div class="h">${o.fail.at <= 2 ? "Buyurtma bajarilmadi" : "Bitim bekor qilindi"}</div><p><b>Sabab:</b> ${esc(o.fail.why)}</p><p><b>Endi:</b> ${esc(o.fail.next)}</p></div>
        ${o.fail.at <= 2 ? `<button class="btn" id="retry">↻ Bugungi narx bilan qayta yuborish</button>` : ""}` : ""}
      ${o.by === "broker" ? `<p class="sm mut">👨‍💼 Broker ${BROKER.name} taklif qildi, siz tasdiqladingiz.</p>` : o.by === "ai" ? `<p class="sm mut">🤖 AI-broker tayyorladi, siz tasdiqladingiz.</p>` : ""}
      <div class="card"><ol class="steps">${STEPS.map(([t, s], i) => {
        const ts = o.ts && o.ts[i];
        let cls = i < o.step || (o.step === 5 && i === 5) ? "done" : i === o.step ? "now" : "";
        if (o.fail) cls = i < o.fail.at ? "done" : i === o.fail.at ? "fail" : "skip";
        const sub = cls === "fail" ? "✕ " + esc(o.fail.why) : s;
        return `<li class="${cls}"><span class="dot">${cls === "done" ? "✓" : cls === "fail" ? "✕" : ""}</span>${t}${ts && cls !== "skip" && cls !== "" ? `<span class="tm">${hhmm(ts)}</span>` : ""}<small>${sub}</small></li>`;
      }).join("")}</ol>
      ${!o.fail && o.step < 5 ? `<p class="sm mut">Har qadamda sizga xabar keladi. Sahifani yangilash shart emas.</p>` : ""}</div>
      ${o.step === 3 ? `<button class="btn" id="pay">💳 To'lovni tasdiqlash (${money(a.total)})</button>` : ""}
      <div class="card">
        <div class="row"><span>${o.side === "buy" ? "Sotuvchi" : "Xaridor"}</span><span class="v">${esc(o.counter)}</span></div>
        <div class="row"><span>Bitim raqami</span><span class="v">${esc(o.deal)}</span></div>
        <div class="row"><span>Narx (1 ${g.unit})</span><span class="v">${fmt(o.price)} so'm</span></div>
        <div class="row"><span>Yig'imlar (birja+klirking+broker)</span><span class="v">${money(a.fees)}</span></div>
        <div class="row total"><span>${o.side === "buy" ? "Jami to'lov" : "Sizga tushadi"}</span><span class="v">${money(a.total)}</span></div>
      </div>
      <h2>Hujjatlar</h2>
      ${docsFor(o).map(d => `<button class="doc ${d.ok ? "" : "off"}" data-doc="${d.i}" ${d.ok ? "" : "disabled"}><span class="e">${d.e}</span><span><b>${d.t}</b><br><small class="mut">${d.ok ? "Ochish" : "Bitim shu bosqichga yetganda tayyor bo'ladi"}</small></span></button>`).join("")}
      <button class="btn ghost" id="askB">🤖 Shu buyurtma bo'yicha AI-brokerdan so'rash</button>`);
    const pay = $("#pay");
    if (pay) pay.onclick = () => { if (freeFunds() + a.deposit < a.total) { toast("Hisobda pul yetmaydi. Asosiy sahifada hisobni to'ldiring."); return; }
      o.step = 4; (o.ts = o.ts || [])[4] = new Date().toISOString(); save(); toast("💳 To'lov klirking markaziga o'tdi"); openOrder(id); render();
      setTimeout(() => { o.step = 5; o.ts[5] = new Date().toISOString(); save(); toast("🚚 " + o.id + ": yetkazib berildi"); if ($("#oid") && $("#oid").dataset.id === id) openOrder(id); render(); }, 7000); };
    document.querySelectorAll("[data-doc]").forEach(b => b.onclick = () => openDoc(o, +b.dataset.doc));
    const rt = $("#retry"); if (rt) rt.onclick = () => niyatPrice({ side: o.side, good: o.good, qty: o.qty, region: o.region });
    $("#askB").onclick = () => { closeSheet(); go("broker"); brokerSay(o.id + " buyurtmam qanday holatda?"); };
  }
  function openDoc(o, i) {
    const g = good(o.good), a = UZ.allIn(o.side, o.price, o.qty), t = docsFor(o)[i].t;
    const buyer = o.side === "buy" ? "Siz (\"Mening korxonam\" MChJ)" : o.counter, seller = o.side === "sell" ? "Siz (\"Mening korxonam\" MChJ)" : o.counter;
    sheet(`<div class="paper">
      <h3>${t}</h3><p class="c">O'zbekiston Respublikasi tovar-xom ashyo birjasi · ${o.deal !== "-" ? o.deal : o.id}</p>
      <table>
        <tr><td>Sana</td><td>${o.date}</td></tr><tr><td>Sotuvchi</td><td>${esc(seller)}</td></tr><tr><td>Xaridor</td><td>${esc(buyer)}</td></tr>
        <tr><td>Tovar</td><td>${g.name}</td></tr><tr><td>Hajmi</td><td>${o.qty} ${g.unit}</td></tr>
        <tr><td>Narx</td><td>${fmt(o.price)} so'm / ${g.unit}</td></tr><tr><td>Summa</td><td>${fmt(a.base)} so'm</td></tr>
        <tr><td>Birja yig'imi</td><td>${fmt(a.ex)} so'm</td></tr><tr><td>Klirking</td><td>${fmt(a.cl)} so'm</td></tr>
        <tr><td>Yetkazish manzili</td><td>${esc(o.region)}</td></tr>
      </table>
      <span class="stamp">DEMO · UZEX 2035</span>
      <p class="sm mut">Namuna hujjat. Haqiqiy versiyada elektron raqamli imzo bilan.</p></div>
      <button class="btn" onclick="window.print()">🖨️ Chop etish / saqlash</button>
      <button class="btn ghost" id="dBack">← Buyurtmaga qaytish</button>`);
    $("#dBack").onclick = () => openOrder(o.id);
  }

  // ---------- PRICES / forecast ----------
  function chartSVG(g, f) {
    const hist = g.weeks.slice(-26).map(w => w[1]);
    const all = hist.concat(f.pts.map(p => p.hi), f.pts.map(p => p.lo));
    const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.12 || 1;
    const W = 340, H = 200, n = hist.length + f.pts.length;
    const x = i => 8 + i * (W - 16) / (n - 1), y = v => H - 22 - (v - (lo - pad)) * (H - 40) / (hi - lo + 2 * pad);
    const hp = hist.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const s = hist.length - 1;
    const fp = [`${x(s)},${y(hist[s])}`].concat(f.pts.map((p, k) => `${x(s + k + 1).toFixed(1)},${y(p.p).toFixed(1)}`)).join(" ");
    const band = [`${x(s)},${y(hist[s])}`].concat(f.pts.map((p, k) => `${x(s + k + 1)},${y(p.hi)}`)).concat(f.pts.map((p, k) => `${x(s + k + 1)},${y(p.lo)}`).reverse()).join(" ");
    const col = f.chg > 0.01 ? "#b26a00" : f.chg < -0.01 ? "#12804f" : "#1d5fae";
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Narx grafigi">
      <line x1="${x(s)}" y1="10" x2="${x(s)}" y2="${H - 22}" stroke="#cfd8d3" stroke-dasharray="3 3"/>
      <polygon points="${band}" fill="${col}" opacity=".13"/>
      <polyline points="${hp}" fill="none" stroke="#0b5d3b" stroke-width="3" stroke-linejoin="round"/>
      <polyline points="${fp}" fill="none" stroke="${col}" stroke-width="3" stroke-dasharray="6 5"/>
      <text x="8" y="${H - 4}" font-size="12" fill="#5b6b62">6 oy oldin</text>
      <text x="${x(s) - 4}" y="${H - 4}" font-size="12" fill="#5b6b62" text-anchor="end">bugun</text>
      <text x="${W - 8}" y="${H - 4}" font-size="12" fill="${col}" text-anchor="end">prognoz</text>
      <text x="8" y="16" font-size="12" fill="#5b6b62">${money(hi)}</text>
      <text x="8" y="${H - 28}" font-size="12" fill="#5b6b62">${money(lo)}</text></svg>`;
  }
  function renderPrices() {
    const g = good(priceGood), f = UZ.forecast(g), adv = priceSide === "buy" ? f.buy : f.sell;
    const w4 = g.weeks[g.weeks.length - 5][1];
    view.innerHTML = `
      <h1>Narxlar va AI-prognoz</h1>
      <div class="goods" id="pg">${M.goods.map(x => `<button data-v="${x.id}" class="${x.id === g.id ? "on" : ""}">${x.emoji} ${x.name}</button>`).join("")}</div>
      <div class="card">
        <p class="mut sm">${g.name}, 1 ${g.unit} (oxirgi 4 hafta mediana)</p>
        <div class="big-num">${money(f.now)}</div>
        <p class="sm">Bir oyda: <b>${pct((g.weeks[g.weeks.length - 1][1] - w4) / w4)}</b>${f.yearAgo ? ` · Bir yilda: <b>${pct((f.now - f.yearAgo) / f.yearAgo)}</b>` : ""}</p>
        ${chartSVG(g, f)}
      </div>
      ${formedCard(g, f)}
      <div class="seg" id="ps"><button data-v="buy" class="${priceSide === "buy" ? "on" : ""}">Men olaman</button><button data-v="sell" class="${priceSide === "sell" ? "on" : ""}">Men sotaman</button></div>
      <div class="advice ${adv.k}"><div class="h">${adv.k === "buy" ? "✅ " : adv.k === "wait" ? "⏳ " : "➖ "}${adv.h}</div><p>${adv.t}</p>
        <p class="sm">4 haftadan keyin taxminan: <b>${money(f.pts[3].p)}</b> (${money(f.pts[3].lo)} – ${money(f.pts[3].hi)}) · ishonch: ${f.conf}</p></div>
      <div class="card"><p class="b">Nega shunday deymiz? (oddiy tilda)</p><ul class="why">
        <li>Oxirgi 12 haftada narx haftasiga o'rtacha <b>${pct(f.weekly, 2)}</b> o'zgargan.</li>
        <li>Mavsum ta'siri: keyingi 4 haftada bu tovar narxi odatda <b>${pct(f.seasonChg)}</b> o'zgaradi (2022-2026 tarixi).</li>
        <li>Prognoz = so'nggi tendensiya + mavsum: jami <b>${pct(f.chg)}</b>.</li>
        <li>Odatda eng arzon oy: <b>${f.cheapMonth}</b>, eng qimmat oy: <b>${f.dearMonth}</b> (2022-2026 tarixi).</li>
        ${f.cheapDay && Math.abs(f.cheapDay.diff) > 0.001 ? `<li>Hafta kunlari ichida eng arzoni odatda <b>${f.cheapDay.day}</b> (${pct(f.cheapDay.diff)}), eng qimmati <b>${f.dearDay.day}</b> (${pct(f.dearDay.diff)}).</li>` : ""}
        <li>Narx tebranishi: ${f.vol < 0.01 ? "kichik" : f.vol < 0.025 ? "o'rtacha" : "katta"}, shuning uchun prognozga ishonch <b>${f.conf}</b>.</li>
        <li>So'nggi 4 haftada ${fmt(f.deals4w)} ta bitim; bekor qilinganlar hisobga olinmagan.</li></ul>
        <p class="sm mut">Prognoz kafolat emas: bu tarixiy bitimlardan hisoblangan taxmin.</p></div>
      ${g.regions.length ? `<div class="card"><p class="b">Qayerda arzonroq? (oxirgi 12 oy)</p>${g.regions.slice(0, 3).map(r => `<div class="row"><span>${r[0]}</span><span class="v">${money(r[1])}</span></div>`).join("")}</div>` : ""}
      <button class="btn" id="pOrder">${priceSide === "buy" ? "Shu narxda sotib olish" : "Shu narxda sotish"} →</button>
      <button class="btn ghost" id="pAsk">🤖 AI-brokerdan maslahat so'rash</button>`;
    $("#pg").onclick = e => { const b = e.target.closest("button"); if (b) { priceGood = b.dataset.v; renderPrices(); } };
    $("#ps").onclick = e => { const b = e.target.closest("button"); if (b) { priceSide = b.dataset.v; renderPrices(); } };
    $("#pOrder").onclick = () => startNiyat("", { side: priceSide, good: g.id });
    $("#pAsk").onclick = () => { go("broker"); brokerSay(g.name + " qachon " + (priceSide === "buy" ? "sotib olgan" : "sotgan") + " ma'qul?"); };
  }

  // ---------- AI BROKER ----------
  function renderBroker() {
    if (!chat.length) chat.push({ who: "bot", text: "Assalomu alaykum! Men sizning AI-brokeringizman.\nNarx aytaman, qachon olish yoki sotish foydaliligini tushuntiraman, buyurtmangizni tayyorlab beraman. Oxirgi qarorni doim o'zingiz qilasiz.\n\nNima qilamiz?" });
    view.innerHTML = `<div class="broker-pad"><div class="chat" id="chat">${chat.map(msgHTML).join("")}</div>
      <div class="chips"><button class="chip" id="askBroker" style="border-color:var(--blue);font-weight:700">👨‍💼 Brokerimdan taklif so'rash</button></div>
      <div class="chips" id="sug">${["Sement narxi qancha?", "Bug'doy qachon sotgan ma'qul?", "30 tonna armatura olmoqchiman", "Buyurtmalarim qanday?", "Komissiya qancha?", "Pulim xavfsizmi?"].map(s => `<button class="chip">${s}</button>`).join("")}</div></div>
      <form class="composer" id="cf"><button type="button" class="mic" id="cMic" aria-label="Ovoz">🎤</button><input id="ci" placeholder="Savolingizni yozing..." autocomplete="off"><button aria-label="Yuborish">➤</button></form>`;
    $("#cf").onsubmit = e => { e.preventDefault(); const v = $("#ci").value.trim(); if (v) { $("#ci").value = ""; brokerSay(v); } };
    $("#cMic").onclick = e => listen(e.currentTarget, t => brokerSay(t));
    $("#askBroker").onclick = requestProp;
    $("#sug").onclick = e => { const b = e.target.closest(".chip"); if (b) brokerSay(b.textContent); };
    bindChat(); scrollChat();
  }
  function msgHTML(m) {
    const from = m.who === "human" ? `<span class="from">👨‍💼 Brokeringiz · ${BROKER.name}</span>` : m.who === "bot" ? `<span class="from">🤖 AI-broker</span>` : "";
    const p = m.prop && props.find(x => x.id === m.prop);
    const body = (m.html || esc(m.text)) + (p ? (p.status === "new" ? propCard(p) : `<p class="sm b">${p.status === "ok" ? "✅ Siz tasdiqladingiz" : "✕ Siz rad etdingiz"}</p>`) : "");
    return `<div class="msg ${m.who}">${from}${body}</div>`;
  }
  function scrollChat() { setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 30); }
  function bindChat() {
    view.querySelectorAll("[data-prep]").forEach(b => b.onclick = () => niyatPrice(Object.assign(JSON.parse(b.dataset.prep), { byAI: true })));
    bindCommon();
  }
  async function brokerSay(text) {
    chat.push({ who: "me", text });
    if (tab !== "broker") { go("broker"); } else renderBroker();
    const box = $("#chat"); box.insertAdjacentHTML("beforeend", '<div class="msg bot typing" id="typ">Yozmoqda...</div>'); scrollChat();
    let reply = null;
    if (CFG.CHAT_API) {
      try {
        const r = await fetch(CFG.CHAT_API, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: chat.slice(-10).map(m => ({ role: m.who === "me" ? "user" : "assistant", content: m.text || "" })), context: marketContext() }) });
        if (r.ok) {
          const j = await r.json();
          if (j.reply) {
            const it = j.intent;
            reply = { who: "bot", text: j.reply, html: it && it.good && it.side && it.qty && good(it.good) ? esc(j.reply) + prepCard(it) : undefined };
          }
        }
      } catch (e) { /* fall back to the local engine */ }
    }
    if (!reply) { await new Promise(r => setTimeout(r, 450)); reply = localBroker(text); }
    chat.push(reply);
    if (tab === "broker") renderBroker();
  }
  function marketContext() {
    return M.goods.map(g => { const f = UZ.forecast(g); return `${g.name}: ${fmt(f.now)} so'm/${g.unit}, 4 hafta prognoz ${pct(f.chg)}, ishonch ${f.conf}`; }).join("\n") +
      "\nBuyurtmalar: " + orders.map(o => `${o.id} ${good(o.good).name} ${o.qty} ${o.fail ? "bajarilmadi: " + o.fail.why : STEPS[Math.min(o.step, 5)][0]}`).join("; ");
  }
  function prepCard(it) {
    const { g, f, a } = quote(it);
    return `<div class="card"><b>${it.side === "buy" ? "Sotib olish" : "Sotish"}: ${g.emoji} ${g.name}, ${it.qty} ${g.unit}</b>
      <div class="row"><span>Narx (1 ${g.unit})</span><span class="v">${fmt(f.now)} so'm</span></div>
      <div class="row"><span>Yig'imlar</span><span class="v">${money(a.fees)}</span></div>
      <div class="row total"><span>Jami</span><span class="v">${money(a.total)}</span></div>
      <button class="btn" data-prep='${esc(JSON.stringify(it))}'>Ko'rib chiqish va tasdiqlash</button>
      <p class="ai-note">🤖 AI tayyorladi. Bu maslahat, buyruq emas: siz tasdiqlamaguningizcha hech narsa yuborilmaydi.</p></div>`;
  }
  function localBroker(text) {
    const t = UZ.norm(text), it = UZ.parseIntent(text);
    // continue a pending order: user answered with a number or a good
    if (pending) {
      if (!it.qty && !it.good && /(yo'q|kerak emas|bekor|отмена)/.test(t)) { pending = null; return { who: "bot", text: "Mayli, bekor qildim. Yana nima yordam kerak?" }; }
      const p = Object.assign({}, pending, Object.fromEntries(Object.entries(it).filter(([k, v]) => v && k !== "raw")));
      if (p.side && p.good && p.qty) { pending = null; return orderReply(p); }
      if (p.side && p.good && !p.qty) { pending = p; return { who: "bot", text: `${good(p.good).name}: qancha ${good(p.good).unit}?` }; }
    }
    if (/^ *(salom|assalom|привет|hello|hi)\b/.test(t)) return { who: "bot", text: "Va alaykum assalom! Qaysi tovar bilan ishlaysiz? Narx, prognoz yoki buyurtma: qaysi biri kerak?" };
    const idm = text.match(/UZX-35-\d+/i);
    if (idm || /(buyurtma|holat|qayerda|status|заказ|yetib|keldimi)/.test(t) && !(it.side && it.good)) {
      const list = idm ? orders.filter(o => o.id.toLowerCase() === idm[0].toLowerCase()) : orders.filter(o => o.step >= 0 && o.step < 5);
      if (!list.length) return { who: "bot", text: "Faol buyurtmangiz yo'q. Yangi buyurtma tayyorlaymi?" };
      return { who: "bot", html: esc("Buyurtmalaringiz holati:") + list.map(o => {
        const g = good(o.good), nxt = o.fail ? "Sabab: " + o.fail.why + " " + o.fail.next : o.step === 3 ? "Bitim tuzildi. Endi to'lovni tasdiqlashingiz kerak." : o.step === 2 ? "Birjada mos taklif qidirilmoqda. Bitim tuzilsa darhol xabar beraman." : o.step >= 5 ? "Yakunlandi, hujjatlar tayyor." : "Broker tekshiruvida.";
        return `<div class="card"><b>${g.emoji} ${g.name}, ${o.qty} ${g.unit}</b> ${statusPill(o)}<p class="sm">${esc(nxt)}</p><button class="btn ghost" data-order="${o.id}">Batafsil va hujjatlar</button></div>`;
      }).join("") };
    }
    if (/(komissiya|yig'im|xarajat|to'lov qancha|комисс|сбор|fee|qancha to'layman)/.test(t)) {
      return { who: "bot", text: "Hamma xarajat oldindan ko'rinadi:\n• Birja yig'imi: xaridor 0,13%, sotuvchi 0,05%\n• Klirking: har tomon 0,05%\n• Broker xizmati: kelishuv bo'yicha (ilovada misol 0,10%)\n• Garov: ~3%, bitimdan keyin qaytadi\n\nMasalan, 100 mln so'mlik xaridda yig'imlar taxminan 280 ming so'm bo'ladi." };
    }
    if (/(xavfsiz|ishon|aldan|garov|kafolat|риск|xavf|pulim)/.test(t)) {
      return { who: "bot", text: "Pulingiz himoyalangan:\n• Pul to'g'ridan-to'g'ri sotuvchiga emas, klirking markaziga tushadi.\n• Sotuvchi tovarni bermasa, bitim bekor bo'ladi va garovingiz qaytadi, sotuvchi jarima to'laydi.\n• Siz belgilagan eng yuqori narxdan qimmatga olinmaydi.\n• Har qadam va har hujjat \"Buyurtmalar\" bo'limida ko'rinadi." };
    }
    if (/(hujjat|shartnoma|faktura|документ|yuk xati)/.test(t)) {
      return { who: "bot", html: esc("Hujjatlar har bir buyurtma ichida: topshiriq, birja shartnomasi, klirking hisoboti, hisob-faktura, yuk xati. Bosqichga yetganda o'zi paydo bo'ladi.") + '<button class="btn ghost" data-go="orders">Buyurtmalarni ochish</button>' };
    }
    if (/(sessiya|savdo vaqti|qachon ochiladi|сесси)/.test(t)) {
      return { who: "bot", text: "Hozir birjada savdo sessiyalar bo'yicha o'tadi (har bo'limda taxminan 20 daqiqalik oynalar). Siz buyurtmani istalgan vaqtda berasiz: men uni navbatga qo'yaman va keyingi sessiyada brokeringiz orqali yuboraman. Sessiya oxiridagi shoshilinch navbat sizni qiynamaydi." };
    }
    if (it.good && (/(qachon|prognoz|oshadi|tushadi|arzonlash|qimmatlash|ma'qul|kutay|прогноз|когда)/.test(t))) {
      const g = good(it.good), f = UZ.forecast(g), side = it.side || (/sot/.test(t) && !/sotib ol/.test(t) ? "sell" : "buy"), adv = side === "buy" ? f.buy : f.sell;
      return { who: "bot", html: esc(`${g.name}: hozir ${fmt(f.now)} so'm/${g.unit}.\n4 haftalik prognoz: ${pct(f.chg)} (ishonch ${f.conf}).\n\n${adv.h}. ${adv.t}\n\nOdatda eng arzon oy ${f.cheapMonth}, eng qimmat oy ${f.dearMonth}.${f.cheapDay ? ` Hafta ichida eng arzon kun odatda ${f.cheapDay.day}.` : ""}`) +
        `<button class="btn ghost" data-go="prices">Grafikni ko'rish</button>` };
    }
    if (it.side && it.good) {
      if (!it.qty) { pending = it; return { who: "bot", text: `Yaxshi, ${good(it.good).name} ${it.side === "buy" ? "sotib olamiz" : "sotamiz"}. Qancha ${good(it.good).unit}?` }; }
      return orderReply(it);
    }
    if (it.good) {
      const g = good(it.good), f = UZ.forecast(g);
      return { who: "bot", text: `${g.emoji} ${g.name}: oxirgi 4 haftada 1 ${g.unit} o'rtacha ${fmt(f.now)} so'm.\nPrognoz (4 hafta): ${pct(f.chg)}.\n\nSotib olasizmi yoki sotasizmi? Masalan: "20 tonna ${g.name.toLowerCase()} olmoqchiman".` };
    }
    if (it.side && !it.good) { pending = { side: it.side, qty: it.qty }; return { who: "bot", text: "Qaysi tovar? Masalan: sement, bug'doy, un, gaz, armatura, shakar, yog', guruch." }; }
    return { who: "bot", text: "Tushunmadim, lekin yordam beraman. Shunday yozib ko'ring:\n• \"Sement narxi qancha?\"\n• \"50 tonna un olmoqchiman\"\n• \"Bug'doy qachon sotgan ma'qul?\"\n• \"Buyurtmam qayerda?\"" };
  }
  function orderReply(it) {
    it.region = it.region || "Toshkent shahri";
    const g = good(it.good), f = UZ.forecast(g), adv = it.side === "buy" ? f.buy : f.sell;
    return { who: "bot", html: esc(`Buyurtmani tayyorladim. Maslahatim: ${adv.h.toLowerCase()}. ${adv.t}\nTasdiqlashdan oldin hammasini ko'rib chiqing:`) + prepCard(it) };
  }

  // ---------- font size, boot ----------
  if (localStorage.getItem("uzex2035.big") === "1") document.documentElement.classList.add("big");
  $("#btnFont").onclick = () => { const on = document.documentElement.classList.toggle("big"); localStorage.setItem("uzex2035.big", on ? "1" : "0"); toast(on ? "Katta yozuv yoqildi" : "Oddiy yozuv"); };
  $("#btnPractice").onclick = () => setPractice(!practice);
  $("#pExit").onclick = () => setPractice(false);
  $("#practiceBar").hidden = !practice; $("#btnPractice").classList.toggle("on", practice);
  const h = new Date().getHours();
  $("#greet").textContent = h < 11 ? "Xayrli tong!" : h < 18 ? "Xayrli kun!" : "Xayrli kech!";
  render();
  fetch("data/market.json").then(r => r.json()).then(d => { M = d; render(); badge(); orders.filter(o => o.mine && o.step < 3 && o.step >= 0).forEach(o => simulate(o.id)); })
    .catch(() => { view.innerHTML = '<div class="card">Ma\'lumot yuklanmadi. Internetni tekshirib, sahifani yangilang.</div>'; });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();

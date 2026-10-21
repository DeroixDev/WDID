/* WDID – reine Logik ohne Oberfläche: Datumsrechnung, Feiertage, Fristen,
   Schnelleingabe, Brieftext-Auswertung und Einkaufssortierung.
   Läuft im Browser (window.WDIDLogic) und in Node (require) für Tests. */
(function (root) {
  'use strict';

  /* ---------- Datum ---------- */
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const weekday = s => parse(s).getDay(); // 0 = Sonntag

  function addMonths(s, n) {
    const d = parse(s), day = d.getDate();
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(day, last));
    return iso(t);
  }

  /* ---------- Feiertage ---------- */
  const STATES = {
    BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg',
    HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen',
    RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen'
  };

  function easter(y) { // Gaußsche Osterformel (Spencer)
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return iso(new Date(y, month - 1, day));
  }

  const holidayCache = {};
  function holidays(year, state) {
    const key = year + state;
    if (holidayCache[key]) return holidayCache[key];
    const E = easter(year), f = (m, d) => `${year}-${pad(m)}-${pad(d)}`;
    const add = (list, date, name, states) => { if (!states || states.includes(state)) list.push([date, name]); };
    const L = [];
    add(L, f(1, 1), 'Neujahr');
    add(L, f(1, 6), 'Heilige Drei Könige', ['BW', 'BY', 'ST']);
    add(L, f(3, 8), 'Internationaler Frauentag', ['BE', 'MV']);
    add(L, addDays(E, -2), 'Karfreitag');
    add(L, E, 'Ostersonntag', ['BB']);
    add(L, addDays(E, 1), 'Ostermontag');
    add(L, f(5, 1), 'Tag der Arbeit');
    add(L, addDays(E, 39), 'Christi Himmelfahrt');
    add(L, addDays(E, 49), 'Pfingstsonntag', ['BB']);
    add(L, addDays(E, 50), 'Pfingstmontag');
    add(L, addDays(E, 60), 'Fronleichnam', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']);
    add(L, f(8, 15), 'Mariä Himmelfahrt', ['SL']);
    add(L, f(9, 20), 'Weltkindertag', ['TH']);
    add(L, f(10, 3), 'Tag der Deutschen Einheit');
    add(L, f(10, 31), 'Reformationstag', ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']);
    add(L, f(11, 1), 'Allerheiligen', ['BW', 'BY', 'NW', 'RP', 'SL']);
    if (state === 'SN') { // Buß- und Bettag: Mittwoch vor dem 23. November
      let d = f(11, 22); while (weekday(d) !== 3) d = addDays(d, -1); L.push([d, 'Buß- und Bettag']);
    }
    add(L, f(12, 25), '1. Weihnachtstag');
    add(L, f(12, 26), '2. Weihnachtstag');
    return (holidayCache[key] = Object.fromEntries(L));
  }
  const holidayName = (s, state) => holidays(+s.slice(0, 4), state)[s] || null;
  const isWorkday = (s, state) => { const w = weekday(s); return w !== 0 && w !== 6 && !holidayName(s, state); };

  // § 193 BGB: Fällt das Fristende auf Samstag, Sonntag oder Feiertag, endet sie am nächsten Werktag.
  function shiftToWorkday(s, state) {
    const skipped = [];
    while (!isWorkday(s, state)) {
      const w = weekday(s);
      skipped.push(holidayName(s, state) || (w === 6 ? 'Samstag' : 'Sonntag'));
      s = addDays(s, 1);
    }
    return { date: s, skipped };
  }

  /* ---------- Fristrechner ----------
     received: Datum im Briefkasten bzw. Datum des Bescheids
     fiction:  Zugangsfiktion bei Behördenpost (§ 41 VwVfG, § 122 AO, seit 2025 vier Tage nach Aufgabe zur Post)
     n, unit:  'Tage' | 'Wochen' | 'Monate'                                                     */
  function computeDeadline({ received, fiction = false, n, unit = 'Tage', state = 'NW' }) {
    const notes = [];
    let start = received;
    if (fiction) {
      start = addDays(received, 4);
      notes.push(`Gilt als zugegangen am ${fmt(start)} (4 Tage nach dem Briefdatum).`);
      const sh = shiftToWorkday(start, state);
      if (sh.date !== start) { notes.push(`Verschoben auf ${fmt(sh.date)}, weil ${sh.skipped.join(', ')}.`); start = sh.date; }
    }
    let raw;
    if (unit === 'Monate') raw = addMonths(start, n);
    else raw = addDays(start, unit === 'Wochen' ? 7 * n : n);
    const end = shiftToWorkday(raw, state);
    if (end.date !== raw) notes.push(`Fristende ${fmt(raw)} fällt auf ${end.skipped.join(', ')}, daher ${fmt(end.date)}.`);
    return { start, raw, deadline: end.date, notes };
  }

  /* ---------- Kündigungswecker ----------
     termEnd: Ende der aktuellen Laufzeit, notice: Kündigungsfrist, renew: Verlängerung in Monaten
     (seit 2022 bei Verbraucherverträgen meist unbefristet mit 1 Monat Frist – dann renew = 0) */
  function cancelDeadline({ termEnd, noticeN = 1, noticeUnit = 'Monate', renewMonths = 12, today }) {
    let end = termEnd;
    // Ist der letzte Kündigungstag schon vorbei, rechnet der Wecker mit der nächsten Verlängerung.
    // renewMonths = 1 entspricht der monatlichen Verlängerung nach Ablauf der Mindestlaufzeit.
    const last = d => noticeUnit === 'Monate' ? addMonths(d, -noticeN) : addDays(d, -(noticeUnit === 'Wochen' ? 7 * noticeN : noticeN));
    let lastDay = last(end);
    let guard = 0;
    while (today && lastDay < today && guard++ < 600) { end = addMonths(end, renewMonths || 12); lastDay = last(end); }
    return { termEnd: end, lastDay };
  }

  const MONTHS = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
  const fmt = s => parse(s).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

  /* ---------- Brieftext auswerten (nach Texterkennung) ---------- */
  const NUMWORDS = { ein: 1, eine: 1, einem: 1, einer: 1, eines: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, zwölf: 12, vierzehn: 14, einundzwanzig: 21, dreißig: 30 };
  function parseDateDE(str, ref) {
    let m = str.match(/\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})\b/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return iso(new Date(y, +m[2] - 1, +m[1])); }
    m = str.match(new RegExp(`\\b(\\d{1,2})\\.\\s?(${MONTHS.join('|')})\\s?(\\d{4})?`, 'i'));
    if (m) { const y = m[3] ? +m[3] : parse(ref).getFullYear(); return iso(new Date(y, MONTHS.indexOf(m[2].toLowerCase()), +m[1])); }
    return null;
  }

  function analyzeLetter(text, { today, state = 'NW' } = {}) {
    const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const flat = lines.join(' ');
    const out = { sender: null, letterDate: null, reference: null, amount: null, deadline: null, period: null, isAuthority: false, notes: [] };
    out.sender = lines.find(l => /[a-zäöü]{3}/i.test(l) && !/^(herr|frau|an\b)/i.test(l)) || null;
    out.isAuthority = /(amt\b|finanzamt|behörde|stadt\s|landkreis|jobcenter|agentur für arbeit|rentenversicherung|krankenkasse|beitragsservice|gericht|polizei|bescheid)/i.test(flat);
    let m = flat.match(/(datum|vom)\s*:?\s*(\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4})/i);
    if (m) out.letterDate = parseDateDE(m[2], today);
    else { // erstes Datum, das nicht hinter "bis" oder "spätestens" steht
      const re = /(bis\s+(zum\s+)?|spätestens\s+(am\s+)?)?(\d{1,2}\.\s?\d{1,2}\.\s?\d{4})/gi; let x;
      while ((x = re.exec(flat))) if (!x[1]) { out.letterDate = parseDateDE(x[4], today); break; }
    }
    m = flat.match(/(aktenzeichen|az\.?|geschäftszeichen|kundennummer|kunden-nr\.?|vorgangsnummer|rechnungsnummer|beitragsnummer|steuernummer|vertragsnummer|versicherungsnummer)\s*:?\s*([A-Z0-9][A-Z0-9 \/\-.]{3,30})/i);
    if (m) out.reference = `${m[1].replace(/\.$/, '')}: ${m[2].trim().replace(/\s+\S*[a-zäöü]{4,}.*$/, '')}`;
    m = flat.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s?(€|eur\b|euro)/i);
    if (m) out.amount = m[1] + ' €';
    // Explizites Datum nach "bis", "spätestens", "bis zum"
    m = flat.match(/(bis\s+(zum\s+)?|spätestens\s+(am|bis)?\s*)(\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4}|\d{1,2}\.\s?(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)(\s?\d{4})?)/i);
    if (m) out.deadline = parseDateDE(m[4], today);
    // Relative Frist: "innerhalb von 14 Tagen", "innerhalb eines Monats", "binnen zwei Wochen"
    m = flat.match(/(innerhalb|binnen)\s+(von\s+)?(\d+|[a-zäöüß]+)\s+(tag|tagen|woche|wochen|monat|monats|monaten)\b/i);
    if (m) {
      const n = /^\d+$/.test(m[3]) ? +m[3] : NUMWORDS[m[3].toLowerCase()];
      const u = m[4].toLowerCase();
      if (n) out.period = { n, unit: u.startsWith('tag') ? 'Tage' : u.startsWith('woche') ? 'Wochen' : 'Monate' };
    }
    if (!out.deadline && out.period) {
      const received = out.letterDate || today;
      const r = computeDeadline({ received, fiction: out.isAuthority && !!out.letterDate, ...out.period, state });
      out.deadline = r.deadline; out.notes = r.notes;
    }
    return out;
  }

  // letzter Tag der laufenden Woche: Freitag, am Wochenende der Sonntag
  function endOfWeek(day) {
    const w = weekday(day);
    return w >= 1 && w <= 5 ? addDays(day, 5 - w) : w === 6 ? addDays(day, 1) : day;
  }
  const mondayOf = day => addDays(day, -((weekday(day) + 6) % 7));

  /* ---------- Schnelleingabe ---------- */
  const WD = { so: 0, sonntag: 0, mo: 1, montag: 1, di: 2, dienstag: 2, mi: 3, mittwoch: 3, do: 4, donnerstag: 4, fr: 5, freitag: 5, sa: 6, samstag: 6 };
  function quickParse(input, { today, places = [] } = {}) {
    let s = ' ' + input.trim() + ' ';
    const r = { type: 'task', title: '', date: today, time: null, context: 'privat', repeat: 'none', placeId: null, items: [] };
    const take = re => { const m = s.match(re); if (m) s = s.replace(m[0], ' '); return m; };

    if (take(/\s#arbeit\b|\s(arbeit|job|büro):\s/i)) r.context = 'arbeit';
    if (take(/\s#privat\b/i)) r.context = 'privat';
    // Ticket-, RMA- oder Auftragsnummer: #RMA-1234, #4711-22
    let mr = take(/\s#([A-Za-z]{0,8}[-/]?\d[\w/-]*)(?=\s)/);
    if (mr) r.ref = mr[1].toUpperCase();
    // Person: @Jessen
    mr = take(/\s@([\wäöüÄÖÜß.-]{2,30})(?=\s)/);
    if (mr) r.contact = mr[1];

    // Ortsliste: "bei Kaufland: Milch, Brot" oder "Kaufland: Milch, Brot"
    let m = s.match(/^\s*(?:bei|im|in der|beim)?\s*([^:]{2,30}):\s*(.+)$/i);
    if (m) {
      const name = m[1].trim(), p = places.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (p || /^\s*(bei|im|beim|in der)\s/i.test(s)) {
        r.type = 'place'; r.placeName = name; r.placeId = p ? p.id : null;
        r.items = m[2].split(/,|;|\sund\s/).map(x => x.trim()).filter(Boolean);
        r.title = 'Einkauf'; r.date = null;
        return r;
      }
    }

    if (take(/\s(täglich|jeden tag)\b/i)) r.repeat = 'daily';
    if (take(/\s(wöchentlich|jede woche)\b/i)) r.repeat = 'weekly';
    if (take(/\s(monatlich|jeden monat)\b/i)) r.repeat = 'monthly';
    m = take(/\sjeden\s(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/i);
    if (m) { r.repeat = 'weekly'; s = ' ' + m[1] + s; }

    let deadline = false;
    if (take(/\s(bis|spätestens)\b/i)) deadline = true;

    m = take(/\s(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?=\s)/);
    if (m) {
      const ref = parse(today); let y = m[3] ? +m[3] : ref.getFullYear(); if (y < 100) y += 2000;
      let d = iso(new Date(y, +m[2] - 1, +m[1])); if (!m[3] && d < today) d = iso(new Date(y + 1, +m[2] - 1, +m[1]));
      r.date = d;
    }
    m = take(/\s(heute|morgen|übermorgen)\b/i);
    if (m) r.date = addDays(today, { heute: 0, morgen: 1, übermorgen: 2 }[m[1].toLowerCase()]);
    m = take(/\sin\s(\d+|einer|einem|zwei|drei|vier)\s(tag|tagen|woche|wochen)\b/i);
    if (m) { const n = /^\d+$/.test(m[1]) ? +m[1] : NUMWORDS[m[1].toLowerCase()]; r.date = addDays(today, m[2].toLowerCase().startsWith('woche') ? 7 * n : n); }
    if (take(/\snächste\swoche\b/i)) { let d = addDays(today, 1); while (weekday(d) !== 1) d = addDays(d, 1); r.date = d; }
    m = take(/\s(?:am\s)?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|mo|di|mi|do|fr|sa|so)\.?(?=\s)/i);
    if (m) { const t = WD[m[1].toLowerCase()]; let d = today; while (weekday(d) !== t) d = addDays(d, 1); r.date = d; }

    m = take(/\s(?:um\s)?(\d{1,2})[:.](\d{2})(?:\s?uhr)?(?=\s)/i) || take(/\s(?:um\s)?(\d{1,2})\s?uhr\b/i) || take(/\sum\s(\d{1,2})(?=\s)/i);
    if (m) { const h = +m[1], min = m[2] ? +m[2] : 0; if (h < 24 && min < 60) { r.time = `${pad(h)}:${pad(min)}`; r.type = 'reminder'; } }

    if (take(/\s(?:irgendwann\s)?diese\swoche\b/i)) { r.flex = true; r.date = endOfWeek(today); }
    if (deadline) { r.type = 'deadline'; r.time = null; }
    r.title = s.replace(/\s+/g, ' ').trim().replace(/^(am|um|an)\s/i, '');
    r.title = r.title.charAt(0).toUpperCase() + r.title.slice(1);
    return r;
  }

  /* ---------- Einkauf: Abteilungen und Ladenweg ---------- */
  // Reihenfolge = typischer Weg durch einen deutschen Supermarkt
  const DEPTS = [
    ['obst', 'Obst & Gemüse', 'apfel äpfel banane birne orange mandarine zitrone limette traube erdbeer himbeer heidelbeer beere kiwi mango ananas melone pfirsich nektarine pflaume obst avocado tomate gurke paprika salat rucola spinat zucchini aubergine kartoffel zwiebel knoblauch karotte möhre lauch porree brokkoli blumenkohl kohl champignon pilz ingwer kräuter petersilie basilikum schnittlauch radieschen sellerie kürbis mais gemüse'],
    ['brot', 'Brot & Backwaren', 'brot brötchen toast baguette croissant brezel laugen semmel kuchen knäckebrot wrap tortilla'],
    ['kuehl', 'Milch & Kühlregal', 'milch joghurt quark sahne butter margarine käse gouda mozzarella feta frischkäse parmesan ei eier skyr kefir buttermilch pudding schmand creme fraiche hefe tofu hummus'],
    ['fleisch', 'Fleisch, Wurst & Fisch', 'fleisch hack hähnchen huhn pute schwein rind steak schnitzel wurst salami schinken aufschnitt würstchen speck bacon lachs fisch thunfisch garnele'],
    ['vorrat', 'Nudeln, Reis & Konserven', 'nudel spaghetti pasta reis mehl zucker salz pfeffer gewürz öl essig konserve dose bohne linse kichererbse tomatenmark passata soße sauce brühe ketchup senf mayo couscous haferflocken backpulver'],
    ['fruehstueck', 'Frühstück & Kaffee', 'müsli cornflakes kaffee tee kakao marmelade konfitüre honig nutella aufstrich'],
    ['suess', 'Süßes & Snacks', 'schokolade chips keks gummibär bonbon nüsse snack riegel popcorn eis'],
    ['getraenke', 'Getränke', 'wasser saft cola limo bier wein sekt sprudel apfelschorle getränk mate'],
    ['tk', 'Tiefkühl', 'tiefkühl tk pizza pommes fischstäbchen'],
    ['drogerie', 'Drogerie & Haushalt', 'zahnpasta zahnbürste shampoo duschgel seife deo creme sonnencreme toilettenpapier klopapier küchenrolle taschentuch spülmittel waschmittel müllbeutel schwamm reiniger putz windel binden tampon rasier pflaster batterie alufolie frischhaltefolie backpapier'],
    ['sonst', 'Sonstiges', '']
  ];
  const DEPT_KEYS = DEPTS.map(d => d[0]);
  const DEPT_NAME = Object.fromEntries(DEPTS.map(d => [d[0], d[1]]));
  const norm = s => s.toLowerCase().replace(/\d+([.,]\d+)?\s?(kg|g|l|ml|stk|x|%)?/g, ' ').replace(/[^a-zäöüß ]/g, ' ').replace(/\s+/g, ' ').trim();
  // Längste Stichwörter zuerst, damit "Tomatenmark" nicht als "Tomate" bei Obst & Gemüse landet
  const KEYWORDS = DEPTS.flatMap(([key, , words]) => words.split(' ').filter(Boolean).map(w => [w, key]))
    .sort((a, b) => b[0].length - a[0].length);
  function categorize(text) {
    const t = norm(text);
    // Kurze Wörter wie "Eis" nur als eigenes Wort, damit "Reis" nicht zu Süßes wird
    for (const [w, key] of KEYWORDS) {
      if (w.length <= 3 ? new RegExp(`(^|\\s)${w}(\\s|$)`).test(t) : t.includes(w)) return key;
    }
    return 'sonst';
  }
  // route: gelernte Position je Abteilung (0 = Eingang, 1 = Kasse)
  function deptRank(key, route) {
    if (route && typeof route[key] === 'number') return route[key];
    return DEPT_KEYS.indexOf(key) / (DEPT_KEYS.length - 1);
  }
  function sortItems(items, route) {
    return items.map((it, i) => ({ it, i, cat: it.cat || categorize(it.text) }))
      .sort((a, b) => (a.it.done - b.it.done) || (deptRank(a.cat, route) - deptRank(b.cat, route)) || (a.i - b.i));
  }
  // Nach einem Einkauf: Reihenfolge der abgehakten Abteilungen in die Route einrechnen
  function learnRoute(route, seq) {
    const order = [];
    for (const c of seq) if (!order.includes(c)) order.push(c);
    if (order.length < 2) return route || {};
    const next = { ...(route || {}) };
    order.forEach((c, i) => {
      const pos = i / (order.length - 1);
      next[c] = typeof next[c] === 'number' ? +(0.6 * next[c] + 0.4 * pos).toFixed(3) : +pos.toFixed(3);
    });
    return next;
  }
  // Vorrats-Rhythmus: aus den Kaufzeitpunkten eines Artikels den nächsten Bedarf schätzen
  function suggestions(history, openNames, now) {
    const out = [];
    for (const [name, times] of Object.entries(history || {})) {
      if (times.length < 3 || openNames.has(name)) continue;
      const gaps = times.slice(1).map((t, i) => t - times[i]).filter(g => g > 864e5 / 2);
      if (gaps.length < 2) continue;
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const due = times[times.length - 1] + avg;
      if (due - now < 864e5) out.push({ name, everyDays: Math.max(1, Math.round(avg / 864e5)), overdue: now > due });
    }
    return out.sort((a, b) => b.overdue - a.overdue || a.everyDays - b.everyDays).slice(0, 8);
  }

  const api = { pad, iso, parse, addDays, addMonths, daysBetween, weekday, fmt, STATES, easter, holidays, holidayName, isWorkday,
    shiftToWorkday, computeDeadline, cancelDeadline, parseDateDE, analyzeLetter, quickParse, endOfWeek, mondayOf, DEPTS, DEPT_KEYS, DEPT_NAME,
    norm, categorize, deptRank, sortItems, learnRoute, suggestions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WDIDLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);

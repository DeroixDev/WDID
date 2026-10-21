/* WDID – Oberfläche und App-Logik. Baut auf js/logic.js (window.WDIDLogic) auf. */
(async () => {
  'use strict';
  const L = window.WDIDLogic;
  const { pad, iso, parse, addDays, daysBetween } = L;
  const KEY = 'wdid.v1';
  const today = () => iso(new Date());
  const uid = () => Math.random().toString(36).slice(2, 10);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = s => parse(s).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  const shortDate = s => parse(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const longDate = s => parse(s).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hhmm = ts => new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const toMinutes = t => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m; };

  /* ---------- Native Brücke ---------- */
  const Cap = window.Capacitor;
  const native = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const plugin = name => (native ? Cap.registerPlugin(name) : null);
  const Prefs = plugin('Preferences'), Notes = plugin('LocalNotifications'), Clip = plugin('Clipboard');
  const Native = plugin('WDIDNative'), FS = plugin('Filesystem'), Share = plugin('Share'), AppP = plugin('App');
  const Haptics = plugin('Haptics'), StatusBar = plugin('StatusBar');

  /* ---------- Typen ---------- */
  const TYPE = {
    reminder: { label: 'Erinnerung', icon: '<circle cx="12" cy="13" r="7"/><path d="M12 9v4l2.5 2M5 4l3 2M19 4l-3 2"/>' },
    task:     { label: 'Aufgabe', icon: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>' },
    deadline: { label: 'Frist', icon: '<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/>' },
    place:    { label: 'Ortsliste', icon: '<path d="M12 21s-6-5.6-6-11a6 6 0 1 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>' },
    waiting:  { label: 'Wartet auf', icon: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>' },
    contract: { label: 'Vertrag', icon: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>' },
    document: { label: 'Dokument', icon: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="9" cy="12" r="2"/><path d="M14 10h4M14 14h3"/>' },
  };
  const DATED_ALERT = ['deadline', 'contract', 'document'];   // erscheinen mit Vorlauf unter „Fristen in Sicht“
  const GROUPS = { supermarkt: 'Supermarkt', drogerie: 'Drogerie', apotheke: 'Apotheke', baumarkt: 'Baumarkt' };
  const PROOF = ['Einschreiben', 'Brief', 'E-Mail', 'Online-Portal', 'Fax', 'Telefon', 'Persönlich', 'Sonstiges'];
  const THEMES = {
    system: { name: 'System' },
    birke:  { name: 'Birke', bg: '#F3F4F1', sf: '#FFFFFF', ac: '#3D6357' },
    sand:   { name: 'Sand', bg: '#F5F0E8', sf: '#FFFCF7', ac: '#86663D' },
    fjord:  { name: 'Fjord', bg: '#EEF2F4', sf: '#FFFFFF', ac: '#2F5E80' },
    heide:  { name: 'Heide', bg: '#F4F1F4', sf: '#FFFFFF', ac: '#6E4E78' },
    nacht:  { name: 'Nacht', bg: '#161A18', sf: '#1F2421', ac: '#8DB5A6', dark: true },
    polar:  { name: 'Polarnacht', bg: '#10151C', sf: '#18202A', ac: '#8FB8DE', dark: true },
    oled:   { name: 'Schwarz', bg: '#000000', sf: '#0F1110', ac: '#93C9B4', dark: true },
  };
  const checkSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';

  /* ---------- Daten ---------- */
  const DEFAULT_SETTINGS = { state: 'NW', morningOn: true, morningTime: '07:30', eveningOn: true, eveningTime: '20:30',
    lock: false, workStart: '08:00', workEnd: '17:00', workDays: [1, 2, 3, 4, 5],
    theme: 'system', motion: true, haptics: true, area: 'privat', autoArea: true,
    workBriefing: true, handoverOn: true, billRound: 0 };
  const blank = () => ({ version: 2, sample: false, places: [], entries: [], cases: [], routes: {}, shop: {}, history: {}, log: [], settings: { ...DEFAULT_SETTINGS },
    templates: [], contacts: [], work: {}, media: {}, timer: null, handover: null, files: [] });
  // Vorlage für den Start: ein typischer Reklamationsfall
  const starterTemplates = () => [{ id: uid(), name: 'RMA anlegen', entry: { type: 'task', title: 'RMA anlegen', context: 'arbeit', notes: '',
    items: ['Seriennummer notieren', 'Fehlerbild beschreiben', 'Fotos vom Gerät', 'RMA im System anlegen', 'Versandlabel erstellen', 'Kunde informiert'].map(text => ({ text, done: false })) } }];
  const newEntry = o => ({ id: uid(), type: 'task', title: '', notes: '', context: 'privat', date: null, time: null, received: null, source: '',
    leadDays: 3, placeId: null, group: null, items: [], repeat: 'none', caseId: null, photos: [], proof: null, contract: null,
    ocrText: '', ref: '', contactId: null, flex: false, timeLog: [], loc: null, timeAuto: null, fileIds: [], done: false, doneAt: null, createdAt: Date.now(), ...o });

  function migrate(s) {
    const b = blank();
    s = { ...b, ...s, settings: { ...b.settings, ...(s.settings || {}) } };
    s.entries = (s.entries || []).map(e => newEntry({ ...e }));
    s.places = (s.places || []).map(p => ({ kind: 'store', group: null, radius: 150, lat: null, lng: null, area: 'beide', ...p }));
    s.cases = (s.cases || []).map(c => ({ context: 'privat', status: 'offen', next: '', ...c }));
    if (!Array.isArray(s.templates)) s.templates = starterTemplates();
    s.contacts = (s.contacts || []).map(c => ({ company: '', phone: '', email: '', notes: '', context: 'privat', lastAt: null, ...c }));
    s.work = s.work || {}; s.media = s.media || {}; s.files = s.files || [];
    if (!['privat', 'arbeit', 'alle'].includes(s.settings.area)) s.settings.area = 'privat';
    s.version = 2;
    return s;
  }

  function sample() {
    const t = today(), s = blank();
    s.sample = true;
    s.places = [
      { id: 'kaufland', name: 'Kaufland', kind: 'store', group: 'supermarkt', lat: null, lng: null, radius: 150 },
      { id: 'dm', name: 'dm', kind: 'store', group: 'drogerie', lat: null, lng: null, radius: 100 },
      { id: 'buero', name: 'Büro', kind: 'other', group: null, lat: null, lng: null, radius: 200 },
      { id: 'mama', name: 'Mama', kind: 'person', group: null, lat: null, lng: null, radius: 0 },
    ];
    s.cases = [{ id: 'c1', title: 'Rundfunkbeitrag 2026', createdAt: Date.now() - 5 * 864e5, closed: false, context: 'privat', status: 'offen', next: 'Widerspruch abschicken' },
      { id: 'c2', title: 'Reklamation Dockingstation', createdAt: Date.now() - 2 * 864e5, closed: false, context: 'arbeit', status: 'kunde', next: 'Gerät vom Kunden abwarten' }];
    s.contacts = [{ id: 'k1', name: 'Frau Jessen', company: 'Muster GmbH', phone: '', email: '', notes: 'Ansprechpartnerin Einkauf', context: 'arbeit', lastAt: Date.now() - 2 * 864e5 }];
    s.templates = starterTemplates();
    s.entries = [
      newEntry({ type: 'reminder', title: 'Mama zurückrufen', date: t, time: '09:30' }),
      newEntry({ type: 'task', title: 'Wochenbericht abschicken', context: 'arbeit', date: t, time: '12:00', notes: 'An Team-Verteiler, Zahlen aus dem Dashboard.' }),
      newEntry({ type: 'task', title: 'RMA Dock anlegen', context: 'arbeit', date: t, ref: 'RMA-2210', contactId: 'k1', caseId: 'c2',
        items: [{ text: 'Seriennummer notieren', done: true }, { text: 'Fehlerbild beschreiben', done: true }, { text: 'RMA im System anlegen', done: false }, { text: 'Kunde informiert', done: false }] }),
      newEntry({ type: 'waiting', title: 'Rückmeldung Austauschgerät', context: 'arbeit', contactId: 'k1', source: 'Muster GmbH', received: addDays(t, -3), date: addDays(t, 2), caseId: 'c2' }),
      newEntry({ type: 'task', title: 'Präsentation Quartalszahlen', context: 'arbeit', flex: true, date: L.endOfWeek(t) > t ? L.endOfWeek(t) : addDays(t, 2) }),
      newEntry({ type: 'deadline', title: 'Widerspruch Rundfunkbeitrag', source: 'Brief', received: t, date: addDays(t, 4), leadDays: 7, caseId: 'c1', notes: 'Beitragsnummer: 123 456 789\nKopie vom Bescheid beilegen.' }),
      newEntry({ type: 'task', title: 'Festsetzungsbescheid abgeheftet', caseId: 'c1', date: addDays(t, -5), done: true, doneAt: Date.now() - 5 * 864e5 }),
      newEntry({ type: 'deadline', title: 'Steuererklärung Belege nachreichen', source: 'Finanzamt', received: addDays(t, -10), date: addDays(t, 12), leadDays: 14 }),
      newEntry({ type: 'reminder', title: 'Paket bei Nachbarn abholen', date: t, time: '18:15' }),
      newEntry({ type: 'waiting', title: 'Erstattung Stromabschlag', source: 'Stadtwerke', received: addDays(t, -21), date: addDays(t, -1), notes: 'Zählerstand am 30.09. gemeldet.' }),
      newEntry({ type: 'contract', title: 'Handyvertrag', source: 'Mobilfunk', contract: { termEnd: addDays(t, 75), noticeN: 1, noticeUnit: 'Monate', renewMonths: 1 }, date: L.addMonths(addDays(t, 75), -1), leadDays: 30 }),
      newEntry({ type: 'document', title: 'Personalausweis', date: addDays(t, 50), leadDays: 60, notes: 'Neuen Ausweis 6 Wochen vorher beantragen.' }),
      newEntry({ type: 'place', title: 'Wocheneinkauf', group: 'supermarkt', items: ['Haferflocken', 'Milch 1,5 %', 'Äpfel', 'Brot', 'Spülmittel', 'Tomatenmark', 'Mineralwasser', 'Bananen'].map((text, i) => ({ text, done: i === 2 })) }),
      newEntry({ type: 'place', title: 'Drogerie', placeId: 'dm', items: [{ text: 'Zahnpasta', done: false }, { text: 'Sonnencreme', done: false }] }),
      newEntry({ type: 'place', title: 'Im Büro erledigen', placeId: 'buero', context: 'arbeit', items: [{ text: 'Laptop-Ladegerät mitnehmen', done: false }] }),
      newEntry({ type: 'place', title: 'Mitbringen', placeId: 'mama', items: [{ text: 'Schlüssel zurückgeben', done: false }, { text: 'Tupperdosen', done: false }] }),
      newEntry({ type: 'task', title: 'Altglas wegbringen', date: addDays(t, -1) }),
    ];
    const d = 864e5, n = Date.now();
    s.log = [
      { id: uid(), title: 'Festsetzungsbescheid abgeheftet', type: 'task', at: n - 5 * d },
      { id: uid(), title: 'Wocheneinkauf erledigt', type: 'place', at: n - 2 * d, place: 'Kaufland' },
      { id: uid(), title: 'Zählerstand gemeldet', type: 'task', at: n - 20 * d },
      { id: uid(), title: 'Fahrrad zur Werkstatt gebracht', type: 'task', at: n - 1 * d - 3600e3 },
    ];
    s.history = { milch: [n - 20 * d, n - 15 * d, n - 10 * d, n - 5 * d], kaffee: [n - 40 * d, n - 26 * d, n - 13 * d] };
    return s;
  }

  let state = null;
  if (native) { try { const { value } = await Prefs.get({ key: KEY }); if (value) state = JSON.parse(value); } catch {} }
  if (!state) { try { state = JSON.parse(localStorage.getItem(KEY)); } catch {} }
  state = state ? migrate(state) : (native ? blank() : sample());

  const save = () => {
    const json = JSON.stringify(state);
    try { localStorage.setItem(KEY, json); } catch {}
    if (native) { Prefs.set({ key: KEY, value: json }).catch(() => {}); scheduleNotifications(); syncGeofences(); }
  };

  /* ---------- Zeit: Stoppuhr an Einträgen und Arbeitstag ---------- */
  function startTimer(entry, at = Date.now(), src = 'hand') {
    if (state.timer) stopTimer(at, { quiet: true });
    const log = entry.timeLog = entry.timeLog || [], last = log[log.length - 1];
    // kurz raus und wieder rein (GPS-Zittern, kurze Pause): Abschnitt fortsetzen statt neu anfangen
    if (src === 'ort' && last && last.end && at - last.end < 10 * 60e3) { log.pop(); at = last.start; }
    state.timer = { entryId: entry.id, start: at, src };
  }
  function stopTimer(at = Date.now(), { quiet = false } = {}) {
    const t = state.timer; if (!t) return 0;
    const e = state.entries.find(x => x.id === t.entryId);
    const end = Math.max(at, t.start);
    if (e) (e.timeLog = e.timeLog || []).push({ start: t.start, end, src: t.src || 'hand' });
    state.timer = null;
    if (e && !quiet) toast(`${e.title}: ${fmtDur(end - t.start)} erfasst`);
    return end - t.start;
  }
  function toggleTimer(entry) {
    const running = state.timer && state.timer.entryId === entry?.id;
    if (state.timer) stopTimer();
    if (entry && !running) startTimer(entry);
    haptic('medium'); save();
  }
  // Ankunft und Abfahrt an Orten von Einträgen: von iOS im Hintergrund gesammelt, hier abgeholt
  async function pullTimeEvents() {
    if (!Native) return false;
    let events = [];
    try { events = (await Native.takeWorkEvents()).events || []; } catch { return false; }
    let changed = false;
    events.sort((a, b) => a.at - b.at).forEach(ev => {
      if (!String(ev.id).startsWith('e:')) return;
      const e = state.entries.find(x => x.id === ev.id.slice(2)); if (!e || !e.timeAuto) return;
      if (ev.type === 'enter' && e.timeAuto.start && state.timer?.entryId !== e.id) { startTimer(e, ev.at, 'ort'); changed = true; }
      if (ev.type === 'exit' && e.timeAuto.stop && state.timer?.entryId === e.id) { stopTimer(ev.at, { quiet: true }); changed = true; }
    });
    return changed;
  }
  // Abrechnung: Zeiten je Kunde im Monat, auf Wunsch aufgerundet
  const roundMs = ms => { const r = (state.settings.billRound || 0) * 60e3; return r ? Math.ceil(ms / r) * r : ms; };
  const clientOf = e => { const k = contactById(e.contactId); return k ? (k.company || k.name) : e.loc?.name || caseById(e.caseId)?.title || 'Ohne Kunde'; };
  function billing(monthOffset = 0) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + monthOffset);
    const from = new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const clients = {};
    for (const e of state.entries) {
      if (!inArea(e)) continue;
      const sessions = [...(e.timeLog || []), ...(state.timer?.entryId === e.id ? [{ start: state.timer.start, end: Date.now(), running: true }] : [])].filter(x => x.start >= from && x.start < to);
      if (!sessions.length) continue;
      const ms = sessions.reduce((a, x) => a + (x.end - x.start), 0);
      const c = clients[clientOf(e)] = clients[clientOf(e)] || { name: clientOf(e), ms: 0, billed: 0, items: [] };
      c.ms += ms; c.billed += roundMs(ms); c.items.push({ e, ms, sessions });
    }
    return { label: d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }), clients: Object.values(clients).sort((a, b) => b.ms - a.ms) };
  }
  function billingText(b, only) {
    const r = state.settings.billRound;
    const out = [`Zeiten ${b.label}${r ? ` (je Eintrag auf ${r} min aufgerundet)` : ''}`];
    b.clients.filter(c => !only || c.name === only).forEach(c => {
      out.push('', `${c.name}: ${fmtDur(c.billed)}${r && c.billed !== c.ms ? ` (gemessen ${fmtDur(c.ms)})` : ''}`);
      c.items.forEach(({ e, ms, sessions }) => {
        out.push(`- ${e.title}${e.ref ? ' (' + e.ref + ')' : ''}: ${fmtDur(roundMs(ms))}`);
        sessions.forEach(x => out.push(`    ${new Date(x.start).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} ${hhmm(x.start)}–${x.running ? 'läuft' : hhmm(x.end)}`));
      });
    });
    if (!b.clients.length) out.push('', 'Noch keine Zeiten erfasst.');
    return out.join('\n');
  }
  // Sekunden-Anzeige laufender Uhren, ohne alles neu zu zeichnen
  setInterval(() => {
    document.querySelectorAll('[data-elapsed]').forEach(el => {
      const ms = (+el.dataset.base || 0) + Date.now() - +el.dataset.elapsed, sec = Math.floor(ms / 1000);
      el.textContent = `${Math.floor(sec / 3600)}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
    });
  }, 1000);

  /* ---------- Medien-Infos: wann und wo aufgenommen ---------- */
  function noteMedia(path, at) {
    state.media[path] = { at };
    const p = here && state.places.find(p => p.lat != null && dist(here, p) <= Math.max(p.radius, 150));
    if (p) state.media[path].place = p.name;
    else if (navigator.geolocation && native) navigator.geolocation.getCurrentPosition(pos => {
      const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const near = state.places.find(p => p.lat != null && dist(pt, p) <= Math.max(p.radius, 150));
      if (state.media[path]) { state.media[path].place = near ? near.name : null; state.media[path].lat = pt.lat; state.media[path].lng = pt.lng; save(); }
    }, () => {}, { maximumAge: 300000, timeout: 5000 });
  }
  const mediaCaption = path => {
    const m = state.media[path]; if (!m) return '';
    const d = new Date(m.at);
    return `${d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${hhmm(m.at)} Uhr${m.place ? ' · ' + m.place : ''}`;
  };

  /* ---------- Hilfen für Einträge ---------- */
  const placeById = id => state.places.find(p => p.id === id);
  const listTarget = e => e.group ? `Jeder ${GROUPS[e.group]}` : (placeById(e.placeId)?.name || 'Ort');
  const listsFor = p => state.entries.filter(e => e.type === 'place' && !e.done && (e.placeId === p.id || (e.group && e.group === p.group)));
  const caseById = id => state.cases.find(c => c.id === id);
  const contactById = id => state.contacts.find(c => c.id === id);
  const CASE_STATUS = { offen: 'In Arbeit', kunde: 'Wartet auf Kunde', kollege: 'Wartet auf Kollegen', pausiert: 'Pausiert' };
  // Dauer in Minuten als „2 h 05 min“
  const fmtDur = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + pad(m % 60) + ' min' : ''}`; };
  const fmtHours = ms => (ms / 36e5).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' h';
  const loggedMs = e => (e.timeLog || []).reduce((a, x) => a + ((x.end || Date.now()) - x.start), 0)
    + (state.timer && state.timer.entryId === e.id ? Date.now() - state.timer.start : 0);

  /* ---------- Bereiche: Privat und Arbeit getrennt ---------- */
  const AREAS = { privat: 'Privat', arbeit: 'Arbeit', alle: 'Beides' };
  const area = () => state.settings.area;
  const ctxOf = x => (x && x.context) || 'privat';
  const inArea = x => area() === 'alle' || ctxOf(x) === area();
  const placeInArea = p => area() === 'alle' || (p.area || 'beide') === 'beide' || p.area === area()
    || state.entries.some(e => e.type === 'place' && !e.done && e.placeId === p.id && inArea(e));
  const logInArea = l => area() === 'alle' || (l.ctx || ctxOf(state.entries.find(e => e.id === l.entryId)) ) === area();
  // neue Einträge landen automatisch im Bereich, in dem du gerade bist
  const defaultCtx = () => area() === 'arbeit' ? 'arbeit' : 'privat';
  function inWorkHours(d = new Date()) {
    const s = state.settings, m = d.getHours() * 60 + d.getMinutes();
    return s.workDays.includes(d.getDay()) && m >= toMinutes(s.workStart) && m < toMinutes(s.workEnd);
  }
  let lastAuto = null;
  function autoSwitchArea() {
    if (!state.settings.autoArea) return false;
    const want = inWorkHours() ? 'arbeit' : 'privat';
    if (want === lastAuto) return false;          // nur beim Wechsel der Arbeitszeit, deine Handwahl bleibt sonst stehen
    lastAuto = want;
    if (state.settings.area === want) return false;
    state.settings.area = want; applyArea(); return true;
  }
  function applyArea() { document.documentElement.dataset.area = area(); }
  function setArea(a) {
    if (a === area()) return;
    state.settings.area = a; applyArea(); haptic('select'); save(); render({ enter: true });
  }

  function dayModel(day, { all = false, ctx = null } = {}) {
    const mine = ctx ? state.entries.filter(e => ctxOf(e) === ctx) : all ? state.entries : state.entries.filter(inArea);
    const open = mine.filter(e => e.type !== 'place');
    const t = day;
    const overdue = open.filter(e => !e.done && e.date && e.date < t && !['contract', 'document', 'waiting'].includes(e.type));
    const todays = open.filter(e => e.date === t && !['contract', 'document', 'waiting'].includes(e.type))
      .sort((a, b) => (a.type === 'deadline' ? -1 : 0) - (b.type === 'deadline' ? -1 : 0) || (a.time || '99').localeCompare(b.time || '99'));
    const upcoming = open.filter(e => DATED_ALERT.includes(e.type) && !e.done && e.date && e.date >= t && (e.type !== 'deadline' || e.date > t) && daysBetween(t, e.date) <= (e.leadDays ?? 3))
      .sort((a, b) => a.date.localeCompare(b.date));
    const followUp = open.filter(e => e.type === 'waiting' && !e.done && e.date && e.date <= t);
    const lists = mine.filter(e => e.type === 'place' && !e.done && e.items.some(i => !i.done));
    // flexible Aufgaben: stehen bis zu ihrem Tag unter „Diese Woche“, am Tag selbst unter Heute
    const week = open.filter(e => e.flex && !e.done && e.date && e.date > t && daysBetween(t, e.date) <= 6).sort((a, b) => a.date.localeCompare(b.date));
    return { overdue, todays, upcoming, followUp, lists, week };
  }

  function logDone(e, title) {
    let placeName = null;
    if (here) { const p = state.places.find(p => p.lat != null && dist(here, p) <= Math.max(p.radius, 150)); if (p) placeName = p.name; }
    state.log.unshift({ id: uid(), entryId: e.id, title: title || e.title, type: e.type, at: Date.now(), place: placeName, ctx: ctxOf(e) });
    if (state.log.length > 3000) state.log.length = 3000;
  }

  function complete(entry) {
    if (!entry.done && entry.repeat !== 'none' && entry.date) {
      logDone(entry);
      const d = parse(entry.date);
      if (entry.repeat === 'daily') d.setDate(d.getDate() + 1);
      if (entry.repeat === 'weekly') d.setDate(d.getDate() + 7);
      if (entry.repeat === 'monthly') d.setMonth(d.getMonth() + 1);
      entry.date = iso(d);
      toast('Erledigt. Nächstes Mal am ' + fmtDate(entry.date));
    } else {
      entry.done = !entry.done; entry.doneAt = entry.done ? Date.now() : null;
      if (entry.done) logDone(entry);
      else state.log = state.log.filter(l => !(l.entryId === entry.id && Date.now() - l.at < 864e5));
    }
    save(); render();
  }

  function moveTo(entry, date) { entry.date = date; save(); }

  /* ---------- Einkauf ---------- */
  function checkItem(list, idx, done) {
    const it = list.items[idx];
    it.done = done;
    if (done) {
      const n = L.norm(it.text);
      if (n) { const h = state.history[n] = state.history[n] || []; h.push(Date.now()); if (h.length > 12) h.shift(); }
      // Ladenweg mitschreiben: an welchem Ort wird abgehakt?
      const key = list.placeId || currentStoreId(list) || ('g:' + (list.group || 'x'));
      const sess = state.shop[key] = state.shop[key] && Date.now() - state.shop[key].lastAt < 2 * 3600e3 ? state.shop[key] : { seq: [], lastAt: 0 };
      sess.seq.push(it.cat || L.categorize(it.text)); sess.lastAt = Date.now();
      if (list.items.every(i => i.done)) {
        state.routes[key] = L.learnRoute(state.routes[key], sess.seq); delete state.shop[key];
        logDone(list, `${list.title} erledigt`);
      } else if (sess.seq.length >= 4) {
        state.routes[key] = L.learnRoute(state.routes[key], sess.seq.slice(-12));
      }
    }
    save();
  }
  function currentStoreId(list) {
    if (!here || !list.group) return null;
    const p = state.places.find(p => p.group === list.group && p.lat != null && dist(here, p) <= Math.max(p.radius, 200));
    return p ? p.id : null;
  }
  function routeFor(list) {
    const key = list.placeId || currentStoreId(list) || ('g:' + (list.group || 'x'));
    return state.routes[key];
  }

  /* ---------- Orte & Ankunft ---------- */
  let here = null;
  function dist(a, b) {
    const R = 6371e3, r = x => x * Math.PI / 180;
    const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function locate(cb) {
    if (!navigator.geolocation) return toast('Standort ist auf diesem Gerät nicht verfügbar.');
    navigator.geolocation.getCurrentPosition(
      pos => { here = { lat: pos.coords.latitude, lng: pos.coords.longitude }; cb && cb(here); render(); },
      () => toast('Standort nicht freigegeben. Einstellungen → WDID → Standort.'),
      { enableHighAccuracy: true, timeout: 10000 });
  }
  let lastRegions = '';
  function syncGeofences() {
    if (!Native) return;
    let regions = state.places.filter(p => p.lat != null && p.kind !== 'person').map(p => {
      const lists = listsFor(p), open = lists.flatMap(l => l.items.filter(i => !i.done).map(i => i.text));
      return { id: p.id, placeId: p.id, lat: p.lat, lng: p.lng, radius: p.radius || 150, title: `Du bist bei ${p.name}`,
        body: open.length ? `${open.length} offen: ${open.slice(0, 6).join(', ')}${open.length > 6 ? ' …' : ''}` : '' };
    }).filter(r => r.body);
    // Orte von Einträgen mit automatischer Zeiterfassung zuerst: iOS überwacht höchstens 20 Regionen
    const t = today();
    const timed = state.entries.filter(e => e.loc?.lat != null && e.timeAuto?.start && !e.done && (!e.date || (e.date >= addDays(t, -1) && daysBetween(t, e.date) <= 7)))
      .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).slice(0, 12)
      .map(e => ({ id: 'e:' + e.id, placeId: '', lat: e.loc.lat, lng: e.loc.lng, radius: e.loc.radius || 150, title: `Angekommen: ${e.loc.name}`,
        body: `Zeiterfassung läuft: ${e.title}`, track: 1, stop: e.timeAuto.stop ? 1 : 0, exitBody: `Zeiterfassung beendet: ${e.title}` }));
    regions.unshift(...timed);
    const json = JSON.stringify(regions);
    if (json === lastRegions) return;
    lastRegions = json;
    Native.setGeofences({ regions }).catch(() => {});
  }
  let locationStatus = 'unknown';
  async function refreshLocationStatus() {
    if (!Native) return;
    try { locationStatus = (await Native.locationStatus()).status; } catch {}
  }

  /* ---------- Benachrichtigungen ----------
     Lokal geplant, ohne Internet. iOS behält höchstens 64, deshalb: 7 Morgen-Briefings, 7 Rückblicke, Rest Einträge. */
  const numId = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % 2147483000 + 1; };
  const at = (date, time) => { const [h, m] = (time || '09:00').split(':').map(Number); const d = parse(date); d.setHours(h, m, 0, 0); return d; };
  let notifyAllowed = null, scheduleTimer;
  function briefingText(day, ctx = null) {
    const m = ctx ? dayModel(day, { ctx }) : dayModel(day, { all: true });
    const items = m.todays.filter(e => !e.done);
    const parts = [];
    if (items.length) parts.push(`${items.length} für heute`);
    if (m.upcoming.length) parts.push(`${m.upcoming.length} ${m.upcoming.length === 1 ? 'Frist' : 'Fristen'} in Sicht`);
    if (m.overdue.length && day === today()) parts.push(`${m.overdue.length} liegengeblieben`);
    if (m.week?.length) parts.push(`${m.week.length} flexibel diese Woche`);
    const first = items.find(e => e.time);
    return (parts.join(' · ') || 'Nichts geplant') + (first ? `. Zuerst: ${first.time} ${first.title}` : '');
  }
  function scheduleNotifications() {
    if (!Notes) return;
    clearTimeout(scheduleTimer);
    scheduleTimer = setTimeout(async () => {
      try {
        if (notifyAllowed === null) notifyAllowed = (await Notes.requestPermissions()).display === 'granted';
        if (!notifyAllowed) return;
        const pending = (await Notes.getPending()).notifications;
        if (pending.length) await Notes.cancel({ notifications: pending.map(n => ({ id: n.id })) });
        const now = Date.now(), list = [], s = state.settings;
        const isWork = day => s.workDays.includes(parse(day).getDay()) && !L.holidayName(day, s.state);
        // Arbeits-Mitteilungen mit Standardzeit landen am nächsten Arbeitstag zu Arbeitsbeginn
        const workSlot = day => { let d = day; for (let i = 0; i < 10 && !isWork(d); i++) d = addDays(d, 1); return at(d, s.workStart); };
        for (let i = 0; i < 7; i++) {
          const day = addDays(today(), i);
          // zwei Briefings: privat am Morgen, Arbeit zu Arbeitsbeginn
          const privText = s.workBriefing ? briefingText(day, 'privat') : briefingText(day);
          if (s.morningOn && privText !== 'Nichts geplant') list.push({ id: numId('morning' + day), title: 'Dein Tag', body: privText, at: at(day, s.morningTime), extra: { open: 'heute', area: s.workBriefing ? 'privat' : undefined }, prio: 1 });
          if (s.workBriefing && isWork(day)) {
            const wt = briefingText(day, 'arbeit'), ho = state.handover && state.handover.date < day && state.handover.date >= addDays(day, -4) ? state.handover.text.split('\n')[0].replace(/^[-\d.\s]+/, '') : '';
            if (wt !== 'Nichts geplant' || ho) list.push({ id: numId('work' + day), title: 'Arbeit', body: (wt !== 'Nichts geplant' ? wt : 'Nichts Festes geplant') + (ho ? `. Zuerst: ${ho}` : ''), at: at(day, s.workStart), extra: { open: 'heute', area: 'arbeit' }, prio: 1 });
          }
          if (s.handoverOn && isWork(day)) list.push({ id: numId('handover' + day), title: 'Feierabend', body: 'Kurz notieren, was du morgen zuerst machst. Dann ist der Kopf frei.', at: at(day, s.workEnd), extra: { open: 'handover', area: 'arbeit' }, prio: 1 });
          if (s.eveningOn) list.push({ id: numId('evening' + day), title: 'Tagesabschluss', body: 'Schau, was du heute geschafft hast, und schieb Offenes auf morgen.', at: at(day, s.eveningTime), extra: { open: 'review' }, prio: 1 });
        }
        for (const e of state.entries) {
          if (e.done || !e.date || e.type === 'place') continue;
          const work = ctxOf(e) === 'arbeit', ex = { open: 'heute', area: work ? 'arbeit' : 'privat' };
          if (DATED_ALERT.includes(e.type)) {
            const lead = e.leadDays || 0, label = { deadline: 'Frist', contract: 'Kündigen bis', document: 'Läuft ab' }[e.type];
            // echte Fristen kommen immer, bei der Arbeit aber zu Arbeitsbeginn statt um 8 Uhr
            if (lead > 0) list.push({ id: numId(e.id + ':lead'), title: `${label} in ${lead} ${lead === 1 ? 'Tag' : 'Tagen'}`, body: e.title, at: work ? workSlot(addDays(e.date, -lead)) : at(addDays(e.date, -lead), '09:00'), extra: ex });
            list.push({ id: numId(e.id + ':due'), title: `${label} heute`, body: e.title, at: at(e.date, work ? s.workStart : '08:00'), extra: ex });
          } else if (e.type === 'waiting') {
            const who = contactById(e.contactId)?.name || e.source;
            list.push({ id: numId(e.id), title: 'Nachhaken', body: `${e.title}${who ? ' · ' + who : ''}`, at: work ? workSlot(e.date) : at(e.date, '10:00'), extra: ex });
          } else if (e.time) {
            list.push({ id: numId(e.id), title: e.title, body: e.notes || TYPE[e.type].label, at: at(e.date, e.time), extra: ex });
          }
        }
        const next = list.filter(n => n.at.getTime() > now).sort((a, b) => (b.prio || 0) - (a.prio || 0) || a.at - b.at).slice(0, 62)
          .map(n => ({ id: n.id, title: n.title, body: n.body, extra: n.extra || null, schedule: { at: n.at, allowWhileIdle: true } }));
        if (next.length) await Notes.schedule({ notifications: next });
      } catch (err) { console.warn('Benachrichtigungen', err); }
    }, 400);
  }

  /* ---------- Signatur-Erinnerung (kostenlose Apple-ID: 7 Tage) ---------- */
  const RESIGN_ID = 'sys-resign';
  function ensureResignEntry() {
    const info = window.WDID_BUILD;
    if (!native || !info) return;
    const exp = new Date(info.expiresAt);
    const d = new Date(exp); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 1);
    while (d.getDay() !== 6) d.setDate(d.getDate() - 1);
    const t = parse(today());
    if (d < t) d.setTime(t.getTime());
    const date = iso(d);
    const notes = `Die App-Signatur läuft am ${exp.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })} um ${exp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} ab. iPhone per Kabel anschließen und am Mac „WDID aktualisieren“ doppelklicken. Deine Daten bleiben erhalten.`;
    let e = state.entries.find(x => x.id === RESIGN_ID);
    if (!e) { e = newEntry({ id: RESIGN_ID, type: 'task', leadDays: 0 }); state.entries.push(e); }
    if (e.date !== date) { e.done = false; e.doneAt = null; }
    Object.assign(e, { title: 'iPhone an den Mac anschließen', notes, date, time: '10:00' });
  }

  /* ---------- Fotos ---------- */
  const photoSrc = {};
  async function savePhoto(base64) {
    const name = `photos/${Date.now()}-${uid()}.jpg`;
    if (FS) { await FS.writeFile({ path: name, data: base64, directory: 'DATA', recursive: true }); return name; }
    const dataUrl = 'data:image/jpeg;base64,' + base64; photoSrc[dataUrl] = dataUrl; return dataUrl;
  }
  async function resolvePhoto(path) {
    if (photoSrc[path]) return photoSrc[path];
    if (path.startsWith('data:')) return (photoSrc[path] = path);
    try { const { uri } = await FS.getUri({ path, directory: 'DATA' }); return (photoSrc[path] = Cap.convertFileSrc(uri)); } catch { return ''; }
  }
  async function readPhotoBase64(path) {
    if (path.startsWith('data:')) return path.split(',')[1];
    const { data } = await FS.readFile({ path, directory: 'DATA' }); return data;
  }
  function fileToJpegBase64(file, max = 2000) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht geladen werden')); };
      img.src = url;
    });
  }
  function pickImage({ camera = true } = {}) {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*'; if (camera) input.setAttribute('capture', 'environment');
      input.onchange = () => resolve(input.files[0] || null);
      input.click();
    });
  }
  async function hydratePhotos(root) {
    for (const el of root.querySelectorAll('[data-photo]')) {
      const src = await resolvePhoto(el.dataset.photo); if (!src) continue;
      // #t=0.1 lässt iOS das erste Bild des Videos als Vorschau zeigen
      el.src = el.tagName === 'VIDEO' ? src + '#t=0.1' : src;
    }
  }

  /* ---------- Videos ---------- */
  const isVideo = p => /\.(mp4|mov|m4v|webm)$/i.test(p) || p.startsWith('data:video') || p.startsWith('blob:');
  const blobToBase64 = blob => new Promise((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.onerror = () => reject(r.error); r.readAsDataURL(blob);
  });
  // große Dateien stückweise schreiben, damit die Brücke zu iOS nicht überläuft
  async function writeChunked(file, name, label) {
    const CH = 3 * 1024 * 1024;   // Vielfaches von 3, damit die Base64-Stücke sauber aneinanderpassen
    if (!file.size) { await FS.writeFile({ path: name, data: '', directory: 'DATA', recursive: true }); return name; }
    for (let off = 0; off < file.size; off += CH) {
      const b64 = await blobToBase64(file.slice(off, off + CH));
      if (off === 0) await FS.writeFile({ path: name, data: b64, directory: 'DATA', recursive: true });
      else await FS.appendFile({ path: name, data: b64, directory: 'DATA' });
      if (file.size > CH * 2) toast(`${label} wird gespeichert … ${Math.min(100, Math.round((off + CH) / file.size * 100))} %`);
    }
    return name;
  }
  async function saveVideo(file) {
    if (!FS) { const url = URL.createObjectURL(file); photoSrc[url] = url; return url; }   // Browser-Vorschau: nur bis zum Neuladen
    const ext = ((file.name || '').match(/\.(mov|mp4|m4v)$/i)?.[1] || (/mp4/.test(file.type) ? 'mp4' : 'mov')).toLowerCase();
    return writeChunked(file, `media/${Date.now()}-${uid()}.${ext}`, 'Video');
  }

  /* ---------- Ablage: Dokumente aller Art ---------- */
  const fileById = id => state.files.find(f => f.id === id);
  const kindOf = f => /pdf/.test(f.mime) || /\.pdf$/i.test(f.name) ? 'pdf' : /^image\//.test(f.mime) ? 'bild' : /^video\//.test(f.mime) ? 'video' : 'andere';
  const fmtSize = n => n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
  const linkedEntries = f => state.entries.filter(e => (e.fileIds || []).includes(f.id));
  function pickFiles() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file'; input.multiple = true;
      input.onchange = () => resolve([...input.files]);
      input.click();
    });
  }
  async function addFiles(files, { ctx = defaultCtx(), entry = null } = {}) {
    const added = [];
    for (const file of files) {
      try {
        const safe = (file.name || 'Datei').replace(/[^\wäöüÄÖÜß. -]+/g, '_').slice(-80);
        let path;
        if (FS) path = await writeChunked(file, `files/${Date.now()}-${uid()}-${safe}`, file.name || 'Datei');
        else path = 'data:' + (file.type || 'application/octet-stream') + ';base64,' + await blobToBase64(file);
        const f = { id: uid(), name: (file.name || 'Datei').replace(/\.[^.]+$/, '') || 'Datei', file: file.name || 'Datei', path, mime: file.type || '', size: file.size || 0, addedAt: Date.now(), context: ctx, note: '' };
        state.files.unshift(f); added.push(f);
        if (entry) (entry.fileIds = entry.fileIds || []).push(f.id);
      } catch (err) { toast(`${file.name}: ${err.message}`); }
    }
    if (added.length) { save(); toast(added.length === 1 ? `„${added[0].name}“ abgelegt` : `${added.length} Dateien abgelegt`); haptic('success'); }
    return added;
  }
  async function openFile(f) {
    const k = kindOf(f);
    if (k === 'bild' || k === 'video') return openViewer([f.path], 0);
    if (Native && !f.path.startsWith('data:')) { try { await Native.preview({ path: f.path, title: f.name }); return; } catch (err) { toast(err.message); return; } }
    const src = f.path.startsWith('data:') ? f.path : await resolvePhoto(f.path);
    const w = window.open(); if (w) w.location.href = src; else toast('Pop-up blockiert');
  }
  async function shareFile(f) {
    try { const { uri } = await FS.getUri({ path: f.path, directory: 'DATA' }); await Share.share({ title: f.name, files: [uri] }); }
    catch (err) { if (!/cancel/i.test(err.message || '')) toast('Teilen hat nicht geklappt'); }
  }
  const fileIcon = k => `<span class="ficon ${k}">${{ pdf: 'PDF', bild: 'BILD', video: 'VID', andere: 'DATEI' }[k]}</span>`;
  function openFileSheet(f) {
    let confirmDel = false;
    const draw = () => {
      const k = kindOf(f), links = linkedEntries(f);
      const cands = state.entries.filter(e => !e.done && e.type !== 'place' && inArea(e) && !(e.fileIds || []).includes(f.id)).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
      showSheet(`
        <div class="sheet-head"><h3>Dokument</h3>${ctxChip(ctxOf(f))}</div>
        ${k === 'bild' ? `<img class="file-hero" data-photo="${esc(f.path)}" data-fopen alt="">` : `<button type="button" class="file-open" data-fopen>${fileIcon(k)}<span><b>${esc(f.file || f.name)}</b><span class="sub">${fmtSize(f.size)} · Tippen zum Ansehen</span></span></button>`}
        <div class="field"><label for="d-name">Name</label><input id="d-name" value="${esc(f.name)}"></div>
        <div class="field"><label for="d-note">Notiz</label><textarea id="d-note" placeholder="Worum geht es, wo ist das Original">${esc(f.note || '')}</textarea></div>
        <div class="dept">Verknüpft mit</div>
        ${links.length ? `<ul class="timeline">${links.map(e => `<li><span class="when">${e.date ? fmtDate(e.date) : '—'}</span><div class="body"><div class="title" data-dlinkopen="${e.id}" style="cursor:pointer">${esc(e.title)}</div><div class="desc">${TYPE[e.type].label}</div></div><button type="button" class="icon-btn small" data-dunlink="${e.id}" aria-label="Verknüpfung lösen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></li>`).join('')}</ul>` : '<p class="hint">Noch mit nichts verknüpft.</p>'}
        ${cands.length ? `<div class="field"><label for="d-link" class="sr-only">Eintrag wählen</label><select id="d-link"><option value="">Eintrag wählen …</option>${cands.map(e => `<option value="${e.id}">${esc(e.title)}${e.date ? ' · ' + fmtDate(e.date) : ''}</option>`).join('')}</select><div class="row-actions" style="margin:0"><button class="btn small" id="d-linkBtn" type="button">Verknüpfen</button></div></div>` : ''}
        <p class="hint">Abgelegt ${new Date(f.addedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        <div class="sheet-actions"><button class="btn ghost" id="d-del">${confirmDel ? 'Wirklich löschen?' : 'Löschen'}</button>${Share && FS ? '<button class="btn" id="d-share">Teilen</button>' : ''}<button class="btn primary" id="d-save">Fertig</button></div>`,
        'Dokument', ev => {
          const b = ev.target.closest('button, [data-fopen], [data-dlinkopen]'); if (!b) return;
          f.name = (document.getElementById('d-name').value || '').trim() || f.name; f.note = (document.getElementById('d-note').value || '').trim();
          if (b.dataset.fopen !== undefined) return openFile(f);
          if (b.dataset.ctxToggle !== undefined) { f.context = ctxOf(f) === 'arbeit' ? 'privat' : 'arbeit'; save(); haptic('select'); return draw(); }
          if (b.dataset.dlinkopen) { save(); return openSheet(state.entries.find(e => e.id === b.dataset.dlinkopen)); }
          if (b.dataset.dunlink) { const e = state.entries.find(x => x.id === b.dataset.dunlink); e.fileIds = e.fileIds.filter(x => x !== f.id); save(); return draw(); }
          if (b.id === 'd-linkBtn') { const id = document.getElementById('d-link').value; if (!id) return; const e = state.entries.find(x => x.id === id); (e.fileIds = e.fileIds || []).push(f.id); save(); haptic('select'); toast('Verknüpft'); return draw(); }
          if (b.id === 'd-share') return shareFile(f);
          if (b.id === 'd-del') {
            if (!confirmDel) { confirmDel = true; return draw(); }
            state.files = state.files.filter(x => x.id !== f.id); state.entries.forEach(e => { if (e.fileIds) e.fileIds = e.fileIds.filter(x => x !== f.id); });
            if (FS && !f.path.startsWith('data:')) FS.deleteFile({ path: f.path, directory: 'DATA' }).catch(() => {});
            save(); closeSheet(); render(); toast('Gelöscht'); return;
          }
          if (b.id === 'd-save') { save(); closeSheet(); render(); }
        });
      hydratePhotos(sheetRoot);
    };
    draw();
  }
  function pickMedia({ camera, video }) {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = camera ? (video ? 'video/*' : 'image/*') : 'image/*,video/*';
      if (camera) input.setAttribute('capture', 'environment');
      input.onchange = () => resolve(input.files[0] || null);
      input.click();
    });
  }
  async function storeMedia(file, fromCamera) {
    const vid = /^video\//.test(file.type) || /\.(mov|mp4|m4v)$/i.test(file.name || '');
    const path = vid ? await saveVideo(file) : await savePhoto(await fileToJpegBase64(file));
    // aus der Mediathek: Aufnahmezeit der Datei, sonst jetzt
    noteMedia(path, !fromCamera && file.lastModified && file.lastModified < Date.now() - 60e3 ? file.lastModified : Date.now());
    return path;
  }
  async function deleteMedia(paths) {
    const used = new Set(state.entries.flatMap(e => e.photos || []));
    for (const p of paths) {
      if (used.has(p)) continue;
      if (p.startsWith('blob:')) { URL.revokeObjectURL(p); continue; }
      if (FS && !p.startsWith('data:')) FS.deleteFile({ path: p, directory: 'DATA' }).catch(() => {});
    }
  }
  const playIcon = '<span class="play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg></span>';
  const mediaThumbs = list => list.length ? `<div class="photos">${list.map((p, i) => isVideo(p)
    ? `<button type="button" class="vthumb" data-view="${i}" aria-label="Video ${i + 1} abspielen"><video data-photo="${esc(p)}" muted playsinline preload="metadata"></video>${playIcon}</button>`
    : `<img data-photo="${esc(p)}" data-view="${i}" alt="Foto ${i + 1}">`).join('')}</div>` : '';

  /* ---------- Brief-Scanner ---------- */
  async function scanLetter() {
    const file = await pickImage({ camera: true });
    if (!file) return;
    toast('Brief wird gelesen …');
    try {
      const b64 = await fileToJpegBase64(file);
      const path = await savePhoto(b64);
      let text = '';
      if (Native) { try { text = (await Native.recognizeText({ base64: b64 })).text || ''; } catch (err) { toast('Texterkennung fehlgeschlagen'); } }
      const draft = draftFromText(text);
      draft.photos = [path];
      openSheet(null, { draft, info: text ? null : 'Texterkennung gibt es nur in der iPhone-App. Füge den Text unten ein oder trag die Frist selbst ein.' });
    } catch (err) { toast(err.message); }
  }
  function draftFromText(text) {
    const a = text ? L.analyzeLetter(text, { today: today(), state: state.settings.state }) : {};
    const notes = [a.reference, a.amount && `Betrag: ${a.amount}`].filter(Boolean).join('\n');
    return newEntry({
      type: a.deadline ? 'deadline' : 'task', title: a.sender ? `Brief von ${a.sender}` : 'Brief', source: 'Brief',
      received: a.letterDate && a.letterDate <= today() ? a.letterDate : today(), date: a.deadline || today(), leadDays: 7,
      notes: [notes, ...(a.notes || [])].filter(Boolean).join('\n'), ocrText: text,
      _calc: a.period ? { ...a.period, fiction: a.isAuthority } : null,
    });
  }

  /* ---------- Kopieren ---------- */
  function entryText(e) {
    const t = today(), out = [];
    out.push(`${TYPE[e.type].label}: ${e.title || '(ohne Titel)'}`);
    const c = caseById(e.caseId); if (c) out.push(`${ctxOf(c) === 'arbeit' ? 'Projekt' : 'Vorgang'}: ${c.title}`);
    if (e.ref) out.push(`Nummer: ${e.ref}`);
    const who = contactById(e.contactId); if (who) out.push(`Person: ${who.name}${who.company ? ' (' + who.company + ')' : ''}`);
    if (e.type === 'deadline' && e.date) {
      const left = daysBetween(t, e.date);
      out.push(`Frist bis: ${longDate(e.date)} (${left < 0 ? `${-left} Tage überfällig` : left === 0 ? 'heute' : left === 1 ? 'morgen' : `noch ${left} Tage`})`);
      if (e.received || e.source) out.push(`Eingegangen: ${[e.received && shortDate(e.received), e.source && `per ${e.source}`].filter(Boolean).join(' ')}`);
      if (e.leadDays) out.push(`Erinnerung: ${e.leadDays} ${e.leadDays === 1 ? 'Tag' : 'Tage'} vorher`);
    } else if (e.type === 'contract' && e.contract) {
      if (e.source) out.push(`Anbieter: ${e.source}`);
      out.push(`Laufzeit bis: ${longDate(e.contract.termEnd)}`);
      out.push(`Kündigungsfrist: ${e.contract.noticeN} ${e.contract.noticeUnit}`);
      if (e.date) out.push(`Kündigen spätestens: ${longDate(e.date)}`);
    } else if (e.type === 'document' && e.date) {
      out.push(`Gültig bis: ${longDate(e.date)}`);
    } else if (e.type === 'waiting') {
      if (e.source) out.push(`Bei: ${e.source}`);
      if (e.received) out.push(`Wartet seit: ${shortDate(e.received)}`);
      if (e.date) out.push(`Nachhaken am: ${longDate(e.date)}`);
    } else if (e.type !== 'place' && e.date) {
      out.push(`Wann: ${longDate(e.date)}${e.time ? `, ${e.time} Uhr` : ''}`);
    }
    if (e.repeat && e.repeat !== 'none') out.push(`Wiederholung: ${{ daily: 'täglich', weekly: 'wöchentlich', monthly: 'monatlich' }[e.repeat]}`);
    if (e.type === 'place') {
      out.push(`Ort: ${listTarget(e)}`);
      if (e.items.length) { out.push('Liste:'); L.sortItems(e.items, routeFor(e)).forEach(({ it }) => out.push(`${it.done ? '[x]' : '[ ]'} ${it.text}`)); }
    }
    if (e.type !== 'place' && e.items?.length) { out.push('Checkliste:'); e.items.forEach(i => out.push(`${i.done ? '[x]' : '[ ]'} ${i.text}`)); }
    if (e.fileIds?.length) out.push(`Dokumente: ${e.fileIds.map(id => fileById(id)?.name).filter(Boolean).join(', ')}`);
    if (e.loc) out.push(`Ort: ${e.loc.name}${e.loc.address ? ', ' + e.loc.address : ''}`);
    if (e.timeLog?.length) out.push(`Zeitaufwand: ${fmtDur(loggedMs(e))}${state.settings.billRound ? ` (abgerechnet ${fmtDur(roundMs(loggedMs(e)))})` : ''}`);
    if (e.flex) out.push('Flexibel: irgendwann bis zu diesem Tag');
    out.push(`Bereich: ${e.context === 'arbeit' ? 'Arbeit' : 'Privat'}`);
    out.push(`Status: ${e.done ? `erledigt${e.doneAt ? ' am ' + new Date(e.doneAt).toLocaleDateString('de-DE') : ''}` : 'offen'}`);
    if (e.proof) out.push(`Nachweis: ${e.proof.method}${e.proof.note ? ' – ' + e.proof.note : ''}`);
    if (e.notes) { out.push('Details:'); out.push(e.notes); }
    if (e.ocrText) { out.push('Text aus dem Brief:'); out.push(e.ocrText); }
    return out.join('\n');
  }
  function nudgeText(e) {
    const who = contactById(e.contactId);
    const greet = who ? (/^(frau|herr)\s/i.test(who.name) ? `Hallo ${who.name}` : `Hallo ${who.name.split(' ')[0]}`) : 'Hallo';
    const since = e.received ? ` vom ${shortDate(e.received)}` : '';
    return `${greet},\n\nkurze Nachfrage zu „${e.title}“${e.ref ? ` (${e.ref})` : ''}${since}: Gibt es dazu schon einen Stand?\n\nViele Grüße`;
  }
  function dayText() {
    const m = dayModel(today());
    const parts = [`WDID – ${longDate(today())}${area() !== 'alle' ? ' – ' + AREAS[area()] : ''}`];
    const block = (title, list) => { if (list.length) parts.push(`\n== ${title} ==\n` + list.map(entryText).join('\n\n')); };
    block('Liegengeblieben', m.overdue); block('Heute', m.todays); block('Fristen in Sicht', m.upcoming); block('Nachhaken', m.followUp); block('Ortslisten', m.lists);
    return parts.join('\n');
  }
  async function copyText(text, label = 'Kopiert') {
    try { if (Clip) await Clip.write({ string: text }); else await navigator.clipboard.writeText(text); toast(label); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand && document.execCommand('copy'); ta.remove();
      toast(ok ? label : 'Kopieren hat nicht geklappt');
    }
  }

  /* ---------- Bausteine ---------- */
  function itemRow(e, { showDate = false } = {}) {
    const t = today();
    const overdue = !e.done && e.date && e.date < t && e.type !== 'document';
    let timeCol = e.time || '—';
    if (e.type === 'deadline') timeCol = 'Frist';
    if (e.type === 'waiting') timeCol = 'Warten';
    if (e.type === 'contract') timeCol = 'Vertrag';
    if (e.type === 'document') timeCol = 'Dok.';
    if (showDate && e.date && !['contract', 'document'].includes(e.type)) timeCol = parse(e.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    const tags = [];
    const left = e.date ? daysBetween(t, e.date) : null;
    const leftTxt = (verb) => left < 0 ? `${-left} ${-left === 1 ? 'Tag' : 'Tage'} überfällig` : left === 0 ? `heute ${verb}` : left === 1 ? `morgen ${verb}` : `noch ${left} Tage · ${fmtDate(e.date)}`;
    if (e.type === 'deadline' && e.date) {
      tags.push(`<span class="tag due">${leftTxt('fällig')}</span>`);
      if (e.source) tags.push(`<span class="tag plain">${esc(e.source)}${e.received ? ' vom ' + parse(e.received).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''}</span>`);
    } else if (e.type === 'contract' && e.date) {
      tags.push(`<span class="tag due">kündigen ${left < 0 ? 'verpasst' : left === 0 ? 'heute' : `bis ${fmtDate(e.date)}`}</span>`);
    } else if (e.type === 'document' && e.date) {
      tags.push(`<span class="tag ${left <= (e.leadDays || 60) ? 'due' : 'plain'}">${left < 0 ? 'abgelaufen' : `gültig bis ${fmtDate(e.date)}`}</span>`);
    } else if (e.type === 'waiting') {
      if (e.source) tags.push(`<span class="tag plain">${esc(e.source)}</span>`);
      if (e.date) tags.push(`<span class="tag ${left <= 0 ? 'due' : 'plain'}">${left <= 0 ? 'nachhaken' : `nachhaken am ${fmtDate(e.date)}`}</span>`);
    } else if (overdue) {
      tags.push(`<span class="tag due">seit ${fmtDate(e.date)}</span>`);
    }
    if (e.ref) tags.push(`<span class="tag plain mono">${esc(e.ref)}</span>`);
    if (e.fileIds?.length) tags.push(`<span class="tag plain">${e.fileIds.length} Dok.</span>`);
    if (e.loc) tags.push(`<span class="tag plain">📍 ${esc(e.loc.name)}${e.timeAuto?.start ? ' · Zeit auto' : ''}</span>`);
    const who = contactById(e.contactId); if (who) tags.push(`<button type="button" class="tag person" data-contact="${who.id}">${esc(who.name)}</button>`);
    const c = caseById(e.caseId); if (c) tags.push(`<span class="tag plain">${esc(c.title)}</span>`);
    if (e.type !== 'place' && e.items?.length) { const d = e.items.filter(i => i.done).length; tags.push(`<span class="tag ${d === e.items.length ? '' : 'plain'}">☑ ${d}/${e.items.length}</span>`); }
    if (e.flex && !e.done && e.date > t) tags.push(`<span class="tag plain">bis ${fmtDate(e.date)}</span>`);
    if (state.timer?.entryId === e.id) tags.push(`<span class="tag work" data-elapsed="${state.timer.start}" data-base="${loggedMs(e) - (Date.now() - state.timer.start)}">läuft</span>`);
    else if (e.timeLog?.length) tags.push(`<span class="tag plain">${fmtDur(loggedMs(e))}</span>`);
    if (e.photos?.length) { const v = e.photos.filter(isVideo).length, f = e.photos.length - v; tags.push(`<span class="tag plain">${[f && `${f} Foto${f > 1 ? 's' : ''}`, v && `${v} Video${v > 1 ? 's' : ''}`].filter(Boolean).join(', ')}</span>`); }
    if (e.context === 'arbeit' && area() === 'alle') tags.push('<span class="tag work">Arbeit</span>');
    if (e.repeat && e.repeat !== 'none') tags.push(`<span class="tag plain">${{ daily: 'täglich', weekly: 'wöchentlich', monthly: 'monatlich' }[e.repeat]}</span>`);
    return `<div class="item ${e.done ? 'done' : ''} ${overdue ? 'overdue' : ''}">
      <div class="time">${esc(timeCol)}</div>
      <div class="body" data-edit="${e.id}">
        <div class="title">${esc(e.title)}</div>
        ${e.notes ? `<div class="desc">${esc(e.notes.split('\n')[0])}</div>` : ''}
        ${tags.length ? `<div class="meta">${tags.join('')}</div>` : ''}
      </div>
      <button class="check" data-done="${e.id}" aria-label="${e.done ? 'Wieder öffnen' : 'Erledigt'}">${checkSvg}</button>
    </div>`;
  }
  const group = (title, rows, aside = '') => `<section class="group"><h2><span>${title}</span><span>${aside}</span></h2><div class="list">${rows}</div></section>`;
  const areaSwitch = () => {
    const keys = Object.keys(AREAS), i = keys.indexOf(area());
    return `<div class="areas" role="tablist" aria-label="Bereich" style="--n:${keys.length};--pos:${areaMemo ?? i}" data-pos="${i}">${keys.map(k => `<button role="tab" data-area="${k}" aria-selected="${k === area()}">${AREAS[k]}</button>`).join('')}</div>`;
  };
  let areaMemo = null;
  const ctxChip = ctx => `<button type="button" class="ctx-chip ${ctx === 'arbeit' ? 'work' : ''}" data-ctx-toggle aria-label="Bereich wechseln, gerade ${ctx === 'arbeit' ? 'Arbeit' : 'Privat'}"><i></i>${ctx === 'arbeit' ? 'Arbeit' : 'Privat'}<svg viewBox="0 0 24 24"><path d="M7 10l5-5 5 5M7 14l5 5 5-5"/></svg></button>`;
  const header = (eyebrow, title, extra = '') => areaSwitch() + `<header class="top"><div><div class="weekday">${eyebrow}</div><h1>${title}</h1></div>${extra || '<div class="brand">WDID</div>'}</header>`;
  const gearBtn = '<button class="icon-btn" id="openSettings" aria-label="Einstellungen"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>';

  function shoppingList(l, { compact = false } = {}) {
    const sorted = L.sortItems(l.items, routeFor(l));
    let lastCat = null, html = '<ul class="checklist">';
    for (const { it, i, cat } of sorted) {
      if (!it.done && cat !== lastCat && !compact) { html += `<li class="dept" aria-hidden="true">${L.DEPT_NAME[cat]}</li>`; lastCat = cat; }
      if (it.done && lastCat !== 'done' && !compact) { html += '<li class="dept" aria-hidden="true">Im Wagen</li>'; lastCat = 'done'; }
      html += `<li class="${it.done ? 'got' : ''}"><input type="checkbox" id="ci-${l.id}-${i}" data-list="${l.id}" data-idx="${i}" ${it.done ? 'checked' : ''}><span><label for="ci-${l.id}-${i}">${esc(it.text)}</label></span></li>`;
    }
    html += '</ul>';
    // Vorrats-Vorschläge: was du sonst um diese Zeit kaufst
    if (l.group === 'supermarkt' || placeById(l.placeId)?.group === 'supermarkt') {
      const openNames = new Set(state.entries.filter(e => e.type === 'place').flatMap(e => e.items.filter(i => !i.done).map(i => L.norm(i.text))));
      const sug = L.suggestions(state.history, openNames, Date.now());
      if (sug.length) html += `<div class="sub">Bald wieder fällig</div><div class="chips">${sug.map(s => `<button class="chip add" data-suggest="${l.id}" data-name="${esc(s.name)}">${esc(s.name.charAt(0).toUpperCase() + s.name.slice(1))} <span class="sub">· alle ${s.everyDays} T.</span></button>`).join('')}</div>`;
    }
    return html;
  }

  /* ---------- Ansichten ---------- */
  function viewHeute() {
    const d = new Date(), t = today(), m = dayModel(t);
    const visible = arr => arr;
    const openToday = visible(m.todays).filter(e => !e.done).length;
    const pills = [];
    if (m.overdue.length) pills.push(`<span class="pill due">${m.overdue.length} liegengeblieben</span>`);
    pills.push(`<span class="pill">${openToday} offen heute</span>`);
    if (m.upcoming.length) pills.push(`<span class="pill due">${m.upcoming.length} in Sicht</span>`);
    if (m.followUp.length) pills.push(`<span class="pill due">${m.followUp.length} nachhaken</span>`);
    if (m.lists.length) pills.push(`<span class="pill ok">${m.lists.length} Ortslisten</span>`);

    let html = header(d.toLocaleDateString('de-DE', { weekday: 'long' }), d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }));
    if (state.sample) html += '<p class="note">Beispieldaten. Unter „Alles“ kannst du sie mit „Beispiele löschen“ entfernen.</p>';
    html += `<div class="segmented compact">${[['tag', 'Tag'], ['woche', 'Woche']].map(([k, l]) => `<button class="chip" data-dayview="${k}" aria-pressed="${dayView === k}">${l}</button>`).join('')}</div>`;
    html += timerBanner();
    if (area() !== 'privat' && state.handover && state.handover.date < t && state.handover.text) html += `<div class="card accent"><div class="card-row"><h3>Von gestern: zuerst</h3><button class="link" id="handoverDone">Erledigt</button></div><div class="desc" style="white-space:pre-wrap">${esc(state.handover.text)}</div></div>`;
    if (dayView === 'woche') return html + weekView(t);
    html += `<div class="summary">${pills.join('')}<button class="pill" id="copyDay" type="button">Tag kopieren</button></div>`;
    const dayItems = visible(m.todays), dayDone = dayItems.filter(e => e.done).length;
    if (dayItems.length) html += `<div class="day-progress">${progressBar('day', dayDone, dayItems.length)}<span><b>${dayDone}</b> von ${dayItems.length} geschafft</span></div>`;
    if (state.settings.eveningOn && nowMinutes() >= toMinutes(state.settings.eveningTime)) {
      const doneToday = state.log.filter(l => iso(new Date(l.at)) === t && logInArea(l)).length;
      html += `<div class="banner"><span>Tagesabschluss: ${doneToday} erledigt, ${openToday + m.overdue.length} offen</span><button class="btn small" data-review>Rückblick</button></div>`;
    }
    if (area() === 'arbeit' && !inWorkHours()) html += `<div class="banner"><span>Feierabend. Die Arbeit kann warten.</span><span class="row-actions" style="margin:0">${state.settings.handoverOn ? '<button class="btn small" data-handover>Übergabe</button>' : ''}<button class="btn small" data-area="privat">Zu Privat</button></span></div>`;

    if (visible(m.overdue).length) html += group('Liegengeblieben', visible(m.overdue).map(e => itemRow(e, { showDate: true })).join(''), `<button class="link" data-review>auf morgen</button>`);
    html += group('Heute', visible(m.todays).length ? visible(m.todays).map(e => itemRow(e)).join('') : '<div class="empty">Nichts geplant. Mit + legst du etwas an.</div>');
    if (m.week.length) html += group('Diese Woche, flexibel', m.week.map(e => itemRow(e)).join(''));
    if (visible(m.upcoming).length) html += group('Fristen in Sicht', visible(m.upcoming).map(e => itemRow(e)).join(''));
    if (m.followUp.length) html += group('Nachhaken', m.followUp.map(e => itemRow(e)).join(''));
    if (m.lists.length) html += group('Wenn du unterwegs bist', m.lists.map(e => {
      const left = e.items.filter(i => !i.done);
      const p = placeById(e.placeId);
      const label = p?.kind === 'person' ? `Wenn du ${p.name} siehst` : listTarget(e);
      return `<div class="item"><div class="time">${p?.kind === 'person' ? 'Person' : 'Ort'}</div><div class="body" data-goto="orte"><div class="title">${esc(label)} · ${esc(e.title)}</div>
        <div class="desc">${left.length} von ${e.items.length} offen: ${esc(left.slice(0, 3).map(i => i.text).join(', '))}${left.length > 3 ? ' …' : ''}</div></div><span></span></div>`;
    }).join(''));
    return html;
  }

  let dayView = 'tag';
  function timerBanner() {
    const tm = state.timer; if (!tm) return '';
    const e = state.entries.find(x => x.id === tm.entryId); if (!e) { state.timer = null; return ''; }
    return `<div class="banner timer"><span><b data-elapsed="${tm.start}" data-base="${loggedMs(e) - (Date.now() - tm.start)}">${fmtDur(loggedMs(e))}</b> · ${esc(e.title)}</span><button class="btn small" id="stopTimer">Stopp</button></div>`;
  }
  function weekView(t) {
    let html = '';
    const mine = state.entries.filter(e => inArea(e) && e.type !== 'place' && !e.done && e.date);
    const over = mine.filter(e => e.date < t && !['contract', 'document', 'waiting'].includes(e.type));
    if (over.length) html += group('Liegengeblieben', over.map(e => itemRow(e, { showDate: true })).join(''));
    for (let i = 0; i < 7; i++) {
      const day = addDays(t, i);
      const rows = mine.filter(e => e.date === day && !(e.flex && i > 0)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
      const label = i === 0 ? 'Heute' : i === 1 ? 'Morgen' : parse(day).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'short' });
      const free = !L.isWorkday(day, state.settings.state);
      html += group(label, rows.length ? rows.map(e => itemRow(e)).join('') : `<div class="empty small">${free && area() === 'arbeit' ? 'Frei' : 'Nichts geplant'}</div>`);
    }
    const flex = mine.filter(e => e.flex && e.date > t && daysBetween(t, e.date) <= 6);
    if (flex.length) html += group('Flexibel diese Woche', flex.map(e => itemRow(e)).join(''));
    return html;
  }

  function viewOrte() {
    let html = header('Ortsgebunden', 'Orte', '<button class="btn small" id="addPlace">Ort hinzufügen</button>');
    if (native && locationStatus !== 'always' && state.places.some(p => p.lat != null)) {
      html += `<div class="banner"><span>Damit WDID sich bei Ankunft meldet, braucht es Standort „Immer“.</span><button class="btn small" id="askAlways">Erlauben</button></div>`;
    } else {
      html += '<p class="note">Speichere den Standort einmal vor Ort. Danach meldet sich WDID, wenn du ankommst, auch bei geschlossener App. Listen für „Jeder Supermarkt“ gelten in allen Läden dieser Art.</p>';
    }
    html += '<div class="row-actions" style="margin:0 0 20px"><button class="btn" id="locate">Wo bin ich gerade?</button></div>';

    const cardFor = (title, sub, lists, p, isNear) => {
      let h = `<div class="card ${isNear ? 'accent' : ''}"><div class="card-row"><h3>${esc(title)}</h3><span class="sub">${sub}</span></div>`;
      lists.forEach(l => {
        h += `<div class="card-row"><span class="sub" data-edit="${l.id}" style="cursor:pointer">${esc(l.title)}${l.context === 'arbeit' && area() === 'alle' ? ' · Arbeit' : ''}</span><span class="sub">${l.items.filter(i => i.done).length}/${l.items.length}</span></div>`;
        h += progressBar('list-' + l.id, l.items.filter(i => i.done).length, l.items.length);
        const pl = placeById(l.placeId);
        h += shoppingList(l, { compact: !l.group && pl?.kind !== 'store' });
        h += `<div class="row-actions"><button class="btn small" data-addlist="${l.id}">Punkt hinzufügen</button><button class="btn small ghost" data-copylist="${l.id}">Kopieren</button><button class="btn small ghost" data-clear="${l.id}">Abgehakte entfernen</button></div>`;
      });
      if (!lists.length) h += `<div class="sub">${p?.group && groupLists.some(l => l.group === p.group) ? `Die Listen für „Jeder ${GROUPS[p.group]}“ gelten hier auch.` : 'Keine offenen Listen.'}</div>`;
      if (p) h += `<div class="row-actions">${p.kind !== 'person' ? `<button class="btn small" data-pin="${p.id}">Standort hier speichern</button>` : ''}<button class="btn small ghost" data-newlist="${p.id}">Neue Liste</button><button class="btn small ghost" data-editplace="${p.id}">Bearbeiten</button></div>`;
      return h + '</div>';
    };

    const groupLists = state.entries.filter(e => e.type === 'place' && !e.done && e.group && inArea(e));
    for (const [g, name] of Object.entries(GROUPS)) {
      const ls = groupLists.filter(l => l.group === g);
      if (!ls.length) continue;
      const members = state.places.filter(p => p.group === g).map(p => p.name);
      html += cardFor(`Jeder ${name}`, members.length ? esc(members.join(', ')) : 'Noch kein Laden zugeordnet', ls, null, false);
    }
    const stores = state.places.filter(p => p.kind !== 'person' && placeInArea(p));
    const persons = state.places.filter(p => p.kind === 'person' && placeInArea(p));
    stores.forEach(p => {
      let sub = p.lat != null ? `Standort gespeichert · ${p.radius} m` : 'Kein Standort gespeichert';
      let near = false;
      if (here && p.lat != null) { const m = dist(here, p); near = m <= p.radius; sub = near ? 'Du bist hier' : `${m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km'} entfernt`; }
      if (p.group) sub += ` · ${GROUPS[p.group]}`;
      html += cardFor(p.name, sub, state.entries.filter(e => e.type === 'place' && !e.done && e.placeId === p.id && inArea(e)), p, near);
    });
    if (persons.length) {
      html += '<section class="group"><h2><span>Personen</span><span></span></h2></section>';
      persons.forEach(p => { html += cardFor(`Wenn du ${p.name} siehst`, '', state.entries.filter(e => e.type === 'place' && !e.done && e.placeId === p.id && inArea(e)), p, false); });
    }
    if (!stores.length && !persons.length && !groupLists.length) html += '<div class="empty">Noch keine Orte. Tippe auf „Ort hinzufügen“.</div>';
    return html;
  }

  let papersTab = 'ablage', fileFilter = 'alle', fileQuery = '';
  function viewPapiere() {
    let html = header('Papierkram', 'Papiere', '<button class="btn small primary" id="scan">Brief scannen</button>');
    const segs = [['ablage', 'Ablage'], ['vorgaenge', area() === 'arbeit' ? 'Projekte' : 'Vorgänge'], ['personen', 'Personen'], ['warten', 'Wartet auf'], ['vertraege', 'Verträge'], ['dokumente', 'Dokumente']];
    html += `<div class="segmented">${segs.map(([k, l]) => `<button class="chip" data-paper="${k}" aria-pressed="${papersTab === k}">${l}</button>`).join('')}</div>`;
    const sortByDate = (a, b) => (a.date || '9999').localeCompare(b.date || '9999');
    if (papersTab === 'ablage') {
      const q = fileQuery.trim().toLowerCase();
      // Dokumente aus der Ablage plus Fotos und Videos aus Einträgen, alles an einem Ort
      const docs = state.files.filter(inArea).map(f => ({ f, k: kindOf(f), at: f.addedAt, links: linkedEntries(f) }));
      const media = state.entries.filter(inArea).flatMap(e => (e.photos || []).map((p, i) => ({ media: p, e, i, k: isVideo(p) ? 'video' : 'bild', at: state.media[p]?.at || e.createdAt })));
      let all = [...docs, ...media].sort((a, b) => b.at - a.at);
      if (fileFilter !== 'alle') all = all.filter(x => x.k === fileFilter);
      if (q) all = all.filter(x => (x.f ? [x.f.name, x.f.file, x.f.note, ...x.links.map(e => e.title)] : [x.e.title, x.e.ref, mediaCaption(x.media)]).join(' ').toLowerCase().includes(q));
      html += `<div class="row-actions" style="margin:0 0 14px"><button class="btn small primary" id="addFiles">Datei ablegen</button></div>`;
      html += `<input class="search" id="fq" type="search" placeholder="Dokumente durchsuchen" value="${esc(fileQuery)}">`;
      html += `<div class="filters">${[['alle', 'Alle'], ['pdf', 'PDFs'], ['bild', 'Bilder'], ['video', 'Videos'], ['andere', 'Andere']].map(([k, l]) => `<button class="chip" data-ffilter="${k}" aria-pressed="${fileFilter === k}">${l}</button>`).join('')}</div>`;
      if (!all.length) html += `<div class="empty">${state.files.length || q ? 'Nichts gefunden.' : 'Hier liegen alle deine Dokumente: PDFs, Scans, Bilder, Videos, auch aus der Dateien-App. Fotos aus Einträgen tauchen automatisch auf. Jedes Dokument lässt sich mit Einträgen verknüpfen.'}</div>`;
      else html += `<div class="files">${all.slice(0, 300).map(x => x.f
        ? `<button class="file-row" data-file="${x.f.id}">${x.k === 'bild' ? `<img data-photo="${esc(x.f.path)}" alt="">` : fileIcon(x.k)}<span class="fbody"><b>${esc(x.f.name)}</b><span class="sub">${[fmtSize(x.f.size), new Date(x.at).toLocaleDateString('de-DE'), x.links.length ? `↔ ${esc(x.links[0].title)}${x.links.length > 1 ? ' +' + (x.links.length - 1) : ''}` : ''].filter(Boolean).join(' · ')}</span></span></button>`
        : `<button class="file-row" data-emedia="${x.e.id}" data-ei="${x.i}">${x.k === 'bild' ? `<img data-photo="${esc(x.media)}" alt="">` : `<span class="ficon video">VID</span>`}<span class="fbody"><b>${esc(x.e.title)}</b><span class="sub">${esc(mediaCaption(x.media) || new Date(x.at).toLocaleDateString('de-DE'))} · aus Eintrag</span></span></button>`).join('')}</div>`;
    } else if (papersTab === 'vorgaenge') {
      const order = Object.keys(CASE_STATUS);
      const cases = state.cases.filter(c => !c.closed && inArea(c)).sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.createdAt - a.createdAt);
      const word = area() === 'arbeit' ? 'Projekt' : 'Vorgang';
      html += `<div class="row-actions" style="margin:0 0 16px"><button class="btn small" id="newCase">${area() === 'arbeit' ? 'Neues Projekt' : 'Neuer Vorgang'}</button></div>`;
      if (!cases.length) html += `<div class="empty">Ein ${word} bündelt alles zu einer Sache: Briefe, Aufgaben, Fristen, Fotos, Personen. Lege einen an oder ordne einen Eintrag zu.</div>`;
      cases.forEach(c => {
        const es = state.entries.filter(e => e.caseId === c.id);
        const next = es.filter(e => !e.done && e.date).sort(sortByDate)[0];
        const ms = es.reduce((a, e) => a + loggedMs(e), 0);
        const st = c.status || 'offen';
        html += `<div class="card" data-case="${c.id}" style="cursor:pointer"><div class="card-row"><h3>${esc(c.title)}</h3><span class="tag ${st === 'offen' ? '' : st === 'pausiert' ? 'plain' : 'due'}">${CASE_STATUS[st]}</span></div>
          ${c.next ? `<div><span class="sub">Nächster Schritt:</span> ${esc(c.next)}</div>` : ''}
          <div class="sub">${[next ? `Nächstes: ${esc(next.title)} · ${fmtDate(next.date)}` : (es.some(e => !e.done) ? `${es.filter(e => !e.done).length} offen` : 'Nichts offen'), `${es.length} Einträge`, ms ? fmtDur(ms) : ''].filter(Boolean).join(' · ')}</div></div>`;
      });
      const closed = state.cases.filter(c => c.closed && inArea(c));
      if (closed.length) html += `<p class="note">${closed.length} abgeschlossen. Du findest sie über die Suche unter „Alles“.</p>`;
    } else if (papersTab === 'personen') {
      const ks = state.contacts.filter(inArea).sort((a, b) => a.name.localeCompare(b.name, 'de'));
      html += '<div class="row-actions" style="margin:0 0 16px"><button class="btn small" id="newContact">Person anlegen</button></div>';
      if (!ks.length) html += '<div class="empty">Kunden, Kollegen, Ansprechpartner: mit allem, was bei ihnen offen ist. Im Eintrag wählst du die Person aus, in der Schnelleingabe reicht @Name.</div>';
      ks.forEach(k => {
        const open = state.entries.filter(e => e.contactId === k.id && !e.done), last = lastContact(k);
        html += `<div class="card" data-contact="${k.id}" style="cursor:pointer"><div class="card-row"><h3>${esc(k.name)}</h3><span class="sub">${open.length ? `${open.length} offen` : 'nichts offen'}</span></div>
          <div class="sub">${[k.company && esc(k.company), last ? `zuletzt ${relDay(last)}` : 'noch kein Kontakt notiert'].filter(Boolean).join(' · ')}</div></div>`;
      });
    } else {
      const type = { vertraege: 'contract', dokumente: 'document', warten: 'waiting' }[papersTab];
      const list = state.entries.filter(e => e.type === type && !e.done && inArea(e)).sort(sortByDate);
      const intro = { contract: 'Handy, Strom, Fitnessstudio, Versicherung: WDID erinnert dich vor dem letzten Kündigungstag.',
        document: 'Ausweis, Pass, Führerschein, TÜV, Garantien: mit Ablaufdatum und Foto.',
        waiting: 'Erstattungen, Rückrufe, Antworten: WDID erinnert dich ans Nachhaken.' }[type];
      html += `<p class="note">${intro}</p><div class="row-actions" style="margin:0 0 16px"><button class="btn small" data-newtype="${type}">${TYPE[type].label} anlegen</button></div>`;
      html += list.length ? `<div class="list">${list.map(e => itemRow(e)).join('')}</div>` : '<div class="empty">Noch nichts eingetragen.</div>';
    }
    return html;
  }

  let logQuery = '', billMonth = 0;
  function viewVerlauf() {
    const t = today(), d = new Date();
    const monday = addDays(t, -((d.getDay() + 6) % 7));
    const weekDone = state.log.filter(l => iso(new Date(l.at)) >= monday && logInArea(l)).length;
    const nextWeek = state.entries.filter(e => !e.done && DATED_ALERT.includes(e.type) && e.date && e.date > t && daysBetween(t, e.date) <= 7 && inArea(e));
    const waiting = state.entries.filter(e => e.type === 'waiting' && !e.done && inArea(e));
    let html = header('What did I do', 'Verlauf');
    html += `<div class="card"><div class="card-row"><h3>Diese Woche</h3><button class="btn small" data-review>Tagesrückblick</button></div>
      <div class="stat-row"><div class="stat"><b>${weekDone}</b><span>erledigt</span></div><div class="stat"><b>${nextWeek.length}</b><span>Fristen in 7 Tagen</span></div><div class="stat"><b>${waiting.length}</b><span>wartet auf</span></div></div>
      ${nextWeek.length ? `<div class="sub">${nextWeek.slice(0, 4).map(e => `${esc(e.title)} · ${fmtDate(e.date)}`).join('<br>')}</div>` : ''}
      <div class="row-actions" style="margin:0"><button class="btn small" id="copyWeek">Wochenbericht kopieren</button>${area() !== 'privat' ? '<button class="btn small" id="copyStandup">Standup kopieren</button>' : ''}</div></div>`;
    if (area() !== 'privat') {
      const bl = billing(billMonth);
      html += `<div class="card"><div class="card-row"><h3>Zeiten zum Abrechnen</h3><div class="chips">${[[0, 'Dieser Monat'], [-1, 'Letzter']].map(([k, l]) => `<button class="chip" data-billmonth="${k}" aria-pressed="${billMonth === k}">${l}</button>`).join('')}</div></div>
        ${bl.clients.length ? `<ul class="timeline">${bl.clients.map(c => `<li data-billclient="${esc(c.name)}" style="cursor:pointer"><span class="when">${fmtDur(c.billed)}</span><div class="body"><div class="title">${esc(c.name)}</div><div class="desc">${c.items.map(x => esc(x.e.title)).slice(0, 3).join(', ')}${c.items.length > 3 ? ' …' : ''}</div></div></li>`).join('')}</ul>
        <div class="row-actions" style="margin:0"><button class="btn small" id="copyBilling">${esc(bl.label)} kopieren</button></div><div class="sub">Tippe auf einen Kunden, um nur seine Zeiten zu kopieren.</div>` : `<div class="sub">${esc(bl.label)}: noch nichts erfasst. Im Eintrag unter „Zeiterfassung“ startest du die Uhr oder lässt sie bei Ankunft am Ort starten.</div>`}</div>`;
    }
    html += `<input class="search" id="logq" type="search" placeholder="Wann habe ich … ? z. B. Zählerstand, Widerspruch" value="${esc(logQuery)}">`;
    const q = logQuery.trim().toLowerCase();
    const entries = state.log.filter(l => logInArea(l) && (!q || `${l.title} ${l.place || ''}`.toLowerCase().includes(q)));
    if (!entries.length) return html + '<div class="empty">Hier sammelt sich alles, was du abhakst, mit Datum und Uhrzeit.</div>';
    let lastDay = null;
    entries.slice(0, 400).forEach(l => {
      const day = iso(new Date(l.at));
      if (day !== lastDay) { html += `<div class="log-day">${day === t ? 'Heute' : day === addDays(t, -1) ? 'Gestern' : longDate(day)}</div>`; lastDay = day; }
      html += `<div class="item"><div class="time">${hhmm(l.at)}</div><div class="body"><div class="title">${esc(l.title)}</div>${l.place ? `<div class="desc">bei ${esc(l.place)}</div>` : ''}</div><span></span></div>`;
    });
    return html;
  }

  let filter = 'alle', query = '';
  function viewAlles() {
    const q = query.trim().toLowerCase();
    const list = state.entries.filter(e => {
      if (!inArea(e)) return false;
      if (Object.keys(TYPE).includes(filter) && e.type !== filter) return false;
      if (filter === 'erledigt' ? !e.done : e.done) return false;
      if (!q) return true;
      return [e.title, e.notes, e.source, e.ocrText, e.ref, contactById(e.contactId)?.name, contactById(e.contactId)?.company, caseById(e.caseId)?.title, ...(e.fileIds || []).map(id => fileById(id)?.name), ...(e.items || []).map(i => i.text)].join(' ').toLowerCase().includes(q);
    }).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '').localeCompare(b.time || ''));
    const chips = [['alle', 'Alle'], ['deadline', 'Fristen'], ['reminder', 'Erinnerungen'], ['task', 'Aufgaben'], ['place', 'Ortslisten'], ['waiting', 'Wartet auf'], ['contract', 'Verträge'], ['document', 'Dokumente'], ['erledigt', 'Erledigt']]
      .map(([k, l]) => `<button class="chip" data-filter="${k}" aria-pressed="${filter === k}">${l}</button>`).join('');
    const rows = list.map(e => e.type === 'place'
      ? `<div class="item"><div class="time">Ort</div><div class="body" data-edit="${e.id}"><div class="title">${esc(listTarget(e))} · ${esc(e.title)}</div><div class="desc">${e.items.filter(i => !i.done).length} offen</div></div><span></span></div>`
      : itemRow(e, { showDate: true })).join('');
    return header('Archiv und Suche', 'Alles', gearBtn) +
      `<input class="search" id="q" type="search" placeholder="Suchen: Brief, Kaufland, RMA-Nummer, Person" value="${esc(query)}">
      <div class="filters">${chips}</div>
      ${rows ? `<div class="list">${rows}</div>` : '<div class="empty">Nichts gefunden.</div>'}
      <div class="row-actions" style="margin-top:28px"><button class="btn ghost" id="reset">${state.sample ? 'Beispiele löschen' : 'Alle Daten löschen'}</button></div>`;
  }

  /* ---------- Sheets ---------- */
  const sheetRoot = document.getElementById('sheetRoot');
  let sheetTimer;
  function showSheet(innerHtml, label, onClick, onChange) {
    clearTimeout(sheetTimer); sheetRoot.classList.remove('closing');
    const prev = sheetRoot.querySelector('.sheet'), top = prev && !sheetRoot.classList.contains('closing') && prev.getAttribute('aria-label') === label ? prev.scrollTop : null;
    sheetRoot.innerHTML = `<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}"><div class="inner"><div class="grabber"></div>${innerHtml}</div></div>`;
    // beim Neuzeichnen desselben Sheets nicht wieder hochspringen und nicht neu einfliegen
    if (top !== null) { const sh = sheetRoot.querySelector('.sheet'); sh.classList.add('still'); sh.scrollTop = top; }
    sheetRoot.onclick = ev => { if (ev.target.closest('[data-close]')) return closeSheet(); onClick && onClick(ev); };
    sheetRoot.onchange = onChange || null;
    sheetRoot.onkeydown = null;
    dragToClose(sheetRoot.querySelector('.sheet'));
  }
  // oben am Strich (und an der Kopfzeile) nach unten wischen schließt das Sheet
  function dragToClose(sh) {
    const scrim = sheetRoot.querySelector('.scrim');
    let y0 = null, t0 = 0, dy = 0;
    sh.addEventListener('touchstart', ev => {
      const top = sh.getBoundingClientRect().top, y = ev.touches[0].clientY;
      const inHandle = y - top < 64 || (sh.scrollTop <= 0 && ev.target.closest('.sheet-head'));
      if (!inHandle || ev.touches.length > 1 || ev.target.closest('input, select, textarea')) return;
      y0 = y; t0 = Date.now(); dy = 0;
    }, { passive: true });
    sh.addEventListener('touchmove', ev => {
      if (y0 === null) return;
      dy = Math.max(0, ev.touches[0].clientY - y0);
      if (dy > 0) ev.preventDefault();
      sh.classList.add('dragging');
      sh.style.transform = `translateY(${dy}px)`;
      if (scrim) scrim.style.opacity = String(Math.max(0, 1 - dy / 400));
    }, { passive: false });
    const end = () => {
      if (y0 === null) return;
      const fast = dy / Math.max(1, Date.now() - t0) > .5;
      y0 = null; sh.classList.remove('dragging');
      if (dy > 110 || (fast && dy > 30)) {
        haptic('light');
        sh.style.transition = 'transform .22s cubic-bezier(.4, 0, .9, .6)'; sh.style.transform = 'translateY(100%)';
        if (scrim) { scrim.style.transition = 'opacity .22s'; scrim.style.opacity = '0'; }
        sheetRoot.onclick = sheetRoot.onchange = sheetRoot.onkeydown = null;
        clearTimeout(sheetTimer); sheetTimer = setTimeout(() => { if (sheetRoot.contains(sh)) sheetRoot.innerHTML = ''; }, 230);
      } else {
        sh.style.transition = 'transform .3s cubic-bezier(.2, .9, .3, 1)'; sh.style.transform = '';
        if (scrim) { scrim.style.transition = 'opacity .3s'; scrim.style.opacity = ''; }
      }
      dy = 0;
    };
    sh.addEventListener('touchend', end); sh.addEventListener('touchcancel', end);
  }
  function closeSheet() {
    sheetRoot.onclick = sheetRoot.onchange = sheetRoot.onkeydown = null;
    if (!sheetRoot.firstChild) return;
    // erst sanft nach unten gleiten lassen, dann entfernen
    if (!motionOn()) { sheetRoot.innerHTML = ''; return; }
    sheetRoot.classList.add('closing');
    clearTimeout(sheetTimer); sheetTimer = setTimeout(() => { sheetRoot.innerHTML = ''; sheetRoot.classList.remove('closing'); }, 240);
  }

  function openSheet(entry, { draft = null, type = null, caseId = null, placeId = null, contactId = null, info = null, quick = false } = {}) {
    const isNew = !entry;
    const t = today();
    const e = entry ? JSON.parse(JSON.stringify(entry)) : (draft || newEntry({ type: type || 'reminder', date: t, received: t, source: type === 'deadline' ? 'Brief' : '', caseId, placeId: placeId || null, contactId, context: caseId ? ctxOf(caseById(caseId)) : contactId ? ctxOf(contactById(contactId)) : defaultCtx() }));
    if (isNew && draft && !draft._ctxSet) e.context = defaultCtx();
    if (isNew && e.type === 'place' && !e.placeId && !e.group) { const p = state.places.find(p => p.kind !== 'person'); if (p) e.placeId = p.id; else e.group = 'supermarkt'; }
    if (isNew && e.type === 'contract' && !e.contract) e.contract = { termEnd: L.addMonths(t, 12), noticeN: 1, noticeUnit: 'Monate', renewMonths: 1 };
    let confirmDel = false, calcResult = null;
    const openSecs = new Set();
    const calc = e._calc || { n: 14, unit: 'Tage', fiction: false };

    const draw = () => {
      const placeOpts = Object.entries(GROUPS).map(([g, n]) => `<option value="g:${g}" ${e.group === g ? 'selected' : ''}>Jeder ${n}</option>`).join('') +
        state.places.filter(p => p.id === e.placeId || area() === 'alle' || (p.area || 'beide') === 'beide' || p.area === ctxOf(e)).map(p => `<option value="${p.id}" ${!e.group && p.id === e.placeId ? 'selected' : ''}>${p.kind === 'person' ? 'Person: ' : ''}${esc(p.name)}</option>`).join('') + '<option value="__new">Neuer Ort …</option>';
      const caseOpts = '<option value="">Kein Vorgang</option>' + state.cases.filter(c => c.id === e.caseId || (!c.closed && ctxOf(c) === ctxOf(e))).map(c => `<option value="${c.id}" ${c.id === e.caseId ? 'selected' : ''}>${esc(c.title)}</option>`).join('') + '<option value="__new">Neuer Vorgang …</option>';
      const ctxContacts = state.contacts.filter(k => k.id === e.contactId || area() === 'alle' || ctxOf(k) === ctxOf(e));
      const contactOpts = '<option value="">Niemand</option>' + ctxContacts.map(k => `<option value="${k.id}" ${k.id === e.contactId ? 'selected' : ''}>${esc(k.name)}${k.company ? ' · ' + esc(k.company) : ''}</option>`).join('') + `<option value="__new" ${e._contactName ? 'selected' : ''}>Neue Person …</option>`;
      const subList = e.items.length ? `<ul class="checklist">${e.items.map((it, i) => `<li class="${it.done ? 'got' : ''}"><input type="checkbox" id="sub-${i}" data-sub="${i}" ${it.done ? 'checked' : ''}><span><label for="sub-${i}">${esc(it.text)}</label></span><button type="button" class="icon-btn small" data-subdel="${i}" aria-label="Schritt entfernen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></li>`).join('')}</ul>` : '';
      const tpls = state.templates.filter(tp => area() === 'alle' || ctxOf(tp.entry) === ctxOf(e));
      const running = state.timer?.entryId === e.id;
      const timeSection = () => {
        const auto = e.timeAuto || {}, log = e.timeLog || [];
        return `<div class="dept">Ort und Zeiterfassung</div>
        ${e.loc ? `<div class="card loc-card"><div class="card-row"><div><div class="title">${esc(e.loc.name)}</div>${e.loc.address ? `<div class="sub">${esc(e.loc.address)}</div>` : ''}</div><button type="button" class="icon-btn" id="locClear" aria-label="Ort entfernen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
          <div class="row-actions" style="margin:0"><a class="btn small ghost" href="https://maps.apple.com/?ll=${e.loc.lat},${e.loc.lng}&q=${encodeURIComponent(e.loc.name)}">In Karten öffnen</a><select id="f-locradius" class="btn small">${[100, 150, 200, 300, 500].map(r => `<option value="${r}" ${(e.loc.radius || 150) === r ? 'selected' : ''}>Radius ${r} m</option>`).join('')}</select></div></div>`
        : `<div class="field"><label for="f-locq">Ort</label><input id="f-locq" type="search" placeholder="Kunde, Adresse oder Firma suchen" enterkeyhint="search"><div class="row-actions" style="margin:0"><button class="btn small" id="locSearch" type="button">In Karten suchen</button><button class="btn small ghost" id="locHere" type="button">Mein Standort</button></div><div id="locResults" class="loc-results"></div></div>`}
        <label class="setting" style="cursor:pointer"><div><div class="title">Bei Ankunft automatisch starten</div><div class="hint">${e.loc ? 'Braucht Standort „Immer“. Du bekommst eine Mitteilung.' : 'Erst einen Ort wählen.'}</div></div><input type="checkbox" class="switch" id="f-autostart" ${auto.start ? 'checked' : ''} ${e.loc ? '' : 'disabled'}></label>
        <label class="setting" style="cursor:pointer"><div><div class="title">Beim Verlassen automatisch stoppen</div></div><input type="checkbox" class="switch" id="f-autostop" ${auto.stop ? 'checked' : ''} ${e.loc ? '' : 'disabled'}></label>
        <div class="setting"><div><div class="title">${running ? `<span data-elapsed="${state.timer.start}" data-base="${loggedMs(e) - (Date.now() - state.timer.start)}">${fmtDur(loggedMs(e))}</span>` : fmtDur(loggedMs(e))}</div><div class="hint">${running ? `läuft seit ${hhmm(state.timer.start)} Uhr${state.timer.src === 'ort' ? ', bei Ankunft gestartet' : ''}` : log.length ? `${log.length} ${log.length === 1 ? 'Abschnitt' : 'Abschnitte'}` : 'Noch keine Zeit erfasst'}</div></div>
          ${isNew ? '<span class="hint">Start nach dem Speichern</span>' : `<button class="btn ${running ? 'primary' : ''}" id="timerBtn" type="button">${running ? 'Stopp' : 'Start'}</button>`}</div>
        ${log.length ? `<ul class="sessions">${log.map((x, i) => `<li><input type="date" data-sd="${i}" value="${iso(new Date(x.start))}"><input type="time" data-ss="${i}" value="${hhmm(x.start)}"><span>–</span><input type="time" data-se="${i}" value="${hhmm(x.end)}"><span class="sub">${fmtDur(x.end - x.start)}${x.src === 'ort' ? ' · Ort' : ''}</span><button type="button" class="icon-btn small" data-sdel="${i}" aria-label="Abschnitt löschen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></li>`).join('')}</ul>` : ''}
        <div class="row-actions" style="margin:0"><button class="btn small ghost" id="addSession" type="button">Zeit nachtragen</button></div>`;
      };
      const placeholder = { reminder: 'z. B. Mama zurückrufen', task: 'z. B. Fahrrad aufpumpen', deadline: 'z. B. Antwort an Versicherung', place: 'z. B. Wocheneinkauf', waiting: 'z. B. Erstattung Krankenkasse', contract: 'z. B. Handyvertrag', document: 'z. B. Personalausweis' }[e.type];
      const leadSelect = (opts, label = 'Vorher erinnern') => `<div class="field"><label for="f-lead">${label}</label><select id="f-lead">${opts.map(n => `<option value="${n}" ${n == e.leadDays ? 'selected' : ''}>${n} ${n === 1 ? 'Tag' : 'Tage'} vorher</option>`).join('')}</select></div>`;
      let typeFields = '', repeatFields = '', calcFields = '';
      if (e.type === 'deadline') { calcFields = `
        <div class="two"><div class="field"><label for="f-source">Woher</label><input id="f-source" value="${esc(e.source)}" placeholder="Brief, E-Mail …"></div>
        <div class="field"><label for="f-received">Eingang / Briefdatum</label><input id="f-received" type="date" value="${e.received || t}"></div></div>
        <div class="calc"><div class="row"><span class="sub">Frist berechnen:</span><input id="c-n" type="number" min="1" value="${calc.n}"><select id="c-unit">${['Tage', 'Wochen', 'Monate'].map(u => `<option ${u === calc.unit ? 'selected' : ''}>${u}</option>`).join('')}</select><button class="btn small" id="calcBtn" type="button">Berechnen</button></div>
          <label class="inline"><input type="checkbox" id="c-fiction" ${calc.fiction ? 'checked' : ''}> Behördenbrief: gilt 4 Tage nach Briefdatum als zugegangen</label>
          ${calcResult ? `<div class="result">Frist endet am ${longDate(calcResult.deadline)}</div>${calcResult.notes.length ? `<ul class="notes-list">${calcResult.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}` : `<div class="hint">Wochenenden und Feiertage in ${L.STATES[state.settings.state]} werden berücksichtigt. Ohne Gewähr.</div>`}</div>
`;
      typeFields = `
        <div class="two"><div class="field"><label for="f-date">Frist bis</label><input id="f-date" type="date" value="${e.date || ''}"></div>${leadSelect([1, 3, 7, 14, 30])}</div>`;
      }
      if (e.type === 'reminder' || e.type === 'task') { typeFields = `
        <div class="two"><div class="field"><label for="f-date">Tag</label><input id="f-date" type="date" value="${e.date || ''}"></div>
        <div class="field"><label for="f-time">Uhrzeit${e.type === 'task' ? ' (optional)' : ''}</label><input id="f-time" type="time" value="${e.time || ''}"></div></div>
`;
      repeatFields = `
        <div class="field"><label for="f-repeat">Wiederholen</label><select id="f-repeat">${[['none', 'Nie'], ['daily', 'Täglich'], ['weekly', 'Wöchentlich'], ['monthly', 'Monatlich']].map(([k, l]) => `<option value="${k}" ${e.repeat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <label class="inline hint"><input type="checkbox" id="f-flex" ${e.flex ? 'checked' : ''}> Flexibel: irgendwann bis zu diesem Tag (steht bis dahin unter „Diese Woche“)</label>`;
      }
      if (e.type === 'waiting') typeFields = `
        <div class="field"><label for="f-source">Bei wem</label><input id="f-source" value="${esc(e.source)}" placeholder="z. B. Stadtwerke, Vermieter"></div>
        <div class="two"><div class="field"><label for="f-received">Wartet seit</label><input id="f-received" type="date" value="${e.received || t}"></div>
        <div class="field"><label for="f-date">Nachhaken am</label><input id="f-date" type="date" value="${e.date || addDays(t, 14)}"></div></div>`;
      if (e.type === 'contract') {
        const c = e.contract;
        const r = L.cancelDeadline({ ...c, today: t });
        typeFields = `
        <div class="field"><label for="f-source">Anbieter</label><input id="f-source" value="${esc(e.source)}" placeholder="z. B. Mobilfunkanbieter"></div>
        <div class="two"><div class="field"><label for="k-end">Laufzeit bis</label><input id="k-end" type="date" value="${c.termEnd}"></div>
        <div class="field"><label for="k-renew">Danach</label><select id="k-renew">${[[1, 'monatlich kündbar'], [12, 'verlängert um 12 Monate'], [24, 'verlängert um 24 Monate']].map(([v, l]) => `<option value="${v}" ${c.renewMonths == v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <div class="two"><div class="field"><label for="k-n">Kündigungsfrist</label><input id="k-n" type="number" min="0" value="${c.noticeN}"></div>
        <div class="field"><label for="k-unit">Einheit</label><select id="k-unit">${['Tage', 'Wochen', 'Monate'].map(u => `<option ${u === c.noticeUnit ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>
        <div class="result">Kündigen spätestens am ${longDate(r.lastDay)}</div>
        ${leadSelect([7, 14, 30, 60], 'Erinnern')}`;
      }
      if (e.type === 'document') typeFields = `
        <div class="two"><div class="field"><label for="f-date">Gültig bis</label><input id="f-date" type="date" value="${e.date || ''}"></div>${leadSelect([14, 30, 60, 90], 'Erinnern')}</div>`;
      if (e.type === 'place') typeFields = `
        <div class="field"><label for="f-place">Wo oder bei wem</label><select id="f-place">${placeOpts}</select></div>
        <div class="field" id="newPlaceField" hidden><label for="f-newplace">Name des neuen Orts</label><input id="f-newplace" placeholder="z. B. Lidl Hauptstraße"></div>
        <div class="field"><label for="f-items">Liste, eine Zeile pro Punkt</label><textarea id="f-items" placeholder="Milch&#10;Brot&#10;Äpfel">${esc(e.items.map(i => i.text).join('\n'))}</textarea></div>
        <p class="hint">WDID sortiert die Liste nach Abteilungen und lernt, in welcher Reihenfolge du durch deinen Laden gehst.</p>`;

      const photos = mediaThumbs(e.photos);
      const proofFields = !isNew && ['deadline', 'waiting', 'contract', 'task', 'reminder'].includes(e.type) ? `
        <div class="two"><div class="field"><label for="p-method">Erledigt per (Nachweis)</label><select id="p-method"><option value="">—</option>${PROOF.map(m => `<option ${e.proof?.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="field"><label for="p-note">Nachweis-Notiz</label><input id="p-note" value="${esc(e.proof?.note || '')}" placeholder="z. B. Sendungsnummer"></div></div>` : '';

      // Simple Ansicht: Typ, Titel, Termin. Alles andere steckt in Abschnitten zum Ausklappen.
      // Abschnitte mit Inhalt stehen sichtbar (zugeklappt mit Vorschau), leere liegen unter „Mehr“.
      const sec = (key, title, filled, preview, body) => ({ key, filled, html: `<details class="sec" data-sec="${key}" ${openSecs.has(key) ? 'open' : ''}><summary><span class="sec-t">${title}</span>${preview ? `<span class="sec-p">${esc(preview)}</span>` : ''}</summary><div class="sec-body">${body}</div></details>` });
      const files = (e.fileIds || []).map(fileById).filter(Boolean);
      const contactName = e._contactName || contactById(e.contactId)?.name || '';
      const log = e.timeLog || [];
      const secs = [];
      if (e.type === 'reminder' || e.type === 'task') secs.push(sec('repeat', 'Wiederholen und flexibel', e.repeat && e.repeat !== 'none' || e.flex, [e.flex ? 'Flexibel' : '', { daily: 'Täglich', weekly: 'Wöchentlich', monthly: 'Monatlich' }[e.repeat] || ''].filter(Boolean).join(' · '), repeatFields));
      if (e.type === 'deadline') secs.push(sec('calc', 'Eingang und Frist berechnen', !isNew || calcResult, [e.source, e.received ? shortDate(e.received) : ''].filter(Boolean).join(' · '), calcFields));
      if (e.type !== 'place') {
        secs.push(sec('who', 'Nummer und Person', e.ref || e.contactId || e._contactName, [e.ref, contactName].filter(Boolean).join(' · '), `
          <div class="field"><label for="f-ref">Nummer</label><div class="quick"><input id="f-ref" value="${esc(e.ref || '')}" placeholder="Ticket, RMA, Auftrag" autocapitalize="characters"><button class="btn small icon" id="scanRef" type="button" aria-label="Etikett scannen"><svg viewBox="0 0 24 24"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M11 9v6M14 9v6M17 9v6"/></svg></button></div><div class="chips" id="refChoices"></div></div>
          <div class="field"><label for="f-contact">Person</label><select id="f-contact">${contactOpts}</select></div>
          <div class="field" id="newContactField" ${e._contactName ? '' : 'hidden'}><label for="f-newcontact">Name der neuen Person</label><input id="f-newcontact" value="${esc(e._contactName || '')}" placeholder="z. B. Frau Jessen"></div>`));
        secs.push(sec('check', 'Checkliste', e.items.length, e.items.length ? `${e.items.filter(i => i.done).length} von ${e.items.length}` : '', `${subList}<div class="quick"><input id="f-sub" placeholder="Schritt hinzufügen" enterkeyhint="done" aria-label="Schritt hinzufügen"><button class="btn small" id="addSub" type="button">Hinzufügen</button></div>`));
      }
      if (['reminder', 'task', 'waiting', 'deadline'].includes(e.type)) secs.push(sec('time', 'Ort und Zeiterfassung', e.loc || log.length || running, [e.loc?.name, log.length || running ? fmtDur(loggedMs(e)) : '', running ? 'läuft' : ''].filter(Boolean).join(' · '), timeSection()));
      secs.push(sec('notes', 'Details', e.notes, (e.notes || '').split('\n')[0].slice(0, 48), `<div class="field"><label for="f-notes" class="sr-only">Details</label><textarea id="f-notes" placeholder="Aktenzeichen, Ansprechpartner, was zu tun ist …">${esc(e.notes)}</textarea></div>`));
      if (e.type !== 'place') secs.push(sec('case', 'Vorgang', e.caseId, caseById(e.caseId)?.title || '', `<div class="field"><label for="f-case" class="sr-only">Vorgang</label><select id="f-case">${caseOpts}</select></div>
        <div class="field" id="newCaseField" hidden><label for="f-newcase">Name des Vorgangs</label><input id="f-newcase" placeholder="z. B. Kfz-Versicherung Schaden"></div>`));
      secs.push(sec('docs', 'Dokumente', files.length, files.length ? `${files.length} ${files.length === 1 ? 'Datei' : 'Dateien'}` : '', `${files.length ? `<div class="doc-list">${files.map(f => `<span class="doc-chip"><button type="button" data-fview="${f.id}">${fileIcon(kindOf(f))}<span class="grow">${esc(f.name)}</span></button><button type="button" class="x" data-funlink="${f.id}" aria-label="Lösen">×</button></span>`).join('')}</div>` : ''}
          <button class="btn small" id="attachFile" type="button">Datei anhängen</button>${state.files.some(f => !(e.fileIds || []).includes(f.id)) ? `<select id="f-filepick" class="btn small" aria-label="Aus der Ablage verknüpfen"><option value="">Aus der Ablage verknüpfen …</option>${state.files.filter(f => !(e.fileIds || []).includes(f.id) && (area() === 'alle' || ctxOf(f) === ctxOf(e))).slice(0, 80).map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select>` : ''}`));
      secs.push(sec('media', 'Fotos und Videos', (e.photos || []).length, (e.photos || []).length ? `${e.photos.length}` : '', `${photos}<div class="row-actions" style="margin:0"><button class="btn small" id="addPhoto" type="button">Foto</button><button class="btn small" id="addVideo" type="button">Video</button><button class="btn small ghost" id="addPhotoLib" type="button">Aus der Mediathek</button></div>`));
      if (e.type === 'deadline' || e.ocrText) secs.push(sec('ocr', e.ocrText ? 'Erkannter Text aus dem Brief' : 'Brieftext einfügen und auswerten', e.ocrText, '', e.ocrText ? `<pre class="ocr-text">${esc(e.ocrText)}</pre>` : `<div class="field"><textarea id="f-ocr" placeholder="Text aus Brief oder E-Mail hier einfügen …" aria-label="Brieftext"></textarea></div><button class="btn small" id="analyzeBtn" type="button">Auswerten</button>`));
      if (proofFields) secs.push(sec('proof', 'Nachweis', e.proof?.method, e.proof?.method || '', proofFields));
      const extra = `${e.type !== 'place' ? '<button class="btn small ghost" id="asTemplate" type="button">Als Vorlage speichern</button>' : ''}${e.type === 'waiting' ? '<button class="btn small ghost" id="nudgeBtn" type="button">Nachfrage kopieren</button>' : ''}`;
      const shown = secs.filter(x => x.filled), hidden = secs.filter(x => !x.filled);

      showSheet(`
        <div class="sheet-head"><h3>${isNew ? 'Neuer Eintrag' : 'Bearbeiten'}</h3>${ctxChip(e.context)}</div>
        ${info ? `<p class="hint">${esc(info)}</p>` : ''}
        ${isNew && tpls.length ? `<div class="chips">${tpls.map(tp => `<button type="button" class="chip tpl" data-tpl="${tp.id}">${esc(tp.name)}</button>`).join('')}</div>` : ''}
        ${isNew ? `<div class="quick"><input id="f-quick" placeholder="Schnell: Fr 14 Uhr Friseur" enterkeyhint="done" aria-label="Schnelleingabe"><button class="btn small" id="quickBtn" type="button">Übernehmen</button></div>` : ''}
        <div class="types">${Object.entries(TYPE).map(([k, v]) => `<button type="button" data-type="${k}" aria-pressed="${e.type === k}"><svg viewBox="0 0 24 24">${v.icon}</svg>${v.label}</button>`).join('')}</div>
        <div class="field"><label for="f-title">${e.type === 'place' ? 'Name der Liste' : 'Was?'}</label><input id="f-title" value="${esc(e.title)}" placeholder="${placeholder}"></div>
        ${typeFields}
        ${shown.length ? `<div class="secs">${shown.map(x => x.html).join('')}</div>` : ''}
        ${hidden.length || extra ? `<details class="more" ${openSecs.has('__more') ? 'open' : ''} data-sec="__more"><summary>${shown.length ? 'Mehr' : 'Mehr Optionen'}<span class="sec-p">${hidden.map(x => x.html.match(/sec-t">([^<]+)/)[1]).join(', ')}</span></summary>
          <div class="secs">${hidden.map(x => x.html).join('')}</div>${extra ? `<div class="row-actions">${extra}</div>` : ''}</details>` : ''}
        <p class="hint" id="formError" hidden></p>
        <div class="sheet-actions">
          ${isNew ? '<button class="btn ghost" data-close>Abbrechen</button>' : `<button class="btn ghost" id="del">${confirmDel ? 'Wirklich löschen?' : 'Löschen'}</button>`}
          <button class="btn" id="copyBtn">Kopieren</button>
          <button class="btn primary" id="saveBtn">${isNew ? 'Speichern' : 'Fertig'}</button>
        </div>`, isNew ? 'Neuer Eintrag' : 'Eintrag bearbeiten', onClick, onChange);
      hydratePhotos(sheetRoot);
      sheetRoot.querySelectorAll('details[data-sec]').forEach(d => { d.ontoggle = () => { d.open ? openSecs.add(d.dataset.sec) : openSecs.delete(d.dataset.sec); if (d.open) haptic('select'); }; });
      const quickInput = document.getElementById('f-quick');
      if (quickInput) quickInput.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); applyQuick(); } };
      const locInput = document.getElementById('f-locq');
      if (locInput) locInput.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); searchLoc(); } };
      const subInput = document.getElementById('f-sub');
      if (subInput) subInput.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); addSub(); } };
      if (isNew) setTimeout(() => document.getElementById(quick ? 'f-quick' : 'f-title')?.focus(), 60);
    };

    const v = id => document.getElementById(id)?.value;
    const read = () => {
      if (v('f-title') !== undefined) e.title = (v('f-title') || '').trim();
      if (v('f-notes') !== undefined) e.notes = (v('f-notes') || '').trim();
      if (v('f-date') !== undefined) e.date = v('f-date') || null;
      if (v('f-time') !== undefined) e.time = v('f-time') || null;
      if (v('f-repeat') !== undefined) e.repeat = v('f-repeat');
      if (v('f-source') !== undefined) e.source = v('f-source').trim();
      if (v('f-received') !== undefined) e.received = v('f-received') || null;
      if (v('f-lead') !== undefined) e.leadDays = Number(v('f-lead'));
      if (v('f-case') !== undefined && v('f-case') !== '__new') e.caseId = v('f-case') || null;
      if (v('f-place') !== undefined) { const pv = v('f-place'); if (pv.startsWith('g:')) { e.group = pv.slice(2); e.placeId = null; } else { e.group = null; e.placeId = pv; } }
      if (v('f-items') !== undefined) {
        const old = Object.fromEntries(e.items.map(i => [i.text, i.done]));
        e.items = v('f-items').split('\n').map(s => s.trim()).filter(Boolean).map(text => ({ text, done: !!old[text] }));
      }
      if (v('c-n') !== undefined) { calc.n = Math.max(1, Number(v('c-n')) || 1); calc.unit = v('c-unit'); calc.fiction = document.getElementById('c-fiction').checked; }
      if (e.type === 'contract' && v('k-end') !== undefined) {
        e.contract = { termEnd: v('k-end') || t, noticeN: Number(v('k-n')) || 0, noticeUnit: v('k-unit'), renewMonths: Number(v('k-renew')) };
        const r = L.cancelDeadline({ ...e.contract, today: t }); e.contract.termEnd = r.termEnd; e.date = r.lastDay;
      }
      if (v('f-ref') !== undefined) e.ref = (v('f-ref') || '').trim();
      if (v('f-contact') !== undefined) { const cv = v('f-contact'); if (cv === '__new') e._contactName = (v('f-newcontact') || '').trim() || e._contactName || ''; else { e.contactId = cv || null; delete e._contactName; } }
      const fx = document.getElementById('f-flex'); if (fx) e.flex = fx.checked;
      const as = document.getElementById('f-autostart'), ao = document.getElementById('f-autostop');
      if (as && e.loc) e.timeAuto = { start: as.checked, stop: ao.checked };
      const lr = document.getElementById('f-locradius'); if (lr && e.loc) e.loc.radius = Number(lr.value);
      (e.timeLog || []).forEach((x, i) => {
        const dd = sheetRoot.querySelector(`[data-sd="${i}"]`)?.value, ss = sheetRoot.querySelector(`[data-ss="${i}"]`)?.value, se = sheetRoot.querySelector(`[data-se="${i}"]`)?.value;
        if (!dd || !ss || !se) return;
        const mk = (d, tm) => { const [h, m] = tm.split(':').map(Number); const dt = parse(d); dt.setHours(h, m, 0, 0); return dt.getTime(); };
        x.start = mk(dd, ss); x.end = mk(dd, se); if (x.end < x.start) x.end += 864e5;
      });
      if (v('p-method') !== undefined) e.proof = v('p-method') ? { method: v('p-method'), note: (v('p-note') || '').trim(), at: e.proof?.at || Date.now() } : null;
    };
    function applyQuick() {
      const text = (v('f-quick') || '').trim();
      if (!text) return;
      const r = L.quickParse(text, { today: t, places: state.places });
      e.type = r.type; e.title = r.title || e.title; e.date = r.date; e.time = r.time; if (r.context === 'arbeit') e.context = 'arbeit'; e.repeat = r.repeat;
      if (r.type === 'place') {
        if (!r.placeId && r.placeName) { const p = { id: uid(), name: r.placeName, kind: 'store', group: null, lat: null, lng: null, radius: 150, area: e.context === 'arbeit' ? 'arbeit' : 'beide' }; state.places.push(p); r.placeId = p.id; }
        e.placeId = r.placeId; e.group = null; e.items = r.items.map(text => ({ text, done: false }));
      }
      if (r.type === 'deadline') { e.received = t; e.leadDays = 3; }
      if (r.ref) e.ref = r.ref;
      if (r.flex) e.flex = true;
      if (r.contact) {
        const q = r.contact.toLowerCase(), k = state.contacts.find(k => k.name.toLowerCase().includes(q));
        if (k) e.contactId = k.id; else e._contactName = r.contact;
      }
      draw();
    }
    draw();

    const original = entry ? [...(entry.photos || [])] : [];
    let locResults = [];
    function showLocResults(list, msg) {
      locResults = list;
      const box = document.getElementById('locResults'); if (!box) return;
      box.innerHTML = list.length ? list.map((r, i) => `<button type="button" class="loc-hit" data-locpick="${i}"><b>${esc(r.name)}</b>${r.address ? `<span>${esc(r.address)}</span>` : ''}</button>`).join('') : `<p class="hint">${esc(msg || 'Nichts gefunden.')}</p>`;
    }
    const position = () => new Promise(res => {
      if (here) return res(here);
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(p => { here = { lat: p.coords.latitude, lng: p.coords.longitude }; res(here); }, () => res(null), { maximumAge: 600000, timeout: 5000 });
    });
    async function searchLoc() {
      const q = (document.getElementById('f-locq')?.value || '').trim(); if (!q) return;
      if (!Native) return showLocResults([], 'Die Kartensuche gibt es in der iPhone-App. Hier kannst du „Hier“ nehmen.');
      showLocResults([], 'Suche …');
      const pos = await position();
      try { const { results } = await Native.searchPlaces({ query: q, ...(pos || {}) }); showLocResults(results || [], 'Nichts gefunden. Braucht Internet.'); }
      catch (err) { showLocResults([], 'Suche hat nicht geklappt: ' + err.message); }
    }
    async function locHere() {
      const pos = await position(); if (!pos) return toast('Standort nicht verfügbar');
      const near = state.places.find(p => p.lat != null && dist(pos, p) <= Math.max(p.radius, 150));
      const name = (document.getElementById('f-locq')?.value || '').trim() || near?.name || 'Hier';
      showLocResults([{ name, address: '', lat: pos.lat, lng: pos.lng }]);
      document.querySelector('[data-locpick="0"]')?.click();
    }
    function addSub() {
      const inp = document.getElementById('f-sub'); const text = (inp?.value || '').trim(); if (!text) return;
      read(); e.items.push({ text, done: false }); draw();
      setTimeout(() => document.getElementById('f-sub')?.focus(), 30);
    }
    async function scanRef() {
      read();
      const file = await pickMedia({ camera: true, video: false }); if (!file) return;
      try {
        const b64 = await fileToJpegBase64(file, 2400);
        if (!Native) { toast('Scannen geht nur in der iPhone-App'); return; }
        toast('Etikett wird gelesen …');
        const codes = (await Native.detectCodes({ base64: b64 }).catch(() => ({ codes: [] }))).codes || [];
        let text = '';
        if (!codes.length) text = (await Native.recognizeText({ base64: b64 }).catch(() => ({ text: '' }))).text || '';
        const cands = [...new Set([...codes, ...(text.match(/\b[A-Z]{0,6}[-/ ]?\d[\dA-Z/-]{3,}\b/g) || []).map(x => x.trim())])].slice(0, 8);
        e.photos.push(await savePhoto(b64)); noteMedia(e.photos[e.photos.length - 1], Date.now());
        if (!cands.length) { draw(); return toast('Keine Nummer erkannt, das Foto ist angehängt'); }
        if (cands.length === 1 && !e.ref) e.ref = cands[0];
        draw();
        if (cands.length > 1 || e.ref !== cands[0]) document.getElementById('refChoices').innerHTML = `<span class="hint">Erkannt:</span>` + cands.map(c => `<button type="button" class="chip" data-refpick="${esc(c)}">${esc(c)}</button>`).join('');
        haptic('success');
      } catch (err) { toast(err.message); }
    }
    async function addPhoto(camera, video = false) {
      read();
      const file = await pickMedia({ camera, video });
      if (!file) return;
      try { e.photos.push(await storeMedia(file, camera)); draw(); } catch (err) { toast('Speichern hat nicht geklappt: ' + err.message); }
    }

    function onClick(ev) {
      const b = ev.target.closest('button, img[data-view]');
      if (!b) return;
      if (b.closest('.viewer')) return;
      if (b.dataset.view !== undefined) {
        read();
        return openViewer([...e.photos], +b.dataset.view, { onDelete: i => { e.photos.splice(i, 1); draw(); } });
      }
      if (b.id === 'quickBtn') return applyQuick();
      if (b.dataset.tpl) {
        const tp = state.templates.find(x => x.id === b.dataset.tpl); if (!tp) return;
        read();
        const src = JSON.parse(JSON.stringify(tp.entry));
        Object.assign(e, { ...src, items: (src.items || []).map(i => ({ text: i.text, done: false })), date: e.date || t });
        if (['deadline', 'waiting'].includes(e.type) && (!e.date || e.date <= t)) e.date = addDays(t, 14);
        haptic('select'); draw(); setTimeout(() => { const f = document.getElementById('f-title'); f?.focus(); f?.select(); }, 60); return;
      }
      if (b.id === 'addSub') return addSub();
      if (b.dataset.subdel !== undefined) { read(); e.items.splice(+b.dataset.subdel, 1); draw(); return; }
      if (b.dataset.refpick) { document.getElementById('f-ref').value = b.dataset.refpick; document.getElementById('refChoices').innerHTML = ''; haptic('select'); return; }
      if (b.id === 'scanRef') return scanRef();
      if (b.id === 'timerBtn') {
        read(); Object.assign(entry, { timeLog: e.timeLog, loc: e.loc, timeAuto: e.timeAuto });
        toggleTimer(entry); e.timeLog = JSON.parse(JSON.stringify(entry.timeLog || [])); draw(); render(); return;
      }
      if (b.dataset.sdel !== undefined) { read(); e.timeLog.splice(+b.dataset.sdel, 1); draw(); return; }
      if (b.id === 'addSession') {
        read(); const d0 = parse(e.date || t); const [h, m] = (e.time || '09:00').split(':').map(Number); d0.setHours(h, m, 0, 0);
        (e.timeLog = e.timeLog || []).push({ start: d0.getTime(), end: d0.getTime() + 36e5, src: 'hand' }); draw(); return;
      }
      if (b.dataset.fview) return openFile(fileById(b.dataset.fview));
      if (b.dataset.funlink) { read(); e.fileIds = e.fileIds.filter(x => x !== b.dataset.funlink); draw(); return; }
      if (b.id === 'attachFile') { read(); pickFiles().then(fs => fs.length && addFiles(fs, { ctx: ctxOf(e), entry: e })).then(() => draw()); return; }
      if (b.id === 'locSearch') return searchLoc();
      if (b.id === 'locHere') return locHere();
      if (b.dataset.locpick !== undefined) {
        read(); const r = locResults[+b.dataset.locpick];
        e.loc = { name: r.name, address: r.address || '', lat: r.lat, lng: r.lng, radius: 150 };
        if (!e.timeAuto) e.timeAuto = { start: ctxOf(e) === 'arbeit', stop: ctxOf(e) === 'arbeit' };
        haptic('select'); draw();
        if (e.timeAuto.start && Native && locationStatus !== 'always') Native.requestAlwaysLocation().then(refreshLocationStatus).catch(() => {});
        return;
      }
      if (b.id === 'locClear') { read(); e.loc = null; e.timeAuto = null; draw(); return; }
      if (b.id === 'asTemplate') {
        read();
        const name = e.title || TYPE[e.type].label;
        const tmpl = { type: e.type, title: e.title, notes: e.notes, context: e.context, items: e.items.map(i => ({ text: i.text, done: false })), leadDays: e.leadDays, repeat: e.repeat, source: e.source, contactId: e.contactId };
        const old = state.templates.find(x => x.name === name);
        if (old) old.entry = tmpl; else state.templates.push({ id: uid(), name, entry: tmpl });
        save(); toast(`Vorlage „${name}“ gespeichert`); haptic('success'); return;
      }
      if (b.id === 'nudgeBtn') { read(); return copyText(nudgeText(e), 'Nachfrage kopiert'); }
      if (b.dataset.type) {
        read(); e.type = b.dataset.type;
        if (e.type === 'deadline' && (!e.date || e.date <= t)) e.date = addDays(t, 14);
        if (e.type === 'contract' && !e.contract) { e.contract = { termEnd: L.addMonths(t, 12), noticeN: 1, noticeUnit: 'Monate', renewMonths: 1 }; e.leadDays = 30; }
        if (e.type === 'document') e.leadDays = 60;
        if (e.type === 'waiting' && (!e.date || e.date <= t)) e.date = addDays(t, 14);
        if (e.type === 'place' && !e.placeId && !e.group) e.group = 'supermarkt';
        draw(); return;
      }
      if (b.dataset.ctxToggle !== undefined) { read(); e.context = e.context === 'arbeit' ? 'privat' : 'arbeit'; haptic('select'); draw(); return; }
      if (b.id === 'calcBtn') {
        read();
        calcResult = L.computeDeadline({ received: e.received || t, fiction: calc.fiction, n: calc.n, unit: calc.unit, state: state.settings.state });
        e.date = calcResult.deadline; draw(); return;
      }
      if (b.id === 'analyzeBtn') {
        const text = v('f-ocr') || ''; if (!text.trim()) return;
        read(); const d = draftFromText(text);
        Object.assign(e, { type: d.type === 'deadline' ? 'deadline' : e.type, title: e.title || d.title, date: d.date, received: d.received, notes: [e.notes, d.notes].filter(Boolean).join('\n'), ocrText: text });
        if (d._calc) Object.assign(calc, d._calc);
        draw(); toast(d.type === 'deadline' ? 'Frist erkannt' : 'Keine Frist gefunden'); return;
      }
      if (b.id === 'addPhoto') return addPhoto(true);
      if (b.id === 'addPhotoLib') return addPhoto(false);
      if (b.id === 'addVideo') return addPhoto(true, true);
      if (b.id === 'copyBtn') { read(); copyText(entryText(e), 'Eintrag kopiert'); return; }
      if (b.id === 'del') {
        if (!confirmDel) { read(); confirmDel = true; draw(); return; }
        state.entries = state.entries.filter(x => x.id !== e.id); deleteMedia([...original, ...e.photos]); save(); closeSheet(); toast('Gelöscht'); render(); return;
      }
      if (b.id === 'saveBtn') {
        read();
        const err = document.getElementById('formError');
        const fail = msg => { err.hidden = false; err.textContent = msg; };
        if (e.type === 'place' && v('f-place') === '__new') {
          const name = (v('f-newplace') || '').trim(); if (!name) return fail('Gib dem neuen Ort einen Namen.');
          const p = { id: uid(), name, kind: 'store', group: null, lat: null, lng: null, radius: 150, area: e.context === 'arbeit' ? 'arbeit' : 'beide' }; state.places.push(p); e.placeId = p.id; e.group = null;
        }
        if (v('f-case') === '__new') {
          const name = (v('f-newcase') || '').trim(); if (!name) return fail('Gib dem Vorgang einen Namen.');
          const c = { id: uid(), title: name, createdAt: Date.now(), closed: false, context: ctxOf(e) }; state.cases.push(c); e.caseId = c.id;
        }
        if (!e.title) return fail('Schreib kurz, worum es geht.');
        if (['deadline', 'document'].includes(e.type) && !e.date) return fail('Hier fehlt noch ein Datum.');
        if (e.type !== 'place') e.group = null;
        if (e._contactName) {
          const k = { id: uid(), name: e._contactName, company: '', phone: '', email: '', notes: '', context: ctxOf(e), lastAt: null };
          state.contacts.push(k); e.contactId = k.id; delete e._contactName;
        } else if (v('f-contact') === '__new') e.contactId = null;
        delete e._calc;
        if (isNew) state.entries.push({ ...e, id: e.id || uid(), done: false, createdAt: Date.now() });
        else Object.assign(state.entries.find(x => x.id === e.id), e);
        deleteMedia(original.filter(p => !e.photos.includes(p)));
        save(); closeSheet(); toast(isNew ? 'Gespeichert' : 'Geändert'); render();
      }
    }
    function onChange(ev) {
      if (ev.target.dataset.sub !== undefined) { const i = +ev.target.dataset.sub; e.items[i].done = ev.target.checked; ev.target.closest('li').classList.toggle('got', ev.target.checked); if (ev.target.checked) { haptic('light'); burst(ev.target, 6); } return; }
      if (ev.target.id === 'f-filepick' && ev.target.value) { read(); (e.fileIds = e.fileIds || []).push(ev.target.value); haptic('select'); draw(); return; }
      if (ev.target.id === 'f-autostart' && ev.target.checked && Native && locationStatus !== 'always') Native.requestAlwaysLocation().then(refreshLocationStatus).catch(() => {});
      if (ev.target.id === 'f-contact') { const nf = document.getElementById('newContactField'); nf.hidden = ev.target.value !== '__new'; if (!nf.hidden) document.getElementById('f-newcontact').focus(); }
      if (ev.target.id === 'f-place') document.getElementById('newPlaceField').hidden = ev.target.value !== '__new';
      if (ev.target.id === 'f-case') document.getElementById('newCaseField').hidden = ev.target.value !== '__new';
      if (['k-end', 'k-n', 'k-unit', 'k-renew'].includes(ev.target.id)) { read(); draw(); }
    }
  }

  /* ---------- Bildbetrachter: wischen, zoomen, Videos abspielen ---------- */
  function openViewer(items, start = 0, { onDelete } = {}) {
    items = [...items];
    let idx = Math.max(0, Math.min(start, items.length - 1));
    const v = document.createElement('div');
    v.className = 'viewer'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'Medien');
    const x = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    const shareI = '<svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 12v8h14v-8"/></svg>';
    const trashI = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
    const draw = () => {
      v.innerHTML = `<div class="v-strip">${items.map(p => `<div class="v-slide">${isVideo(p)
          ? `<video data-photo="${esc(p)}" controls playsinline preload="metadata"></video>`
          : `<img data-photo="${esc(p)}" alt="" draggable="false">`}</div>`).join('')}</div>
        <div class="v-bar"><button class="v-btn" data-vclose aria-label="Schließen">${x}</button><span class="v-count"></span>
          <span class="v-actions">${Share && FS ? `<button class="v-btn" data-vshare aria-label="Teilen">${shareI}</button>` : ''}${onDelete ? `<button class="v-btn" data-vdel aria-label="Entfernen">${trashI}</button>` : ''}</span></div>
        <div class="v-cap"></div>
        ${items.length > 1 ? `<div class="v-dots">${items.map((_, i) => `<i data-i="${i}"></i>`).join('')}</div>` : ''}`;
      hydratePhotos(v).then(() => v.querySelectorAll('video').forEach(el => { el.src = el.src.replace(/#t=.*$/, ''); }));
      go(idx, false);
    };
    const strip = () => v.querySelector('.v-strip');
    const slide = () => v.querySelectorAll('.v-slide')[idx];
    const media = () => slide()?.firstElementChild;
    let z = { s: 1, x: 0, y: 0 }, armedDel = false;
    const applyZoom = (anim) => {
      const m = media(); if (!m || m.tagName !== 'IMG') return;
      m.style.transition = anim ? 'transform .28s cubic-bezier(.22,.8,.24,1)' : 'none';
      m.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
      v.classList.toggle('zoomed', z.s > 1.01);
    };
    const clampPan = () => {
      const m = media(); if (!m) return;
      const mx = Math.max(0, (m.offsetWidth * z.s - innerWidth) / 2), my = Math.max(0, (m.offsetHeight * z.s - innerHeight) / 2);
      z.x = Math.max(-mx, Math.min(mx, z.x)); z.y = Math.max(-my, Math.min(my, z.y));
    };
    function go(i, anim = true) {
      if (i !== idx) { const m = media(); if (m) { if (m.tagName === 'VIDEO') m.pause(); else { m.style.transform = ''; } } z = { s: 1, x: 0, y: 0 }; v.classList.remove('zoomed'); }
      idx = Math.max(0, Math.min(items.length - 1, i));
      const st = strip(); st.style.transition = anim && motionOn() ? 'transform .34s cubic-bezier(.22,.8,.24,1)' : 'none';
      st.style.transform = `translateX(${-idx * 100}%)`;
      v.querySelector('.v-count').textContent = items.length > 1 ? `${idx + 1} / ${items.length}` : '';
      v.querySelector('.v-cap').textContent = mediaCaption(items[idx]);
      v.querySelectorAll('.v-dots i').forEach((d, k) => d.classList.toggle('on', k === idx));
      armedDel = false; v.querySelector('[data-vdel]')?.classList.remove('armed');
    }
    function close() {
      v.querySelectorAll('video').forEach(el => el.pause());
      document.removeEventListener('keydown', onKey);
      if (!motionOn()) return v.remove();
      v.classList.add('closing'); setTimeout(() => v.remove(), 220);
    }
    const onKey = ev => { if (ev.key === 'Escape') close(); if (ev.key === 'ArrowRight') go(idx + 1); if (ev.key === 'ArrowLeft') go(idx - 1); };
    document.addEventListener('keydown', onKey);

    v.addEventListener('click', async ev => {
      const b = ev.target.closest('button, .v-dots i'); if (!b) return;
      ev.stopPropagation();
      if (b.dataset.vclose !== undefined) return close();
      if (b.dataset.i !== undefined) return go(+b.dataset.i);
      if (b.dataset.vshare !== undefined) {
        try { const { uri } = await FS.getUri({ path: items[idx], directory: 'DATA' }); await Share.share({ files: [uri] }); } catch (err) { if (!/cancel/i.test(err.message || '')) toast('Teilen hat nicht geklappt'); }
        return;
      }
      if (b.dataset.vdel !== undefined) {
        if (!armedDel) { armedDel = true; b.classList.add('armed'); haptic('medium'); toast('Nochmal tippen zum Entfernen'); return; }
        onDelete(idx); items.splice(idx, 1);
        if (!items.length) return close();
        idx = Math.min(idx, items.length - 1); draw();
      }
    });

    // Gesten: ein Finger wischt (oder verschiebt im Zoom), zwei Finger zoomen, Doppeltipp zoomt, nach unten ziehen schließt
    const pts = new Map();
    let g = null, lastTap = 0;
    const mid = () => { const a = [...pts.values()]; return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) }; };
    v.addEventListener('pointerdown', ev => {
      if (ev.target.closest('button, video, .v-dots')) return;
      v.setPointerCapture?.(ev.pointerId);
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pts.size === 2) { const m = mid(); g = { kind: 'pinch', m, s: z.s, x: z.x, y: z.y }; }
      else if (pts.size === 1) g = { kind: null, x0: ev.clientX, y0: ev.clientY, t0: Date.now(), zx: z.x, zy: z.y };
    });
    v.addEventListener('pointermove', ev => {
      if (!pts.has(ev.pointerId) || !g) return;
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (g.kind === 'pinch' && pts.size === 2) {
        const m = mid(), cx = innerWidth / 2, cy = innerHeight / 2;
        const s2 = Math.max(1, Math.min(5, g.s * m.d / g.m.d));
        const lx = (g.m.x - cx - g.x) / g.s, ly = (g.m.y - cy - g.y) / g.s;
        z = { s: s2, x: m.x - cx - s2 * lx, y: m.y - cy - s2 * ly }; clampPan(); applyZoom(false); return;
      }
      const dx = ev.clientX - g.x0, dy = ev.clientY - g.y0;
      if (!g.kind) {
        if (Math.hypot(dx, dy) < 8) return;
        g.kind = z.s > 1.01 ? 'pan' : Math.abs(dx) > Math.abs(dy) ? 'swipe' : dy > 0 ? 'down' : 'none';
      }
      if (g.kind === 'pan') { z.x = g.zx + dx; z.y = g.zy + dy; clampPan(); applyZoom(false); }
      if (g.kind === 'swipe') {
        const edge = (idx === 0 && dx > 0) || (idx === items.length - 1 && dx < 0);
        const st = strip(); st.style.transition = 'none';
        st.style.transform = `translateX(calc(${-idx * 100}% + ${edge ? dx / 3 : dx}px))`;
      }
      if (g.kind === 'down') {
        const sl = slide(); sl.style.transition = 'none';
        sl.style.transform = `translateY(${dy}px) scale(${1 - Math.min(dy, 400) / 2000})`;
        v.style.background = `rgba(0,0,0,${Math.max(0, 1 - dy / 500)})`;
      }
    });
    const end = ev => {
      if (!pts.has(ev.pointerId)) return;
      pts.delete(ev.pointerId);
      if (!g) return;
      if (g.kind === 'pinch') {
        if (pts.size === 0) { if (z.s < 1.05) z = { s: 1, x: 0, y: 0 }; clampPan(); applyZoom(true); g = null; }
        else { const p = [...pts.values()][0]; g = { kind: 'pan', x0: p.x, y0: p.y, zx: z.x, zy: z.y }; }
        return;
      }
      if (pts.size) return;
      const dx = ev.clientX - g.x0, dy = ev.clientY - g.y0, dt = Date.now() - g.t0;
      if (g.kind === 'swipe') {
        const fast = Math.abs(dx) / Math.max(dt, 1) > .5;
        go(Math.abs(dx) > innerWidth * .22 || fast ? idx + (dx < 0 ? 1 : -1) : idx);
      } else if (g.kind === 'down') {
        const sl = slide();
        if (dy > 110) { close(); }
        else { sl.style.transition = 'transform .25s cubic-bezier(.22,.8,.24,1)'; sl.style.transform = ''; v.style.removeProperty('background'); }
      } else if (!g.kind && dt < 300) {
        // Doppeltipp: auf die Stelle zoomen oder zurück
        if (Date.now() - lastTap < 300 && media()?.tagName === 'IMG') {
          lastTap = 0;
          if (z.s > 1.01) z = { s: 1, x: 0, y: 0 };
          else { const s2 = 2.5, cx = innerWidth / 2, cy = innerHeight / 2; z = { s: s2, x: -(ev.clientX - cx) * (s2 - 1), y: -(ev.clientY - cy) * (s2 - 1) }; clampPan(); }
          applyZoom(true); haptic('select');
        } else lastTap = Date.now();
      }
      g = null;
    };
    v.addEventListener('pointerup', end);
    v.addEventListener('pointercancel', end);
    document.body.appendChild(v);
    draw();
  }

  function openPlaceSheet(place) {
    const isNew = !place;
    const p = place ? { ...place } : { id: uid(), name: '', kind: 'store', group: null, lat: null, lng: null, radius: 150, area: area() === 'arbeit' ? 'arbeit' : 'beide' };
    let confirmDel = false;
    const draw = () => showSheet(`
      <h3>${isNew ? 'Ort hinzufügen' : 'Ort bearbeiten'}</h3>
      <div class="field"><label for="o-name">Name</label><input id="o-name" value="${esc(p.name)}" placeholder="z. B. Kaufland Nordstadt oder Mama"></div>
      <div class="field"><label>Art</label><div class="seg">${[['store', 'Laden'], ['other', 'Sonstiger Ort'], ['person', 'Person']].map(([k, l]) => `<button type="button" data-kind="${k}" aria-pressed="${p.kind === k}">${l}</button>`).join('')}</div></div>
      ${p.kind === 'store' ? `<div class="field"><label for="o-group">Gehört zu</label><select id="o-group"><option value="">Keine Gruppe</option>${Object.entries(GROUPS).map(([g, n]) => `<option value="${g}" ${p.group === g ? 'selected' : ''}>${n}</option>`).join('')}</select></div>` : ''}
      ${p.kind !== 'person' ? `<div class="field"><label for="o-radius">Radius</label><select id="o-radius">${[100, 150, 200, 300, 500].map(r => `<option value="${r}" ${p.radius == r ? 'selected' : ''}>${r} m</option>`).join('')}</select></div>
      <p class="hint">${p.lat != null ? 'Standort ist gespeichert.' : 'Den Standort speicherst du, wenn du dort bist: „Standort hier speichern“.'}</p>` : '<p class="hint">Listen für Personen erscheinen unter „Wenn du … siehst“.</p>'}
      <div class="field"><label>Zeigen in</label><div class="seg">${[['beide', 'Beiden Bereichen'], ['privat', 'Privat'], ['arbeit', 'Arbeit']].map(([k, l]) => `<button type="button" data-parea="${k}" aria-pressed="${(p.area || 'beide') === k}">${l}</button>`).join('')}</div></div>
      <p class="hint" id="formError" hidden></p>
      <div class="sheet-actions">${isNew ? '<button class="btn ghost" data-close>Abbrechen</button>' : `<button class="btn ghost" id="delPlace">${confirmDel ? 'Wirklich löschen?' : 'Löschen'}</button>`}<button class="btn primary" id="savePlace">Speichern</button></div>`,
      'Ort', ev => {
        const b = ev.target.closest('button'); if (!b) return;
        const read = () => { p.name = (document.getElementById('o-name').value || '').trim(); const g = document.getElementById('o-group'); p.group = g ? (g.value || null) : null; const r = document.getElementById('o-radius'); if (r) p.radius = Number(r.value); };
        if (b.dataset.kind) { read(); p.kind = b.dataset.kind; if (p.kind !== 'store') p.group = null; draw(); }
        if (b.dataset.parea) { read(); p.area = b.dataset.parea; draw(); }
        if (b.id === 'delPlace') {
          if (!confirmDel) { read(); confirmDel = true; draw(); return; }
          state.places = state.places.filter(x => x.id !== p.id);
          state.entries = state.entries.filter(e => !(e.type === 'place' && e.placeId === p.id));
          save(); closeSheet(); render(); return;
        }
        if (b.id === 'savePlace') {
          read();
          if (!p.name) { const err = document.getElementById('formError'); err.hidden = false; err.textContent = 'Gib dem Ort einen Namen.'; return; }
          if (isNew) state.places.push(p); else Object.assign(state.places.find(x => x.id === p.id), p);
          save(); closeSheet(); render();
        }
      });
    draw();
  }

  function openCaseSheet(c) {
    let confirmClose = false;
    const word = () => ctxOf(c) === 'arbeit' ? 'Projekt' : 'Vorgang';
    const draw = () => {
      const es = state.entries.filter(e => e.caseId === c.id).sort((a, b) => (a.received || a.date || '').localeCompare(b.received || b.date || '') || a.createdAt - b.createdAt);
      const photos = es.flatMap(e => e.photos || []);
      const people = [...new Set(es.map(e => e.contactId).filter(Boolean))].map(contactById).filter(Boolean);
      const ms = es.reduce((a, e) => a + loggedMs(e), 0);
      showSheet(`
        <div class="sheet-head"><h3>${word()}</h3>${ctxChip(ctxOf(c))}</div>
        <div class="field"><label for="v-title" class="sr-only">Name</label><input id="v-title" value="${esc(c.title)}"></div>
        <div class="chips">${Object.entries(CASE_STATUS).map(([k, l]) => `<button type="button" class="chip" data-status="${k}" aria-pressed="${(c.status || 'offen') === k}">${l}</button>`).join('')}</div>
        <div class="field"><label for="v-next">Nächster Schritt</label><input id="v-next" value="${esc(c.next || '')}" placeholder="z. B. Gerät vom Kunden abwarten"></div>
        ${people.length || ms >= 60e3 ? `<div class="sub">${[people.map(k => `<button type="button" class="tag person" data-contactopen="${k.id}">${esc(k.name)}</button>`).join(' '), ms >= 60e3 ? `Zeitaufwand ${fmtDur(ms)}` : ''].filter(Boolean).join(' · ')}</div>` : ''}
        ${mediaThumbs(photos)}
        <ul class="timeline">${es.map(e => `<li><span class="when">${(e.received || e.date) ? parse(e.received || e.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</span>
          <div class="body" data-editcase="${e.id}" style="cursor:pointer"><div class="title">${esc(e.title)}${e.done ? ' ✓' : ''}</div><div class="desc">${[TYPE[e.type].label, e.ref, e.date && e.type === 'deadline' ? `Frist ${fmtDate(e.date)}` : '', e.items?.length && e.type !== 'place' ? `${e.items.filter(i => i.done).length}/${e.items.length} Schritte` : '', e.proof ? esc(e.proof.method) : ''].filter(Boolean).map(esc).join(' · ')}</div></div></li>`).join('') || '<li><span></span><span class="sub">Noch keine Einträge.</span></li>'}</ul>
        <div class="row-actions"><button class="btn small" id="caseAdd">Eintrag hinzufügen</button><button class="btn small" id="caseScan">Brief scannen</button><button class="btn small ghost" id="caseCopy">Kopieren</button><button class="btn small ghost" id="casePdf">Als PDF teilen</button></div>
        <div class="sheet-actions"><button class="btn ghost" id="caseClose">${confirmClose ? 'Wirklich abschließen?' : 'Abschließen'}</button><button class="btn primary" id="caseSave">Fertig</button></div>`,
        word(), async ev => {
          const b = ev.target.closest('button, img[data-view], [data-editcase]'); if (!b) return;
          const title = (document.getElementById('v-title').value || '').trim(); if (title) c.title = title;
          c.next = (document.getElementById('v-next').value || '').trim();
          if (b.dataset.view !== undefined) return openViewer(photos, +b.dataset.view);
          if (b.dataset.status) { c.status = b.dataset.status; save(); haptic('select'); sheetRoot.querySelectorAll('[data-status]').forEach(x => x.setAttribute('aria-pressed', x === b)); return; }
          if (b.dataset.contactopen) { save(); return openContactSheet(contactById(b.dataset.contactopen)); }
          if (b.dataset.ctxToggle !== undefined) { c.context = ctxOf(c) === 'arbeit' ? 'privat' : 'arbeit'; es.forEach(e => { e.context = c.context; }); save(); haptic('select'); return draw(); }
          if (b.dataset.editcase) { save(); return openSheet(state.entries.find(e => e.id === b.dataset.editcase)); }
          if (b.id === 'caseAdd') { save(); return openSheet(null, { type: 'task', caseId: c.id }); }
          if (b.id === 'caseScan') { save(); closeSheet(); await scanLetter(); return; }
          if (b.id === 'caseCopy') return copyText(caseText(c), `${word()} kopiert`);
          if (b.id === 'casePdf') { save(); return sharePdf(`${word()} ${c.title}`, await caseReportHtml(c)); }
          if (b.id === 'caseClose') { if (!confirmClose) { confirmClose = true; draw(); return; } c.closed = true; logDone({ id: c.id, type: 'case', context: ctxOf(c) }, `${word()} abgeschlossen: ${c.title}`); save(); closeSheet(); render(); return; }
          if (b.id === 'caseSave') { save(); closeSheet(); render(); }
        });
      hydratePhotos(sheetRoot);
    };
    draw();
  }
  function caseText(c) {
    const es = state.entries.filter(e => e.caseId === c.id);
    return [`${ctxOf(c) === 'arbeit' ? 'Projekt' : 'Vorgang'}: ${c.title}`, `Status: ${CASE_STATUS[c.status || 'offen']}`, c.next && `Nächster Schritt: ${c.next}`].filter(Boolean).join('\n') + '\n\n' + es.map(entryText).join('\n\n');
  }

  /* ---------- Berichte als Text: Woche und Standup ---------- */
  const weekNo = day => { const d = parse(day); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); const y = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - y) / 864e5 - 3 + (y.getDay() + 6) % 7) / 7); };
  const logLine = l => {
    const e = state.entries.find(x => x.id === l.entryId), who = e && contactById(e.contactId);
    const extra = [e?.ref, who?.name, e?.proof && `per ${e.proof.method}${e.proof.note ? ' ' + e.proof.note : ''}`, e && e.timeLog?.length && fmtDur(loggedMs(e))].filter(Boolean);
    return `- ${hhmm(l.at)} ${l.title}${extra.length ? ` (${extra.join(', ')})` : ''}`;
  };
  function weekReport() {
    const t = today(), mo = L.mondayOf(t), su = addDays(mo, 6);
    const out = [`Wochenbericht KW ${weekNo(t)} (${shortDate(mo).slice(0, 6)} bis ${shortDate(su)})${area() !== 'alle' ? ' – ' + AREAS[area()] : ''}`];
    const logs = state.log.filter(l => logInArea(l) && iso(new Date(l.at)) >= mo && iso(new Date(l.at)) <= su).reverse();
    out.push('', `Erledigt (${logs.length}):`);
    let last = null;
    logs.forEach(l => { const d = iso(new Date(l.at)); if (d !== last) { out.push(parse(d).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric' }) + ':'); last = d; } out.push(logLine(l)); });
    if (!logs.length) out.push('- noch nichts');
    const cases = state.cases.filter(c => !c.closed && inArea(c));
    if (cases.length) { out.push('', area() === 'arbeit' ? 'Projekte:' : 'Vorgänge:'); cases.forEach(c => out.push(`- ${c.title}: ${CASE_STATUS[c.status || 'offen']}${c.next ? ' · nächster Schritt: ' + c.next : ''}`)); }
    const waiting = state.entries.filter(e => e.type === 'waiting' && !e.done && inArea(e));
    if (waiting.length) { out.push('', 'Wartet auf:'); waiting.forEach(e => out.push(`- ${e.title}${e.ref ? ' (' + e.ref + ')' : ''} bei ${contactById(e.contactId)?.name || e.source || '?'}${e.received ? ' seit ' + shortDate(e.received).slice(0, 6) : ''}`)); }
    const next = state.entries.filter(e => inArea(e) && !e.done && e.date && e.date > su && daysBetween(su, e.date) <= 7 && e.type !== 'place');
    if (next.length) { out.push('', 'Nächste Woche:'); next.sort((a, b) => a.date.localeCompare(b.date)).forEach(e => out.push(`- ${fmtDate(e.date)} ${e.title}`)); }
    return out.join('\n');
  }
  function standupText() {
    const t = today(), ctx = area() === 'alle' ? null : area();
    const inC = l => !ctx || logInArea(l);
    // letzter Tag mit Erledigtem, höchstens eine Woche zurück
    let prev = addDays(t, -1);
    for (let i = 0; i < 7 && !state.log.some(l => iso(new Date(l.at)) === prev && inC(l)); i++) prev = addDays(prev, -1);
    if (!state.log.some(l => iso(new Date(l.at)) === prev && inC(l))) prev = addDays(t, -1);
    const y = state.log.filter(l => iso(new Date(l.at)) === prev && inC(l)).reverse();
    const m = dayModel(t);
    const todo = [...m.overdue, ...m.todays.filter(e => !e.done), ...m.week.slice(0, 3)];
    const blocked = [...state.entries.filter(e => e.type === 'waiting' && !e.done && inArea(e)), ...state.cases.filter(c => !c.closed && inArea(c) && ['kunde', 'kollege'].includes(c.status))];
    const out = [`Standup ${longDate(t)}`, '', `${daysBetween(prev, t) === 1 ? 'Gestern' : parse(prev).toLocaleDateString('de-DE', { weekday: 'long' })}:`];
    out.push(...(y.length ? y.map(l => logLine(l).replace(/^- \d\d:\d\d /, '- ')) : ['- nichts abgehakt']));
    out.push('', 'Heute:', ...(todo.length ? todo.map(e => `- ${e.title}${e.ref ? ' (' + e.ref + ')' : ''}${e.items?.length && e.type !== 'place' ? ` [${e.items.filter(i => i.done).length}/${e.items.length}]` : ''}`) : ['- noch nichts geplant']));
    if (state.handover?.text && state.handover.date < t) out.push('', 'Notiz von gestern:', state.handover.text);
    if (blocked.length) out.push('', 'Wartet auf / blockiert:', ...blocked.map(x => x.status ? `- ${x.title}: ${CASE_STATUS[x.status]}` : `- ${x.title} bei ${contactById(x.contactId)?.name || x.source || '?'}`));
    return out.join('\n');
  }

  /* ---------- PDF-Bericht ---------- */
  async function caseReportHtml(c) {
    const es = state.entries.filter(e => e.caseId === c.id).sort((a, b) => (a.received || a.date || '').localeCompare(b.received || b.date || '') || a.createdAt - b.createdAt);
    const people = [...new Set(es.map(e => e.contactId).filter(Boolean))].map(contactById).filter(Boolean);
    const img = async p => { try { return 'data:image/jpeg;base64,' + await readPhotoBase64(p); } catch { return ''; } };
    let body = '';
    for (const e of es) {
      const when = e.received || e.date;
      let ph = '';
      for (const p of e.photos || []) {
        if (isVideo(p)) { ph += `<p class="cap">Video${state.media[p] ? ' vom ' + esc(mediaCaption(p)) : ''} (in der App)</p>`; continue; }
        const src = await img(p); if (src) ph += `<figure><img src="${src}"><figcaption>${esc(mediaCaption(p))}</figcaption></figure>`;
      }
      body += `<section><h2>${esc(e.title)}${e.done ? ' ✓' : ''}</h2><p class="meta">${[when && shortDate(when), TYPE[e.type].label, e.ref, contactById(e.contactId)?.name, e.type === 'deadline' && e.date && `Frist ${shortDate(e.date)}`, e.proof && `Nachweis: ${e.proof.method}${e.proof.note ? ' – ' + e.proof.note : ''}`, e.timeLog?.length && `Zeit ${fmtDur(loggedMs(e))}`].filter(Boolean).map(esc).join(' · ')}</p>
        ${e.notes ? `<p class="notes">${esc(e.notes).replace(/\n/g, '<br>')}</p>` : ''}
        ${e.type !== 'place' && e.items?.length ? `<ul class="check">${e.items.map(i => `<li>${i.done ? '☑' : '☐'} ${esc(i.text)}</li>`).join('')}</ul>` : ''}
        ${ph}</section>`;
    }
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
      body { font-family: -apple-system, "Helvetica Neue", sans-serif; color: #1F2522; font-size: 11pt; line-height: 1.45; margin: 0; }
      h1 { font-size: 20pt; margin: 0 0 4pt; } h2 { font-size: 13pt; margin: 0 0 2pt; }
      .sub { color: #6E7670; font-size: 10pt; margin: 0 0 14pt; } .meta { color: #6E7670; font-size: 9.5pt; margin: 0 0 6pt; }
      section { border-top: 1px solid #E1E3DD; padding: 10pt 0; page-break-inside: avoid; }
      .notes { margin: 4pt 0; } ul.check { list-style: none; padding: 0; margin: 4pt 0; }
      figure { margin: 8pt 0; } img { max-width: 100%; max-height: 420pt; border-radius: 4pt; } figcaption, .cap { color: #6E7670; font-size: 9pt; margin-top: 3pt; }
    </style></head><body>
      <h1>${esc(c.title)}</h1>
      <p class="sub">${[ctxOf(c) === 'arbeit' ? 'Projekt' : 'Vorgang', CASE_STATUS[c.status || 'offen'], c.next && 'Nächster Schritt: ' + c.next, people.length && 'Personen: ' + people.map(k => k.name + (k.company ? ' (' + k.company + ')' : '')).join(', '), 'Stand ' + new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })].filter(Boolean).map(esc).join(' · ')}</p>
      ${body || '<p>Noch keine Einträge.</p>'}
      <p class="sub" style="margin-top:20pt">Erstellt mit WDID</p></body></html>`;
  }
  async function sharePdf(name, html) {
    const safe = name.replace(/[^\wäöüÄÖÜß .-]+/g, '').trim().slice(0, 60) || 'WDID-Bericht';
    try {
      if (Native && Share) {
        toast('PDF wird erstellt …');
        const { uri } = await Native.makePdf({ html, name: safe });
        await Share.share({ title: safe, files: [uri] });
      } else {
        const w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })));
        if (w) setTimeout(() => { try { w.print(); } catch {} }, 600); else toast('Pop-up blockiert');
      }
    } catch (err) { if (!/cancel/i.test(err.message || '')) toast('PDF hat nicht geklappt: ' + err.message); }
  }

  /* ---------- Personen ---------- */
  const lastContact = k => Math.max(k.lastAt || 0, ...state.log.filter(l => { const e = state.entries.find(x => x.id === l.entryId); return e && e.contactId === k.id; }).map(l => l.at)) || null;
  const relDay = ts => { const d = daysBetween(iso(new Date(ts)), today()); return d === 0 ? 'heute' : d === 1 ? 'gestern' : d < 7 ? `vor ${d} Tagen` : `am ${shortDate(iso(new Date(ts)))}`; };
  function openContactSheet(k) {
    const isNew = !k;
    const c = k ? { ...k } : { id: uid(), name: '', company: '', phone: '', email: '', notes: '', context: defaultCtx(), lastAt: null };
    let confirmDel = false;
    const draw = () => {
      const es = isNew ? [] : state.entries.filter(e => e.contactId === c.id);
      const open = es.filter(e => !e.done).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')), done = es.filter(e => e.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
      const last = isNew ? null : lastContact(c);
      const tel = c.phone.replace(/[^\d+]/g, '');
      showSheet(`
        <div class="sheet-head"><h3>${isNew ? 'Neue Person' : esc(c.name)}</h3>${ctxChip(ctxOf(c))}</div>
        <div class="two"><div class="field"><label for="k-name">Name</label><input id="k-name" value="${esc(c.name)}" placeholder="z. B. Frau Jessen"></div>
        <div class="field"><label for="k-company">Firma oder Rolle</label><input id="k-company" value="${esc(c.company)}" placeholder="z. B. Muster GmbH"></div></div>
        <div class="two"><div class="field"><label for="k-phone">Telefon</label><input id="k-phone" type="tel" value="${esc(c.phone)}"></div>
        <div class="field"><label for="k-email">E-Mail</label><input id="k-email" type="email" value="${esc(c.email)}" autocapitalize="off"></div></div>
        ${!isNew && (tel || c.email) ? `<div class="row-actions" style="margin:0">${tel ? `<a class="btn small" href="tel:${esc(tel)}">Anrufen</a>` : ''}${c.email ? `<a class="btn small" href="mailto:${esc(c.email)}">E-Mail</a>` : ''}</div>` : ''}
        <div class="field"><label for="k-notes">Notizen</label><textarea id="k-notes" placeholder="Zuständig für, erreichbar wann, worauf achten">${esc(c.notes)}</textarea></div>
        ${isNew ? '' : `<div class="card-row"><span class="sub">${last ? `Letzter Kontakt ${relDay(last)}` : 'Noch kein Kontakt notiert'}</span><button class="btn small" id="k-touch" type="button">Kontakt gehabt</button></div>
        <div class="dept">Offen (${open.length})</div>
        ${open.length ? `<ul class="timeline">${open.map(e => `<li><span class="when">${e.date ? fmtDate(e.date) : '—'}</span><div class="body" data-kedit="${e.id}" style="cursor:pointer"><div class="title">${esc(e.title)}</div><div class="desc">${[TYPE[e.type].label, e.ref].filter(Boolean).map(esc).join(' · ')}</div></div></li>`).join('')}</ul>` : '<p class="hint">Nichts offen.</p>'}
        ${done.length ? `<div class="dept">Erledigt</div><ul class="timeline">${done.slice(0, 10).map(e => `<li><span class="when">${e.doneAt ? shortDate(iso(new Date(e.doneAt))).slice(0, 6) : ''}</span><div class="body" data-kedit="${e.id}" style="cursor:pointer"><div class="title">${esc(e.title)}</div></div></li>`).join('')}</ul>` : ''}
        <div class="row-actions"><button class="btn small" id="k-new">Eintrag für ${esc(c.name.split(' ').slice(-1)[0] || 'Person')}</button><button class="btn small ghost" id="k-copy">Kopieren</button></div>`}
        <p class="hint" id="formError" hidden></p>
        <div class="sheet-actions">${isNew ? '<button class="btn ghost" data-close>Abbrechen</button>' : `<button class="btn ghost" id="k-del">${confirmDel ? 'Wirklich löschen?' : 'Löschen'}</button>`}<button class="btn primary" id="k-save">${isNew ? 'Speichern' : 'Fertig'}</button></div>`,
        'Person', ev => {
          const b = ev.target.closest('button, [data-kedit]'); if (!b) return;
          const read = () => { ['name', 'company', 'phone', 'email', 'notes'].forEach(f => { c[f] = (document.getElementById('k-' + f).value || '').trim(); }); };
          read();
          const commit = () => { if (isNew) state.contacts.push(c); else Object.assign(state.contacts.find(x => x.id === c.id), c); save(); };
          if (b.dataset.ctxToggle !== undefined) { c.context = ctxOf(c) === 'arbeit' ? 'privat' : 'arbeit'; haptic('select'); return draw(); }
          if (b.dataset.kedit) { commit(); return openSheet(state.entries.find(e => e.id === b.dataset.kedit)); }
          if (b.id === 'k-touch') { c.lastAt = Date.now(); commit(); state.log.unshift({ id: uid(), entryId: null, title: `Kontakt mit ${c.name}`, type: 'contact', at: Date.now(), ctx: ctxOf(c), contactId: c.id }); save(); haptic('light'); toast('Notiert'); return draw(); }
          if (b.id === 'k-new') { commit(); return openSheet(null, { type: 'task', contactId: c.id }); }
          if (b.id === 'k-copy') return copyText([`Person: ${c.name}`, c.company && `Firma: ${c.company}`, c.phone && `Telefon: ${c.phone}`, c.email && `E-Mail: ${c.email}`, c.notes && `Notizen: ${c.notes}`,
            open.length && '\nOffen:\n' + open.map(e => `- ${e.title}${e.ref ? ' (' + e.ref + ')' : ''}${e.date ? ' · ' + fmtDate(e.date) : ''}`).join('\n')].filter(Boolean).join('\n'), 'Person kopiert');
          if (b.id === 'k-del') {
            if (!confirmDel) { confirmDel = true; return draw(); }
            state.contacts = state.contacts.filter(x => x.id !== c.id); state.entries.forEach(e => { if (e.contactId === c.id) e.contactId = null; });
            save(); closeSheet(); render(); return;
          }
          if (b.id === 'k-save') {
            if (!c.name) { const err = document.getElementById('formError'); err.hidden = false; err.textContent = 'Gib der Person einen Namen.'; return; }
            commit(); closeSheet(); render();
          }
        });
    };
    draw();
  }

  /* ---------- Feierabend-Übergabe ---------- */
  function openHandover() {
    const t = today(), m = dayModel(t, { ctx: 'arbeit' });
    const open = [...m.overdue, ...m.todays.filter(e => !e.done), ...m.week];
    const waiting = state.entries.filter(e => e.type === 'waiting' && !e.done && ctxOf(e) === 'arbeit');
    const prev = state.handover && state.handover.date === t ? state.handover.text : '';
    showSheet(`
      <h3>Feierabend-Übergabe</h3>
      <p class="hint">Was machst du morgen zuerst? Steht morgen früh ganz oben im Arbeitsbereich.</p>
      ${open.length ? `<div class="dept">Noch offen</div><div class="chips">${open.slice(0, 12).map(e => `<button type="button" class="chip add" data-hpick="${esc(e.title)}">${esc(e.title)}</button>`).join('')}</div>` : '<p class="hint">Alles erledigt für heute.</p>'}
      ${waiting.length ? `<p class="hint">Wartet auf: ${waiting.map(e => esc(e.title)).join(', ')}</p>` : ''}
      <div class="field"><label for="h-text">Morgen zuerst</label><textarea id="h-text" placeholder="1. …">${esc(prev)}</textarea></div>
      <div class="sheet-actions"><button class="btn ghost" data-close>Später</button><button class="btn primary" id="hSave">Speichern</button></div>`,
      'Feierabend-Übergabe', ev => {
        const b = ev.target.closest('button'); if (!b) return;
        const ta = document.getElementById('h-text');
        if (b.dataset.hpick) { ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + '- ' + b.dataset.hpick; b.remove(); return; }
        if (b.id === 'hSave') {
          state.handover = { text: ta.value.trim(), date: t };
          if (state.settings.autoArea || area() === 'arbeit') { state.settings.area = 'privat'; applyArea(); }
          save(); closeSheet(); render({ enter: true });
          if (dayOpenCountCtx('arbeit') === 0) confetti();
          haptic('success'); toast('Schönen Feierabend');
        }
      });
  }
  const dayOpenCountCtx = ctx => { const m = dayModel(today(), { ctx }); return [...m.overdue, ...m.todays].filter(e => !e.done).length; };

  function openReview() {
    const draw = () => {
      const t = today(), m = dayModel(t);
      const done = state.log.filter(l => iso(new Date(l.at)) === t && logInArea(l));
      const open = [...m.overdue, ...m.todays.filter(e => !e.done && e.type !== 'deadline')];
      showSheet(`
        <h3>Tagesrückblick</h3>
        <div class="stat-row"><div class="stat"><b>${done.length}</b><span>heute erledigt</span></div><div class="stat"><b>${open.length}</b><span>noch offen</span></div></div>
        ${done.length ? `<ul class="timeline">${done.map(l => `<li><span class="when">${hhmm(l.at)}</span><div class="body"><div class="title">${esc(l.title)}</div>${l.place ? `<div class="desc">bei ${esc(l.place)}</div>` : ''}</div></li>`).join('')}</ul>` : '<p class="hint">Heute noch nichts abgehakt.</p>'}
        ${open.length ? `<div class="dept">Noch offen</div><ul class="timeline">${open.map(e => `<li><span class="when">${e.time || (e.date < t ? fmtDate(e.date) : '—')}</span><div class="body"><div class="title">${esc(e.title)}</div>
          <div class="row-actions"><button class="btn small" data-movetomorrow="${e.id}">Morgen</button><input type="date" class="btn small" data-moveto="${e.id}" aria-label="Anderer Tag" value="${addDays(t, 1)}"><button class="btn small ghost" data-doneid="${e.id}">Doch erledigt</button></div></div></li>`).join('')}</ul>` : ''}
        <div class="sheet-actions">${open.length ? '<button class="btn" id="allTomorrow">Alles auf morgen</button>' : ''}<button class="btn primary" data-close>Fertig</button></div>`,
        'Tagesrückblick', ev => {
          const b = ev.target.closest('button'); if (!b) return;
          const t2 = addDays(today(), 1);
          if (b.dataset.movetomorrow) { moveTo(state.entries.find(e => e.id === b.dataset.movetomorrow), t2); draw(); render(); }
          if (b.dataset.doneid) { complete(state.entries.find(e => e.id === b.dataset.doneid)); draw(); }
          if (b.id === 'allTomorrow') { open.forEach(e => { e.date = t2; }); save(); toast(`${open.length} auf morgen verschoben`); closeSheet(); render(); }
        }, ev => {
          if (ev.target.dataset.moveto && ev.target.value) { moveTo(state.entries.find(e => e.id === ev.target.dataset.moveto), ev.target.value); toast('Verschoben auf ' + fmtDate(ev.target.value)); draw(); render(); }
        });
    };
    draw();
  }

  /* ---------- Einstellungen & Backup ---------- */
  function openSettings() {
    const s = state.settings;
    const sw = (id, on) => `<input type="checkbox" class="switch" id="${id}" ${on ? 'checked' : ''}>`;
    const themeBtns = Object.entries(THEMES).map(([k, t]) => `<button type="button" data-theme-pick="${k}" aria-pressed="${s.theme === k}">
        <span class="swatch${k === 'system' ? ' sys' : ''}" style="${t.bg ? `--s-bg:${t.bg};--s-sf:${t.sf};--s-ac:${t.ac}` : ''}"></span>${t.name}</button>`).join('');
    showSheet(`
      <h3>Einstellungen</h3>
      <div class="dept">Aussehen</div>
      <div class="themes">${themeBtns}</div>
      <div class="setting"><div><div class="title">Animationen</div><div class="hint">Sanfte Übergänge, Funken und Konfetti beim Abhaken</div></div>${sw('s-motion', s.motion)}</div>
      ${native ? `<div class="setting"><div><div class="title">Vibration</div><div class="hint">Leichtes Tippen beim Abhaken</div></div>${sw('s-haptics', s.haptics)}</div>` : ''}
      <div class="dept">Alltag</div>
      <div class="setting"><div><div class="title">Bundesland</div><div class="hint">Für Feiertage im Fristrechner</div></div><select id="s-state">${Object.entries(L.STATES).map(([k, n]) => `<option value="${k}" ${s.state === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="setting"><div><div class="title">Morgen-Briefing</div><div class="hint">Eine Mitteilung mit allem für den Tag</div></div><div class="row-actions" style="margin:0"><input type="time" id="s-morningTime" value="${s.morningTime}">${sw('s-morningOn', s.morningOn)}</div></div>
      <div class="setting"><div><div class="title">Tagesabschluss</div><div class="hint">Rückblick und Offenes verschieben</div></div><div class="row-actions" style="margin:0"><input type="time" id="s-eveningTime" value="${s.eveningTime}">${sw('s-eveningOn', s.eveningOn)}</div></div>
      <div class="dept">Arbeit</div>
      <div class="setting"><div><div class="title">Arbeits-Briefing</div><div class="hint">Zu Arbeitsbeginn eine Mitteilung nur mit der Arbeit. Das Morgen-Briefing zeigt dann nur Privates.</div></div>${sw('s-workBriefing', s.workBriefing)}</div>
      <div class="setting"><div><div class="title">Feierabend-Übergabe</div><div class="hint">Zum Arbeitsende kurz notieren, was morgen zuerst dran ist</div></div>${sw('s-handoverOn', s.handoverOn)}</div>
      <div class="setting"><div><div class="title">Abrechnen in Schritten</div><div class="hint">Zeit je Eintrag aufrunden</div></div><select id="s-billRound">${[[0, 'genau'], [5, '5 min'], [6, '6 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '1 h']].map(([v, l]) => `<option value="${v}" ${+s.billRound === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="setting"><div><div class="title">Bereich automatisch wechseln</div><div class="hint">In der Arbeitszeit Arbeit, danach Privat. Von Hand umschalten geht immer.</div></div>${sw('s-autoArea', s.autoArea)}</div>
      <div class="setting"><div><div class="title">Arbeitszeit</div><div class="chips" style="margin-top:6px">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" class="chip" data-workday="${d}" aria-pressed="${s.workDays.includes(d)}">${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d]}</button>`).join('')}</div></div><div class="row-actions" style="margin:0"><input type="time" id="s-workStart" value="${s.workStart}"><input type="time" id="s-workEnd" value="${s.workEnd}"></div></div>
      ${native ? `<div class="setting"><div><div class="title">Mit Face ID sperren</div><div class="hint">Beim Öffnen der App</div></div>${sw('s-lock', s.lock)}</div>` : ''}
      <div class="dept">Vorlagen</div>
      ${state.templates.length ? state.templates.map(tp => `<div class="setting"><div><div class="title">${esc(tp.name)}</div><div class="hint">${[TYPE[tp.entry.type]?.label, ctxOf(tp.entry) === 'arbeit' ? 'Arbeit' : 'Privat', tp.entry.items?.length ? tp.entry.items.length + ' Schritte' : ''].filter(Boolean).join(' · ')}</div></div><button class="btn small ghost" data-tpldel="${tp.id}">Löschen</button></div>`).join('') : '<p class="hint">Noch keine. Im Eintrag unten auf „Als Vorlage speichern“ tippen.</p>'}
      <div class="dept">Backup</div>
      <div class="field"><label for="b-pass">Passwort für das Backup (optional)</label><input id="b-pass" type="password" autocomplete="new-password" placeholder="Leer lassen für unverschlüsselt"></div>
      <div class="row-actions"><button class="btn" id="exportBtn">Backup exportieren</button><button class="btn ghost" id="importBtn">Backup einspielen</button></div>
      <div id="importArea"></div>
      <div class="dept">Kurzbefehl für den Action-Button</div>
      <p class="hint">Kurzbefehle-App → neuer Kurzbefehl → „URL öffnen“ mit <b>wdid://neu</b> (neuer Eintrag mit Schnelleingabe) oder <b>wdid://scan</b> (Brief scannen). Dann unter Einstellungen → Action-Button → Kurzbefehl auswählen. Diktieren geht mit dem Mikrofon der Tastatur, auch offline.</p>
      <div class="dept">Mit dem iOS-Fokus koppeln</div>
      <p class="hint">Kurzbefehle-App → Automation → Fokus „Arbeit“ → „Wenn aktiviert“ → Aktion „URL öffnen“ mit <b>wdid://bereich/arbeit</b>. Eine zweite Automation „Wenn deaktiviert“ mit <b>wdid://bereich/privat</b>. Außerdem öffnet <b>wdid://uebergabe</b> die Feierabend-Übergabe.</p>
      <div class="sheet-actions"><button class="btn primary" data-close>Fertig</button></div>`,
      'Einstellungen', async ev => {
        const b = ev.target.closest('button'); if (!b) return;
        if (b.dataset.tpldel) { state.templates = state.templates.filter(x => x.id !== b.dataset.tpldel); save(); b.closest('.setting').remove(); toast('Vorlage gelöscht'); return; }
        if (b.dataset.workday) {
          const d = +b.dataset.workday; s.workDays = s.workDays.includes(d) ? s.workDays.filter(x => x !== d) : [...s.workDays, d];
          b.setAttribute('aria-pressed', s.workDays.includes(d)); save(); return;
        }
        if (b.dataset.themePick) {
          s.theme = b.dataset.themePick; save(); applyLook(true); haptic('select');
          sheetRoot.querySelectorAll('[data-theme-pick]').forEach(x => x.setAttribute('aria-pressed', x === b));
          return;
        }
        if (b.id === 'exportBtn') return exportBackup(document.getElementById('b-pass').value);
        if (b.id === 'importBtn') return importBackup(document.getElementById('b-pass').value);
      }, async ev => {
        const id = ev.target.id; if (!id.startsWith('s-')) return;
        const k = id.slice(2);
        if (k === 'lock' && ev.target.checked) {
          const r = await Native.authenticate({ reason: 'Face ID für WDID einschalten' }).catch(() => ({ success: false }));
          if (!r.success) { ev.target.checked = false; return toast('Face ID ist nicht verfügbar'); }
        }
        s[k] = ev.target.type === 'checkbox' ? ev.target.checked : k === 'billRound' ? Number(ev.target.value) : ev.target.value;
        if (k === 'motion') applyLook(false);
        if (k === 'autoArea' && s.autoArea) { lastAuto = null; autoSwitchArea(); }
        if (k === 'haptics' && s.haptics) haptic('medium');
        save(); render();
      });
  }

  const b64enc = buf => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const b64dec = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
  async function deriveKey(pass, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function exportBackup(pass) {
    try {
      toast('Backup wird erstellt …');
      const photos = {};
      // Videos bleiben draußen, sonst wird das Backup riesig
      for (const p of new Set(state.entries.flatMap(e => e.photos || []).filter(p => !isVideo(p)))) { try { photos[p] = await readPhotoBase64(p); } catch {} }
      const files = {};
      for (const f of state.files) if (!f.path.startsWith('data:') && kindOf(f) !== 'video') { try { files[f.path] = await readPhotoBase64(f.path); } catch {} }
      const payload = JSON.stringify({ app: 'WDID', version: 2, createdAt: new Date().toISOString(), state, photos, files });
      let file;
      if (pass) {
        const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(pass, salt);
        const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(payload));
        file = JSON.stringify({ wdidBackup: 1, encrypted: true, salt: b64enc(salt), iv: b64enc(iv), data: b64enc(data) });
      } else file = JSON.stringify({ wdidBackup: 1, encrypted: false, data: payload });
      const name = `WDID-Backup-${today()}.wdid`;
      if (FS && Share) {
        await FS.writeFile({ path: name, data: file, directory: 'CACHE', encoding: 'utf8' });
        const { uri } = await FS.getUri({ path: name, directory: 'CACHE' });
        await Share.share({ title: 'WDID-Backup', files: [uri] });
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([file], { type: 'application/json' })); a.download = name; a.click();
      }
    } catch (err) { if (!/cancel/i.test(err.message || '')) toast('Backup fehlgeschlagen: ' + err.message); }
  }
  function importBackup(pass) {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.wdid,application/json,.json,*/*';
    input.onchange = async () => {
      const f = input.files[0]; if (!f) return;
      try {
        const outer = JSON.parse(await f.text());
        if (!outer.wdidBackup) throw new Error('Das ist keine WDID-Backup-Datei.');
        let payload = outer.data;
        if (outer.encrypted) {
          if (!pass) throw new Error('Das Backup ist verschlüsselt. Gib oben das Passwort ein.');
          const key = await deriveKey(pass, b64dec(outer.salt));
          try { payload = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64dec(outer.iv) }, key, b64dec(outer.data))); }
          catch { throw new Error('Falsches Passwort.'); }
        }
        const backup = JSON.parse(payload);
        const area = document.getElementById('importArea');
        area.innerHTML = `<div class="banner"><span>Backup vom ${new Date(backup.createdAt).toLocaleString('de-DE')} mit ${backup.state.entries.length} Einträgen. Deine jetzigen Daten werden ersetzt.</span><button class="btn small" id="confirmImport">Einspielen</button></div>`;
        document.getElementById('confirmImport').onclick = async () => {
          const map = {};
          for (const [p, data] of Object.entries(backup.photos || {})) { try { map[p] = await savePhoto(data); } catch {} }
          if (FS) for (const [p, data] of Object.entries(backup.files || {})) { try { await FS.writeFile({ path: p, data, directory: 'DATA', recursive: true }); } catch {} }
          state = migrate(backup.state);
          state.entries.forEach(e => { e.photos = (e.photos || []).map(p => map[p] || p); });
          ensureResignEntry(); save(); applyLook(true); closeSheet(); render(); toast('Backup eingespielt');
        };
      } catch (err) { toast(err.message); }
    };
    input.click();
  }

  /* ---------- Sperre ---------- */
  let lockedAt = 0;
  async function lockIfNeeded(force) {
    if (!native || !state.settings.lock) return;
    if (!force && Date.now() - lockedAt < 60e3) return;
    let el = document.getElementById('lock');
    if (!el) {
      el = document.createElement('div'); el.id = 'lock'; el.className = 'lock';
      el.innerHTML = '<div class="brand">WDID</div><h1>Gesperrt</h1><button class="btn primary" id="unlockBtn">Entsperren</button>';
      document.body.appendChild(el);
      el.querySelector('#unlockBtn').onclick = unlock;
    }
    unlock();
  }
  async function unlock() {
    const r = await Native.authenticate({ reason: 'WDID entsperren' }).catch(() => ({ success: false }));
    if (r.success) document.getElementById('lock')?.remove();
  }

  /* ---------- Aussehen ---------- */
  const darkMq = matchMedia('(prefers-color-scheme: dark)');
  function applyLook(animate) {
    const s = state.settings, root = document.documentElement;
    const theme = THEMES[s.theme] ? s.theme : 'system';
    if (animate && motionOn()) { root.classList.add('html-theme-anim'); setTimeout(() => root.classList.remove('html-theme-anim'), 500); }
    root.dataset.theme = theme;
    root.dataset.motion = s.motion ? 'on' : 'off';
    try { localStorage.setItem('wdid.look', JSON.stringify({ theme, motion: s.motion })); } catch {}
    const dark = theme === 'system' ? darkMq.matches : !!THEMES[theme].dark;
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim() || '#F3F4F1';
    document.querySelector('meta[name="theme-color"]').content = bg;
    if (Native) Native.setBackground({ color: bg }).catch(() => {});
    if (StatusBar) StatusBar.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {});
  }
  darkMq.addEventListener?.('change', () => state.settings.theme === 'system' && applyLook(true));

  /* ---------- Effekte: kleine Belohnungen fürs Abhaken ---------- */
  const reduceMq = matchMedia('(prefers-reduced-motion: reduce)');
  const motionOn = () => state.settings.motion && !reduceMq.matches;
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  function haptic(kind) {
    if (!Haptics || !state.settings.haptics) return;
    const p = kind === 'success' ? Haptics.notification({ type: 'SUCCESS' }) : kind === 'select' ? Haptics.selectionChanged() : Haptics.impact({ style: kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
    p.catch(() => {});
  }
  function fxLayer() {
    let fx = document.getElementById('fx');
    if (!fx) { fx = document.createElement('div'); fx.id = 'fx'; fx.setAttribute('aria-hidden', 'true'); document.body.appendChild(fx); }
    return fx;
  }
  function particle(x, y, { color, size, bit, dx, dy, rot = 0, dur, gravity = 0 }) {
    const el = document.createElement('i');
    if (bit) el.className = 'bit';
    el.style.setProperty('--c', color); if (size) el.style.setProperty('--s', size + 'px');
    fxLayer().appendChild(el);
    const a = el.animate([
      { transform: `translate(${x}px, ${y}px) rotate(0deg) scale(1)`, opacity: 1 },
      { transform: `translate(${x + dx * .7}px, ${y + dy * .7}px) rotate(${rot * .7}deg) scale(1)`, opacity: 1, offset: .6 },
      { transform: `translate(${x + dx}px, ${y + dy + gravity}px) rotate(${rot}deg) scale(.6)`, opacity: 0 },
    ], { duration: dur, easing: 'cubic-bezier(.2,.7,.3,1)' });
    a.onfinish = () => el.remove();
  }
  // Funken rund um einen Haken
  function burst(el, n = 10) {
    if (!motionOn() || !el) return;
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const colors = [css('--accent'), css('--accent'), css('--work'), css('--due')];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * .4, d = 22 + Math.random() * 18;
      particle(x - 3, y - 3, { color: colors[i % colors.length], size: 4 + Math.random() * 3, dx: Math.cos(ang) * d, dy: Math.sin(ang) * d, dur: 520 + Math.random() * 200 });
    }
  }
  // Konfetti, wenn eine Liste oder der Tag geschafft ist
  function confetti() {
    if (!motionOn()) return;
    const w = innerWidth, h = innerHeight;
    const colors = [css('--accent'), css('--work'), css('--due'), css('--accent-soft'), css('--fg')];
    for (let i = 0; i < 70; i++) {
      const fromLeft = i % 2 === 0, x = fromLeft ? -10 : w + 10, y = h * .62;
      particle(x, y, { bit: true, color: colors[i % colors.length], dx: (fromLeft ? 1 : -1) * (w * .25 + Math.random() * w * .55), dy: -(h * .35 + Math.random() * h * .35),
        gravity: h * .45, rot: (Math.random() - .5) * 900, dur: 1300 + Math.random() * 900 });
    }
  }
  // Fortschrittsbalken wachsen vom alten zum neuen Stand, auch über ein Neuzeichnen hinweg
  const progressMemo = {};
  const progressBar = (key, done, total) => {
    const v = total ? done / total : 0;
    return `<div class="progress${v >= 1 ? ' full' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i data-prog="${esc(key)}" data-v="${v}" style="width:${(progressMemo[key] ?? 0) * 100}%"></i></div>`;
  };
  function settleProgress() {
    const bars = app.querySelectorAll('[data-prog]');
    if (!bars.length) return;
    requestAnimationFrame(() => requestAnimationFrame(() => bars.forEach(b => { b.style.width = (+b.dataset.v * 100) + '%'; progressMemo[b.dataset.prog] = +b.dataset.v; })));
  }
  const dayOpenCount = () => { const m = dayModel(today()); return [...m.overdue, ...m.todays].filter(e => !e.done).length; };

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const r = document.getElementById('toastRoot');
    r.innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { const t = r.firstElementChild; if (!t) return; t.classList.add('out'); toastTimer = setTimeout(() => r.innerHTML = '', 260); }, 2600);
  }

  /* ---------- Render & Ereignisse ---------- */
  const TABS = ['heute', 'orte', 'papiere', 'verlauf', 'alles'];
  let tab = (location.hash || '').slice(1);
  if (!TABS.includes(tab)) tab = 'heute';
  const app = document.getElementById('app');
  let enterTimer;
  function render({ enter = false } = {}) {
    app.innerHTML = { heute: viewHeute, orte: viewOrte, papiere: viewPapiere, verlauf: viewVerlauf, alles: viewAlles }[tab]();
    document.querySelectorAll('nav.tabs button').forEach(b => b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
    // Einblenden nur beim Tabwechsel, nicht bei jedem Neuzeichnen
    clearTimeout(enterTimer);
    if (enter && motionOn()) {
      [...app.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 10)));
      app.classList.remove('enter'); void app.offsetWidth; app.classList.add('enter');
      enterTimer = setTimeout(() => app.classList.remove('enter'), 900);
    } else app.classList.remove('enter');
    settleProgress();
    if (app.querySelector('[data-photo]')) hydratePhotos(app);
    const sw = app.querySelector('.areas');
    if (sw) requestAnimationFrame(() => { sw.style.setProperty('--pos', sw.dataset.pos); areaMemo = +sw.dataset.pos; });
  }
  const goTab = t => { if (t !== tab) haptic('select'); tab = t; render({ enter: true }); window.scrollTo(0, 0); };
  document.querySelector('nav.tabs').onclick = ev => { const b = ev.target.closest('button'); if (b) goTab(b.dataset.tab); };
  document.getElementById('fab').onclick = () => openSheet(null, tab === 'papiere' ? { type: { vertraege: 'contract', dokumente: 'document', warten: 'waiting' }[papersTab] || 'deadline' } : tab === 'orte' ? { type: 'place' } : {});

  let resetArmed = false;
  app.addEventListener('click', ev => {
    const ab = ev.target.closest('button[data-area]');
    if (ab) return setArea(ab.dataset.area);
    const el = ev.target.closest('[data-contact],[data-dayview],[data-handover],[data-file],[data-emedia],[data-ffilter],#addFiles,[data-billmonth],[data-billclient],#copyBilling,#stopTimer,#handoverDone,#newContact,#copyWeek,#copyStandup,[data-done],[data-edit],[data-goto],[data-filter],[data-pin],[data-clear],[data-copylist],[data-addlist],[data-newlist],[data-editplace],[data-suggest],[data-paper],[data-case],[data-newtype],[data-review],#copyDay,#showWork,#locate,#reset,#addPlace,#askAlways,#scan,#newCase,#openSettings');
    if (!el) return;
    const d = el.dataset;
    if (d.contact) return openContactSheet(contactById(d.contact));
    if (d.dayview) { dayView = d.dayview; haptic('select'); return render({ enter: true }); }
    if (d.handover !== undefined) return openHandover();
    if (d.file) return openFileSheet(fileById(d.file));
    if (d.emedia) { const e = state.entries.find(x => x.id === d.emedia); return openViewer(e.photos, +d.ei); }
    if (d.ffilter) { fileFilter = d.ffilter; return render(); }
    if (el.id === 'addFiles') { pickFiles().then(fs => fs.length && addFiles(fs).then(() => render())); return; }
    if (d.billmonth !== undefined) { billMonth = +d.billmonth; return render(); }
    if (d.billclient) return copyText(billingText(billing(billMonth), d.billclient), `Zeiten für ${d.billclient} kopiert`);
    if (el.id === 'copyBilling') return copyText(billingText(billing(billMonth)), 'Zeiten kopiert');
    if (el.id === 'stopTimer') { stopTimer(); haptic('medium'); save(); return render(); }
    if (el.id === 'handoverDone') { state.handover = null; save(); haptic('light'); return render(); }
    if (el.id === 'newContact') return openContactSheet(null);
    if (el.id === 'copyWeek') return copyText(weekReport(), 'Wochenbericht kopiert');
    if (el.id === 'copyStandup') return copyText(standupText(), 'Standup kopiert');
    if (d.done) {
      const e = state.entries.find(x => x.id === d.done), row = el.closest('.item');
      if (!e || row?.classList.contains('completing')) return;
      if (e.done) return complete(e);
      const openBefore = dayOpenCount();
      haptic('light');
      const finish = () => {
        complete(e);
        if (openBefore > 0 && dayOpenCount() === 0 && tab === 'heute') { haptic('success'); confetti(); setTimeout(() => toast('Alles für heute erledigt. Stark.'), 250); }
      };
      if (!motionOn()) return finish();
      row.classList.add('completing'); burst(el, 12);
      return setTimeout(finish, 520);
    }
    if (d.edit) return openSheet(state.entries.find(e => e.id === d.edit));
    if (d.goto) return goTab(d.goto);
    if (d.filter) { filter = d.filter; return render(); }
    if (d.paper) { papersTab = d.paper; return render(); }
    if (d.case) return openCaseSheet(caseById(d.case));
    if (d.newtype) return openSheet(null, { type: d.newtype });
    if (d.review !== undefined) return openReview();
    if (d.pin) return locate(pos => { const p = placeById(d.pin); p.lat = pos.lat; p.lng = pos.lng; save(); toast(`Standort für ${p.name} gespeichert`); if (native && locationStatus !== 'always') Native.requestAlwaysLocation().then(refreshLocationStatus).then(render); });
    if (d.clear) { const l = state.entries.find(e => e.id === d.clear); l.items = l.items.filter(i => !i.done); save(); return render(); }
    if (d.copylist) return copyText(entryText(state.entries.find(e => e.id === d.copylist)), 'Liste kopiert');
    if (d.addlist) return openSheet(state.entries.find(e => e.id === d.addlist));
    if (d.newlist) return openSheet(null, { type: 'place', placeId: d.newlist });
    if (d.editplace) return openPlaceSheet(placeById(d.editplace));
    if (d.suggest) { const l = state.entries.find(e => e.id === d.suggest); const name = d.name.charAt(0).toUpperCase() + d.name.slice(1); l.items.push({ text: name, done: false }); save(); toast(`${name} hinzugefügt`); return render(); }
    if (el.id === 'copyDay') return copyText(dayText(), 'Tag kopiert');
    if (el.id === 'locate') return locate();
    if (el.id === 'addPlace') return openPlaceSheet(null);
    if (el.id === 'askAlways') return Native.requestAlwaysLocation().then(refreshLocationStatus).then(render);
    if (el.id === 'scan') return scanLetter();
    if (el.id === 'openSettings') return openSettings();
    if (el.id === 'newCase') {
      const c = { id: uid(), title: 'Neuer Vorgang', createdAt: Date.now(), closed: false, context: defaultCtx() }; state.cases.push(c); save(); render(); return openCaseSheet(c);
    }
    if (el.id === 'reset') {
      if (!resetArmed) { resetArmed = true; el.textContent = 'Tippe nochmal zum Bestätigen'; return; }
      resetArmed = false; const look = { theme: state.settings.theme, motion: state.settings.motion, haptics: state.settings.haptics, area: state.settings.area, autoArea: state.settings.autoArea }; state = blank(); Object.assign(state.settings, look); ensureResignEntry(); save(); toast('Gelöscht'); render();
    }
  });
  let listTimer;
  app.addEventListener('change', ev => {
    const c = ev.target;
    if (c.dataset.list) {
      const list = state.entries.find(e => e.id === c.dataset.list);
      checkItem(list, +c.dataset.idx, c.checked);
      if (!c.checked) return render();
      const allDone = list.items.every(i => i.done);
      haptic(allDone ? 'success' : 'light');
      if (allDone) { confetti(); toast(`${list.title}: alles im Wagen`); }
      if (!motionOn()) return render();
      c.closest('li')?.classList.add('pop'); burst(c, 8);
      // kurz stehen lassen, dann rutscht der Punkt nach „Im Wagen“
      clearTimeout(listTimer); listTimer = setTimeout(render, 420);
    }
  });
  app.addEventListener('input', ev => {
    const keep = id => { const pos = ev.target.selectionStart; render(); const q = document.getElementById(id); q.focus(); q.setSelectionRange(pos, pos); };
    if (ev.target.id === 'q') { query = ev.target.value; keep('q'); }
    if (ev.target.id === 'logq') { logQuery = ev.target.value; keep('logq'); }
    if (ev.target.id === 'fq') { fileQuery = ev.target.value; keep('fq'); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { lockedAt = Date.now(); return; }
    autoSwitchArea();
    pullTimeEvents().then(ch => { if (ch) { save(); render(); } });
    refreshLocationStatus().then(render);
    if (Date.now() - lockedAt > 60e3) lockIfNeeded(true);
  });

  function handleUrl(url) {
    if (!url) return;
    const path = url.replace(/^wdid:\/\//, '').split(/[?#]/)[0];
    if (path.startsWith('neu')) openSheet(null, { quick: true });
    else if (path.startsWith('scan')) scanLetter();
    else if (path.startsWith('einkauf') || path.startsWith('orte')) goTab('orte');
    else if (path.startsWith('rueckblick')) openReview();
    else if (path.startsWith('bereich/')) { const a = path.split('/')[1]; const k = { arbeit: 'arbeit', privat: 'privat', beides: 'alle', alle: 'alle' }[a]; if (k) setArea(k); }
    else if (path.startsWith('uebergabe')) openHandover();
  }
  if (AppP) {
    AppP.addListener('appUrlOpen', ({ url }) => handleUrl(url));
    AppP.getLaunchUrl().then(r => r && handleUrl(r.url)).catch(() => {});
  }
  if (Notes) Notes.addListener('localNotificationActionPerformed', ({ notification }) => {
    const open = notification?.extra?.open;
    if (notification?.extra?.area) setArea(notification.extra.area);
    if (open === 'review') openReview();
    else if (open === 'handover') openHandover();
    else if (open) goTab(open);
  });

  ensureResignEntry();
  applyLook(false);
  autoSwitchArea(); applyArea();
  if (await pullTimeEvents()) save();
  await refreshLocationStatus();
  if (native) save();
  render({ enter: true });
  lockIfNeeded(true);
})();

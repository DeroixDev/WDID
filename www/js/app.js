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
    lock: false, workFilter: false, workStart: '08:00', workEnd: '17:00', workDays: [1, 2, 3, 4, 5],
    theme: 'system', motion: true, haptics: true };
  const blank = () => ({ version: 2, sample: false, places: [], entries: [], cases: [], routes: {}, shop: {}, history: {}, log: [], settings: { ...DEFAULT_SETTINGS } });
  const newEntry = o => ({ id: uid(), type: 'task', title: '', notes: '', context: 'privat', date: null, time: null, received: null, source: '',
    leadDays: 3, placeId: null, group: null, items: [], repeat: 'none', caseId: null, photos: [], proof: null, contract: null,
    ocrText: '', done: false, doneAt: null, createdAt: Date.now(), ...o });

  function migrate(s) {
    const b = blank();
    s = { ...b, ...s, settings: { ...b.settings, ...(s.settings || {}) } };
    s.entries = (s.entries || []).map(e => newEntry({ ...e }));
    s.places = (s.places || []).map(p => ({ kind: 'store', group: null, radius: 150, lat: null, lng: null, ...p }));
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
    s.cases = [{ id: 'c1', title: 'Rundfunkbeitrag 2026', createdAt: Date.now() - 5 * 864e5, closed: false }];
    s.entries = [
      newEntry({ type: 'reminder', title: 'Mama zurückrufen', date: t, time: '09:30' }),
      newEntry({ type: 'task', title: 'Wochenbericht abschicken', context: 'arbeit', date: t, time: '12:00', notes: 'An Team-Verteiler, Zahlen aus dem Dashboard.' }),
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

  /* ---------- Hilfen für Einträge ---------- */
  const placeById = id => state.places.find(p => p.id === id);
  const listTarget = e => e.group ? `Jeder ${GROUPS[e.group]}` : (placeById(e.placeId)?.name || 'Ort');
  const listsFor = p => state.entries.filter(e => e.type === 'place' && !e.done && (e.placeId === p.id || (e.group && e.group === p.group)));
  const caseById = id => state.cases.find(c => c.id === id);

  function isHiddenByWork(e) {
    const s = state.settings;
    if (!s.workFilter || e.context !== 'arbeit' || showWorkAnyway) return false;
    const d = new Date(), m = nowMinutes();
    const inWork = s.workDays.includes(d.getDay()) && m >= toMinutes(s.workStart) && m < toMinutes(s.workEnd);
    return !inWork;
  }
  let showWorkAnyway = false;

  function dayModel(day) {
    const open = state.entries.filter(e => e.type !== 'place');
    const t = day;
    const overdue = open.filter(e => !e.done && e.date && e.date < t && !['contract', 'document', 'waiting'].includes(e.type));
    const todays = open.filter(e => e.date === t && !['contract', 'document', 'waiting'].includes(e.type))
      .sort((a, b) => (a.type === 'deadline' ? -1 : 0) - (b.type === 'deadline' ? -1 : 0) || (a.time || '99').localeCompare(b.time || '99'));
    const upcoming = open.filter(e => DATED_ALERT.includes(e.type) && !e.done && e.date && e.date >= t && (e.type !== 'deadline' || e.date > t) && daysBetween(t, e.date) <= (e.leadDays ?? 3))
      .sort((a, b) => a.date.localeCompare(b.date));
    const followUp = open.filter(e => e.type === 'waiting' && !e.done && e.date && e.date <= t);
    const lists = state.entries.filter(e => e.type === 'place' && !e.done && e.items.some(i => !i.done));
    return { overdue, todays, upcoming, followUp, lists };
  }

  function logDone(e, title) {
    let placeName = null;
    if (here) { const p = state.places.find(p => p.lat != null && dist(here, p) <= Math.max(p.radius, 150)); if (p) placeName = p.name; }
    state.log.unshift({ id: uid(), entryId: e.id, title: title || e.title, type: e.type, at: Date.now(), place: placeName });
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
    const regions = state.places.filter(p => p.lat != null && p.kind !== 'person').map(p => {
      const lists = listsFor(p), open = lists.flatMap(l => l.items.filter(i => !i.done).map(i => i.text));
      return { id: p.id, placeId: p.id, lat: p.lat, lng: p.lng, radius: p.radius || 150, title: `Du bist bei ${p.name}`,
        body: open.length ? `${open.length} offen: ${open.slice(0, 6).join(', ')}${open.length > 6 ? ' …' : ''}` : '' };
    }).filter(r => r.body);
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
  function briefingText(day) {
    const m = dayModel(day);
    const items = m.todays.filter(e => !e.done);
    const parts = [];
    if (items.length) parts.push(`${items.length} für heute`);
    if (m.upcoming.length) parts.push(`${m.upcoming.length} ${m.upcoming.length === 1 ? 'Frist' : 'Fristen'} in Sicht`);
    if (m.overdue.length && day === today()) parts.push(`${m.overdue.length} liegengeblieben`);
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
        for (let i = 0; i < 7; i++) {
          const day = addDays(today(), i);
          if (s.morningOn && briefingText(day) !== 'Nichts geplant') list.push({ id: numId('morning' + day), title: 'Dein Tag', body: briefingText(day), at: at(day, s.morningTime), extra: { open: 'heute' }, prio: 1 });
          if (s.eveningOn) list.push({ id: numId('evening' + day), title: 'Tagesabschluss', body: 'Schau, was du heute geschafft hast, und schieb Offenes auf morgen.', at: at(day, s.eveningTime), extra: { open: 'review' }, prio: 1 });
        }
        for (const e of state.entries) {
          if (e.done || !e.date || e.type === 'place') continue;
          if (DATED_ALERT.includes(e.type)) {
            const lead = e.leadDays || 0, label = { deadline: 'Frist', contract: 'Kündigen bis', document: 'Läuft ab' }[e.type];
            if (lead > 0) list.push({ id: numId(e.id + ':lead'), title: `${label} in ${lead} ${lead === 1 ? 'Tag' : 'Tagen'}`, body: e.title, at: at(addDays(e.date, -lead), '09:00') });
            list.push({ id: numId(e.id + ':due'), title: `${label} heute`, body: e.title, at: at(e.date, '08:00') });
          } else if (e.type === 'waiting') {
            list.push({ id: numId(e.id), title: 'Nachhaken', body: `${e.title}${e.source ? ' · ' + e.source : ''}`, at: at(e.date, '10:00') });
          } else if (e.time) {
            list.push({ id: numId(e.id), title: e.title, body: e.notes || TYPE[e.type].label, at: at(e.date, e.time) });
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
    for (const img of root.querySelectorAll('img[data-photo]')) { const src = await resolvePhoto(img.dataset.photo); if (src) img.src = src; }
  }

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
    const c = caseById(e.caseId); if (c) out.push(`Vorgang: ${c.title}`);
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
    out.push(`Bereich: ${e.context === 'arbeit' ? 'Arbeit' : 'Privat'}`);
    out.push(`Status: ${e.done ? `erledigt${e.doneAt ? ' am ' + new Date(e.doneAt).toLocaleDateString('de-DE') : ''}` : 'offen'}`);
    if (e.proof) out.push(`Nachweis: ${e.proof.method}${e.proof.note ? ' – ' + e.proof.note : ''}`);
    if (e.notes) { out.push('Details:'); out.push(e.notes); }
    if (e.ocrText) { out.push('Text aus dem Brief:'); out.push(e.ocrText); }
    return out.join('\n');
  }
  function dayText() {
    const m = dayModel(today());
    const parts = [`WDID – ${longDate(today())}`];
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
    const c = caseById(e.caseId); if (c) tags.push(`<span class="tag plain">${esc(c.title)}</span>`);
    if (e.photos?.length) tags.push(`<span class="tag plain">${e.photos.length} Foto${e.photos.length > 1 ? 's' : ''}</span>`);
    if (e.context === 'arbeit') tags.push('<span class="tag work">Arbeit</span>');
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
  const header = (eyebrow, title, extra = '') => `<header class="top"><div><div class="weekday">${eyebrow}</div><h1>${title}</h1></div>${extra || '<div class="brand">WDID</div>'}</header>`;
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
    const visible = arr => arr.filter(e => !isHiddenByWork(e));
    const hidden = [...m.overdue, ...m.todays, ...m.upcoming].filter(isHiddenByWork).length;
    const openToday = visible(m.todays).filter(e => !e.done).length;
    const pills = [];
    if (m.overdue.length) pills.push(`<span class="pill due">${m.overdue.length} liegengeblieben</span>`);
    pills.push(`<span class="pill">${openToday} offen heute</span>`);
    if (m.upcoming.length) pills.push(`<span class="pill due">${m.upcoming.length} in Sicht</span>`);
    if (m.followUp.length) pills.push(`<span class="pill due">${m.followUp.length} nachhaken</span>`);
    if (m.lists.length) pills.push(`<span class="pill ok">${m.lists.length} Ortslisten</span>`);

    let html = header(d.toLocaleDateString('de-DE', { weekday: 'long' }), d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }));
    if (state.sample) html += '<p class="note">Beispieldaten. Unter „Alles“ kannst du sie mit „Beispiele löschen“ entfernen.</p>';
    html += `<div class="summary">${pills.join('')}<button class="pill" id="copyDay" type="button">Tag kopieren</button></div>`;
    const dayItems = visible(m.todays), dayDone = dayItems.filter(e => e.done).length;
    if (dayItems.length) html += `<div class="day-progress">${progressBar('day', dayDone, dayItems.length)}<span><b>${dayDone}</b> von ${dayItems.length} geschafft</span></div>`;
    if (state.settings.eveningOn && nowMinutes() >= toMinutes(state.settings.eveningTime)) {
      const doneToday = state.log.filter(l => iso(new Date(l.at)) === t).length;
      html += `<div class="banner"><span>Tagesabschluss: ${doneToday} erledigt, ${openToday + m.overdue.length} offen</span><button class="btn small" data-review>Rückblick</button></div>`;
    }
    if (hidden) html += `<p class="note">Feierabend: ${hidden} Arbeitseinträge ausgeblendet. <button class="link" id="showWork">Trotzdem zeigen</button></p>`;

    if (visible(m.overdue).length) html += group('Liegengeblieben', visible(m.overdue).map(e => itemRow(e, { showDate: true })).join(''), `<button class="link" data-review>auf morgen</button>`);
    html += group('Heute', visible(m.todays).length ? visible(m.todays).map(e => itemRow(e)).join('') : '<div class="empty">Nichts geplant. Mit + legst du etwas an.</div>');
    if (visible(m.upcoming).length) html += group('Fristen in Sicht', visible(m.upcoming).map(e => itemRow(e)).join(''));
    if (m.followUp.length) html += group('Nachhaken', m.followUp.map(e => itemRow(e)).join(''));
    if (m.lists.length) html += group('Wenn du unterwegs bist', m.lists.filter(l => !isHiddenByWork(l)).map(e => {
      const left = e.items.filter(i => !i.done);
      const p = placeById(e.placeId);
      const label = p?.kind === 'person' ? `Wenn du ${p.name} siehst` : listTarget(e);
      return `<div class="item"><div class="time">${p?.kind === 'person' ? 'Person' : 'Ort'}</div><div class="body" data-goto="orte"><div class="title">${esc(label)} · ${esc(e.title)}</div>
        <div class="desc">${left.length} von ${e.items.length} offen: ${esc(left.slice(0, 3).map(i => i.text).join(', '))}${left.length > 3 ? ' …' : ''}</div></div><span></span></div>`;
    }).join(''));
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
        h += `<div class="card-row"><span class="sub" data-edit="${l.id}" style="cursor:pointer">${esc(l.title)}${l.context === 'arbeit' ? ' · Arbeit' : ''}</span><span class="sub">${l.items.filter(i => i.done).length}/${l.items.length}</span></div>`;
        h += progressBar('list-' + l.id, l.items.filter(i => i.done).length, l.items.length);
        const pl = placeById(l.placeId);
        h += shoppingList(l, { compact: !l.group && pl?.kind !== 'store' });
        h += `<div class="row-actions"><button class="btn small" data-addlist="${l.id}">Punkt hinzufügen</button><button class="btn small ghost" data-copylist="${l.id}">Kopieren</button><button class="btn small ghost" data-clear="${l.id}">Abgehakte entfernen</button></div>`;
      });
      if (!lists.length) h += `<div class="sub">${p?.group && groupLists.some(l => l.group === p.group) ? `Die Listen für „Jeder ${GROUPS[p.group]}“ gelten hier auch.` : 'Keine offenen Listen.'}</div>`;
      if (p) h += `<div class="row-actions">${p.kind !== 'person' ? `<button class="btn small" data-pin="${p.id}">Standort hier speichern</button>` : ''}<button class="btn small ghost" data-newlist="${p.id}">Neue Liste</button><button class="btn small ghost" data-editplace="${p.id}">Bearbeiten</button></div>`;
      return h + '</div>';
    };

    const groupLists = state.entries.filter(e => e.type === 'place' && !e.done && e.group);
    for (const [g, name] of Object.entries(GROUPS)) {
      const ls = groupLists.filter(l => l.group === g);
      if (!ls.length) continue;
      const members = state.places.filter(p => p.group === g).map(p => p.name);
      html += cardFor(`Jeder ${name}`, members.length ? esc(members.join(', ')) : 'Noch kein Laden zugeordnet', ls, null, false);
    }
    const stores = state.places.filter(p => p.kind !== 'person');
    const persons = state.places.filter(p => p.kind === 'person');
    stores.forEach(p => {
      let sub = p.lat != null ? `Standort gespeichert · ${p.radius} m` : 'Kein Standort gespeichert';
      let near = false;
      if (here && p.lat != null) { const m = dist(here, p); near = m <= p.radius; sub = near ? 'Du bist hier' : `${m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km'} entfernt`; }
      if (p.group) sub += ` · ${GROUPS[p.group]}`;
      html += cardFor(p.name, sub, state.entries.filter(e => e.type === 'place' && !e.done && e.placeId === p.id), p, near);
    });
    if (persons.length) {
      html += '<section class="group"><h2><span>Personen</span><span></span></h2></section>';
      persons.forEach(p => { html += cardFor(`Wenn du ${p.name} siehst`, '', state.entries.filter(e => e.type === 'place' && !e.done && e.placeId === p.id), p, false); });
    }
    if (!stores.length && !persons.length && !groupLists.length) html += '<div class="empty">Noch keine Orte. Tippe auf „Ort hinzufügen“.</div>';
    return html;
  }

  let papersTab = 'vorgaenge';
  function viewPapiere() {
    let html = header('Papierkram', 'Papiere', '<button class="btn small primary" id="scan">Brief scannen</button>');
    const segs = [['vorgaenge', 'Vorgänge'], ['vertraege', 'Verträge'], ['dokumente', 'Dokumente'], ['warten', 'Wartet auf']];
    html += `<div class="segmented">${segs.map(([k, l]) => `<button class="chip" data-paper="${k}" aria-pressed="${papersTab === k}">${l}</button>`).join('')}</div>`;
    const sortByDate = (a, b) => (a.date || '9999').localeCompare(b.date || '9999');
    if (papersTab === 'vorgaenge') {
      const cases = state.cases.filter(c => !c.closed);
      html += '<div class="row-actions" style="margin:0 0 16px"><button class="btn small" id="newCase">Neuer Vorgang</button></div>';
      if (!cases.length) html += '<div class="empty">Ein Vorgang bündelt alles zu einer Sache: Brief, Antwort, Fristen, Fotos. Lege einen an oder ordne einen Eintrag einem Vorgang zu.</div>';
      cases.forEach(c => {
        const es = state.entries.filter(e => e.caseId === c.id);
        const next = es.filter(e => !e.done && e.date).sort(sortByDate)[0];
        html += `<div class="card" data-case="${c.id}" style="cursor:pointer"><div class="card-row"><h3>${esc(c.title)}</h3><span class="sub">${es.length} Einträge</span></div>
          <div class="sub">${next ? `Nächstes: ${esc(next.title)} · ${fmtDate(next.date)}` : 'Nichts offen'}</div></div>`;
      });
      const closed = state.cases.filter(c => c.closed);
      if (closed.length) html += `<p class="note">${closed.length} abgeschlossene Vorgänge im Verlauf.</p>`;
    } else {
      const type = { vertraege: 'contract', dokumente: 'document', warten: 'waiting' }[papersTab];
      const list = state.entries.filter(e => e.type === type && !e.done).sort(sortByDate);
      const intro = { contract: 'Handy, Strom, Fitnessstudio, Versicherung: WDID erinnert dich vor dem letzten Kündigungstag.',
        document: 'Ausweis, Pass, Führerschein, TÜV, Garantien: mit Ablaufdatum und Foto.',
        waiting: 'Erstattungen, Rückrufe, Antworten: WDID erinnert dich ans Nachhaken.' }[type];
      html += `<p class="note">${intro}</p><div class="row-actions" style="margin:0 0 16px"><button class="btn small" data-newtype="${type}">${TYPE[type].label} anlegen</button></div>`;
      html += list.length ? `<div class="list">${list.map(e => itemRow(e)).join('')}</div>` : '<div class="empty">Noch nichts eingetragen.</div>';
    }
    return html;
  }

  let logQuery = '';
  function viewVerlauf() {
    const t = today(), d = new Date();
    const monday = addDays(t, -((d.getDay() + 6) % 7));
    const weekDone = state.log.filter(l => iso(new Date(l.at)) >= monday).length;
    const nextWeek = state.entries.filter(e => !e.done && DATED_ALERT.includes(e.type) && e.date && e.date > t && daysBetween(t, e.date) <= 7);
    const waiting = state.entries.filter(e => e.type === 'waiting' && !e.done);
    let html = header('What did I do', 'Verlauf');
    html += `<div class="card"><div class="card-row"><h3>Diese Woche</h3><button class="btn small" data-review>Tagesrückblick</button></div>
      <div class="stat-row"><div class="stat"><b>${weekDone}</b><span>erledigt</span></div><div class="stat"><b>${nextWeek.length}</b><span>Fristen in 7 Tagen</span></div><div class="stat"><b>${waiting.length}</b><span>wartet auf</span></div></div>
      ${nextWeek.length ? `<div class="sub">${nextWeek.slice(0, 4).map(e => `${esc(e.title)} · ${fmtDate(e.date)}`).join('<br>')}</div>` : ''}</div>`;
    html += `<input class="search" id="logq" type="search" placeholder="Wann habe ich … ? z. B. Zählerstand, Widerspruch" value="${esc(logQuery)}">`;
    const q = logQuery.trim().toLowerCase();
    const entries = state.log.filter(l => !q || `${l.title} ${l.place || ''}`.toLowerCase().includes(q));
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
      if (filter === 'arbeit' && e.context !== 'arbeit') return false;
      if (Object.keys(TYPE).includes(filter) && e.type !== filter) return false;
      if (filter === 'erledigt' ? !e.done : e.done) return false;
      if (!q) return true;
      return [e.title, e.notes, e.source, e.ocrText, caseById(e.caseId)?.title, ...(e.items || []).map(i => i.text)].join(' ').toLowerCase().includes(q);
    }).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '').localeCompare(b.time || ''));
    const chips = [['alle', 'Alle'], ['deadline', 'Fristen'], ['reminder', 'Erinnerungen'], ['task', 'Aufgaben'], ['place', 'Ortslisten'], ['waiting', 'Wartet auf'], ['contract', 'Verträge'], ['document', 'Dokumente'], ['arbeit', 'Arbeit'], ['erledigt', 'Erledigt']]
      .map(([k, l]) => `<button class="chip" data-filter="${k}" aria-pressed="${filter === k}">${l}</button>`).join('');
    const rows = list.map(e => e.type === 'place'
      ? `<div class="item"><div class="time">Ort</div><div class="body" data-edit="${e.id}"><div class="title">${esc(listTarget(e))} · ${esc(e.title)}</div><div class="desc">${e.items.filter(i => !i.done).length} offen</div></div><span></span></div>`
      : itemRow(e, { showDate: true })).join('');
    return header('Archiv und Suche', 'Alles', gearBtn) +
      `<input class="search" id="q" type="search" placeholder="Suchen, z. B. Brief, Kaufland, Steuer" value="${esc(query)}">
      <div class="filters">${chips}</div>
      ${rows ? `<div class="list">${rows}</div>` : '<div class="empty">Nichts gefunden.</div>'}
      <div class="row-actions" style="margin-top:28px"><button class="btn ghost" id="reset">${state.sample ? 'Beispiele löschen' : 'Alle Daten löschen'}</button></div>`;
  }

  /* ---------- Sheets ---------- */
  const sheetRoot = document.getElementById('sheetRoot');
  let sheetTimer;
  function showSheet(innerHtml, label, onClick, onChange) {
    clearTimeout(sheetTimer); sheetRoot.classList.remove('closing');
    sheetRoot.innerHTML = `<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}"><div class="inner"><div class="grabber"></div>${innerHtml}</div></div>`;
    sheetRoot.onclick = ev => { if (ev.target.closest('[data-close]')) return closeSheet(); onClick && onClick(ev); };
    sheetRoot.onchange = onChange || null;
    sheetRoot.onkeydown = null;
  }
  function closeSheet() {
    sheetRoot.onclick = sheetRoot.onchange = sheetRoot.onkeydown = null;
    if (!sheetRoot.firstChild) return;
    // erst sanft nach unten gleiten lassen, dann entfernen
    if (!motionOn()) { sheetRoot.innerHTML = ''; return; }
    sheetRoot.classList.add('closing');
    clearTimeout(sheetTimer); sheetTimer = setTimeout(() => { sheetRoot.innerHTML = ''; sheetRoot.classList.remove('closing'); }, 240);
  }

  function openSheet(entry, { draft = null, type = null, caseId = null, placeId = null, info = null, quick = false } = {}) {
    const isNew = !entry;
    const t = today();
    const e = entry ? JSON.parse(JSON.stringify(entry)) : (draft || newEntry({ type: type || 'reminder', date: t, received: t, source: type === 'deadline' ? 'Brief' : '', caseId, placeId: placeId || null }));
    if (isNew && e.type === 'place' && !e.placeId && !e.group) { const p = state.places.find(p => p.kind !== 'person'); if (p) e.placeId = p.id; else e.group = 'supermarkt'; }
    if (isNew && e.type === 'contract' && !e.contract) e.contract = { termEnd: L.addMonths(t, 12), noticeN: 1, noticeUnit: 'Monate', renewMonths: 1 };
    let confirmDel = false, calcResult = null;
    const calc = e._calc || { n: 14, unit: 'Tage', fiction: false };

    const draw = () => {
      const placeOpts = Object.entries(GROUPS).map(([g, n]) => `<option value="g:${g}" ${e.group === g ? 'selected' : ''}>Jeder ${n}</option>`).join('') +
        state.places.map(p => `<option value="${p.id}" ${!e.group && p.id === e.placeId ? 'selected' : ''}>${p.kind === 'person' ? 'Person: ' : ''}${esc(p.name)}</option>`).join('') + '<option value="__new">Neuer Ort …</option>';
      const caseOpts = '<option value="">Kein Vorgang</option>' + state.cases.filter(c => !c.closed || c.id === e.caseId).map(c => `<option value="${c.id}" ${c.id === e.caseId ? 'selected' : ''}>${esc(c.title)}</option>`).join('') + '<option value="__new">Neuer Vorgang …</option>';
      const placeholder = { reminder: 'z. B. Mama zurückrufen', task: 'z. B. Fahrrad aufpumpen', deadline: 'z. B. Antwort an Versicherung', place: 'z. B. Wocheneinkauf', waiting: 'z. B. Erstattung Krankenkasse', contract: 'z. B. Handyvertrag', document: 'z. B. Personalausweis' }[e.type];
      const leadSelect = (opts, label = 'Vorher erinnern') => `<div class="field"><label for="f-lead">${label}</label><select id="f-lead">${opts.map(n => `<option value="${n}" ${n == e.leadDays ? 'selected' : ''}>${n} ${n === 1 ? 'Tag' : 'Tage'} vorher</option>`).join('')}</select></div>`;
      let typeFields = '';
      if (e.type === 'deadline') typeFields = `
        <div class="two"><div class="field"><label for="f-source">Woher</label><input id="f-source" value="${esc(e.source)}" placeholder="Brief, E-Mail …"></div>
        <div class="field"><label for="f-received">Eingang / Briefdatum</label><input id="f-received" type="date" value="${e.received || t}"></div></div>
        <div class="calc"><div class="row"><span class="sub">Frist berechnen:</span><input id="c-n" type="number" min="1" value="${calc.n}"><select id="c-unit">${['Tage', 'Wochen', 'Monate'].map(u => `<option ${u === calc.unit ? 'selected' : ''}>${u}</option>`).join('')}</select><button class="btn small" id="calcBtn" type="button">Berechnen</button></div>
          <label class="inline"><input type="checkbox" id="c-fiction" ${calc.fiction ? 'checked' : ''}> Behördenbrief: gilt 4 Tage nach Briefdatum als zugegangen</label>
          ${calcResult ? `<div class="result">Frist endet am ${longDate(calcResult.deadline)}</div>${calcResult.notes.length ? `<ul class="notes-list">${calcResult.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}` : `<div class="hint">Wochenenden und Feiertage in ${L.STATES[state.settings.state]} werden berücksichtigt. Ohne Gewähr.</div>`}</div>
        <div class="two"><div class="field"><label for="f-date">Frist bis</label><input id="f-date" type="date" value="${e.date || ''}"></div>${leadSelect([1, 3, 7, 14, 30])}</div>`;
      if (e.type === 'reminder' || e.type === 'task') typeFields = `
        <div class="two"><div class="field"><label for="f-date">Tag</label><input id="f-date" type="date" value="${e.date || ''}"></div>
        <div class="field"><label for="f-time">Uhrzeit${e.type === 'task' ? ' (optional)' : ''}</label><input id="f-time" type="time" value="${e.time || ''}"></div></div>
        <div class="field"><label for="f-repeat">Wiederholen</label><select id="f-repeat">${[['none', 'Nie'], ['daily', 'Täglich'], ['weekly', 'Wöchentlich'], ['monthly', 'Monatlich']].map(([k, l]) => `<option value="${k}" ${e.repeat === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
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

      const photos = e.photos.length ? `<div class="photos">${e.photos.map((p, i) => `<img data-photo="${esc(p)}" data-view="${i}" alt="Foto ${i + 1}">`).join('')}</div>` : '';
      const proofFields = !isNew && ['deadline', 'waiting', 'contract', 'task', 'reminder'].includes(e.type) ? `
        <div class="two"><div class="field"><label for="p-method">Erledigt per (Nachweis)</label><select id="p-method"><option value="">—</option>${PROOF.map(m => `<option ${e.proof?.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="field"><label for="p-note">Nachweis-Notiz</label><input id="p-note" value="${esc(e.proof?.note || '')}" placeholder="z. B. Sendungsnummer"></div></div>` : '';

      showSheet(`
        <h3>${isNew ? 'Neuer Eintrag' : 'Bearbeiten'}</h3>
        ${info ? `<p class="hint">${esc(info)}</p>` : ''}
        ${isNew ? `<div class="quick"><input id="f-quick" placeholder="Schnell: Fr 14 Uhr Friseur · bis 15.11. Antrag · bei Kaufland: Milch, Brot" enterkeyhint="done"><button class="btn small" id="quickBtn" type="button">Übernehmen</button></div>` : ''}
        <div class="types">${Object.entries(TYPE).map(([k, v]) => `<button type="button" data-type="${k}" aria-pressed="${e.type === k}"><svg viewBox="0 0 24 24">${v.icon}</svg>${v.label}</button>`).join('')}</div>
        <div class="field"><label for="f-title">${e.type === 'place' ? 'Name der Liste' : 'Was?'}</label><input id="f-title" value="${esc(e.title)}" placeholder="${placeholder}"></div>
        ${typeFields}
        <div class="field"><label for="f-notes">Details</label><textarea id="f-notes" placeholder="Aktenzeichen, Ansprechpartner, was zu tun ist …">${esc(e.notes)}</textarea></div>
        ${e.type !== 'place' ? `<div class="field"><label for="f-case">Vorgang</label><select id="f-case">${caseOpts}</select></div>
        <div class="field" id="newCaseField" hidden><label for="f-newcase">Name des Vorgangs</label><input id="f-newcase" placeholder="z. B. Kfz-Versicherung Schaden"></div>` : ''}
        <div class="field"><label>Fotos</label>${photos}<div class="row-actions"><button class="btn small" id="addPhoto" type="button">Foto aufnehmen</button><button class="btn small ghost" id="addPhotoLib" type="button">Aus Fotos</button></div></div>
        ${e.type === 'deadline' || e.ocrText ? `<details class="ocr" ${e.ocrText ? '' : 'open'}><summary>${e.ocrText ? 'Erkannter Text aus dem Brief' : 'Brieftext einfügen und auswerten'}</summary>
          ${e.ocrText ? `<pre>${esc(e.ocrText)}</pre>` : `<div class="field"><textarea id="f-ocr" placeholder="Text aus Brief oder E-Mail hier einfügen …"></textarea></div><button class="btn small" id="analyzeBtn" type="button">Auswerten</button>`}</details>` : ''}
        ${proofFields}
        <div class="field"><label>Bereich</label><div class="seg">${['privat', 'arbeit'].map(c => `<button type="button" data-ctx="${c}" aria-pressed="${e.context === c}">${c === 'privat' ? 'Privat' : 'Arbeit'}</button>`).join('')}</div></div>
        <p class="hint" id="formError" hidden></p>
        <div class="sheet-actions">
          ${isNew ? '<button class="btn ghost" data-close>Abbrechen</button>' : `<button class="btn ghost" id="del">${confirmDel ? 'Wirklich löschen?' : 'Löschen'}</button>`}
          <button class="btn" id="copyBtn">Kopieren</button>
          <button class="btn primary" id="saveBtn">${isNew ? 'Speichern' : 'Fertig'}</button>
        </div>`, isNew ? 'Neuer Eintrag' : 'Eintrag bearbeiten', onClick, onChange);
      hydratePhotos(sheetRoot);
      const quickInput = document.getElementById('f-quick');
      if (quickInput) quickInput.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); applyQuick(); } };
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
      if (v('p-method') !== undefined) e.proof = v('p-method') ? { method: v('p-method'), note: (v('p-note') || '').trim(), at: e.proof?.at || Date.now() } : null;
    };
    function applyQuick() {
      const text = (v('f-quick') || '').trim();
      if (!text) return;
      const r = L.quickParse(text, { today: t, places: state.places });
      e.type = r.type; e.title = r.title || e.title; e.date = r.date; e.time = r.time; e.context = r.context; e.repeat = r.repeat;
      if (r.type === 'place') {
        if (!r.placeId && r.placeName) { const p = { id: uid(), name: r.placeName, kind: 'store', group: null, lat: null, lng: null, radius: 150 }; state.places.push(p); r.placeId = p.id; }
        e.placeId = r.placeId; e.group = null; e.items = r.items.map(text => ({ text, done: false }));
      }
      if (r.type === 'deadline') { e.received = t; e.leadDays = 3; }
      draw();
    }
    draw();

    async function addPhoto(camera) {
      read();
      const file = await pickImage({ camera });
      if (!file) return;
      try { const b64 = await fileToJpegBase64(file); e.photos.push(await savePhoto(b64)); draw(); } catch (err) { toast(err.message); }
    }

    function onClick(ev) {
      const b = ev.target.closest('button, img[data-view]');
      if (!b) return;
      if (b.dataset.view !== undefined) { openViewer(b.src); return; }
      if (b.id === 'quickBtn') return applyQuick();
      if (b.dataset.type) {
        read(); e.type = b.dataset.type;
        if (e.type === 'deadline' && (!e.date || e.date <= t)) e.date = addDays(t, 14);
        if (e.type === 'contract' && !e.contract) { e.contract = { termEnd: L.addMonths(t, 12), noticeN: 1, noticeUnit: 'Monate', renewMonths: 1 }; e.leadDays = 30; }
        if (e.type === 'document') e.leadDays = 60;
        if (e.type === 'waiting' && (!e.date || e.date <= t)) e.date = addDays(t, 14);
        if (e.type === 'place' && !e.placeId && !e.group) e.group = 'supermarkt';
        draw(); return;
      }
      if (b.dataset.ctx) { read(); e.context = b.dataset.ctx; draw(); return; }
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
      if (b.id === 'copyBtn') { read(); copyText(entryText(e), 'Eintrag kopiert'); return; }
      if (b.id === 'del') {
        if (!confirmDel) { read(); confirmDel = true; draw(); return; }
        state.entries = state.entries.filter(x => x.id !== e.id); save(); closeSheet(); toast('Gelöscht'); render(); return;
      }
      if (b.id === 'saveBtn') {
        read();
        const err = document.getElementById('formError');
        const fail = msg => { err.hidden = false; err.textContent = msg; };
        if (e.type === 'place' && v('f-place') === '__new') {
          const name = (v('f-newplace') || '').trim(); if (!name) return fail('Gib dem neuen Ort einen Namen.');
          const p = { id: uid(), name, kind: 'store', group: null, lat: null, lng: null, radius: 150 }; state.places.push(p); e.placeId = p.id; e.group = null;
        }
        if (v('f-case') === '__new') {
          const name = (v('f-newcase') || '').trim(); if (!name) return fail('Gib dem Vorgang einen Namen.');
          const c = { id: uid(), title: name, createdAt: Date.now(), closed: false }; state.cases.push(c); e.caseId = c.id;
        }
        if (!e.title) return fail('Schreib kurz, worum es geht.');
        if (['deadline', 'document'].includes(e.type) && !e.date) return fail('Hier fehlt noch ein Datum.');
        if (e.type !== 'place') { e.items = []; e.group = null; }
        delete e._calc;
        if (isNew) state.entries.push({ ...e, id: e.id || uid(), done: false, createdAt: Date.now() });
        else Object.assign(state.entries.find(x => x.id === e.id), e);
        save(); closeSheet(); toast(isNew ? 'Gespeichert' : 'Geändert'); render();
      }
    }
    function onChange(ev) {
      if (ev.target.id === 'f-place') document.getElementById('newPlaceField').hidden = ev.target.value !== '__new';
      if (ev.target.id === 'f-case') document.getElementById('newCaseField').hidden = ev.target.value !== '__new';
      if (['k-end', 'k-n', 'k-unit', 'k-renew'].includes(ev.target.id)) { read(); draw(); }
    }
  }

  function openViewer(src) {
    const v = document.createElement('div');
    v.className = 'viewer'; v.innerHTML = `<img src="${esc(src)}" alt="Foto">`; v.onclick = () => v.remove();
    document.body.appendChild(v);
  }

  function openPlaceSheet(place) {
    const isNew = !place;
    const p = place ? { ...place } : { id: uid(), name: '', kind: 'store', group: null, lat: null, lng: null, radius: 150 };
    let confirmDel = false;
    const draw = () => showSheet(`
      <h3>${isNew ? 'Ort hinzufügen' : 'Ort bearbeiten'}</h3>
      <div class="field"><label for="o-name">Name</label><input id="o-name" value="${esc(p.name)}" placeholder="z. B. Kaufland Nordstadt oder Mama"></div>
      <div class="field"><label>Art</label><div class="seg">${[['store', 'Laden'], ['other', 'Sonstiger Ort'], ['person', 'Person']].map(([k, l]) => `<button type="button" data-kind="${k}" aria-pressed="${p.kind === k}">${l}</button>`).join('')}</div></div>
      ${p.kind === 'store' ? `<div class="field"><label for="o-group">Gehört zu</label><select id="o-group"><option value="">Keine Gruppe</option>${Object.entries(GROUPS).map(([g, n]) => `<option value="${g}" ${p.group === g ? 'selected' : ''}>${n}</option>`).join('')}</select></div>` : ''}
      ${p.kind !== 'person' ? `<div class="field"><label for="o-radius">Radius</label><select id="o-radius">${[100, 150, 200, 300, 500].map(r => `<option value="${r}" ${p.radius == r ? 'selected' : ''}>${r} m</option>`).join('')}</select></div>
      <p class="hint">${p.lat != null ? 'Standort ist gespeichert.' : 'Den Standort speicherst du, wenn du dort bist: „Standort hier speichern“.'}</p>` : '<p class="hint">Listen für Personen erscheinen unter „Wenn du … siehst“.</p>'}
      <p class="hint" id="formError" hidden></p>
      <div class="sheet-actions">${isNew ? '<button class="btn ghost" data-close>Abbrechen</button>' : `<button class="btn ghost" id="delPlace">${confirmDel ? 'Wirklich löschen?' : 'Löschen'}</button>`}<button class="btn primary" id="savePlace">Speichern</button></div>`,
      'Ort', ev => {
        const b = ev.target.closest('button'); if (!b) return;
        const read = () => { p.name = (document.getElementById('o-name').value || '').trim(); const g = document.getElementById('o-group'); p.group = g ? (g.value || null) : null; const r = document.getElementById('o-radius'); if (r) p.radius = Number(r.value); };
        if (b.dataset.kind) { read(); p.kind = b.dataset.kind; if (p.kind !== 'store') p.group = null; draw(); }
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
    const draw = () => {
      const es = state.entries.filter(e => e.caseId === c.id).sort((a, b) => (a.received || a.date || '').localeCompare(b.received || b.date || '') || a.createdAt - b.createdAt);
      const photos = es.flatMap(e => e.photos || []);
      showSheet(`
        <div class="field"><label for="v-title">Vorgang</label><input id="v-title" value="${esc(c.title)}"></div>
        ${photos.length ? `<div class="photos">${photos.map((p, i) => `<img data-photo="${esc(p)}" data-view="${i}" alt="Foto">`).join('')}</div>` : ''}
        <ul class="timeline">${es.map(e => `<li><span class="when">${(e.received || e.date) ? parse(e.received || e.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</span>
          <div class="body" data-editcase="${e.id}" style="cursor:pointer"><div class="title">${esc(e.title)}${e.done ? ' ✓' : ''}</div><div class="desc">${TYPE[e.type].label}${e.date && e.type === 'deadline' ? ` · Frist ${fmtDate(e.date)}` : ''}${e.proof ? ` · ${esc(e.proof.method)}` : ''}</div></div></li>`).join('') || '<li><span></span><span class="sub">Noch keine Einträge.</span></li>'}</ul>
        <div class="row-actions"><button class="btn small" id="caseAdd">Eintrag hinzufügen</button><button class="btn small" id="caseScan">Brief scannen</button><button class="btn small ghost" id="caseCopy">Kopieren</button></div>
        <div class="sheet-actions"><button class="btn ghost" id="caseClose">${confirmClose ? 'Wirklich abschließen?' : 'Abschließen'}</button><button class="btn primary" id="caseSave">Fertig</button></div>`,
        'Vorgang', async ev => {
          const b = ev.target.closest('button, img[data-view], [data-editcase]'); if (!b) return;
          const title = (document.getElementById('v-title').value || '').trim(); if (title) c.title = title;
          if (b.dataset.view !== undefined) return openViewer(b.src);
          if (b.dataset.editcase) { save(); return openSheet(state.entries.find(e => e.id === b.dataset.editcase)); }
          if (b.id === 'caseAdd') { save(); return openSheet(null, { type: 'task', caseId: c.id }); }
          if (b.id === 'caseScan') { save(); closeSheet(); const before = state.entries.length; await scanLetter(); return; }
          if (b.id === 'caseCopy') return copyText(`Vorgang: ${c.title}\n\n` + es.map(entryText).join('\n\n'), 'Vorgang kopiert');
          if (b.id === 'caseClose') { if (!confirmClose) { confirmClose = true; draw(); return; } c.closed = true; logDone({ id: c.id, type: 'case' }, `Vorgang abgeschlossen: ${c.title}`); save(); closeSheet(); render(); return; }
          if (b.id === 'caseSave') { save(); closeSheet(); render(); }
        });
      hydratePhotos(sheetRoot);
    };
    draw();
  }

  function openReview() {
    const draw = () => {
      const t = today(), m = dayModel(t);
      const done = state.log.filter(l => iso(new Date(l.at)) === t);
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
      <div class="setting"><div><div class="title">Arbeit nach Feierabend ausblenden</div><div class="hint">Mo–Fr, außerhalb der Arbeitszeit</div></div>${sw('s-workFilter', s.workFilter)}</div>
      <div class="setting"><div><div class="title">Arbeitszeit</div></div><div class="row-actions" style="margin:0"><input type="time" id="s-workStart" value="${s.workStart}"><input type="time" id="s-workEnd" value="${s.workEnd}"></div></div>
      ${native ? `<div class="setting"><div><div class="title">Mit Face ID sperren</div><div class="hint">Beim Öffnen der App</div></div>${sw('s-lock', s.lock)}</div>` : ''}
      <div class="dept">Backup</div>
      <div class="field"><label for="b-pass">Passwort für das Backup (optional)</label><input id="b-pass" type="password" autocomplete="new-password" placeholder="Leer lassen für unverschlüsselt"></div>
      <div class="row-actions"><button class="btn" id="exportBtn">Backup exportieren</button><button class="btn ghost" id="importBtn">Backup einspielen</button></div>
      <div id="importArea"></div>
      <div class="dept">Kurzbefehl für den Action-Button</div>
      <p class="hint">Kurzbefehle-App → neuer Kurzbefehl → „URL öffnen“ mit <b>wdid://neu</b> (neuer Eintrag mit Schnelleingabe) oder <b>wdid://scan</b> (Brief scannen). Dann unter Einstellungen → Action-Button → Kurzbefehl auswählen. Diktieren geht mit dem Mikrofon der Tastatur, auch offline.</p>
      <div class="sheet-actions"><button class="btn primary" data-close>Fertig</button></div>`,
      'Einstellungen', async ev => {
        const b = ev.target.closest('button'); if (!b) return;
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
        s[k] = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
        if (k === 'motion') applyLook(false);
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
      for (const p of new Set(state.entries.flatMap(e => e.photos || []))) { try { photos[p] = await readPhotoBase64(p); } catch {} }
      const payload = JSON.stringify({ app: 'WDID', version: 2, createdAt: new Date().toISOString(), state, photos });
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
  const dayOpenCount = () => { const m = dayModel(today()); return [...m.overdue, ...m.todays].filter(e => !e.done && !isHiddenByWork(e)).length; };

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
  }
  const goTab = t => { if (t !== tab) haptic('select'); tab = t; render({ enter: true }); window.scrollTo(0, 0); };
  document.querySelector('nav.tabs').onclick = ev => { const b = ev.target.closest('button'); if (b) goTab(b.dataset.tab); };
  document.getElementById('fab').onclick = () => openSheet(null, tab === 'papiere' ? { type: { vertraege: 'contract', dokumente: 'document', warten: 'waiting' }[papersTab] || 'deadline' } : tab === 'orte' ? { type: 'place' } : {});

  let resetArmed = false;
  app.addEventListener('click', ev => {
    const el = ev.target.closest('[data-done],[data-edit],[data-goto],[data-filter],[data-pin],[data-clear],[data-copylist],[data-addlist],[data-newlist],[data-editplace],[data-suggest],[data-paper],[data-case],[data-newtype],[data-review],#copyDay,#showWork,#locate,#reset,#addPlace,#askAlways,#scan,#newCase,#openSettings');
    if (!el) return;
    const d = el.dataset;
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
    if (el.id === 'showWork') { showWorkAnyway = true; return render(); }
    if (el.id === 'locate') return locate();
    if (el.id === 'addPlace') return openPlaceSheet(null);
    if (el.id === 'askAlways') return Native.requestAlwaysLocation().then(refreshLocationStatus).then(render);
    if (el.id === 'scan') return scanLetter();
    if (el.id === 'openSettings') return openSettings();
    if (el.id === 'newCase') {
      const c = { id: uid(), title: 'Neuer Vorgang', createdAt: Date.now(), closed: false }; state.cases.push(c); save(); render(); return openCaseSheet(c);
    }
    if (el.id === 'reset') {
      if (!resetArmed) { resetArmed = true; el.textContent = 'Tippe nochmal zum Bestätigen'; return; }
      resetArmed = false; const look = { theme: state.settings.theme, motion: state.settings.motion, haptics: state.settings.haptics }; state = blank(); Object.assign(state.settings, look); ensureResignEntry(); save(); toast('Gelöscht'); render();
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
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { lockedAt = Date.now(); return; }
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
  }
  if (AppP) {
    AppP.addListener('appUrlOpen', ({ url }) => handleUrl(url));
    AppP.getLaunchUrl().then(r => r && handleUrl(r.url)).catch(() => {});
  }
  if (Notes) Notes.addListener('localNotificationActionPerformed', ({ notification }) => {
    const open = notification?.extra?.open;
    if (open === 'review') openReview();
    else if (open) goTab(open);
  });

  ensureResignEntry();
  applyLook(false);
  await refreshLocationStatus();
  if (native) save();
  render({ enter: true });
  lockIfNeeded(true);
})();

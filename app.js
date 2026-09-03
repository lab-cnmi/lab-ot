(() => {
  'use strict';

  const CFG = window.LAB_OT_CONFIG || window.PSC_OT_CONFIG || {};
  const USERS = CFG.USERS || {
    'parichat.ink@mahidol.ac.th': { role: 'admin', label: 'Admin' },
    'paleerat.ran@mahidol.ac.th': { role: 'staff', label: 'Staff' }
  };
  const normalizedUsers = Object.fromEntries(
    Object.entries(USERS).map(([email, info]) => [String(email).trim().toLowerCase(), info])
  );
  const UNITS = ['LAB', 'Molec', 'Bacteria'];
  const UNIT_KEYS = { LAB: 'lab', Molec: 'molec', Bacteria: 'bacteria' };
  const TH_MONTHS = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const TH_MONTH_SHORT = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const MONTH_LOOKUP = {
    'มกราคม':1,'กุมภาพันธ์':2,'มีนาคม':3,'เมษายน':4,'พฤษภาคม':5,'มิถุนายน':6,
    'กรกฎาคม':7,'สิงหาคม':8,'กันยายน':9,'ตุลาคม':10,'พฤศจิกายน':11,'ธันวาคม':12,
    january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,
    jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12
  };

  const state = {
    sb: null,
    session: null,
    role: null,
    offline: false,
    cycle: { start: '', end: '' },
    rawFiles: { LAB: null, Molec: null, Bacteria: null },
    units: { LAB: null, Molec: null, Bacteria: null },
    calendarSources: [],
    leaveEvents: [],
    calendarSyncedAt: null,
    snapshotAt: null,
    loadedSnapshot: false,
    conflicts: [],
    history: []
  };

  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const normName = v => String(v ?? '').replace(/\s+/g, '').replace(/^(น\.ส\.|นางสาว|นาย|นาง)/, '').trim();
  const normSearch = v => String(v ?? '').toLowerCase().replace(/[\s().\-_/,:;]+/g, '').replace(/น\.ส\.|นางสาว|นาย|นาง/g, '').trim();
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const parseIso = s => { const [y,m,d] = String(s).split('-').map(Number); return new Date(y, m-1, d, 12, 0, 0); };
  const isoDate = d => iso(d.getFullYear(), d.getMonth()+1, d.getDate());
  const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate()+n); return isoDate(d); };
  const between = (d, a, b) => d >= a && d <= b;
  const buddhistToAd = y => Number(y) > 2400 ? Number(y)-543 : Number(y);
  const adToBuddhist = y => Number(y)+543;
  const monthNum = v => MONTH_LOOKUP[String(v ?? '').trim().toLowerCase()] || MONTH_LOOKUP[String(v ?? '').trim()] || Number(v) || 0;
  const fmtThaiDate = s => { if (!s) return '-'; const d = parseIso(s); return `${d.getDate()} ${TH_MONTH_SHORT[d.getMonth()+1]} ${d.getFullYear()+543}`; };
  const fmtThaiRange = (a,b) => `${fmtThaiDate(a)} – ${fmtThaiDate(b)}`;
  const fmtDateTimeThai = s => s ? new Date(s).toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' }) : '-';
  const round1 = n => Math.round((Number(n)||0)*10)/10;

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 3600);
  }

  function configReady() {
    const url = String(CFG.SUPABASE_URL || '');
    const key = String(CFG.SUPABASE_KEY || CFG.SUPABASE_ANON_KEY || '');
    return /^https:\/\//.test(url) && !url.includes('YOUR_') && key.length > 20 && !key.includes('YOUR_');
  }

  function showOnly(id) {
    ['setupView','authView','appView'].forEach(x => { $(x).hidden = x !== id; });
  }

  function getCurrentCycle() {
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth()+1;
    if (now.getDate() <= 15) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
    return cycleFromStartMonth(y, m);
  }

  function cycleFromStartMonth(y, m) {
    let ey = y, em = m + 1;
    if (em === 13) { em = 1; ey += 1; }
    return { start: iso(y,m,16), end: iso(ey,em,15), startYear:y, startMonth:m };
  }

  function setCycleControls(cycle) {
    const d = parseIso(cycle.start);
    $('cycleMonth').value = String(d.getMonth()+1);
    $('cycleYear').value = String(d.getFullYear()+543);
    updateCycleTitle();
  }

  function readCycleControls() {
    const m = Number($('cycleMonth').value), be = Number($('cycleYear').value);
    if (!m || !be) return getCurrentCycle();
    return cycleFromStartMonth(buddhistToAd(be), m);
  }

  function updateCycleTitle() {
    const c = readCycleControls();
    state.cycle = { start:c.start, end:c.end };
    $('cycleTitle').textContent = fmtThaiRange(c.start, c.end);
    $('cycleMetric').textContent = fmtThaiRange(c.start, c.end);
  }

  async function onCycleChange() {
    const old = state.cycle.start;
    updateCycleTitle();
    if (old && old !== state.cycle.start) {
      state.calendarSources = []; state.leaveEvents = []; state.calendarSyncedAt = null; state.snapshotAt = null; state.loadedSnapshot = false;
      for (const unit of UNITS) {
        const raw = state.rawFiles[unit];
        if (raw) {
          try { state.units[unit] = parseUnit(unit, raw.buffer, raw.name); }
          catch (err) { state.units[unit] = null; setUnitStatus(unit, `อ่านใหม่ไม่สำเร็จ: ${err.message}`, 'error'); }
        } else if (!state.loadedSnapshot) state.units[unit] = null;
      }
      $('calendarSyncMeta').hidden = true;
      recompute();
    }
  }

  function initCycleControls() {
    $('cycleMonth').innerHTML = TH_MONTHS.slice(1).map((m,i) => `<option value="${i+1}">${m}</option>`).join('');
    const c = getCurrentCycle();
    state.cycle = { start:c.start, end:c.end };
    setCycleControls(c);
  }

  async function init() {
    bindUI(); initCycleControls();
    if (!configReady()) { showOnly('setupView'); return; }
    state.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY || CFG.SUPABASE_ANON_KEY);
    const { data } = await state.sb.auth.getSession();
    if (data?.session) return acceptSession(data.session);
    showOnly('authView');
    state.sb.auth.onAuthStateChange((_event, session) => { if (session && !state.session) acceptSession(session); });
  }

  async function acceptSession(session) {
    const email = String(session?.user?.email || '').trim().toLowerCase();
    const info = normalizedUsers[email];
    if (!info) {
      await state.sb.auth.signOut();
      $('loginError').textContent = 'บัญชีนี้ไม่ได้รับอนุญาตให้ใช้ระบบ'; $('loginError').hidden = false; showOnly('authView'); return;
    }
    state.session = session; state.role = info.role; state.offline = false;
    $('loginBadge').textContent = `${info.role === 'admin' ? 'Admin' : 'Staff'} · ${email}`;
    showOnly('appView');
    await loadHistory();
  }

  function enterOffline() {
    state.offline = true; state.role = 'demo'; state.session = { user:{ email:'โหมดทดสอบ' } };
    $('loginBadge').textContent = 'โหมดทดสอบ · ไม่บันทึกฐานข้อมูล';
    showOnly('appView'); recompute();
  }

  async function login(e) {
    e.preventDefault(); $('loginError').hidden = true;
    const email = String($('emailInput').value || '').trim().toLowerCase();
    const password = $('passwordInput').value;
    if (!normalizedUsers[email]) { $('loginError').textContent='บัญชีนี้ไม่ได้รับอนุญาตให้ใช้ระบบ'; $('loginError').hidden=false; return; }
    const { error } = await state.sb.auth.signInWithPassword({ email, password });
    if (error) { $('loginError').textContent = error.message || 'เข้าสู่ระบบไม่สำเร็จ'; $('loginError').hidden=false; }
  }

  async function logout() {
    if (state.sb && !state.offline) await state.sb.auth.signOut();
    location.reload();
  }

  function bindUI() {
    $('loginForm').addEventListener('submit', login);
    $('logoutBtn').addEventListener('click', logout);
    $('offlineDemoBtn').addEventListener('click', enterOffline);
    $('cycleMonth').addEventListener('change', onCycleChange);
    $('cycleYear').addEventListener('change', onCycleChange);
    $('currentCycleBtn').addEventListener('click', () => { const c=getCurrentCycle(); const d=parseIso(c.start); $('cycleMonth').value=String(d.getMonth()+1); $('cycleYear').value=String(d.getFullYear()+543); onCycleChange(); });
    $('labFile').addEventListener('change', e => onUnitFile('LAB', e.target.files?.[0]));
    $('molecFile').addEventListener('change', e => onUnitFile('Molec', e.target.files?.[0]));
    $('bacteriaFile').addEventListener('change', e => onUnitFile('Bacteria', e.target.files?.[0]));
    $('syncCalendarBtn').addEventListener('click', syncCalendar);
    $('exportBtn').addEventListener('click', exportWorkbook);
    $('saveBtn').addEventListener('click', saveCycle);
    $('refreshHistoryBtn').addEventListener('click', loadHistory);
    document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    $('historyList').addEventListener('click', e => {
      const load = e.target.closest('[data-load-cycle]'); if (load) return loadSavedCycle(load.dataset.loadCycle);
      const del = e.target.closest('[data-delete-cycle]'); if (del) return deleteSavedCycle(del.dataset.deleteCycle);
    });
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(x => x.classList.toggle('active', x.id === `tab-${name}`));
    if (name === 'history') loadHistory();
  }

  function setUnitStatus(unit, text, cls='') {
    const el = $(`${UNIT_KEYS[unit]}Status`);
    el.className = `file-status${cls ? ' '+cls : ''}`;
    el.textContent = text;
  }

  async function onUnitFile(unit, file) {
    if (!file) return;
    setUnitStatus(unit, 'กำลังอ่านไฟล์…');
    try {
      const buffer = await file.arrayBuffer();
      state.rawFiles[unit] = { name:file.name, buffer };
      const parsed = parseUnit(unit, buffer, file.name);
      state.units[unit] = parsed;
      state.calendarSources = []; state.leaveEvents = []; state.calendarSyncedAt = null; state.snapshotAt = null; state.loadedSnapshot = false;
      const warnCount = parsed.validation.filter(x => x.type === 'warn').length;
      setUnitStatus(unit, `✓ ${file.name} · ${parsed.assignments.length} รายการ · ${parsed.totalHours} ชม.${warnCount ? ` · มี ${warnCount} จุดให้ตรวจ` : ''}`, warnCount ? 'warn' : 'ok');
      $('calendarSyncMeta').hidden = true;
      recompute();
    } catch (err) {
      console.error(err); state.units[unit] = null; state.rawFiles[unit] = null;
      setUnitStatus(unit, `อ่านไฟล์ไม่ได้: ${err.message}`, 'error'); recompute();
    }
  }

  function parseUnit(unit, buffer, fileName) {
    if (!window.XLSX) throw new Error('ไม่พบไลบรารีอ่าน Excel');
    const wb = XLSX.read(buffer, { type:'array', cellDates:false });
    return unit === 'Bacteria' ? parseBacteria(wb, fileName) : parseLabLike(wb, fileName, unit);
  }

  function parseLabLike(wb, fileName, unit) {
    const sheetName = wb.SheetNames.find(x => String(x).trim() === 'ปฏิบัติ');
    if (!sheetName) throw new Error('ไม่พบชีทชื่อ “ปฏิบัติ”');
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header:1, raw:true, defval:null });
    const validation = [];
    const header = rows[0] || [];
    const m1 = monthNum(header[3]), m2 = monthNum(header[5]), y = buddhistToAd(header[7]);
    const cs = parseIso(state.cycle.start), ce = parseIso(state.cycle.end);
    if (m1 && m2 && y) {
      if (m1 !== cs.getMonth()+1 || m2 !== ce.getMonth()+1 || y !== cs.getFullYear()) {
        validation.push({ type:'warn', text:`${unit}: หัว Excel ระบุ ${header[3] || '?'}–${header[5] || '?'} ${header[7] || ''} แต่รอบที่เลือกคือ ${fmtThaiRange(state.cycle.start,state.cycle.end)} — ระบบใช้รอบที่เลือกเป็นหลัก` });
      } else validation.push({ type:'ok', text:`${unit}: หัวเดือนใน Excel ตรงกับรอบที่เลือก` });
    } else validation.push({ type:'warn', text:`${unit}: อ่านเดือน/ปีจากหัว Excel ไม่ครบ — ระบบใช้รอบที่เลือกในหน้าเว็บ` });

    const assignments = [];
    let dateBlocks = 0;
    for (let r=0; r<rows.length; r++) {
      const label = String(rows[r]?.[0] ?? '').trim();
      if (!label.startsWith('ตำแหน่ง / วันที่')) continue;
      dateBlocks += 1;
      const dateSlots = [];
      for (let c=1; c<=7; c++) {
        const raw = rows[r]?.[c];
        if (raw === null || raw === '') { dateSlots.push(null); continue; }
        const s = String(raw).trim();
        const match = s.match(/\d{1,2}/);
        if (!match) { dateSlots.push(null); continue; }
        const dnum = Number(match[0]);
        const holiday = s.includes('*');
        const d = dnum >= 16
          ? iso(cs.getFullYear(), cs.getMonth()+1, dnum)
          : iso(ce.getFullYear(), ce.getMonth()+1, dnum);
        dateSlots.push({ date:d, holiday });
      }
      for (let rr=r+1; rr<=Math.min(r+4, rows.length-1); rr++) {
        const duty = String(rows[rr]?.[0] ?? '').trim();
        if (!/^เวร\s*/i.test(duty)) continue;
        dateSlots.forEach((slot, idx) => {
          const name = String(rows[rr]?.[idx+1] ?? '').trim();
          if (!slot || !name || !between(slot.date, state.cycle.start, state.cycle.end)) return;
          const d = parseIso(slot.date), weekend = d.getDay() === 0 || d.getDay() === 6;
          const hours = (weekend || slot.holiday) ? 24 : 16;
          assignments.push({
            unit, date:slot.date, sourceDate:slot.date, duty, name:name.trim(), hours,
            timeLabel: hours === 24 ? '24 ชม.' : '16 ชม.', holiday:slot.holiday, weekend
          });
        });
      }
    }
    if (!dateBlocks) throw new Error('ไม่พบแถว “ตำแหน่ง / วันที่”');
    if (!assignments.length) throw new Error('ไม่พบรายการเวรในไฟล์');
    const uniqueDuties = [...new Set(assignments.map(x => x.duty))];
    if (unit === 'Molec' && uniqueDuties.length > 1) validation.push({ type:'warn', text:`Molec: พบหลายเวร (${uniqueDuties.join(', ')}) กรุณาตรวจว่าเป็นไฟล์ Molec ถูกชุด` });
    const totalHours = assignments.reduce((s,x) => s+x.hours, 0);
    validation.push({ type:'ok', text:`${unit}: อ่านได้ ${assignments.length} รายการ · ${totalHours} ชั่วโมง` });
    return { unit, fileName, sheetName, assignments, totalHours, validation, headerInfo:{month1:header[3]||'',month2:header[5]||'',year:header[7]||''} };
  }

  function parseBacteria(wb, fileName) {
    const sheetName = wb.SheetNames.find(x => String(x).trim() === 'ตารางปฏิบัติจริง') || wb.SheetNames.find(x => String(x).includes('ปฏิบัติ'));
    if (!sheetName) throw new Error('ไม่พบชีท “ตารางปฏิบัติจริง”');
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header:1, raw:true, defval:null });
    const validation = [];
    const labels = (rows[2] || []).map(x => String(x ?? '').trim());
    const expected = ['H1','H2','H3','Extra','บ่าย','ดึก'];
    const actual = labels.slice(2,8);
    if (expected.some((x,i) => actual[i] !== x)) {
      validation.push({ type:'warn', text:`Bacteria: หัวคอลัมน์ไม่ตรงรูปแบบตัวอย่างทั้งหมด (${actual.join(' / ')}) กรุณาตรวจไฟล์` });
    } else validation.push({ type:'ok', text:'Bacteria: รูปแบบ H1/H2/H3/Extra/บ่าย/ดึก ถูกต้อง' });

    const assignments = [];
    let cursor = state.cycle.start ? addDays(state.cycle.start, -1) : '';
    let dateRowCount = 0;
    for (let r=3; r<rows.length; r++) {
      const rawDay = rows[r]?.[0];
      if (rawDay === null || rawDay === '') continue;
      const dnum = Number(String(rawDay).replace(/[^0-9]/g,''));
      if (!dnum || dnum < 1 || dnum > 31) continue;
      let rowDate = null, probe = cursor;
      for (let n=0; n<45; n++) {
        if (parseIso(probe).getDate() === dnum) { rowDate = probe; break; }
        probe = addDays(probe, 1);
      }
      if (!rowDate) { validation.push({type:'warn',text:`Bacteria: จับวันที่ ${dnum} จากแถว ${r+1} ไม่ได้`}); continue; }
      cursor = addDays(rowDate, 1); dateRowCount += 1;
      const specs = [
        {col:2,duty:'H1',hours:8,timeLabel:'08:00–16:00',date:rowDate},
        {col:3,duty:'H2',hours:8,timeLabel:'08:00–16:00',date:rowDate},
        {col:4,duty:'H3',hours:8,timeLabel:'08:00–16:00',date:rowDate},
        {col:5,duty:'Extra',hours:4,timeLabel:'16:00–20:00',date:rowDate},
        {col:6,duty:'บ่าย',hours:8,timeLabel:'16:00–00:00',date:rowDate},
        {col:7,duty:'ดึก',hours:8,timeLabel:'00:00–08:00',date:addDays(rowDate,1)}
      ];
      for (const spec of specs) {
        const name = String(rows[r]?.[spec.col] ?? '').trim();
        if (!name || !between(spec.date, state.cycle.start, state.cycle.end)) continue;
        assignments.push({
          unit:'Bacteria', date:spec.date, sourceDate:rowDate, duty:spec.duty, name:name.trim(), hours:spec.hours,
          timeLabel:spec.timeLabel, holiday:false, weekend:[0,6].includes(parseIso(spec.date).getDay()),
          note: spec.duty === 'ดึก' ? `ช่องดึกจากแถววันที่ ${fmtThaiDate(rowDate)} นับเป็นวันที่ ${fmtThaiDate(spec.date)}` : ''
        });
      }
    }
    if (!dateRowCount) throw new Error('ไม่พบแถววันที่ในตาราง Bacteria');
    if (!assignments.length) throw new Error('ไม่พบรายการเวร Bacteria ในรอบที่เลือก');

    const title = String(rows[0]?.[0] ?? '').trim();
    const m = title.match(/16\s*([A-Za-z]+)\s*[-–]\s*15\s*([A-Za-z]+)/i);
    if (m) {
      const tm1=monthNum(m[1]), tm2=monthNum(m[2]), cs=parseIso(state.cycle.start), ce=parseIso(state.cycle.end);
      if (tm1 && tm2 && (tm1!==cs.getMonth()+1 || tm2!==ce.getMonth()+1)) validation.push({type:'warn',text:`Bacteria: ชื่อรอบในไฟล์ “${title}” ไม่ตรงกับรอบที่เลือก ${fmtThaiRange(state.cycle.start,state.cycle.end)}`});
      else validation.push({type:'ok',text:`Bacteria: ชื่อรอบในไฟล์ “${title}” ตรงกับรอบที่เลือก`});
    }
    const totalHours = assignments.reduce((s,x)=>s+x.hours,0);
    validation.push({ type:'ok', text:`Bacteria: อ่านได้ ${assignments.length} รายการ · ${totalHours} ชั่วโมง` });
    return { unit:'Bacteria', fileName, sheetName, assignments, totalHours, validation, headerInfo:{title} };
  }

  function unitsReady() { return UNITS.every(u => !!state.units[u]); }
  function allAssignments() { return UNITS.flatMap(u => state.units[u]?.assignments || []); }

  function buildSummary(assignments) {
    const map = new Map();
    for (const a of assignments) {
      const k = normName(a.name);
      if (!map.has(k)) map.set(k, { name:a.name.trim(), LAB:0, Molec:0, Bacteria:0, hours:0, count:0 });
      const x = map.get(k); x[a.unit] += a.hours; x.hours += a.hours; x.count += 1;
    }
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'th'));
  }

  function buildUnitSummary(assignments) {
    return UNITS.map(unit => {
      const rows = assignments.filter(x => x.unit===unit);
      return { unit, staff:new Set(rows.map(x=>normName(x.name))).size, count:rows.length, hours:rows.reduce((s,x)=>s+x.hours,0) };
    });
  }

  function computeConflicts(assignments, events) {
    if (!events.length) return [];
    const people = [...new Map(assignments.map(a => [normName(a.name), a.name.trim()])).entries()]
      .map(([key,name]) => ({key,name, search:normSearch(name)})).sort((a,b)=>b.search.length-a.search.length);
    const byPerson = new Map();
    for (const a of assignments) {
      const k=normName(a.name); if(!byPerson.has(k)) byPerson.set(k,[]); byPerson.get(k).push(a);
    }
    const out = [], seen = new Set();
    for (const ev of events) {
      const text = normSearch(ev.summary);
      const matched = people.filter(p => p.search && text.includes(p.search));
      for (const p of matched) {
        for (const a of (byPerson.get(p.key)||[])) {
          if (!between(a.date, ev.start, ev.end)) continue;
          const key = [a.unit,a.date,a.duty,p.key,ev.source,ev.uid||'',ev.summary].join('|');
          if (seen.has(key)) continue; seen.add(key);
          out.push({
            date:a.date, name:a.name.trim(), unit:a.unit, duty:a.duty, timeLabel:a.timeLabel, hours:a.hours,
            calendar:ev.source, leaveStart:ev.start, leaveEnd:ev.end, summary:ev.summary, uid:ev.uid||''
          });
        }
      }
    }
    return out.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'th')||a.unit.localeCompare(b.unit));
  }

  function recompute() {
    updateCycleTitle();
    const ready = UNITS.filter(u => !!state.units[u]).length;
    $('unitReadyBadge').textContent = `${ready} / 3 หน่วย`;
    $('unitReadyBadge').className = `pill ${ready===3?'good':''}`;
    $('syncCalendarBtn').disabled = state.offline || !unitsReady();
    if (!unitsReady()) {
      $('calendarStatus').className='file-status'; $('calendarStatus').textContent=`อัปตารางเวรให้ครบ 3 หน่วยก่อน (${ready}/3)`;
    } else if (state.offline) {
      $('calendarStatus').className='file-status warn'; $('calendarStatus').textContent='โหมดทดลองไม่เชื่อม Google Calendar';
    } else if (!state.calendarSyncedAt) {
      $('calendarStatus').className='file-status'; $('calendarStatus').textContent='พร้อมดึงวันลาล่าสุดสำหรับรอบนี้';
    }

    const assignments = allAssignments();
    $('resultArea').hidden = assignments.length === 0;
    if (!assignments.length) return;
    const summary = buildSummary(assignments), unitSummary = buildUnitSummary(assignments);
    state.conflicts = computeConflicts(assignments, state.leaveEvents);
    $('staffMetric').textContent = summary.length.toLocaleString('th-TH');
    $('assignmentMetric').textContent = assignments.length.toLocaleString('th-TH');
    $('hoursMetric').textContent = `${assignments.reduce((s,x)=>s+x.hours,0).toLocaleString('th-TH')} ชม.`;
    $('conflictMetric').textContent = state.conflicts.length.toLocaleString('th-TH');
    renderValidation(); renderSummary(summary); renderUnitSummary(unitSummary); renderConflicts();
    $('exportBtn').disabled = !unitsReady();
    $('saveBtn').disabled = state.offline || !unitsReady() || !state.calendarSyncedAt;
  }

  function renderValidation() {
    const items = [];
    for (const unit of UNITS) if (state.units[unit]) items.push(...state.units[unit].validation);
    if (unitsReady()) items.unshift({type:'ok',text:'ไฟล์ครบทั้ง 3 หน่วยแล้ว'});
    else items.unshift({type:'warn',text:'ต้องอัป LAB + Molec + Bacteria ให้ครบก่อนยืนยันรอบ'});
    if (state.calendarSyncedAt) items.push({type:'ok',text:`Google Calendar อัปเดตล่าสุด ${fmtDateTimeThai(state.calendarSyncedAt)} · ${state.leaveEvents.length} รายการในช่วงรอบ`});
    else items.push({type:'warn',text:'ยังไม่ได้ดึง Google Calendar ล่าสุด — ยังไม่สามารถยืนยันรอบได้'});
    $('validationList').innerHTML = items.map(x=>`<div class="validation-item ${x.type}">${esc(x.text)}</div>`).join('');
  }

  function renderSummary(rows) {
    $('summaryTable').innerHTML = `<thead><tr><th>ชื่อ</th><th class="num">LAB</th><th class="num">Molec</th><th class="num">Bacteria</th><th class="num">รวมชั่วโมง</th><th class="num">ช่วง 8 ชม.</th><th class="num">รายการเวร</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.name)}</b></td><td class="num">${r.LAB||'-'}</td><td class="num">${r.Molec||'-'}</td><td class="num">${r.Bacteria||'-'}</td><td class="num"><b>${r.hours}</b></td><td class="num">${round1(r.hours/8)}</td><td class="num">${r.count}</td></tr>`).join('')}</tbody>`;
  }

  function renderUnitSummary(rows) {
    $('unitSummaryTable').innerHTML = `<thead><tr><th>หน่วย</th><th class="num">จำนวนคน</th><th class="num">รายการเวร</th><th class="num">OT รวม</th><th class="num">ช่วง 8 ชม.</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.unit)}</b></td><td class="num">${r.staff}</td><td class="num">${r.count}</td><td class="num"><b>${r.hours}</b></td><td class="num">${round1(r.hours/8)}</td></tr>`).join('')}</tbody>`;
  }

  function renderConflicts() {
    if (!state.calendarSyncedAt) {
      $('conflictEmpty').textContent='ยังไม่ได้ดึง Calendar'; $('conflictEmpty').hidden=false; $('conflictTable').innerHTML=''; return;
    }
    if (!state.conflicts.length) {
      $('conflictEmpty').textContent='ไม่พบชื่อที่มีเวรและมีรายการ Calendar ในวันเดียวกัน'; $('conflictEmpty').hidden=false; $('conflictTable').innerHTML=''; return;
    }
    $('conflictEmpty').hidden=true;
    $('conflictTable').innerHTML=`<thead><tr><th>วันที่ OT</th><th>ชื่อ</th><th>หน่วย</th><th>เวร</th><th>เวลา</th><th class="num">ชม.</th><th>Calendar</th><th>รายการใน Calendar</th></tr></thead><tbody>${state.conflicts.map(x=>`<tr><td>${esc(fmtThaiDate(x.date))}</td><td><b>${esc(x.name)}</b></td><td>${esc(x.unit)}</td><td>${esc(x.duty)}</td><td>${esc(x.timeLabel)}</td><td class="num">${x.hours}</td><td>${esc(x.calendar)}</td><td>${esc(x.summary)}</td></tr>`).join('')}</tbody>`;
  }

  async function syncCalendar() {
    if (!unitsReady()) return toast('กรุณาอัปตารางเวรให้ครบ 3 หน่วยก่อน');
    if (state.offline || !state.sb) return toast('โหมดทดลองไม่เชื่อม Calendar');
    $('syncCalendarBtn').disabled=true; $('calendarStatus').className='file-status'; $('calendarStatus').textContent='กำลังดึง Google Calendar ล่าสุด…';
    try {
      const { data, error } = await state.sb.functions.invoke('calendar-sync', { body:{ cycle_start:state.cycle.start, cycle_end:state.cycle.end } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'ดึง Calendar ไม่สำเร็จ');
      state.calendarSources = data.sources || [];
      state.leaveEvents = state.calendarSources.flatMap(src => (src.events||[]).map(ev => ({...ev, source:src.name}))).filter(ev => ev.start && ev.end);
      state.calendarSyncedAt = data.synced_at || new Date().toISOString(); state.loadedSnapshot=false;
      $('calendarStatus').className='file-status ok'; $('calendarStatus').textContent=`✓ ดึง ${state.calendarSources.length} Calendar · ${state.leaveEvents.length} รายการในรอบ`;
      $('calendarSyncMeta').hidden=false;
      $('calendarSyncMeta').innerHTML=`<b>อัปเดตล่าสุด:</b> ${esc(fmtDateTimeThai(state.calendarSyncedAt))}<br><b>Calendar:</b> ${esc(state.calendarSources.map(x=>x.name).join(' · '))}`;
      recompute(); toast('ดึงวันลาล่าสุดแล้ว');
    } catch (err) {
      console.error(err); $('calendarStatus').className='file-status error'; $('calendarStatus').textContent=`ดึง Calendar ไม่สำเร็จ: ${err.message || err}`; toast('ดึง Calendar ไม่สำเร็จ');
    } finally { $('syncCalendarBtn').disabled = state.offline || !unitsReady(); }
  }

  function exportWorkbook() {
    if (!unitsReady()) return toast('ต้องมีไฟล์ครบ 3 หน่วยก่อน Export');
    const assignments = allAssignments().sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'th')||a.unit.localeCompare(b.unit));
    const summary = buildSummary(assignments), unitSummary=buildUnitSummary(assignments);
    const wb = XLSX.utils.book_new();
    const aoaSummary = [['ชื่อ','LAB (ชม.)','Molec (ชม.)','Bacteria (ชม.)','รวม (ชม.)','ช่วง 8 ชม.','จำนวนรายการเวร'], ...summary.map(r=>[r.name,r.LAB,r.Molec,r.Bacteria,r.hours,round1(r.hours/8),r.count])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaSummary), 'Summary_รวม');
    const aoaUnit = [['หน่วย','จำนวนคน','รายการเวร','OT รวม (ชม.)','ช่วง 8 ชม.'], ...unitSummary.map(r=>[r.unit,r.staff,r.count,r.hours,round1(r.hours/8)])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaUnit), 'Summary_หน่วย');
    const conflictKeys = new Set(state.conflicts.map(x=>[x.unit,x.date,x.duty,normName(x.name)].join('|')));
    const detail = [['วันที่ OT','ชื่อ','หน่วย','เวร','เวลา','ชั่วโมง','วันที่แถวต้นทาง','วันหยุด *','เตือน Calendar']];
    assignments.forEach(a => detail.push([
      a.date, a.name, a.unit, a.duty, a.timeLabel, a.hours, a.sourceDate, a.holiday ? 'ใช่' : '',
      conflictKeys.has([a.unit,a.date,a.duty,normName(a.name)].join('|')) ? 'ตรวจ' : ''
    ]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detail), 'Detail_OT');
    const warnings = [['วันที่ OT','ชื่อ','หน่วย','เวร','เวลา OT','ชั่วโมง','Calendar','ช่วงวัน Calendar','รายการใน Calendar']];
    state.conflicts.forEach(x => warnings.push([
      x.date, x.name, x.unit, x.duty, x.timeLabel, x.hours, x.calendar, `${x.leaveStart} - ${x.leaveEnd}`, x.summary
    ]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(warnings), 'Leave_Warnings');
    const cal = [['Calendar','เริ่ม','สิ้นสุด','รายการ'], ...state.leaveEvents.map(x=>[x.source,x.start,x.end,x.summary])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cal), 'Calendar_Leave');
    const checks = [['ประเภท','ข้อความ']];
    for(const unit of UNITS) for(const v of state.units[unit].validation) checks.push([v.type,v.text]);
    checks.push(['info',`Calendar sync: ${state.calendarSyncedAt || 'ยังไม่ได้ Sync'}`]);
    checks.push(['info',`Snapshot: ${state.snapshotAt || 'ยังไม่ได้บันทึก'}`]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(checks), 'Checks');
    const d1=parseIso(state.cycle.start), d2=parseIso(state.cycle.end);
    const fileName=`LAB_OT_${d1.getFullYear()+543}_${pad(d1.getMonth()+1)}16-${pad(d2.getMonth()+1)}15.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  async function saveCycle() {
    if (state.offline || !state.sb) return toast('โหมดทดลองไม่บันทึกฐานข้อมูล');
    if (!unitsReady()) return toast('ต้องมีไฟล์ครบ 3 หน่วย');
    if (!state.calendarSyncedAt) return toast('กรุณากดดึงวันลาล่าสุดก่อนยืนยันรอบ');
    const now = new Date().toISOString();
    const cycleKey = `${state.cycle.start}_${state.cycle.end}`;
    const payload = {
      version:'2.0-all-units', cycle:{...state.cycle},
      units:Object.fromEntries(UNITS.map(u => [u, state.units[u]])),
      calendarSources:state.calendarSources, leaveEvents:state.leaveEvents,
      calendarSyncedAt:state.calendarSyncedAt, conflicts:state.conflicts, savedAt:now
    };
    $('saveBtn').disabled=true;
    try {
      const { error } = await state.sb.from('ot_batches').upsert({
        cycle_key:cycleKey, cycle_start:state.cycle.start, cycle_end:state.cycle.end,
        unit_file_names:Object.fromEntries(UNITS.map(u=>[u,state.units[u].fileName])),
        calendar_synced_at:state.calendarSyncedAt, snapshot_at:now, payload, updated_at:now
      }, { onConflict:'cycle_key' });
      if (error) throw error;
      state.snapshotAt=now; state.loadedSnapshot=true;
      toast('ยืนยันและบันทึก Snapshot รอบนี้แล้ว'); await loadHistory();
    } catch(err) { console.error(err); toast(`บันทึกไม่สำเร็จ: ${err.message || err}`); }
    finally { recompute(); }
  }

  async function loadHistory() {
    if (state.offline || !state.sb) { $('historyList').innerHTML='<div class="empty-state">โหมดทดลองไม่ใช้ฐานข้อมูล</div>'; return; }
    const { data, error } = await state.sb.from('ot_batches').select('cycle_key,cycle_start,cycle_end,unit_file_names,calendar_synced_at,snapshot_at,updated_at').order('cycle_start',{ascending:false});
    if (error) { $('historyList').innerHTML=`<div class="empty-state">โหลดประวัติไม่ได้: ${esc(error.message)}</div>`; return; }
    state.history=data||[];
    $('historyList').innerHTML = state.history.length ? state.history.map(r => {
      const files=r.unit_file_names||{};
      return `<div class="history-item"><div><b>${esc(fmtThaiRange(r.cycle_start,r.cycle_end))}</b><span>LAB: ${esc(files.LAB||'-')} · Molec: ${esc(files.Molec||'-')} · Bacteria: ${esc(files.Bacteria||'-')}</span><span>Snapshot ${esc(fmtDateTimeThai(r.snapshot_at||r.updated_at))}</span></div><div class="history-actions"><button class="secondary-btn" data-load-cycle="${esc(r.cycle_key)}">เปิดรอบนี้</button><button class="danger-btn" data-delete-cycle="${esc(r.cycle_key)}">ลบรอบ</button></div></div>`;
    }).join('') : '<div class="empty-state">ยังไม่มีรอบที่บันทึกไว้</div>';
  }

  async function deleteSavedCycle(cycleKey) {
    if (!state.sb) return;
    if (!confirm('ยืนยันลบรอบนี้ออกจากฐานข้อมูล?')) return;
    const { error } = await state.sb.from('ot_batches').delete().eq('cycle_key',cycleKey);
    if (error) return toast(`ลบไม่สำเร็จ: ${error.message}`);
    toast('ลบรอบแล้ว'); await loadHistory();
  }

  async function loadSavedCycle(cycleKey) {
    if (!state.sb) return;
    const { data, error } = await state.sb.from('ot_batches').select('payload,snapshot_at').eq('cycle_key',cycleKey).single();
    if (error || !data?.payload) return toast('เปิดข้อมูลไม่สำเร็จ');
    const p=data.payload;
    state.cycle=p.cycle; state.units=p.units||{LAB:null,Molec:null,Bacteria:null}; state.rawFiles={LAB:null,Molec:null,Bacteria:null};
    state.calendarSources=p.calendarSources||[]; state.leaveEvents=p.leaveEvents||[]; state.calendarSyncedAt=p.calendarSyncedAt||null; state.snapshotAt=data.snapshot_at||p.savedAt||null; state.loadedSnapshot=true;
    setCycleControls({start:state.cycle.start,end:state.cycle.end});
    for(const unit of UNITS) {
      const u=state.units[unit]; setUnitStatus(unit,u?`✓ โหลด Snapshot · ${u.fileName} · ${u.assignments?.length||0} รายการ`:'ไม่มีไฟล์ใน Snapshot',u?'ok':'error');
    }
    $('calendarStatus').className='file-status ok'; $('calendarStatus').textContent=`✓ ใช้ Snapshot Calendar เดิม ${state.calendarSources.length} ชุด · ไม่ได้ Sync ใหม่`;
    $('calendarSyncMeta').hidden=false; $('calendarSyncMeta').innerHTML=`<b>Snapshot:</b> ${esc(fmtDateTimeThai(state.snapshotAt))}<br><b>Calendar ตอนบันทึก:</b> ${esc(fmtDateTimeThai(state.calendarSyncedAt))}`;
    recompute(); switchTab('work'); toast('เปิด Snapshot เดิมแล้ว');
  }

  init().catch(err => { console.error(err); alert(err.message || err); });
})();

(() => {
  'use strict';

  const CFG = window.LAB_OT_CONFIG || window.PSC_OT_CONFIG || {};
  const USERS = CFG.USERS || {
    'parichat.ink@mahidol.ac.th': { role: 'admin', label: 'Admin' },
    'paleerat.ran@mahidol.ac.th': { role: 'admin', label: 'Admin' }
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
    actualRole: null,
    viewRole: null,
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
    history: [],
    hrExport: null,
    special328Dates: [],
    special328Selected: {},
    ackPeople: {},
    ackRows: [],
    ackDbReady: true,
    ackPerson: null,
    managedUsers: [],
    resetUser: null,
    forcePasswordChange: false,
    installPrompt: null,
    appLogs: [],
    ownerPreviewRows: [],
    ownerPreviewStaffKey: '',
    managerOwnAckRows: [],
    staffOwnAckRows: [],
    adminAckCycleKey: '',
    staffAckCycleKey: '',
    resultTab: 'summary',
    summaryRows: [],
    summarySearch: '',
    summaryPage: 1,
    ackSearch: '',
    ackPage: 1,
    conflictPage: 1,
    leavePage: 1,
    ackEmailDrafts: {}
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
    ['setupView','authView','appView','ackView'].forEach(x => { $(x).hidden = x !== id; });
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

  // หน้าใช้งานเรียกรอบตาม "เดือนที่สิ้นสุดรอบ" เช่น รอบ ก.ย. = 16 ส.ค.–15 ก.ย.
  function cycleFromRoundMonth(y, m) {
    let sy = y, sm = m - 1;
    if (sm === 0) { sm = 12; sy -= 1; }
    return cycleFromStartMonth(sy, sm);
  }

  function setCycleControls(cycle) {
    const d = parseIso(cycle.end);
    $('cycleMonth').value = String(d.getMonth()+1);
    $('cycleYear').value = String(d.getFullYear()+543);
    updateCycleTitle();
  }

  function readCycleControls() {
    const m = Number($('cycleMonth').value), be = Number($('cycleYear').value);
    if (!m || !be) return getCurrentCycle();
    return cycleFromRoundMonth(buddhistToAd(be), m);
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
      state.calendarSources = []; state.leaveEvents = []; state.calendarSyncedAt = null; state.snapshotAt = null; state.loadedSnapshot = false; state.hrExport = null;
      state.summaryPage=1; state.ackPage=1; state.conflictPage=1; state.leavePage=1; state.ackEmailDrafts={};
      for (const unit of UNITS) {
        const raw = state.rawFiles[unit];
        if (raw) {
          try { state.units[unit] = parseUnit(unit, raw.buffer, raw.name); }
          catch (err) { state.units[unit] = null; setUnitStatus(unit, `อ่านใหม่ไม่สำเร็จ: ${err.message}`, 'error'); }
        } else if (!state.loadedSnapshot) state.units[unit] = null;
      }
      $('calendarSyncMeta').hidden = true;
      recompute();
      if (state.sb && !state.offline) { loadSpecial328Settings(); loadAckManagerData(); }
    }
  }

  function initCycleControls() {
    $('cycleMonth').innerHTML = TH_MONTHS.slice(1).map((m,i) => `<option value="${i+1}">${m}</option>`).join('');
    const c = getCurrentCycle();
    state.cycle = { start:c.start, end:c.end };
    setCycleControls(c);
  }

  async function init() {
    bindUI(); initCycleControls(); setupPwaInstall();
    if (!configReady()) { showOnly('setupView'); return; }
    state.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY || CFG.SUPABASE_ANON_KEY);
    const { data } = await state.sb.auth.getSession();
    if (data?.session) return acceptSession(data.session);
    showOnly('authView');
    state.sb.auth.onAuthStateChange((_event, session) => { if (session && !state.session) acceptSession(session); });
  }

  function normalizeMahidolEmail(value) {
    let raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!raw) return '';
    if (raw.endsWith('@mahidol.ac.th')) raw = raw.slice(0, -'@mahidol.ac.th'.length);
    if (raw.includes('@')) return raw; // lets the validation below reject another domain clearly
    return `${raw}@mahidol.ac.th`;
  }

  function applyViewRole(role, {persist=true}={}) {
    const canSwitch=state.actualRole==='admin';
    const wanted=canSwitch && role==='staff' ? 'staff' : (state.actualRole==='admin'?'admin':'staff');

    state.viewRole=wanted;
    state.role=wanted;
    document.body.dataset.viewRole=wanted;

    const email=String(state.session?.user?.email||'').toLowerCase();

    if(wanted==='staff'){
      $('ackLoginBadge').textContent=`Staff · ${email}`;
      if($('ackRoleSwitchWrap')) $('ackRoleSwitchWrap').hidden=!canSwitch;
      if($('ackRoleSwitch')) $('ackRoleSwitch').value='staff';
      showOnly('ackView');
      switchStaffTab('myack');
      loadAckPortal();
    }else{
      $('loginBadge').textContent=`Admin · ${email}`;
      if($('adminRoleSwitchWrap')) $('adminRoleSwitchWrap').hidden=!canSwitch;
      if($('adminRoleSwitch')) $('adminRoleSwitch').value='admin';
      showOnly('appView');
      document.querySelectorAll('[data-admin-only]').forEach(el=>{el.hidden=false;});
      switchTab('work');
    }

    if(persist && canSwitch) sessionStorage.setItem('labot_view_role',wanted);
  }

  function toggleViewModeMenu() {
    if (state.actualRole !== 'admin') return;
    const menu = $('viewModeMenu'), btn = $('viewModeBtn');
    const willOpen = !!menu?.hidden;
    if (menu) menu.hidden = !willOpen;
    if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  }

  async function acceptSession(session) {
    const email = String(session?.user?.email || '').trim().toLowerCase();
    state.session = session;
    state.offline = false;

    try {
      const { data: person, error } = await state.sb
        .from('ot_ack_people')
        .select('staff_key,employee_code,display_name,email,active,app_role,position')
        .eq('email', email)
        .maybeSingle();

      if (error) throw error;

      const isOwner = email === 'parichat.ink@mahidol.ac.th';

      if (!isOwner && (!person || person.active === false)) {
        await state.sb.auth.signOut();
        $('loginError').textContent = person?.active === false
          ? 'บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแล'
          : 'บัญชีนี้ยังไม่ได้ถูกเพิ่มในระบบ กรุณาติดต่อผู้ดูแล';
        $('loginError').hidden = false;
        showOnly('authView');
        return;
      }

      const role = isOwner
        ? 'admin'
        : (String(person?.app_role || 'staff').toLowerCase() === 'admin' ? 'admin' : 'staff');

      state.actualRole = role;
      state.role = role;
      state.viewRole = role;
      state.ackPerson = person || {
        staff_key:'emp:0020305',
        employee_code:'0020305',
        display_name:'น.ส. ปาริฉัตร อินทร์เกลี้ยง',
        email,
        active:true,
        app_role:'admin',
        position:''
      };

      if (role === 'admin') {
        await Promise.all([
          loadHistory(),
          loadSpecial328Settings(),
          loadAckManagerData(),
          loadManagerOwnAck(),
          loadManagedUsers()
        ]);
        if(canAdminPreviewAllStaff()) loadOwnerStaffPreview();
        const savedView=sessionStorage.getItem('labot_view_role');
        applyViewRole(savedView==='staff'?'staff':'admin',{persist:false});
      } else {
        applyViewRole('staff',{persist:false});
      }

      await writeAppLog('login','เข้าสู่ระบบ','');
      maybeForcePasswordChange();
    } catch (err) {
      console.error('session role lookup failed', err);
      await state.sb.auth.signOut();
      $('loginError').textContent = 'เปิดบัญชีผู้ใช้งานไม่สำเร็จ กรุณาติดต่อผู้ดูแล';
      $('loginError').hidden = false;
      showOnly('authView');
    }
  }

  function enterOffline() {
    state.offline = true; state.role = 'staff'; state.actualRole = 'demo'; state.viewRole = 'staff'; state.session = { user:{ email:'โหมดทดสอบ' } };
    $('loginBadge').textContent = 'โหมดทดสอบ · ไม่บันทึกฐานข้อมูล';
    applyViewRole('staff', {persist:false}); recompute();
  }

  async function login(e) {
    e.preventDefault(); $('loginError').hidden = true;
    const email = normalizeMahidolEmail($('emailInput').value);
    const password = $('passwordInput').value;
    if (!email.endsWith('@mahidol.ac.th')) {
      $('loginError').textContent='ระบบนี้ใช้บัญชี @mahidol.ac.th เท่านั้น'; $('loginError').hidden=false; return;
    }
    const { error } = await state.sb.auth.signInWithPassword({ email, password });
    if (error) { $('loginError').textContent = error.message || 'เข้าสู่ระบบไม่สำเร็จ'; $('loginError').hidden=false; }
  }





  function openPasswordModal(force=false) {
    if (!state.session?.user?.email || state.offline) {
      return toast('โหมดทดลองไม่สามารถเปลี่ยนรหัสผ่านได้');
    }
    state.forcePasswordChange = !!force;
    const modal=$('passwordModal');
    const form=$('passwordChangeForm');
    const err=$('passwordChangeError');
    const title=$('passwordModalTitle');
    const helper=$('passwordModalHelper');
    const close=$('closePasswordModalBtn');
    const cancel=$('cancelPasswordBtn');
    if (form) form.reset();
    if (err) { err.hidden=true; err.textContent=''; }
    if (title) title.textContent = force ? 'ตั้งรหัสผ่านใหม่' : 'เปลี่ยนรหัสผ่าน';
    if (helper) helper.textContent = force ? 'กรอกรหัสชั่วคราวที่ได้รับ แล้วตั้งรหัสใหม่ของคุณ' : 'เปลี่ยนรหัสผ่านของบัญชีนี้';
    if (close) close.hidden = force;
    if (cancel) cancel.hidden = force;
    if (modal) modal.hidden=false;
    setTimeout(()=>$('currentPasswordInput')?.focus(),30);
  }

  function maybeForcePasswordChange() {
    const must = !!state.session?.user?.user_metadata?.must_change_password;
    if (must) setTimeout(()=>openPasswordModal(true),80);
  }

  function closePasswordModal() {
    if (state.forcePasswordChange) return;
    const modal=$('passwordModal');
    const form=$('passwordChangeForm');
    const err=$('passwordChangeError');
    if (modal) modal.hidden=true;
    if (form) form.reset();
    if (err) { err.hidden=true; err.textContent=''; }
  }

  async function changeOwnPassword(e) {
    e.preventDefault();
    if (state.offline || !state.sb || !state.session?.user?.email) {
      return toast('ไม่สามารถเปลี่ยนรหัสผ่านในโหมดทดลองได้');
    }

    const currentPassword=String($('currentPasswordInput')?.value||'');
    const newPassword=String($('newPasswordInput')?.value||'');
    const confirmPassword=String($('confirmPasswordInput')?.value||'');
    const errorEl=$('passwordChangeError');
    const saveBtn=$('savePasswordBtn');

    const showError=msg=>{
      if (errorEl) { errorEl.textContent=msg; errorEl.hidden=false; }
    };
    if (errorEl) { errorEl.hidden=true; errorEl.textContent=''; }

    if (!currentPassword) return showError('กรุณากรอกรหัสผ่านเดิม');
    if (newPassword.length < 8) return showError('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
    if (newPassword !== confirmPassword) return showError('ยืนยันรหัสผ่านใหม่ไม่ตรงกัน');
    if (newPassword === currentPassword) return showError('รหัสผ่านใหม่ต้องไม่เหมือนรหัสเดิม');

    const email=String(state.session.user.email||'').trim().toLowerCase();
    if (saveBtn) { saveBtn.disabled=true; saveBtn.textContent='กำลังบันทึก…'; }

    try {
      // ตรวจรหัสเดิมอีกครั้งก่อนเปลี่ยน เพื่อป้องกันคนที่เปิดเครื่องค้างไว้เปลี่ยนรหัสโดยไม่รู้รหัสเดิม
      const { error: verifyError } = await state.sb.auth.signInWithPassword({
        email,
        password: currentPassword
      });
      if (verifyError) {
        showError('รหัสผ่านเดิมไม่ถูกต้อง');
        return;
      }

      const meta={...(state.session?.user?.user_metadata||{}),must_change_password:false};
      const { data, error: updateError } = await state.sb.auth.updateUser({
        password: newPassword,
        data: meta
      });
      if (updateError) throw updateError;

      if (data?.user) state.session.user = data.user;
      state.forcePasswordChange=false;
      const close=$('closePasswordModalBtn'), cancel=$('cancelPasswordBtn');
      if(close) close.hidden=false;
      if(cancel) cancel.hidden=false;
      const modal=$('passwordModal'), form=$('passwordChangeForm');
      if(modal) modal.hidden=true;
      if(form) form.reset();
      toast('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
      await writeAppLog('password_change','เปลี่ยนรหัสผ่าน','');
    } catch (err) {
      console.error('change password failed', err);
      showError(err?.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      if (saveBtn) { saveBtn.disabled=false; saveBtn.textContent='บันทึกรหัสใหม่'; }
    }
  }

  async function logout() {
    if (state.sb && !state.offline) {
      await writeAppLog('logout','ออกจากระบบ','');
      await state.sb.auth.signOut();
    }
    location.reload();
  }



  /* ===========================
     APP ACTIVITY LOG
     =========================== */
  async function writeAppLog(action,label,detail='',targetEmail='',cycleKey='') {
    if(state.offline || !state.sb || !state.session?.user?.email) return;
    try{
      const {error}=await state.sb.rpc('log_ot_app_event',{
        p_action:String(action||''),
        p_label:String(label||''),
        p_detail:String(detail||''),
        p_target_email:String(targetEmail||''),
        p_cycle_key:String(cycleKey||'')
      });
      if(error) console.warn('app log',error);
    }catch(err){
      console.warn('app log',err);
    }
  }

  function renderAppLogs(rows,table,empty,isAdmin=false) {
    if(!table||!empty) return;
    const data=Array.isArray(rows)?rows:[];
    if(!data.length){
      empty.hidden=false;
      empty.textContent='ยังไม่มีรายการ';
      table.innerHTML='';
      return;
    }
    empty.hidden=true;

    if(isAdmin){
      table.innerHTML=`<thead><tr>
        <th>วันเวลา</th><th>ผู้ใช้งาน</th><th>Role</th><th>รายการ</th><th>รายละเอียด</th>
      </tr></thead><tbody>${data.map(r=>`<tr>
        <td class="log-time">${esc(fmtDateTimeThai(r.created_at))}</td>
        <td><b>${esc(r.actor_name||String(r.actor_email||'').replace(/@mahidol\.ac\.th$/i,''))}</b><div class="subtle">${esc(r.actor_email||'')}</div></td>
        <td>${esc(String(r.actor_role||'').toLowerCase()==='admin'?'Admin':'Staff')}</td>
        <td><b>${esc(r.action_label||'-')}</b></td>
        <td>${esc(r.detail||'-')}</td>
      </tr>`).join('')}</tbody>`;
    }else{
      table.innerHTML=`<thead><tr>
        <th>วันเวลา</th><th>รายการ</th><th>รายละเอียด</th>
      </tr></thead><tbody>${data.map(r=>`<tr>
        <td class="log-time">${esc(fmtDateTimeThai(r.created_at))}</td>
        <td><b>${esc(r.action_label||'-')}</b></td>
        <td>${esc(r.detail||'-')}</td>
      </tr>`).join('')}</tbody>`;
    }
  }

  async function loadAppLogs(scope='staff') {
    if(state.offline || !state.sb) return;
    const adminMode=scope==='admin';
    const table=adminMode?$('adminLogTable'):$('staffLogTable');
    const empty=adminMode?$('adminLogEmpty'):$('staffLogEmpty');
    if(!table||!empty) return;

    empty.hidden=false;
    empty.textContent='กำลังโหลด…';
    table.innerHTML='';

    try{
      const {data,error}=await state.sb.rpc('get_ot_app_logs',{
        p_scope:adminMode?'admin':'self',
        p_limit:100
      });
      if(error) throw error;
      state.appLogs=data||[];
      renderAppLogs(state.appLogs,table,empty,adminMode);
    }catch(err){
      console.warn('load app logs',err);
      empty.hidden=false;
      empty.textContent='ยังเปิด Log ไม่ได้';
      table.innerHTML='';
    }
  }

  function switchStaffTab(name) {
    const tabs=[...document.querySelectorAll('.staff-tab')];
    const panels=[...document.querySelectorAll('.staff-tab-panel')];

    tabs.forEach(tab=>{
      tab.classList.remove('active');
      tab.setAttribute('aria-selected','false');
      tab.tabIndex=-1;
    });
    panels.forEach(panel=>panel.classList.remove('active'));

    const activeTab=tabs.find(tab=>tab.dataset.staffTab===name) || tabs[0];
    const activeName=activeTab?.dataset.staffTab || 'myack';
    const activePanel=document.getElementById(`staff-tab-${activeName}`);

    if(activeTab){
      activeTab.classList.add('active');
      activeTab.setAttribute('aria-selected','true');
      activeTab.tabIndex=0;
    }
    if(activePanel) activePanel.classList.add('active');

    if(activeName==='myack') loadAckPortal();
    if(activeName==='log') loadAppLogs('staff');
  }

  /* ===========================
     PWA INSTALL
     =========================== */
  function setupPwaInstall() {
    const btn=$('installAppBtn'), ackBtn=$('ackInstallAppBtn');
    const standalone=window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone===true;
    if(standalone){
      if(btn) btn.hidden=true;
      if(ackBtn) ackBtn.hidden=true;
      return;
    }
    const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
    if(isiOS){
      if(btn) btn.hidden=false;
      if(ackBtn) ackBtn.hidden=false;
    }
    window.addEventListener('beforeinstallprompt',e=>{
      e.preventDefault();
      state.installPrompt=e;
      if(btn) btn.hidden=false;
      if(ackBtn) ackBtn.hidden=false;
    });
    window.addEventListener('appinstalled',()=>{
      state.installPrompt=null;
      if(btn) btn.hidden=true;
      if(ackBtn) ackBtn.hidden=true;
      toast('ติดตั้ง LAB OT แล้ว');
    });
  }

  async function installApp() {
    if(state.installPrompt){
      state.installPrompt.prompt();
      await state.installPrompt.userChoice;
      state.installPrompt=null;
      return;
    }
    const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
    if(isiOS){
      alert('iPhone / iPad\\n1. เปิดหน้านี้ด้วย Safari\\n2. กดปุ่ม Share\\n3. เลือก “เพิ่มไปยังหน้าจอโฮม”\\n4. กด “เพิ่ม”');
      return;
    }
    alert('เปิดเมนูของเบราว์เซอร์ แล้วเลือก “ติดตั้งแอป” หรือ “เพิ่มไปยังหน้าจอหลัก”');
  }

  /* ===========================
     MANAGER — OWN ACKNOWLEDGEMENT
     =========================== */
  function renderAckCards(rows, list, empty, options={}) {
    const readOnly=!!options.readOnly;
    const showPerson=!!options.showPerson;
    if(!list||!empty) return;

    const data=rows||[];
    if(!data.length){
      empty.hidden=false;
      empty.textContent='ยังไม่มีรายการ OT ที่ส่งมาให้รับทราบ';
      list.innerHTML='';
      return;
    }

    const dateChips=(dates,kind='neutral')=>{
      if(!dates?.length) return '<span class="ack-none">ไม่มี</span>';
      return `<div class="ack-date-chips">${dates.map(d=>`<span class="ack-date-chip ${kind}">${esc(fmtThaiDate(d))}</span>`).join('')}</div>`;
    };

    empty.hidden=true;
    list.innerHTML=data.map(r=>{
      const d=r.detail_json||{};
      const assignments=Array.isArray(d.assignments)?d.assignments:[];
      const hp=d.hrPlan||{};
      const claims=Array.isArray(hp.claims)?hp.claims:[];
      const leaveDates=Array.isArray(hp.leaveDates)?hp.leaveDates:[];
      const skippedDates=Array.isArray(hp.skippedDates)?hp.skippedDates:[];
      const issues=Array.isArray(hp.verifyIssues)?hp.verifyIssues:[];
      const acknowledged=r.status==='acknowledged';
      const specialCount=Number(hp.special328Count ?? d.special328Count ?? 0);
      const hasNewPlan=!!d.hrPlan;

      const actualTable=assignments.length
        ? `<div class="table-wrap ack-check-table"><table>
            <thead><tr><th>วันที่อยู่เวรจริง</th><th>หน่วย</th><th>เวร</th><th>เวลา</th><th class="num">ชม.</th></tr></thead>
            <tbody>${assignments.map(a=>`<tr>
              <td><b>${esc(fmtThaiDate(a.date))}</b></td>
              <td>${esc(a.unit)}</td>
              <td>${esc(a.duty)}</td>
              <td>${esc(a.time)}</td>
              <td class="num"><b>${Number(a.hours||0)}</b></td>
            </tr>`).join('')}</tbody>
          </table></div>`
        : '<div class="empty-state compact-empty">ไม่พบเวรจริงในรอบนี้</div>';

      const hrTable=claims.length
        ? `<div class="table-wrap ack-check-table"><table>
            <thead><tr><th>วันที่เบิก HR</th><th>เวลาเข้า</th><th>เวลาออก</th><th>รายการ</th><th>รหัส</th></tr></thead>
            <tbody>${claims.map(c=>`<tr>
              <td><b>${esc(fmtThaiDate(c.date))}</b></td>
              <td>${esc(c.start||'-')}</td>
              <td>${esc(c.end||'-')}</td>
              <td>${esc(c.claimKind||'OT')}</td>
              <td><span class="claim-code">${esc(c.claimCode||'-')}</span></td>
            </tr>`).join('')}</tbody>
          </table></div>`
        : '<div class="empty-state compact-empty">ยังไม่มีรายการในตารางเบิก HR</div>';

      const verifyOk=hasNewPlan && hp.verifyOk!==false && issues.length===0;
      const normalPay=Number(hp.claimedHours||0)*130;
      const specialPay=Number(hp.special328Amount ?? (specialCount*240) ?? 0);
      const totalPay=normalPay+specialPay;
      const verifyBox=hasNewPlan
        ? `<div class="ack-verify-box ${verifyOk?'ok':'warn'}">
            <div class="ack-verify-head">
              <b>${verifyOk?'✓ ระบบตรวจแล้ว':'⚠ มีจุดที่ต้องตรวจ'}</b>
              <span>${verifyOk?'ยอดชั่วโมงและวันลาสอดคล้องกับตารางที่ระบบจัด':'กรุณาตรวจรายการด้านล่างก่อนรับทราบ'}</span>
            </div>
            <div class="ack-verify-metrics">
              <div><span>OT จริง</span><b>${Number(d.totalHours||r.ot_hours||0)} ชม.</b></div>
              <div><span>ยอดยกมา</span><b>${Number(hp.carryIn||0)} ชม.</b></div>
              <div><span>เบิก HR</span><b>${Number(hp.claimedHours||0)} ชม.</b></div>
              <div><span>เงินที่ได้</span><b>${totalPay.toLocaleString('th-TH')} บาท</b></div>
              <div><span>ทบเดือนหน้า</span><b>${Number(hp.carryOut||0)} ชม.</b></div>
              ${specialCount?`<div><span>00000328</span><b>${specialCount} ครั้ง · ${specialPay.toLocaleString('th-TH')} บาท</b></div>`:''}
            </div>
            ${issues.length?`<div class="ack-verify-issues">${issues.map(x=>`<div>• ${esc(x)}</div>`).join('')}</div>`:''}
          </div>`
        : `<div class="ack-verify-box warn">
            <div class="ack-verify-head">
              <b>รอบนี้ยังเป็นข้อมูลแบบเดิม</b>
              <span>ให้ผู้ทำ OT เปิดรอบนี้แล้วกด “ยืนยันและบันทึกรอบนี้” อีกครั้ง เพื่อสร้างตารางตรวจสอบก่อนรับทราบ</span>
            </div>
          </div>`;

      return `<article class="ack-person-card ack-review-card">
        <div class="ack-person-head">
          <div>
            ${showPerson?`<div class="section-kicker">${esc(r.display_name||'เจ้าหน้าที่')}</div>`:`<div class="section-kicker">รอบ OT</div>`}
            <h2>${esc(fmtThaiRange(r.cycle_start,r.cycle_end))}</h2>
          </div>
          ${acknowledged
            ? `<span class="ack-status done">✓ รับทราบแล้ว</span>`
            : `<span class="ack-status pending">รอรับทราบ</span>`}
        </div>

        <div class="ack-metrics">
          <div><span>OT รวม</span><b>${Number(r.ot_hours||0).toLocaleString('th-TH')} ชม.</b></div>
          <div><span>LAB</span><b>${Number(d.unitHours?.LAB||0)}</b></div>
          <div><span>Molec</span><b>${Number(d.unitHours?.Molec||0)}</b></div>
          <div><span>Bacteria</span><b>${Number(d.unitHours?.Bacteria||0)}</b></div>
        </div>

        ${verifyBox}

        <section class="ack-review-section">
          <div class="ack-review-title">
            <span class="ack-review-no">1</span>
            <div><h3>ตารางเวรจริงของฉัน</h3><p>วันที่และเวรที่อ่านมาจากไฟล์ตารางเวรของหน่วย</p></div>
          </div>
          ${actualTable}
        </section>

        <section class="ack-review-section">
          <div class="ack-review-title">
            <span class="ack-review-no">2</span>
            <div>
              <h3>ตารางที่ระบบจัดเบิก HR</h3>
              <p>ใช้ตรวจวันที่และเวลาในตารางเบิก HR ซึ่งอาจไม่ใช่วันเดียวกับวันที่อยู่เวรจริง</p>
            </div>
          </div>
          ${hrTable}
        </section>

        <section class="ack-review-section">
          <div class="ack-review-title">
            <span class="ack-review-no">3</span>
            <div><h3>วันที่ระบบเว้นและวันลา</h3><p>ใช้ดูว่าระบบเว้นวันให้ตรงกับวันที่ไม่ควรนำไปจัดเบิกหรือไม่</p></div>
          </div>

          <div class="ack-day-groups">
            <div class="ack-day-group">
              <b>วันลาที่ระบบใช้หลบ</b>
              ${dateChips(leaveDates,'leave')}
            </div>
            <div class="ack-day-group">
              <b>วันที่ไม่มีรายการเบิก HR</b>
              ${dateChips(skippedDates,'rest')}
            </div>
          </div>
        </section>

        ${readOnly
          ? (acknowledged
              ? `<div class="ack-confirmed">รับทราบเมื่อ ${esc(fmtDateTimeThai(r.acknowledged_at))}</div>`
              : '')
          : (acknowledged
              ? `<div class="ack-confirmed">รับทราบเมื่อ ${esc(fmtDateTimeThai(r.acknowledged_at))}</div>`
              : (hasNewPlan
                  ? `<div class="ack-final-confirm">
                      <b>ตรวจครบแล้วจึงกดรับทราบ</b>
                      <label class="ack-check">
                        <input type="checkbox" id="ackCheck_${esc(r.cycle_key)}">
                        <span>ข้าพเจ้าได้ตรวจตารางเวรจริง ตารางเบิก HR และวันที่ระบบเว้นแล้ว และรับทราบรายการของตนเอง</span>
                      </label>
                      <button class="primary-btn ack-submit-btn" type="button" data-ack-cycle="${esc(r.cycle_key)}">ยืนยันรับทราบ</button>
                    </div>`
                  : `<div class="owner-preview-note">ยังไม่สามารถรับทราบรอบนี้ได้ จนกว่าผู้ทำ OT จะบันทึกรอบใหม่ด้วยระบบเวอร์ชันล่าสุด</div>`))}
      </article>`;
    }).join('');
  }

  function ackRoundMonthLabel(row) {
    const d=parseIso(row?.cycle_end||'');
    if(!d || Number.isNaN(d.getTime())) return fmtThaiRange(row?.cycle_start||'',row?.cycle_end||'');
    return `${TH_MONTHS[d.getMonth()+1]} ${d.getFullYear()+543}`;
  }

  function ackRoundOptions(rows) {
    const seen=new Set();
    return (rows||[])
      .filter(r=>r?.cycle_key && r?.cycle_end)
      .slice()
      .sort((a,b)=>String(b.cycle_start||'').localeCompare(String(a.cycle_start||'')))
      .filter(r=>{
        if(seen.has(r.cycle_key)) return false;
        seen.add(r.cycle_key);
        return true;
      });
  }

  function setAckRoundSelect(select,rows,currentKey) {
    if(!select) return currentKey||'';
    const options=ackRoundOptions(rows);
    if(!options.length){
      select.innerHTML='<option value="">ยังไม่มีรอบ</option>';
      select.disabled=true;
      return '';
    }
    select.disabled=false;
    const valid=options.some(r=>r.cycle_key===currentKey);
    const key=valid?currentKey:options[0].cycle_key;
    select.innerHTML=options.map(r=>`<option value="${esc(r.cycle_key)}" ${r.cycle_key===key?'selected':''}>${esc(ackRoundMonthLabel(r))}</option>`).join('');
    return key;
  }

  function refreshAdminAckRoundFilter() {
    const all=[...(state.managerOwnAckRows||[]),...(state.ownerPreviewRows||[])];
    state.adminAckCycleKey=setAckRoundSelect($('adminAckCycleFilter'),all,state.adminAckCycleKey);
  }

  function renderManagerOwnAckFiltered() {
    const rows=(state.managerOwnAckRows||[]).filter(r=>!state.adminAckCycleKey || r.cycle_key===state.adminAckCycleKey);
    renderAckCards(rows,$('managerAckList'),$('myAckEmpty'));
  }

  function refreshStaffAckRoundFilter() {
    state.staffAckCycleKey=setAckRoundSelect($('staffAckCycleFilter'),state.staffOwnAckRows||[],state.staffAckCycleKey);
  }

  function renderStaffOwnAckFiltered() {
    const rows=(state.staffOwnAckRows||[]).filter(r=>!state.staffAckCycleKey || r.cycle_key===state.staffAckCycleKey);
    renderAckCards(rows,$('ackList'),$('ackEmpty'));
  }

  async function loadManagerOwnAck() {
    if(state.offline || !state.sb || !state.session?.user?.email || !normalizedUsers[String(state.session.user.email).toLowerCase()]) return;
    const email=String(state.session.user.email).toLowerCase();
    const {data,error}=await state.sb.from('ot_acknowledgements')
      .select('*').eq('email',email).order('cycle_start',{ascending:false});
    if(error){
      if($('myAckEmpty')){$('myAckEmpty').hidden=false;$('myAckEmpty').textContent='เปิดรายการรับทราบไม่ได้';}
      return;
    }
    state.managerOwnAckRows=data||[];
    refreshAdminAckRoundFilter();
    renderManagerOwnAckFiltered();
  }


  function canAdminPreviewAllStaff() {
    return state.actualRole==='admin';
  }

  async function loadOwnerStaffPreview() {
    const card=$('ownerStaffPreviewCard');
    const empty=$('ownerStaffPreviewEmpty');
    if(!card || !empty) return;

    if(!canAdminPreviewAllStaff()){
      card.hidden=true;
      return;
    }

    card.hidden=false;
    empty.hidden=false;
    empty.textContent='กำลังโหลดรายชื่อ…';

    try{
      const {data,error}=await state.sb
        .from('ot_acknowledgements')
        .select('*')
        .order('cycle_start',{ascending:false})
        .order('display_name',{ascending:true});
      if(error) throw error;

      state.ownerPreviewRows=data||[];
      refreshAdminAckRoundFilter();
      renderManagerOwnAckFiltered();
      renderOwnerStaffPreviewForCycle();
    }catch(err){
      console.error('load owner staff preview',err);
      empty.hidden=false;
      empty.textContent='เปิด OT ของเจ้าหน้าที่ไม่ได้';
      if($('ownerStaffPreviewList')) $('ownerStaffPreviewList').innerHTML='';
      if($('adminAckStaffFilter')) $('adminAckStaffFilter').innerHTML='<option value="">เปิดรายชื่อไม่ได้</option>';
    }
  }

  function renderOwnerStaffPreviewForCycle() {
    const select=$('adminAckStaffFilter');
    const empty=$('ownerStaffPreviewEmpty');
    const previewList=$('ownerStaffPreviewList');
    const previewEmpty=$('ownerStaffPreviewDetailEmpty');
    const title=$('ownerStaffPreviewTitle');
    if(!select||!empty||!previewList||!previewEmpty||!canAdminPreviewAllStaff()) return;

    const cycleRows=(state.ownerPreviewRows||[]).filter(r=>
      !state.adminAckCycleKey || r.cycle_key===state.adminAckCycleKey
    );

    if(!cycleRows.length){
      select.innerHTML='<option value="">ยังไม่มีเจ้าหน้าที่ในรอบนี้</option>';
      select.disabled=true;
      state.ownerPreviewStaffKey='';
      previewList.innerHTML='';
      previewEmpty.hidden=false;
      previewEmpty.textContent='รอบเดือนนี้ยังไม่มีรายการ OT';
      if(title) title.textContent='OT ของเจ้าหน้าที่';
      empty.hidden=false;
      empty.textContent='รอบเดือนนี้ยังไม่มีรายการ OT';
      return;
    }

    const byStaff=new Map();
    for(const row of cycleRows){
      const key=String(row.staff_key||row.email||row.display_name||'');
      if(!byStaff.has(key)) byStaff.set(key,[]);
      byStaff.get(key).push(row);
    }

    const staff=[...byStaff.entries()].map(([key,rows])=>({
      key,
      name:rows[0].display_name||'-',
      employeeCode:rows[0].employee_code||'',
      hours:Number(rows[0].ot_hours||0)
    })).sort((a,b)=>a.name.localeCompare(b.name,'th'));

    select.disabled=false;
    const valid=staff.some(s=>s.key===state.ownerPreviewStaffKey);
    const selected=valid?state.ownerPreviewStaffKey:'';
    if(!valid) state.ownerPreviewStaffKey='';

    select.innerHTML='<option value="">เลือกเจ้าหน้าที่</option>'+
      staff.map(s=>`<option value="${esc(s.key)}" ${s.key===selected?'selected':''}>${esc(s.name)}${s.employeeCode?` · ${esc(s.employeeCode)}`:''}</option>`).join('');

    // ไม่แสดงรายชื่อทั้งหมดและไม่ค้นหาอัตโนมัติ
    empty.hidden=false;
    empty.textContent='เลือกเจ้าหน้าที่ด้านบน แล้วกดค้นหา';

    if(!state.ownerPreviewStaffKey){
      previewList.innerHTML='';
      previewEmpty.hidden=false;
      previewEmpty.textContent='เลือกเจ้าหน้าที่ด้านบน แล้วกดค้นหา';
      if(title) title.textContent='OT ของเจ้าหน้าที่';
    }
  }

  function renderOwnerStaffPreviewDetail() {
    const list=$('ownerStaffPreviewList');
    const empty=$('ownerStaffPreviewDetailEmpty');
    const title=$('ownerStaffPreviewTitle');
    if(!list||!empty||!canAdminPreviewAllStaff()) return;

    const rows=(state.ownerPreviewRows||[]).filter(r=>
      (!state.adminAckCycleKey || r.cycle_key===state.adminAckCycleKey) &&
      String(r.staff_key||r.email||r.display_name||'')===String(state.ownerPreviewStaffKey||'')
    );

    if(!rows.length){
      list.innerHTML='';
      empty.hidden=false;
      empty.textContent='เลือกเจ้าหน้าที่ด้านบน แล้วกดค้นหา';
      if(title) title.textContent='OT ของเจ้าหน้าที่';
      return;
    }

    empty.hidden=true;
    if(title) title.textContent=`OT ของ ${rows[0].display_name||''}`;
    renderAckCards(rows,list,empty,{readOnly:true,showPerson:false});
  }

  /* ===========================
     USER MANAGEMENT — ADMIN
     =========================== */
  function normalizeEmployeeCode(value) {
    return String(value||'').replace(/\D/g,'');
  }


  async function invokeAdminUsers(action,payload={}) {
    const {data,error}=await state.sb.functions.invoke('admin-users',{body:{action,...payload}});
    if(error) throw error;
    if(data?.error) throw new Error(data.error);
    return data;
  }

  async function loadManagedUsers() {
    const table=$('managedUsersTable'), empty=$('managedUsersEmpty');
    if(!table||!empty||state.actualRole!=='admin'||!state.sb) return;
    empty.hidden=false; empty.textContent='กำลังโหลดรายชื่อ…'; table.innerHTML='';
    try{
      const data=await invokeAdminUsers('list');
      state.managedUsers=Array.isArray(data?.users)?data.users:[];
      if(!state.managedUsers.length){
        empty.textContent='ยังไม่มีบัญชีผู้ใช้งาน';
        return;
      }
      empty.hidden=true;
      table.innerHTML=`<thead><tr>
        <th>Username</th>
        <th>รหัสพนักงาน</th>
        <th>ชื่อ-สกุล</th>
        <th>ตำแหน่ง</th>
        <th>Role</th>
        <th>Active</th>
        <th>First Login</th>
        <th>Last Login</th>
        <th>จัดการ</th>
      </tr></thead><tbody>${state.managedUsers.map(u=>{
        const username=String(u.email||'').replace(/@mahidol\.ac\.th$/i,'');
        const locked=String(u.email||'').toLowerCase()==='parichat.ink@mahidol.ac.th';
        const first=u.mustChangePassword?'รอเปลี่ยนรหัส':'ตั้งรหัสแล้ว';
        const role=String(u.role||'staff').toLowerCase()==='admin'?'admin':'staff';
        return `<tr class="${locked?'protected-user-row':''}">
          <td><b>${esc(username)}</b><div class="subtle">${esc(u.email||'')}</div></td>
          <td><span class="employee-code-cell">${esc(u.employeeCode||'-')}</span></td>
          <td><input class="user-edit-input" type="text" data-user-name="${esc(u.id)}" value="${esc(u.displayName||'')}" ${locked?'disabled':''}></td>
          <td><input class="user-edit-input" type="text" data-user-position="${esc(u.id)}" value="${esc(u.position||'')}" placeholder="ตำแหน่ง" ${locked?'disabled':''}></td>
          <td>
            <select class="user-role-select" data-user-role="${esc(u.id)}" ${locked?'disabled':''}>
              <option value="staff" ${role==='staff'?'selected':''}>Staff</option>
              <option value="admin" ${role==='admin'?'selected':''}>Admin</option>
            </select>
          </td>
          <td class="user-active-cell">
            <label class="active-toggle">
              <input type="checkbox" data-user-active="${esc(u.id)}" ${u.active!==false?'checked':''} ${locked?'disabled':''}>
              <span>${u.active!==false?'Active':'Inactive'}</span>
            </label>
          </td>
          <td><span class="${u.mustChangePassword?'first-login-pending':'first-login-done'}">${esc(first)}</span></td>
          <td>${u.lastSignInAt?esc(fmtDateTimeThai(u.lastSignInAt)):'-'}</td>
          <td class="user-actions">
            ${locked
              ? `<span class="protected-badge">บัญชีหลัก</span>`
              : `<button class="secondary-btn compact" type="button" data-save-user="${esc(u.id)}">บันทึก</button>
                 <button class="secondary-btn compact" type="button" data-reset-user="${esc(u.id)}" data-reset-email="${esc(u.email)}">Reset password</button>`}
          </td>
        </tr>`;
      }).join('')}</tbody>`;
    }catch(err){
      console.error('load users',err);
      empty.hidden=false;
      empty.textContent='ยังเปิดรายชื่อผู้ใช้งานไม่ได้';
    }
  }

  async function createManagedUser(e) {
    e.preventDefault();
    if(state.actualRole!=='admin') return toast('ใช้ได้เฉพาะ Admin');

    const displayName=String($('newUserDisplayName')?.value||'').trim();
    const employeeCode=normalizeEmployeeCode($('newUserEmployeeCode')?.value);
    const staffKey=employeeCode ? `emp:${employeeCode}` : '';
    const username=String($('newUserUsername')?.value||'').trim().toLowerCase().replace(/@mahidol\.ac\.th$/i,'');
    const position=String($('newUserPosition')?.value||'').trim();
    const password=String($('newUserPassword')?.value||'');
    const err=$('newUserError');

    if(err){err.hidden=true;err.textContent='';}
    const fail=msg=>{if(err){err.textContent=msg;err.hidden=false;}};

    if(!displayName) return fail('กรุณาระบุชื่อ-สกุล');
    if(!/^\d{7}$/.test(employeeCode)) return fail('รหัสพนักงานต้องเป็นตัวเลข 7 หลัก');

    const duplicateCode=(state.managedUsers||[]).find(
      u=>String(u.employeeCode||'')===employeeCode
    );
    if(duplicateCode) return fail(`รหัสพนักงาน ${employeeCode} มีบัญชีอยู่แล้ว`);

    if(!/^[a-z0-9._-]+$/.test(username)) return fail('Mahidol ID ไม่ถูกต้อง');
    if(password.length<8) return fail('รหัสผ่านชั่วคราวต้องมีอย่างน้อย 8 ตัวอักษร');

    const btn=$('createUserBtn');
    if(btn){btn.disabled=true;btn.textContent='กำลังสร้าง…';}
    try{
      await invokeAdminUsers('create',{
        staffKey,employeeCode,displayName,position,username,password,
        role:String($('newUserRole')?.value||'staff'),
        active:!!$('newUserActive')?.checked
      });
      $('newUserForm')?.reset();
      if($('newUserActive')) $('newUserActive').checked=true;
      if($('newUserRole')) $('newUserRole').value='staff';
        toast('สร้างบัญชีแล้ว');
      await Promise.all([loadManagedUsers(),loadAckManagerData()]);
    }catch(ex){
      console.error('create user',ex);
      fail(ex.message||'สร้างบัญชีไม่สำเร็จ');
    }finally{
      if(btn){btn.disabled=false;btn.textContent='สร้างบัญชี';}
    }
  }


  async function saveManagedUser(userId) {
    const user=state.managedUsers.find(x=>x.id===userId);
    if(!user) return;

    if(String(user.email||'').toLowerCase()==='parichat.ink@mahidol.ac.th'){
      return toast('บัญชี parichat.ink ถูกล็อก ไม่อนุญาตให้แก้ไข');
    }

    const displayName=String(document.querySelector(`[data-user-name="${CSS.escape(userId)}"]`)?.value||'').trim();
    const position=String(document.querySelector(`[data-user-position="${CSS.escape(userId)}"]`)?.value||'').trim();
    const role=String(document.querySelector(`[data-user-role="${CSS.escape(userId)}"]`)?.value||'staff');
    const active=!!document.querySelector(`[data-user-active="${CSS.escape(userId)}"]`)?.checked;

    if(!displayName) return toast('กรุณาระบุชื่อ-สกุล');

    try{
      await invokeAdminUsers('update',{userId,displayName,position,role,active});
      toast('บันทึกผู้ใช้งานแล้ว');
      const ownEmail=String(state.session?.user?.email||'').toLowerCase();
      const targetEmail=String(user.email||'').toLowerCase();
      await Promise.all([loadManagedUsers(),loadAckManagerData()]);
      if(targetEmail===ownEmail){
        if(!active) return logout();
        state.actualRole=role==='admin'?'admin':'staff';
        applyViewRole(state.actualRole,{persist:false});
      }
    }catch(err){
      console.error('save managed user',err);
      toast(err?.message||'บันทึกผู้ใช้งานไม่สำเร็จ');
    }
  }

  function openResetUserPassword(userId,email) {
    if(String(email||'').toLowerCase()==='parichat.ink@mahidol.ac.th'){
      return toast('บัญชี parichat.ink ถูกล็อก ไม่อนุญาตให้ Reset password จากหน้านี้');
    }
    state.resetUser={id:userId,email};
    const modal=$('adminResetPasswordModal'), label=$('resetUserEmail');
    if(label) label.textContent=email||'';
    $('adminResetPasswordForm')?.reset();
    if($('adminResetPasswordError')){$('adminResetPasswordError').hidden=true;$('adminResetPasswordError').textContent='';}
    if(modal) modal.hidden=false;
    setTimeout(()=>$('adminTempPassword')?.focus(),40);
  }

  function closeResetUserPassword() {
    state.resetUser=null;
    if($('adminResetPasswordModal')) $('adminResetPasswordModal').hidden=true;
    $('adminResetPasswordForm')?.reset();
  }

  async function resetManagedUserPassword(e) {
    e.preventDefault();
    if(!state.resetUser) return;
    const password=String($('adminTempPassword')?.value||'');
    const confirm=String($('adminTempPasswordConfirm')?.value||'');
    const err=$('adminResetPasswordError');
    if(err){err.hidden=true;err.textContent='';}
    const fail=msg=>{if(err){err.textContent=msg;err.hidden=false;}};
    if(password.length<8) return fail('รหัสผ่านชั่วคราวต้องมีอย่างน้อย 8 ตัวอักษร');
    if(password!==confirm) return fail('ยืนยันรหัสผ่านไม่ตรงกัน');
    const btn=$('adminResetPasswordSaveBtn');
    if(btn){btn.disabled=true;btn.textContent='กำลังบันทึก…';}
    try{
      await invokeAdminUsers('reset',{userId:state.resetUser.id,password});
      toast('Reset password แล้ว');
      closeResetUserPassword();
      await loadManagedUsers();
    }catch(ex){
      console.error('reset user',ex);
      fail(ex.message||'Reset password ไม่สำเร็จ');
    }finally{
      if(btn){btn.disabled=false;btn.textContent='บันทึกรหัสชั่วคราว';}
    }
  }

  function bindUI() {
    $('loginForm').addEventListener('submit', login);
    $('installAppBtn')?.addEventListener('click', installApp);
    $('ackInstallAppBtn')?.addEventListener('click', installApp);
    $('adminRoleSwitch')?.addEventListener('change',e=>applyViewRole(e.target.value));
    $('ackRoleSwitch')?.addEventListener('change',e=>applyViewRole(e.target.value));
    document.querySelectorAll('.staff-tab').forEach(btn=>btn.addEventListener('click',()=>switchStaffTab(btn.dataset.staffTab)));
    $('refreshAdminLogBtn')?.addEventListener('click',()=>loadAppLogs('admin'));
    $('refreshStaffLogBtn')?.addEventListener('click',()=>loadAppLogs('staff'));
    document.querySelectorAll('.result-tab').forEach(btn=>btn.addEventListener('click',()=>switchResultTab(btn.dataset.resultTab)));
    $('resultArea')?.addEventListener('click',e=>{
      const btn=e.target.closest('[data-result-page]');
      if(btn && !btn.disabled) changeResultPage(btn.dataset.resultPage,Number(btn.dataset.page||1));
    });
    $('summarySearchInput')?.addEventListener('input',e=>{
      state.summarySearch=e.target.value;
      state.summaryPage=1;
      renderSummary(state.summaryRows);
    });
    $('clearSummarySearchBtn')?.addEventListener('click',()=>{
      state.summarySearch='';
      state.summaryPage=1;
      if($('summarySearchInput')) $('summarySearchInput').value='';
      renderSummary(state.summaryRows);
    });
    $('ackSearchInput')?.addEventListener('input',e=>{
      captureAckDrafts();
      state.ackSearch=e.target.value;
      state.ackPage=1;
      renderAckManager();
    });
    $('clearAckSearchBtn')?.addEventListener('click',()=>{
      captureAckDrafts();
      state.ackSearch='';
      state.ackPage=1;
      if($('ackSearchInput')) $('ackSearchInput').value='';
      renderAckManager();
    });
    $('ackManagerTable')?.addEventListener('input',e=>{
      const input=e.target.closest('[data-ack-email]');
      if(input) state.ackEmailDrafts[input.dataset.ackEmail]=input.value;
    });
    $('ackLogoutBtn')?.addEventListener('click', logout);
    $('ackChangePasswordBtn')?.addEventListener('click', openPasswordModal);
    $('saveAckEmailsBtn')?.addEventListener('click', saveAckMappings);
    $('exportAckEvidenceBtn')?.addEventListener('click', exportAckEvidence);
    $('refreshAckBtn')?.addEventListener('click', loadAckManagerData);
    $('newUserEmployeeCode')?.addEventListener('input',e=>{
      e.target.value=String(e.target.value||'').replace(/\D/g,'').slice(0,7);
    });
    $('newUserForm')?.addEventListener('submit', createManagedUser);
    $('reloadManagedUsersBtn')?.addEventListener('click', loadManagedUsers);
    $('managedUsersTable')?.addEventListener('click', e=>{
      const save=e.target.closest('[data-save-user]');
      if(save){ saveManagedUser(save.dataset.saveUser); return; }
      const reset=e.target.closest('[data-reset-user]');
      if(reset) openResetUserPassword(reset.dataset.resetUser,reset.dataset.resetEmail);
    });
    $('managedUsersTable')?.addEventListener('change', e=>{
      const active=e.target.closest('[data-user-active]');
      if(active){
        const label=active.closest('.active-toggle')?.querySelector('span');
        if(label) label.textContent=active.checked?'Active':'Inactive';
      }
    });
    $('adminResetPasswordForm')?.addEventListener('submit', resetManagedUserPassword);
    $('adminResetPasswordCancelBtn')?.addEventListener('click', closeResetUserPassword);
    $('adminResetPasswordCloseBtn')?.addEventListener('click', closeResetUserPassword);
    $('adminResetPasswordModal')?.addEventListener('click',e=>{if(e.target===$('adminResetPasswordModal'))closeResetUserPassword();});
    $('searchAdminAckStaffBtn')?.addEventListener('click',()=>{
      const select=$('adminAckStaffFilter');
      const key=String(select?.value||'');
      if(!key){
        toast('กรุณาเลือกเจ้าหน้าที่');
        return;
      }
      state.ownerPreviewStaffKey=key;
      renderOwnerStaffPreviewDetail();
      if($('ownerStaffPreviewEmpty')) $('ownerStaffPreviewEmpty').hidden=true;
      setTimeout(()=>{
        $('ownerStaffPreviewDetail')?.scrollIntoView({behavior:'smooth',block:'start'});
      },30);
    });
    $('clearAdminAckStaffBtn')?.addEventListener('click',()=>{
      state.ownerPreviewStaffKey='';
      if($('adminAckStaffFilter')) $('adminAckStaffFilter').value='';
      if($('ownerStaffPreviewList')) $('ownerStaffPreviewList').innerHTML='';
      if($('ownerStaffPreviewTitle')) $('ownerStaffPreviewTitle').textContent='OT ของเจ้าหน้าที่';
      if($('ownerStaffPreviewDetailEmpty')){
        $('ownerStaffPreviewDetailEmpty').hidden=false;
        $('ownerStaffPreviewDetailEmpty').textContent='เลือกเจ้าหน้าที่ด้านบน แล้วกดค้นหา';
      }
      if($('ownerStaffPreviewEmpty')){
        $('ownerStaffPreviewEmpty').hidden=false;
        $('ownerStaffPreviewEmpty').textContent='เลือกเจ้าหน้าที่ด้านบน แล้วกดค้นหา';
      }
    });
    $('refreshOwnerPreviewBtn')?.addEventListener('click',loadOwnerStaffPreview);
    $('adminAckCycleFilter')?.addEventListener('change',e=>{
      state.adminAckCycleKey=e.target.value;
      state.ownerPreviewStaffKey='';
      renderManagerOwnAckFiltered();
      renderOwnerStaffPreviewForCycle();
    });
    $('staffAckCycleFilter')?.addEventListener('change',e=>{ state.staffAckCycleKey=e.target.value; renderStaffOwnAckFiltered(); });
    $('managerAckList')?.addEventListener('click', e=>{
      const btn=e.target.closest('[data-ack-cycle]');
      if(btn) acknowledgeOwnCycle(btn.dataset.ackCycle);
    });
    $('ackList')?.addEventListener('click', e => {
      const btn=e.target.closest('[data-ack-cycle]');
      if(btn) acknowledgeOwnCycle(btn.dataset.ackCycle);
    });
    $('logoutBtn').addEventListener('click', logout);
    $('changePasswordBtn')?.addEventListener('click', openPasswordModal);
    $('closePasswordModalBtn')?.addEventListener('click', closePasswordModal);
    $('cancelPasswordBtn')?.addEventListener('click', closePasswordModal);
    $('passwordChangeForm')?.addEventListener('submit', changeOwnPassword);
    $('passwordModal')?.addEventListener('click', e => {
      if (e.target === $('passwordModal') && !state.forcePasswordChange) closePasswordModal();
    });
    $('viewModeBtn')?.addEventListener('click', e => { e.stopPropagation(); toggleViewModeMenu(); });
    $('viewModeMenu')?.addEventListener('click', e => {
      const option = e.target.closest('[data-view-role]');
      if (!option) return;
      applyViewRole(option.dataset.viewRole);
    });
    document.addEventListener('click', e => {
      if (!$('viewModeWrap')?.contains(e.target)) {
        if ($('viewModeMenu')) $('viewModeMenu').hidden = true;
        $('viewModeBtn')?.setAttribute('aria-expanded','false');
      }
    });
    $('emailInput')?.addEventListener('blur', e => {
      const v = String(e.target.value || '').trim();
      e.target.value = v.replace(/@mahidol\.ac\.th$/i, '');
    });
    $('offlineDemoBtn').addEventListener('click', enterOffline);
    $('cycleMonth').addEventListener('change', onCycleChange);
    $('cycleYear').addEventListener('change', onCycleChange);
    $('currentCycleBtn').addEventListener('click', () => { const c=getCurrentCycle(); const d=parseIso(c.end); $('cycleMonth').value=String(d.getMonth()+1); $('cycleYear').value=String(d.getFullYear()+543); onCycleChange(); });
    $('labFile').addEventListener('change', e => onUnitFile('LAB', e.target.files?.[0]));
    $('molecFile').addEventListener('change', e => onUnitFile('Molec', e.target.files?.[0]));
    $('bacteriaFile').addEventListener('change', e => onUnitFile('Bacteria', e.target.files?.[0]));
    $('syncCalendarBtn').addEventListener('click', syncCalendar);
    $('exportBtn').addEventListener('click', exportWorkbook);
    $('exportBtn').textContent = 'Export HR Excel';
    $('saveBtn').addEventListener('click', saveCycle);
    $('refreshHistoryBtn').addEventListener('click', loadHistory);
    $('addSpecial328DateBtn')?.addEventListener('click', addSpecial328DateFromPicker);
    $('saveSpecial328DatesBtn')?.addEventListener('click', saveSpecial328Dates);
    $('special328DatePicker')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSpecial328DateFromPicker(); } });
    $('special328EligibilityTable')?.addEventListener('change', e => {
      const cb = e.target.closest('[data-special328-code]');
      if (!cb) return;
      state.special328Selected[cb.dataset.special328Code] = !!cb.checked;
      renderSpecial328Eligibility();
    });

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
    if (name === 'users') loadManagedUsers();
    if (name === 'myack') { loadManagerOwnAck(); if(canAdminPreviewAllStaff()) loadOwnerStaffPreview(); }
    if (name === 'log') loadAppLogs('admin');
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
      state.calendarSources = []; state.leaveEvents = []; state.calendarSyncedAt = null; state.snapshotAt = null; state.loadedSnapshot = false; state.hrExport = null;
      state.summaryPage=1; state.ackPage=1; state.conflictPage=1; state.leavePage=1; state.ackEmailDrafts={};
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


  const RESULT_PAGE_SIZE = 10;

  function switchResultTab(name) {
    state.resultTab=name||'summary';
    document.querySelectorAll('.result-tab').forEach(btn=>{
      const active=btn.dataset.resultTab===state.resultTab;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-selected',active?'true':'false');
    });
    document.querySelectorAll('.result-panel').forEach(panel=>{
      panel.classList.toggle('active',panel.id===`result-panel-${state.resultTab}`);
    });
    if(state.resultTab==='ack') renderAckManager();
    if(state.resultTab==='leave'){ renderConflicts(); renderAllLeaves(); }
    if(state.resultTab==='validation') renderValidation();
  }

  function pageSlice(rows,page,size=RESULT_PAGE_SIZE){
    const total=Math.max(0,rows.length);
    const pages=Math.max(1,Math.ceil(total/size));
    const safe=Math.min(Math.max(1,Number(page)||1),pages);
    return {page:safe,pages,total,rows:rows.slice((safe-1)*size,safe*size)};
  }

  function renderPager(id,kind,page,pages,total){
    const el=$(id);
    if(!el) return;
    if(total<=RESULT_PAGE_SIZE){el.innerHTML='';return;}
    el.innerHTML=`<button class="secondary-btn compact" type="button" data-result-page="${esc(kind)}" data-page="${page-1}" ${page<=1?'disabled':''}>ก่อนหน้า</button>
      <span>หน้า ${page} / ${pages} · ${total} รายการ</span>
      <button class="secondary-btn compact" type="button" data-result-page="${esc(kind)}" data-page="${page+1}" ${page>=pages?'disabled':''}>ถัดไป</button>`;
  }

  function changeResultPage(kind,page){
    if(kind==='summary'){state.summaryPage=page;renderSummary(state.summaryRows);}
    if(kind==='ack'){captureAckDrafts();state.ackPage=page;renderAckManager();}
    if(kind==='conflict'){state.conflictPage=page;renderConflicts();}
    if(kind==='leave'){state.leavePage=page;renderAllLeaves();}
  }

  function captureAckDrafts(){
    document.querySelectorAll('[data-ack-email]').forEach(input=>{
      state.ackEmailDrafts[input.dataset.ackEmail]=input.value;
    });
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
    state.summaryRows=summary;
    state.conflicts = computeConflicts(assignments, state.leaveEvents);
    $('staffMetric').textContent = summary.length.toLocaleString('th-TH');
    $('assignmentMetric').textContent = assignments.length.toLocaleString('th-TH');
    $('hoursMetric').textContent = `${assignments.reduce((s,x)=>s+x.hours,0).toLocaleString('th-TH')} ชม.`;
    $('conflictMetric').textContent = state.conflicts.length.toLocaleString('th-TH');
    if($('resultLeaveBadge')) $('resultLeaveBadge').textContent=String(state.conflicts.length);
    renderValidation(); renderSummary(summary); renderUnitSummary(unitSummary); renderConflicts(); renderAllLeaves(); renderSpecial328Eligibility(); renderAckManager();
    $('exportBtn').disabled = !unitsReady();
    $('saveBtn').disabled = state.offline || !unitsReady() || !state.calendarSyncedAt;
  }

  function renderValidation() {
    const items = [];
    for (const unit of UNITS) if (state.units[unit]) items.push(...state.units[unit].validation);
    if (unitsReady()) items.unshift({type:'ok',text:'ไฟล์ครบทั้ง 3 หน่วยแล้ว'});
    else items.unshift({type:'warn',text:'ต้องอัป LAB + Molec + Bacteria ให้ครบก่อนยืนยันรอบ'});
    if (state.calendarSyncedAt) items.push({type:'ok',text:`วันลาที่ดึงล่าสุด ${fmtDateTimeThai(state.calendarSyncedAt)} · ${state.leaveEvents.length} รายการในช่วงรอบ`});
    else items.push({type:'warn',text:'ยังไม่ได้ดึงวันลาล่าสุด'});

    const warnings=items.filter(x=>x.type!=='ok').length;
    const assignments=allAssignments();
    const quick=[];
    quick.push(`<span class="quick-chip ${unitsReady()?'ok':'warn'}">${unitsReady()?'✓ ไฟล์ครบ 3 หน่วย':'ไฟล์ยังไม่ครบ'}</span>`);
    if(assignments.length) quick.push(`<span class="quick-chip ok">✓ อ่าน ${assignments.length.toLocaleString('th-TH')} รายการ</span>`);
    quick.push(`<span class="quick-chip ${state.calendarSyncedAt?'ok':'warn'}">${state.calendarSyncedAt?`✓ วันลา ${state.leaveEvents.length.toLocaleString('th-TH')} รายการ`:'ยังไม่ได้ดึงวันลา'}</span>`);
    quick.push(`<span class="quick-chip ${warnings?'warn':'ok'}">${warnings?`มี ${warnings} จุดให้ตรวจ`:'✓ ไม่พบคำเตือน'}</span>`);

    if($('validationQuick')) $('validationQuick').innerHTML=quick.join('');
    $('validationList').innerHTML = items.map(x=>`<div class="validation-item ${x.type}">${esc(x.text)}</div>`).join('');
  }

  function renderSummary(rows) {
    state.summaryRows=rows||state.summaryRows||[];
    const q=normSearch(state.summarySearch||'');
    const filtered=q ? state.summaryRows.filter(r=>normSearch(r.name).includes(q)) : state.summaryRows;
    const pg=pageSlice(filtered,state.summaryPage);
    state.summaryPage=pg.page;

    if($('summaryResultMeta')) $('summaryResultMeta').textContent=`แสดง ${pg.rows.length} จาก ${pg.total} คน`;
    $('summaryTable').innerHTML = `<thead><tr><th>ชื่อ</th><th class="num">LAB</th><th class="num">Molec</th><th class="num">Bacteria</th><th class="num">รวมชั่วโมง</th><th class="num">ช่วง 8 ชม.</th><th class="num">รายการเวร</th></tr></thead><tbody>${pg.rows.map(r=>`<tr><td><b>${esc(r.name)}</b></td><td class="num">${r.LAB||'-'}</td><td class="num">${r.Molec||'-'}</td><td class="num">${r.Bacteria||'-'}</td><td class="num"><b>${r.hours}</b></td><td class="num">${round1(r.hours/8)}</td><td class="num">${r.count}</td></tr>`).join('')}</tbody>`;
    renderPager('summaryPager','summary',pg.page,pg.pages,pg.total);
  }

  function renderUnitSummary(rows) {
    $('unitSummaryTable').innerHTML = `<thead><tr><th>หน่วย</th><th class="num">จำนวนคน</th><th class="num">รายการเวร</th><th class="num">OT รวม</th><th class="num">ช่วง 8 ชม.</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.unit)}</b></td><td class="num">${r.staff}</td><td class="num">${r.count}</td><td class="num"><b>${r.hours}</b></td><td class="num">${round1(r.hours/8)}</td></tr>`).join('')}</tbody>`;
  }

  function renderConflicts() {
    if (!state.calendarSyncedAt) {
      $('conflictEmpty').textContent='ยังไม่ได้ดึงวันลา'; $('conflictEmpty').hidden=false; $('conflictTable').innerHTML=''; renderPager('conflictPager','conflict',1,1,0); return;
    }
    if (!state.conflicts.length) {
      $('conflictEmpty').textContent='ไม่พบเวรที่ตรงกับวันลา'; $('conflictEmpty').hidden=false; $('conflictTable').innerHTML=''; renderPager('conflictPager','conflict',1,1,0); return;
    }
    $('conflictEmpty').hidden=true;
    const pg=pageSlice(state.conflicts,state.conflictPage);
    state.conflictPage=pg.page;
    $('conflictTable').innerHTML=`<thead><tr><th>วันที่ OT</th><th>ชื่อ</th><th>หน่วย</th><th>เวร</th><th>เวลา</th><th class="num">ชม.</th><th>Calendar</th><th>รายการใน Calendar</th></tr></thead><tbody>${pg.rows.map(x=>`<tr><td>${esc(fmtThaiDate(x.date))}</td><td><b>${esc(x.name)}</b></td><td>${esc(x.unit)}</td><td>${esc(x.duty)}</td><td>${esc(x.timeLabel)}</td><td class="num">${x.hours}</td><td>${esc(x.calendar)}</td><td>${esc(x.summary)}</td></tr>`).join('')}</tbody>`;
    renderPager('conflictPager','conflict',pg.page,pg.pages,pg.total);
  }


  function renderAllLeaves() {
    const badge=$('leaveCountBadge'), sourceSummary=$('leaveSourceSummary');
    const empty=$('allLeaveEmpty'), table=$('allLeaveTable');
    if (!badge || !sourceSummary || !empty || !table) return;

    const events=[...(state.leaveEvents||[])].filter(ev=>ev.start&&ev.end)
      .sort((a,b)=>String(a.start).localeCompare(String(b.start))||String(a.summary||'').localeCompare(String(b.summary||''),'th'));

    badge.textContent=events.length.toLocaleString('th-TH');

    const sourceCounts=new Map();
    events.forEach(ev=>{
      const key=String(ev.source||'Calendar');
      sourceCounts.set(key,(sourceCounts.get(key)||0)+1);
    });
    sourceSummary.textContent=events.length
      ? [...sourceCounts.entries()].map(([name,count])=>`${name} ${count}`).join(' · ')
      : '';

    if (!state.calendarSyncedAt) {
      empty.hidden=false; empty.textContent='ยังไม่ได้ดึงวันลา'; table.innerHTML=''; renderPager('leavePager','leave',1,1,0); return;
    }
    if (!events.length) {
      empty.hidden=false; empty.textContent='ไม่พบวันลาในรอบนี้'; table.innerHTML=''; renderPager('leavePager','leave',1,1,0); return;
    }

    const conflictCountForEvent=(ev)=>{
      return (state.conflicts||[]).filter(c=>{
        if (ev.uid && c.uid) return c.uid===ev.uid && c.calendar===ev.source;
        return c.calendar===ev.source && c.leaveStart===ev.start && c.leaveEnd===ev.end && c.summary===ev.summary;
      }).length;
    };
    const leaveRange=(ev)=> ev.start===ev.end ? fmtThaiDate(ev.start) : `${fmtThaiDate(ev.start)} – ${fmtThaiDate(ev.end)}`;

    const pg=pageSlice(events,state.leavePage);
    state.leavePage=pg.page;
    empty.hidden=true;
    table.innerHTML=`<thead><tr><th>วันลา</th><th>รายการ</th><th>Calendar</th><th>ตรวจเทียบเวร</th></tr></thead><tbody>${pg.rows.map(ev=>{
      const hits=conflictCountForEvent(ev);
      return `<tr>
        <td><b>${esc(leaveRange(ev))}</b></td>
        <td>${esc(ev.summary||'-')}</td>
        <td>${esc(ev.source||'-')}</td>
        <td>${hits
          ? `<span class="leave-match warn">ตรงกับเวร ${hits} รายการ</span>`
          : `<span class="leave-match ok">ไม่ตรงกับเวร</span>`}</td>
      </tr>`;
    }).join('')}</tbody>`;
    renderPager('leavePager','leave',pg.page,pg.pages,pg.total);
  }

  async function syncCalendar() {
    if (!unitsReady()) return toast('กรุณาอัปตารางเวรให้ครบ 3 หน่วยก่อน');
    if (state.offline || !state.sb) return toast('โหมดทดลองไม่เชื่อม Calendar');
    $('syncCalendarBtn').disabled=true; $('calendarStatus').className='file-status'; $('calendarStatus').textContent='กำลังดึงวันลาล่าสุด…';
    try {
      const { data, error } = await state.sb.functions.invoke('calendar-sync', { body:{ cycle_start:state.cycle.start, cycle_end:state.cycle.end } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'ดึงวันลาไม่สำเร็จ');
      state.calendarSources = data.sources || [];
      state.leaveEvents = state.calendarSources.flatMap(src => (src.events||[]).map(ev => ({...ev, source:src.name}))).filter(ev => ev.start && ev.end);
      state.calendarSyncedAt = data.synced_at || new Date().toISOString(); state.loadedSnapshot=false; state.hrExport=null;
      $('calendarStatus').className='file-status ok'; $('calendarStatus').textContent=`✓ ดึงวันลาแล้ว ${state.leaveEvents.length} รายการ`;
      $('calendarSyncMeta').hidden=false;
      $('calendarSyncMeta').innerHTML=`<b>อัปเดต:</b> ${esc(fmtDateTimeThai(state.calendarSyncedAt))}`;
      recompute(); toast('ดึงวันลาล่าสุดแล้ว');
      await writeAppLog('calendar_sync','ดึงวันลา',`${state.leaveEvents.length} รายการ`,'',currentCycleKey());
    } catch (err) {
      console.error(err); $('calendarStatus').className='file-status error'; $('calendarStatus').textContent=`ดึงวันลาไม่สำเร็จ: ${err.message || err}`; toast('ดึงวันลาไม่สำเร็จ');
    } finally { $('syncCalendarBtn').disabled = state.offline || !unitsReady(); }
  }



  /* ===========================
     SPECIAL MT RATE DATES
     - Default: 130 THB/h every day.
     - 160 THB/h only on dates explicitly announced by the unit
       (typically New Year / Songkran), configured by Admin.
     - Excel "*" NEVER implies 160; it only affects roster hours.
     =========================== */

  /* ===========================
     OT ACKNOWLEDGEMENT
     =========================== */
  function staffIdentity(name) {
    const hr = typeof hrStaff === 'function' ? hrStaff(name) : null;
    const employeeCode = hr?.employeeCode || '';
    const staffKey = employeeCode ? `emp:${employeeCode}` : `name:${normName(name)}`;
    return {
      staffKey,
      employeeCode,
      displayName: hr?.fullName || String(name || '').trim(),
      shortName: String(name || '').trim()
    };
  }

  function ackEmailValue(v) {
    const raw=String(v||'').trim().toLowerCase();
    if (!raw) return '';
    return normalizeMahidolEmail(raw);
  }

  function currentCycleKey() {
    return `${state.cycle.start}_${state.cycle.end}`;
  }

  function ackManagerSummary() {
    return buildSummary(allAssignments()).map(r => ({ ...r, identity:staffIdentity(r.name) }));
  }

  async function buildAckHrPlan() {
    const assignments=allAssignments()
      .slice()
      .sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'th')||a.unit.localeCompare(b.unit));

    const holidaySet=hrHolidayDates(assignments);
    const carryInfo=await hrCarryInInfo();
    const totals=hrBuildTotals(assignments,carryInfo);

    const specialEligibility=buildSpecial328Eligibility(assignments);
    const special328=hrAllocateSpecial328(specialEligibility);
    const allocation=hrAllocate(totals,holidaySet,special328.rows);

    const byCode=new Map();
    for(const t of totals){
      byCode.set(t.employeeCode,{
        total:t,
        normalClaims:allocation.rows.filter(x=>x.employeeCode===t.employeeCode),
        specialClaims:special328.rows.filter(x=>x.employeeCode===t.employeeCode),
        leaveDates:allocation.leaveSkipped.filter(x=>x.employeeCode===t.employeeCode).map(x=>x.date),
        specialFailure:special328.failures.find(x=>String(x).startsWith(`${t.nick}:`))||''
      });
    }
    return {assignments,holidaySet,carryInfo,totals,special328,allocation,byCode};
  }

  function ackDetailFor(summaryRow,hrPlan=null) {
    const key=normName(summaryRow.name);
    const assignments=allAssignments()
      .filter(a=>normName(a.name)===key)
      .sort((a,b)=>a.date.localeCompare(b.date)||a.unit.localeCompare(b.unit)||a.duty.localeCompare(b.duty))
      .map(a=>({
        date:a.date,unit:a.unit,duty:a.duty,time:a.timeLabel,hours:a.hours
      }));

    const employeeCode=summaryRow.identity.employeeCode;
    const p=hrPlan?.byCode?.get(employeeCode)||null;
    const t=p?.total||null;

    const normalClaims=(p?.normalClaims||[]).map(x=>({
      date:x.date,start:x.start,end:x.end,hours:8,
      claimCode:x.claimCode,
      claimKind:x.type===2?'OT วันหยุด':'OT ปกติ'
    }));
    const specialClaims=(p?.specialClaims||[]).map(x=>({
      date:x.date,start:x.start,end:x.end,hours:8,
      claimCode:x.claimCode,
      claimKind:'00000328',
      sourceDate:x.sourceDate||'',
      sourceUnit:x.sourceUnit||'',
      sourceDuty:x.sourceDuty||'',
      sourceTime:x.sourceTime||''
    }));
    const hrClaims=[...normalClaims,...specialClaims]
      .sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.claimCode.localeCompare(b.claimCode));

    const leaveDates=[...new Set(p?.leaveDates||[])].sort();
    const leaveSet=new Set(leaveDates);
    const claimDateSet=new Set(hrClaims.map(x=>x.date));
    const skippedDates=hrDateList(state.cycle.start,state.cycle.end)
      .filter(d=>!claimDateSet.has(d) && !leaveSet.has(d));
    const leaveConflictDates=[...new Set(hrClaims.filter(x=>leaveSet.has(x.date)).map(x=>x.date))].sort();

    const normalClaimHours=normalClaims.length*8;
    const specialCount=specialClaims.length;
    const carryIn=Number(t?.carryIn||0);
    const carryOut=Number(t?.carry||0);
    const totalForHr=Number(t?.total ?? summaryRow.hours ?? 0);
    const claimedHours=Number(t?.claimed ?? normalClaimHours);
    const balanceOk=Math.abs(totalForHr-(claimedHours+carryOut))<0.01;
    const unallocatedUnits=Number(t?.unallocatedUnits||0);
    const specialFailure=String(p?.specialFailure||'');
    const verifyIssues=[];
    if(!balanceOk) verifyIssues.push('ยอดชั่วโมงยังไม่สมดุล');
    if(unallocatedUnits>0) verifyIssues.push(`ยังมี ${unallocatedUnits*8} ชม. ที่จัดลงตาราง HR ไม่ได้`);
    if(leaveConflictDates.length) verifyIssues.push('มีรายการเบิก HR ตรงกับวันลา');
    if(specialFailure) verifyIssues.push('สิทธิ์ 00000328 ยังจัดไม่ครบ');

    return {
      cycle:{start:state.cycle.start,end:state.cycle.end},
      name:summaryRow.identity.displayName,
      employeeCode,
      unitHours:{LAB:summaryRow.LAB||0,Molec:summaryRow.Molec||0,Bacteria:summaryRow.Bacteria||0},
      totalHours:summaryRow.hours||0,
      assignmentCount:summaryRow.count||0,
      assignments,

      hrPlan:{
        normalClaims,
        specialClaims,
        claims:hrClaims,
        normalClaimHours,
        special328Count:specialCount,
        special328Amount:specialCount*240,
        carryIn,
        carryOut,
        totalForHr,
        claimedHours,
        leaveDates,
        skippedDates,
        leaveConflictDates,
        unallocatedUnits,
        specialFailure,
        balanceOk,
        verifyOk:verifyIssues.length===0,
        verifyIssues
      },

      // compatibility with old UI/export
      special328Count:specialCount,
      special328Amount:specialCount*240
    };
  }

  async function sha256Hex(value) {
    const bytes=new TextEncoder().encode(String(value));
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  async function loadAckManagerData() {
    if (state.offline || !state.sb || !['admin','staff'].includes(state.actualRole)) return;
    state.ackDbReady=true;
    try {
      const cycleKey=currentCycleKey();
      const [{data:people,error:peopleError},{data:rows,error:rowsError}] = await Promise.all([
        state.sb.from('ot_ack_people').select('staff_key,employee_code,display_name,email,active,updated_at').eq('active',true),
        state.sb.from('ot_acknowledgements').select('*').eq('cycle_key',cycleKey)
      ]);
      if (peopleError) throw peopleError;
      if (rowsError) throw rowsError;

      state.ackPeople=Object.fromEntries((people||[]).map(p=>[p.staff_key,p]));
      state.ackRows=rows||[];
      renderAckManager();
    } catch(err) {
      console.warn('load acknowledgement manager data',err);
      state.ackDbReady=false;
      state.ackPeople={};
      state.ackRows=[];
      renderAckManager();
    }
  }

  function renderAckManager() {
    const card=$('ackManagerCard'), table=$('ackManagerTable'), badge=$('ackProgressBadge');
    const note=$('ackManagerNote');
    if (!card || !table || !badge) return;

    captureAckDrafts();
    const summary=ackManagerSummary();
    card.hidden=!summary.length;
    if (!summary.length) return;

    if (!state.ackDbReady) {
      badge.textContent='ยังไม่พร้อม';
      table.innerHTML='';
      if(note){note.hidden=false;note.textContent='ส่วนรับทราบ OT ยังไม่พร้อมใช้งาน';}
      $('saveAckEmailsBtn').disabled=true;
      $('exportAckEvidenceBtn').disabled=true;
      if($('resultAckBadge')) $('resultAckBadge').textContent='-';
      return;
    }

    if(note) note.hidden=true;
    $('saveAckEmailsBtn').disabled=false;

    const ackMap=new Map((state.ackRows||[]).map(x=>[x.staff_key,x]));
    const acknowledged=summary.filter(r=>ackMap.get(r.identity.staffKey)?.status==='acknowledged').length;
    badge.textContent=`${acknowledged} / ${summary.length} คน`;
    badge.className=`pill ${acknowledged===summary.length&&summary.length?'good':''}`;
    if($('resultAckBadge')) $('resultAckBadge').textContent=`${acknowledged}/${summary.length}`;
    $('exportAckEvidenceBtn').disabled=!state.snapshotAt;

    const q=normSearch(state.ackSearch||'');
    const filtered=q ? summary.filter(r=>normSearch(r.identity.displayName).includes(q)) : summary;
    const pg=pageSlice(filtered,state.ackPage);
    state.ackPage=pg.page;
    if($('ackResultMeta')) $('ackResultMeta').textContent=`แสดง ${pg.rows.length} จาก ${pg.total} คน`;

    table.innerHTML=`<thead><tr>
      <th>ชื่อ</th>
      <th class="num">OT</th>
      <th>Mahidol ID</th>
      <th>สถานะ</th>
    </tr></thead><tbody>${pg.rows.map(r=>{
      const id=r.identity;
      const person=state.ackPeople[id.staffKey]||{};
      const ack=ackMap.get(id.staffKey);
      const savedUsername=String(person.email||'').replace(/@mahidol\.ac\.th$/i,'');
      const username=Object.prototype.hasOwnProperty.call(state.ackEmailDrafts,id.staffKey)
        ? state.ackEmailDrafts[id.staffKey]
        : savedUsername;
      let status='';
      if(!state.snapshotAt) status='<span class="ack-status neutral">บันทึกรอบก่อน</span>';
      else if(!person.email) status='<span class="ack-status neutral">ยังไม่ได้ใส่ Mahidol ID</span>';
      else if(ack?.status==='acknowledged') status=`<span class="ack-status done">✓ รับทราบแล้ว</span><div class="ack-time">${esc(fmtDateTimeThai(ack.acknowledged_at))}</div>`;
      else status='<span class="ack-status pending">รอรับทราบ</span>';
      return `<tr>
        <td><b>${esc(id.displayName)}</b>${id.employeeCode?`<div class="subtle">${esc(id.employeeCode)}</div>`:''}</td>
        <td class="num"><b>${r.hours}</b> ชม.</td>
        <td>
          <span class="ack-email-field">
            <input type="text" data-ack-email="${esc(id.staffKey)}" data-ack-name="${esc(id.displayName)}"
              data-ack-employee="${esc(id.employeeCode)}" value="${esc(username)}"
              placeholder="name.surname" autocapitalize="none" spellcheck="false">
            <span>@mahidol.ac.th</span>
          </span>
        </td>
        <td>${status}</td>
      </tr>`;
    }).join('')}</tbody>`;
    renderPager('ackPager','ack',pg.page,pg.pages,pg.total);
  }

  async function saveAckMappings() {
    if (state.offline || !state.sb || !['admin','staff'].includes(state.actualRole)) return;
    if (!state.ackDbReady) return toast('ยังไม่ได้ติดตั้งฐานข้อมูลรับทราบ OT');

    captureAckDrafts();
    const summary=ackManagerSummary();
    const seen=new Set(), upserts=[], deletes=[];

    for(const row of summary){
      const id=row.identity;
      const existing=state.ackPeople[id.staffKey]||{};
      const raw=Object.prototype.hasOwnProperty.call(state.ackEmailDrafts,id.staffKey)
        ? state.ackEmailDrafts[id.staffKey]
        : String(existing.email||'').replace(/@mahidol\.ac\.th$/i,'');
      const email=ackEmailValue(raw);

      if(email && !email.endsWith('@mahidol.ac.th')) return toast(`Mahidol ID ของ ${id.displayName} ไม่ถูกต้อง`);
      if(email){
        if(seen.has(email)) return toast(`มี Mahidol ID ซ้ำ: ${email}`);
        seen.add(email);
        upserts.push({
          staff_key:id.staffKey,
          employee_code:id.employeeCode||null,
          display_name:id.displayName,
          email,
          active:true,
          updated_at:new Date().toISOString(),
          updated_by:String(state.session?.user?.email||'')
        });
      }else if(existing.staff_key){
        deletes.push(id.staffKey);
      }
    }

    try{
      if(upserts.length){
        const {error}=await state.sb.from('ot_ack_people').upsert(upserts,{onConflict:'staff_key'});
        if(error) throw error;
      }
      if(deletes.length){
        const {error}=await state.sb.from('ot_ack_people').delete().in('staff_key',deletes);
        if(error) throw error;
      }
      state.ackEmailDrafts={};
      await loadAckManagerData();
      if(state.snapshotAt) await syncAckRequests();
      await loadManagerOwnAck();
      toast('บันทึก Mahidol ID แล้ว');
    }catch(err){
      console.error('save ack mappings',err);
      toast(`บันทึก Mahidol ID ไม่สำเร็จ: ${err.message||err}`);
    }
  }

  async function syncAckRequests() {
    if (state.offline || !state.sb || !state.snapshotAt || !unitsReady()) return;
    if (!['admin','staff'].includes(state.actualRole)) return;

    const summary=ackManagerSummary();
    if(!summary.length) return;

    const hrPlan=await buildAckHrPlan();
    const cycleKey=currentCycleKey();
    const {data:existing,error:readError}=await state.sb.from('ot_acknowledgements').select('*').eq('cycle_key',cycleKey);
    if(readError) throw readError;
    const existingMap=new Map((existing||[]).map(x=>[x.staff_key,x]));
    const now=new Date().toISOString();
    const rows=[];

    for(const r of summary){
      const id=r.identity;
      const person=state.ackPeople[id.staffKey]||{};
      const email=String(person.email||'').trim().toLowerCase()||null;
      const detail=ackDetailFor(r,hrPlan);
      const hash=await sha256Hex(JSON.stringify(detail));
      const old=existingMap.get(id.staffKey);
      const unchanged=!!old && old.detail_hash===hash && String(old.email||'')===String(email||'');
      const keepAck=unchanged && old.status==='acknowledged';

      rows.push({
        cycle_key:cycleKey,
        cycle_start:state.cycle.start,
        cycle_end:state.cycle.end,
        staff_key:id.staffKey,
        employee_code:id.employeeCode||null,
        display_name:id.displayName,
        email,
        ot_hours:r.hours||0,
        detail_hash:hash,
        detail_json:detail,
        status:email ? (keepAck?'acknowledged':'pending') : 'unassigned',
        acknowledged_at:keepAck?old.acknowledged_at:null,
        acknowledged_by:keepAck?old.acknowledged_by:null,
        updated_at:now
      });
    }

    const {error}=await state.sb.from('ot_acknowledgements').upsert(rows,{onConflict:'cycle_key,staff_key'});
    if(error) throw error;

    const currentKeys=new Set(rows.map(x=>x.staff_key));
    const stale=(existing||[]).filter(x=>!currentKeys.has(x.staff_key)).map(x=>x.staff_key);
    if(stale.length){
      const {error:delError}=await state.sb.from('ot_acknowledgements')
        .delete().eq('cycle_key',cycleKey).in('staff_key',stale);
      if(delError) throw delError;
    }
    await loadAckManagerData();
  }

  async function exportAckEvidence() {
    if(!state.snapshotAt) return toast('กรุณาบันทึกรอบก่อน');
    try{
      await loadAckManagerData();
      const summary=ackManagerSummary();
      const ackMap=new Map((state.ackRows||[]).map(x=>[x.staff_key,x]));
      const rows=summary.map((r,i)=>{
        const id=r.identity, a=ackMap.get(id.staffKey)||{}, p=state.ackPeople[id.staffKey]||{};
        return {
          'ลำดับ':i+1,
          'รอบ OT':fmtThaiRange(state.cycle.start,state.cycle.end),
          'ID':id.employeeCode||'',
          'ชื่อ-สกุล':id.displayName,
          'Mahidol ID':p.email||a.email||'',
          'OT รวม (ชม.)':r.hours,
          'สถานะ':a.status==='acknowledged'?'รับทราบแล้ว':(p.email?'รอรับทราบ':'ยังไม่ได้ใส่ Mahidol ID'),
          'รับทราบเมื่อ':a.acknowledged_at?fmtDateTimeThai(a.acknowledged_at):'',
          'บัญชีผู้ยืนยัน':a.acknowledged_by||''
        };
      });
      const wb=XLSX.utils.book_new();
      const ws=XLSX.utils.json_to_sheet(rows);
      ws['!cols']=[{wch:8},{wch:28},{wch:12},{wch:32},{wch:34},{wch:14},{wch:20},{wch:24},{wch:34}];
      XLSX.utils.book_append_sheet(wb,ws,'หลักฐานรับทราบ OT');
      const stamp=currentCycleKey().replaceAll('-','');
      XLSX.writeFile(wb,`OT_ACK_${stamp}.xlsx`);
      toast('Export หลักฐานการรับทราบแล้ว');
    }catch(err){
      console.error('export ack evidence',err);
      toast(`Export ไม่สำเร็จ: ${err.message||err}`);
    }
  }

  async function loadAckPortal() {
    const list=$('ackList'), empty=$('ackEmpty');
    if(!list||!empty||!state.session?.user?.email) return;
    const email=String(state.session.user.email).toLowerCase();
    const {data,error}=await state.sb.from('ot_acknowledgements')
      .select('*').eq('email',email).order('cycle_start',{ascending:false});
    if(error){
      empty.hidden=false; empty.textContent='เปิดรายการไม่ได้'; list.innerHTML=''; return;
    }
    state.staffOwnAckRows=data||[];
    refreshStaffAckRoundFilter();
    renderStaffOwnAckFiltered();
  }

  async function acknowledgeOwnCycle(cycleKey) {
    const check=$(`ackCheck_${cycleKey}`);
    if(!check?.checked) return toast('กรุณาติ๊กยืนยันว่าตรวจสอบรายการแล้ว');
    const btn=document.querySelector(`[data-ack-cycle="${CSS.escape(cycleKey)}"]`);
    if(btn){btn.disabled=true;btn.textContent='กำลังบันทึก…';}
    try{
      const {data,error}=await state.sb.rpc('acknowledge_ot',{p_cycle_key:cycleKey});
      if(error) throw error;
      toast('บันทึกรับทราบเรียบร้อยแล้ว');
      await writeAppLog('ack_ot','รับทราบ OT',`รอบ ${cycleKey}`,'',cycleKey);
      if(state.viewRole==='staff') await loadAckPortal();
      else await Promise.all([loadManagerOwnAck(),loadAckManagerData()]);
    }catch(err){
      console.error('acknowledge OT',err);
      toast(`บันทึกรับทราบไม่สำเร็จ: ${err.message||err}`);
      if(btn){btn.disabled=false;btn.textContent='ยืนยันรับทราบ';}
    }
  }

  /* ===========================
     HR SPECIAL BENEFIT 00000328
     - 240 THB per 8-hour occurrence.
     - Entitlement comes ONLY from actual duty inside HR-announced dates.
     - Dummy rows may move inside that announced window, but:
       * exact entitlement count is preserved
       * no overlapping slot
       * no continuous work > 16 hours
       * normal HR dummy must also respect these reserved special rows
     =========================== */
  const HR_SPECIAL_328 = Object.freeze({
    code:'00000328',
    amountPer8h:240,
    hoursPerClaim:8
  });


  async function loadSpecial328Settings() {
    state.special328Dates = [];
    state.special328Selected = {};
    renderSpecial328Dates();
    renderSpecial328Eligibility();

    if (state.offline || !state.sb || !state.cycle?.start) return;

    const cycleKey = `${state.cycle.start}_${state.cycle.end}`;
    const { data, error } = await state.sb
      .from('ot_batches')
      .select('payload')
      .eq('cycle_key', cycleKey)
      .limit(1);

    if (error) {
      console.warn('loadSpecial328Settings', error);
      return;
    }

    const payload = data?.[0]?.payload || {};
    state.special328Dates = cleanSpecial328Dates(payload.special328Dates || []);
    state.special328Selected =
      payload.special328Selected && typeof payload.special328Selected === 'object'
        ? { ...payload.special328Selected }
        : {};

    renderSpecial328Dates();
    renderSpecial328Eligibility();
  }

  function cleanSpecial328Dates(list) {
    const out=[];
    for (const value of (Array.isArray(list)?list:[])) {
      const s=String(value||'').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s) && between(s,state.cycle.start,state.cycle.end)) out.push(s);
    }
    return [...new Set(out)].sort();
  }

  function renderSpecial328Dates() {
    state.special328Dates = cleanSpecial328Dates(state.special328Dates);
    const list=$('special328DateList'), status=$('special328Status');
    const dates=state.special328Dates;
    if (status) status.textContent = dates.length
      ? `${dates.map(d=>fmtThaiDate(d)).join(', ')}`
      : 'ยังไม่ได้กำหนดช่วงสิทธิ์ 00000328';
    if (list) {
      list.innerHTML = dates.length
        ? dates.map(d=>`<span class="date-chip special328">${esc(fmtThaiDate(d))}<button type="button" data-remove-special328="${d}" aria-label="ลบ ${d}">×</button></span>`).join('')
        : '<span class="subtle">รอ HR แจ้งวันปีใหม่/สงกรานต์ที่ใช้สิทธิ์ 00000328</span>';
      list.querySelectorAll('[data-remove-special328]').forEach(btn=>btn.addEventListener('click',()=>{
        state.special328Dates=state.special328Dates.filter(d=>d!==btn.dataset.removeSpecial328);
        renderSpecial328Dates(); renderSpecial328Eligibility();
      }));
    }
  }

  function addSpecial328DateFromPicker() {
    const picker=$('special328DatePicker');
    const date=String(picker?.value||'').trim();
    if (!date) return toast('เลือกวันที่สิทธิ์ 00000328 ก่อน');
    if (!between(date,state.cycle.start,state.cycle.end)) return toast('วันที่ 00000328 ต้องอยู่ในรอบ HR ที่เลือก');
    state.special328Dates=cleanSpecial328Dates([...state.special328Dates,date]);
    if (picker) picker.value='';
    renderSpecial328Dates(); renderSpecial328Eligibility();
  }

  async function saveSpecial328Dates() {
    if (state.offline || !state.sb) return toast('โหมดทดลองไม่สามารถบันทึกได้');
    state.special328Dates=cleanSpecial328Dates(state.special328Dates);
    const cycleKey=`${state.cycle.start}_${state.cycle.end}`;
    const {data:existing,error:readError}=await state.sb.from('ot_batches').select('*').eq('cycle_key',cycleKey).limit(1);
    if (readError) return toast(`อ่านการตั้งค่าไม่สำเร็จ: ${readError.message}`);
    const old=existing?.[0]||null;
    const payload={
      ...(old?.payload||{}),
      version:old?.payload?.version||'2.3-special328',
      cycle:{...state.cycle},
      special328Dates:[...state.special328Dates],
      special328Selected:{...state.special328Selected},
      special328UpdatedAt:new Date().toISOString(),
      special328UpdatedBy:String(state.session?.user?.email||'')
    };
    const row={
      cycle_key:cycleKey,cycle_start:state.cycle.start,cycle_end:state.cycle.end,
      unit_file_names:old?.unit_file_names||{},
      calendar_synced_at:old?.calendar_synced_at||null,
      snapshot_at:old?.snapshot_at||null,
      payload,updated_at:new Date().toISOString()
    };
    const {error}=await state.sb.from('ot_batches').upsert(row,{onConflict:'cycle_key'});
    if (error) return toast(`บันทึกช่วงสิทธิ์ 00000328 ไม่สำเร็จ: ${error.message}`);
    toast(state.special328Dates.length
      ? `บันทึกช่วงสิทธิ์ 00000328 จำนวน ${state.special328Dates.length} วันแล้ว`
      : 'บันทึกแล้ว: รอบนี้ไม่มีสิทธิ์ 00000328');
    renderSpecial328Eligibility();
    await writeAppLog('special328_save','บันทึกวันที่ 00000328',state.special328Dates.length?state.special328Dates.map(fmtThaiDate).join(', '):'ไม่มีวันที่','',currentCycleKey());
  }

  function buildSpecial328Eligibility(assignments=allAssignments()) {
    const dateSet=new Set(cleanSpecial328Dates(state.special328Dates));
    const map=new Map();
    if (!dateSet.size) return [];
    for (const a of assignments) {
      if (!dateSet.has(a.date)) continue;
      const staff=hrStaff(a.name);
      if (!staff) continue;
      const units=Math.floor((Number(a.hours)||0)/8);
      if (!map.has(staff.employeeCode)) map.set(staff.employeeCode,{
        ...staff,units:0,actualHours:0,sourceUnits:[],partialHours:0,sourceText:[]
      });
      const x=map.get(staff.employeeCode);
      x.actualHours+=Number(a.hours)||0;
      if (units>0) {
        for (let i=0;i<units;i++) x.sourceUnits.push({
          sourceDate:a.date,sourceUnit:a.unit,sourceDuty:a.duty,sourceTime:a.timeLabel||'',sourceHours:8
        });
        x.units+=units;
      }
      const rem=(Number(a.hours)||0)%8;
      if (rem) x.partialHours+=rem;
      x.sourceText.push(`${fmtThaiDate(a.date)} · ${a.unit} ${a.duty} · ${a.timeLabel||`${a.hours} ชม.`}`);
    }
    const rows=[...map.values()].filter(x=>x.units>0).sort((a,b)=>a.nick.localeCompare(b.nick,'th'));
    const validCodes=new Set(rows.map(x=>x.employeeCode));
    for (const k of Object.keys(state.special328Selected||{})) if (!validCodes.has(k)) delete state.special328Selected[k];
    rows.forEach(x=>{
      if (!(x.employeeCode in state.special328Selected)) state.special328Selected[x.employeeCode]=true;
      x.selected=state.special328Selected[x.employeeCode]!==false;
      x.pay=x.units*HR_SPECIAL_328.amountPer8h;
      x.capacity=cleanSpecial328Dates(state.special328Dates).length*2;
    });
    return rows;
  }

  function renderSpecial328Eligibility() {
    const card=$('special328EligibilityCard'), table=$('special328EligibilityTable'), empty=$('special328EligibilityEmpty');
    if (!card || !table || !empty) return;
    const rows=buildSpecial328Eligibility();
    card.hidden=!state.special328Dates.length;
    if (!state.special328Dates.length) return;
    if (!unitsReady()) {
      empty.hidden=false; empty.textContent='อัปตารางเวรให้ครบ 3 หน่วยก่อน ระบบจึงคำนวณคนที่มีสิทธิ์ 00000328';
      table.innerHTML=''; return;
    }
    if (!rows.length) {
      empty.hidden=false; empty.textContent='ไม่พบคนที่มีเวรจริงครบช่วงละ 8 ชม. ในวันที่ HR กำหนด';
      table.innerHTML=''; return;
    }
    empty.hidden=true;
    table.innerHTML=`<thead><tr>
      <th>เบิก</th><th>ชื่อ</th><th>เวรจริงในช่วงพิเศษ</th>
      <th class="num">จำนวนสิทธิ์</th><th class="num">เงินเพิ่ม</th><th class="num">จัดได้สูงสุด</th>
    </tr></thead><tbody>${rows.map(x=>`<tr>
      <td><input type="checkbox" data-special328-code="${esc(x.employeeCode)}" ${x.selected?'checked':''}></td>
      <td><b>${esc(x.nick)}</b><div class="subtle">${esc(x.fullName)} · ${esc(x.employeeCode)}</div></td>
      <td>${x.sourceText.map(s=>`<div>${esc(s)}</div>`).join('')}${x.partialHours?`<div class="warn-text">มี ${x.partialHours} ชม. ที่ยังไม่ครบ 8 ชม. จึงยังไม่นับเป็น 1 สิทธิ์</div>`:''}</td>
      <td class="num"><b>${x.units}</b> ครั้ง</td>
      <td class="num"><b>${x.pay.toLocaleString('th-TH')}</b> บาท</td>
      <td class="num">${x.capacity} ครั้ง ${x.units>x.capacity?'<div class="warn-text">ไม่พอ</div>':''}</td>
    </tr>`).join('')}</tbody>`;
  }

  function hrSlotStartMs(date,slot) {
    const d=parseIso(date); d.setHours(slot,0,0,0); return d.getTime();
  }
  function hrWouldExceed16(existingRows,date,slot) {
    const candidateStart=hrSlotStartMs(date,slot), H=3600000;
    const ints=(existingRows||[]).map(r=>[hrSlotStartMs(r.date,r.slot),hrSlotStartMs(r.date,r.slot)+8*H]);
    if (ints.some(([s,e])=>candidateStart<e && candidateStart+8*H>s)) return true;
    ints.push([candidateStart,candidateStart+8*H]); ints.sort((a,b)=>a[0]-b[0]);
    let start=ints[0][0], end=ints[0][1];
    for (let i=1;i<ints.length;i++) {
      const [s,e]=ints[i];
      if (s<=end) {
        end=Math.max(end,e);
      } else if (s===end) {
        end=e;
      } else {
        if ((end-start)/H>16) return true;
        start=s; end=e;
      }
      if ((end-start)/H>16) return true;
    }
    return (end-start)/H>16;
  }

  function hrAllocateSpecial328(eligibility) {
    const dates=cleanSpecial328Dates(state.special328Dates);
    const rows=[], failures=[];
    const selected=eligibility.filter(x=>x.selected);
    for (const person of selected) {
      const need=person.units, sourceUnits=[...person.sourceUnits];
      const leaveSet=hrLeaveDateSetForName(person.nick);
      const usableDates=dates.filter(d=>!leaveSet.has(d));
      const capacity=usableDates.length*2;
      if (need>capacity) {
        failures.push(`${person.nick}: ต้องเบิก ${need} ครั้ง แต่ช่วง ${dates.map(fmtThaiDate).join(', ')} หลังตัดวันลาวางได้สูงสุด ${capacity} ครั้ง`);
        continue;
      }
      const personRows=[];
      // Prefer 00-08 and 08-16 each day: max 16 h continuous, then 8 h rest.
      // If a row cannot be placed, try 08-16 / 16-00 patterns without breaking 16 h.
      const candidateSlots=[];
      usableDates.forEach(d=>{candidateSlots.push({date:d,slot:0},{date:d,slot:8},{date:d,slot:16});});
      let placed=0;
      for (let n=0;n<need;n++) {
        const candidates=candidateSlots.filter(c=>{
          if (personRows.some(r=>r.date===c.date&&r.slot===c.slot)) return false;
          const sameDay=personRows.filter(r=>r.date===c.date).length;
          if (sameDay>=2) return false;
          return !hrWouldExceed16(personRows,c.date,c.slot);
        }).sort((a,b)=>{
          const ac=personRows.filter(r=>r.date===a.date).length, bc=personRows.filter(r=>r.date===b.date).length;
          if (ac!==bc) return ac-bc;
          const pref=s=>s===0?0:s===8?1:2;
          if (pref(a.slot)!==pref(b.slot)) return pref(a.slot)-pref(b.slot);
          return a.date.localeCompare(b.date);
        });
        if (!candidates.length) break;
        const c=candidates[0], times=hrSlotTimes(c.slot), src=sourceUnits[placed]||sourceUnits[sourceUnits.length-1]||{};
        const row={
          employeeCode:person.employeeCode,nick:person.nick,fullName:person.fullName,
          date:c.date,slot:c.slot,...times,type:4,claimCode:HR_SPECIAL_328.code,
          claimKind:'special328',specialAmount:HR_SPECIAL_328.amountPer8h,
          sourceDate:src.sourceDate||'',sourceUnit:src.sourceUnit||'',sourceDuty:src.sourceDuty||'',sourceTime:src.sourceTime||''
        };
        personRows.push(row); rows.push(row); placed++;
      }
      if (placed<need) failures.push(`${person.nick}: จัด 00000328 ได้ ${placed}/${need} ครั้ง โดยยังคงเงื่อนไขไม่เกิน 16 ชม. ต่อเนื่อง`);
    }
    rows.sort((a,b)=>a.date.localeCompare(b.date)||a.slot-b.slot||a.nick.localeCompare(b.nick,'th'));
    return {rows,failures};
  }

  /* ===========================
     HR EXPORT — LAB/Molec/Bacteria
     All personnel use MT rate only.
     OT base = 130 THB/h on every day.
     HR dummy claim codes follow CNMI MT format:
       normal 00000074, holiday/weekend 00000075.
     =========================== */
  const HR_MT = Object.freeze({
    baseRate:130,
    normalCode:'00000074', holidayCode:'00000075',
    premiumCode:'00000076', specialCode:'00000328'
  });

  const HR_STAFF_MASTER = Object.freeze({
    'อัฐฒพงษ์':{fullName:'นาย อัฐฒพงษ์ สารารัตน์',employeeCode:'0017593'},
    'วุฒิศักดิ์':{fullName:'นาย วุฒิศักดิ์ ตรีสารวัฒน์',employeeCode:'0017594'},
    'พนิดา':{fullName:'น.ส. พนิดา พรสุโรจน์',employeeCode:'0017596'},
    'สุพิชญา':{fullName:'น.ส. สุพิชญา สินน้อย',employeeCode:'0017642'},
    'พุธธิดา':{fullName:'น.ส. พุธธิดา เปล่งเกียรติกุล',employeeCode:'0017669'},
    'จินตนาพร':{fullName:'น.ส. จินตนาพร สุขสวัสดิ์',employeeCode:'0017672'},
    'ชนกกานต์':{fullName:'น.ส. ชนกกานต์ ทิพย์รัตน์',employeeCode:'0017830'},
    'ศกุนตลา':{fullName:'น.ส. ศกุนตลา โกสะรุทธะ',employeeCode:'0017831'},
    'ศิวาพร':{fullName:'น.ส. ศิวาพร นามแดง',employeeCode:'0019348'},
    'ปฐวี':{fullName:'นาย ปฐวี ลี้ประเสริฐ',employeeCode:'0019349'},
    'ธันยธร':{fullName:'น.ส. ธันยธร อุดมเดชสวัสดิ์',employeeCode:'0019354'},
    'อาริสา':{fullName:'น.ส. อาริสา กลัดเพชร',employeeCode:'0019525'},
    'พรพรรณ':{fullName:'น.ส. พรพรรณ บุญเกิด',employeeCode:'0019600'},
    'ปาริฉัตร':{fullName:'น.ส. ปาริฉัตร อินทร์เกลี้ยง',employeeCode:'0020305'},
    'สิริฉัตร':{fullName:'น.ส. สิริฉัตร สุขอู๊ด',employeeCode:'0020312'},
    'ชูศักดิ์':{fullName:'นาย ชูศักดิ์ ธงสัตย์',employeeCode:'0020315'},
    'สิริภัท':{fullName:'น.ส. สิริภัท กลั่นทิพย์',employeeCode:'0020496'},
    'ประภาพร':{fullName:'น.ส. ประภาพร ศรีหมอก',employeeCode:'0020736'},
    'ชลมณี':{fullName:'น.ส. ชลมณี สุขช่วย',employeeCode:'0020738'},
    'ศิรสิทธิ์พล':{fullName:'นาย ศิรสิทธิ์พล บทจร',employeeCode:'0012138'},
    'ปิยดา':{fullName:'น.ส. ปิยดา แมกไม้รักษา',employeeCode:'0020533'},
    'ศศิวิมล':{fullName:'น.ส. ศศิวิมล แสนเสนา',employeeCode:'0020737'},
    'วัชระชัย':{fullName:'นาย วัชรชัย มูลประเสริฐ',employeeCode:'0020739'},
    'พัชรวรรณ':{fullName:'พัชรวรรณ รัตนพิบูลย์',employeeCode:'0021537'},
    'อภิชฎา':{fullName:'อภิชฎา อุ่นเมือง',employeeCode:'0021414'},
    'ชินกร':{fullName:'ชินกร วัชระวรรณชัย',employeeCode:'0021415'},
    'พิมพ์มาดา':{fullName:'พิมพ์มาดา อนันตกูล',employeeCode:'0021671'},
    'ฐิติยา':{fullName:'ฐิติยา ตู้เจริญ',employeeCode:'0021672'},
    'นารีรัตน์':{fullName:'นารีรัตน์ หมีทอง',employeeCode:'0023167'},
    'ญาธิป':{fullName:'ญาธิป พุ่มคง',employeeCode:'0023216'},
    'ปาลีรัตน์':{fullName:'ปาลีรัตน์ รังรักษ์รัตนากร',employeeCode:'0026192'},
    'วารีวัลย์':{fullName:'วารีวัลย์ หุ่นเทอดไทย',employeeCode:'0017654'},
    'ศรัณย์':{fullName:'นาย ศรัณย์ สุรวัฒน์เดชา',employeeCode:'0026230'},
    'อติชาติ':{fullName:'นาย อติชาติ ยิ้มโสด',employeeCode:'0026231'},
    'ณรงค์ชัย':{fullName:'นาย ณรงค์ชัย คำมูลตรี',employeeCode:'0027961'},
    'จิณห์นิภา':{fullName:'น.ส. จิณห์นิภา ไตรอนันต์วุฒิกุล',employeeCode:'0027960'}
  });

  const hrRound2 = v => Math.round((Number(v)||0)*100)/100;
  function hrStaff(name) {
    const key = normName(name);
    const info = HR_STAFF_MASTER[key];
    if (!info) return null;
    return { nick:key, fullName:info.fullName, employeeCode:String(info.employeeCode).replace(/\D/g,'').padStart(7,'0') };
  }
  function hrDateList(start,end) {
    const out=[]; let d=start, guard=0;
    while(d && d<=end && guard++<100){ out.push(d); d=addDays(d,1); }
    return out;
  }
  function hrWeekend(date) { const day=parseIso(date).getDay(); return day===0 || day===6; }
  function hrHolidayDates(assignments) {
    return new Set((assignments||[]).filter(x=>x.holiday).map(x=>x.date));
  }
  function hrIsDummyHoliday(date,holidaySet) { return hrWeekend(date) || holidaySet.has(date); }
  function hrActualRate() { return HR_MT.baseRate; }
  function hrSlotTimes(slot) {
    if (slot === 8) return { start:'08:00', end:'16:00', startValue:8/24, endValue:16/24 };
    if (slot === 16) return { start:'16:00', end:'00:00', startValue:16/24, endValue:0 };
    return { start:'00:00', end:'08:00', startValue:0, endValue:8/24 };
  }

  function hrAllowedSlots(date,holidaySet) { return hrIsDummyHoliday(date,holidaySet) ? [0,8,16] : [0,16]; }
  function hrIsRegularWorkday(date,holidaySet) {
    const day=parseIso(date).getDay();
    return day>=1 && day<=5 && !hrIsDummyHoliday(date,holidaySet) && !state.special328Dates.includes(date);
  }
  function hrIsLeaveEvent(ev) {
    const s=String(ev?.summary||'').toLowerCase();
    return /ลา|พักผ่อน|พักร้อน|ป่วย|ลากิจ|หาหมอ|พบแพทย์|แพทย์นัด|นัดตรวจ|ตรวจสุขภาพ/.test(s);
  }
  function hrLeaveDateSetForName(name) {
    const out=new Set(), needle=normSearch(name);
    if(!needle) return out;
    for(const ev of (state.leaveEvents||[])) {
      if(!hrIsLeaveEvent(ev)) continue;
      if(!normSearch(ev.summary).includes(needle)) continue;
      let d=ev.start, guard=0;
      while(d && ev.end && d<=ev.end && guard++<70) {
        if(between(d,state.cycle.start,state.cycle.end)) out.add(d);
        d=addDays(d,1);
      }
    }
    return out;
  }
  function hrPreviousCycle() {
    const d=parseIso(state.cycle.start);
    d.setMonth(d.getMonth()-1);
    return cycleFromStartMonth(d.getFullYear(),d.getMonth()+1);
  }
  async function hrCarryInInfo() {
    const prev=hrPreviousCycle(), empty={map:{},sourceMonth:prev.start.slice(0,7),sourceCycleKey:`${prev.start}_${prev.end}`,found:false};
    if(state.offline || !state.sb) return empty;
    const {data,error}=await state.sb.from('ot_batches').select('payload').eq('cycle_key',empty.sourceCycleKey).limit(1);
    if(error) throw error;
    const saved=data?.[0]?.payload?.hrExport?.carryOutByEmployeeCode;
    if(!saved || typeof saved!=='object') return empty;
    return {...empty,map:saved,found:true};
  }
  function hrBuildTotals(assignments,carryInfo) {
    const map=new Map();
    for(const a of assignments) {
      const s=hrStaff(a.name);
      if(!s) continue;
      const rate=HR_MT.baseRate;
      const actual=hrRound2(a.hours), hrHours=hrRound2(actual*rate/HR_MT.baseRate), money=hrRound2(actual*rate);
      if(!map.has(s.employeeCode)) map.set(s.employeeCode,{
        ...s,baseType:'MT',baseRate:HR_MT.baseRate,actual:0,currentTotal:0,actualMoney:0,
        carryIn:hrRound2(carryInfo?.map?.[s.employeeCode]||0),carrySourceMonth:carryInfo?.sourceMonth||'',
        rows:[],total:0,claimed:0,carry:0,claimedUnits:0,unallocatedUnits:0,normalHours:0,holidayHours:0,money:0
      });
      const t=map.get(s.employeeCode);
      t.actual=hrRound2(t.actual+actual);
      t.currentTotal=hrRound2(t.currentTotal+hrHours);
      t.actualMoney=hrRound2(t.actualMoney+money);
      t.rows.push({assignment:a,actual,hrHours,rate,money});
    }
    const totals=[...map.values()].sort((a,b)=>a.fullName.localeCompare(b.fullName,'th'));
    totals.forEach(t=>{t.total=hrRound2(t.currentTotal+t.carryIn);});
    return totals;
  }
  function hrAllocate(totals,holidaySet,reservedRows=[]) {
    const dates=hrDateList(state.cycle.start,state.cycle.end), dateCount=Math.max(1,dates.length);
    const leaveMap=new Map(totals.map(t=>[t.employeeCode,hrLeaveDateSetForName(t.nick)]));
    const totalUnits=totals.reduce((s,t)=>s+Math.max(0,Math.floor((Number(t.total||0)+1e-7)/8)),0);
    const dateInfos=dates.map((date,index)=>({date,index,slots:hrAllowedSlots(date,holidaySet),target:0,slotTargets:new Map()}));
    const totalWeight=Math.max(1,dateInfos.reduce((s,x)=>s+x.slots.length,0));
    let base=0;
    dateInfos.forEach(info=>{const ideal=totalUnits*info.slots.length/totalWeight;info.ideal=ideal;info.frac=ideal-Math.floor(ideal);info.target=Math.floor(ideal);base+=info.target;});
    let extra=Math.max(0,totalUnits-base);
    dateInfos.slice().sort((a,b)=>b.frac-a.frac||a.index-b.index).slice(0,extra).forEach(x=>x.target++);
    dateInfos.forEach(info=>{
      const n=info.slots.length,b=Math.floor(info.target/n),rem=info.target%n,start=info.index%n;
      info.slots.forEach(s=>info.slotTargets.set(s,b));
      for(let i=0;i<rem;i++){const s=info.slots[(start+i)%n];info.slotTargets.set(s,(info.slotTargets.get(s)||0)+1);}
    });
    const infoMap=new Map(dateInfos.map(x=>[x.date,x])), cells=[];
    dateInfos.forEach(info=>info.slots.forEach(slot=>cells.push({date:info.date,index:info.index,slot,target:info.slotTargets.get(slot)||0,assigned:0})));
    const rows=[], byStaffDay=new Map(), dateOcc=new Map(), staffDates=new Map(), existingByStaff=new Map();
    const daySlots=(code,date)=>{const k=`${code}|${date}`;if(!byStaffDay.has(k))byStaffDay.set(k,new Set());return byStaffDay.get(k);};
    const datesForStaff=code=>{if(!staffDates.has(code))staffDates.set(code,new Set());return staffDates.get(code);};
    const existingFor=code=>{if(!existingByStaff.has(code))existingByStaff.set(code,[]);return existingByStaff.get(code);};

    // เวลางานประจำ จ-ศ 08:00-16:00 ต้องนับรวมตอนตรวจ "ทำงานต่อเนื่องไม่เกิน 16 ชม."
    // วันหยุด/เสาร์-อาทิตย์ไม่มี baseline นี้
    for(const t of totals){
      for(const date of dates){
        if(hrIsRegularWorkday(date,holidaySet)){
          existingFor(t.employeeCode).push({employeeCode:t.employeeCode,date,slot:8,baseline:true});
        }
      }
    }

    for(const r of (reservedRows||[])){
      daySlots(r.employeeCode,r.date).add(r.slot);
      datesForStaff(r.employeeCode).add(r.date);
      existingFor(r.employeeCode).push(r);
      dateOcc.set(r.date,(dateOcc.get(r.date)||0)+1);
    }
    const canUse=(t,cell,overflow=false)=>{
      if(!overflow && cell.assigned>=cell.target) return false;
      if(overflow && cell.assigned>=6) return false;
      if(leaveMap.get(t.employeeCode)?.has(cell.date)) return false;
      const used=daySlots(t.employeeCode,cell.date);
      if(used.has(cell.slot) || used.size>=2) return false;
      if(hrWouldExceed16(existingFor(t.employeeCode),cell.date,cell.slot)) return false;
      return true;
    };
    const add=(t,cell)=>{
      const times=hrSlotTimes(cell.slot), holiday=hrIsDummyHoliday(cell.date,holidaySet);
      rows.push({
        employeeCode:t.employeeCode,nick:t.nick,fullName:t.fullName,date:cell.date,slot:cell.slot,
        ...times,type:holiday?2:1,claimCode:holiday?HR_MT.holidayCode:HR_MT.normalCode
      });
      cell.assigned++;dateOcc.set(cell.date,(dateOcc.get(cell.date)||0)+1);
      daySlots(t.employeeCode,cell.date).add(cell.slot);datesForStaff(t.employeeCode).add(cell.date);existingFor(t.employeeCode).push(rows[rows.length-1]);
    };
    const remaining=new Map(), desired=new Map(), assigned=new Map();
    totals.forEach(t=>{const n=Math.max(0,Math.floor((Number(t.total||0)+1e-7)/8));remaining.set(t.employeeCode,n);desired.set(t.employeeCode,n);assigned.set(t.employeeCode,0);});
    const remainingTotal=()=>[...remaining.values()].reduce((s,n)=>s+n,0);
    let round=0,progress=true;
    while(remainingTotal()>0 && progress && round++<120) {
      progress=false;
      const order=totals.slice().sort((a,b)=>(remaining.get(b.employeeCode)||0)-(remaining.get(a.employeeCode)||0)||a.nick.localeCompare(b.nick,'th'));
      order.forEach((t,staffIndex)=>{
        const left=remaining.get(t.employeeCode)||0;if(left<=0)return;
        const prevDates=datesForStaff(t.employeeCode), candidates=[];
        for(const cell of cells) {
          if(!canUse(t,cell,false)) continue;
          const info=infoMap.get(cell.date), occ=dateOcc.get(cell.date)||0;
          const adjacent=(prevDates.has(addDays(cell.date,-1))?1:0)+(prevDates.has(addDays(cell.date,1))?1:0);
          const used=daySlots(t.employeeCode,cell.date).size;
          const rotation=(cell.index-((staffIndex*3+round)%dateCount)+dateCount)%dateCount;
          candidates.push({cell,score:[adjacent,used,cell.assigned/Math.max(1,cell.target),occ/Math.max(1,info.target),rotation,cell.slot]});
        }
        if(!candidates.length)return;
        candidates.sort((a,b)=>{for(let i=0;i<a.score.length;i++){if(a.score[i]!==b.score[i])return a.score[i]-b.score[i];}return 0;});
        add(t,candidates[0].cell);remaining.set(t.employeeCode,left-1);assigned.set(t.employeeCode,(assigned.get(t.employeeCode)||0)+1);progress=true;
      });
    }
    let fallback=0;
    while(remainingTotal()>0 && fallback++<120) {
      let moved=false;
      for(const t of totals) {
        const left=remaining.get(t.employeeCode)||0;if(left<=0)continue;
        const candidates=[];
        for(const cell of cells) {
          if(!canUse(t,cell,true))continue;
          const adjacent=(datesForStaff(t.employeeCode).has(addDays(cell.date,-1))?1:0)+(datesForStaff(t.employeeCode).has(addDays(cell.date,1))?1:0);
          candidates.push({cell,score:[adjacent,cell.assigned,dateOcc.get(cell.date)||0,cell.index,cell.slot]});
        }
        if(!candidates.length)continue;
        candidates.sort((a,b)=>{for(let i=0;i<a.score.length;i++){if(a.score[i]!==b.score[i])return a.score[i]-b.score[i];}return 0;});
        add(t,candidates[0].cell);remaining.set(t.employeeCode,left-1);assigned.set(t.employeeCode,(assigned.get(t.employeeCode)||0)+1);moved=true;
      }
      if(!moved)break;
    }
    totals.forEach(t=>{
      const claimedUnits=assigned.get(t.employeeCode)||0;
      t.claimedUnits=claimedUnits;t.claimed=hrRound2(claimedUnits*8);t.carry=hrRound2(t.total-t.claimed);
      t.unallocatedUnits=Math.max(0,(desired.get(t.employeeCode)||0)-claimedUnits);
      const mine=rows.filter(x=>x.employeeCode===t.employeeCode);
      t.normalHours=mine.filter(x=>x.type===1).length*8;t.holidayHours=mine.filter(x=>x.type===2).length*8;
      t.money=hrRound2(t.claimed*HR_MT.baseRate);
    });
    rows.sort((a,b)=>a.date.localeCompare(b.date)||a.slot-b.slot||a.nick.localeCompare(b.nick,'th'));
    const leaveSkipped=[];
    totals.forEach(t=>[...(leaveMap.get(t.employeeCode)||[])].sort().forEach(date=>leaveSkipped.push({employeeCode:t.employeeCode,fullName:t.fullName,date})));
    return {rows,leaveSkipped};
  }
  function hrSourceRows(totals) {
    const out=[];
    totals.forEach(t=>t.rows.forEach(x=>{
      const a=x.assignment;
      out.push({
        'รหัสพนักงาน':t.employeeCode,'ชื่อ':t.fullName,'ชื่อเล่น':t.nick,'วันที่ OT จริง':a.date,
        'เดือนเบิกจริง':state.cycle.start.slice(0,7),'รอบ HR dummy':`${state.cycle.start} ถึง ${state.cycle.end}`,
        'เหตุผล':`เวร ${a.unit} ${a.duty}`,'หมายเหตุ':`${a.timeLabel}${a.holiday?' | วันหยุด *':''}`,
        'ประเภทเวร':`${a.unit}-${a.duty}`,'ชั่วโมงจริง':x.actual,'เรทงานจริง (บาท/ชม.)':x.rate,
        'ฐาน HR (บาท/ชม.)':HR_MT.baseRate,'ชั่วโมงเทียบ HR':x.hrHours,'เงินตามงานจริง':x.money,
        'การแปลงเรท':'MT 130 → ฐาน HR 130',
        'claim_status ก่อน Export':'ready'
      });
    }));
    return out.sort((a,b)=>String(a['วันที่ OT จริง']).localeCompare(String(b['วันที่ OT จริง']))||String(a['ชื่อเล่น']).localeCompare(String(b['ชื่อเล่น']),'th'));
  }
  function hrStaffSummaryRows(totals) {
    return totals.map(t=>({
      'รหัสพนักงาน':t.employeeCode,'ชื่อ':t.fullName,'ชื่อเล่น':t.nick,'กลุ่ม HR':'MT','ฐาน HR':HR_MT.baseRate,
      'ชั่วโมงจริงรวม':t.actual,'OT เดือนนี้เทียบ HR':t.currentTotal,'ยอดทบยกมา(ชม.)':t.carryIn,
      'เดือนยอดทบยกมา':t.carrySourceMonth||'','โอทีทั้งหมดรวมยอดทบ':t.total,'เบิกจริง':t.claimed,
      'ทบเดือนหน้า(ชม.)':t.carry,'จำนวนเวร 8 ชม.':t.claimedUnits,'เวรที่จัดไม่ได้เพราะลา/ความจุ':t.unallocatedUnits,
      'คำนวณเป็นเงิน':t.money
    }));
  }
  function hrHolidayList(holidaySet) {
    return hrDateList(state.cycle.start,state.cycle.end).filter(d=>hrIsDummyHoliday(d,holidaySet)).map(d=>String(Number(d.slice(-2))).padStart(2,'0')).join(',');
  }
  function hrOtExtraSheet(sourceRows,totals,carryInfo) {
    const rows=[
      [`สรุป OT รอบ ${state.cycle.start} ถึง ${state.cycle.end} / HR dummy ${state.cycle.start} ถึง ${state.cycle.end}`],
      ['ชื่อ','OT เดือนนี้เทียบ HR','ยอดทบยกมา','เดือนยอดทบ','โอทีทั้งหมดรวมยอดทบ','เบิกจริง','ทบเดือนหน้า','ฐาน HR','คำนวณเป็นเงิน','หมายเหตุ'],
      ...totals.map(t=>[t.fullName,t.currentTotal,t.carryIn,t.carrySourceMonth||'',t.total,t.claimed,t.carry,HR_MT.baseRate,t.money,
        [t.carryIn>0?'รวมยอดทบจากรอบก่อนอัตโนมัติ':'',!carryInfo.found?'ไม่พบ Snapshot Export รอบก่อน — ใช้ยอดยกมา 0':'','ทุกคนใช้กลุ่ม MT'].filter(Boolean).join(' • ')]),
      [],
      ['รายละเอียดต้นทางรอบปัจจุบัน'],
      ['ชื่อ','วันที่ OT','เหตุผล','ประเภทเวร','ชั่วโมงจริง','เรทงานจริง','ฐาน HR','ชั่วโมงเทียบ HR','เงินตามงานจริง','หมายเหตุการแปลง'],
      ...sourceRows.map(r=>[r['ชื่อ'],r['วันที่ OT จริง'],r['เหตุผล'],r['ประเภทเวร'],r['ชั่วโมงจริง'],r['เรทงานจริง (บาท/ชม.)'],r['ฐาน HR (บาท/ชม.)'],r['ชั่วโมงเทียบ HR'],r['เงินตามงานจริง'],r['การแปลงเรท']])
    ];
    const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:34},{wch:18},{wch:15},{wch:15},{wch:22},{wch:15},{wch:18},{wch:12},{wch:16},{wch:60}];return ws;
  }
  function hrScheduleSheet(allocation,totals,special328Rows=[]) {
    const start=parseIso(state.cycle.start),first=new Date(start);first.setDate(first.getDate()-first.getDay());
    const end=parseIso(state.cycle.end),last=new Date(end);last.setDate(last.getDate()+(6-last.getDay()));
    const weeks=Math.ceil((last-first)/(7*86400000))+1,cols=31,data=[];
    const row1=Array(cols).fill(null),row2=Array(cols).fill(null);
    for(let day=0;day<7;day++){const c=1+day*3;row1[c]=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์'][day];row2[c]=0;row2[c+1]=8;row2[c+2]=16;}
    ['ชื่อ','จำนวน','วันหยุดพิเศษ','คิดเงิน (บาท)','คิดเงิน (บาท) + วันที่ 13-15','โอทีทั้งหมด','เบิกจริง','ทบเดือนหน้า(ชม.)'].forEach((h,i)=>row1[23+i]=h);
    data.push(row1,row2);
    const byCell=new Map();
    allocation.rows.forEach(x=>{const k=`${x.date}|${x.slot}`;if(!byCell.has(k))byCell.set(k,[]);byCell.get(k).push(x.nick);});
    special328Rows.forEach(x=>{const k=`${x.date}|${x.slot}`;if(!byCell.has(k))byCell.set(k,[]);byCell.get(k).push(`${x.nick} [328]`);});
    for(let w=0;w<weeks;w++){
      const dateRow=Array(cols).fill(null);dateRow[0]='วันที่';
      const nameRows=Array.from({length:6},(_,i)=>{const r=Array(cols).fill(null);r[0]=String.fromCharCode(65+i);return r;});
      for(let day=0;day<7;day++){
        const d=new Date(first);d.setDate(first.getDate()+w*7+day);const key=isoDate(d),c=1+day*3;
        if(key>=state.cycle.start&&key<=state.cycle.end){
          dateRow[c]=String(Number(key.slice(-2))).padStart(2,'0');
          for(const slot of [0,8,16]){const names=byCell.get(`${key}|${slot}`)||[],col=c+(slot===0?0:slot===8?1:2);for(let i=0;i<Math.min(6,names.length);i++)nameRows[i][col]=names[i];}
        }
      }
      data.push(dateRow,...nameRows);
    }
    while(data.length<totals.length+2)data.push(Array(cols).fill(null));
    totals.forEach((t,i)=>{const r=data[i+2]||(data[i+2]=Array(cols).fill(null));r[23]=t.nick;r[24]=t.claimedUnits;r[25]=t.holidayHours/8;r[26]=t.money;r[27]=t.money;r[28]=t.total;r[29]=t.claimed;r[30]=t.carry;});
    const ws=XLSX.utils.aoa_to_sheet(data);ws['!cols']=[{wch:7},...Array.from({length:21},()=>({wch:13})),{wch:2},{wch:20},{wch:10},{wch:14},{wch:16},{wch:22},{wch:14},{wch:12},{wch:18}];return ws;
  }
  function hrCopySheet(allocation,holidaySet,special328Rows=[]) {
    const rows=[['name','time','วันที่','1 = ธรรมดา\n2 = วันหยุด\n3 = พรีเมียม\n4 = อื่นๆ1\n5 = อื่นๆ2','copy ใส่ macro HR >>>','key no','no','วันที่','เวลาเข้า','เวลาออก','วันที่เต็ม (ตรวจสอบ)','วันหยุด>',hrHolidayList(holidaySet)]];
    [...allocation.rows,...special328Rows].sort((a,b)=>a.date.localeCompare(b.date)||a.slot-b.slot||a.nick.localeCompare(b.nick,'th')).forEach(x=>rows.push([x.nick,x.slot,Number(x.date.slice(-2)),x.type,'',x.claimCode,x.employeeCode,Number(x.date.slice(-2)),x.startValue,x.endValue,x.date,'','']));
    const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:22},{wch:8},{wch:8},{wch:18},{wch:24},{wch:12},{wch:12},{wch:8},{wch:12},{wch:12},{wch:14},{wch:12},{wch:45}];
    for(let r=2;r<=rows.length;r++){for(const col of ['F','G'])if(ws[`${col}${r}`]){ws[`${col}${r}`].t='s';ws[`${col}${r}`].z='@';}for(const col of ['I','J'])if(ws[`${col}${r}`]){ws[`${col}${r}`].t='n';ws[`${col}${r}`].z='h:mm';}}
    ws['!autofilter']={ref:`A1:M${Math.max(1,rows.length)}`};return ws;
  }
  function hrTimeSheet() {
    const ws=XLSX.utils.aoa_to_sheet([[null,'เข้า','ออก'],[0,0,8/24],[8,8/24,16/24],[16,16/24,0]]);
    for(let r=2;r<=4;r++)for(const col of ['B','C']){ws[`${col}${r}`].t='n';ws[`${col}${r}`].z='h:mm';}
    ws['!cols']=[{wch:8},{wch:12},{wch:12}];return ws;
  }
  function hrNameSheet(totals) {
    const rows=[['ชื่อ','รหัสพนักงาน','รหัสเบิกธรรมดา','รหัสเบิกวันหยุด','รหัสเบิกพรีเมียม','วันหยุดพิเศษ','อื่นๆ2','รวม OT ปกติ(บาท)','ชั่วโมงธรรมดา','ชั่วโมงวันหยุด','จำนวนธรรมดา','จำนวนวันหยุด','เรท MT','00000328 (ครั้ง)','เงิน 00000328 (บาท)','หมายเหตุ']];
    totals.forEach(t=>rows.push([t.nick,t.employeeCode,HR_MT.normalCode,HR_MT.holidayCode,HR_MT.premiumCode,HR_SPECIAL_328.code,'',t.money,HR_MT.baseRate,HR_MT.baseRate,t.normalHours,t.holidayHours,HR_MT.baseRate,t.special328Count||0,t.special328Pay||0,'OT ปกติทุกวัน MT 130 บาท/ชม. • 00000328 = 240 บาทต่อ 8 ชม. แยกต่างหาก']));
    const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:22},{wch:14},{wch:17},{wch:17},{wch:17},{wch:15},{wch:12},{wch:14},{wch:15},{wch:15},{wch:15},{wch:15},{wch:18},{wch:18},{wch:32}];
    for(let r=2;r<=rows.length;r++)for(const col of ['B','C','D','E','F'])if(ws[`${col}${r}`]){ws[`${col}${r}`].t='s';ws[`${col}${r}`].z='@';}
    return ws;
  }

  function hrSpecial328Sheet(rows) {
    const data=rows.map(x=>({
      'รหัสพนักงาน':x.employeeCode,'ชื่อ':x.fullName,'ชื่อเล่น':x.nick,
      'วันที่เวรจริง':x.sourceDate,'หน่วยจริง':x.sourceUnit,'เวรจริง':x.sourceDuty,'เวลาจริง':x.sourceTime,
      'วันที่ Dummy 00000328':x.date,'เวลาเข้า':x.start,'เวลาออก':x.end,
      'รหัสเบิก':HR_SPECIAL_328.code,'ชั่วโมงต่อครั้ง':8,'ยอดต่อครั้ง (บาท)':HR_SPECIAL_328.amountPer8h,
      'หมายเหตุ':'สิทธิ์จากเวรจริงในช่วงที่ HR ประกาศ; วันที่ Dummy ใช้เพื่อจัดรูปแบบเบิกโดยไม่ให้ต่อเนื่องเกิน 16 ชม.'
    }));
    return hrJsonSheet(data,Object.keys(data[0]||{
      'รหัสพนักงาน':'','ชื่อ':'','ชื่อเล่น':'','วันที่เวรจริง':'','หน่วยจริง':'','เวรจริง':'','เวลาจริง':'',
      'วันที่ Dummy 00000328':'','เวลาเข้า':'','เวลาออก':'','รหัสเบิก':'','ชั่วโมงต่อครั้ง':'','ยอดต่อครั้ง (บาท)':'','หมายเหตุ':''
    }),[14,30,14,16,12,12,18,20,12,12,14,14,18,70]);
  }

  function hrHrSheet(allocation,special328Rows=[]) {
    const all=[...allocation.rows,...special328Rows].sort((a,b)=>a.date.localeCompare(b.date)||a.slot-b.slot||a.nick.localeCompare(b.nick,'th')); const rows=[['key no','no','วันที่','เวลาเข้า','เวลาออก'],...all.map(x=>[x.claimCode,x.employeeCode,Number(x.date.slice(-2)),x.startValue,x.endValue])];
    const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:14},{wch:14},{wch:10},{wch:12},{wch:12}];
    for(let r=2;r<=rows.length;r++){for(const col of ['A','B'])if(ws[`${col}${r}`]){ws[`${col}${r}`].t='s';ws[`${col}${r}`].z='@';}for(const col of ['D','E'])if(ws[`${col}${r}`]){ws[`${col}${r}`].t='n';ws[`${col}${r}`].z='h:mm';}}
    return ws;
  }
  function hrJsonSheet(rows,headers,widths) {
    const ws=XLSX.utils.json_to_sheet(rows,{header:headers});ws['!cols']=(widths||headers.map(()=>16)).map(w=>({wch:w}));
    ws['!autofilter']={ref:`A1:${XLSX.utils.encode_col(headers.length-1)}${Math.max(1,rows.length+1)}`};return ws;
  }
  async function hrPersistExport(totals,allocation,carryInfo,special328Rows=[]) {
    const now=new Date().toISOString(), carryOutByEmployeeCode=Object.fromEntries(totals.map(t=>[t.employeeCode,t.carry]));
    state.hrExport={
      version:'HR-MT-1.0',exportedAt:now,baseType:'MT',baseRate:HR_MT.baseRate,
      carrySourceCycleKey:carryInfo.sourceCycleKey,carrySourceFound:carryInfo.found,carryOutByEmployeeCode,
      totalDummyRows:allocation.rows.length,totalClaimedHours:hrRound2(allocation.rows.length*8),special328Dates:[...state.special328Dates],special328Rows:special328Rows.length,special328Pay:hrRound2(special328Rows.length*HR_SPECIAL_328.amountPer8h)
    };
    if(state.offline || !state.sb) return;
    const cycleKey=`${state.cycle.start}_${state.cycle.end}`;
    const payload={
      version:'2.1-all-units-hr-export',cycle:{...state.cycle},
      units:Object.fromEntries(UNITS.map(u=>[u,state.units[u]])),
      calendarSources:state.calendarSources,leaveEvents:state.leaveEvents,
      calendarSyncedAt:state.calendarSyncedAt,conflicts:state.conflicts,special328Dates:[...state.special328Dates],special328Selected:{...state.special328Selected},savedAt:state.snapshotAt||now,hrExport:state.hrExport
    };
    const {error}=await state.sb.from('ot_batches').upsert({
      cycle_key:cycleKey,cycle_start:state.cycle.start,cycle_end:state.cycle.end,
      unit_file_names:Object.fromEntries(UNITS.map(u=>[u,state.units[u].fileName])),
      calendar_synced_at:state.calendarSyncedAt,snapshot_at:state.snapshotAt||now,payload,updated_at:now
    },{onConflict:'cycle_key'});
    if(error) throw error;
    if(!state.snapshotAt) state.snapshotAt=now;
  }

  async function exportWorkbook() {
    if (!unitsReady()) return toast('ต้องมีไฟล์ครบ 3 หน่วยก่อน Export HR');
    if (!state.offline && !state.calendarSyncedAt) return toast('กรุณากด “ดึงวันลาล่าสุด” ก่อน Export HR เพื่อให้ระบบหลบวันลา');
    const assignments=allAssignments().sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'th')||a.unit.localeCompare(b.unit));
    const missing=[...new Set(assignments.map(a=>normName(a.name)).filter(n=>!hrStaff(n)))];
    if(missing.length) return toast(`ยังไม่มีรหัสพนักงานของ: ${missing.join(', ')} กรุณาแจ้ง Admin เพิ่มรายชื่อก่อน Export`);
    $('exportBtn').disabled=true;
    const oldLabel=$('exportBtn').textContent;$('exportBtn').textContent='กำลังสร้าง HR…';
    try {
      const holidaySet=hrHolidayDates(assignments),carryInfo=await hrCarryInInfo(),totals=hrBuildTotals(assignments,carryInfo);
      const specialEligibility=buildSpecial328Eligibility(assignments);
      const special328=hrAllocateSpecial328(specialEligibility);
      if(special328.failures.length) throw new Error(`ยังจัดสิทธิ์ 00000328 ได้ไม่ครบ: ${special328.failures.join(' | ')}`);
      const specialByCode=new Map();
      special328.rows.forEach(r=>specialByCode.set(r.employeeCode,(specialByCode.get(r.employeeCode)||0)+1));
      totals.forEach(t=>{t.special328Count=specialByCode.get(t.employeeCode)||0;t.special328Pay=t.special328Count*HR_SPECIAL_328.amountPer8h;});
      const allocation=hrAllocate(totals,holidaySet,special328.rows);
      if(!allocation.rows.length) throw new Error('ไม่มีชั่วโมง OT ที่พร้อมจัดลงไฟล์ HR');
      const sourceRows=hrSourceRows(totals),summaryRows=hrStaffSummaryRows(totals);
      summaryRows.forEach(r=>{
        const t=totals.find(x=>x.employeeCode===r['รหัสพนักงาน']);
        r['00000328 (ครั้ง)']=t?.special328Count||0;
        r['00000328 (บาท)']=t?.special328Pay||0;
      });
      const carryRows=totals.map(t=>({
        'รหัสพนักงาน':t.employeeCode,'ชื่อ':t.fullName,'เดือน OT ปัจจุบัน':state.cycle.start.slice(0,7),
        'เดือนยอดทบยกมา':t.carrySourceMonth||'','ยอดทบยกมา(ชม.)':t.carryIn,'OT เดือนนี้เทียบ HR':t.currentTotal,
        'โอทีทั้งหมดรวมยอดทบ':t.total,'เบิกจริง':t.claimed,'ทบเดือนหน้า(ชม.)':t.carry,
        'หมายเหตุ':carryInfo.found?'ยอดทบเดือนหน้าบันทึกใน Snapshot รอบนี้อัตโนมัติ':'ไม่พบ Snapshot Export รอบก่อน — รอบนี้เริ่มยอดยกมา 0'
      }));
      const leaveRows=allocation.leaveSkipped.map(x=>({'รหัสพนักงาน':x.employeeCode,'ชื่อ':x.fullName,'วันที่ลาในรอบ HR':x.date,'หมายเหตุ':'ระบบไม่สร้าง dummy shift ในวันนี้'}));
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,hrOtExtraSheet(sourceRows,totals,carryInfo),'OT เสริม');
      XLSX.utils.book_append_sheet(wb,hrScheduleSheet(allocation,totals,special328.rows),'ตาราง');
      XLSX.utils.book_append_sheet(wb,hrCopySheet(allocation,holidaySet,special328.rows),'copy');
      XLSX.utils.book_append_sheet(wb,hrTimeSheet(),'time');
      XLSX.utils.book_append_sheet(wb,hrNameSheet(totals),'name');
      XLSX.utils.book_append_sheet(wb,hrHrSheet(allocation,special328.rows),'HR_OT');
      XLSX.utils.book_append_sheet(wb,hrSpecial328Sheet(special328.rows),'00000328');
      XLSX.utils.book_append_sheet(wb,hrJsonSheet(sourceRows,Object.keys(sourceRows[0]||{}),[14,30,14,14,12,24,34,42,14,12,16,12,16,16,44,20]),'Source_OT_1_to_End');
      XLSX.utils.book_append_sheet(wb,hrJsonSheet(summaryRows,Object.keys(summaryRows[0]||{}),[14,30,14,12,10,16,16,16,22,14,18,14,18,16]),'Staff_Total');
      XLSX.utils.book_append_sheet(wb,hrJsonSheet(carryRows,Object.keys(carryRows[0]||{'รหัสพนักงาน':'','ชื่อ':'','เดือน OT ปัจจุบัน':'','เดือนยอดทบยกมา':'','ยอดทบยกมา(ชม.)':'','OT เดือนนี้เทียบ HR':'','โอทีทั้งหมดรวมยอดทบ':'','เบิกจริง':'','ทบเดือนหน้า(ชม.)':'','หมายเหตุ':''}),[14,30,16,16,18,18,22,14,18,62]),'Carry_Forward');
      XLSX.utils.book_append_sheet(wb,hrJsonSheet(leaveRows,Object.keys(leaveRows[0]||{'รหัสพนักงาน':'','ชื่อ':'','วันที่ลาในรอบ HR':'','หมายเหตุ':''}),[14,30,18,42]),'Leave_Skipped');
      await hrPersistExport(totals,allocation,carryInfo,special328.rows);
      const now=new Date(),stamp=`${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const fileName=`HR_OT_LAB_${stamp}_source_${state.cycle.start}_to_${state.cycle.end}_dummy_${state.cycle.start}_to_${state.cycle.end}.xlsx`;
      XLSX.writeFile(wb,fileName);
      const carry=hrRound2(totals.reduce((s,t)=>s+t.carry,0));
      toast(`Export HR สำเร็จ • OT ปกติ MT 130 จำนวน ${allocation.rows.length} เวร × 8 ชม. • 00000328 ${special328.rows.length} ครั้ง = ${(special328.rows.length*HR_SPECIAL_328.amountPer8h).toLocaleString('th-TH')} บาท • ทบเดือนหน้า ${carry} ชม.`);
      await writeAppLog('export_hr','Export HR Excel',`${allocation.rows.length} ช่วง OT · 00000328 ${special328.rows.length} ครั้ง`,'',currentCycleKey());
      if(state.snapshotAt){
        try{
          await syncAckRequests();
          await loadManagerOwnAck();
          if(canAdminPreviewAllStaff()) await loadOwnerStaffPreview();
        }catch(ackErr){
          console.warn('refresh acknowledgement after HR export',ackErr);
        }
      }
    } catch(err) {
      console.error('HR export failed',err);toast(`Export HR ไม่สำเร็จ: ${err.message||err}`);
    } finally {
      $('exportBtn').disabled=!unitsReady();$('exportBtn').textContent=oldLabel||'Export HR Excel';
    }
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
      calendarSyncedAt:state.calendarSyncedAt, conflicts:state.conflicts, special328Dates:[...state.special328Dates], special328Selected:{...state.special328Selected}, savedAt:now, hrExport:state.hrExport
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
      try {
        await loadAckManagerData();
        await syncAckRequests();
      } catch (ackErr) {
        console.warn('prepare acknowledgements failed', ackErr);
      }
      toast('บันทึกรอบนี้แล้ว');
      await writeAppLog('cycle_save','บันทึกรอบ OT',fmtThaiRange(state.cycle.start,state.cycle.end),'',cycleKey);
      await loadHistory();
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
      return `<div class="history-item"><div><b>${esc(fmtThaiRange(r.cycle_start,r.cycle_end))}</b><span>LAB: ${esc(files.LAB||'-')} · Molec: ${esc(files.Molec||'-')} · Bacteria: ${esc(files.Bacteria||'-')}</span><span>บันทึกเมื่อ ${esc(fmtDateTimeThai(r.snapshot_at||r.updated_at))}</span></div><div class="history-actions"><button class="secondary-btn" data-load-cycle="${esc(r.cycle_key)}">เปิดรอบนี้</button><button class="danger-btn" data-delete-cycle="${esc(r.cycle_key)}">ลบรอบ</button></div></div>`;
    }).join('') : '<div class="empty-state">ยังไม่มีรอบที่บันทึกไว้</div>';
  }

  async function deleteSavedCycle(cycleKey) {
    if (!state.sb) return;
    if (!confirm('ยืนยันลบรอบนี้ออกจากฐานข้อมูล?')) return;
    const { error } = await state.sb.from('ot_batches').delete().eq('cycle_key',cycleKey);
    if (error) return toast(`ลบไม่สำเร็จ: ${error.message}`);
    toast('ลบรอบแล้ว');
    await writeAppLog('cycle_delete','ลบรอบ OT',cycleKey,'',cycleKey);
    await loadHistory();
  }

  async function loadSavedCycle(cycleKey) {
    if (!state.sb) return;
    const { data, error } = await state.sb.from('ot_batches').select('payload,snapshot_at').eq('cycle_key',cycleKey).single();
    if (error || !data?.payload) return toast('เปิดข้อมูลไม่สำเร็จ');
    const p=data.payload;
    state.cycle=p.cycle; state.units=p.units||{LAB:null,Molec:null,Bacteria:null}; state.rawFiles={LAB:null,Molec:null,Bacteria:null};
    state.calendarSources=p.calendarSources||[]; state.leaveEvents=p.leaveEvents||[]; state.calendarSyncedAt=p.calendarSyncedAt||null; state.snapshotAt=data.snapshot_at||p.savedAt||null; state.loadedSnapshot=true; state.hrExport=p.hrExport||null; state.special328Dates=cleanSpecial328Dates(p.special328Dates||[]); state.special328Selected=(p.special328Selected&&typeof p.special328Selected==='object')?{...p.special328Selected}:{}; renderSpecial328Dates(); renderSpecial328Eligibility();
    setCycleControls({start:state.cycle.start,end:state.cycle.end});
    for(const unit of UNITS) {
      const u=state.units[unit]; setUnitStatus(unit,u?`✓ ${u.fileName} · ${u.assignments?.length||0} รายการ`:'ไม่มีไฟล์ในรอบนี้',u?'ok':'error');
    }
    $('calendarStatus').className='file-status ok'; $('calendarStatus').textContent=`✓ ใช้วันลาที่บันทึกไว้กับรอบนี้`;
    $('calendarSyncMeta').hidden=false; $('calendarSyncMeta').innerHTML=`<b>บันทึกรอบ:</b> ${esc(fmtDateTimeThai(state.snapshotAt))}<br><b>วันลาที่ใช้:</b> ${esc(fmtDateTimeThai(state.calendarSyncedAt))}`;
    recompute(); await loadAckManagerData(); switchTab('work'); toast('เปิดรอบที่บันทึกไว้แล้ว');
  }

  init().catch(err => { console.error(err); alert(err.message || err); });
})();

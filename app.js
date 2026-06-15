// =============================================================
//  STU-Check — Client-Server Mode (Frontend for GitHub Pages)
//  ภาพนิ่งจาก Webcam → POST Base64 → FastAPI Server (Ngrok)
//  Version: 2.1.0
// =============================================================

// ╔══════════════════════════════════════════════════════════════╗
// ║  🔧 ตั้งค่า URL เซิร์ฟเวอร์ที่นี่  (เปลี่ยนง่าย ๆ)       ║
// ║  วางลิงก์ Ngrok ของคุณแทน YOUR_NGROK_URL ด้านล่าง          ║
// ╚══════════════════════════════════════════════════════════════╝
const DEFAULT_SERVER_URL = 'https://YOUR_NGROK_URL.ngrok-free.app/predict';

// ช่วงเวลาในการส่งภาพไป Server (มิลลิวินาที) — 60000 = 1 นาที
const SCAN_INTERVAL_MS = 60000;

// ===== EMOTION CODE MAP =====
// ตรงกับที่ server.py ส่งกลับมา
// emotion_code: 0 = positive, 1 = negative, 2 = neutral/normal
const EMOTION_CODE = {
  0: { label: 'Positive',  type: 'positive', color: '#0bab6e', icon: 'bi-emoji-smile'   },
  1: { label: 'Negative',  type: 'negative', color: '#e53e3e', icon: 'bi-emoji-frown'   },
  2: { label: 'Normal',    type: 'neutral',  color: '#c98a00', icon: 'bi-emoji-neutral'  },
};

// ===== DATA SERVICE (localStorage) =====
const DataService = {
  _getAccounts() {
    try { return JSON.parse(localStorage.getItem('stucheck_accounts')) || {}; }
    catch(e) { return {}; }
  },
  _saveAccounts(accs) {
    localStorage.setItem('stucheck_accounts', JSON.stringify(accs));
  },
  _currentUser() {
    return localStorage.getItem('stucheck_session') || '';
  },

  async register(username, password) {
    await new Promise(res => setTimeout(res, 200));
    const accs = this._getAccounts();
    if (accs[username]) throw new Error('ชื่อผู้ใช้นี้ถูกใช้งานแล้ว');
    accs[username] = {
      password: password,
      displayName: username,
      uid: '',
      avatar: '',
      created_at: new Date().toISOString()
    };
    this._saveAccounts(accs);
    return { success: true };
  },

  async login(username, password) {
    await new Promise(res => setTimeout(res, 200));
    const accs = this._getAccounts();
    const user = accs[username];
    if (!user || user.password !== password) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    localStorage.setItem('stucheck_session', username);
    localStorage.setItem('stucheck_profile_cache', JSON.stringify({
      username: username,
      displayName: user.displayName,
      uid: user.uid,
      avatar: user.avatar
    }));
    return { success: true, user: { username, displayName: user.displayName, uid: user.uid, avatar: user.avatar } };
  },

  async deleteAccount() {
    await new Promise(res => setTimeout(res, 200));
    const curr = this._currentUser();
    if (!curr) throw new Error('กรุณาเข้าสู่ระบบ');
    const accs = this._getAccounts();
    delete accs[curr];
    this._saveAccounts(accs);
    localStorage.removeItem(`stucheck_scans_${curr}`);
    this.logout();
    return { success: true };
  },

  async loadProfile() {
    const curr = this._currentUser();
    if (!curr) return { displayName: '', uid: '', avatar: '' };
    const accs = this._getAccounts();
    const user = accs[curr] || { displayName: curr, uid: '', avatar: '' };
    const prof = { username: curr, displayName: user.displayName || curr, uid: user.uid || '', avatar: user.avatar || '' };
    localStorage.setItem('stucheck_profile_cache', JSON.stringify(prof));
    return prof;
  },

  loadProfileCached() {
    try {
      return JSON.parse(localStorage.getItem('stucheck_profile_cache')) || { displayName: '', uid: '', avatar: '' };
    } catch (e) {
      const curr = this._currentUser();
      return { displayName: curr, uid: '', avatar: '' };
    }
  },

  async saveProfile(profile) {
    await new Promise(res => setTimeout(res, 200));
    const curr = this._currentUser();
    if (!curr) throw new Error('กรุณาเข้าสู่ระบบ');
    const accs = this._getAccounts();
    if (!accs[curr]) throw new Error('ไม่พบข้อมูลผู้ใช้');
    if (profile.displayName !== undefined) accs[curr].displayName = profile.displayName;
    if (profile.uid !== undefined) accs[curr].uid = profile.uid;
    if (profile.avatar !== undefined) accs[curr].avatar = profile.avatar;
    this._saveAccounts(accs);
    const updatedProf = {
      username: curr,
      displayName: accs[curr].displayName,
      uid: accs[curr].uid,
      avatar: accs[curr].avatar
    };
    localStorage.setItem('stucheck_profile_cache', JSON.stringify(updatedProf));
    return { success: true, profile: updatedProf };
  },

  async saveScan(scanData) {
    const curr = this._currentUser() || 'guest';
    const key = `stucheck_scans_${curr}`;
    let scans = [];
    try { scans = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
    scans.push({
      id: 'scan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      username: curr,
      ...scanData,
      created_at: new Date().toISOString()
    });
    localStorage.setItem(key, JSON.stringify(scans));
    return { success: true };
  },

  async getScans(sessionId) {
    const curr = this._currentUser() || 'guest';
    const key = `stucheck_scans_${curr}`;
    let scans = [];
    try { scans = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
    if (sessionId) scans = scans.filter(s => s.sessionId === sessionId);
    return { success: true, scans };
  },

  logout() {
    localStorage.removeItem('stucheck_session');
    localStorage.removeItem('stucheck_profile_cache');
  }
};

// ===== SERVER URL MANAGEMENT =====
let serverUrl = localStorage.getItem('stucheck_server_url') || DEFAULT_SERVER_URL;

function onServerUrlChange(val) {
  serverUrl = val.trim();
  localStorage.setItem('stucheck_server_url', serverUrl);
  setServerStatus('unknown');
}

async function checkServerStatus() {
  if (!serverUrl || serverUrl.includes('YOUR_NGROK_URL')) {
    setServerStatus('error', 'กรุณาใส่ URL จริงของ Ngrok ก่อน');
    return;
  }
  const healthUrl = serverUrl.replace(/\/predict$/, '/health');
  setServerStatus('checking');
  try {
    const res = await fetch(healthUrl, { method: 'GET', signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      setServerStatus('online', data.model || 'เซิร์ฟเวอร์พร้อมใช้งาน');
    } else {
      setServerStatus('error', `HTTP ${res.status}`);
    }
  } catch (e) {
    if (e.name === 'TimeoutError') setServerStatus('error', 'Timeout — ตรวจสอบ URL หรือ Ngrok อีกครั้ง');
    else setServerStatus('error', 'ไม่สามารถเชื่อมต่อได้');
  }
}

function setServerStatus(state, msg) {
  const pill = document.getElementById('server-status-pill');
  const msgEl = document.getElementById('server-status-msg');
  if (!pill) return;
  const styles = {
    online:   { bg:'rgba(11,171,110,0.14)',  color:'#0bab6e', border:'rgba(11,171,110,0.3)',  text:'เชื่อมต่อแล้ว' },
    error:    { bg:'rgba(229,62,62,0.12)',   color:'#e53e3e', border:'rgba(229,62,62,0.3)',   text:'ไม่สามารถเชื่อมต่อ' },
    checking: { bg:'rgba(67,97,238,0.12)',   color:'#4361ee', border:'rgba(67,97,238,0.3)',   text:'กำลังตรวจสอบ...' },
    unknown:  { bg:'rgba(201,138,0,0.12)',   color:'#c98a00', border:'rgba(201,138,0,0.3)',   text:'ไม่ทราบสถานะ' },
  };
  const s = styles[state] || styles.unknown;
  pill.style.background    = s.bg;
  pill.style.color         = s.color;
  pill.style.borderColor   = s.border;
  pill.innerHTML = `<i class="bi bi-circle-fill" style="font-size:7px;"></i>${s.text}`;
  if (msgEl) msgEl.textContent = msg || '';
}

// ===== CAMERA PERMISSION =====
async function requestCameraPermission() {
  const btn   = document.getElementById('perm-btn');
  const errEl = document.getElementById('perm-error');
  btn.innerHTML = '<i class="bi bi-hourglass-split"></i>กำลังขออนุญาต...';
  btn.disabled = true; errEl.style.display = 'none';
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    s.getTracks().forEach(t => t.stop());
    document.getElementById('page-camperm').classList.remove('active');
    document.getElementById('page-login').classList.add('active');
  } catch (e) {
    btn.innerHTML = '<i class="bi bi-camera-video-fill"></i>ลองอีกครั้ง';
    btn.disabled = false; errEl.style.display = 'flex';
    const msgs = {
      NotAllowedError: 'ถูกปฏิเสธสิทธิ์ กรุณาอนุญาตกล้องในแถบที่อยู่เบราว์เซอร์ แล้วรีโหลดหน้า',
      NotFoundError:   'ไม่พบกล้องในอุปกรณ์นี้ กรุณาเชื่อมต่อ Webcam แล้วลองใหม่'
    };
    document.getElementById('perm-error-msg').textContent = msgs[e.name] || ('เกิดข้อผิดพลาด: ' + e.message);
  }
}
function skipPermission() {
  document.getElementById('page-camperm').classList.remove('active');
  document.getElementById('page-login').classList.add('active');
}

// ===== AUTH =====
let currentUser = '';
let isRegisterMode = false;

function showAuthError(msg) {
  const err    = document.getElementById('login-error');
  const errMsg = document.getElementById('login-error-msg');
  const suc    = document.getElementById('login-success');
  suc.style.display = 'none';
  errMsg.textContent = msg;
  err.style.display = 'flex';
}
function showAuthSuccess() {
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('login-success').style.display = 'flex';
}
function hideAuthMessages() {
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('login-success').style.display = 'none';
}

function toggleAuthMode() {
  isRegisterMode = !isRegisterMode;
  hideAuthMessages();
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  const confirmGroup = document.getElementById('confirm-pass-group');
  const btnText      = document.getElementById('btn-auth-text');
  const toggleBtn    = document.getElementById('btn-toggle-mode');
  if (isRegisterMode) {
    confirmGroup.style.display = 'block';
    btnText.textContent = 'สมัครสมาชิก';
    toggleBtn.innerHTML = 'มีบัญชีแล้ว? <strong>เข้าสู่ระบบ</strong>';
    document.getElementById('login-confirm-pass').value = '';
  } else {
    confirmGroup.style.display = 'none';
    btnText.textContent = 'เข้าสู่ระบบ';
    toggleBtn.innerHTML = 'ยังไม่มีบัญชี? <strong>สมัครสมาชิก</strong>';
  }
}

async function doAuth() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  if (!u || !p) { showAuthError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'); return; }
  if (u.length < 3) { showAuthError('ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร'); return; }
  if (p.length < 4) { showAuthError('รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร'); return; }
  try {
    if (isRegisterMode) {
      const cp = document.getElementById('login-confirm-pass').value;
      if (p !== cp) { showAuthError('รหัสผ่านไม่ตรงกัน กรุณากรอกใหม่'); return; }
      await DataService.register(u, p);
      isRegisterMode = false;
      toggleAuthMode();
      showAuthSuccess();
      document.getElementById('login-user').value = u;
      return;
    }
    const data = await DataService.login(u, p);
    if (data.success) { hideAuthMessages(); loginAs(u, data.user); }
  } catch (e) { showAuthError(e.message); }
}

function loginAs(u, userData) {
  currentUser = u;
  const prof = userData || DataService.loadProfileCached();
  if (!prof.displayName) prof.displayName = u;
  refreshNavProfile(prof);
  document.getElementById('page-login').classList.remove('active');
  document.getElementById('page-app').classList.add('active');
  initCharts();
  addLog('🎉 เข้าสู่ระบบสำเร็จ: ' + (prof.displayName || u));

  // โหลด server URL ที่เคยบันทึกไว้
  const savedUrl = localStorage.getItem('stucheck_server_url');
  const input = document.getElementById('server-url-input');
  if (savedUrl) {
    if (input) input.value = savedUrl;
    serverUrl = savedUrl;
  } else {
    if (input) input.value = (DEFAULT_SERVER_URL !== 'https://YOUR_NGROK_URL.ngrok-free.app/predict') ? DEFAULT_SERVER_URL : '';
  }
}

function refreshNavProfile(prof) {
  if (!prof) prof = DataService.loadProfileCached();
  const dn = prof.displayName || currentUser;
  document.getElementById('nav-username').textContent = dn;
  document.getElementById('dd-name').textContent = dn;
  document.getElementById('dd-id').textContent = 'ID: ' + currentUser + (prof.uid ? ' | UID: ' + prof.uid : '');
  const letter = dn.charAt(0).toUpperCase() || '?';
  document.getElementById('nav-avatar-letter').textContent = letter;
  const navImg = document.getElementById('nav-avatar-img');
  if (prof.avatar) {
    navImg.src = prof.avatar; navImg.style.display = 'block';
    document.getElementById('nav-avatar-letter').style.display = 'none';
  } else {
    navImg.style.display = 'none';
    document.getElementById('nav-avatar-letter').style.display = 'block';
  }
}

// Auto-login on page load
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });
  document.getElementById('login-user').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-pass').focus(); });
  const confirmPass = document.getElementById('login-confirm-pass');
  if (confirmPass) confirmPass.addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });

  // Restore dark mode
  const savedTheme = localStorage.getItem('stucheck_theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    const darkToggle = document.getElementById('dark-toggle');
    if (darkToggle) darkToggle.checked = (savedTheme === 'dark');
  }

  // Restore server URL in input
  const savedUrl  = localStorage.getItem('stucheck_server_url');
  const urlInput  = document.getElementById('server-url-input');
  if (urlInput && savedUrl) urlInput.value = savedUrl;

  // Auto-login from saved session
  const savedToken = localStorage.getItem('stucheck_session');
  if (savedToken) {
    DataService.loadProfile().then(prof => {
      if (prof && prof.username) loginAs(prof.username, prof);
    }).catch(() => {
      const cached = DataService.loadProfileCached();
      if (cached && cached.username) { currentUser = cached.username; loginAs(cached.username, cached); }
    });
  }
});

function doLogout() {
  stopCamera();
  currentUser = '';
  DataService.logout();
  document.getElementById('page-app').classList.remove('active');
  document.getElementById('page-login').classList.add('active');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  hideAuthMessages();
  isDataSaved = true;
}

// ===== DROPDOWN =====
function toggleDropdown() {
  document.getElementById('profile-btn').classList.toggle('open');
  document.getElementById('profile-dropdown').classList.toggle('open');
}
function closeDropdown() {
  document.getElementById('profile-btn').classList.remove('open');
  document.getElementById('profile-dropdown').classList.remove('open');
}
document.addEventListener('click', e => {
  const profileBtn      = document.getElementById('profile-btn');
  const profileDropdown = document.getElementById('profile-dropdown');
  if (profileBtn && profileDropdown && !profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) closeDropdown();
});

// ===== TABS =====
function switchTab(n) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab,.mobile-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + n).classList.add('active');
  const map = { camera: ['dt-camera','mt-camera'], dashboard: ['dt-dashboard','mt-dashboard'], about: ['dt-about','mt-about'] };
  (map[n] || []).forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('active'); });
  if (n === 'dashboard') updateDashboard();
}

// ===== SETTINGS =====
function openSettings() {
  const prof = DataService.loadProfileCached();
  const displayInput = document.getElementById('setting-displayname');
  displayInput.value = prof.displayName || currentUser;
  displayInput.placeholder = currentUser;
  document.getElementById('setting-uid').value = prof.uid || '';
  const letter = (prof.displayName || currentUser).charAt(0).toUpperCase() || '?';
  document.getElementById('settings-avatar-letter').textContent = letter;
  const img = document.getElementById('settings-avatar-img');
  if (prof.avatar) { img.src = prof.avatar; img.style.display = 'block'; document.getElementById('settings-avatar-letter').style.display = 'none'; }
  else { img.style.display = 'none'; document.getElementById('settings-avatar-letter').style.display = 'block'; }
  document.getElementById('settings-overlay').classList.add('open');
  loadCameras();
}
function closeSettings() { document.getElementById('settings-overlay').classList.remove('open'); }
function settingsOut(e) { if (e.target === document.getElementById('settings-overlay')) closeSettings(); }

function handleAvatarChange(event) {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 2 * 1024 * 1024) { alert('รูปภาพต้องมีขนาดไม่เกิน 2MB'); return; }
  const reader = new FileReader();
  reader.onload = function (e) {
    const data = e.target.result;
    const img = document.getElementById('settings-avatar-img');
    img.src = data; img.style.display = 'block';
    document.getElementById('settings-avatar-letter').style.display = 'none';
    DataService.saveProfile({ avatar: data }).then(() => {
      refreshNavProfile(); addLog('เปลี่ยนรูปโปรไฟล์แล้ว');
    }).catch(err => { addLog('บันทึกรูปไม่สำเร็จ: ' + err.message); });
  };
  reader.readAsDataURL(file);
}

async function saveAccountSettings(event) {
  const dn  = document.getElementById('setting-displayname').value.trim();
  const uid = document.getElementById('setting-uid').value.trim();
  const btn = event.target.closest('button');
  const orig = btn.innerHTML;
  try {
    await DataService.saveProfile({ displayName: dn, uid: uid });
    refreshNavProfile();
    addLog('บันทึกข้อมูลบัญชี' + (dn ? ' ชื่อ: ' + dn : '') + (uid ? ' UID: ' + uid : ''));
    btn.innerHTML = '<i class="bi bi-check-lg"></i>บันทึกแล้ว!';
    btn.style.background = 'var(--positive)';
    setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 1600);
  } catch (e) {
    btn.innerHTML = '<i class="bi bi-x-lg"></i>ผิดพลาด';
    btn.style.background = 'var(--negative)';
    setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 1600);
  }
}

function openDeleteConfirmModal() { document.getElementById('delete-confirm-overlay').classList.add('open'); }
function closeDeleteConfirmModal() { document.getElementById('delete-confirm-overlay').classList.remove('open'); }
async function doDeleteAccount() {
  try {
    await DataService.deleteAccount();
    closeDeleteConfirmModal(); closeSettings(); doLogout();
    addLog('ลบบัญชีผู้ใช้สำเร็จ');
  } catch (e) { addLog('ลบบัญชีไม่สำเร็จ: ' + e.message); }
}

function toggleDark(el) {
  const isDark = el.checked;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('stucheck_theme', isDark ? 'dark' : 'light');
  const fg = isDark ? '#8b9fc8' : '#4a5580';
  Chart.defaults.color = fg;
  Chart.defaults.borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  if (pieChart) [pieChart, barChart, lineChart].forEach(c => {
    c.options.plugins.legend.labels.color = fg; c.update();
  });
}

// ===== CAMERAS =====
let selectedDeviceId = null, camWatcher = null;
async function loadCameras() {
  const sel     = document.getElementById('cam-select');
  const noDevEl = document.getElementById('cam-no-device');
  const wrapEl  = document.getElementById('cam-select-wrap');
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const cams = devs.filter(d => d.kind === 'videoinput' && d.deviceId && d.deviceId !== '');
    if (!cams.length) { noDevEl.style.display = 'flex'; wrapEl.style.display = 'none'; startCamWatcher(); return; }
    noDevEl.style.display = 'none'; wrapEl.style.display = 'block'; stopCamWatcher();
    sel.innerHTML = '';
    cams.forEach((c, i) => {
      const o = document.createElement('option');
      o.value = c.deviceId; o.textContent = c.label || `กล้อง ${i + 1}`;
      if (c.deviceId === selectedDeviceId) o.selected = true;
      sel.appendChild(o);
    });
    if (!selectedDeviceId) selectedDeviceId = cams[0].deviceId;
  } catch (e) { noDevEl.style.display = 'flex'; wrapEl.style.display = 'none'; }
}
function startCamWatcher() {
  if (camWatcher) return;
  camWatcher = setInterval(async () => {
    if (!document.getElementById('settings-overlay').classList.contains('open')) { stopCamWatcher(); return; }
    const devs = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    if (devs.filter(d => d.kind === 'videoinput' && d.deviceId).length) loadCameras();
  }, 2000);
}
function stopCamWatcher() { if (camWatcher) { clearInterval(camWatcher); camWatcher = null; } }
navigator.mediaDevices.addEventListener('devicechange', () => {
  if (document.getElementById('settings-overlay').classList.contains('open')) loadCameras();
});
function changeCam(id) {
  selectedDeviceId = id;
  const lbl = document.getElementById('cam-select').selectedOptions[0]?.text || id;
  addLog('เปลี่ยนกล้อง: ' + lbl);
  if (detecting) { stopCamera(); setTimeout(() => startCamera(), 400); }
}

// ===== CONSENT =====
let consentSkipped = localStorage.getItem('stucheck_consent_skip') === '1';

function handleToggle() {
  if (!detecting) {
    if (!isDataSaved && S.history.length > 0) {
      showUnsavedConfirmModal();
    } else if (consentSkipped) {
      startCamera();
    } else {
      document.getElementById('consent-skip').checked = false;
      document.getElementById('consent-overlay').classList.add('open');
    }
  } else stopCamera();
}
function closeConsent() { document.getElementById('consent-overlay').classList.remove('open'); }
async function consentOk() {
  if (document.getElementById('consent-skip').checked) {
    consentSkipped = true;
    localStorage.setItem('stucheck_consent_skip', '1');
  }
  closeConsent();
  startCamera();
}

// ===== UNSAVED CONFIRM =====
function showUnsavedConfirmModal() { document.getElementById('unsaved-confirm-overlay').classList.add('open'); }
function closeUnsavedConfirmModal() { document.getElementById('unsaved-confirm-overlay').classList.remove('open'); }
function exportReportAndClose() {
  if (!S.history.length) { alert('ไม่มีข้อมูลสำหรับบันทึก'); return; }
  exportReport(); closeUnsavedConfirmModal();
}
function confirmStartNewSession() {
  closeUnsavedConfirmModal();
  isDataSaved = true;
  if (consentSkipped) startCamera();
  else { document.getElementById('consent-skip').checked = false; document.getElementById('consent-overlay').classList.add('open'); }
}

// =================================================================
//  🎥 CAMERA & SERVER COMMUNICATION
//  หัวใจหลักของระบบ Client-Server
// =================================================================
let stream = null, detecting = false, timerInterval = null, scanInterval = null, startTime = null;
let S = { rounds: 0, score: 0, posTotal: 0, negTotal: 0, neuTotal: 0, history: [] };
let currentSessionId = '';
let isDataSaved      = true;
let isSending        = false;        // ป้องกันส่งซ้อน
let nextScanCountdown = null;        // countdown timer สำหรับแสดงบนหน้าจอ
let countdownSec = 0;

async function startCamera() {
  const con = {
    video: selectedDeviceId
      ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  };
  try {
    stream = await navigator.mediaDevices.getUserMedia(con);
    const v = document.getElementById('video');
    v.srcObject = stream;
    await new Promise(res => { v.onloadedmetadata = () => { v.play().then(res); }; });

    document.getElementById('cam-placeholder').style.display = 'none';
    document.getElementById('live-pill').classList.add('show');
    document.getElementById('cam-status-text').textContent = 'กำลังทำงาน (LIVE)';
    const btn = document.getElementById('btn-toggle'); btn.className = 'btn-toggle stop';
    document.getElementById('btn-icon').className = 'bi bi-stop-fill';
    document.getElementById('btn-text').textContent = 'หยุดกล้อง';
    detecting = true; startTime = Date.now();
    currentSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    S = { rounds: 0, score: 0, posTotal: 0, negTotal: 0, neuTotal: 0, history: [] };
    isDataSaved = true;
    startTimer();

    // ── สแกนรอบแรกทันที (หลัง 1.5 วินาที ให้กล้องพร้อม) ──
    setTimeout(() => { if (detecting) captureAndSend(); }, 1500);

    // ── setInterval ส่งภาพทุก SCAN_INTERVAL_MS (60 วินาที) ──
    scanInterval = setInterval(() => { if (detecting) captureAndSend(); }, SCAN_INTERVAL_MS);

    // ── Countdown แสดงว่าเหลืออีกกี่วินาที ──
    countdownSec = Math.floor(SCAN_INTERVAL_MS / 1000);
    nextScanCountdown = setInterval(() => {
      countdownSec--;
      if (countdownSec <= 0) countdownSec = Math.floor(SCAN_INTERVAL_MS / 1000);
      const el = document.getElementById('next-scan-badge');
      if (el) el.textContent = `${countdownSec}s`;
    }, 1000);

    addLog(`✅ เปิดกล้องสำเร็จ — ส่งภาพไป Server ทุก ${SCAN_INTERVAL_MS / 1000} วินาที`);
  } catch (e) {
    const msgs = {
      NotAllowedError:   'ถูกปฏิเสธสิทธิ์เข้าถึงกล้อง กรุณาอนุญาตกล้องในเบราว์เซอร์แล้วลองใหม่',
      NotFoundError:     'ไม่พบอุปกรณ์กล้องตัวนี้ หรือไม่ได้เชื่อมต่อกล้อง Webcam',
      NotReadableError:  'กล้องกำลังถูกใช้งานโดยโปรแกรมอื่นอยู่'
    };
    addLog('❌ ไม่สามารถเปิดกล้องได้: ' + (msgs[e.name] || e.message));
  }
}

function stopCamera() {
  detecting = false;
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  clearInterval(timerInterval);
  clearInterval(scanInterval);
  clearInterval(nextScanCountdown);
  const v = document.getElementById('video'); v.srcObject = null;
  document.getElementById('cam-placeholder').style.display = 'flex';
  document.getElementById('live-pill').classList.remove('show');
  document.getElementById('cam-status-text').textContent = 'กล้องหยุดทำงาน';
  const btn = document.getElementById('btn-toggle'); btn.className = 'btn-toggle start';
  document.getElementById('btn-icon').className = 'bi bi-play-fill';
  document.getElementById('btn-text').textContent = 'เริ่มกล้อง';
  document.getElementById('face-count').textContent = '0';
  document.getElementById('face-sub').textContent = 'กล้องหยุดแล้ว';
  document.getElementById('timer-display').textContent = '00:00';
  const el = document.getElementById('next-scan-badge'); if (el) el.textContent = '—';
  addLog('⏹ หยุดกล้อง');
}

// =================================================================
//  📸 CAPTURE FRAME → ส่ง Base64 → FastAPI /predict → รับ emotion_code
// =================================================================
async function captureAndSend() {
  if (!detecting || isSending) return;

  // ── ตรวจสอบว่ามี Server URL ──
  if (!serverUrl || serverUrl.includes('YOUR_NGROK_URL')) {
    addLog('⚠ ยังไม่ได้ตั้งค่า Server URL — กรุณากรอก Ngrok URL ก่อน');
    return;
  }

  isSending = true;
  addLog('📸 กำลังถ่ายภาพและส่งไป Server...');

  try {
    // 1️⃣ วาดเฟรมจากวิดีโอลง Canvas ชั่วคราว
    const video    = document.getElementById('video');
    const offscreen = document.createElement('canvas');
    offscreen.width  = video.videoWidth  || 640;
    offscreen.height = video.videoHeight || 480;
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);

    // 2️⃣ แปลงเป็น Base64 JPEG (quality 0.75 ประหยัด bandwidth)
    const imageBase64 = offscreen.toDataURL('image/jpeg', 0.75).split(',')[1];

    // 3️⃣ POST ไป FastAPI /predict
    const response = await fetch(serverUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ image: imageBase64, session_id: currentSessionId }),
      signal:  AbortSignal.timeout(30000) // timeout 30 วินาที
    });

    if (!response.ok) {
      throw new Error(`Server ตอบกลับ HTTP ${response.status}`);
    }

    // 4️⃣ รับ JSON response
    // ตัวอย่าง: { "status":"success", "emotion_code":0, "faces":5, "positive":3, "negative":1, "neutral":1 }
    const data = await response.json();

    if (data.status !== 'success') {
      throw new Error(data.message || 'Server ตอบกลับไม่สำเร็จ');
    }

    // 5️⃣ นำค่าที่ได้มาอัปเดต UI และสถิติ
    handleServerResponse(data);

  } catch (e) {
    const msg = e.name === 'TimeoutError' ? 'Timeout — Server ใช้เวลานานเกินไป' : e.message;
    addLog('❌ ส่งภาพไม่สำเร็จ: ' + msg);
    setServerStatus('error', msg);
  } finally {
    isSending = false;
    // reset countdown
    countdownSec = Math.floor(SCAN_INTERVAL_MS / 1000);
  }
}

// =================================================================
//  📊 UPDATE UI จากผล Response ของ Server
// =================================================================
function handleServerResponse(data) {
  // data คือ JSON ที่ server ส่งกลับมา เช่น:
  // { status:"success", emotion_code:0, faces:5, positive:3, negative:1, neutral:1 }

  const emoCode = data.emotion_code ?? 2;            // 0=pos, 1=neg, 2=neu
  const emo     = EMOTION_CODE[emoCode] || EMOTION_CODE[2];

  // จำนวนใบหน้า
  const faces = data.faces    ?? 0;
  const pos   = data.positive ?? (emoCode === 0 ? 1 : 0);
  const neg   = data.negative ?? (emoCode === 1 ? 1 : 0);
  const neu   = data.neutral  ?? (emoCode === 2 ? 1 : 0);
  const total = faces || (pos + neg + neu) || 1;

  // ── อัปเดต face count (with bump animation) ──
  const faceEl = document.getElementById('face-count');
  faceEl.textContent = total;
  faceEl.classList.remove('bump');
  void faceEl.offsetWidth; // reflow
  faceEl.classList.add('bump');

  document.getElementById('face-sub').textContent = `ตรวจพบ ${total} ใบหน้า | ${emo.label}`;
  document.getElementById('count-pos').textContent = pos;
  document.getElementById('count-neg').textContent = neg;

  // ── อัปเดต progress bars ──
  const pp = Math.round(pos / total * 100);
  const pn = Math.round(neg / total * 100);
  const pu = Math.round(neu / total * 100);
  document.getElementById('bar-pos').style.width = pp + '%'; document.getElementById('pct-pos').textContent = pp + '%';
  document.getElementById('bar-neg').style.width = pn + '%'; document.getElementById('pct-neg').textContent = pn + '%';
  document.getElementById('bar-neu').style.width = pu + '%'; document.getElementById('pct-neu').textContent = pu + '%';

  // ── สะสมสถิติ ──
  S.rounds++;
  S.posTotal += pos;
  S.negTotal += neg;
  S.neuTotal += neu;
  S.score    += (pos - neg);
  S.history.push({ time: Math.round((Date.now() - startTime) / 1000), pos, neg, neu, faces: total, emotionCode: emoCode });
  isDataSaved = false;

  document.getElementById('scan-rounds').textContent = S.rounds;
  document.getElementById('score-total').textContent = S.score;

  // ── บรรยากาศ ──
  const atm = document.getElementById('atmosphere-badge');
  if (pp >= 60)      { atm.textContent = '🟢 ดีมาก';        atm.style.color = 'var(--positive)'; }
  else if (pn >= 50) { atm.textContent = '🔴 ต้องปรับปรุง'; atm.style.color = 'var(--negative)'; }
  else               { atm.textContent = '🟡 ปานกลาง';       atm.style.color = 'var(--neutral)';  }

  // ── Log ──
  addLog(`✅ รอบ ${S.rounds}: ${total} คน | ${emo.label} | +${pos} -${neg} ~${neu}`);
  setServerStatus('online', `ตอบกลับล่าสุด: รอบที่ ${S.rounds}`);

  // ── บันทึกลง localStorage ──
  DataService.saveScan({
    sessionId:   currentSessionId,
    round:       S.rounds,
    timeSec:     Math.round((Date.now() - startTime) / 1000),
    faces:       total,
    positive:    pos,
    negative:    neg,
    neutral:     neu,
    emotionCode: emoCode
  }).catch(err => console.warn('Save scan failed:', err.message));

  if (document.getElementById('tab-dashboard').classList.contains('active')) updateDashboard();
}

// ===== TIMER =====
function startTimer() {
  timerInterval = setInterval(() => {
    const e = Math.floor((Date.now() - startTime) / 1000);
    document.getElementById('timer-display').textContent =
      String(Math.floor(e / 60)).padStart(2, '0') + ':' + String(e % 60).padStart(2, '0');
  }, 1000);
}

function addLog(msg) {
  const a = document.getElementById('log-area');
  if (!a) return;
  const n = new Date();
  const t = n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0') + ':' + n.getSeconds().toString().padStart(2,'0');
  const d = document.createElement('div'); d.className = 'log-entry';
  d.innerHTML = `<span class="log-time">[${t}]</span><span>${msg}</span>`;
  a.insertBefore(d, a.firstChild);
  if (a.children.length > 40) a.removeChild(a.lastChild);
}

// ===== CHARTS =====
let pieChart, barChart, lineChart;
function initCharts() {
  const fg = document.documentElement.getAttribute('data-theme') === 'dark' ? '#8b9fc8' : '#4a5580';
  Chart.defaults.color = fg;
  Chart.defaults.borderColor = 'rgba(0,0,0,0.06)';
  Chart.defaults.font.family = "'Noto Sans Thai','IBM Plex Sans',sans-serif";

  // ── Destroy old charts if re-init ──
  if (pieChart)  { pieChart.destroy();  }
  if (barChart)  { barChart.destroy();  }
  if (lineChart) { lineChart.destroy(); }

  pieChart = new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data: {
      labels: ['Positive', 'Negative', 'Normal'],
      datasets: [{ data: [0,0,0], backgroundColor: ['#0bab6e','#e53e3e','#c98a00'], borderWidth:0, hoverOffset:8 }]
    },
    options: { responsive:true, cutout:'65%', plugins: { legend: { position:'bottom', labels: { color:fg, padding:14, font:{ size:12 } } } } }
  });

  barChart = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        { label:'Positive', data:[], backgroundColor:'rgba(11,171,110,0.85)', borderRadius:5 },
        { label:'Negative', data:[], backgroundColor:'rgba(229,62,62,0.85)',  borderRadius:5 },
        { label:'Normal',   data:[], backgroundColor:'rgba(201,138,0,0.85)',  borderRadius:5 }
      ]
    },
    options: {
      responsive:true,
      plugins: { legend: { labels: { color:fg, font:{ size:12 } } } },
      scales: {
        x: { stacked:true, grid:{ display:false }, ticks:{ color:'#8b97c8' } },
        y: { stacked:true, beginAtZero:true, ticks:{ color:'#8b97c8' } }
      }
    }
  });

  lineChart = new Chart(document.getElementById('lineChart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label:'Positive', data:[], borderColor:'#0bab6e', backgroundColor:'rgba(11,171,110,0.1)', tension:.4, fill:true, pointRadius:3 },
        { label:'Negative', data:[], borderColor:'#e53e3e', backgroundColor:'rgba(229,62,62,0.1)',  tension:.4, fill:true, pointRadius:3 }
      ]
    },
    options: {
      responsive:true,
      plugins: { legend: { labels: { color:fg, font:{ size:12 } } } },
      scales: { x: { ticks:{ color:'#8b97c8' } }, y: { beginAtZero:true, ticks:{ color:'#8b97c8' } } }
    }
  });
}

function updateDashboard() {
  const h = S.history, p = S.posTotal, n = S.negTotal, u = S.neuTotal, t = p + n + u || 1;
  document.getElementById('d-total-scans').textContent = S.rounds;
  document.getElementById('d-avg-pos').textContent = Math.round(p / t * 100) + '%';
  document.getElementById('d-avg-neg').textContent = Math.round(n / t * 100) + '%';
  document.getElementById('d-score').textContent = S.score;
  pieChart.data.datasets[0].data = [p, n, u]; pieChart.update();
  const r = h.slice(-12);
  barChart.data.labels            = r.map((_, i) => '#' + (h.length - r.length + i + 1));
  barChart.data.datasets[0].data  = r.map(x => x.pos);
  barChart.data.datasets[1].data  = r.map(x => x.neg);
  barChart.data.datasets[2].data  = r.map(x => x.neu);
  barChart.update();
  lineChart.data.labels           = r.map(x => { const m = Math.floor(x.time/60), s = x.time%60; return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0'); });
  lineChart.data.datasets[0].data = r.map(x => x.pos);
  lineChart.data.datasets[1].data = r.map(x => x.neg);
  lineChart.update();
}

function exportReport() {
  if (!S.history.length) { alert('ยังไม่มีข้อมูล'); return; }
  let csv = 'รอบ,เวลา(วินาที),ใบหน้าทั้งหมด,Positive,Negative,Normal,emotion_code\n';
  S.history.forEach((r, i) => { csv += `${i+1},${r.time},${r.faces},${r.pos},${r.neg},${r.neu},${r.emotionCode ?? ''}\n`; });
  const b = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8;' });
  const u = URL.createObjectURL(b); const a = document.createElement('a');
  a.href = u; a.download = 'STU-Check-Report.csv'; a.click(); URL.revokeObjectURL(u);
  addLog('📄 ส่งออกรายงาน CSV สำเร็จ');
  isDataSaved = true;
}

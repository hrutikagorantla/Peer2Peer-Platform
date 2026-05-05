// Shared helpers used by every page: Supabase client, auth, sidebar markup,
// toast, dark mode, icons. Loaded as a plain script before each page's own
// inline JS, so everything below ends up on `window`.

const SUPABASE_URL = 'https://ldyeontdcsaipzzpxoax.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkeWVvbnRkY3NhaXB6enB4b2F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4OTI5NzgsImV4cCI6MjA4ODQ2ODk3OH0.6KZZYXRaEYh1H3vfwKajg8TnHAJrzBf06XTTZz1M5RM';

// Override in prod by setting window.TUIT_ML_URL before this script loads.
const ML_URL = (typeof window !== 'undefined' && window.TUIT_ML_URL) || 'http://localhost:8000';

// Returns null when the ML service is unreachable so callers can fall back.
async function ml(path, body) {
  try {
    const res = await fetch(`${ML_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`ML ${path} → ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`[ml] ${path} failed:`, e.message);
    return null;
  }
}

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

async function getSession() {
  try {
    const { data } = await db.auth.getSession();
    return data?.session ?? null;
  } catch { return null; }
}

async function getCurrentUser() {
  try {
    const session = await getSession();
    if (!session) return null;

    const { data } = await db
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (data) return data;

    // Trigger should have inserted this on signup; create it ourselves if not.
    const meta = session.user.user_metadata || {};
    const newUser = {
      id: session.user.id,
      email: session.user.email,
      full_name: meta.full_name || session.user.email.split('@')[0],
      role: meta.role || 'student',
      is_active: true
    };
    const { data: created } = await db.from('users').upsert(newUser).select().single();
    return created || null;
  } catch (e) {
    console.error('getCurrentUser failed:', e.message);
    return null;
  }
}

async function requireAuth() {
  const session = await getSession();
  if (!session) { window.location.href = 'login.html'; return null; }
  return session;
}

// ── Onboarding gate ───────────────────────────────────────────────────────
// Returns true if user still needs onboarding. Redirects them there.
async function ensureOnboarded(user) {
  if (!user) return false;
  // Primary check: explicit flag set by onboarding.html
  if (user.onboarding_completed === true) return false;
  // Fallback for legacy users who already have a profile filled in
  const hasProfile =
    (user.bio && user.bio.trim()) ||
    (user.subjects && user.subjects.length > 0);
  if (hasProfile) return false;
  // Otherwise, send them to onboarding
  window.location.href = 'onboarding.html';
  return true;
}

async function signOut() {
  await db.auth.signOut();
  sessionStorage.clear();
  window.location.href = 'login.html';
}

const AV_COLORS = [
  ['#b8732e', '#d4a06a'],
  ['#7c6ae8', '#9d8ff0'],
  ['#3a9e6f', '#5ab889'],
  ['#4a8fc2', '#6bafd9'],
  ['#c25a7c', '#d97a98'],
  ['#c28a3a', '#d9a85a'],
];

function avGrad(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AV_COLORS.length;
  return `linear-gradient(135deg,${AV_COLORS[h][0]},${AV_COLORS[h][1]})`;
}
function avInit(name = '') {
  return (name.trim()[0] || '?').toUpperCase();
}
function avHTML(name, size = 38, r = 10) {
  return `<div class="avatar" style="width:${size}px;height:${size}px;border-radius:${r}px;background:${avGrad(name)};font-size:${Math.round(size * .38)}px;">${avInit(name)}</div>`;
}

function showToast(title, msg = '', type = 'info') {
  let t = document.getElementById('gt');
  if (!t) {
    t = document.createElement('div');
    t.id = 'gt'; t.className = 'g-toast';
    document.body.appendChild(t);
  }
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  t.innerHTML = `<span class="g-toast-icon ${type}">${icon}</span>
    <div style="flex:1;min-width:0;"><div class="g-toast-title">${title}</div>${msg ? `<div class="g-toast-sub">${msg}</div>` : ''}</div>
    <button onclick="this.parentElement.classList.remove('show')">×</button>`;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 4500);
}

function setLoading(el, on, txt = '') {
  if (!el) return;
  if (on) {
    el._h = el.innerHTML;
    el.disabled = true;
    el.innerHTML = `<span class="spinner"></span>${txt}`;
  } else {
    el.disabled = false;
    el.innerHTML = el._h || el.innerHTML;
  }
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function initDark() {
  if (localStorage.getItem('dm') === '1') document.documentElement.classList.add('dark');
}
function toggleDark() {
  const on = document.documentElement.classList.toggle('dark');
  localStorage.setItem('dm', on ? '1' : '0');
}

const ICO = {
  brand: `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/></svg>`,
  dash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  cal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 3.5a4 4 0 0 1 0 7.5"/><path d="M22 21a7 7 0 0 0-5-6.7"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  arrowL: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M11 5l-7 7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2.5l3.1 6.3 7 1-5 4.9 1.2 6.9L12 18.3l-6.3 3.3 1.2-6.9-5-4.9 7-1z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12.5 10 17.5 19 7"/></svg>`,
  checkC: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z"/><path d="M19 17l.6 1.7L21 19l-1.4.3L19 21l-.6-1.7L17 19l1.4-.3z"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 4h8v6a4 4 0 0 1-8 0z"/><path d="M5 4h3v3a3 3 0 0 1-3-3zM19 4h-3v3a3 3 0 0 0 3-3z"/><path d="M10 16h4v3h-4zM8 21h8"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>`,
  rupee: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12M6 8h12M6 13l9 8M6 13c0-3 0-3 6-3"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
  help: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.7-2.5 2.3-2.5 4M12 17.5h.01"/></svg>`,
  filter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 5h18M6 12h12M10 19h4"/></svg>`,
  flame: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2c2 4 5 5 5 9a5 5 0 1 1-10 0c0-2 1-3 1-5 1 1 2 2 4 0z"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>`,
};

function buildStudentNav(active) {
  const items = [
    ['index.html', 'dashboard', ICO.dash, 'Dashboard'],
    ['booksession.html', 'book', ICO.book, 'Book a Session'],
    ['mentorsearch.html', 'mentors', ICO.users, 'Find Mentors'],
    ['allsessions.html', 'sessions', ICO.cal, 'My Sessions'],
    ['doubts.html', 'doubts', ICO.help, 'Doubts'],
    ['profile.html', 'profile', ICO.user, 'Profile'],
  ];
  return items.map(([href, id, icon, label]) => {
    const isActive = active === id;
    return `<a class="nav-item ${isActive ? 'active' : ''}" href="${href}">${icon}<span style="flex:1;">${label}</span></a>`;
  }).join('');
}

function buildMentorNav(active) {
  const items = [
    ['index.html', 'dashboard', ICO.dash, 'Dashboard'],
    ['allsessions.html', 'sessions', ICO.cal, 'My Sessions'],
    ['doubts.html', 'doubts', ICO.help, 'Doubts'],
    ['profile.html', 'profile', ICO.user, 'Profile'],
  ];
  return items.map(([href, id, icon, label]) =>
    `<a class="nav-item ${active === id ? 'active' : ''}" href="${href}">${icon}<span style="flex:1;">${label}</span></a>`
  ).join('');
}

function buildSidebar(user, active) {
  const nav = user.role === 'mentor' ? buildMentorNav(active) : buildStudentNav(active);
  const tier = pointsToTier(user.points || 0);
  return `
  <div class="sidebar-brand">
    <div class="sidebar-logo">${ICO.brand}</div>
    <div>
      <div class="sidebar-brand-name">tuit</div>
      <div class="sidebar-brand-sub">Peer-to-peer learning</div>
    </div>
  </div>
  <div class="nav-section">Navigation</div>
  ${nav}
  <div class="sidebar-snapshot">
    <div class="snap-user">
      <div class="snap-avatar" id="snapAvatar" style="background:${avGrad(user.full_name)};">${avInit(user.full_name)}</div>
      <div style="min-width:0;">
        <div class="snap-name" id="snapName">${user.full_name.split(' ').slice(0, 2).map((p, i) => i === 1 ? p[0] + '.' : p).join(' ')}</div>
        <div class="snap-role" id="snapRole">${user.role === 'mentor' ? 'Mentor' : `Student · ${tier.name}`}</div>
      </div>
    </div>
    <div class="snap-stats">
      <div class="snap-stat-label">Points</div>
      <div class="snap-stat-val" id="snapVal">${user.points || 0} pts</div>
      <div class="snap-stat-sub" id="snapSub">${tier.next ? `${tier.toNext} to ${tier.next}` : 'Top tier'}</div>
      <div class="snap-progress"><div class="snap-progress-fill" id="snapBar" style="width:${tier.pct}%"></div></div>
    </div>
    <button class="btn-logout" onclick="signOut()">${ICO.logout} Sign out</button>
  </div>`;
}

function pointsToTier(p) {
  const tiers = [
    { name: 'Beginner', min: 0, next: 'Curious', cap: 400 },
    { name: 'Curious', min: 400, next: 'Pro', cap: 1500 },
    { name: 'Pro', min: 1500, next: 'Mentor', cap: 5000 },
    { name: 'Mentor', min: 5000, next: null, cap: null },
  ];
  const cur = tiers.findLast ? tiers.findLast(t => p >= t.min) : tiers.slice().reverse().find(t => p >= t.min);
  if (!cur.next) return { name: cur.name, next: null, pct: 100, toNext: 0, idx: 3 };
  const range = cur.cap - cur.min;
  const pct = Math.round(((p - cur.min) / range) * 100);
  return { name: cur.name, next: cur.next, pct, toNext: cur.cap - p, idx: tiers.indexOf(cur) };
}

function initSidebarUser(user) {
  const av = document.getElementById('snapAvatar');
  const nm = document.getElementById('snapName');
  const rl = document.getElementById('snapRole');
  if (av) { av.style.background = avGrad(user.full_name); av.textContent = avInit(user.full_name); }
  if (nm) nm.textContent = user.full_name;
  if (rl) rl.textContent = user.role;
}

function emptyState(title, sub, icon = ICO.cal) {
  return `<div class="empty">
    <div class="empty-icon">${icon}</div>
    <div class="empty-title">${title}</div>
    <div class="empty-sub">${sub}</div>
  </div>`;
}

Object.assign(window, {
  db, ml, ML_URL,
  getSession, getCurrentUser, requireAuth, ensureOnboarded, signOut,
  avGrad, avInit, avHTML,
  showToast, setLoading,
  fmtDate, fmtTime, timeAgo,
  initDark, toggleDark,
  buildSidebar, initSidebarUser, pointsToTier,
  emptyState, ICO,
});

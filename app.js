/* ============================================================
   STREAKLY MULTI-HABIT — app.js
   Vanilla JS, localStorage persistence, no dependencies
   ============================================================ */

'use strict';

// ── Constants ────────────────────────────────────────────────

const STORAGE_KEY = 'streakly-multi-v1';

const EMOJIS = ['🧘','🏃','💪','📚','✍️','💧','🥗','😴','🎯','🎸','🌿','🏊','🚴','🧠','💊','🌅','☕','🛏️','🎨','🏋️'];

const COLORS = [
  '#7c6aff','#ff6a9e','#3ecf8e','#ffd166','#66d9e8',
  '#ff8c42','#a78bfa','#34d399','#f87171','#60a5fa',
];

const MILESTONES = [1, 3, 7, 14, 21, 30, 50, 75, 100];

// ── State ─────────────────────────────────────────────────────

let habits    = [];   // Array of habit objects
let activeId  = null; // ID of habit currently shown in detail view
let calOffset = 0;    // Calendar month offset for detail view

/*
  Habit object shape:
  {
    id:        string (uid),
    name:      string,
    emoji:     string,
    color:     string (hex),
    logs:      { "YYYY-MM-DD": true },
    createdAt: ISO string
  }
*/

// ── Modal transient state ─────────────────────────────────────
let modalEmoji = EMOJIS[0];
let modalColor = COLORS[0];
let editingId  = null; // null = new habit, string = editing existing

// ── Date Helpers ──────────────────────────────────────────────

const pad    = n => String(n).padStart(2, '0');
const uid    = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}

function prettyDate(opts) {
  return new Date().toLocaleDateString('en-US', opts);
}

function daysBetween(keyA, keyB) {
  return Math.round((new Date(keyB+'T00:00:00') - new Date(keyA+'T00:00:00')) / 86400000);
}

function addDays(key, n) {
  const d = new Date(key + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning 🌤';
  if (h < 17) return 'Good afternoon ☀️';
  return 'Good evening 🌙';
}

// ── Streak Logic ──────────────────────────────────────────────

function calcStreak(logs) {
  const today = todayKey();
  let cursor  = logs[today] ? today : addDays(today, -1);
  let streak  = 0;
  while (logs[cursor]) { streak++; cursor = addDays(cursor, -1); }
  return streak;
}

function calcBest(logs) {
  const keys = Object.keys(logs).sort();
  if (!keys.length) return 0;
  let best = 0, run = 0, prev = null;
  for (const k of keys) {
    run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = k;
  }
  return best;
}

function calcTotal(logs) {
  return Object.keys(logs).length;
}

function calcMonthRate(logs, year, month) {
  const today    = new Date();
  const isCurrent = today.getFullYear() === year && today.getMonth() === month;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const counted  = isCurrent ? today.getDate() : daysInMonth;
  let done = 0;
  for (let d = 1; d <= counted; d++) {
    if (logs[`${year}-${pad(month+1)}-${pad(d)}`]) done++;
  }
  return counted === 0 ? 0 : Math.round((done / counted) * 100);
}

// ── Persistence ───────────────────────────────────────────────

function loadHabits() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) habits = JSON.parse(raw);
  } catch { habits = []; }
}

function saveHabits() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
  } catch { /* quota */ }
}

// ── Ring Helpers ──────────────────────────────────────────────

const RING_CIRC = 2 * Math.PI * 82; // ≈ 515

function setRing(streak, color) {
  const circle = document.getElementById('ring-fill-circle');
  if (!circle) return;
  const pct    = streak === 0 ? 0 : Math.min(1, Math.log(streak + 1) / Math.log(101));
  circle.style.strokeDashoffset = RING_CIRC * (1 - pct);
  circle.style.stroke  = color || '#7c6aff';
  circle.style.filter  = `drop-shadow(0 0 8px ${hexAlpha(color || '#7c6aff', 0.5)})`;
}

function hexAlpha(hex, a) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Dashboard Render ──────────────────────────────────────────

function renderDashboard() {
  document.getElementById('dashboard-greeting').textContent = greeting();
  document.getElementById('dashboard-date').textContent =
    prettyDate({ weekday:'long', month:'long', day:'numeric', year:'numeric' });

  const listEl  = document.getElementById('habits-list');
  const emptyEl = document.getElementById('empty-state');

  listEl.innerHTML = '';

  if (habits.length === 0) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  const today = todayKey();

  habits.forEach(habit => {
    const streak  = calcStreak(habit.logs);
    const isDone  = !!habit.logs[today];
    const rate    = calcMonthRate(habit.logs, new Date().getFullYear(), new Date().getMonth());

    const card = document.createElement('div');
    card.className = 'habit-card';
    card.style.borderLeftColor = habit.color;
    card.dataset.id = habit.id;

    card.innerHTML = `
      <div class="habit-card-emoji">${habit.emoji}</div>
      <div class="habit-card-body">
        <div class="habit-card-name">${escHtml(habit.name)}</div>
        <div class="habit-card-meta">
          <span class="habit-card-streak" style="color:${habit.color}">
            🔥 ${streak} day${streak !== 1 ? 's' : ''}
          </span>
          <div class="habit-card-progress">
            <div class="habit-card-progress-fill"
                 style="width:${rate}%;background:${habit.color}"></div>
          </div>
          <span style="font-size:11px;color:var(--text-muted)">${rate}%</span>
        </div>
      </div>
      <div class="habit-card-check ${isDone ? 'done' : ''}"
           style="${isDone ? `background:${habit.color};` : ''}">
        ${isDone ? '✓' : ''}
      </div>
      <button class="habit-card-log-btn ${isDone ? 'done' : ''}"
              data-id="${habit.id}" title="Mark done">✓</button>
    `;

    // Open detail on click (not on log button)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.habit-card-log-btn')) return;
      openDetail(habit.id);
    });

    // Quick-log button
    card.querySelector('.habit-card-log-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      quickLog(habit.id);
    });

    listEl.appendChild(card);
  });
}

function quickLog(id) {
  const habit = habits.find(h => h.id === id);
  if (!habit) return;
  const key = todayKey();
  if (habit.logs[key]) return;
  habit.logs[key] = true;
  saveHabits();
  renderDashboard();
  const newStreak = calcStreak(habit.logs);
  if (MILESTONES.includes(newStreak)) launchConfetti();
}

// ── Detail View ───────────────────────────────────────────────

function openDetail(id) {
  activeId  = id;
  calOffset = 0;
  renderDetail();
  showScreen('detail');
}

function renderDetail() {
  const habit = habits.find(h => h.id === activeId);
  if (!habit) return;

  const today  = todayKey();
  const streak = calcStreak(habit.logs);
  const isDone = !!habit.logs[today];

  // Accent CSS variable for this habit
  document.documentElement.style.setProperty('--detail-accent', habit.color);

  // Name & emoji
  document.getElementById('detail-emoji').textContent       = habit.emoji;
  document.getElementById('detail-name-input').value        = habit.name;

  // Ring
  setRing(streak, habit.color);

  // Stats
  document.getElementById('streak-number').textContent = streak;
  document.getElementById('stat-best').textContent     = calcBest(habit.logs);
  document.getElementById('stat-total').textContent    = calcTotal(habit.logs);
  document.getElementById('stat-rate').textContent     =
    calcMonthRate(habit.logs, new Date().getFullYear(), new Date().getMonth()) + '%';

  // Check-in
  document.getElementById('detail-date').textContent = prettyDate({ weekday:'long', month:'long', day:'numeric' });

  const statusEl = document.getElementById('detail-status');
  if (isDone) {
    statusEl.innerHTML = '<span class="done-msg">✓ Done for today — come back tomorrow!</span>';
  } else if (streak > 0) {
    statusEl.innerHTML = `<span>You're on a <strong>${streak}-day streak</strong>. Don't break it!</span>`;
  } else {
    statusEl.innerHTML = '<span>Log your habit to start a streak.</span>';
  }

  const logBtn = document.getElementById('log-btn');
  logBtn.disabled = isDone;
  logBtn.style.background = isDone ? 'var(--green)' : habit.color;
  logBtn.style.boxShadow  = isDone
    ? '0 4px 16px rgba(62,207,142,0.2)'
    : `0 4px 18px ${hexAlpha(habit.color, 0.4)}`;
  logBtn.querySelector('.log-btn-text').textContent = isDone
    ? 'Done for today ✓'
    : 'Mark done for today';

  renderCalendar(habit);
}

function logToday() {
  const habit = habits.find(h => h.id === activeId);
  if (!habit) return;
  const key = todayKey();
  if (habit.logs[key]) return;

  habit.logs[key] = true;
  saveHabits();

  // Animate
  const numEl = document.getElementById('streak-number');
  numEl.classList.remove('pop'); void numEl.offsetWidth; numEl.classList.add('pop');
  const ring = document.getElementById('streak-ring');
  ring.classList.remove('pulse'); void ring.offsetWidth; ring.classList.add('pulse');

  const newStreak = calcStreak(habit.logs);
  renderDetail();
  renderDashboard();

  if (MILESTONES.includes(newStreak)) launchConfetti();
}

// ── Calendar ──────────────────────────────────────────────────

function renderCalendar(habit) {
  const now    = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + calOffset, 1);
  const year   = target.getFullYear();
  const month  = target.getMonth();

  document.getElementById('calendar-month-label').textContent =
    target.toLocaleDateString('en-US', { month:'long', year:'numeric' });

  const grid    = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr    = todayKey();

  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-day empty';
    grid.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key     = `${year}-${pad(month+1)}-${pad(d)}`;
    const cell    = document.createElement('div');
    const isToday = key === todayStr;
    const isPast  = key < todayStr;
    const isDone  = !!habit.logs[key];

    let cls = 'cal-day';
    if (key > todayStr) cls += ' future';
    else if (isToday)   cls += ' today';
    else if (isPast)    cls += ' past';
    if (isDone)         cls += ' done';

    if (isDone) {
      cell.style.background = hexAlpha(habit.color, 0.18);
      cell.style.color      = habit.color;
    }
    if (isToday && isDone) cell.style.outlineColor = habit.color;

    cell.className   = cls;
    cell.textContent = d;
    grid.appendChild(cell);
  }

  document.getElementById('cal-next').disabled =
    year === now.getFullYear() && month === now.getMonth();
}

// ── Add / Edit Modal ──────────────────────────────────────────

function openAddModal() {
  editingId  = null;
  modalEmoji = EMOJIS[0];
  modalColor = COLORS[0];
  document.getElementById('modal-title').textContent    = 'New Habit';
  document.getElementById('modal-habit-name').value     = '';
  document.getElementById('modal-save-btn').textContent = 'Save habit';
  renderEmojiPicker();
  renderColorPicker();
  document.getElementById('habit-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('modal-habit-name').focus(), 80);
}

function closeModal() {
  document.getElementById('habit-modal').classList.add('hidden');
}

function renderEmojiPicker() {
  const wrap = document.getElementById('emoji-picker');
  wrap.innerHTML = '';
  EMOJIS.forEach(em => {
    const btn = document.createElement('button');
    btn.className   = `emoji-opt${em === modalEmoji ? ' selected' : ''}`;
    btn.textContent = em;
    btn.type        = 'button';
    btn.addEventListener('click', () => {
      modalEmoji = em;
      wrap.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    wrap.appendChild(btn);
  });
}

function renderColorPicker() {
  const wrap = document.getElementById('color-picker');
  wrap.innerHTML = '';
  COLORS.forEach(col => {
    const btn = document.createElement('button');
    btn.className   = `color-opt${col === modalColor ? ' selected' : ''}`;
    btn.style.background = col;
    btn.type        = 'button';
    btn.title       = col;
    btn.addEventListener('click', () => {
      modalColor = col;
      wrap.querySelectorAll('.color-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    wrap.appendChild(btn);
  });
}

function saveModalHabit() {
  const name = document.getElementById('modal-habit-name').value.trim();
  if (!name) {
    document.getElementById('modal-habit-name').focus();
    return;
  }

  if (editingId) {
    const habit = habits.find(h => h.id === editingId);
    if (habit) { habit.name = name; habit.emoji = modalEmoji; habit.color = modalColor; }
  } else {
    habits.push({
      id:        uid(),
      name,
      emoji:     modalEmoji,
      color:     modalColor,
      logs:      {},
      createdAt: new Date().toISOString(),
    });
  }

  saveHabits();
  closeModal();
  renderDashboard();
}

// ── Delete Habit ──────────────────────────────────────────────

function deleteActiveHabit() {
  const habit = habits.find(h => h.id === activeId);
  if (!habit) return;
  if (!confirm(`Delete "${habit.name}" and all its data? This cannot be undone.`)) return;
  habits = habits.filter(h => h.id !== activeId);
  activeId = null;
  saveHabits();
  renderDashboard();
  showScreen('dashboard');
}

// ── Save name from detail input ───────────────────────────────

function saveDetailName() {
  const habit = habits.find(h => h.id === activeId);
  if (!habit) return;
  const val = document.getElementById('detail-name-input').value.trim();
  if (val && val !== habit.name) {
    habit.name = val;
    saveHabits();
    renderDashboard();
  }
}

// ── Screen Navigation ─────────────────────────────────────────

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  const el = document.getElementById(`screen-${name}`);
  el.classList.remove('hidden');
  el.classList.add('active');
}

// ── Confetti ──────────────────────────────────────────────────

function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const cols = [...COLORS, '#ffffff'];
  const pieces = Array.from({ length: 130 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -canvas.height * 0.5,
    r: Math.random() * 5 + 3,
    d: Math.random() * 120,
    color: cols[Math.floor(Math.random() * cols.length)],
    tilt: 0, tiltAngle: 0,
    tiltSpeed: Math.random() * 0.07 + 0.04,
    speed: Math.random() * 3 + 2,
    opacity: 1,
  }));

  let frame = 0;
  const MAX = 220;

  (function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r, p.r * 0.5, p.tilt, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();

      p.y += p.speed;
      p.tiltAngle += p.tiltSpeed;
      p.tilt = Math.sin(p.tiltAngle) * 12;
      p.x   += Math.sin(p.d / 40) * 1.5;
      if (frame > MAX * 0.6) p.opacity -= 0.013;
    });
    frame++;
    if (frame < MAX) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  })();
}

// ── Misc ──────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Event Listeners ───────────────────────────────────────────

function initEvents() {
  // Dashboard
  document.getElementById('add-habit-btn').addEventListener('click', openAddModal);
  document.getElementById('empty-add-btn').addEventListener('click', openAddModal);

  // Modal
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-save-btn').addEventListener('click', saveModalHabit);
  document.getElementById('modal-habit-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveModalHabit();
  });
  document.getElementById('habit-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('habit-modal')) closeModal();
  });

  // Detail
  document.getElementById('back-btn').addEventListener('click', () => {
    saveDetailName();
    showScreen('dashboard');
  });
  document.getElementById('log-btn').addEventListener('click', logToday);
  document.getElementById('delete-habit-btn').addEventListener('click', deleteActiveHabit);

  document.getElementById('detail-name-input').addEventListener('blur', saveDetailName);

  // Calendar nav
  document.getElementById('cal-prev').addEventListener('click', () => {
    calOffset--;
    const habit = habits.find(h => h.id === activeId);
    if (habit) renderCalendar(habit);
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calOffset++;
    const habit = habits.find(h => h.id === activeId);
    if (habit) renderCalendar(habit);
  });

  // ESC closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

// ── Boot ──────────────────────────────────────────────────────

function init() {
  loadHabits();
  initEvents();
  renderDashboard();
  showScreen('dashboard');
}

document.addEventListener('DOMContentLoaded', init);
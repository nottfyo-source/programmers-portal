/* ===== بوابة المبرمجين — مزامنة سحابية عبر Firebase ===== */

let tasks = [];
let ideas = [];
let uploads = [];
let currentFilter = 'all';
let currentTab = 'tasks';
let editingId = null;
let editingType = 'task';
let dragSrcIdx = null;
let userName = '';
let deviceId = '';

const firebaseConfig = window.FIREBASE_CONFIG || {};
const cloudReady = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

let db = null;
let storage = null;
let tasksRef = null;
let ideasRef = null;
let uploadsRef = null;

if (cloudReady) {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  storage = firebase.storage();
  tasksRef = db.collection('tasks');
  ideasRef = db.collection('ideas');
  uploadsRef = db.collection('uploads');
}

const STATUS = {
  done:    { label: 'تم الإنجاز', cls: 'done',    badge: 'badge-done',    dot: 'green',  activeCls: 'active-done' },
  notdone: { label: 'لم يتم',     cls: 'notdone', badge: 'badge-notdone', dot: 'red',    activeCls: 'active-notdone' },
  hold:    { label: 'قيد العمل',  cls: 'hold',    badge: 'badge-hold',    dot: 'yellow', activeCls: 'active-hold' },
};

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function displayDate() {
  return new Date().toLocaleDateString('ar-SA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function displayTime() {
  return new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

function setSync(ok, label) {
  const statusEl = document.getElementById('sync-status');
  if (!statusEl) return;
  if (ok) {
    statusEl.innerHTML = '<span class="dot green"></span> <span>متصل مباشر</span>';
    statusEl.className = 'stat-pill sync-pill online';
  } else {
    statusEl.innerHTML = `<span class="dot red"></span> <span>${label || 'خطأ اتصال'}</span>`;
    statusEl.className = 'stat-pill sync-pill offline';
  }
}

function generateDeviceId() {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || '',
    navigator.platform || ''
  ];
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'dev_' + Math.abs(hash).toString(36);
}

function resolveUser() {
  deviceId = localStorage.getItem('liquid-device-id');
  if (!deviceId) {
    deviceId = generateDeviceId();
    localStorage.setItem('liquid-device-id', deviceId);
  }
  userName = localStorage.getItem('liquid-user-name') || '';
}

function listen() {
  tasksRef.orderBy('order', 'asc').onSnapshot((snapshot) => {
    tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (currentTab === 'tasks') renderAll();
    else updateStats();
    setSync(true);
  }, () => setSync(false));

  ideasRef.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
    ideas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (currentTab === 'ideas') renderIdeas();
    else updateStats();
  }, () => setSync(false));

  uploadsRef.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
    uploads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderUploads();
  }, () => setSync(false));
}

async function init() {
  resolveUser();

  if (!cloudReady) {
    document.getElementById('setup-modal').classList.add('open');
    setSync(false, 'بانتظار Firebase');
    return;
  }

  if (!userName) {
    document.getElementById('name-modal').classList.add('open');
    setTimeout(() => document.getElementById('user-name-input').focus(), 300);
  }

  listen();

  document.getElementById('task-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addTask();
  });
  document.getElementById('edit-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') closeModal();
  });
  document.getElementById('user-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveName();
  });
}

async function saveName() {
  const input = document.getElementById('user-name-input');
  const val = input.value.trim();
  if (!val) { shakeInput(input); return; }
  userName = val;
  localStorage.setItem('liquid-user-name', userName);
  localStorage.setItem('liquid-device-id', deviceId);
  if (cloudReady) {
    try {
      await db.collection('devices').doc(deviceId).set({ name: userName, updatedAt: Date.now() });
    } catch (e) {
      console.warn(e);
    }
  }
  document.getElementById('name-modal').classList.remove('open');
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.view-content').forEach(v => v.classList.remove('active'));
  const targetView = document.getElementById(`view-${tab}`);
  if (targetView) targetView.classList.add('active');

  document.querySelectorAll('.selector-card').forEach(card => card.classList.remove('active'));
  const activeCard = document.getElementById(`sel-card-${tab}`);
  if (activeCard) activeCard.classList.add('active');

  const taskStats = document.getElementById('tasks-stats-row');
  const ideaStats = document.getElementById('ideas-stats-row');
  if (tab === 'tasks') {
    if (taskStats) taskStats.style.display = 'flex';
    if (ideaStats) ideaStats.style.display = 'none';
    renderAll();
  } else if (tab === 'ideas') {
    if (taskStats) taskStats.style.display = 'none';
    if (ideaStats) ideaStats.style.display = 'flex';
    renderIdeas();
  } else if (tab === 'upload') {
    if (taskStats) taskStats.style.display = 'none';
    if (ideaStats) ideaStats.style.display = 'none';
    renderUploads();
  }

  const selector = document.getElementById('view-selector');
  if (selector) {
    selector.classList.remove('open');
    document.body.classList.remove('selector-open');
  }

  document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
  const mobBtn = document.getElementById(`mob-btn-${tab}`);
  if (mobBtn) mobBtn.classList.add('active');
  updateStats();
}

function toggleViewDropdown(event) {
  if (event) event.stopPropagation();
  const selector = document.getElementById('view-selector');
  if (!selector) return;
  const isOpen = selector.classList.toggle('open');
  document.body.classList.toggle('selector-open', isOpen);
}

function findItem(id, type) {
  return (type === 'task' ? tasks : ideas).find(item => item.id === id);
}

function openEdit(id, type = 'task') {
  editingId = id;
  editingType = type;
  const item = findItem(id, type);
  if (!item) return;

  document.querySelector('#modal-overlay .modal-title').textContent = type === 'task' ? 'تعديل المهمة' : 'تعديل الفكرة';
  document.getElementById('edit-input').value = item.name || '';
  document.getElementById('edit-desc-input').value = item.description || '';

  const progressGroup = document.getElementById('edit-progress-group');
  progressGroup.style.display = 'block';
  const prog = item.status === 'done' ? 100 : (item.progress || 0);
  document.getElementById('edit-progress-input').value = prog;
  document.getElementById('edit-progress-val').textContent = prog + '%';

  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('edit-input').focus(), 100);
}

function saveEdit() {
  const name = document.getElementById('edit-input').value.trim();
  const description = document.getElementById('edit-desc-input').value.trim();
  if (!name || !editingId || !cloudReady) return;

  const updates = { name, description };
  const progressGroup = document.getElementById('edit-progress-group');
  if (progressGroup.style.display === 'block') {
    const prog = parseInt(document.getElementById('edit-progress-input').value, 10) || 0;
    updates.progress = prog;
    if (prog === 100) updates.status = 'done';
    else if (prog === 0) updates.status = 'notdone';
    else updates.status = 'hold';
  }

  const ref = editingType === 'task' ? tasksRef : ideasRef;
  ref.doc(editingId).update(updates).then(() => closeModal()).catch(err => alert('خطأ: ' + err.message));
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  editingId = null;
}

function addTask() {
  if (!cloudReady) return;
  const nameInput = document.getElementById('task-input');
  const descInput = document.getElementById('task-desc-input');
  const name = nameInput.value.trim();
  const description = descInput.value.trim();
  if (!name) { shakeInput(nameInput); return; }
  if (!userName) {
    document.getElementById('name-modal').classList.add('open');
    return;
  }

  const task = {
    name,
    description,
    status: 'notdone',
    order: tasks.length ? Math.min(...tasks.map(t => Number(t.order) || 0)) - 1 : Date.now(),
    createdBy: userName,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    displayDate: displayDate(),
    notes: [],
    progress: 0
  };

  tasksRef.add(task).then(() => {
    nameInput.value = '';
    descInput.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }).catch(err => alert('خطأ: ' + err.message));
}

function deleteTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  if (task.createdBy !== userName) { alert('لا تملك صلاحية حذف هذه المهمة'); return; }
  showConfirm('حذف المهمة', 'هل تريد حذف هذه المهمة نهائياً؟', () => {
    tasksRef.doc(id).delete();
  });
}

function setStatus(id, status, type = 'task') {
  if (!cloudReady || !STATUS[status]) return;
  const item = findItem(id, type);
  const updates = { status };
  if (status === 'hold' && (!item || item.progress === undefined || item.progress === 0 || item.progress === 100)) updates.progress = 10;
  if (status === 'done') updates.progress = 100;
  if (status === 'notdone') updates.progress = 0;
  const ref = type === 'task' ? tasksRef : ideasRef;
  ref.doc(id).update(updates);
}

function previewProgress(id, value) {
  const label = document.getElementById('prog-val-' + id);
  const fill = document.getElementById('prog-fill-' + id);
  if (label) label.textContent = value + '%';
  if (fill) fill.style.width = value + '%';
}

function setProgress(id, value, type = 'task') {
  if (!cloudReady) return;
  const prog = Math.max(0, Math.min(100, parseInt(value, 10) || 0));
  const updates = { progress: prog };
  if (prog === 100) updates.status = 'done';
  else if (prog === 0) updates.status = 'notdone';
  else updates.status = 'hold';
  const ref = type === 'idea' ? ideasRef : tasksRef;
  ref.doc(id).update(updates).catch(err => alert('تعذر حفظ النسبة: ' + err.message));
}

function addNote(taskId) {
  const input = document.querySelector(`.task-card[data-id="${taskId}"] .comment-input`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const note = {
    id: uid('n'),
    text,
    author: userName || 'مجهول',
    time: displayTime()
  };
  tasksRef.doc(taskId).update({
    notes: firebase.firestore.FieldValue.arrayUnion(note)
  }).then(() => { input.value = ''; });
}

function deleteNote(taskId, noteId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const note = (task.notes || []).find(n => n.id === noteId);
  if (!note) return;
  if (note.author !== userName) { alert('لا يمكنك حذف ملاحظة شخص آخر'); return; }
  showConfirm('حذف الملاحظة', 'هل تريد حذف هذه الملاحظة؟', () => {
    tasksRef.doc(taskId).update({
      notes: firebase.firestore.FieldValue.arrayRemove(note)
    });
  });
}

function editNote(taskId, noteId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const note = (task.notes || []).find(n => n.id === noteId);
  if (!note) return;
  const newText = prompt('تعديل الملاحظة:', note.text);
  if (newText === null || newText.trim() === '' || newText === note.text) return;
  const updatedNotes = (task.notes || []).map(n => n.id === noteId ? { ...n, text: newText.trim(), edited: true } : n);
  tasksRef.doc(taskId).update({ notes: updatedNotes });
}

function addIdea() {
  if (!cloudReady) return;
  const nameInput = document.getElementById('idea-input');
  const descInput = document.getElementById('idea-desc-input');
  const name = nameInput.value.trim();
  const description = descInput.value.trim();
  if (!name) { shakeInput(nameInput); return; }
  if (!description) { shakeInput(descInput); return; }
  if (!userName) {
    document.getElementById('name-modal').classList.add('open');
    return;
  }

  ideasRef.add({
    name,
    description,
    status: 'notdone',
    createdBy: userName,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    comments: [],
    displayDate: displayDate(),
    progress: 0
  }).then(() => {
    nameInput.value = '';
    descInput.value = '';
  }).catch(err => alert('خطأ: ' + err.message));
}

function deleteIdea(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  if (idea.createdBy !== userName) { alert('لا تملك صلاحية حذف هذه الفكرة'); return; }
  showConfirm('حذف الفكرة', 'هل أنت متأكد من حذف هذه الفكرة؟', () => {
    ideasRef.doc(id).delete();
  });
}

function addComment(ideaId) {
  const input = document.querySelector(`.idea-card[data-id="${ideaId}"] .comment-input`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const comment = {
    id: uid('c'),
    text,
    author: userName || 'مجهول',
    time: displayTime()
  };
  ideasRef.doc(ideaId).update({
    comments: firebase.firestore.FieldValue.arrayUnion(comment)
  }).then(() => { input.value = ''; });
}

function deleteComment(ideaId, commentId) {
  const idea = ideas.find(i => i.id === ideaId);
  if (!idea) return;
  const comment = (idea.comments || []).find(c => c.id === commentId);
  if (!comment) return;
  if (comment.author !== userName) { alert('لا يمكنك حذف تعليق شخص آخر'); return; }
  showConfirm('حذف التعليق', 'هل تريد حذف هذا التعليق؟', () => {
    ideasRef.doc(ideaId).update({
      comments: firebase.firestore.FieldValue.arrayRemove(comment)
    });
  });
}

function editComment(ideaId, commentId) {
  const idea = ideas.find(i => i.id === ideaId);
  if (!idea) return;
  const comment = (idea.comments || []).find(c => c.id === commentId);
  if (!comment) return;
  const newText = prompt('تعديل التعليق:', comment.text);
  if (newText === null || newText.trim() === '' || newText === comment.text) return;
  const updatedComments = (idea.comments || []).map(c => c.id === commentId ? { ...c, text: newText.trim(), edited: true } : c);
  ideasRef.doc(ideaId).update({ comments: updatedComments });
}

function statusButtons(id, status, type) {
  return Object.entries(STATUS).map(([key, val]) => `
    <button class="status-btn ${status === key ? val.activeCls : ''}" onclick="setStatus('${id}', '${key}', '${type}')" title="${val.label}">
      <span class="dot ${val.dot}"></span> ${val.label}
    </button>
  `).join('');
}

function itemProgress(item) {
  if (!item) return 0;
  if (item.status === 'done') return 100;
  if (item.status === 'notdone') return 0;
  return Math.max(0, Math.min(100, Number(item.progress) || 0));
}

function progressHTML(id, progress, type) {
  const value = Math.max(0, Math.min(100, Number(progress) || 0));
  return `
    <div class="progress-container">
      <div class="progress-header">
        <div class="progress-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          نسبة الإنجاز
        </div>
        <div class="progress-value" id="prog-val-${id}">${value}%</div>
      </div>
      <div class="progress-track">
        <div class="progress-fill" id="prog-fill-${id}" style="width: ${value}%"></div>
      </div>
      <input type="range" class="progress-slider" min="0" max="100" value="${value}"
        oninput="previewProgress('${id}', this.value)"
        onchange="setProgress('${id}', this.value, '${type}')">
    </div>
  `;
}

function renderIdeas() {
  const container = document.getElementById('ideas-container');
  const empty = document.getElementById('ideas-empty-state');
  if (!container || !empty) return;
  container.querySelectorAll('.idea-card').forEach(c => c.remove());
  if (!ideas.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  ideas.forEach(idea => container.appendChild(createIdeaCard(idea)));
}

function createIdeaCard(idea) {
  const s = STATUS[idea.status] || STATUS.notdone;
  const card = document.createElement('div');
  card.className = `idea-card status-${s.cls}`;
  card.dataset.id = idea.id;
  const comments = idea.comments || [];

  const commentsHTML = comments.map(c => `
    <div class="comment-item">
      <div class="comment-content">
        <div class="comment-text">${escapeHTML(c.text)} ${c.edited ? '<small style="opacity:0.5; font-size:0.6rem;">(معدل)</small>' : ''}</div>
        <div class="comment-actions">
          <button onclick="editComment('${idea.id}', '${c.id}')" title="تعديل"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
          <button onclick="deleteComment('${idea.id}', '${c.id}')" title="حذف" class="delete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
        </div>
      </div>
      <div class="comment-meta">
        <span>بواسطة: ${escapeHTML(c.author)}</span>
        <span>${escapeHTML(c.time)}</span>
      </div>
    </div>
  `).join('');

  card.innerHTML = `
    <div class="card-header">
      <div class="task-name" style="color: #ff9f43; font-weight: 800;">💡 ${escapeHTML(idea.name)}</div>
      <div class="card-actions">
        <button class="icon-btn copy" onclick="copyIdea('${idea.id}', this)" title="نسخ الوصف">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
        <button class="icon-btn edit" onclick="openEdit('${idea.id}', 'idea')" title="تعديل">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9.5 2L12 4.5l-7 7H2.5V9L9.5 2z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="icon-btn delete" onclick="deleteIdea('${idea.id}')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M5.5 6v4.5M8.5 6v4.5M3 3.5l.7 8a.5.5 0 00.5.5h5.6a.5.5 0 00.5-.5l.7-8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
    <div class="idea-details">
      <div class="idea-details-inner">
        <div class="task-desc">${escapeHTML(idea.description)}</div>
        <div class="status-selector">${statusButtons(idea.id, idea.status, 'idea')}</div>
        ${progressHTML(idea.id, itemProgress(idea), 'idea')}
        <div class="comments-section">
          <div style="font-size: 0.8rem; font-weight: 700; color: #ff9f43; margin-bottom: 4px;">الإضافات والتعليقات (${comments.length})</div>
          <div class="comments-list">${commentsHTML}</div>
          <div class="add-comment-box">
            <input type="text" class="comment-input" placeholder="أضف فكرة فرعية أو تعليق...">
            <button class="send-comment-btn" onclick="addComment('${idea.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          </div>
        </div>
        <div class="card-footer" style="margin-top:0; padding-top:10px;">
          <span class="card-date">طُرحت بواسطة: ${escapeHTML(idea.createdBy)} • ${escapeHTML(idea.displayDate || '')}</span>
          <span class="status-badge ${s.badge}"><span class="dot ${s.dot}"></span> ${s.label}</span>
        </div>
      </div>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (
      e.target.closest('.card-actions') ||
      e.target.closest('.status-selector') ||
      e.target.closest('.comments-section') ||
      e.target.closest('.icon-btn') ||
      e.target.tagName === 'BUTTON' ||
      e.target.tagName === 'INPUT' ||
      e.target.tagName === 'TEXTAREA'
    ) return;
    card.classList.toggle('is-expanded');
  });

  const commentInput = card.querySelector('.comment-input');
  if (commentInput) {
    commentInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') addComment(idea.id);
    });
  }
  return card;
}

function setFilter(f, btn) {
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAll();
}

function renderAll() {
  updateStats();
  const container = document.getElementById('tasks-container');
  const empty = document.getElementById('empty-state');
  if (!container || !empty) return;
  const filtered = currentFilter === 'all' ? tasks : tasks.filter(t => t.status === currentFilter);
  container.querySelectorAll('.task-card').forEach(c => c.remove());
  if (!filtered.length) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  filtered.forEach((task, idx) => container.appendChild(createCard(task, idx)));
}

function updateStats() {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  set('count-total', tasks.length);
  set('count-done', tasks.filter(t => t.status === 'done').length);
  set('count-hold', tasks.filter(t => t.status === 'hold').length);
  set('count-notdone', tasks.filter(t => t.status === 'notdone').length);
  set('count-ideas-total', ideas.length);
  set('count-ideas-done', ideas.filter(i => i.status === 'done').length);
  set('count-ideas-hold', ideas.filter(i => i.status === 'hold').length);
  set('count-ideas-notdone', ideas.filter(i => i.status === 'notdone').length);
  const taskRate = tasks.length ? Math.round(tasks.reduce((sum, t) => sum + itemProgress(t), 0) / tasks.length) : 0;
  const ideaRate = ideas.length ? Math.round(ideas.reduce((sum, i) => sum + itemProgress(i), 0) / ideas.length) : 0;
  set('count-progress', taskRate + '%');
  set('count-ideas-progress', ideaRate + '%');
}

function createCard(task, idx) {
  const s = STATUS[task.status] || STATUS.notdone;
  const card = document.createElement('div');
  card.className = `task-card status-${s.cls}`;
  card.dataset.id = task.id;
  card.style.animationDelay = `${idx * 0.05}s`;
  card.draggable = true;
  const notes = task.notes || [];

  const notesHTML = notes.map(n => `
    <div class="comment-item" style="border-right-color: #3b82f6;">
      <div class="comment-content">
        <div class="comment-text">${escapeHTML(n.text)} ${n.edited ? '<small style="opacity:0.5; font-size:0.6rem;">(معدل)</small>' : ''}</div>
        <div class="comment-actions">
          <button onclick="editNote('${task.id}', '${n.id}')" title="تعديل"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
          <button onclick="deleteNote('${task.id}', '${n.id}')" title="حذف" class="delete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
        </div>
      </div>
      <div class="comment-meta">
        <span>بواسطة: ${escapeHTML(n.author)}</span>
        <span>${escapeHTML(n.time)}</span>
      </div>
    </div>
  `).join('');

  card.innerHTML = `
    <div class="card-header">
      <div class="task-name">${escapeHTML(task.name)}</div>
      <div class="card-actions">
        <button class="icon-btn copy" onclick="copyTask('${task.id}', this)" title="نسخ الوصف">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
        <button class="icon-btn edit" onclick="openEdit('${task.id}', 'task')"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9.5 2L12 4.5l-7 7H2.5V9L9.5 2z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="icon-btn delete" onclick="deleteTask('${task.id}')"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M5.5 6v4.5M8.5 6v4.5M3 3.5l.7 8a.5.5 0 00.5.5h5.6a.5.5 0 00.5-.5l.7-8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
    </div>
    ${task.description ? `<div class="task-desc">${escapeHTML(task.description)}</div>` : ''}
    <div class="status-selector">${statusButtons(task.id, task.status, 'task')}</div>
    ${progressHTML(task.id, itemProgress(task), 'task')}
    <div class="comments-section" style="margin-top: 12px; background: rgba(59, 130, 246, 0.05);">
      <div style="font-size: 0.8rem; font-weight: 700; color: #3b82f6; margin-bottom: 4px;">الملاحظات (${notes.length})</div>
      <div class="comments-list">${notesHTML}</div>
      <div class="add-comment-box">
        <input type="text" class="comment-input" placeholder="أضف ملاحظة...">
        <button class="send-comment-btn" onclick="addNote('${task.id}')" style="background: #3b82f6;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
    </div>
    <div class="card-footer">
      <span class="card-date">بواسطة: ${escapeHTML(task.createdBy || 'مجهول')} • ${escapeHTML(task.displayDate || '')}</span>
      <span class="status-badge ${s.badge}"><span class="dot ${s.dot}"></span> ${s.label}</span>
    </div>
  `;

  card.querySelector('.comment-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addNote(task.id);
  });
  card.addEventListener('dragstart', onDragStart);
  card.addEventListener('dragover', onDragOver);
  card.addEventListener('drop', onDrop);
  card.addEventListener('dragend', onDragEnd);
  setTimeout(() => apply3DTilt(card), 100);
  return card;
}

function copyTask(id, btn) {
  const task = tasks.find(t => t.id === id);
  if (task) copyText(task.description || '', btn);
}

function copyIdea(id, btn) {
  const idea = ideas.find(i => i.id === id);
  if (idea) copyText(idea.description || '', btn);
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shakeInput(el) {
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'shake 0.4s ease';
  el.style.borderColor = 'rgba(248,113,113,0.6)';
  setTimeout(() => { el.style.borderColor = ''; el.style.animation = ''; }, 600);
}

let confirmCallback = null;
function showConfirm(title, text, callback) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-text').textContent = text;
  document.getElementById('confirm-modal').classList.add('open');
  confirmCallback = callback;
  const btn = document.getElementById('confirm-yes-btn');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.onclick = () => { if (confirmCallback) confirmCallback(); closeConfirm(); };
}
function closeConfirm() {
  document.getElementById('confirm-modal').classList.remove('open');
  confirmCallback = null;
}

function getTaskIndex(card) { return tasks.findIndex(t => t.id === card.dataset.id); }
function onDragStart(e) {
  if (e.target.closest('input, button, textarea')) {
    e.preventDefault();
    return;
  }
  dragSrcIdx = getTaskIndex(this);
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.task-card').forEach(c => c.classList.remove('drag-over'));
  this.classList.add('drag-over');
}
function onDrop(e) {
  e.stopPropagation();
  const targetIdx = getTaskIndex(this);
  if (dragSrcIdx === null || dragSrcIdx === targetIdx || !cloudReady) return;
  const movedTask = tasks[dragSrcIdx];
  let newOrder;
  if (targetIdx === 0) newOrder = Number(tasks[0].order) - 1;
  else if (targetIdx === tasks.length - 1) newOrder = Number(tasks[tasks.length - 1].order) + 1;
  else {
    const prevOrder = Number(tasks[targetIdx - (dragSrcIdx < targetIdx ? 0 : 1)].order);
    const nextOrder = Number(tasks[targetIdx + (dragSrcIdx < targetIdx ? 1 : 0)].order);
    newOrder = (prevOrder + nextOrder) / 2;
  }
  tasksRef.doc(movedTask.id).update({ order: newOrder });
  dragSrcIdx = null;
}
function onDragEnd() {
  document.querySelectorAll('.task-card').forEach(c => c.classList.remove('dragging', 'drag-over'));
}

function apply3DTilt(card) {
  const shine = document.createElement('div');
  shine.className = 'shine';
  card.appendChild(shine);
  card.addEventListener('mousemove', (e) => {
    if (card.classList.contains('is-expanded')) {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';
      return;
    }
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rotateX = ((rect.height / 2) - y) / 10;
    const rotateY = (x - (rect.width / 2)) / 10;
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
    shine.style.background = `radial-gradient(circle at ${(x / rect.width) * 100}% ${(y / rect.height) * 100}%, rgba(255,255,255,0.15), transparent 70%)`;
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';
    shine.style.opacity = '0';
  });
  card.addEventListener('mouseenter', () => { shine.style.opacity = '1'; });
}

function copyText(text, btn) {
  if (!text || !btn) return;
  const write = navigator.clipboard && navigator.clipboard.writeText
    ? navigator.clipboard.writeText(text)
    : Promise.reject();
  write.then(() => flashCopied(btn)).catch(() => {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    flashCopied(btn);
  });
}

function flashCopied(btn) {
  const isIconBtn = btn.classList.contains('icon-btn');
  const originalHTML = btn.innerHTML;
  const originalText = btn.textContent;
  if (isIconBtn) {
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  } else {
    btn.textContent = 'تم النسخ!';
  }
  const oldBg = btn.style.background;
  const oldBorder = btn.style.borderColor;
  const oldColor = btn.style.color;
  btn.style.background = 'rgba(34, 197, 94, 0.2)';
  btn.style.borderColor = 'rgba(34, 197, 94, 0.5)';
  btn.style.color = '#4ade80';
  setTimeout(() => {
    if (isIconBtn) btn.innerHTML = originalHTML;
    else btn.textContent = originalText;
    btn.style.background = oldBg;
    btn.style.borderColor = oldBorder;
    btn.style.color = oldColor;
  }, 2000);
}

function renderUploads() {
  const gallery = document.getElementById('uploads-gallery');
  if (!gallery) return;
  if (!uploads.length) {
    gallery.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary);">لا توجد صور مرفوعة بعد. كن أول من يرفع صورة!</div>';
    return;
  }
  gallery.innerHTML = '';
  uploads.forEach(data => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.innerHTML = `
      <div class="gallery-img-wrap">
        <img src="${escapeHTML(data.url)}" alt="صورة مرفوعة">
      </div>
      <div class="gallery-info">
        <div class="uploader-name"><span style="color: var(--green);">●</span> بواسطة: ${escapeHTML(data.uploaderName || 'مجهول')}</div>
        <div style="display: flex; gap: 8px;">
          <button class="copy-url-btn" onclick="copyUploadById('${data.id}', this)" style="flex: 1;">نسخ الرابط</button>
          <button onclick="deleteUpload('${data.id}')" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; border-radius: 8px; padding: 0 12px; cursor: pointer;" title="حذف الصورة">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
    gallery.appendChild(card);
  });
}

function copyUploadById(id, btn) {
  const item = uploads.find(u => u.id === id);
  if (item) copyText(item.url, btn);
}

function deleteUpload(id) {
  if (!confirm('هل أنت متأكد من حذف هذه الصورة من السجل بشكل نهائي للجميع؟')) return;
  uploadsRef.doc(id).delete().catch(err => alert('فشل الحذف: ' + err.message));
}

const dropZone = document.getElementById('upload-drop-zone');
if (dropZone) {
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--green)';
    dropZone.style.background = 'rgba(255, 255, 255, 0.05)';
  });
  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'rgba(255,255,255,0.2)';
    dropZone.style.background = 'rgba(255,255,255,0.02)';
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'rgba(255,255,255,0.2)';
    dropZone.style.background = 'rgba(255,255,255,0.02)';
    if (e.dataTransfer.files && e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]);
  });
}

function handleFileSelect(event) {
  if (event.target.files && event.target.files.length) handleFileUpload(event.target.files[0]);
}

function setUploadProgress(pct) {
  const progressBar = document.getElementById('upload-progress-bar');
  const percentText = document.getElementById('upload-percent');
  const value = Math.max(0, Math.min(100, Math.round(pct)));
  if (progressBar) progressBar.style.width = value + '%';
  if (percentText) percentText.textContent = value + '%';
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        let quality = 0.82;
        let url = canvas.toDataURL('image/jpeg', quality);
        while (url.length > 850000 && quality > 0.45) {
          quality -= 0.08;
          url = canvas.toDataURL('image/jpeg', quality);
        }
        if (url.length > 1000000) {
          reject(new Error('الصورة كبيرة. اختر صورة أصغر.'));
          return;
        }
        resolve(url);
      };
      img.onerror = () => reject(new Error('تعذر قراءة الصورة'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function handleFileUpload(file) {
  if (!file || !cloudReady) return;
  if (!file.type.startsWith('image/')) {
    alert('الرجاء اختيار ملف صورة.');
    return;
  }

  const progressArea = document.getElementById('upload-progress-area');
  const resultArea = document.getElementById('upload-result-area');
  progressArea.style.display = 'block';
  resultArea.style.display = 'none';
  setUploadProgress(8);

  compressImage(file).then((url) => {
    setUploadProgress(70);
    const preview = document.getElementById('upload-preview-img');
    if (preview) preview.src = url;
    return uploadsRef.add({
      url,
      displayUrl: url,
      uploaderName: userName || localStorage.getItem('liquid-user-name') || 'مجهول',
      createdAt: Date.now()
    }).then(() => {
      setUploadProgress(100);
      progressArea.style.display = 'none';
      resultArea.style.display = 'block';
      document.getElementById('upload-url-result').value = 'تم حفظ الصورة في سجل الفريق';
      document.getElementById('file-upload-input').value = '';
    });
  }).catch((err) => {
    progressArea.style.display = 'none';
    alert('فشل الرفع: ' + (err && err.message ? err.message : 'خطأ غير معروف'));
  });
}

function copyUploadUrl() {
  const urlInput = document.getElementById('upload-url-result');
  const btn = document.querySelector('#upload-result-area .add-btn');
  copyText(urlInput.value, btn);
}

document.addEventListener('DOMContentLoaded', init);

// ═══════════════════════════════════════════════════════════
// TUIT - Main JavaScript
// ═══════════════════════════════════════════════════════════

// ─── STATE ─── 
let selectedRole = 'student';
let darkMode = false;
let dmWindowOpen = false;
let dmWindowMaximized = false;

// ─── INITIALIZATION ───
function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

onReady(() => {
  initDarkMode();
  initDMWidget();
  initTabs();
  initKeyboardShortcuts();

  // if we were redirected from the standalone login page, restore role
  const savedRole = sessionStorage.getItem('selectedRole');
  if (savedRole) {
    selectedRole = savedRole;
    if (savedRole === 'mentor') {
      switchView('mentorDashboard');
    } else {
      switchView('studentDashboard');
    }
    sessionStorage.removeItem('selectedRole');
  }

  // mark widget button as unread if badge has any content
  const dmBtn = document.querySelector('.dm-widget-btn');
  const badge = document.querySelector('.dm-widget-badge');
  if (dmBtn && badge && badge.textContent.trim() !== '') {
    dmBtn.classList.add('unread');
  }
});


// ═══════════════════════════════════════════════════════════
// DARK MODE
// ═══════════════════════════════════════════════════════════

function initDarkMode() {
  // Check localStorage for saved preference
  const saved = localStorage.getItem('darkMode');
  if (saved === 'true') {
    enableDarkMode();
  }
}

function toggleDarkMode() {
  darkMode = !darkMode;
  if (darkMode) {
    enableDarkMode();
  } else {
    disableDarkMode();
  }
  localStorage.setItem('darkMode', darkMode);
}

function enableDarkMode() {
  darkMode = true;
  document.body.classList.add('dark-mode');
  updateDarkModeIcon();
}

function disableDarkMode() {
  darkMode = false;
  document.body.classList.remove('dark-mode');
  updateDarkModeIcon();
}

function updateDarkModeIcon() {
  const toggleBtn = document.querySelector('.dark-mode-toggle');
  if (!toggleBtn) return;
  
  const icon = darkMode ? 
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>' :
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
  
  toggleBtn.innerHTML = icon;
}

// ═══════════════════════════════════════════════════════════
// LOGIN & ROLE SELECTION
// ═══════════════════════════════════════════════════════════

function selectRole(role, element) {
  selectedRole = role;
  document.querySelectorAll('.role-card').forEach(card => {
    card.classList.remove('selected');
  });
  element.classList.add('selected');
}

function handleLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value.trim();
  
  if (!username || !password) {
    alert('Please enter your credentials.');
    return;
  }
  
  const btn = document.querySelector('.btn-login');
  const originalText = btn.textContent;
  btn.textContent = 'Signing you in...';
  btn.style.opacity = '0.7';
  btn.disabled = true;
  
  // Simulate login delay
  setTimeout(() => {
    // if we're on a standalone login page, remember the role and redirect to the main dashboard file
    if (window.location.pathname.endsWith('login.html')) {
      sessionStorage.setItem('selectedRole', selectedRole);
      window.location.href = 'index.html';
    } else {
      const targetView = selectedRole === 'student' ? 'studentDashboard' : 'mentorDashboard';
      switchView(targetView);
    }

    btn.textContent = originalText;
    btn.style.opacity = '1';
    btn.disabled = false;
  }, 800);
}

// ═══════════════════════════════════════════════════════════
// VIEW NAVIGATION
// ═══════════════════════════════════════════════════════════

function switchView(viewId) {
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });
  
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add('active');
    window.scrollTo(0, 0);
  }
}

function goToPage(page) {
  // If a filename ending with .html is passed, navigate to that page
  if (typeof page === 'string' && page.toLowerCase().endsWith('.html')) {
    window.location.href = page;
    return;
  }

  // Otherwise treat as internal view id and switch views
  switchView(page);
}

// ═══════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════

function initTabs() {
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-btn')) {
      const tabId = e.target.dataset.tab;
      switchTab(e.target, tabId);
    }
  });
}

function switchTab(button, tabId) {
  // Get the tab container
  const container = button.closest('.card') || button.closest('.dash-grid-left');
  
  // Remove active from all tabs in this container
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  container.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // Add active to clicked tab
  button.classList.add('active');
  const content = container.querySelector(`#${tabId}`);
  if (content) {
    content.classList.add('active');
  }
}

// ═══════════════════════════════════════════════════════════
// DM WIDGET (Instagram-style)
// ═══════════════════════════════════════════════════════════

function initDMWidget() {
  console.log('initDMWidget running on', window.location.pathname);
  const dmBtn = document.querySelector('.dm-widget-btn');
  const dmWindow = document.getElementById('dmWindow');
  if (dmBtn && dmWindow) {
    // toggle open/close
    dmBtn.addEventListener('click', () => {
      dmWindowOpen = !dmWindowOpen;
      if (dmWindowOpen) {
        dmWindow.classList.add('open');
        dmBtn.style.display = 'none';
      } else {
        dmWindow.classList.remove('open');
        dmWindow.classList.remove('maximized');
        dmBtn.style.display = 'flex';
        dmWindowMaximized = false;
      }
    });

    // maximize/close controls inside window
    dmWindow.querySelectorAll('.dm-control-btn').forEach(btn => {
      const action = btn.getAttribute('data-action');
      if (action === 'maximize') {
        btn.addEventListener('click', toggleDMMaximize);
      } else if (action === 'close') {
        btn.addEventListener('click', closeDMWidget);
      }
    });

    // unread dot based on badge
    const badge = dmBtn.querySelector('.dm-widget-badge');
    if (badge && badge.textContent.trim() !== '') {
      dmBtn.classList.add('unread');
    }
  }
}

function toggleDMWidget() {
  dmWindowOpen = !dmWindowOpen;
  const dmWindow = document.getElementById('dmWindow');
  const dmBtn = document.querySelector('.dm-widget-btn');
  
  if (dmWindowOpen) {
    dmWindow.classList.add('open');
    dmBtn.style.display = 'none';
  } else {
    dmWindow.classList.remove('open');
    dmWindow.classList.remove('maximized');
    dmBtn.style.display = 'flex';
    dmWindowMaximized = false;
  }
}

function closeDMWidget() {
  dmWindowOpen = false;
  dmWindowMaximized = false;
  const dmWindow = document.getElementById('dmWindow');
  const dmBtn = document.querySelector('.dm-widget-btn');
  
  dmWindow.classList.remove('open');
  dmWindow.classList.remove('maximized');
  if (dmBtn) {
    dmBtn.style.display = 'flex';
  }
}

function toggleDMMaximize() {
  dmWindowMaximized = !dmWindowMaximized;
  const dmWindow = document.getElementById('dmWindow');
  
  if (dmWindowMaximized) {
    dmWindow.classList.add('maximized');
  } else {
    dmWindow.classList.remove('maximized');
  }
}

function openDMConversation(name) {
  console.log('Opening conversation with:', name);
  // In a real app, this would load the conversation
}

// ═══════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════

function showSignupToast() {
  showToast('Sign-up coming soon!', 'This feature is currently under development.');
}

function showToast(title, message) {
  const toast = document.getElementById('toast');
  const titleEl = toast.querySelector('.toast-title');
  const subEl = toast.querySelector('.toast-sub');
  
  titleEl.textContent = title;
  subEl.textContent = message;
  
  toast.classList.add('show');
  
  setTimeout(() => {
    hideToast();
  }, 4000);
}

function hideToast() {
  const toast = document.getElementById('toast');
  toast.classList.remove('show');
}

// ═══════════════════════════════════════════════════════════
// AVATAR MENU & LOGOUT
// ═══════════════════════════════════════════════════════════

function toggleAvatarMenu(e) {
  const menu = document.getElementById('avatarMenu');
  if (!menu) return;
  // if already open, close it
  if (menu.classList.contains('open')) {
    menu.classList.remove('open');
    return;
  }

  // position under the clicked avatar
  const rect = e.target.getBoundingClientRect();
  menu.style.top = rect.bottom + 4 + 'px';
  // show first so width can be measured
  menu.classList.add('open');
  // align right edge based on the now-visible width
  menu.style.left = rect.right - menu.offsetWidth + 'px';
}

function logout() {
  // clear any role state and go to login page
  sessionStorage.removeItem('selectedRole');
  window.location.href = 'login.html';
}

// close menu when clicking outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('avatarMenu');
  if (!menu) return;
  if (menu.classList.contains('open') && !e.target.closest('#avatarMenu') && !e.target.classList.contains('nav-avatar')) {
    menu.classList.remove('open');
  }
});

// ═══════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Enter on login page
    if (e.key === 'Enter' && document.getElementById('loginPage') && document.getElementById('loginPage').classList.contains('active')) {
      handleLogin();
    }
    
    // ESC to close DM widget
    if (e.key === 'Escape' && dmWindowOpen) {
      closeDMWidget();
    }
    
    // Cmd/Ctrl + D to toggle dark mode
    if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
      e.preventDefault();
      toggleDarkMode();
    }
  });
}

// ═══════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════

function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
}

// ═══════════════════════════════════════════════════════════
// FORM SUBMISSIONS (Book Session, etc.)
// ═══════════════════════════════════════════════════════════

function bookSession(event) {
  if (event) event.preventDefault();
  
  const form = event.target;
  const formData = new FormData(form);
  
  // Get form values
  const subject = formData.get('subject');
  const mentor = formData.get('mentor');
  const date = formData.get('date');
  const time = formData.get('time');
  
  console.log('Booking session:', { subject, mentor, date, time });
  
  showToast('Session Booked!', `Your session has been scheduled for ${date} at ${time}.`);
  
  // Reset form
  form.reset();
  
  // Navigate back to dashboard after a delay
  setTimeout(() => {
    switchView('studentDashboard');
  }, 2000);
}

// ═══════════════════════════════════════════════════════════
// SEARCH FUNCTIONALITY
// ═══════════════════════════════════════════════════════════

function searchMentors(query) {
  console.log('Searching for mentors:', query);
  // In a real app, this would filter mentor results
}

function searchDoubts(query) {
  console.log('Searching for doubts:', query);
  // In a real app, this would filter doubt results
}

function filterSessions(filters) {
  console.log('Filtering sessions:', filters);
  // In a real app, this would apply filters to session list
}

// ═══════════════════════════════════════════════════════════
// BROADCAST BOARD
// ═══════════════════════════════════════════════════════════

function reactToBroadcast(broadcastId, reaction) {
  console.log('Reacting to broadcast:', broadcastId, reaction);
  showToast('Reaction Added', `You ${reaction} this broadcast.`);
}

function commentOnBroadcast(broadcastId) {
  console.log('Opening comments for broadcast:', broadcastId);
  // In a real app, this would open a comment section
}

function shareBroadcast(broadcastId) {
  console.log('Sharing broadcast:', broadcastId);
  showToast('Shared!', 'Broadcast has been shared with your followers.');
}

// ═══════════════════════════════════════════════════════════
// MENTOR FUNCTIONS
// ═══════════════════════════════════════════════════════════

function createBroadcast() {
  const message = prompt('Enter your broadcast message:');
  if (message && message.trim()) {
    console.log('Creating broadcast:', message);
    showToast('Broadcast Sent!', 'Your message has been sent to all followers.');
  }
}

function followMentor(mentorId) {
  console.log('Following mentor:', mentorId);
  showToast('Following!', 'You are now following this mentor.');
}

function unfollowMentor(mentorId) {
  console.log('Unfollowing mentor:', mentorId);
  showToast('Unfollowed', 'You have unfollowed this mentor.');
}

// Export functions for use in HTML
window.toggleDarkMode = toggleDarkMode;
window.selectRole = selectRole;
window.handleLogin = handleLogin;
window.switchView = switchView;
window.goToPage = goToPage;
window.switchTab = switchTab;
window.toggleDMWidget = toggleDMWidget;
window.closeDMWidget = closeDMWidget;
window.toggleDMMaximize = toggleDMMaximize;
window.openDMConversation = openDMConversation;
window.showSignupToast = showSignupToast;
window.showToast = showToast;
window.hideToast = hideToast;
window.bookSession = bookSession;
window.searchMentors = searchMentors;
window.searchDoubts = searchDoubts;
window.filterSessions = filterSessions;
window.reactToBroadcast = reactToBroadcast;
window.commentOnBroadcast = commentOnBroadcast;
window.shareBroadcast = shareBroadcast;
window.createBroadcast = createBroadcast;
window.followMentor = followMentor;
window.unfollowMentor = unfollowMentor;
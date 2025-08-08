// public/script.js
// Client-side: UI, Google sign-in, chat flow, settings

const GOOGLE_CLIENT_ID = '472534217982-bjn2mbaq2t1f1s8jenqh6t389u595kcf.apps.googleusercontent.com'; // replace with your client id
let idToken = null;
let currentUser = null;

// UI elements
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const settingsBtn = document.getElementById('settingsBtn');
const sidePanel = document.getElementById('sidePanel');
const animationsToggle = document.getElementById('animationsToggle');
const saveToggle = document.getElementById('saveToggle');
const fancyToggle = document.getElementById('fancyToggle');
const logoutBtn = document.getElementById('logoutBtn');
const exportBtn = document.getElementById('exportBtn');

// Utility: safe HTML escape
function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;', '`':'&#96;'})[c]);
}

// Append message bubble
function appendMessage(text, who='bot', opts = {}) {
  const b = document.createElement('div');
  b.className = `bubble ${who}` + (animationsToggle.checked ? ' fadeIn' : '');
  b.innerHTML = `<div>${escapeHtml(text)}</div><span class="timestamp">${new Date().toLocaleTimeString()}</span>`;
  messagesEl.appendChild(b);
  // optional fancy effect
  if (fancyToggle.checked && who === 'bot') {
    b.style.filter = 'drop-shadow(0 6px 20px rgba(43,209,255,0.06))';
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Send chat message
async function sendMessage() {
  const txt = inputEl.value.trim();
  if (!txt) return;
  appendMessage(txt, 'user');
  inputEl.value = '';
  // show typing
  const typing = document.createElement('div');
  typing.className = 'bubble bot' + (animationsToggle.checked ? ' fadeIn' : '');
  typing.textContent = 'GlizzyBot is thinking...';
  messagesEl.appendChild(typing);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  try {
    const body = { message: txt };
    if (idToken && saveToggle.checked) body.id_token = idToken;

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });

    const data = await res.json();
    typing.remove();
    if (data && data.reply) {
      appendMessage(data.reply, 'bot');
    } else if (data && data.error) {
      appendMessage('Error: ' + data.error, 'bot');
    } else {
      appendMessage('No reply from server.', 'bot');
    }
  } catch (err) {
    typing.remove();
    appendMessage('Network/server error. Try again later.', 'bot');
    console.error(err);
  }
}

// keybinds
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});
sendBtn.addEventListener('click', sendMessage);

// settings toggle (show/hide)
settingsBtn.addEventListener('click', () => {
  if (!sidePanel) return;
  const visible = sidePanel.style.display !== 'flex';
  sidePanel.style.display = visible ? 'flex' : 'none';
  sidePanel.setAttribute('aria-hidden', visible ? 'false' : 'true');
});

// logout
logoutBtn.addEventListener('click', () => {
  idToken = null;
  currentUser = null;
  // re-init google sign in to show button again
  initGoogleSignIn();
  appendMessage('Logged out. You are now in public mode.', 'bot');
});

// export history (if logged in)
exportBtn.addEventListener('click', async () => {
  if (!idToken) {
    alert('Sign in to export your saved history.');
    return;
  }
  try {
    const res = await fetch('/api/history', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ id_token: idToken })
    });
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data.history || [], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'glizzy_history.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error(e);
    alert('Failed to export history.');
  }
});

// Google Identity: handle credential response
function handleCredentialResponse(response) {
  if (!response || !response.credential) return;
  idToken = response.credential;
  try {
    const decoded = jwt_decode(response.credential);
    currentUser = decoded;
    appendMessage(`Welcome, ${decoded.name}! Signed in.`, 'bot');
    // fetch and display history
    loadHistory();
  } catch (e) {
    console.warn('Failed to decode token', e);
  }
}

// initialize GSI
function initGoogleSignIn() {
  const container = document.getElementById('gsi-button');
  if (!container) return;
  container.innerHTML = '';

  if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
    // retry shortly if GSI script hasn't loaded yet
    setTimeout(initGoogleSignIn, 500);
    return;
  }

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
    auto_select: false
  });

  google.accounts.id.renderButton(
    container,
    { theme: 'outline', size: 'large', text: 'signin_with' }
  );

  // optionally enable One Tap:
  // google.accounts.id.prompt();
}

// load saved user history (server-side saved)
async function loadHistory() {
  if (!idToken) return;
  try {
    const res = await fetch('/api/history', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ id_token: idToken })
    });
    const data = await res.json();
    if (data && Array.isArray(data.history)) {
      // clear messages and render history
      messagesEl.innerHTML = '';
      data.history.forEach(h => {
        appendMessage(h.text, h.role === 'user' ? 'user' : 'bot');
      });
    }
  } catch (e) {
    console.warn('Failed to load history', e);
  }
}

// initial welcome message
appendMessage("Welcome to GlizzyBot — public chat is open. Sign in with Google to save history and unlock extra features.", 'bot');

// start GSI and hide side panel by default
(function init() {
  sidePanel.style.display = 'none';
  initGoogleSignIn();
})();

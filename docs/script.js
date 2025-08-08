(() => {
  // Elements
  const messages = document.getElementById('messages');
  const input = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const sidePanel = document.getElementById('sidePanel');
  const animationsToggle = document.getElementById('animationsToggle');
  const saveToggle = document.getElementById('saveToggle');
  const fancyToggle = document.getElementById('fancyToggle');
  const exportBtn = document.getElementById('exportBtn');
  const clearBtn = document.getElementById('clearBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const gsiButtonContainer = document.getElementById('gsi-button');

  // State
  let googleUser = null;
  let chatHistory = [];

  // Google Sign-In callback
  function handleCredentialResponse(response) {
    try {
      const userObject = jwt_decode(response.credential);
      googleUser = userObject;
      showLoggedInUI();
      loadHistory();
    } catch (err) {
      console.error('Error decoding Google credential:', err);
      googleUser = null;
    }
  }

  // Show/hide UI elements on login/logout
  function showLoggedInUI() {
    gsiButtonContainer.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
    settingsBtn.classList.remove('hidden');
    saveToggle.disabled = false;
  }

  function showLoggedOutUI() {
    googleUser = null;
    gsiButtonContainer.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    saveToggle.disabled = true;
    chatHistory = [];
    clearMessages();
  }

  // Clear chat display
  function clearMessages() {
    messages.innerHTML = '';
  }

  // Add message bubble
  function addMessage(text, fromBot = false) {
    const msg = document.createElement('div');
    msg.className = 'message ' + (fromBot ? 'bot' : 'user');
    msg.textContent = text;

    if (fancyToggle.checked) {
      msg.style.opacity = '0';
      msg.style.transform = 'translateY(10px)';
      messages.appendChild(msg);
      requestAnimationFrame(() => {
        msg.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        msg.style.opacity = '1';
        msg.style.transform = 'translateY(0)';
      });
    } else {
      messages.appendChild(msg);
    }
    messages.scrollTop = messages.scrollHeight;
  }

  // Save chat history to localStorage if signed in & saving enabled
  function saveHistory() {
    if (!googleUser || !saveToggle.checked) return;
    localStorage.setItem('glizzybot_history_' + googleUser.sub, JSON.stringify(chatHistory));
  }

  // Load chat history from localStorage
  function loadHistory() {
    if (!googleUser || !saveToggle.checked) {
      chatHistory = [];
      clearMessages();
      return;
    }
    const stored = localStorage.getItem('glizzybot_history_' + googleUser.sub);
    if (stored) {
      chatHistory = JSON.parse(stored);
      clearMessages();
      chatHistory.forEach(msg => addMessage(msg.text, msg.fromBot));
    }
  }

  // Add message to history and save
  function appendToHistory(text, fromBot) {
    chatHistory.push({ text, fromBot });
    if (chatHistory.length > 100) chatHistory.shift(); // limit history
    saveHistory();
  }

  // Send message to backend
  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMessage(text, false);
    appendToHistory(text, false);

    try {
      const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, user: googleUser ? googleUser.sub : null }),
      });
      if (!res.ok) throw new Error('Server error');
      const data = await res.json();
      const botReply = data.reply || 'No response.';
      addMessage(botReply, true);
      appendToHistory(botReply, true);
    } catch (err) {
      addMessage('Error: ' + err.message, true);
    }
  }

  // Event listeners
  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
  });

  settingsBtn.addEventListener('click', () => {
    const hidden = sidePanel.classList.toggle('hidden');
    sidePanel.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  });

  exportBtn.addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(chatHistory, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', 'glizzybot_history.json');
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  });

  clearBtn.addEventListener('click', () => {
    chatHistory = [];
    clearMessages();
    saveHistory();
  });

  logoutBtn.addEventListener('click', () => {
    google.accounts.id.disableAutoSelect();
    showLoggedOutUI();
  });

  // On load: initialize Google Sign-In and UI
  window.onload = () => {
    google.accounts.id.initialize({
      client_id: '472534217982-bjn2mbaq2t1f1s8jenqh6t389u595kcf.apps.googleusercontent.com',
      callback: handleCredentialResponse,
    });
    google.accounts.id.renderButton(gsiButtonContainer, { theme: 'outline', size: 'large', width: 240 });
    google.accounts.id.prompt();
    showLoggedOutUI();
    loadHistory();
  };
})();

// server.js
// Node/Express backend — verifies Google ID token, uses OpenAI key from .env, saves user history to /data

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');
const {OAuth2Client} = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// -- Validate environment
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
if (!OPENAI_KEY || OPENAI_KEY.startsWith('sk-REPLACE')) {
  console.warn('⚠️  Warning: OPENAI_API_KEY missing or placeholder. Put your real key in .env');
}

// Replace with your Google OAuth Client ID
const GOOGLE_CLIENT_ID = '472534217982-bjn2mbaq2t1f1s8jenqh6t389u595kcf.apps.googleusercontent.com';
const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Ensure data folder exists
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Helper: sanitize email for file name
function safeEmailToFilename(email) {
  return email.replace(/[^a-z0-9@._-]/gi, '_');
}

// Save a message to a user's history
function saveUserMessage(email, record) {
  if (!email) return;
  try {
    const fname = safeEmailToFilename(email) + '.json';
    const filePath = path.join(DATA_DIR, fname);
    let arr = [];
    if (fs.existsSync(filePath)) {
      arr = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    arr.push(record);
    fs.writeFileSync(filePath, JSON.stringify(arr, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save user message:', err);
  }
}

// Verify Google ID token; returns payload (email, name, etc.) or null
async function verifyGoogleToken(idToken) {
  if (!idToken) return null;
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.startsWith('REPLACE')) {
    console.warn('Google Client ID is a placeholder; token verification will fail until replaced.');
    return null;
  }
  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID
    });
    return ticket.getPayload();
  } catch (err) {
    console.warn('Google token verification failed:', err.message || err);
    return null;
  }
}

// POST /api/chat
// body: { message: string, id_token?: string }
app.post('/api/chat', async (req, res) => {
  const { message, id_token } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'No message provided' });
  }

  // Optionally verify Google ID token
  const userPayload = await verifyGoogleToken(id_token);

  // Save user message if signed in
  if (userPayload && userPayload.email) {
    saveUserMessage(userPayload.email, { role: 'user', text: message, time: new Date().toISOString() });
  }

  try {
    // Call OpenAI Chat Completions (gpt-3.5-turbo)
    const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant with a friendly sci-fi persona.' },
          { role: 'user', content: message }
        ],
        max_tokens: 600,
        temperature: 0.8
      })
    });

    if (!openaiResp.ok) {
      const errText = await openaiResp.text();
      console.error('OpenAI error:', openaiResp.status, errText);
      return res.status(502).json({ error: 'OpenAI API error', details: errText });
    }

    const data = await openaiResp.json();
    const reply = data?.choices?.[0]?.message?.content || "Sorry, I couldn't get a reply.";

    // Save bot reply if signed in
    if (userPayload && userPayload.email) {
      saveUserMessage(userPayload.email, { role: 'bot', text: reply, time: new Date().toISOString() });
    }

    return res.json({ reply });
  } catch (err) {
    console.error('Server error calling OpenAI:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/history  -> body: { id_token: string }
app.post('/api/history', async (req, res) => {
  const { id_token } = req.body || {};
  const payload = await verifyGoogleToken(id_token);
  if (!payload || !payload.email) return res.status(401).json({ error: 'Invalid token' });

  try {
    const fname = safeEmailToFilename(payload.email) + '.json';
    const filePath = path.join(DATA_DIR, fname);
    let arr = [];
    if (fs.existsSync(filePath)) {
      arr = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    res.json({ history: arr });
  } catch (err) {
    console.error('Failed to load history:', err);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// Basic health
app.get('/api/ping', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`🚀 GlizzyBot server running at http://localhost:${PORT}`);
});

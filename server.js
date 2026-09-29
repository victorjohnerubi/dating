const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DATA_DIR = path.join(__dirname, 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const CHAT_FILE = path.join(DATA_DIR, 'chat-history.json');
const DIRECT_CHAT_FILE = path.join(DATA_DIR, 'direct-chats.json');
const SECRET_FILE = path.join(DATA_DIR, 'session-secret');
const PUBLIC_FILES = new Set(['index.html', 'signup.html', 'login.html', 'matches.html', 'chat.html', 'people.html', 'direct.html', 'style.css', 'script.js']);
const ALLOWED_MATCHES = new Set(['Maya', 'Noah', 'Ari', 'Leah']);
const USE_MONGODB = Boolean(process.env.MONGODB_URI);

if (process.env.NODE_ENV === 'production' && !USE_MONGODB) {
  throw new Error('MONGODB_URI is required in production.');
}

app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '16kb' }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/chat', rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/direct/', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));
const accountLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false });

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  let requestedFile;
  try {
    requestedFile = decodeURIComponent(req.path).replace(/^\/+/, '');
  } catch (error) {
    return res.sendStatus(400);
  }
  if (!PUBLIC_FILES.has(requestedFile)) return res.sendStatus(404);
  next();
});
app.use(express.static(__dirname, { dotfiles: 'deny', index: false }));

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const filePath of [PROFILES_FILE, CHAT_FILE, DIRECT_CHAT_FILE]) {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '[]', 'utf8');
  }
  if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(64), { mode: 0o600 });
}

ensureDataFiles();
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required in production.');
}
const SESSION_SECRET = process.env.SESSION_SECRET || fs.readFileSync(SECRET_FILE);

const profileSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  fullName: { type: String, required: true, maxlength: 60 },
  gender: { type: String, enum: ['man', 'woman', 'nonbinary'], required: true },
  lookingFor: { type: String, enum: ['women', 'men', 'everyone'], required: true },
  vibeTags: { type: [String], default: [] },
  bio: { type: String, required: true, maxlength: 500 },
  registeredAt: { type: Date, required: true }
}, { versionKey: false });
const chatSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  matchName: { type: String, required: true },
  messages: [{
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true, maxlength: 2000 },
    createdAt: { type: Date, required: true }
  }]
}, { versionKey: false });
chatSchema.index({ userId: 1, matchName: 1 }, { unique: true });
const directConversationSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, unique: true },
  participants: { type: [String], required: true },
  messages: [{
    senderId: { type: String, required: true },
    text: { type: String, required: true, maxlength: 2000 },
    createdAt: { type: Date, required: true }
  }]
}, { versionKey: false });
const Profile = mongoose.model('Profile', profileSchema);
const Chat = mongoose.model('Chat', chatSchema);
const DirectConversation = mongoose.model('DirectConversation', directConversationSchema);

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}
function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
function matchesOwner(entry, userId, matchName) {
  return entry.userId === userId && entry.matchName.toLowerCase() === matchName.toLowerCase();
}
function getSessionUserId(req) {
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('vibe_session='));
  if (!cookie) return null;
  try {
    const token = decodeURIComponent(cookie.slice('vibe_session='.length));
    const payload = jwt.verify(token, SESSION_SECRET, { algorithms: ['HS256'] });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch (error) {
    return null;
  }
}
function requireSession(req, res, next) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Please sign in to continue.' });
  req.userId = userId;
  next();
}
function issueSession(res, userId) {
  const token = jwt.sign({ sub: userId }, SESSION_SECRET, { algorithm: 'HS256', expiresIn: '30d' });
  res.cookie('vibe_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}
async function findProfileById(userId) {
  if (USE_MONGODB) return Profile.findOne({ userId }).lean();
  const profile = readJson(PROFILES_FILE).find((entry) => entry.userId === userId) || null;
  if (profile) delete profile.passwordHash;
  return profile;
}
async function findProfileByEmail(email) {
  if (USE_MONGODB) return Profile.findOne({ email }).select('+passwordHash').lean();
  return readJson(PROFILES_FILE).find((entry) => entry.email === email) || null;
}
async function saveProfile(profile) {
  if (USE_MONGODB) {
    await Profile.findOneAndUpdate({ userId: profile.userId }, profile, { upsert: true, new: true, runValidators: true });
    return;
  }
  const profiles = readJson(PROFILES_FILE);
  const index = profiles.findIndex((entry) => entry.userId === profile.userId);
  if (index < 0) profiles.push(profile);
  else profiles[index] = profile;
  writeJson(PROFILES_FILE, profiles);
}
async function findChat(userId, matchName) {
  if (USE_MONGODB) return Chat.findOne({ userId, matchName }).lean();
  return readJson(CHAT_FILE).find((entry) => matchesOwner(entry, userId, matchName)) || null;
}
async function saveChat(chat) {
  if (USE_MONGODB) {
    await Chat.findOneAndUpdate({ userId: chat.userId, matchName: chat.matchName }, { $set: { messages: chat.messages } }, { upsert: true, new: true, runValidators: true });
    return;
  }
  const chats = readJson(CHAT_FILE);
  const index = chats.findIndex((entry) => matchesOwner(entry, chat.userId, chat.matchName));
  if (index < 0) chats.push(chat);
  else chats[index] = chat;
  writeJson(CHAT_FILE, chats);
}
function getConversationId(firstUserId, secondUserId) {
  return [firstUserId, secondUserId].sort().join(':');
}
async function findDirectConversation(firstUserId, secondUserId) {
  const conversationId = getConversationId(firstUserId, secondUserId);
  if (USE_MONGODB) return DirectConversation.findOne({ conversationId }).lean();
  return readJson(DIRECT_CHAT_FILE).find((entry) => entry.conversationId === conversationId) || null;
}
async function saveDirectConversation(conversation) {
  if (USE_MONGODB) {
    await DirectConversation.findOneAndUpdate(
      { conversationId: conversation.conversationId },
      { $set: { participants: conversation.participants, messages: conversation.messages } },
      { upsert: true, new: true, runValidators: true }
    );
    return;
  }
  const conversations = readJson(DIRECT_CHAT_FILE);
  const index = conversations.findIndex((entry) => entry.conversationId === conversation.conversationId);
  if (index < 0) conversations.push(conversation);
  else conversations[index] = conversation;
  writeJson(DIRECT_CHAT_FILE, conversations);
}
function fallbackMatchReply(matchName) {
  return `Hey, I like your energy. I’m ${matchName}, and I’m looking for something real, warm, and genuine. Tell me what kind of connection actually feels natural to you.`;
}
async function callOpenAi({ matchName, history }) {
  if (!OPENAI_API_KEY) return fallbackMatchReply(matchName);
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.9,
      max_tokens: 220,
      messages: [
        { role: 'system', content: `You are ${matchName}, a warm, emotionally intelligent dating-app match. Reply naturally, briefly, and respectfully, as a real person seeking a genuine connection.` },
        ...history.map((entry) => ({ role: entry.role, content: entry.text }))
      ]
    })
  });
  if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || fallbackMatchReply(matchName);
}

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/profile', requireSession, asyncHandler(async (req, res) => {
  res.json({ profile: await findProfileById(req.userId) });
}));
app.get('/api/users', requireSession, asyncHandler(async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 40) : '';
  let profiles;
  if (USE_MONGODB) {
    const filter = { userId: { $ne: req.userId } };
    if (query) {
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { fullName: { $regex: escapedQuery, $options: 'i' } },
        { bio: { $regex: escapedQuery, $options: 'i' } }
      ];
    }
    profiles = await Profile.find(filter).select('userId fullName bio vibeTags').limit(100).lean();
  } else {
    profiles = readJson(PROFILES_FILE)
      .filter((profile) => profile.userId !== req.userId && profile.email)
      .filter((profile) => !query || `${profile.fullName} ${profile.bio}`.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 100)
      .map(({ userId, fullName, bio, vibeTags }) => ({ userId, fullName, bio, vibeTags }));
  }
  res.json({ users: profiles });
}));
app.get('/api/direct/conversations', requireSession, asyncHandler(async (req, res) => {
  const conversations = USE_MONGODB
    ? await DirectConversation.find({ participants: req.userId }).sort({ 'messages.createdAt': -1 }).limit(100).lean()
    : readJson(DIRECT_CHAT_FILE).filter((entry) => entry.participants.includes(req.userId));
  const peerIds = [...new Set(conversations.map((entry) => entry.participants.find((id) => id !== req.userId)).filter(Boolean))];
  const peerProfiles = USE_MONGODB
    ? await Profile.find({ userId: { $in: peerIds } }).select('userId fullName').lean()
    : readJson(PROFILES_FILE).filter((entry) => peerIds.includes(entry.userId));
  const peersById = new Map(peerProfiles.map((profile) => [profile.userId, profile.fullName]));
  const inbox = conversations.map((entry) => {
    const peerId = entry.participants.find((id) => id !== req.userId);
    const latestMessage = entry.messages[entry.messages.length - 1];
    return {
      peerId,
      fullName: peersById.get(peerId) || 'Vibe member',
      lastMessage: latestMessage?.text || '',
      updatedAt: latestMessage?.createdAt || null
    };
  }).sort((first, second) => new Date(second.updatedAt || 0) - new Date(first.updatedAt || 0));
  res.json({ conversations: inbox });
}));
app.get('/api/direct/:peerId', requireSession, asyncHandler(async (req, res) => {
  const peerId = String(req.params.peerId || '');
  if (!peerId || peerId === req.userId) return res.status(400).json({ error: 'Choose another member.' });
  const [currentProfile, peerProfile] = await Promise.all([
    findProfileById(req.userId),
    findProfileById(peerId)
  ]);
  if (!currentProfile?.email) return res.status(401).json({ error: 'Please sign in to message members.' });
  if (!peerProfile?.email) return res.status(404).json({ error: 'Member not found.' });
  const conversation = await findDirectConversation(req.userId, peerId);
  res.json({
    currentUserId: req.userId,
    peer: { userId: peerProfile.userId, fullName: peerProfile.fullName },
    messages: conversation?.messages || []
  });
}));
app.post('/api/direct/:peerId/messages', requireSession, asyncHandler(async (req, res) => {
  const peerId = String(req.params.peerId || '');
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!peerId || peerId === req.userId) return res.status(400).json({ error: 'Choose another member.' });
  if (!text) return res.status(400).json({ error: 'Message cannot be empty.' });
  if (text.length > 2000) return res.status(413).json({ error: 'Message is too long.' });

  const [currentProfile, peerProfile] = await Promise.all([
    findProfileById(req.userId),
    findProfileById(peerId)
  ]);
  if (!currentProfile?.email) return res.status(401).json({ error: 'Please sign in to message members.' });
  if (!peerProfile?.email) return res.status(404).json({ error: 'Member not found.' });

  const conversationId = getConversationId(req.userId, peerId);
  const conversation = await findDirectConversation(req.userId, peerId) || {
    conversationId,
    participants: [req.userId, peerId].sort(),
    messages: []
  };
  const message = { senderId: req.userId, text, createdAt: new Date() };
  conversation.messages.push(message);
  conversation.messages = conversation.messages.slice(-1000);
  await saveDirectConversation(conversation);
  res.status(201).json({ message });
}));
app.get('/api/chat/history', requireSession, asyncHandler(async (req, res) => {
  const matchName = String(req.query.matchName || '').trim();
  if (!ALLOWED_MATCHES.has(matchName)) return res.status(400).json({ error: 'Unknown match.' });
  const chat = await findChat(req.userId, matchName);
  res.json({ messages: chat?.messages || [] });
}));
app.post('/api/chat', requireSession, asyncHandler(async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const matchName = typeof req.body?.matchName === 'string' ? req.body.matchName.trim() : '';
  if (!message) return res.status(400).json({ error: 'Message is required.' });
  if (message.length > 2000) return res.status(413).json({ error: 'Message is too long.' });
  if (!ALLOWED_MATCHES.has(matchName)) return res.status(400).json({ error: 'Unknown match.' });

  const chat = await findChat(req.userId, matchName) || { userId: req.userId, matchName, messages: [] };
  chat.messages.push({ role: 'user', text: message, createdAt: new Date() });
  chat.messages = chat.messages.slice(-500);
  await saveChat(chat);
  let reply;
  try {
    reply = await callOpenAi({ matchName, history: chat.messages.slice(-20) });
  } catch (error) {
    console.error('AI chat request failed:', error.message);
    reply = fallbackMatchReply(matchName);
  }
  chat.messages.push({ role: 'assistant', text: reply, createdAt: new Date() });
  chat.messages = chat.messages.slice(-500);
  await saveChat(chat);
  res.json({ reply, messages: chat.messages });
}));

const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
app.post('/api/register', accountLimiter, asyncHandler(async (req, res) => {
  const { email, password, fullName, gender, lookingFor, vibeTags, bio } = req.body || {};
  const safeEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!validEmail(safeEmail)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) return res.status(400).json({ error: 'Password must be between 12 and 128 characters.' });
  if (typeof fullName !== 'string' || !fullName.trim() || fullName.trim().length > 60) return res.status(400).json({ error: 'Name is required and must be 60 characters or fewer.' });
  if (!['man', 'woman', 'nonbinary'].includes(gender) || !['women', 'men', 'everyone'].includes(lookingFor)) return res.status(400).json({ error: 'Choose a valid identity and preference.' });
  if (typeof bio !== 'string' || !bio.trim() || bio.trim().length > 500) return res.status(400).json({ error: 'Bio is required and must be 500 characters or fewer.' });
  if (await findProfileByEmail(safeEmail)) return res.status(409).json({ error: 'An account with that email already exists. Please sign in.' });

  const previousSessionId = getSessionUserId(req);
  const previousProfile = previousSessionId ? await findProfileById(previousSessionId) : null;
  const userId = previousProfile && !previousProfile.email ? previousSessionId : crypto.randomUUID();
  const profile = {
    userId,
    email: safeEmail,
    passwordHash: await bcrypt.hash(password, 12),
    fullName: fullName.trim(),
    gender,
    lookingFor,
    vibeTags: (Array.isArray(vibeTags) ? vibeTags : [vibeTags]).filter((tag) => ['Music', 'Gaming', 'Fitness', 'Cafes', 'Travel', 'Movies'].includes(tag)).slice(0, 6),
    bio: bio.trim(),
    registeredAt: new Date()
  };
  try {
    await saveProfile(profile);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'An account with that email already exists. Please sign in.' });
    throw error;
  }
  issueSession(res, profile.userId);
  res.status(201).json({ success: true });
}));
app.post('/api/login', accountLimiter, asyncHandler(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!validEmail(email) || !password || password.length > 128) return res.status(400).json({ error: 'Enter your email and password.' });
  const profile = await findProfileByEmail(email);
  if (!profile || !await bcrypt.compare(password, profile.passwordHash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
  const token = jwt.sign({ sub: profile.userId }, SESSION_SECRET, { algorithm: 'HS256', expiresIn: '30d' });
  res.cookie('vibe_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 60 * 60 * 1000, path: '/' });
  res.json({ success: true });
}));
app.post('/api/logout', requireSession, (req, res) => {
  res.clearCookie('vibe_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  res.status(204).end();
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('Request failed:', error.message);
  res.status(500).json({ error: 'The request could not be completed.' });
});

async function startServer() {
  if (USE_MONGODB) {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected.');
  }
  app.listen(PORT, () => {
    console.log(`Vibe Server listening on port ${PORT}`);
    console.log(`Storage: ${USE_MONGODB ? 'MongoDB' : 'local JSON development mode'}`);
    console.log(`AI backend: ${OPENAI_API_KEY ? 'enabled' : 'fallback replies'}`);
  });
}
startServer().catch((error) => {
  console.error('Server startup failed:', error.message);
  process.exitCode = 1;
});

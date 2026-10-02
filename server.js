const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const OpenAI = require('openai');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const characterCatalog = require('./ai-character-catalog');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MODERATOR_TOKEN = process.env.MODERATOR_TOKEN || '';
const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY, baseURL: OPENAI_BASE_URL })
  : null;
const DATA_DIR = path.join(__dirname, 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const CHAT_FILE = path.join(DATA_DIR, 'chat-history.json');
const DIRECT_CHAT_FILE = path.join(DATA_DIR, 'direct-chats.json');
const SAFETY_FILE = path.join(DATA_DIR, 'safety-actions.json');
const SECRET_FILE = path.join(DATA_DIR, 'session-secret');
const PUBLIC_FILES = new Set(['index.html', 'signup.html', 'login.html', 'matches.html', 'chat.html', 'people.html', 'direct.html', 'moderation.html', 'style.css', 'script.js']);
const USE_MONGODB = Boolean(process.env.MONGODB_URI);

if (process.env.NODE_ENV === 'production' && !USE_MONGODB) {
  throw new Error('MONGODB_URI is required in production.');
}

app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'img-src': ["'self'", 'data:', 'https://images.unsplash.com']
    }
  }
}));
app.use(express.json({ limit: '16kb' }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/chat', rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/direct/', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));
const accountLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false });
const moderatorLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false });

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
  for (const filePath of [PROFILES_FILE, CHAT_FILE, DIRECT_CHAT_FILE, SAFETY_FILE]) {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '[]', 'utf8');
  }
  if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(64), { mode: 0o600 });
}

ensureDataFiles();
const existingSafetyActions = readJson(SAFETY_FILE);
let safetyActionsMigrated = false;
existingSafetyActions.forEach((action) => {
  if (action.action !== 'report') return;
  if (!action.id) {
    action.id = crypto.randomUUID();
    safetyActionsMigrated = true;
  }
  if (!action.status) {
    action.status = 'open';
    safetyActionsMigrated = true;
  }
});
if (safetyActionsMigrated) writeJson(SAFETY_FILE, existingSafetyActions);
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required in production.');
}
if (process.env.NODE_ENV === 'production' && !MODERATOR_TOKEN) {
  throw new Error('MODERATOR_TOKEN is required in production.');
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
const safetyActionSchema = new mongoose.Schema({
  actorId: { type: String, required: true },
  targetId: { type: String, required: true },
  action: { type: String, enum: ['block', 'report'], required: true },
  reason: { type: String, maxlength: 80 },
  status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  resolvedAt: { type: Date },
  createdAt: { type: Date, required: true }
}, { versionKey: false });
const Profile = mongoose.model('Profile', profileSchema);
const Chat = mongoose.model('Chat', chatSchema);
const DirectConversation = mongoose.model('DirectConversation', directConversationSchema);
const SafetyAction = mongoose.model('SafetyAction', safetyActionSchema);

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
function getEligibleGenders(profile) {
  if (profile.gender === 'man') return ['woman'];
  if (profile.gender === 'woman') return ['man'];
  if (profile.lookingFor === 'women') return ['woman'];
  if (profile.lookingFor === 'men') return ['man'];
  return ['man', 'woman', 'nonbinary'];
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
function issueModeratorSession(res) {
  const token = jwt.sign({ sub: 'moderator', role: 'moderator' }, SESSION_SECRET, {
    algorithm: 'HS256',
    expiresIn: '2h'
  });
  res.cookie('vibe_moderator', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 2 * 60 * 60 * 1000,
    path: '/'
  });
}
function requireModerator(req, res, next) {
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith('vibe_moderator='));
  if (!cookie) return res.status(401).json({ error: 'Moderator sign-in required.' });
  try {
    const token = decodeURIComponent(cookie.slice('vibe_moderator='.length));
    const payload = jwt.verify(token, SESSION_SECRET, { algorithms: ['HS256'] });
    if (payload.role !== 'moderator' || payload.sub !== 'moderator') throw new Error('Invalid moderator session.');
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Moderator sign-in required.' });
  }
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
async function getSafetyActionsForUser(userId) {
  if (USE_MONGODB) {
    return SafetyAction.find({
      $or: [{ actorId: userId, action: 'block' }, { targetId: userId, action: 'block' }]
    }).select('actorId targetId action').lean();
  }
  return readJson(SAFETY_FILE).filter((entry) => entry.action === 'block' && (entry.actorId === userId || entry.targetId === userId));
}
async function isBlockedBetween(firstUserId, secondUserId) {
  if (USE_MONGODB) {
    return Boolean(await SafetyAction.exists({
      action: 'block',
      $or: [
        { actorId: firstUserId, targetId: secondUserId },
        { actorId: secondUserId, targetId: firstUserId }
      ]
    }));
  }
  return readJson(SAFETY_FILE).some((entry) => entry.action === 'block' && (
    (entry.actorId === firstUserId && entry.targetId === secondUserId) ||
    (entry.actorId === secondUserId && entry.targetId === firstUserId)
  ));
}
async function saveSafetyAction(action) {
  if (USE_MONGODB) {
    if (action.action === 'block') {
      await SafetyAction.updateOne(
        { actorId: action.actorId, targetId: action.targetId, action: 'block' },
        { $setOnInsert: action },
        { upsert: true }
      );
    } else {
      await SafetyAction.create(action);
    }
    return;
  }
  const actions = readJson(SAFETY_FILE);
  if (action.action !== 'block' || !actions.some((entry) => entry.action === 'block' && entry.actorId === action.actorId && entry.targetId === action.targetId)) {
    actions.push(action);
    writeJson(SAFETY_FILE, actions);
  }
}
async function callOpenAi({ character, history }) {
  if (!openai) throw new Error('OPENAI_API_KEY is not configured.');
  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    reasoning: { effort: 'low' },
    instructions: `You are ${character.name}, a fictional AI character in a dating-app conversation. Your personality: ${character.vibe}. Your values are ${character.personality.values}. Stay consistent with your personality and remember details from earlier messages. Respond to what the user actually said rather than giving generic praise. Sound like a thoughtful person texting, vary your reply length, and usually write 1-3 sentences. Ask at most one natural follow-up question. Be clear you are an AI character if asked; do not claim to be a real human.`,
    input: history.map((entry) => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.text
    })),
    max_output_tokens: 180
  });
  const reply = response.output_text?.trim();
  if (!reply) throw new Error('AI provider returned an empty reply.');
  return reply;
}

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/profile', requireSession, asyncHandler(async (req, res) => {
  res.json({ profile: await findProfileById(req.userId) });
}));
app.get('/api/account/export', requireSession, asyncHandler(async (req, res) => {
  const profile = await findProfileById(req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });

  const [aiChats, directConversations, safetyActions] = USE_MONGODB
    ? await Promise.all([
        Chat.find({ userId: req.userId }).lean(),
        DirectConversation.find({ participants: req.userId }).lean(),
        SafetyAction.find({ actorId: req.userId }).select('action targetId reason status createdAt resolvedAt').lean()
      ])
    : [
        readJson(CHAT_FILE).filter((entry) => entry.userId === req.userId),
        readJson(DIRECT_CHAT_FILE).filter((entry) => entry.participants.includes(req.userId)),
        readJson(SAFETY_FILE).filter((entry) => entry.actorId === req.userId)
      ];

  res.json({
    exportedAt: new Date().toISOString(),
    profile,
    aiChats,
    directConversations,
    safetyActions
  });
}));
app.post('/api/account/delete', requireSession, accountLimiter, asyncHandler(async (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password || password.length > 128) return res.status(400).json({ error: 'Enter your password to confirm account deletion.' });
  const profile = await findProfileById(req.userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found.' });
  const credentials = await findProfileByEmail(profile.email);
  if (!credentials || !await bcrypt.compare(password, credentials.passwordHash)) {
    return res.status(401).json({ error: 'Password is incorrect. Your account was not deleted.' });
  }

  if (USE_MONGODB) {
    await Promise.all([
      Profile.deleteOne({ userId: req.userId }),
      Chat.deleteMany({ userId: req.userId }),
      DirectConversation.deleteMany({ participants: req.userId }),
      SafetyAction.deleteMany({ $or: [{ actorId: req.userId }, { action: 'block', targetId: req.userId }] })
    ]);
  } else {
    writeJson(PROFILES_FILE, readJson(PROFILES_FILE).filter((entry) => entry.userId !== req.userId));
    writeJson(CHAT_FILE, readJson(CHAT_FILE).filter((entry) => entry.userId !== req.userId));
    writeJson(DIRECT_CHAT_FILE, readJson(DIRECT_CHAT_FILE).filter((entry) => !entry.participants.includes(req.userId)));
    writeJson(SAFETY_FILE, readJson(SAFETY_FILE).filter((entry) => entry.actorId !== req.userId && !(entry.action === 'block' && entry.targetId === req.userId)));
  }

  res.clearCookie('vibe_session', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
  res.status(204).end();
}));
app.get('/api/ai-characters', requireSession, asyncHandler(async (req, res) => {
  const currentProfile = await findProfileById(req.userId);
  if (!currentProfile) return res.status(404).json({ error: 'Profile not found.' });
  const genders = getEligibleGenders(currentProfile);
  const allowedGenders = [...new Set(genders.filter((gender) => ['man', 'woman'].includes(gender)).slice(0, 2))];
  const characters = allowedGenders
    .map((gender) => characterCatalog.getCharacter(gender, 0))
    .filter(Boolean);

  res.json({ total: characters.length, offset: 0, characters });
}));
app.get('/api/ai-characters/:characterId', requireSession, asyncHandler(async (req, res) => {
  const character = characterCatalog.parseCharacterId(req.params.characterId);
  if (!character) return res.status(404).json({ error: 'Character not found.' });
  const currentProfile = await findProfileById(req.userId);
  const allowedGenders = new Set(getEligibleGenders(currentProfile || {}).filter((gender) => ['man', 'woman'].includes(gender)));
  if (!currentProfile || !allowedGenders.has(character.gender)) {
    return res.status(403).json({ error: 'This character is outside your match preferences.' });
  }
  res.json({ character });
}));
app.get('/api/users', requireSession, asyncHandler(async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 40) : '';
  const currentProfile = await findProfileById(req.userId);
  if (!currentProfile) return res.status(404).json({ error: 'Profile not found.' });
  const eligibleGenders = getEligibleGenders(currentProfile);
  const safetyActions = await getSafetyActionsForUser(req.userId);
  const blockedUserIds = new Set(safetyActions.map((entry) => entry.actorId === req.userId ? entry.targetId : entry.actorId));
  let profiles;
  if (USE_MONGODB) {
    const filter = { userId: { $ne: req.userId, $nin: [...blockedUserIds] }, gender: { $in: eligibleGenders } };
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
      .filter((profile) => !blockedUserIds.has(profile.userId))
      .filter((profile) => eligibleGenders.includes(profile.gender))
      .filter((profile) => !query || `${profile.fullName} ${profile.bio}`.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 100)
      .map(({ userId, fullName, bio, vibeTags }) => ({ userId, fullName, bio, vibeTags }));
  }
  res.json({ users: profiles });
}));
app.get('/api/blocks', requireSession, asyncHandler(async (req, res) => {
  const blockedIds = USE_MONGODB
    ? (await SafetyAction.find({ actorId: req.userId, action: 'block' }).select('targetId').lean()).map((entry) => entry.targetId)
    : readJson(SAFETY_FILE).filter((entry) => entry.actorId === req.userId && entry.action === 'block').map((entry) => entry.targetId);
  const blockedProfiles = USE_MONGODB
    ? await Profile.find({ userId: { $in: blockedIds } }).select('userId fullName').lean()
    : readJson(PROFILES_FILE).filter((entry) => blockedIds.includes(entry.userId)).map(({ userId, fullName }) => ({ userId, fullName }));
  res.json({ blocked: blockedProfiles });
}));
app.post('/api/users/:peerId/block', requireSession, asyncHandler(async (req, res) => {
  const peerId = String(req.params.peerId || '');
  if (!peerId || peerId === req.userId) return res.status(400).json({ error: 'Choose another member.' });
  const peerProfile = await findProfileById(peerId);
  if (!peerProfile?.email) return res.status(404).json({ error: 'Member not found.' });
  await saveSafetyAction({ actorId: req.userId, targetId: peerId, action: 'block', createdAt: new Date() });
  res.status(201).json({ success: true });
}));
app.delete('/api/users/:peerId/block', requireSession, asyncHandler(async (req, res) => {
  const peerId = String(req.params.peerId || '');
  if (USE_MONGODB) {
    await SafetyAction.deleteOne({ actorId: req.userId, targetId: peerId, action: 'block' });
  } else {
    const actions = readJson(SAFETY_FILE).filter((entry) => !(entry.actorId === req.userId && entry.targetId === peerId && entry.action === 'block'));
    writeJson(SAFETY_FILE, actions);
  }
  res.status(204).end();
}));
app.post('/api/users/:peerId/report', requireSession, asyncHandler(async (req, res) => {
  const peerId = String(req.params.peerId || '');
  const reason = req.body?.reason;
  const allowedReasons = new Set(['harassment', 'spam', 'fake-profile', 'inappropriate-content', 'other']);
  if (!peerId || peerId === req.userId) return res.status(400).json({ error: 'Choose another member.' });
  if (!allowedReasons.has(reason)) return res.status(400).json({ error: 'Choose a report reason.' });
  const peerProfile = await findProfileById(peerId);
  if (!peerProfile?.email) return res.status(404).json({ error: 'Member not found.' });
  await saveSafetyAction({
    id: crypto.randomUUID(),
    actorId: req.userId,
    targetId: peerId,
    action: 'report',
    reason,
    status: 'open',
    createdAt: new Date()
  });
  res.status(201).json({ success: true });
}));
app.post('/api/moderation/login', moderatorLoginLimiter, (req, res) => {
  if (!MODERATOR_TOKEN) return res.status(503).json({ error: 'Moderator access is not configured on this server.' });
  const submittedToken = typeof req.body?.token === 'string' ? req.body.token : '';
  const expectedDigest = crypto.createHash('sha256').update(MODERATOR_TOKEN).digest();
  const submittedDigest = crypto.createHash('sha256').update(submittedToken).digest();
  if (!crypto.timingSafeEqual(expectedDigest, submittedDigest)) {
    return res.status(401).json({ error: 'Invalid moderator token.' });
  }
  issueModeratorSession(res);
  res.json({ success: true });
});
app.post('/api/moderation/logout', requireModerator, (req, res) => {
  res.clearCookie('vibe_moderator', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
  res.status(204).end();
});
app.get('/api/moderation/reports', requireModerator, asyncHandler(async (req, res) => {
  let reports;
  if (USE_MONGODB) {
    const entries = await SafetyAction.find({ action: 'report', status: { $ne: 'resolved' } })
      .sort({ createdAt: -1 }).limit(200).lean();
    const userIds = [...new Set(entries.flatMap((entry) => [entry.actorId, entry.targetId]))];
    const profiles = await Profile.find({ userId: { $in: userIds } }).select('userId fullName').lean();
    const namesById = new Map(profiles.map((profile) => [profile.userId, profile.fullName]));
    reports = entries.map((entry) => ({
      id: String(entry._id),
      reporter: namesById.get(entry.actorId) || 'Deleted member',
      reported: namesById.get(entry.targetId) || 'Deleted member',
      reason: entry.reason,
      createdAt: entry.createdAt
    }));
  } else {
    const profiles = new Map(readJson(PROFILES_FILE).map((profile) => [profile.userId, profile.fullName]));
    reports = readJson(SAFETY_FILE)
      .filter((entry) => entry.action === 'report' && entry.status !== 'resolved')
      .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
      .slice(0, 200)
      .map((entry) => ({
        id: entry.id,
        reporter: profiles.get(entry.actorId) || 'Deleted member',
        reported: profiles.get(entry.targetId) || 'Deleted member',
        reason: entry.reason,
        createdAt: entry.createdAt
      }));
  }
  res.json({ reports });
}));
app.post('/api/moderation/reports/:reportId/resolve', requireModerator, asyncHandler(async (req, res) => {
  const reportId = String(req.params.reportId || '');
  if (USE_MONGODB) {
    if (!mongoose.Types.ObjectId.isValid(reportId)) return res.status(404).json({ error: 'Report not found.' });
    const report = await SafetyAction.findOneAndUpdate(
      { _id: reportId, action: 'report' },
      { $set: { status: 'resolved', resolvedAt: new Date() } },
      { new: true }
    );
    if (!report) return res.status(404).json({ error: 'Report not found.' });
  } else {
    const actions = readJson(SAFETY_FILE);
    const report = actions.find((entry) => entry.id === reportId && entry.action === 'report');
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    report.status = 'resolved';
    report.resolvedAt = new Date().toISOString();
    writeJson(SAFETY_FILE, actions);
  }
  res.json({ success: true });
}));
app.get('/api/direct/conversations', requireSession, asyncHandler(async (req, res) => {
  const safetyActions = await getSafetyActionsForUser(req.userId);
  const blockedUserIds = new Set(safetyActions.map((entry) => entry.actorId === req.userId ? entry.targetId : entry.actorId));
  const conversations = (USE_MONGODB
    ? await DirectConversation.find({ participants: req.userId }).sort({ 'messages.createdAt': -1 }).limit(100).lean()
    : readJson(DIRECT_CHAT_FILE).filter((entry) => entry.participants.includes(req.userId)))
    .filter((entry) => !entry.participants.some((participantId) => participantId !== req.userId && blockedUserIds.has(participantId)));
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
  if (await isBlockedBetween(req.userId, peerId)) return res.status(403).json({ error: 'This conversation is unavailable.' });
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
  if (await isBlockedBetween(req.userId, peerId)) return res.status(403).json({ error: 'This conversation is unavailable.' });

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
  const characterId = String(req.query.characterId || '').trim();
  const character = characterCatalog.parseCharacterId(characterId);
  if (!character) return res.status(400).json({ error: 'Unknown AI character.' });
  const currentProfile = await findProfileById(req.userId);
  if (!currentProfile || !getEligibleGenders(currentProfile).includes(character.gender)) {
    return res.status(403).json({ error: 'This character is outside your match preferences.' });
  }
  const chat = await findChat(req.userId, characterId);
  res.json({ messages: chat?.messages || [] });
}));
app.post('/api/chat', requireSession, asyncHandler(async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const characterId = typeof req.body?.characterId === 'string' ? req.body.characterId.trim() : '';
  if (!message) return res.status(400).json({ error: 'Message is required.' });
  if (message.length > 2000) return res.status(413).json({ error: 'Message is too long.' });
  const character = characterCatalog.parseCharacterId(characterId);
  if (!character) return res.status(400).json({ error: 'Unknown AI character.' });
  const currentProfile = await findProfileById(req.userId);
  if (!currentProfile || !getEligibleGenders(currentProfile).includes(character.gender)) {
    return res.status(403).json({ error: 'This character is outside your match preferences.' });
  }

  const chat = await findChat(req.userId, characterId) || { userId: req.userId, matchName: characterId, messages: [] };
  const userMessage = { role: 'user', text: message, createdAt: new Date() };
  let reply;
  try {
    reply = await callOpenAi({ character, history: [...chat.messages.slice(-19), userMessage] });
  } catch (error) {
    console.error('AI chat request failed:', error.message);
    const notConfigured = !OPENAI_API_KEY;
    return res.status(notConfigured ? 503 : 502).json({
      error: notConfigured
        ? 'AI replies are not configured. Add OPENAI_API_KEY to .env and restart the server.'
        : 'The AI service is temporarily unavailable. Please try again.'
    });
  }
  chat.messages.push(userMessage);
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
    lookingFor: gender === 'man' ? 'women' : gender === 'woman' ? 'men' : lookingFor,
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
    console.log(`AI backend: ${OPENAI_API_KEY ? 'enabled' : 'not configured'}`);
  });
}
startServer().catch((error) => {
  console.error('Server startup failed:', error.message);
  process.exitCode = 1;
});

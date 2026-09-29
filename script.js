const profiles = [
  {
    name: 'Maya',
    age: 27,
    city: 'Brooklyn',
    match: 89,
    tags: ['Live music', 'coffee runs'],
    vibe: 'easygoing, playful, and loves late-night city energy',
    personality: {
      tone: 'warm and flirty',
      values: 'likes excitement, depth, and honest chemistry',
      style: 'keeps things playful but wants something real',
      opener: 'I like your energy. Let’s keep it honest and see where the chemistry goes.'
    }
  },
  {
    name: 'Noah',
    age: 30,
    city: 'Austin',
    match: 92,
    tags: ['Hiking', 'vinyl nights'],
    vibe: 'outdoorsy, thoughtful, and always up for a solid adventure',
    personality: {
      tone: 'calm and grounded',
      values: 'likes consistency, adventure, and meaningful conversation',
      style: 'more thoughtful and steady, willing to be vulnerable',
      opener: 'I’m into real connection, not just small talk. What kind of person actually makes you feel comfortable?'
    }
  },
  {
    name: 'Ari',
    age: 26,
    city: 'Seattle',
    match: 86,
    tags: ['Art walks', 'matcha dates'],
    vibe: 'creative, grounded, and effortlessly charming',
    personality: {
      tone: 'creative and observant',
      values: 'likes intention, art, and thoughtful conversations',
      style: 'reads people carefully and is emotionally smart',
      opener: 'I like people who feel genuine. What’s something you’re passionate about that most people don’t notice?'
    }
  },
  {
    name: 'Leah',
    age: 29,
    city: 'Chicago',
    match: 91,
    tags: ['Cooking', 'night markets'],
    vibe: 'warm, curious, and obsessed with good food and good conversation',
    personality: {
      tone: 'open and affectionate',
      values: 'likes comfort, laughter, and emotional ease',
      style: 'makes people feel safe while still being playful',
      opener: 'I’m really into easy chemistry and good conversation. What do you usually click with right away?'
    }
  }
];

const MATCH_STORAGE_KEY = 'vibe-selected-match';
const matchState = {
  currentIndex: 0
};

function getSelectedMatch() {
  const saved = localStorage.getItem(MATCH_STORAGE_KEY);

  if (!saved) {
    return profiles[0];
  }

  try {
    const parsed = JSON.parse(saved);
    return profiles.find(profile => profile.name === parsed.name) || profiles[0];
  } catch (error) {
    return profiles[0];
  }
}

function saveSelectedMatch(profile) {
  if (!profile) return;
  localStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify({ name: profile.name }));
}

function updateMatchCard() {
  const profile = profiles[matchState.currentIndex];
  const matchName = document.getElementById('match-name');
  const matchMeta = document.getElementById('match-meta');
  const matchTags = document.getElementById('match-tags');
  const matchBadge = document.getElementById('match-badge');
  const statusText = document.getElementById('status-text');

  if (!profile || !matchName || !matchMeta || !matchTags || !matchBadge) return;

  matchName.textContent = profile.name;
  matchMeta.textContent = `${profile.age} • ${profile.city}`;
  matchBadge.textContent = `${profile.match}% match`;
  matchTags.innerHTML = profile.tags.map(tag => `<span>${tag}</span>`).join('');

  if (statusText) {
    statusText.textContent = 'Fresh potential match loaded.';
  }
}

function handleMatchAction(action) {
  const statusText = document.getElementById('status-text');
  if (!statusText) return;

  if (action === 'pass') {
    statusText.textContent = 'Skipped for now — still browsing.';
    matchState.currentIndex = (matchState.currentIndex + 1) % profiles.length;
    updateMatchCard();
    return;
  }

  const selectedProfile = profiles[matchState.currentIndex];
  statusText.textContent = 'It’s a vibe! Opening the conversation.';
  saveSelectedMatch(selectedProfile);

  setTimeout(() => {
    window.location.href = 'chat.html';
  }, 700);
}

async function handleSignupSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');

  if (button) {
    button.disabled = true;
    button.textContent = 'Building your vibe...';
  }

  const formData = new FormData(form);
  const payload = {
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
    gender: formData.get('gender'),
    lookingFor: formData.get('lookingFor'),
    vibeTags: formData.getAll('vibeTags'),
    bio: formData.get('bio')
  };

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'The profile could not be saved.');
    }
  } catch (error) {
    console.error('Signup save failed:', error);
    if (button) {
      button.disabled = false;
      button.textContent = 'Find Matches';
    }
    window.alert(error.message);
    return;
  }

  setTimeout(() => {
    window.location.href = 'matches.html';
  }, 600);
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = true;
    button.textContent = 'Signing in...';
  }

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.elements.email.value,
        password: form.elements.password.value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Sign in failed.');
    window.location.href = 'matches.html';
  } catch (error) {
    window.alert(error.message);
    if (button) {
      button.disabled = false;
      button.textContent = 'Sign In';
    }
  }
}

async function handleLogout(event) {
  event.preventDefault();
  try {
    await fetch('/api/logout', { method: 'POST' });
  } finally {
    window.location.href = 'login.html';
  }
}

function getDirectPeerId() {
  return new URLSearchParams(window.location.search).get('peer');
}

function renderDirectory(users) {
  const list = document.getElementById('member-list');
  const status = document.getElementById('directory-status');
  const count = document.getElementById('member-count');
  if (!list || !status || !count) return;

  list.replaceChildren();
  count.textContent = String(users.length);
  status.textContent = users.length ? '' : 'No members found. Try a different search.';

  users.forEach((user) => {
    const item = document.createElement('article');
    item.className = 'member-row';
    const details = document.createElement('div');
    details.className = 'member-details';
    const name = document.createElement('h2');
    name.textContent = user.fullName;
    const bio = document.createElement('p');
    bio.textContent = user.bio;
    const tags = document.createElement('small');
    tags.textContent = Array.isArray(user.vibeTags) ? user.vibeTags.join(' · ') : '';
    details.append(name, bio, tags);

    const messageLink = document.createElement('a');
    messageLink.className = 'member-message-link';
    messageLink.href = `direct.html?peer=${encodeURIComponent(user.userId)}`;
    messageLink.textContent = 'Message';
    item.append(details, messageLink);
    list.append(item);
  });
}

async function loadMemberDirectory(search = '') {
  const status = document.getElementById('directory-status');
  if (!status) return;
  status.textContent = 'Loading members...';
  try {
    const response = await fetch(`/api/users?q=${encodeURIComponent(search)}`);
    if (response.status === 401) {
      window.location.href = 'login.html';
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load members.');
    renderDirectory(data.users || []);
  } catch (error) {
    status.textContent = error.message;
  }
}

async function loadDirectInbox() {
  const list = document.getElementById('inbox-list');
  const emptyState = document.getElementById('inbox-empty');
  if (!list || !emptyState) return;
  try {
    const response = await fetch('/api/direct/conversations');
    if (response.status === 401) {
      window.location.href = 'login.html';
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load conversations.');
    list.replaceChildren();
    const conversations = data.conversations || [];
    emptyState.hidden = conversations.length > 0;
    conversations.forEach((conversation) => {
      const item = document.createElement('article');
      item.className = 'member-row';
      const details = document.createElement('div');
      details.className = 'member-details';
      const name = document.createElement('h2');
      name.textContent = conversation.fullName;
      const preview = document.createElement('p');
      preview.textContent = conversation.lastMessage;
      details.append(name, preview);
      const openLink = document.createElement('a');
      openLink.className = 'member-message-link';
      openLink.href = `direct.html?peer=${encodeURIComponent(conversation.peerId)}`;
      openLink.textContent = 'Open';
      item.append(details, openLink);
      list.append(item);
    });
  } catch (error) {
    emptyState.hidden = false;
    emptyState.textContent = error.message;
  }
}

function renderDirectMessages(messages, currentUserId) {
  const body = document.getElementById('direct-chat-body');
  if (!body) return;
  const lastMessageKey = messages.map((message) => `${message.senderId}:${message.createdAt}:${message.text}`).join('|');
  if (body.dataset.messageKey === lastMessageKey) return;
  body.dataset.messageKey = lastMessageKey;
  body.replaceChildren();

  messages.forEach((entry) => {
    const bubble = document.createElement('div');
    const outgoing = entry.senderId === currentUserId;
    bubble.className = `message ${outgoing ? 'outgoing' : 'incoming'}`;
    const content = document.createElement('span');
    content.textContent = entry.text;
    const meta = document.createElement('small');
    meta.className = 'message-meta';
    const timestamp = new Date(entry.createdAt);
    meta.textContent = Number.isNaN(timestamp.getTime())
      ? ''
      : timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    bubble.append(content, meta);
    body.append(bubble);
  });
  body.scrollTop = body.scrollHeight;
}

async function refreshDirectConversation() {
  const peerId = getDirectPeerId();
  const status = document.getElementById('direct-status');
  if (!peerId || !status) {
    if (status) status.textContent = 'Choose a member from the directory.';
    return;
  }
  try {
    const response = await fetch(`/api/direct/${encodeURIComponent(peerId)}`);
    if (response.status === 401) {
      window.location.href = 'login.html';
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load conversation.');
    document.getElementById('direct-peer-name').textContent = data.peer.fullName;
    status.textContent = '';
    renderDirectMessages(data.messages || [], data.currentUserId);
  } catch (error) {
    status.textContent = error.message;
  }
}

async function handleDirectMessageSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('direct-chat-input');
  const button = document.getElementById('direct-send-button');
  const status = document.getElementById('direct-status');
  const peerId = getDirectPeerId();
  const text = input?.value.trim();
  if (!peerId || !text || !button) return;

  button.disabled = true;
  try {
    const response = await fetch(`/api/direct/${encodeURIComponent(peerId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (response.status === 401) {
      window.location.href = 'login.html';
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Message could not be sent.');
    input.value = '';
    await refreshDirectConversation();
  } catch (error) {
    if (status) status.textContent = error.message;
  } finally {
    button.disabled = false;
    input?.focus();
  }
}

const conversationState = {
  lastTopic: null,
  memory: [],
  recentMessages: []
};

function formatTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function appendChatMessage(text, isOutgoing) {
  const chatBody = document.getElementById('chat-body');
  if (!chatBody) return;

  const message = document.createElement('div');
  message.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;

  const content = document.createElement('span');
  content.textContent = text;

  const meta = document.createElement('small');
  meta.className = 'message-meta';
  meta.textContent = formatTimestamp();

  message.appendChild(content);
  message.appendChild(meta);
  chatBody.appendChild(message);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function showTypingIndicator() {
  const chatBody = document.getElementById('chat-body');
  if (!chatBody) return null;

  const selectedProfile = getSelectedMatch();
  const typing = document.createElement('div');
  typing.className = 'message incoming typing';
  typing.innerHTML = `<span>${selectedProfile.name} is typing...</span><small class="message-meta">now</small>`;
  chatBody.appendChild(typing);
  chatBody.scrollTop = chatBody.scrollHeight;
  return typing;
}

function removeTypingIndicator() {
  const typing = document.querySelector('.typing');
  if (typing) {
    typing.remove();
  }
}

function detectTopic(messageText) {
  const text = messageText.toLowerCase();

  if (/(music|jazz|playlist|concert|festival|song)/.test(text)) return 'music';
  if (/(coffee|cafe|brunch|tea|matcha)/.test(text)) return 'coffee';
  if (/(travel|trip|adventure|hiking|outdoor|weekend)/.test(text)) return 'travel';
  if (/(movie|film|cinema|netflix|watch)/.test(text)) return 'movies';
  if (/(food|dinner|restaurant|ramen|pizza|cook)/.test(text)) return 'food';
  if (/(art|gallery|museum|creative|design)/.test(text)) return 'art';
  if (/(date|hang out|meet|plan|go out)/.test(text)) return 'dating';
  if (/(hi|hello|hey|yo|sup)/.test(text)) return 'greeting';
  return 'general';
}

function buildMatchContext() {
  const profile = getSelectedMatch();
  return {
    name: profile.name,
    city: profile.city,
    age: profile.age,
    tags: profile.tags,
    vibe: profile.vibe,
    personality: profile.personality,
    intro: `${profile.name} is ${profile.vibe} and loves ${profile.tags.join(', ').toLowerCase()}.`
  };
}

function generateAiReply(messageText) {
  const text = messageText.trim();
  const topic = detectTopic(text);
  const lastTopic = conversationState.lastTopic;
  const match = buildMatchContext();
  const lower = text.toLowerCase();

  conversationState.lastTopic = topic;
  conversationState.memory.push(topic);
  conversationState.recentMessages = [...conversationState.recentMessages.slice(-4), lower];

  if (!text) {
    return match.personality.opener;
  }

  const toneMap = {
    greeting: 'Hey, I like your energy. ',
    warm: 'That’s actually really nice to hear. ',
    flirt: 'I like that. ',
    thoughtful: 'I appreciate that. ',
    direct: 'Honestly, that makes sense. '
  };

  let tone = 'warm';
  if (/(hey|hi|hello|sup|yo)/.test(lower)) tone = 'greeting';
  if (/(love|cute|hot|beautiful|chemistry|spark|attraction|want|like you|miss you)/.test(lower)) tone = 'flirt';
  if (/(what are you into|tell me about you|who are you|your vibe|how are you|about you)/.test(lower)) tone = 'thoughtful';
  if (/(serious|real|relationship|looking for|genuine|honest|values)/.test(lower)) tone = 'direct';

  const topicPrompt = {
    music: 'Music says a lot about someone, and I like people who have taste instead of just replaying the same playlist. That kind of detail makes a person feel more real.',
    coffee: 'Coffee feels easy and honest. I like low-pressure plans where we can actually talk without trying too hard.',
    travel: 'I like spontaneity. A little adventure feels way more alive than a perfectly planned date that turns into a performance.',
    movies: 'Movie nights are fun, but the conversation after is what matters most. That’s where you actually learn if the chemistry is real.',
    food: 'Food is a great way to learn about someone. Good conversation, good energy, and no need to force anything usually works best.',
    art: 'I like people who notice details and have a point of view. That kind of depth makes a connection feel more genuine.',
    dating: 'I’m into that too. I’d rather have honesty, comfort, and a little spark than a polished date that feels empty.',
    general: 'I like where this is going. There’s something attractive about someone who is thoughtful and doesn’t play games.'
  };

  const introSentence = toneMap[tone] || toneMap.warm;
  const topicSentence = topicPrompt[topic] || 'I like that energy. I’m into people who feel real, warm, and easy to talk to.';

  const personalitySentence = `I’m ${match.name}, and I’m the kind of person who values ${match.personality.values}. I’m not here for fake chemistry — I want something that feels natural and comfortable.`;

  const memorySentence = conversationState.recentMessages.length >= 2
    ? `Also, I like that we’re actually building a rhythm here instead of just exchanging random lines.`
    : '';

  if (/(hello|hi|hey|yo|sup)/.test(lower)) {
    return `${introSentence}${personalitySentence} ${memorySentence}`.trim();
  }

  if (/(what are you into|tell me about you|who are you|your vibe|how are you|about you)/.test(lower)) {
    return `${introSentence}${personalitySentence} I’m into ${match.tags.join(', ').toLowerCase()}, but the real deal for me is comfort, honesty, and chemistry that feels easy. ${memorySentence}`.trim();
  }

  if (/(love|like|chemistry|spark|attraction|cute|hot|want|looking for|attracted)/.test(lower)) {
    return `${introSentence}I’m looking for something real, not just surface-level flirting. I like people who are confident, kind, and easy to be around, and I think that kind of chemistry matters way more than trying to impress someone. ${memorySentence}`.trim();
  }

  if (topic !== 'general' && lastTopic !== topic) {
    return `${introSentence}${topicSentence} ${personalitySentence} ${memorySentence}`.trim();
  }

  if (/(boring|nothing|no idea|unsure|confused)/.test(lower)) {
    return `${introSentence}That’s okay. We don’t need a perfect answer. I’d rather be honest and see if the energy is good than force a conversation that feels awkward. ${memorySentence}`.trim();
  }

  return `${introSentence}${topicSentence} I think that kind of honesty is attractive, and I’d rather build something real than do the usual superficial back-and-forth. ${memorySentence}`.trim();
}

async function handleChatSend() {
  const input = document.getElementById('chat-input-field');
  if (!input) return;

  const messageText = input.value.trim();
  if (!messageText) return;

  const selectedProfile = getSelectedMatch();
  appendChatMessage(messageText, true);
  input.value = '';

  showTypingIndicator();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: messageText,
        matchName: selectedProfile.name
      })
    });

    if (response.status === 401) {
      window.location.href = 'signup.html';
      return;
    }
    if (!response.ok) throw new Error('Message could not be sent.');

    const data = await response.json();
    const reply = data.reply || generateAiReply(messageText);

    removeTypingIndicator();

    const replyMessage = document.createElement('div');
    replyMessage.className = 'message incoming';

    const content = document.createElement('span');
    content.textContent = reply;

    const meta = document.createElement('small');
    meta.className = 'message-meta';
    meta.textContent = formatTimestamp();

    replyMessage.appendChild(content);
    replyMessage.appendChild(meta);

    const chatBody = document.getElementById('chat-body');
    if (chatBody) {
      chatBody.appendChild(replyMessage);
      chatBody.scrollTop = chatBody.scrollHeight;
    }
  } catch (error) {
    removeTypingIndicator();
    appendChatMessage(generateAiReply(messageText), false);
  }
}

async function loadSavedChatHistory() {
  const chatBody = document.getElementById('chat-body');
  if (!chatBody) return;

  const selectedProfile = getSelectedMatch();
  try {
    const response = await fetch(`/api/chat/history?matchName=${encodeURIComponent(selectedProfile.name)}`);
    if (response.status === 401) {
      window.location.href = 'signup.html';
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error('Saved chat history could not be loaded.');
    chatBody.innerHTML = '';

    if (!Array.isArray(data.messages) || data.messages.length === 0) {
      return;
    }

    data.messages.forEach((message) => {
      appendChatMessage(message.text, message.role === 'user');
    });
  } catch (error) {
    console.error('Failed to load saved chat history:', error);
  }
}

function setQuickReplyHandlers() {
  document.querySelectorAll('.quick-reply').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById('chat-input-field');
      if (!input) return;
      input.value = button.dataset.prompt || '';
      input.focus();
      handleChatSend();
    });
  });
}

function setReactionHandlers() {
  document.querySelectorAll('.reaction-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const reaction = button.dataset.reaction || '💞';
      appendChatMessage(`${reaction} That feels right.`, true);

      const typing = showTypingIndicator();
      setTimeout(() => {
        removeTypingIndicator();
        const moodReplies = {
          '🔥': 'I like that energy. You seem confident, playful, and a little adventurous. That’s attractive.',
          '💬': 'Good chat energy. I like people who can keep a conversation flowing without trying too hard.',
          '💞': 'That feels like chemistry. I’d be down for something low-pressure but genuinely fun.'
        };

        const reply = moodReplies[reaction] || 'That feels like chemistry. I’d be down for something low-pressure but genuinely fun.';
        const replyMessage = document.createElement('div');
        replyMessage.className = 'message incoming';

        const content = document.createElement('span');
        content.textContent = reply;

        const meta = document.createElement('small');
        meta.className = 'message-meta';
        meta.textContent = formatTimestamp();

        replyMessage.appendChild(content);
        replyMessage.appendChild(meta);

        const chatBody = document.getElementById('chat-body');
        if (chatBody) {
          chatBody.appendChild(replyMessage);
          chatBody.scrollTop = chatBody.scrollHeight;
        }
      }, 3000);
    });
  });
}

function resetChatConversation() {
  const chatBody = document.getElementById('chat-body');
  if (!chatBody) return;

  chatBody.innerHTML = '';
  conversationState.lastTopic = null;
  conversationState.memory = [];
  conversationState.recentMessages = [];
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  const passButton = document.getElementById('pass-button');
  const vibeButton = document.getElementById('vibe-button');
  const signupForm = document.getElementById('signup-form');
  const loginForm = document.getElementById('login-form');
  document.querySelectorAll('.sign-out-link').forEach((link) => {
    link.addEventListener('click', handleLogout);
  });
  const chatForm = document.getElementById('chat-form');
  const sendButton = document.getElementById('send-button');
  const resetButton = document.getElementById('reset-chat');
  const matchNameHeader = document.getElementById('chat-match-name');

  if (matchNameHeader) {
    const selectedProfile = getSelectedMatch();
    matchNameHeader.textContent = selectedProfile.name;
  }

  if (passButton) {
    passButton.addEventListener('click', () => handleMatchAction('pass'));
  }

  if (vibeButton) {
    vibeButton.addEventListener('click', () => handleMatchAction('vibe'));
  }

  if (signupForm) {
    signupForm.addEventListener('submit', handleSignupSubmit);
  }

  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }

  const searchForm = document.getElementById('member-search-form');
  if (searchForm) {
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      loadMemberDirectory(searchForm.elements.q.value.trim());
    });
    loadMemberDirectory();
    loadDirectInbox();
  }

  const directChatForm = document.getElementById('direct-chat-form');
  if (directChatForm) {
    directChatForm.addEventListener('submit', handleDirectMessageSubmit);
    refreshDirectConversation();
    window.setInterval(refreshDirectConversation, 4000);
  }

  if (chatForm) {
    chatForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleChatSend();
    });
  }

  if (sendButton) {
    sendButton.addEventListener('click', handleChatSend);
  }

  if (resetButton) {
    resetButton.addEventListener('click', resetChatConversation);
  }

  setQuickReplyHandlers();
  setReactionHandlers();

  if (document.getElementById('match-name')) {
    updateMatchCard();
  }

  if (document.getElementById('chat-body')) {
    const chatBody = document.getElementById('chat-body');
    if (chatBody) {
      chatBody.innerHTML = '';
      loadSavedChatHistory();
    }
  }
});

const MATCH_STORAGE_KEY = 'vibe-selected-match';
const THEME_STORAGE_KEY = 'vibe-theme';
const MATCH_PAGE_SIZE = 12;
let availableMatches = [];
let matchOffset = 0;
let matchTotal = 0;
const matchState = {
  currentIndex: 0
};

function showFormFeedback(formId, message) {
  const feedback = document.getElementById(`${formId}-feedback`);
  if (!feedback) {
    window.alert(message);
    return;
  }
  feedback.textContent = message;
  feedback.hidden = false;
}

function backendUnavailableMessage(error) {
  if (error instanceof TypeError) {
    return 'The app server is not reachable. Start it with `npm start`, then open http://localhost:3000.';
  }
  return error.message;
}

function initializeThemeToggle() {
  const buttons = document.querySelectorAll('.theme-toggle');
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';

  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    buttons.forEach((button) => {
      const lightModeIsActive = theme === 'light';
      button.textContent = lightModeIsActive ? 'Dark mode' : 'Light mode';
      button.setAttribute('aria-pressed', String(lightModeIsActive));
      button.setAttribute('aria-label', `Switch to ${lightModeIsActive ? 'dark' : 'light'} mode`);
    });
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
    });
  });

  applyTheme(savedTheme === 'light' ? 'light' : 'dark');
}

function getSelectedMatch() {
  const saved = localStorage.getItem(MATCH_STORAGE_KEY);
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved);
    return typeof parsed.id === 'string' ? parsed : null;
  } catch (error) {
    return null;
  }
}

function saveSelectedMatch(profile) {
  if (!profile) return;
  localStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(profile));
}

function updateMatchCard() {
  const profile = availableMatches[matchState.currentIndex];
  const matchName = document.getElementById('match-name');
  const matchMeta = document.getElementById('match-meta');
  const matchTags = document.getElementById('match-tags');
  const matchBadge = document.getElementById('match-badge');
  const matchImage = document.getElementById('match-image');
  const statusText = document.getElementById('status-text');
  const matchCard = document.getElementById('match-card');
  const actionRow = document.getElementById('match-actions');

  if (!profile) {
    if (matchCard) matchCard.hidden = true;
    if (actionRow) actionRow.hidden = true;
    if (statusText) statusText.textContent = 'No compatible matches are available yet.';
    return;
  }
  if (matchCard) matchCard.hidden = false;
  if (actionRow) actionRow.hidden = false;
  if (!matchName || !matchMeta || !matchTags || !matchBadge) return;

  const displayName = profile.fullName || profile.name || 'Vibe member';
  const age = profile.age || 26;
  const city = profile.city || 'Nearby';
  const matchScore = profile.match || 92;
  const tags = Array.isArray(profile.tags) && profile.tags.length ? profile.tags : (Array.isArray(profile.vibeTags) ? profile.vibeTags : ['Coffee', 'Travel']);

  matchName.textContent = displayName;
  matchMeta.textContent = `${age} • ${city}`;
  matchBadge.textContent = `${matchScore}% match`;
  if (matchImage) {
    matchImage.src = profile.image || 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85';
    matchImage.alt = `Portrait of ${displayName}`;
  }
  matchTags.innerHTML = tags.slice(0, 3).map((tag) => `<span>${tag}</span>`).join('');

  if (statusText) {
    statusText.textContent = `Showing match ${matchState.currentIndex + 1} of ${Math.max(matchTotal, availableMatches.length).toLocaleString()} members.`;
  }
}

async function loadMatchesPage() {
  const statusText = document.getElementById('status-text');
  const matchCard = document.getElementById('match-card');
  const actionRow = document.getElementById('match-actions');
  if (!statusText || !matchCard || !actionRow) return;

  statusText.textContent = 'Loading compatible members...';

  try {
    const response = await fetch('/api/users');
    if (response.status === 401) {
      window.location.href = 'login.html';
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load members.');

    const users = (data.users || []).slice(0, MATCH_PAGE_SIZE);
    availableMatches = users.map((user, index) => ({
      id: user.userId,
      fullName: user.fullName,
      name: user.fullName,
      age: 24 + ((index * 7) % 12),
      city: 'Nearby',
      match: 84 + (index % 12),
      tags: Array.isArray(user.vibeTags) && user.vibeTags.length ? user.vibeTags : ['Coffee', 'Travel'],
      vibeTags: Array.isArray(user.vibeTags) ? user.vibeTags : ['Coffee', 'Travel'],
      image: index % 2 === 0
        ? 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85'
        : 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=85'
    }));
    matchTotal = availableMatches.length;
    matchState.currentIndex = 0;
    updateMatchCard();
  } catch (error) {
    statusText.textContent = error.message;
  }
}

async function handleMatchAction(action) {
  const statusText = document.getElementById('status-text');
  if (!statusText) return;

  if (action === 'pass') {
    if (matchState.currentIndex + 1 < availableMatches.length) {
      matchState.currentIndex += 1;
      updateMatchCard();
      return;
    }
    await loadMatchesPage();
    return;
  }

  const selectedProfile = availableMatches[matchState.currentIndex];
  if (!selectedProfile?.id) return;
  statusText.textContent = 'It’s a vibe! Opening the conversation.';
  saveSelectedMatch(selectedProfile);

  setTimeout(() => {
    window.location.href = `direct.html?peer=${encodeURIComponent(selectedProfile.id)}`;
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
      const data = await response.json().catch(() => ({}));
      if (response.status === 404) {
        throw new Error('The signup API was not found. Start the app with `npm start` and open http://localhost:3000 instead of using a static preview.');
      }
      throw new Error(data.error || 'The profile could not be saved.');
    }
  } catch (error) {
    console.error('Signup save failed:', error);
    if (button) {
      button.disabled = false;
      button.textContent = 'Find Matches';
    }
    showFormFeedback('signup', backendUnavailableMessage(error));
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
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('The sign-in API was not found. Start the app with `npm start` and open http://localhost:3000 instead of using a static preview.');
      }
      throw new Error(data.error || 'Sign in failed.');
    }
    window.location.href = 'matches.html';
  } catch (error) {
    showFormFeedback('login', backendUnavailableMessage(error));
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

async function exportAccountData() {
  const status = document.getElementById('privacy-status');
  if (status) status.textContent = 'Preparing your export...';
  try {
    const response = await fetch('/api/account/export');
    if (response.status === 401) {
      window.location.href = 'login.html';
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not export account data.');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = 'vibe-account-data.json';
    link.click();
    URL.revokeObjectURL(downloadUrl);
    if (status) status.textContent = 'Your data export has been downloaded.';
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function handleAccountDeletion(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const password = form.elements.password.value;
  if (!window.confirm('Permanently delete your Vibe account and its conversations? This cannot be undone.')) return;

  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById('privacy-status');
  if (button) button.disabled = true;
  try {
    const response = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (response.status === 401 && data.error !== 'Password is incorrect. Your account was not deleted.') {
      window.location.href = 'login.html';
      return;
    }
    if (!response.ok) throw new Error(data.error || 'Account deletion failed.');
    localStorage.removeItem(MATCH_STORAGE_KEY);
    window.location.href = 'index.html';
  } catch (error) {
    if (status) status.textContent = error.message;
    if (button) button.disabled = false;
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

async function loadBlockedMembers() {
  const list = document.getElementById('blocked-list');
  const emptyState = document.getElementById('blocked-empty');
  if (!list || !emptyState) return;

  try {
    const response = await fetch('/api/blocks');
    if (response.status === 401) {
      window.location.href = 'login.html';
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load blocked members.');
    list.replaceChildren();
    const blocked = data.blocked || [];
    emptyState.hidden = blocked.length > 0;
    blocked.forEach((member) => {
      const row = document.createElement('article');
      row.className = 'member-row';
      const name = document.createElement('h3');
      name.className = 'member-details';
      name.textContent = member.fullName;
      const unblock = document.createElement('button');
      unblock.type = 'button';
      unblock.className = 'safety-action';
      unblock.textContent = 'Unblock';
      unblock.addEventListener('click', async () => {
        unblock.disabled = true;
        try {
          const result = await fetch(`/api/users/${encodeURIComponent(member.userId)}/block`, { method: 'DELETE' });
          if (!result.ok) throw new Error('Could not unblock this member.');
          await loadBlockedMembers();
          await loadMemberDirectory();
        } catch (error) {
          unblock.disabled = false;
          window.alert(error.message);
        }
      });
      row.append(name, unblock);
      list.append(row);
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

async function handleDirectSafetyAction(action) {
  const peerId = getDirectPeerId();
  const status = document.getElementById('direct-status');
  if (!peerId) return;
  if (action === 'block' && !window.confirm('Block this member? They will no longer see you in discovery or be able to message you.')) return;
  if (action === 'report' && !window.confirm('Send this report for moderator review?')) return;

  const endpoint = `/api/users/${encodeURIComponent(peerId)}/${action}`;
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
  if (action === 'report') {
    options.body = JSON.stringify({ reason: document.getElementById('report-reason').value });
  }

  try {
    const response = await fetch(endpoint, options);
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = 'login.html';
      return;
    }
    if (!response.ok) throw new Error(data.error || 'Safety action could not be completed.');
    if (action === 'block') {
      window.location.href = 'people.html';
      return;
    }
    if (status) status.textContent = 'Report submitted for moderator review.';
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

function setModeratorAuthenticated(isAuthenticated) {
  const loginPanel = document.getElementById('moderator-login-panel');
  const dashboard = document.getElementById('moderation-dashboard');
  const logoutButton = document.getElementById('moderator-logout');
  if (!loginPanel || !dashboard || !logoutButton) return;
  loginPanel.hidden = isAuthenticated;
  dashboard.hidden = !isAuthenticated;
  logoutButton.hidden = !isAuthenticated;
}

function renderModerationReports(reports) {
  const list = document.getElementById('report-list');
  const emptyState = document.getElementById('reports-empty');
  if (!list || !emptyState) return;
  list.replaceChildren();
  emptyState.hidden = reports.length > 0;

  reports.forEach((report) => {
    const card = document.createElement('article');
    card.className = 'report-row';
    const details = document.createElement('div');
    details.className = 'report-details';
    const heading = document.createElement('h2');
    heading.textContent = `${report.reported} · ${report.reason}`;
    const reporter = document.createElement('p');
    reporter.textContent = `Reported by ${report.reporter}`;
    const time = document.createElement('small');
    const createdAt = new Date(report.createdAt);
    time.textContent = Number.isNaN(createdAt.getTime()) ? '' : createdAt.toLocaleString();
    details.append(heading, reporter, time);

    const resolve = document.createElement('button');
    resolve.type = 'button';
    resolve.className = 'safety-action';
    resolve.textContent = 'Resolve';
    resolve.addEventListener('click', async () => {
      resolve.disabled = true;
      try {
        const response = await fetch(`/api/moderation/reports/${encodeURIComponent(report.id)}/resolve`, { method: 'POST' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not resolve report.');
        await loadModerationReports();
      } catch (error) {
        const status = document.getElementById('report-status');
        if (status) status.textContent = error.message;
        resolve.disabled = false;
      }
    });
    card.append(details, resolve);
    list.append(card);
  });
}

async function loadModerationReports() {
  const status = document.getElementById('report-status');
  if (!status) return;
  status.textContent = 'Loading reports...';
  try {
    const response = await fetch('/api/moderation/reports');
    if (response.status === 401) {
      setModeratorAuthenticated(false);
      status.textContent = '';
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not load reports.');
    setModeratorAuthenticated(true);
    status.textContent = '';
    renderModerationReports(data.reports || []);
  } catch (error) {
    status.textContent = error.message;
    if (document.getElementById('moderator-login-panel')?.hidden === false) {
      const loginStatus = document.getElementById('moderator-login-status');
      if (loginStatus) loginStatus.textContent = error.message;
    }
  }
}

async function handleModeratorLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById('moderator-login-status');
  try {
    const response = await fetch('/api/moderation/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: form.elements.token.value })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Moderator sign in failed.');
    form.reset();
    setModeratorAuthenticated(true);
    await loadModerationReports();
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function handleModeratorLogout() {
  await fetch('/api/moderation/logout', { method: 'POST' });
  setModeratorAuthenticated(false);
}

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
  return message;
}

function showTypingIndicator() {
  const chatBody = document.getElementById('chat-body');
  if (!chatBody) return null;

  const selectedProfile = getSelectedMatch();
  if (!selectedProfile) return null;
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

async function handleChatSend() {
  const input = document.getElementById('chat-input-field');
  if (!input) return;

  const messageText = input.value.trim();
  if (!messageText) return;

  const selectedProfile = getSelectedMatch();
  if (!selectedProfile?.id) {
    window.location.href = 'matches.html';
    return;
  }
  const status = document.getElementById('chat-status');
  const outgoingMessage = appendChatMessage(messageText, true);
  input.value = '';
  if (status) status.textContent = '';

  showTypingIndicator();

  try {
    const request = fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: messageText,
        characterId: selectedProfile.id
      })
    });
    const [response] = await Promise.all([
      request,
      new Promise((resolve) => window.setTimeout(resolve, 4000))
    ]);

    if (response.status === 401) {
      window.location.href = 'login.html';
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The AI reply could not be generated.');
    const reply = data.reply;
    if (typeof reply !== 'string' || !reply.trim()) throw new Error('The AI returned an empty reply. Please try again.');

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
    outgoingMessage?.remove();
    input.value = messageText;
    if (status) status.textContent = error instanceof TypeError
      ? 'Could not reach the chat service. Check that the server is running.'
      : error.message;
  }
}

async function loadSavedChatHistory() {
  const chatBody = document.getElementById('chat-body');
  if (!chatBody) return;

  const selectedProfile = getSelectedMatch();
  if (!selectedProfile?.id) {
    window.location.href = 'matches.html';
    return;
  }
  try {
    const response = await fetch(`/api/chat/history?characterId=${encodeURIComponent(selectedProfile.id)}`);
    if (response.status === 401) {
      window.location.href = 'login.html';
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
      const input = document.getElementById('chat-input-field');
      if (!input) return;
      input.value = `I'm feeling ${reaction} about this conversation. What do you think?`;
      handleChatSend();
    });
  });
}

function resetChatConversation() {
  const chatBody = document.getElementById('chat-body');
  if (!chatBody) return;

  chatBody.innerHTML = '';
}

document.addEventListener('DOMContentLoaded', () => {
  initializeThemeToggle();

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
  const resetButton = document.getElementById('reset-chat');
  const matchNameHeader = document.getElementById('chat-match-name');

  if (matchNameHeader) {
    const selectedProfile = getSelectedMatch();
    if (!selectedProfile?.id) {
      window.location.href = 'matches.html';
      return;
    }
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
    const genderSelect = signupForm.elements.gender;
    const lookingForSelect = signupForm.elements.lookingFor;
    const syncLookingFor = () => {
      const gender = genderSelect.value;
      const forcedPreference = gender === 'man' ? 'women' : gender === 'woman' ? 'men' : 'everyone';
      Array.from(lookingForSelect.options).forEach((option) => {
        option.disabled = gender !== 'nonbinary' && option.value !== forcedPreference;
      });
      lookingForSelect.value = forcedPreference;
    };
    genderSelect.addEventListener('change', syncLookingFor);
    syncLookingFor();
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
    loadBlockedMembers();
  }
  const exportDataButton = document.getElementById('export-account-data');
  const deleteAccountForm = document.getElementById('delete-account-form');
  if (exportDataButton) exportDataButton.addEventListener('click', exportAccountData);
  if (deleteAccountForm) deleteAccountForm.addEventListener('submit', handleAccountDeletion);

  const directChatForm = document.getElementById('direct-chat-form');
  if (directChatForm) {
    directChatForm.addEventListener('submit', handleDirectMessageSubmit);
    refreshDirectConversation();
    window.setInterval(refreshDirectConversation, 4000);
  }
  const blockButton = document.getElementById('block-member');
  const reportButton = document.getElementById('report-member');
  if (blockButton) blockButton.addEventListener('click', () => handleDirectSafetyAction('block'));
  if (reportButton) reportButton.addEventListener('click', () => handleDirectSafetyAction('report'));

  const moderatorLoginForm = document.getElementById('moderator-login-form');
  const moderatorLogoutButton = document.getElementById('moderator-logout');
  const refreshReportsButton = document.getElementById('refresh-reports');
  if (moderatorLoginForm) {
    moderatorLoginForm.addEventListener('submit', handleModeratorLogin);
    loadModerationReports();
  }
  if (moderatorLogoutButton) moderatorLogoutButton.addEventListener('click', handleModeratorLogout);
  if (refreshReportsButton) refreshReportsButton.addEventListener('click', loadModerationReports);

  if (chatForm) {
    chatForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleChatSend();
    });
  }

  if (resetButton) {
    resetButton.addEventListener('click', resetChatConversation);
  }

  setQuickReplyHandlers();
  setReactionHandlers();

  if (document.getElementById('match-name')) {
    loadMatchesPage();
  }

  if (document.getElementById('chat-body')) {
    const chatBody = document.getElementById('chat-body');
    if (chatBody) {
      chatBody.innerHTML = '';
      loadSavedChatHistory();
    }
  }
});

import { DIFFICULTIES, buildPool, createWordPicker, getDifficultyConfig, loadCharacterBook } from './characters.js';

const elements = {
  difficulty: document.querySelector('#difficulty'),
  settingsButton: document.querySelector('#settingsButton'),
  closeSettingsButton: document.querySelector('#closeSettingsButton'),
  settingsPanel: document.querySelector('#settingsPanel'),
  themeSelect: document.querySelector('#themeSelect'),
  animationToggle: document.querySelector('#animationToggle'),
  contextToggle: document.querySelector('#contextToggle'),
  fullscreenToggle: document.querySelector('#fullscreenToggle'),
  startButton: document.querySelector('#startButton'),
  typingInput: document.querySelector('#typingInput'),
  feedback: document.querySelector('#feedback'),
  wordTrack: document.querySelector('#wordTrack'),
  wordTimer: document.querySelector('#wordTimer'),
  liveWpm: document.querySelector('#liveWpm'),
  sessionTimer: document.querySelector('#sessionTimer'),
  chartCanvas: document.querySelector('#wpmChart'),
};

const themes = [
  { id: 'white', label: 'White', className: 'theme-white' },
  { id: 'black', label: 'Black', className: 'theme-black' },
  { id: 'green', label: 'Light green', className: 'theme-green' },
  { id: 'blue', label: 'Light blue', className: 'theme-blue' },
  { id: 'pink', label: 'Pink', className: 'theme-pink' },
  { id: 'dark', label: 'Dark', className: 'theme-dark' },
  { id: 'brown', label: 'Brown', className: 'theme-brown' },
];

const picker = createWordPicker();
const settingsKey = 'suchen-practice-settings';

const state = {
  ready: false,
  running: false,
  book: [],
  pool: [],
  history: [null, null, null, null, null],
  currentStartedAt: 0,
  sessionStartedAt: 0,
  completedWords: 0,
  wpmHistory: [],
  maxHistory: 32,
  animating: false,
  pendingCommit: null,
  settings: loadSettings(),
};

const chart = {
  ctx: elements.chartCanvas.getContext('2d'),
  width: elements.chartCanvas.width,
  height: elements.chartCanvas.height,
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) ?? 'null');

    return {
      theme: saved?.theme ?? 'green',
      difficulty: saved?.difficulty ?? 'common',
      animate: saved?.animate ?? true,
      context: saved?.context ?? true,
      fullscreen: saved?.fullscreen ?? false,
    };
  } catch {
    return { theme: 'green', difficulty: 'common', animate: true, context: true, fullscreen: false };
  }
}

function saveSettings() {
  localStorage.setItem(settingsKey, JSON.stringify(state.settings));
}

function applySettings() {
  document.body.dataset.theme = state.settings.theme;
  document.body.dataset.animate = String(state.settings.animate);
  document.body.dataset.context = String(state.settings.context);
  elements.animationToggle.checked = state.settings.animate;
  elements.contextToggle.checked = state.settings.context;
  elements.fullscreenToggle.checked = state.settings.fullscreen;
  elements.themeSelect.value = state.settings.theme;
}

function populateSelectors() {
  elements.difficulty.innerHTML = DIFFICULTIES.map(
    (difficulty) => `<option value="${difficulty.id}">${difficulty.label} · ${difficulty.rangeLabel}</option>`,
  ).join('');

  elements.themeSelect.innerHTML = themes.map((theme) => `<option value="${theme.id}">${theme.label}</option>`).join('');
}

function formatSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, '0');

  return `${minutes}:${seconds}`;
}

function renderWordTrack() {
  const showContext = state.settings.context;

  elements.wordTrack.classList.toggle('show-context', showContext);
  elements.wordTrack.innerHTML = state.history
    .map((word, index) => {
      const role = index === 2 ? 'current' : index < 2 ? 'previous' : 'next';
      return `<span class="word-slot word-slot-${role}">${word ?? '&nbsp;'}</span>`;
    })
    .join('');
}

function drawChart() {
  const { ctx, width, height } = chart;
  const padding = { top: 18, right: 10, bottom: 16, left: 28 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;
  const values = state.wpmHistory.slice(-state.maxHistory);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;

  for (let row = 0; row <= 4; row += 1) {
    const y = padding.top + (graphHeight * row) / 4;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  if (!values.length) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WPM graph', width / 2, height / 2);
    return;
  }

  const maxValue = Math.max(20, ...values, 30);
  const points = values.map((value, index) => {
    const x = padding.left + (graphWidth * (values.length === 1 ? 0.5 : index)) / Math.max(1, values.length - 1);
    const y = height - padding.bottom - (Math.min(1, value / maxValue) * graphHeight);
    return { x, y };
  });

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.95)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();
}

function renderStats(now = performance.now()) {
  if (!state.running) {
    elements.wordTimer.textContent = '0.0s';
    elements.liveWpm.textContent = '0';
    elements.sessionTimer.textContent = '00:00';
    return;
  }

  const elapsedWordSeconds = Math.max((now - state.currentStartedAt) / 1000, 0.001);
  const liveWpmValue = 60 / elapsedWordSeconds;
  const elapsedSessionSeconds = Math.max((now - state.sessionStartedAt) / 1000, 0.001);

  elements.wordTimer.textContent = `${elapsedWordSeconds.toFixed(1)}s`;
  elements.liveWpm.textContent = Math.round(liveWpmValue).toString();
  elements.sessionTimer.textContent = formatSeconds(elapsedSessionSeconds);
}

function updateHUD() {
  renderWordTrack();
  drawChart();
  renderStats();
}

function seedHistory() {
  const recent = [];
  const initial = [null, null, null, null, null];

  for (let index = 2; index < 5; index += 1) {
    const word = picker(state.pool, recent);
    recent.push(word);
    if (recent.length > 8) {
      recent.shift();
    }
    initial[index] = word;
  }

  return initial;
}

function startSession() {
  const difficulty = getDifficultyConfig(elements.difficulty.value);
  state.settings.difficulty = difficulty.id;
  saveSettings();
  state.pool = buildPool(state.book, difficulty.maxIndex);

  if (!state.pool.length) {
    elements.feedback.textContent = 'No characters were found for the selected difficulty.';
    return;
  }

  state.running = true;
  state.history = seedHistory();
  state.currentStartedAt = performance.now();
  state.sessionStartedAt = state.currentStartedAt;
  state.completedWords = 0;
  state.wpmHistory = [];
  elements.typingInput.value = '';
  elements.typingInput.focus();
  elements.feedback.textContent = `Practice started at ${difficulty.label.toLowerCase()} difficulty.`;
  updateHUD();
}

function commitAdvance(nextWord, now) {
  state.history = [state.history[1], state.history[2], state.history[3], state.history[4], nextWord];
  state.currentStartedAt = now;
  state.animating = false;
  state.pendingCommit = null;
  elements.wordTrack.classList.remove('is-shifting');
  elements.wordTrack.style.transform = 'translateX(0)';
  updateHUD();
}

function advanceWord(now) {
  const durationSeconds = Math.max((now - state.currentStartedAt) / 1000, 0.001);
  const wordWpm = 60 / durationSeconds;
  const nextWord = picker(state.pool, state.history.filter(Boolean));

  state.completedWords += 1;
  state.wpmHistory.push(wordWpm);
  if (state.wpmHistory.length > state.maxHistory) {
    state.wpmHistory.shift();
  }

  if (!state.settings.animate) {
    commitAdvance(nextWord, now);
    return;
  }

  state.animating = true;
  state.pendingCommit = window.setTimeout(() => commitAdvance(nextWord, now), 180);
  elements.wordTrack.classList.add('is-shifting');
  elements.wordTrack.style.transform = 'translateX(-2.6rem)';
}

function maybeCompleteCurrentWord() {
  const currentWord = state.history[2] ?? '';
  const typedValue = elements.typingInput.value.trim();

  if (!state.running || !currentWord) {
    return;
  }

  if (typedValue === currentWord) {
    elements.feedback.textContent = `Hit ${currentWord}.`;
    advanceWord(performance.now());
  }
}

function wireTyping() {
  elements.typingInput.addEventListener('input', maybeCompleteCurrentWord);
  elements.typingInput.addEventListener('keydown', (event) => {
    if (!state.running) {
      return;
    }

    if (event.key === 'Enter') {
      maybeCompleteCurrentWord();
    }
  });
}

function toggleSettings(open) {
  elements.settingsPanel.classList.toggle('is-open', open);
  elements.settingsPanel.setAttribute('aria-hidden', String(!open));
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }

  document.documentElement.requestFullscreen().catch(() => {});
}

function wireSettings() {
  elements.settingsButton.addEventListener('click', () => toggleSettings(true));
  elements.closeSettingsButton.addEventListener('click', () => toggleSettings(false));
  elements.themeSelect.addEventListener('change', () => {
    state.settings.theme = elements.themeSelect.value;
    saveSettings();
    applySettings();
  });
  elements.difficulty.addEventListener('change', () => {
    state.settings.difficulty = elements.difficulty.value;
    saveSettings();
  });
  elements.animationToggle.addEventListener('change', () => {
    state.settings.animate = elements.animationToggle.checked;
    saveSettings();
    applySettings();
  });
  elements.contextToggle.addEventListener('change', () => {
    state.settings.context = elements.contextToggle.checked;
    saveSettings();
    applySettings();
    renderWordTrack();
  });
  elements.fullscreenToggle.addEventListener('change', () => {
    state.settings.fullscreen = elements.fullscreenToggle.checked;
    saveSettings();
    if (state.settings.fullscreen) {
      toggleFullscreen();
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  });
}

function wireOtherControls() {
  elements.startButton.addEventListener('click', startSession);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      toggleSettings(false);
    }
  });
}

function startAnimationLoop() {
  const frame = (now) => {
    if (state.running) {
      renderStats(now);
    }

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

async function bootstrap() {
  populateSelectors();
  applySettings();
  wireTyping();
  wireSettings();
  wireOtherControls();
  startAnimationLoop();

  state.book = await loadCharacterBook();
  state.ready = true;
  elements.difficulty.value = state.settings.difficulty;
  elements.feedback.textContent = 'Character list loaded. Choose a difficulty and press Start.';
  updateHUD();
}

bootstrap();
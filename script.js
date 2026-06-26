/**
 * ============================================================
 * MEMORY FLIP — script.js
 * A complete Memory Card Matching Game
 *
 * Architecture:
 *   - STATE: a single object holds all game data
 *   - INIT:  functions that set up the board
 *   - LOGIC: core game rules (flip, match, win)
 *   - UI:    DOM updates and animations
 *   - TIMER: interval management
 *   - STORE: localStorage read/write
 *   - SOUND: Web Audio API synthetic tones
 *   - EVENTS: all addEventListener calls at the bottom
 * ============================================================
 */

'use strict';

/* ── 1. EMOJI POOL ──────────────────────────────────────────
   32 distinct emojis — enough for Hard mode (32 pairs).
   Organized so that Easy uses the first 8,
   Medium the first 18, Hard all 32.
   ──────────────────────────────────────────────────────────── */
const EMOJI_POOL = [
  '😀','😎','🤖','👻','🐶','🦄','🍕','🍎',   // Easy (8)
  '🚀','⚽','🎮','❤️','🌈','🐱','🐼','🍩',   // Medium adds these (18 total)
  '🦊','🐸','🌊','⭐','🎸','🏆','🌸','🦋',   // Hard adds these (32 total)
  '🍦','🔥','💎','🎯','🦁','🐙','🍄','🎪',
];

/* ── 2. DIFFICULTY SETTINGS ─────────────────────────────────
   Each difficulty defines:
     cols  - grid columns
     pairs - number of pairs (cards = pairs * 2)
     emojis - slice of EMOJI_POOL to use
   ──────────────────────────────────────────────────────────── */
const DIFFICULTY = {
  easy:   { cols: 4, pairs: 8,  label: 'Easy'   },
  medium: { cols: 6, pairs: 18, label: 'Medium'  },
  hard:   { cols: 8, pairs: 32, label: 'Hard'    },
};

/* ── 3. GAME STATE ──────────────────────────────────────────
   A single source of truth. Never mutate this directly —
   use the helper functions below.
   ──────────────────────────────────────────────────────────── */
const STATE = {
  difficulty:      'medium', // 'easy' | 'medium' | 'hard'
  cards:           [],       // Array of card data objects
  flippedCards:    [],       // Currently face-up (unmatched) cards [0..2]
  matchedPairs:    0,        // How many pairs found so far
  totalPairs:      0,        // Total pairs in this game
  moves:           0,        // Number of pair attempts
  timerSeconds:    0,        // Elapsed seconds
  timerInterval:   null,     // setInterval handle
  isPaused:        false,    // Is the game paused?
  isLocked:        false,    // Block clicks while checking a mismatch
  gameStarted:     false,    // Has the player made their first flip?
  soundEnabled:    true,     // Sound toggle
};

/* ── 4. DOM REFERENCES ──────────────────────────────────────
   Grab all elements once and reuse them.
   ──────────────────────────────────────────────────────────── */
const DOM = {
  board:          document.getElementById('game-board'),
  timer:          document.getElementById('timer'),
  moves:          document.getElementById('moves'),
  bestScore:      document.getElementById('best-score'),
  bestTime:       document.getElementById('best-time'),
  winModal:       document.getElementById('win-modal'),
  modalTime:      document.getElementById('modal-time'),
  modalMoves:     document.getElementById('modal-moves'),
  modalBest:      document.getElementById('modal-best'),
  modalBadge:     document.getElementById('modal-badge'),
  pauseOverlay:   document.getElementById('pause-overlay'),
  btnRestart:     document.getElementById('btn-restart'),
  btnPause:       document.getElementById('btn-pause'),
  btnResume:      document.getElementById('btn-resume'),
  btnNewGame:     document.getElementById('btn-new-game'),
  btnPlayAgain:   document.getElementById('btn-play-again'),
  btnHarder:      document.getElementById('btn-harder'),
  btnDarkMode:    document.getElementById('btn-dark-mode'),
  btnSound:       document.getElementById('btn-sound'),
  segBtns:        document.querySelectorAll('.seg-btn'),
};

/* ============================================================
   SECTION A: INITIALIZATION
   ============================================================ */

/**
 * initializeGame()
 * Entry point for starting or restarting a game.
 * Resets state, builds the board, loads scores.
 *
 * @param {boolean} newShuffle - If true, picks new emojis; if false, same set
 */
function initializeGame(newShuffle = true) {
  // Stop any running timer
  stopTimer();

  // Reset all state fields
  STATE.flippedCards  = [];
  STATE.matchedPairs  = 0;
  STATE.moves         = 0;
  STATE.timerSeconds  = 0;
  STATE.isPaused      = false;
  STATE.isLocked      = false;
  STATE.gameStarted   = false;
  STATE.totalPairs    = DIFFICULTY[STATE.difficulty].pairs;

  // Update the UI immediately
  updateMoves();
  updateTimerDisplay();

  // Hide overlays
  DOM.winModal.classList.add('hidden');
  DOM.pauseOverlay.classList.add('hidden');
  DOM.btnPause.textContent = '⏸ Pause';

  // Build the card data and render the board
  if (newShuffle) {
    STATE.cards = createCardData();
  }
  renderBoard();

  // Load high score for current difficulty
  loadHighScore();
}

/**
 * createCardData()
 * Picks emojis for the current difficulty, creates pairs,
 * and shuffles them into a randomized order.
 *
 * Returns an array of card objects: { id, emoji, isFlipped, isMatched }
 */
function createCardData() {
  const { pairs } = DIFFICULTY[STATE.difficulty];

  // Slice the emoji pool to the number of pairs needed
  const selectedEmojis = EMOJI_POOL.slice(0, pairs);

  // Create two cards per emoji (the pair)
  const cardPairs = selectedEmojis.flatMap((emoji, index) => [
    { id: `card-${index}-a`, emoji, isFlipped: false, isMatched: false },
    { id: `card-${index}-b`, emoji, isFlipped: false, isMatched: false },
  ]);

  // Shuffle and return
  return shuffleArray(cardPairs);
}

/**
 * shuffleArray()
 * Fisher-Yates shuffle — ensures every permutation is equally likely.
 * Creates a new array (non-mutating).
 *
 * @param {Array} array - The array to shuffle
 * @returns {Array} A new shuffled array
 */
function shuffleArray(array) {
  const shuffled = [...array]; // Copy so we don't mutate the original
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // Swap
  }
  return shuffled;
}

/* ============================================================
   SECTION B: BOARD RENDERING
   ============================================================ */

/**
 * renderBoard()
 * Clears the game board and renders all card elements from STATE.cards.
 * Each card gets a staggered animation delay for a "deal" effect.
 */
function renderBoard() {
  const { cols } = DIFFICULTY[STATE.difficulty];

  // Update CSS class so the grid layout adjusts
  DOM.board.className = `game-board ${STATE.difficulty}`;

  // Clear existing cards
  DOM.board.innerHTML = '';

  // Create and append each card element
  STATE.cards.forEach((cardData, index) => {
    const cardEl = createCardElement(cardData, index);
    DOM.board.appendChild(cardEl);
  });
}

/**
 * createCardElement()
 * Builds the HTML for a single card with its 3D flip structure.
 *
 * Card HTML structure:
 *   .card (outer — handles perspective + click)
 *     .card-inner (rotates on flip)
 *       .card-front (the "?" side, always present)
 *       .card-back  (the emoji side, shown after flip)
 *
 * @param {Object} cardData - { id, emoji, isFlipped, isMatched }
 * @param {number} index - Position in the array (for animation delay)
 * @returns {HTMLElement}
 */
function createCardElement(cardData, index) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = cardData.id;     // Link DOM node to state
  card.dataset.emoji = cardData.emoji;

  // Accessibility attributes
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', 'Face-down card');
  card.setAttribute('tabindex', '0');

  // Staggered deal animation (max 600ms total spread)
  const delay = Math.min(index * 30, 600);
  card.style.animationDelay = `${delay}ms`;

  // Inner structure
  card.innerHTML = `
    <div class="card-inner">
      <div class="card-front" aria-hidden="true"></div>
      <div class="card-back" aria-hidden="true">${cardData.emoji}</div>
    </div>
  `;

  // Click handler
  card.addEventListener('click', () => handleCardClick(card, cardData));

  // Keyboard handler (Enter/Space to flip)
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick(card, cardData);
    }
  });

  return card;
}

/* ============================================================
   SECTION C: GAME LOGIC
   ============================================================ */

/**
 * handleCardClick()
 * Called every time a card is clicked.
 * Guards against invalid clicks (already flipped, matched, paused, locked).
 *
 * @param {HTMLElement} cardEl   - The clicked card DOM element
 * @param {Object}      cardData - The card's data from STATE.cards
 */
function handleCardClick(cardEl, cardData) {
  // Block clicks in these situations:
  if (STATE.isLocked)           return; // Two non-matched cards are on display
  if (STATE.isPaused)           return; // Game is paused
  if (cardData.isFlipped)       return; // Card already face-up
  if (cardData.isMatched)       return; // Card already matched

  // Start the timer on first flip
  if (!STATE.gameStarted) {
    STATE.gameStarted = true;
    startTimer();
  }

  // Flip this card
  flipCard(cardEl, cardData);

  // Track the flipped cards
  STATE.flippedCards.push({ el: cardEl, data: cardData });

  // When two cards are face up, check for a match
  if (STATE.flippedCards.length === 2) {
    STATE.isLocked = true; // Lock the board while we evaluate
    STATE.moves++
    updateMoves();         // Increment move counter
    checkMatch();
  }
}

/**
 * flipCard()
 * Flips a card face-up by adding the .flipped CSS class.
 * Updates the card's state and accessibility label.
 *
 * @param {HTMLElement} cardEl   - The card DOM element
 * @param {Object}      cardData - The card's data
 */
function flipCard(cardEl, cardData) {
  cardData.isFlipped = true;
  cardEl.classList.add('flipped');
  cardEl.setAttribute('aria-label', `Card showing ${cardData.emoji}`);
  playSound('flip');
}

/**
 * checkMatch()
 * Compares the two flipped cards.
 * If they match → celebrate and keep them face-up.
 * If not → shake and flip them back after a delay.
 */
function checkMatch() {
  const [first, second] = STATE.flippedCards;
  const isMatch = first.data.emoji === second.data.emoji;

  if (isMatch) {
    handleMatch(first, second);
  } else {
    handleMismatch(first, second);
  }
}

/**
 * handleMatch()
 * Marks both cards as permanently matched, plays celebration, checks for win.
 *
 * @param {Object} first  - { el, data } for first card
 * @param {Object} second - { el, data } for second card
 */
function handleMatch(first, second) {
  // Mark in state
  first.data.isMatched  = true;
  second.data.isMatched = true;

  // Visual celebration
  first.el.classList.add('matched');
  second.el.classList.add('matched');

  // Update accessibility labels
  first.el.setAttribute('aria-label',  `Matched: ${first.data.emoji}`);
  second.el.setAttribute('aria-label', `Matched: ${second.data.emoji}`);

  // Remove tabindex — matched cards shouldn't be focused
  first.el.setAttribute('tabindex', '-1');
  second.el.setAttribute('tabindex', '-1');

  playSound('match');

  // Increment matched count and clear flipped buffer
  STATE.matchedPairs++;
  STATE.flippedCards = [];
  STATE.isLocked = false;

  // Did the player find all pairs?
  if (STATE.matchedPairs === STATE.totalPairs) {
    // Short delay before showing win modal (let the last animation finish)
    setTimeout(handleWin, 600);
  }
}

/**
 * handleMismatch()
 * Adds a shake animation, then flips both cards back face-down.
 *
 * @param {Object} first  - { el, data } for first card
 * @param {Object} second - { el, data } for second card
 */
function handleMismatch(first, second) {
  playSound('wrong');

  // Add shake + red-border animation class
  first.el.classList.add('wrong');
  second.el.classList.add('wrong');

  // After 1 second, flip both cards back
  setTimeout(() => {
    // Remove animation class
    first.el.classList.remove('wrong');
    second.el.classList.remove('wrong');

    // Unflip the cards
    unflipCard(first.el, first.data);
    unflipCard(second.el, second.data);

    // Clear the buffer and unlock the board
    STATE.flippedCards = [];
    STATE.isLocked = false;
  }, 1000);
}

/**
 * unflipCard()
 * Flips a card back face-down.
 *
 * @param {HTMLElement} cardEl   - The card DOM element
 * @param {Object}      cardData - The card's data
 */
function unflipCard(cardEl, cardData) {
  cardData.isFlipped = false;
  cardEl.classList.remove('flipped');
  cardEl.setAttribute('aria-label', 'Face-down card');
}

/* ============================================================
   SECTION D: MOVES & TIMER
   ============================================================ */

/**
 * updateMoves()
 * Increments the move counter and updates the DOM.
 */
function updateMoves() {
  //STATE.moves++;
  DOM.moves.textContent = STATE.moves;
}

/**
 * startTimer()
 * Starts the game timer — increments every second.
 */
function startTimer() {
  // Guard: don't stack intervals
  if (STATE.timerInterval) return;

  STATE.timerInterval = setInterval(() => {
    if (!STATE.isPaused) {
      STATE.timerSeconds++;
      updateTimerDisplay();
    }
  }, 1000);
}

/**
 * stopTimer()
 * Stops the running timer interval.
 */
function stopTimer() {
  clearInterval(STATE.timerInterval);
  STATE.timerInterval = null;
}

/**
 * updateTimerDisplay()
 * Formats STATE.timerSeconds as MM:SS and updates the DOM.
 */
function updateTimerDisplay() {
  const minutes = Math.floor(STATE.timerSeconds / 60);
  const seconds = STATE.timerSeconds % 60;

  // Pad with leading zeros: 3 → "03"
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  DOM.timer.textContent = formatted;
}

/**
 * formatTime()
 * Helper to format a number of seconds as a human-readable string.
 *
 * @param {number} totalSeconds
 * @returns {string} e.g. "01:23"
 */
function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ============================================================
   SECTION E: HIGH SCORE & STORAGE
   ============================================================ */

/**
 * saveHighScore()
 * Compares current game result against stored records.
 * Saves if this run beats previous bests.
 * Also computes a "score" (lower moves + shorter time = better).
 *
 * @returns {{ isNewBestScore: boolean, isNewBestTime: boolean }}
 */
function saveHighScore() {
  const key    = `memoryFlip_${STATE.difficulty}`;
  const stored = JSON.parse(localStorage.getItem(key) || '{}');

  let isNewBestScore = false;
  let isNewBestTime  = false;

  // Calculate score: fewer moves + less time = better (lower score wins)
  const currentScore = STATE.moves * 10 + STATE.timerSeconds;

  // Check best score (moves-weighted)
  if (!stored.bestScore || currentScore < stored.bestScore) {
    stored.bestScore = currentScore;
    stored.bestMoves = STATE.moves;
    isNewBestScore = true;
  }

  // Check best time independently
  if (!stored.bestTime || STATE.timerSeconds < stored.bestTime) {
    stored.bestTime = STATE.timerSeconds;
    isNewBestTime = true;
  }

  localStorage.setItem(key, JSON.stringify(stored));
  return { isNewBestScore, isNewBestTime };
}

/**
 * loadHighScore()
 * Reads stored records for the current difficulty and updates the DOM.
 */
function loadHighScore() {
  const key    = `memoryFlip_${STATE.difficulty}`;
  const stored = JSON.parse(localStorage.getItem(key) || '{}');

  DOM.bestScore.textContent = stored.bestMoves ? `${stored.bestMoves} moves` : '—';
  DOM.bestTime.textContent  = stored.bestTime  ? formatTime(stored.bestTime)  : '—';
}

/* ============================================================
   SECTION F: WIN CONDITION
   ============================================================ */

/**
 * handleWin()
 * Called when all pairs are matched.
 * Stops the timer, saves the score, shows the win modal.
 */
function handleWin() {
  stopTimer();
  playSound('win');

  // Save and find out if we broke any records
  const { isNewBestScore, isNewBestTime } = saveHighScore();

  // Reload best scores into the header stats
  loadHighScore();

  // Populate the win modal
  DOM.modalTime.textContent  = formatTime(STATE.timerSeconds);
  DOM.modalMoves.textContent = STATE.moves;
  DOM.modalBest.textContent  = DOM.bestScore.textContent;

  // Show a badge if the player set a new record
  if (isNewBestScore && isNewBestTime) {
    DOM.modalBadge.textContent = '🏆 New Record — Best Score & Time!';
  } else if (isNewBestScore) {
    DOM.modalBadge.textContent = '🏆 New Best Score!';
  } else if (isNewBestTime) {
    DOM.modalBadge.textContent = '⚡ New Best Time!';
  } else {
    DOM.modalBadge.textContent = '';
  }

  // Set up the "Next Level" button
  const nextLevel = getNextDifficulty();
  if (nextLevel) {
    DOM.btnHarder.textContent = `⬆ Try ${DIFFICULTY[nextLevel].label}`;
    DOM.btnHarder.dataset.targetDifficulty = nextLevel;
    DOM.btnHarder.style.display = '';
  } else {
    // Already on Hard — hide the button
    DOM.btnHarder.style.display = 'none';
  }

  // Show the modal
  showWinModal();
}

/**
 * showWinModal()
 * Removes the 'hidden' class to display the win modal.
 */
function showWinModal() {
  DOM.winModal.classList.remove('hidden');
  // Focus the "Play Again" button for accessibility
  setTimeout(() => DOM.btnPlayAgain.focus(), 100);
}

/**
 * getNextDifficulty()
 * Returns the next difficulty level string, or null if already on Hard.
 *
 * @returns {string|null}
 */
function getNextDifficulty() {
  const order = ['easy', 'medium', 'hard'];
  const current = order.indexOf(STATE.difficulty);
  return current < order.length - 1 ? order[current + 1] : null;
}

/* ============================================================
   SECTION G: PAUSE / RESUME
   ============================================================ */

/**
 * togglePause()
 * Pauses or resumes the game.
 * While paused: timer stops, board is covered, clicks are ignored.
 */
function togglePause() {
  // Can only pause if the game has started
  if (!STATE.gameStarted) return;

  STATE.isPaused = !STATE.isPaused;

  if (STATE.isPaused) {
    DOM.pauseOverlay.classList.remove('hidden');
    DOM.btnPause.textContent = '▶ Resume';
    playSound('click');
  } else {
    DOM.pauseOverlay.classList.add('hidden');
    DOM.btnPause.textContent = '⏸ Pause';
    playSound('click');
  }
}

/* ============================================================
   SECTION H: DARK MODE
   ============================================================ */

/**
 * toggleDarkMode()
 * Switches between dark and light theme by toggling data-theme on <html>.
 * Saves preference to localStorage.
 */
function toggleDarkMode() {
  const html    = document.documentElement;
  const isDark  = html.dataset.theme === 'dark';
  const newTheme = isDark ? 'light' : 'dark';

  html.dataset.theme = newTheme;
  DOM.btnDarkMode.querySelector('.icon').textContent = isDark ? '☀️' : '🌙';

  // Persist preference
  localStorage.setItem('memoryFlip_theme', newTheme);
}

/**
 * loadThemePreference()
 * Applies saved theme on page load.
 */
function loadThemePreference() {
  const saved = localStorage.getItem('memoryFlip_theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  DOM.btnDarkMode.querySelector('.icon').textContent = saved === 'dark' ? '🌙' : '☀️';
}

/* ============================================================
   SECTION I: SOUND (Web Audio API — no files needed)
   ============================================================ */

// Create an AudioContext lazily (browsers require user gesture first)
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

/**
 * playSound()
 * Generates a simple synthetic tone using the Web Audio API.
 * No audio files are needed — pure math!
 *
 * @param {'flip'|'match'|'wrong'|'win'|'click'} type
 */
function playSound(type) {
  if (!STATE.soundEnabled) return;

  try {
    const ctx = getAudioContext();

    // Define pitch + duration + wave shape per sound type
    const sounds = {
      flip:  { freq: 440,  duration: 0.08, type: 'sine',     vol: 0.15 },
      match: { freq: 660,  duration: 0.25, type: 'triangle', vol: 0.2  },
      wrong: { freq: 180,  duration: 0.3,  type: 'sawtooth', vol: 0.12 },
      win:   { freq: 880,  duration: 0.6,  type: 'sine',     vol: 0.2  },
      click: { freq: 300,  duration: 0.05, type: 'sine',     vol: 0.1  },
    };

    const { freq, duration, type: waveType, vol } = sounds[type] || sounds.click;

    // Create oscillator (tone generator)
    const oscillator = ctx.createOscillator();
    // Create gain node (volume control)
    const gainNode   = ctx.createGain();

    oscillator.type            = waveType;
    oscillator.frequency.value = freq;

    // Fade out at the end (avoids clipping / harsh cutoff)
    gainNode.gain.setValueAtTime(vol, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    // Connect: oscillator → gain → speakers
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);

    // For 'win', add a celebratory ascending chord
    if (type === 'win') {
      [1.25, 1.5, 2.0].forEach((multiplier, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type            = 'sine';
        osc.frequency.value = freq * multiplier;
        gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration + i * 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.15);
        osc.stop(ctx.currentTime + duration + i * 0.2);
      });
    }

  } catch (err) {
    // Silently fail if audio isn't supported
    console.warn('Audio playback failed:', err);
  }
}

/**
 * toggleSound()
 * Enables or disables sound effects.
 */
function toggleSound() {
  STATE.soundEnabled = !STATE.soundEnabled;
  DOM.btnSound.querySelector('.icon').textContent = STATE.soundEnabled ? '🔊' : '🔇';
  localStorage.setItem('memoryFlip_sound', STATE.soundEnabled ? '1' : '0');
}

/**
 * loadSoundPreference()
 */
function loadSoundPreference() {
  const saved = localStorage.getItem('memoryFlip_sound');
  // Default to enabled
  STATE.soundEnabled = saved !== '0';
  DOM.btnSound.querySelector('.icon').textContent = STATE.soundEnabled ? '🔊' : '🔇';
}

/* ============================================================
   SECTION J: DIFFICULTY CONTROL
   ============================================================ */

/**
 * setDifficulty()
 * Switches the difficulty and starts a new game.
 *
 * @param {string} level - 'easy' | 'medium' | 'hard'
 */
function setDifficulty(level) {
  if (!DIFFICULTY[level]) return;
  STATE.difficulty = level;

  // Update segmented control buttons
  DOM.segBtns.forEach(btn => {
    const isActive = btn.dataset.difficulty === level;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive);
  });

  // Start a new game with the new difficulty
  initializeGame(true);
}

/* ============================================================
   SECTION K: RESTART HELPERS
   ============================================================ */

/**
 * restartGame()
 * Restarts with the same difficulty but a new shuffle.
 */
function restartGame() {
  playSound('click');
  initializeGame(true);
}

/* ============================================================
   SECTION L: EVENT LISTENERS
   All event binding happens here, keeping them separate
   from the logic functions above.
   ============================================================ */

// Restart button
DOM.btnRestart.addEventListener('click', restartGame);

// Pause / Resume buttons
DOM.btnPause.addEventListener('click', () => {
  togglePause();
});
DOM.btnResume.addEventListener('click', () => {
  togglePause();
});

// New Game button (same as restart but semantically "fresh start")
DOM.btnNewGame.addEventListener('click', () => {
  playSound('click');
  initializeGame(true);
});

// Win modal: Play Again
DOM.btnPlayAgain.addEventListener('click', () => {
  playSound('click');
  DOM.winModal.classList.add('hidden');
  initializeGame(true);
});

// Win modal: Next Level
DOM.btnHarder.addEventListener('click', () => {
  const nextLevel = DOM.btnHarder.dataset.targetDifficulty;
  if (nextLevel) {
    DOM.winModal.classList.add('hidden');
    setDifficulty(nextLevel);
  }
});

// Difficulty segmented buttons
DOM.segBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    setDifficulty(btn.dataset.difficulty);
  });
});

// Dark mode toggle
DOM.btnDarkMode.addEventListener('click', toggleDarkMode);

// Sound toggle
DOM.btnSound.addEventListener('click', toggleSound);

// Close win modal on backdrop click (but not card clicks)
DOM.winModal.addEventListener('click', (e) => {
  if (e.target === DOM.winModal) {
    // Clicking the dark backdrop closes the modal
    DOM.winModal.classList.add('hidden');
  }
});

// Keyboard shortcut: 'P' to pause, 'R' to restart, 'N' for new game
document.addEventListener('keydown', (e) => {
  // Ignore when user is interacting with a form element
  if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;

  switch(e.key.toLowerCase()) {
    case 'p': togglePause();   break;
    case 'r': restartGame();   break;
    case 'n': initializeGame(true); break;
  }
});

/* ============================================================
   SECTION M: BOOT
   Run on page load.
   ============================================================ */

/**
 * boot()
 * Called once when the page loads.
 * Loads preferences and starts the first game.
 */
function boot() {
  loadThemePreference();
  loadSoundPreference();
  initializeGame(true);
}

// Go!
boot();
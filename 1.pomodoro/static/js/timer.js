import {
  computeNextSession,
  parsePersistedTimerState,
  computeProgressPercent,
  computeRemainingSeconds,
  formatTime,
  getModeDurationSeconds,
  resolveRestoredTimerState,
} from "./timer_core.mjs";

const DURATIONS = {
  work: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};
const LONG_BREAK_INTERVAL = 4;
const STORAGE_KEY = "pomodoro.timerState.v1";
const MODE_LABELS = {
  work: "作業中",
  short_break: "短い休憩",
  long_break: "長い休憩",
};

const modeLabel = document.getElementById("mode-label");
const setCountText = document.getElementById("set-count-text");
const progressRing = document.getElementById("progress-ring");
const timeText = document.getElementById("time-text");
const startPauseButton = document.getElementById("start-pause-btn");
const resetButton = document.getElementById("reset-btn");

let currentMode = "work";
let completedWorkSessions = 0;
let totalDurationSeconds = getModeDurationSeconds(currentMode, DURATIONS);
let remainingSeconds = totalDurationSeconds;
let deadlineMs = null;
let isRunning = false;
let tickIntervalId = null;

function persistState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currentMode,
        completedWorkSessions,
        remainingSeconds,
        deadlineMs,
        isRunning,
      }),
    );
  } catch {
    // localStorage is best effort; app should keep running even if unavailable.
  }
}

function restoreStateFromStorage() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }

  const parsedState = parsePersistedTimerState(raw);
  if (parsedState === null) {
    return;
  }

  const restored = resolveRestoredTimerState({
    persistedState: parsedState,
    currentMs: Date.now(),
    durations: DURATIONS,
    longBreakInterval: LONG_BREAK_INTERVAL,
  });

  currentMode = restored.currentMode;
  completedWorkSessions = restored.completedWorkSessions;
  totalDurationSeconds = restored.totalDurationSeconds;
  remainingSeconds = restored.remainingSeconds;
  isRunning = restored.isRunning;
  deadlineMs = restored.deadlineMs;

  if (isRunning) {
    startTicking();
  }
}

function stopTicking() {
  if (tickIntervalId !== null) {
    clearInterval(tickIntervalId);
    tickIntervalId = null;
  }
}

function setStartPauseLabel() {
  if (isRunning) {
    startPauseButton.textContent = "一時停止";
    return;
  }

  if (remainingSeconds === totalDurationSeconds) {
    startPauseButton.textContent = "開始";
    return;
  }

  startPauseButton.textContent = "再開";
}

function renderProgressRing() {
  const percent = computeProgressPercent(remainingSeconds, totalDurationSeconds);
  progressRing.style.background = `conic-gradient(var(--accent) 0 ${percent}%, var(--track) ${percent}% 100%)`;
}

function renderSetCount() {
  setCountText.textContent = `${completedWorkSessions} セット完了`;
}

function render() {
  modeLabel.textContent = MODE_LABELS[currentMode];
  renderSetCount();
  timeText.textContent = formatTime(remainingSeconds);
  renderProgressRing();
  setStartPauseLabel();
}

function startTicking() {
  stopTicking();
  tickIntervalId = setInterval(tick, 250);
}

function moveToMode(mode) {
  currentMode = mode;
  totalDurationSeconds = getModeDurationSeconds(currentMode, DURATIONS);
  remainingSeconds = totalDurationSeconds;
  deadlineMs = null;
}

function transitionToNextMode() {
  const nextSession = computeNextSession({
    currentMode,
    completedWorkSessions,
    longBreakInterval: LONG_BREAK_INTERVAL,
  });

  completedWorkSessions = nextSession.completedWorkSessions;
  moveToMode(nextSession.nextMode);
  persistState();
}

function handleCompleted() {
  transitionToNextMode();
  deadlineMs = Date.now() + remainingSeconds * 1000;
  isRunning = true;
  startTicking();
  persistState();
  render();
}

function tick() {
  remainingSeconds = computeRemainingSeconds({
    targetDeadlineMs: deadlineMs,
    currentMs: Date.now(),
    totalDurationSeconds,
    fallbackSeconds: remainingSeconds,
  });

  if (remainingSeconds === 0) {
    handleCompleted();
    return;
  }

  render();
}

function startOrResume() {
  if (isRunning) {
    return;
  }

  isRunning = true;
  deadlineMs = Date.now() + remainingSeconds * 1000;
  startTicking();
  persistState();
  render();
}

function pause() {
  if (!isRunning) {
    return;
  }

  remainingSeconds = computeRemainingSeconds({
    targetDeadlineMs: deadlineMs,
    currentMs: Date.now(),
    totalDurationSeconds,
    fallbackSeconds: remainingSeconds,
  });
  isRunning = false;
  deadlineMs = null;
  stopTicking();
  persistState();
  render();
}

function reset() {
  isRunning = false;
  stopTicking();
  completedWorkSessions = 0;
  moveToMode("work");
  persistState();
  render();
}

startPauseButton.addEventListener("click", () => {
  if (isRunning) {
    pause();
    return;
  }

  startOrResume();
});

resetButton.addEventListener("click", reset);

restoreStateFromStorage();
render();

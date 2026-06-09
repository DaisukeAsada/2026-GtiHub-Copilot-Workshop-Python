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
let longBreakInterval = 4;
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
const statsCompletedCount = document.getElementById("stats-completed-count");
const statsFocusDuration = document.getElementById("stats-focus-duration");
const startPauseButton = document.getElementById("start-pause-btn");
const resetButton = document.getElementById("reset-btn");
const statusMessage = document.getElementById("status-message");
const workMinutesInput = document.getElementById("work-minutes-input");
const shortBreakMinutesInput = document.getElementById("short-break-minutes-input");
const longBreakMinutesInput = document.getElementById("long-break-minutes-input");
const longBreakIntervalInput = document.getElementById("long-break-interval-input");
const saveSettingsButton = document.getElementById("save-settings-btn");
const enableNotificationButton = document.getElementById("enable-notification-btn");

let currentMode = "work";
let completedWorkSessions = 0;
let totalDurationSeconds = getModeDurationSeconds(currentMode, DURATIONS);
let remainingSeconds = totalDurationSeconds;
let deadlineMs = null;
let isRunning = false;
let tickIntervalId = null;
let isTransitioning = false;
let statusTimerId = null;

function setBusyState(isBusy) {
  isTransitioning = isBusy;
  startPauseButton.disabled = isBusy;
  resetButton.disabled = isBusy;
}

function showStatus(message, type = "error", timeoutMs = 3500) {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent = message;
  statusMessage.classList.remove("error", "success");
  statusMessage.classList.add(type);

  if (statusTimerId !== null) {
    clearTimeout(statusTimerId);
    statusTimerId = null;
  }

  if (timeoutMs > 0) {
    statusTimerId = setTimeout(() => {
      statusMessage.textContent = "";
      statusMessage.classList.remove("error", "success");
      statusTimerId = null;
    }, timeoutMs);
  }
}

async function parseApiError(response, fallbackMessage) {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string" && body.error.length > 0) {
      return body.error;
    }
  } catch {
    // Use fallback when body is not JSON.
  }

  return fallbackMessage;
}

function setSettingsInputs(settings) {
  workMinutesInput.value = String(settings.work_minutes);
  shortBreakMinutesInput.value = String(settings.short_break_minutes);
  longBreakMinutesInput.value = String(settings.long_break_minutes);
  longBreakIntervalInput.value = String(settings.long_break_interval);
}

function getSettingsPayloadFromInputs() {
  const payload = {
    work_minutes: Number.parseInt(workMinutesInput.value, 10),
    short_break_minutes: Number.parseInt(shortBreakMinutesInput.value, 10),
    long_break_minutes: Number.parseInt(longBreakMinutesInput.value, 10),
    long_break_interval: Number.parseInt(longBreakIntervalInput.value, 10),
  };

  const allPositive =
    Number.isInteger(payload.work_minutes) && payload.work_minutes > 0
    && Number.isInteger(payload.short_break_minutes) && payload.short_break_minutes > 0
    && Number.isInteger(payload.long_break_minutes) && payload.long_break_minutes > 0
    && Number.isInteger(payload.long_break_interval) && payload.long_break_interval >= 2;

  if (!allPositive) {
    throw new Error("設定値は正の整数で入力し、長休憩間隔は2以上にしてください。");
  }

  return payload;
}

function playNotificationSound() {
  try {
    const audioContext = new window.AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.1;

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch {
    // Ignore if Web Audio API is unavailable.
  }
}

function updateNotificationButtonState() {
  if (!("Notification" in window)) {
    enableNotificationButton.disabled = true;
    enableNotificationButton.textContent = "通知未対応";
    return;
  }

  if (Notification.permission === "granted") {
    enableNotificationButton.disabled = true;
    enableNotificationButton.textContent = "通知許可済み";
    return;
  }

  if (Notification.permission === "denied") {
    enableNotificationButton.disabled = true;
    enableNotificationButton.textContent = "通知拒否中";
    return;
  }

  enableNotificationButton.disabled = false;
  enableNotificationButton.textContent = "通知を有効化";
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    showStatus("このブラウザは通知に対応していません。", "error");
    return;
  }

  const permission = await Notification.requestPermission();
  updateNotificationButtonState();

  if (permission === "granted") {
    showStatus("ブラウザ通知を有効化しました。", "success");
    return;
  }

  showStatus("通知は許可されませんでした。", "error");
}

function notifySessionCompleted(mode) {
  playNotificationSound();

  if (!("Notification" in window)) {
    return;
  }

  if (Notification.permission !== "granted") {
    return;
  }

  const title = mode === "work" ? "作業セッション完了" : "休憩セッション完了";
  const body = mode === "work" ? "休憩に切り替わります。" : "次の作業を開始します。";
  new Notification(title, { body });
}

function formatFocusDuration(totalSeconds) {
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}分`;
  }

  return `${hours}時間${minutes}分`;
}

async function fetchSettings() {
  const response = await fetch("/api/settings");
  if (!response.ok) {
    const errorMessage = await parseApiError(response, "設定の取得に失敗しました。");
    throw new Error(errorMessage);
  }

  return response.json();
}

async function updateSettings(payload) {
  const response = await fetch("/api/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorMessage = await parseApiError(response, "設定の更新に失敗しました。");
    throw new Error(errorMessage);
  }

  return response.json();
}

async function postSessionComplete(sessionType, durationSec) {
  const response = await fetch("/api/sessions/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_type: sessionType,
      duration_sec: durationSec,
    }),
  });

  if (!response.ok) {
    const errorMessage = await parseApiError(response, "完了セッションの送信に失敗しました。");
    throw new Error(errorMessage);
  }

  return response.json();
}

async function fetchTodayStats() {
  const response = await fetch("/api/stats/today");
  if (!response.ok) {
    const errorMessage = await parseApiError(response, "統計の取得に失敗しました。");
    throw new Error(errorMessage);
  }

  return response.json();
}

function renderStats(stats) {
  statsCompletedCount.textContent = String(stats.completed_work_count);
  statsFocusDuration.textContent = formatFocusDuration(stats.focus_seconds);
}

async function refreshStatsFromApi() {
  try {
    const stats = await fetchTodayStats();
    renderStats(stats);
  } catch {
    showStatus("統計の取得に失敗しました。しばらくして再試行してください。", "error");
  }
}

function applySettings(settings) {
  DURATIONS.work = settings.work_minutes * 60;
  DURATIONS.shortBreak = settings.short_break_minutes * 60;
  DURATIONS.longBreak = settings.long_break_minutes * 60;
  longBreakInterval = settings.long_break_interval;
}

async function initializeSettingsFromApi() {
  try {
    const settings = await fetchSettings();
    applySettings(settings);
    setSettingsInputs(settings);

    const expectedCurrentModeDuration = getModeDurationSeconds(currentMode, DURATIONS);
    if (!isRunning && remainingSeconds === totalDurationSeconds) {
      totalDurationSeconds = expectedCurrentModeDuration;
      remainingSeconds = expectedCurrentModeDuration;
      persistState();
      render();
    }
  } catch {
    showStatus("設定の取得に失敗しました。既定値で動作します。", "error");
  }
}

async function saveSettingsFromUi() {
  try {
    const payload = getSettingsPayloadFromInputs();
    const updated = await updateSettings(payload);
    applySettings(updated);
    setSettingsInputs(updated);

    const expectedCurrentModeDuration = getModeDurationSeconds(currentMode, DURATIONS);
    if (!isRunning && remainingSeconds === totalDurationSeconds) {
      totalDurationSeconds = expectedCurrentModeDuration;
      remainingSeconds = expectedCurrentModeDuration;
      persistState();
      render();
    }

    showStatus("設定を保存しました。", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "設定の更新に失敗しました。";
    showStatus(message, "error");
  }
}

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
    longBreakInterval,
  });

  completedWorkSessions = nextSession.completedWorkSessions;
  moveToMode(nextSession.nextMode);
  persistState();
}

async function handleCompleted() {
  if (isTransitioning) {
    return;
  }

  const finishedMode = currentMode;
  const finishedDuration = totalDurationSeconds;
  setBusyState(true);
  stopTicking();

  if (finishedMode === "work") {
    try {
      await postSessionComplete("work", finishedDuration);
      await refreshStatsFromApi();
    } catch (error) {
      const message = error instanceof Error ? error.message : "セッション記録に失敗しました。";
      showStatus(message, "error");
    }
  }

  notifySessionCompleted(finishedMode);

  transitionToNextMode();
  deadlineMs = Date.now() + remainingSeconds * 1000;
  isRunning = true;
  startTicking();
  setBusyState(false);
  persistState();
  render();
}

function tick() {
  if (isTransitioning) {
    return;
  }

  remainingSeconds = computeRemainingSeconds({
    targetDeadlineMs: deadlineMs,
    currentMs: Date.now(),
    totalDurationSeconds,
    fallbackSeconds: remainingSeconds,
  });

  if (remainingSeconds === 0) {
    void handleCompleted();
    return;
  }

  render();
}

function startOrResume() {
  if (isRunning || isTransitioning) {
    return;
  }

  isRunning = true;
  deadlineMs = Date.now() + remainingSeconds * 1000;
  startTicking();
  persistState();
  render();
}

function pause() {
  if (!isRunning || isTransitioning) {
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
  if (isTransitioning) {
    return;
  }

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
saveSettingsButton.addEventListener("click", () => {
  void saveSettingsFromUi();
});
enableNotificationButton.addEventListener("click", () => {
  void requestNotificationPermission();
});

restoreStateFromStorage();
render();
updateNotificationButtonState();
void refreshStatsFromApi();
void initializeSettingsFromApi();

window.pomodoroApi = {
  getSettings: fetchSettings,
  updateSettings,
};

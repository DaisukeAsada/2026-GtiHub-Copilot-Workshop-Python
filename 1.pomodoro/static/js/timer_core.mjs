export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function formatTime(seconds) {
  const safeSeconds = clamp(Math.floor(seconds), 0, Number.MAX_SAFE_INTEGER);
  const minutes = Math.floor(safeSeconds / 60);
  const remain = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

export function computeRemainingSeconds({
  targetDeadlineMs,
  currentMs,
  totalDurationSeconds,
  fallbackSeconds,
}) {
  if (targetDeadlineMs === null) {
    return clamp(Math.floor(fallbackSeconds), 0, totalDurationSeconds);
  }

  const diffMs = targetDeadlineMs - currentMs;
  return clamp(Math.ceil(diffMs / 1000), 0, totalDurationSeconds);
}

export function computeProgressPercent(remainingSeconds, totalDurationSeconds) {
  if (totalDurationSeconds === 0) {
    return 0;
  }

  const remainRatio = remainingSeconds / totalDurationSeconds;
  return clamp(remainRatio * 100, 0, 100);
}

export function getModeDurationSeconds(mode, durations) {
  if (mode === "work") {
    return durations.work;
  }

  if (mode === "short_break") {
    return durations.shortBreak;
  }

  if (mode === "long_break") {
    return durations.longBreak;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

export function computeNextSession({
  currentMode,
  completedWorkSessions,
  longBreakInterval,
}) {
  if (currentMode === "work") {
    const nextCompletedWorkSessions = completedWorkSessions + 1;
    const isLongBreak = nextCompletedWorkSessions % longBreakInterval === 0;

    return {
      nextMode: isLongBreak ? "long_break" : "short_break",
      completedWorkSessions: nextCompletedWorkSessions,
    };
  }

  if (currentMode === "short_break" || currentMode === "long_break") {
    return {
      nextMode: "work",
      completedWorkSessions,
    };
  }

  throw new Error(`Unknown mode: ${currentMode}`);
}

export function parsePersistedTimerState(raw) {
  if (raw === null || raw === "") {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const modes = new Set(["work", "short_break", "long_break"]);
  if (!modes.has(parsed.currentMode)) {
    return null;
  }

  if (!Number.isInteger(parsed.completedWorkSessions) || parsed.completedWorkSessions < 0) {
    return null;
  }

  if (!Number.isFinite(parsed.remainingSeconds) || parsed.remainingSeconds < 0) {
    return null;
  }

  if (typeof parsed.isRunning !== "boolean") {
    return null;
  }

  const normalizedDeadline = Number.isFinite(parsed.deadlineMs) ? parsed.deadlineMs : null;

  return {
    currentMode: parsed.currentMode,
    completedWorkSessions: parsed.completedWorkSessions,
    remainingSeconds: parsed.remainingSeconds,
    deadlineMs: normalizedDeadline,
    isRunning: parsed.isRunning,
  };
}

export function computeProgressColor(remainingSeconds, totalDurationSeconds) {
  if (totalDurationSeconds === 0) {
    return "rgb(220, 50, 50)";
  }

  const ratio = clamp(remainingSeconds / totalDurationSeconds, 0, 1);

  // Blue (start) -> Yellow (mid) -> Red (end)
  // ratio 1.0 = full time remaining = blue (#4A90D9)
  // ratio 0.5 = half time = yellow (#E8B84A)
  // ratio 0.0 = no time = red (#DC3232)
  let r, g, b;
  if (ratio > 0.5) {
    const t = (ratio - 0.5) * 2; // 0..1 mapping yellow->blue
    r = Math.round(232 + (74 - 232) * t);
    g = Math.round(184 + (144 - 184) * t);
    b = Math.round(74 + (217 - 74) * t);
  } else {
    const t = ratio * 2; // 0..1 mapping red->yellow
    r = Math.round(220 + (232 - 220) * t);
    g = Math.round(50 + (184 - 50) * t);
    b = Math.round(50 + (74 - 50) * t);
  }

  return `rgb(${r}, ${g}, ${b})`;
}

export function resolveRestoredTimerState({
  persistedState,
  currentMs,
  durations,
  longBreakInterval,
}) {
  const totalDurationSeconds = getModeDurationSeconds(persistedState.currentMode, durations);
  const safeRemainingSeconds = clamp(
    Math.floor(persistedState.remainingSeconds),
    0,
    totalDurationSeconds,
  );

  if (!persistedState.isRunning || persistedState.deadlineMs === null) {
    return {
      currentMode: persistedState.currentMode,
      completedWorkSessions: persistedState.completedWorkSessions,
      totalDurationSeconds,
      remainingSeconds: safeRemainingSeconds,
      isRunning: false,
      deadlineMs: null,
    };
  }

  const recomputedRemainingSeconds = computeRemainingSeconds({
    targetDeadlineMs: persistedState.deadlineMs,
    currentMs,
    totalDurationSeconds,
    fallbackSeconds: safeRemainingSeconds,
  });

  if (recomputedRemainingSeconds > 0) {
    return {
      currentMode: persistedState.currentMode,
      completedWorkSessions: persistedState.completedWorkSessions,
      totalDurationSeconds,
      remainingSeconds: recomputedRemainingSeconds,
      isRunning: true,
      deadlineMs: persistedState.deadlineMs,
    };
  }

  const nextSession = computeNextSession({
    currentMode: persistedState.currentMode,
    completedWorkSessions: persistedState.completedWorkSessions,
    longBreakInterval,
  });
  const nextTotalDurationSeconds = getModeDurationSeconds(nextSession.nextMode, durations);

  return {
    currentMode: nextSession.nextMode,
    completedWorkSessions: nextSession.completedWorkSessions,
    totalDurationSeconds: nextTotalDurationSeconds,
    remainingSeconds: nextTotalDurationSeconds,
    isRunning: false,
    deadlineMs: null,
  };
}

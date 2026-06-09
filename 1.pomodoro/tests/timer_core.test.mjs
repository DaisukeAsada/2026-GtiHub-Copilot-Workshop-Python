import test from "node:test";
import assert from "node:assert/strict";

import {
  clamp,
  computeNextSession,
  computeProgressPercent,
  computeRemainingSeconds,
  formatTime,
  getModeDurationSeconds,
  parsePersistedTimerState,
  resolveRestoredTimerState,
} from "../static/js/timer_core.mjs";

test("clamp clamps lower and upper bounds", () => {
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
  assert.equal(clamp(3, 0, 10), 3);
});

test("formatTime formats mm:ss and floors fractional seconds", () => {
  assert.equal(formatTime(1500), "25:00");
  assert.equal(formatTime(61.9), "01:01");
  assert.equal(formatTime(0), "00:00");
});

test("computeRemainingSeconds returns fallback when deadline is null", () => {
  const result = computeRemainingSeconds({
    targetDeadlineMs: null,
    currentMs: 1000,
    totalDurationSeconds: 1500,
    fallbackSeconds: 77,
  });

  assert.equal(result, 77);
});

test("computeRemainingSeconds uses ceil and clamps to zero", () => {
  const beforeDeadline = computeRemainingSeconds({
    targetDeadlineMs: 10_000,
    currentMs: 8_050,
    totalDurationSeconds: 1500,
    fallbackSeconds: 0,
  });
  const afterDeadline = computeRemainingSeconds({
    targetDeadlineMs: 10_000,
    currentMs: 11_100,
    totalDurationSeconds: 1500,
    fallbackSeconds: 0,
  });

  assert.equal(beforeDeadline, 2);
  assert.equal(afterDeadline, 0);
});

test("computeProgressPercent calculates ratio and clamps", () => {
  assert.equal(computeProgressPercent(1500, 1500), 100);
  assert.equal(computeProgressPercent(750, 1500), 50);
  assert.equal(computeProgressPercent(-10, 1500), 0);
  assert.equal(computeProgressPercent(2000, 1500), 100);
});

test("getModeDurationSeconds returns duration by mode", () => {
  const durations = { work: 1500, shortBreak: 300, longBreak: 900 };

  assert.equal(getModeDurationSeconds("work", durations), 1500);
  assert.equal(getModeDurationSeconds("short_break", durations), 300);
  assert.equal(getModeDurationSeconds("long_break", durations), 900);
});

test("computeNextSession switches work to short break and increments set", () => {
  const next = computeNextSession({
    currentMode: "work",
    completedWorkSessions: 1,
    longBreakInterval: 4,
  });

  assert.deepEqual(next, {
    nextMode: "short_break",
    completedWorkSessions: 2,
  });
});

test("computeNextSession switches to long break on interval", () => {
  const next = computeNextSession({
    currentMode: "work",
    completedWorkSessions: 3,
    longBreakInterval: 4,
  });

  assert.deepEqual(next, {
    nextMode: "long_break",
    completedWorkSessions: 4,
  });
});

test("computeNextSession returns to work from any break", () => {
  const fromShort = computeNextSession({
    currentMode: "short_break",
    completedWorkSessions: 2,
    longBreakInterval: 4,
  });
  const fromLong = computeNextSession({
    currentMode: "long_break",
    completedWorkSessions: 4,
    longBreakInterval: 4,
  });

  assert.deepEqual(fromShort, {
    nextMode: "work",
    completedWorkSessions: 2,
  });
  assert.deepEqual(fromLong, {
    nextMode: "work",
    completedWorkSessions: 4,
  });
});

test("parsePersistedTimerState returns null for invalid payload", () => {
  assert.equal(parsePersistedTimerState("{invalid-json}"), null);
  assert.equal(parsePersistedTimerState(JSON.stringify({ currentMode: "invalid" })), null);
});

test("resolveRestoredTimerState restores paused session", () => {
  const restored = resolveRestoredTimerState({
    persistedState: {
      currentMode: "short_break",
      completedWorkSessions: 2,
      remainingSeconds: 123,
      deadlineMs: null,
      isRunning: false,
    },
    currentMs: 1_000,
    durations: { work: 1500, shortBreak: 300, longBreak: 900 },
    longBreakInterval: 4,
  });

  assert.deepEqual(restored, {
    currentMode: "short_break",
    completedWorkSessions: 2,
    totalDurationSeconds: 300,
    remainingSeconds: 123,
    isRunning: false,
    deadlineMs: null,
  });
});

test("resolveRestoredTimerState restores running session with recalculated remaining", () => {
  const restored = resolveRestoredTimerState({
    persistedState: {
      currentMode: "work",
      completedWorkSessions: 1,
      remainingSeconds: 999,
      deadlineMs: 10_000,
      isRunning: true,
    },
    currentMs: 8_200,
    durations: { work: 1500, shortBreak: 300, longBreak: 900 },
    longBreakInterval: 4,
  });

  assert.equal(restored.currentMode, "work");
  assert.equal(restored.completedWorkSessions, 1);
  assert.equal(restored.totalDurationSeconds, 1500);
  assert.equal(restored.remainingSeconds, 2);
  assert.equal(restored.isRunning, true);
  assert.equal(restored.deadlineMs, 10_000);
});

test("resolveRestoredTimerState treats expired running session as completed", () => {
  const restored = resolveRestoredTimerState({
    persistedState: {
      currentMode: "work",
      completedWorkSessions: 3,
      remainingSeconds: 10,
      deadlineMs: 10_000,
      isRunning: true,
    },
    currentMs: 12_000,
    durations: { work: 1500, shortBreak: 300, longBreak: 900 },
    longBreakInterval: 4,
  });

  assert.deepEqual(restored, {
    currentMode: "long_break",
    completedWorkSessions: 4,
    totalDurationSeconds: 900,
    remainingSeconds: 900,
    isRunning: false,
    deadlineMs: null,
  });
});

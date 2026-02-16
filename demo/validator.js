"use strict";

function validatePattern(pattern, rules) {
  if (!Array.isArray(pattern) || pattern.length === 0) {
    return { isValid: false, reason: "Pattern is empty or not an array" };
  }
  for (const tap of pattern) {
    if (typeof tap.t !== "number" || typeof tap.force !== "number") {
      return { isValid: false, reason: "Pattern has invalid tap data" };
    }
  }

  const { minTaps, minForce, maxWindowMs, minIntervalMs, maxIntervalMs } = rules;

  if (pattern.length < minTaps) {
    return { isValid: false, reason: "Not enough taps" };
  }

  const sorted = [...pattern].sort((a, b) => a.t - b.t);
  const windowMs = sorted[sorted.length - 1].t - sorted[0].t;
  if (windowMs > maxWindowMs) {
    return { isValid: false, reason: "Pattern exceeds activation window" };
  }

  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i].force < minForce) {
      return { isValid: false, reason: "Tap force below minimum threshold" };
    }
    if (i > 0) {
      const interval = sorted[i].t - sorted[i - 1].t;
      if (interval < minIntervalMs || interval > maxIntervalMs) {
        return { isValid: false, reason: "Tap timing out of bounds" };
      }
    }
  }

  return { isValid: true };
}

module.exports = { validatePattern };

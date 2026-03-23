"use strict";

const { validatePattern } = require("./validator");
const { buildAlertPackage } = require("./alertBuilder");
const { mockSendSms } = require("./mockSender");

console.log("SoleSignal Demo Starting");

const rules = {
  minTaps: 3,
  minForce: 0.6,
  maxWindowMs: 1200,
  minIntervalMs: 150,
  maxIntervalMs: 600,
};

const start = Date.now();

const failedTapPattern = [
  { t: start, force: 0.4 },
  { t: start + 200, force: 0.5 },
  { t: start + 450, force: 0.55 },
];

const failedValidation = validatePattern(failedTapPattern, rules);
console.log("Validation result (failed case):", failedValidation);

const successTapPattern = [
  { t: start + 1000, force: 0.7 },
  { t: start + 1300, force: 0.8 },
  { t: start + 1700, force: 0.75 },
];

const successValidation = validatePattern(successTapPattern, rules);
console.log("Validation result (success case):", successValidation);

if (successValidation.isValid) {
  const alert = buildAlertPackage({
    user: {
      id: "user-001",
      name: "Demo User",
      phone: "+15551234567",
    },
    contact: {
      name: "Emergency Contact",
      phone: "+15557654321",
    },
    sensorId: "sensor-abc-123",
    location: {
      lat: 40.741895,
      lon: -73.989308,
    },
    triggeredAt: new Date(start + 1000).toISOString(),
  });

  console.log("Alert package:", alert);

  const smsResult = mockSendSms(alert);
  console.log("SMS result:", smsResult);
}

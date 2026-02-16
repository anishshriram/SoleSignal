"use strict";

function buildAlertPackage({ user, contact, sensorId, location, triggeredAt }) {
  return {
    user,
    contact,
    sensorId,
    location,
    triggeredAt,
    message: "SoleSignal alert: Emergency tap pattern detected",
  };
}

module.exports = { buildAlertPackage };

"use strict";

function mockSendSms(alert) {
  console.log("Mock SMS send payload:", alert);
  return {
    success: true,
    messageId: "mock-sms-0001",
  };
}

module.exports = { mockSendSms };

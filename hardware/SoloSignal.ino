#include <ArduTFLite.h>
#include "solesignal_model.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// -- Pin config --
#define ANALOG_PIN0  2
#define ANALOG_PIN2  4
#define MOTOR_PIN    D5

#define SERVICE_UUID        "12345678-1234-1234-1234-1234567890ab"
#define STATUS_CHAR_UUID    "99999999-8888-7777-6666-555555555555"

BLECharacteristic *statusChar;

// -- BLE reconnect --
class MyServerCallbacks : public BLEServerCallbacks {
  void onDisconnect(BLEServer* server) {
    BLEDevice::getAdvertising()->start();
    Serial.println("Disconnected, reconnecting");
  }
};

// -- BLE heartbeat --
unsigned long lastNotify = 0;
const unsigned long notifyIntervalMs = 500;
bool sendSOSPulse   = false;
bool sendSlidePulse = false;

// -- Tensor Arena --
constexpr int tensorArenaSize = 16 * 1024;
alignas(16) byte tensorArena[tensorArenaSize];

// -- Sliding window buffer --
float buf[WINDOW_SIZE][2];
int   buf_idx  = 0;

// -- Vote counter --
int vote_count = 0;

// -- Motor --
bool motorOn = false;
unsigned long motorStartTime = 0;
const unsigned long MOTOR_DURATION_MS = 2000;

// -- Manual Hold --
const int TOE_THRESHOLD      = 4000;
const int HEEL_MAX_THRESHOLD = 1000;
const unsigned long HOLD_DURATION_MS = 3000;
unsigned long holdStartTime = 0;
bool isBothHeld = false;

// -- Sampling --
unsigned long last_sample_ms = 0;
const unsigned long SAMPLE_MS = 50;

// ---------------------------------------------
void setup() {
  Serial.begin(115200);
  pinMode(MOTOR_PIN, OUTPUT);
  digitalWrite(MOTOR_PIN, LOW);

  BLEDevice::init("Xiao_SoleSignal");
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new MyServerCallbacks());  // reconnect on disconnect

  BLEService *service = server->createService(SERVICE_UUID);

  statusChar = service->createCharacteristic(
    STATUS_CHAR_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  statusChar->addDescriptor(new BLE2902());
  statusChar->setValue("0");
  service->start();

  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  adv->start();

  Serial.println("BLE started.");

  if (!modelInit(solesignal_model, tensorArena, tensorArenaSize)) {
    Serial.println("ERROR: Model init failed");
    while (1);
  }

  Serial.println("SoleSignal CNN ready!");
}

// ---------------------------------------------
float normalize(float val, float mn, float range) {
  float n = (val - mn) / range;
  if (n < 0.0f) n = 0.0f;
  if (n > 1.0f) n = 1.0f;
  return n;
}

void triggerSOS() {
  Serial.println("SOS");
  digitalWrite(MOTOR_PIN, HIGH);
  motorOn = true;
  motorStartTime = millis();
  sendSOSPulse = true;
}

void triggerNextSlide() {
  Serial.println("NEXT SLIDE");
  digitalWrite(MOTOR_PIN, HIGH);
  motorOn = true;
  motorStartTime = millis();
  isBothHeld    = false;
  holdStartTime = 0;
  sendSlidePulse = true;
}

void runInference() {
  for (int t = 0; t < WINDOW_SIZE; t++) {
    modelSetInput(buf[t][0], t * 2 + 0);
    modelSetInput(buf[t][1], t * 2 + 1);
  }

  if (!modelRunInference()) {
    Serial.println("ERROR: Inference failed");
    return;
  }

  float score = modelGetOutput(0);
  Serial.printf("[CNN] score=%.3f  vote=%d\n", score, vote_count);

  if (score >= SOS_THRESHOLD) {
    vote_count++;
    if (vote_count >= VOTE_COUNT) {
      triggerSOS();
      vote_count = 0;
    }
  } else {
    vote_count = 0;
  }
}

void slideWindow() {
  const int STEP = 25;
  int keep = WINDOW_SIZE - STEP;
  for (int i = 0; i < keep; i++) {
    buf[i][0] = buf[i + STEP][0];
    buf[i][1] = buf[i + STEP][1];
  }
  buf_idx = keep;
}

// ---------------------------------------------
void loop() {
  unsigned long now = millis();

  // Motor off after 2s
  if (motorOn && (now - motorStartTime >= MOTOR_DURATION_MS)) {
    digitalWrite(MOTOR_PIN, LOW);
    motorOn = false;
  }

  // BLE heartbeat
  if (now - lastNotify >= notifyIntervalMs) {
    lastNotify = now;
    if (sendSOSPulse) {
      statusChar->setValue("1");
      statusChar->notify();
      sendSOSPulse = false;
      Serial.println("BLE: 1");
    } else if (sendSlidePulse) {
      statusChar->setValue("2");
      statusChar->notify();
      sendSlidePulse = false;
      Serial.println("BLE: 2");
    } else {
      statusChar->setValue("0");
      statusChar->notify();
    }
  }

  if (now - last_sample_ms < SAMPLE_MS) return;
  last_sample_ms = now;

  float f0 = (float)analogRead(ANALOG_PIN0);
  float f2 = (float)analogRead(ANALOG_PIN2);

  // Manual Hold
  if (f0 >= TOE_THRESHOLD && f2 < HEEL_MAX_THRESHOLD) {
    if (!isBothHeld) {
      isBothHeld    = true;
      holdStartTime = now;
    } else if (now - holdStartTime >= HOLD_DURATION_MS) {
      triggerNextSlide();
    }
  } else {
    isBothHeld    = false;
    holdStartTime = 0;
  }

  // Not wearing → reset
  if (f0 < 500 && f2 < 500) {
    buf_idx    = 0;
    vote_count = 0;
    return;
  }

  // Normalize and store
  buf[buf_idx][0] = normalize(f0, SCALER_MIN_A0, SCALER_RANGE_A0);
  buf[buf_idx][1] = normalize(f2, SCALER_MIN_A2, SCALER_RANGE_A2);
  buf_idx++;

  if (buf_idx >= WINDOW_SIZE) {
    runInference();
    slideWindow();
  }
}
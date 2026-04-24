#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// -- Pin config --
#define ANALOG_PIN0  2   // toe
#define ANALOG_PIN2  4   // heel

#define SERVICE_UUID     "12345678-1234-1234-1234-1234567890ab"
#define STATUS_CHAR_UUID "99999999-8888-7777-6666-555555555555"

BLECharacteristic *statusChar;

// -- Thresholds --
const int ACTIVE_THRESHOLD   = 4000;
const int INACTIVE_THRESHOLD = 1000;

// -- Hold timings --
const unsigned long SINGLE_HOLD_MS = 1000;  // toe / heel 1s
const unsigned long BOTH_HOLD_MS   = 3000;  // both feet 3s

// -- Hold tracker --
struct HoldTracker {
  bool          active  = false;
  unsigned long startMs = 0;

  bool check(bool condition, unsigned long now, unsigned long duration) {
    if (condition) {
      if (!active) { active = true; startMs = now; }
      else if (now - startMs >= duration) { reset(); return true; }
    } else {
      reset();
    }
    return false;
  }

  void reset() { active = false; startMs = 0; }
};

HoldTracker toeHold;   // toe only  1s → "01"
HoldTracker heelHold;  // heel only 1s → "10"
HoldTracker bothHold;  // both      3s → "11"

// -- BLE reconnect --
class MyServerCallbacks : public BLEServerCallbacks {
  void onDisconnect(BLEServer* server) {
    BLEDevice::getAdvertising()->start();
    Serial.println("Disconnected, restarting advertising...");
  }
};

// -- Heartbeat --
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_MS = 500;

// -- Sampling --
unsigned long lastSampleMs = 0;
const unsigned long SAMPLE_MS = 50;  // 20 Hz

String lastSentState = "";

// ---------------------------------------------
void sendState(const char* state) {
  if (String(state) != lastSentState) {
    statusChar->setValue(state);
    statusChar->notify();
    lastSentState = String(state);
    Serial.println(state);
  }
}

void resetAllHolds() {
  toeHold.reset();
  heelHold.reset();
  bothHold.reset();
}

// ---------------------------------------------
void setup() {
  Serial.begin(115200);

  BLEDevice::init("SoleSignal_Game");
  BLEServer  *server  = BLEDevice::createServer();
  server->setCallbacks(new MyServerCallbacks());

  BLEService *service = server->createService(SERVICE_UUID);
  statusChar = service->createCharacteristic(
    STATUS_CHAR_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  statusChar->addDescriptor(new BLE2902());
  statusChar->setValue("00");
  service->start();

  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  adv->start();

  Serial.println("SoleSignal ready!");
}

// ---------------------------------------------
void loop() {
  unsigned long now = millis();

  // -- Heartbeat --
  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    statusChar->notify();
  }

  if (now - lastSampleMs < SAMPLE_MS) return;
  lastSampleMs = now;

  float toe  = (float)analogRead(ANALOG_PIN0);
  float heel = (float)analogRead(ANALOG_PIN2);

  bool toeOn   = toe  >= ACTIVE_THRESHOLD;
  bool heelOn  = heel >= ACTIVE_THRESHOLD;
  bool toeOff  = toe  <  INACTIVE_THRESHOLD;
  bool heelOff = heel <  INACTIVE_THRESHOLD;
  bool bothOn  = toeOn && heelOn;

  // Both feet 3s → "11"
  if (bothOn) {
    toeHold.reset();
    heelHold.reset();
    if (bothHold.check(true, now, BOTH_HOLD_MS)) {
      resetAllHolds();
      sendState("11");
    }
    return;
  }
  bothHold.reset();

  // Toe only 1s → "01"
  if (toeOn && heelOff) {
    heelHold.reset();
    if (toeHold.check(true, now, SINGLE_HOLD_MS)) {
      resetAllHolds();
      sendState("01");
    }
    return;
  }
  toeHold.reset();

  // Heel only 1s → "10"
  if (heelOn && toeOff) {
    toeHold.reset();
    if (heelHold.check(true, now, SINGLE_HOLD_MS)) {
      resetAllHolds();
      sendState("10");
    }
    return;
  }
  heelHold.reset();

  // Nothing → "00"
  sendState("00");
}
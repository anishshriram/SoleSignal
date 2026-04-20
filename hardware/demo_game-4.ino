#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// -- Pin config --
#define ANALOG_PIN0  4   // toe
#define ANALOG_PIN2  2   // heel

#define SERVICE_UUID     "12345678-1234-1234-1234-1234567890ab"
#define STATUS_CHAR_UUID "99999999-8888-7777-6666-555555555555"

BLECharacteristic *statusChar;

// -- Thresholds --
const int ACTIVE_THRESHOLD   = 4000;
const int INACTIVE_THRESHOLD = 1000;

// -- Hold timings --
const unsigned long START_HOLD_MS  = 3000;  // both feet 3s → start / resume
const unsigned long JUMP_HOLD_MS   = 500;   // toe-only → jump
const unsigned long PAUSE_HOLD_MS  = 500;   // heel-only → pause
const unsigned long COOLDOWN_MS    = 400;   // lock-out after action fires

// -- States --
// "00" = waiting   "01" = running   "10" = paused   "11" = jump
enum GameState { WAITING, RUNNING, PAUSED };
GameState gameState = WAITING;

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

HoldTracker startHold;
HoldTracker jumpHold;
HoldTracker pauseHold;

// -- Cooldown --
unsigned long cooldownEndMs  = 0;
bool          pendingRunning = false;

// -- Sampling --
unsigned long lastSampleMs = 0;
const unsigned long SAMPLE_MS = 50;  // 20 Hz

// -- Heartbeat --
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_MS = 500;

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
  startHold.reset();
  jumpHold.reset();
  pauseHold.reset();
}

// ---------------------------------------------
void setup() {
  Serial.begin(115200);

  BLEDevice::init("SoleSignal_Game");
  BLEServer  *server  = BLEDevice::createServer();
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

  // -- Heartbeat: keep BLE connection alive --
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

  // -- Cooldown: block input, then return to "01" --
  if (pendingRunning) {
    if (now >= cooldownEndMs) {
      pendingRunning = false;
      lastSentState  = "";
      sendState("01");
    }
    return;
  }

  // =============================================
  // WAITING: both feet 3s → start
  // =============================================
  if (gameState == WAITING) {
    if (startHold.check(bothOn, now, START_HOLD_MS)) {
      resetAllHolds();
      gameState = RUNNING;
      sendState("01");
    } else {
      sendState("00");
    }
    return;
  }

  // =============================================
  // RUNNING
  // =============================================
  if (gameState == RUNNING) {

    // Pause: heel only 0.5s
    if (heelOn && toeOff) {
      jumpHold.reset();
      if (pauseHold.check(true, now, PAUSE_HOLD_MS)) {
        resetAllHolds();
        gameState = PAUSED;
        sendState("10");
      }
      return;
    }
    pauseHold.reset();

    // Jump: toe only 0.5s
    if (toeOn && heelOff) {
      if (jumpHold.check(true, now, JUMP_HOLD_MS)) {
        resetAllHolds();
        sendState("11");
        cooldownEndMs  = now + COOLDOWN_MS;
        pendingRunning = true;
      }
      return;
    }
    jumpHold.reset();

    sendState("01");
    return;
  }

  // =============================================
  // PAUSED: both feet 3s → resume
  // =============================================
  if (gameState == PAUSED) {
    if (startHold.check(bothOn, now, START_HOLD_MS)) {
      resetAllHolds();
      gameState = RUNNING;
      sendState("01");
    } else {
      sendState("10");
    }
  }
}
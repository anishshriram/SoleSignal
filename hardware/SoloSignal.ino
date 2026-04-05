#include <ArduTFLite.h>
#include "solesignal_model.h"

// Pin settings
#define ANALOG_PIN0  2
#define ANALOG_PIN2  4
#define MOTOR_PIN    5

// Tensor Arena
constexpr int tensorArenaSize = 16 * 1024;
alignas(16) byte tensorArena[tensorArenaSize];

// Sliding window buffer
float buf[WINDOW_SIZE][2];
int   buf_idx  = 0;

// Vote counter
int  vote_count = 0;
bool sos_active = false;

// Sampling timing
unsigned long last_sample_ms = 0;
const unsigned long SAMPLE_MS = 50;  // 20Hz

// ─────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(MOTOR_PIN, OUTPUT);
  digitalWrite(MOTOR_PIN, LOW);

  if (!modelInit(solesignal_model, tensorArena, tensorArenaSize)) {
    Serial.println("ERROR: Model init failed");
    while (1);
  }

  Serial.println("SoleSignal CNN ready!");
}

// Normalize value to 0~1
float normalize(float val, float mn, float range) {
  float n = (val - mn) / range;
  if (n < 0.0f) n = 0.0f;
  if (n > 1.0f) n = 1.0f;
  return n;
}

// SOS trigger
void triggerSOS() {
  if (sos_active) return;
  sos_active = true;
  Serial.println("SOS");

  for (int i = 0; i < 3; i++) {
    digitalWrite(MOTOR_PIN, HIGH);
    delay(300);
    digitalWrite(MOTOR_PIN, LOW);
    delay(200);
  }
}

// Run CNN inference
void runInference() {
  // Fill input tensor
  for (int t = 0; t < WINDOW_SIZE; t++) {
    modelSetInput(buf[t][0], t * 2 + 0);  // A0
    modelSetInput(buf[t][1], t * 2 + 1);  // A2
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
    sos_active = false;
  }
}

// Slide window by STEP=25
void slideWindow() {
  const int STEP = 25;
  int keep = WINDOW_SIZE - STEP;
  for (int i = 0; i < keep; i++) {
    buf[i][0] = buf[i + STEP][0];
    buf[i][1] = buf[i + STEP][1];
  }
  buf_idx = keep;
}

// ─────────────────────────────────────────────
void loop() {
  unsigned long now = millis();
  if (now - last_sample_ms < SAMPLE_MS) return;
  last_sample_ms = now;

  float f0 = (float)analogRead(ANALOG_PIN0);
  float f2 = (float)analogRead(ANALOG_PIN2);

  // Not wearing → reset
  if (f0 < 500 && f2 < 500) {
    buf_idx    = 0;
    vote_count = 0;
    sos_active = false;
    return;
  }

  // Normalize and store in buffer
  buf[buf_idx][0] = normalize(f0, SCALER_MIN_A0, SCALER_RANGE_A0);
  buf[buf_idx][1] = normalize(f2, SCALER_MIN_A2, SCALER_RANGE_A2);
  buf_idx++;

  // When window is full, run inference then slide
  if (buf_idx >= WINDOW_SIZE) {
    runInference();
    slideWindow();
  }
}
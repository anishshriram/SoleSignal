# SoleSignal — Project Context

> This file is the quick-start context for Claude in VSCode.
> For full details, refer to `Software_Documentation__Master_v0_.pdf` in this project.

---

## What is SoleSignal?

SoleSignal is a wearable emergency alert system built into a shoe sole insert. The hardware
contains pressure-sensitive FSR sensors that detect a deliberate tap pattern from the user's
foot. When a valid pattern is detected, the paired smartphone app sends an emergency SMS
alert to a designated contact, including the user's GPS location, identity, timestamp, and
sensor ID.

The system is designed to be completely hands-free and discreet — intended for situations
where a user cannot safely reach for their phone (medical emergencies, personal safety
threats, accidents, etc.).

---

## Hardware

- **Microcontroller:** Seeed Studio XIAO nRF52840 (primary) / ESP32C3 (demo unit)
- **Sensors:** Interlink FSR 402 force-sensitive resistors (heel and toe positions)
- **Communication:** Bluetooth Low Energy (BLE)
- **Feedback:** Vibration motor for haptic confirmation
- **Power:** 3.7V LiPo battery

The hardware transmits tap-pattern data (timestamp, force, count) to the paired mobile app
over BLE. Hardware, firmware, and signal processing are considered external to the software
scope and are managed by separate team members.

---

## Software — MVP Scope

The MVP software consists of a **mobile application** and a **backend server**. It must do
exactly five things in order:

1. User downloads the app and registers an account
2. User pairs their SoleSignal sensor via Bluetooth
3. User adds at least one emergency contact
4. Sensor detects a valid tap pattern and sends data to the app
5. App sends an emergency alert package via SMS to the emergency contact

### What is explicitly OUT OF SCOPE for MVP

- Law enforcement integrations
- Tamper detection
- Multi-sensor identity binding
- False alarm secondary confirmations
- Data retention policies
- Encrypted cloud logging
- Automatic audit trails
- Multi-contact redundancy
- Calibration UI
- Footstep filtering ML models
- Wearable power management optimization
- Non-SMS alert channels (WhatsApp, email, push notifications)

---

## Tech Stack Decisions

| Layer | Decision |
|-------|----------|
| Alert delivery | Twilio API (SMS) |
| Database | PostgreSQL (relational, foreign key structure) |
| Authentication | JWT (JSON Web Tokens), 24hr expiry, no refresh token for MVP |
| Backend architecture | REST API |
| BLE demo | Web Bluetooth API, single HTML file, Chromium browsers only |
| Secure token storage | iOS Keychain / Android Keystore |

---

## Backend — Key Entities

| Entity | Key Attributes |
|--------|----------------|
| User | id, name, email, phone_number, password_hash, is_verified |
| Sensor | id, sensor_id, user_id, is_paired, is_calibrating, last_connected |
| Emergency Contact | id, user_id, name, phone_number, is_valid |
| Alert | id, user_id, sensor_id, contact_id, gps_latitude, gps_longitude, location_available, timestamp, delivery_status, retry_count |

### Entity Relationships
- User → Sensor: 1:1
- User → Emergency Contact: 1:M
- User → Alert: 1:M
- Sensor → Alert: 1:M
- Emergency Contact → Alert: 1:M

---

## REST API Endpoints

| Method | URI | Operation | Protected |
|--------|-----|-----------|-----------|
| POST | /users/register | registerUser() | No |
| POST | /users/login | loginUser() | No |
| PATCH | /users/{id} | updateUserProfile() | Yes |
| POST | /users/logout | logoutUser() | Yes |
| POST | /sensors/pair | pairSensor() | Yes |
| GET | /sensors/{id} | getSensorStatus() | Yes |
| POST | /contacts | addContact() | Yes |
| GET | /contacts | getContacts() | Yes |
| PATCH | /contacts/{id} | updateContact() | Yes |
| DELETE | /contacts/{id} | deleteContact() | Yes |
| POST | /alerts | sendAlert() | Yes |
| GET | /alerts/{id} | getAlertStatus() | Yes |

All protected endpoints require `Authorization: Bearer <token>` in the header.
Ownership is enforced — user_id is extracted from the token, never trusted from the request body.

---

## Alert Package Contents

When a valid tap pattern is detected, the app assembles and sends:
- User identity (name / display name)
- GPS location at time of alert (latitude + longitude, or "location unavailable")
- Timestamp of activation
- Sensor ID

Alert delivery retries up to 3 times on failure (NFR-5). Alert must be delivered within 5
seconds of pattern recognition assuming cellular service is available (NFR-1).

---

## Key Business Rules

- One sensor can only be linked to one user at a time
- At least one emergency contact must be added before the system is operational
- Alerts cannot be triggered during calibration or maintenance mode
- Raw motion data must not persist — RAM only, never written to storage
- Continuous GPS tracking is disabled by default
- Normal activities (walking, running) must never trigger a false alert

---

## Current Task — BLE Demo Web App

**Goal:** Prove that a browser-based web app can scan for, connect to, and read data from
the Seeed Studio XIAO ESP32C3 over BLE.

**What is being built:** A single self-contained HTML file using the Web Bluetooth API.

**Features:**
- Scan button (opens native browser BLE device picker)
- Connection status indicator
- Live data display panel showing incoming characteristic data
- Disconnect button

**Browser requirement:** Chromium-based only (Chrome, Edge, Opera). Web Bluetooth is
not supported in Firefox or Safari.

**⚠️ Pending — fill these in before testing:**

```
SERVICE_UUID      = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"  // BLE service the ESP32C3 advertises
CHARACTERISTIC_UUID = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"  // Characteristic to read/notify on
DATA_FORMAT       = // Describe what the incoming bytes represent (e.g. "3 comma-separated ints: count,force,timestamp")
```

These values come from the ESP32C3 firmware. Once known, replace the placeholders in
`ble_demo.html` and the connection will work.

---

## Known Issues / Open Items in the Documentation

1. Developer comments still present in Software Requirements — `// THIS SECTION IS SOMETHING SEUNG WILL HAVE TO WORK ON REFINING` and `// NFR-2, 3 SHALL BE FURTHER REFINED` should be cleaned up
2. Internal note `**potential feature that allows for tests that an emergency contact is valid**` still present in Architecture section
3. Haptic feedback appears in UC-5 success guarantees but has no corresponding FR or module ownership defined
4. Cancel/confirmation window described in hardware design has no FR or API endpoint
5. Business Glossary is still empty (Sensor, Activation Window, Tap Threshold need definitions)
6. MVP Hardware and Signal Processing sections in the MVP Definition are blank

---

## Team

- **Om Patel** — Firmware and system control
- **Seungmin Baik** — Signal processing algorithms (tap pattern detection)
- **Rishi Patel** — Hardware and sensor integration
- **Anish Shriram** — Wireless communication and software development

Advisor: Minning Zhu

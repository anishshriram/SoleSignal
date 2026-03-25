# SoleSignal — Project Context

> **PRIMARY REFERENCE: `Software Documentation (Master v0).pdf`**
> This file is the authoritative source of truth for all requirements, API specs, data models,
> business rules, and architecture decisions. When this file and the PDF conflict, the PDF wins.
> Always consult the PDF before making implementation decisions.
>
> This CONTEXT.md is a quick-start summary only. Do not treat it as a substitute for the PDF.

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

Hardware, firmware, and signal processing are external to the software scope and are managed
by separate team members (Om Patel, Seungmin Baik, Rishi Patel).

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
| Database | PostgreSQL (Prisma ORM) — local via Homebrew for dev, matches PDF spec |
| Authentication | JWT (JSON Web Tokens), 24hr expiry, no refresh token for MVP |
| Backend architecture | REST API (Node.js + Express + TypeScript) |
| Mobile platform | iOS only (bare React Native CLI — no Expo) |
| Mobile theme | Scarlet `#CC0033`, Black `#000000`, White `#FFFFFF` (Rutgers University) |
| BLE | `react-native-ble-plx` |
| Secure token storage | iOS Keychain via `react-native-keychain` |
| Navigation | React Navigation stack (`@react-navigation/native` + `@react-navigation/stack`) |
| HTTP client | Axios |
| BLE demo (legacy) | Web Bluetooth API, single HTML file, Chromium browsers only |

---

## Backend — Key Entities (see PDF Domain Model for full attribute list)

| Entity | Key Attributes |
|--------|----------------|
| User | id, name, email, phone_number, password_hash, is_verified, last_login |
| Sensor | id, sensor_id, user_id, is_paired, is_calibrating, last_connected |
| Emergency Contact | id, user_id, name, phone_number, is_valid (default false) |
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

## Mobile App — Screens

| Screen | Purpose |
|--------|---------|
| Register | Create account (name, email, phone, password) |
| Login | Authenticate, receive + store JWT in Keychain |
| Home | Show sensor status, trigger alert button |
| Pairing | BLE scan, connect, and pair sensor |
| Contacts | List emergency contacts, add / edit / delete |
| Alert Sent | Confirmation screen after alert dispatched |

**Onboarding flow:** Register → Pairing → Contacts → Home

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

## Team

- **Om Patel** — Firmware and system control
- **Seungmin Baik** — Signal processing algorithms (tap pattern detection)
- **Rishi Patel** — Hardware and sensor integration
- **Anish Shriram** — Wireless communication and software development

Advisor: Minning Zhu

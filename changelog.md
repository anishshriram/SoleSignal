# Changelog

## General Work Plan

Build the SoleSignal MVP backend and mobile app. The backend is a REST API (Node.js + Express + TypeScript + Prisma) serving all 12 endpoints defined in the Software Documentation Master PDF. The mobile app (React Native) handles BLE sensor pairing, tap pattern reception, and alert triggering. SMS delivery uses the Twilio API. Authentication uses stateless JWTs with 24hr expiry. The authoritative spec is `documentation/Software Documentation (Master v0).pdf`.

---

## Implementation by Stages

- **Stage 1 — Backend foundation:** Project setup, Prisma schema (all 4 entities), SQLite DB, Express server, JWT auth middleware.
- **Stage 2 — User + Contact APIs:** Register, login, and add-contact endpoints with JWT protection.
- **Stage 3 — Remaining backend APIs:** updateUserProfile, logoutUser, pairSensor, getSensorStatus, getContacts, updateContact, deleteContact, sendAlert (Twilio), getAlertStatus.
- **Stage 4 — Mobile app:** React Native setup, BLE pairing screen, contacts screen, alert trigger flow, onboarding.
- **Stage 5 — Integration + testing:** End-to-end tests, API tests, bug fixes.
- **Stage 6 — Deployment:** Docker, production config, environment variables.

---

## Checklist

### Stage 1 — Backend Foundation
- [x] Node.js + Express + TypeScript project initialized
- [x] Prisma schema defined (User, Sensor, EmergencyContact, Alert with correct relations)
- [x] SQLite database created and synced (`prisma db push`)
- [x] JWT auth middleware (`middleware/auth.ts`)
- [x] Express server with route mounting (`server.ts`)
- [x] TypeScript type declarations for Express Request (`types/express.d.ts`)
- [x] `@types/express`, `@types/jsonwebtoken`, `@types/bcryptjs` installed

### Stage 2 — User + Contact APIs
- [x] `POST /users/register` — registerUser() — response matches PDF spec
- [x] `POST /users/login` — loginUser() — JWT payload uses `user_id`, response matches PDF spec
- [x] `POST /contacts` — addContact() — phone format validation, ownership from token

### Stage 3 — Remaining Backend APIs
- [x] `PATCH /users/{id}` — updateUserProfile()
- [x] `POST /users/logout` — logoutUser()
- [x] `POST /sensors/pair` — pairSensor()
- [x] `GET /sensors/{id}` — getSensorStatus()
- [x] `GET /contacts` — getContacts()
- [x] `PATCH /contacts/{id}` — updateContact()
- [x] `DELETE /contacts/{id}` — deleteContact()
- [x] `POST /alerts` — sendAlert() (Twilio placeholder — awaiting account)
- [x] `GET /alerts/{id}` — getAlertStatus()

### Stage 4 — Mobile App
- [x] React Native (bare CLI) project initialized in `mobile/`
- [x] Theme constants: Scarlet `#CC0033`, Black `#000000`, White `#FFFFFF`
- [x] React Navigation stack configured
- [x] Axios API service pointing to backend
- [x] iOS Keychain integration (`react-native-keychain`) for secure JWT storage
- [x] BLE service module (`react-native-ble-plx`)
- [x] Register screen
- [x] Login screen
- [x] Home screen (paired sensor status + alert trigger)
- [x] Pairing screen (BLE scan + connect)
- [x] Contacts screen (list, add, edit, delete)
- [x] Alert Sent screen (confirmation)
- [x] Onboarding flow (Register → Pair → Add Contact → Home)
- [x] iOS Info.plist permissions (Bluetooth, Location When In Use)
- [x] CocoaPods installed (81 pods)
- [x] BLEContext — shares connected device + sensor DB id across screens
- [x] BLE tap pattern monitoring wired to auto-trigger alert in HomeScreen
- [x] GPS one-shot at alert time (`@react-native-community/geolocation`, 3 s timeout, falls back gracefully)
- [x] `GET /sensors/me` backend endpoint (returns user's sensor by JWT — no DB id needed from client)
- [x] `POST /sensors/pair` now returns sensor DB `id` in response
- [x] HomeScreen sensor lookup fixed (was using wrong ID)

**Platform:** iOS only (bare React Native CLI, tested via Xcode on personal device)
**Theme:** Scarlet `#CC0033` / Black `#000000` / White `#FFFFFF` (Rutgers University)
**Key deps:** `react-native-ble-plx`, `react-native-keychain`, `@react-navigation/native`, `@react-navigation/native-stack`, `axios`, `@react-native-community/geolocation`

### Stage 5 — Testing
- [ ] API endpoint tests
- [ ] Integration tests (end-to-end alert flow)

### Stage 6 — Deployment
- [ ] Docker setup
- [ ] Production environment configuration

---

## Progress Percentage

**~75%** — All 12 backend endpoints done (+ `GET /sensors/me`). Mobile app screens complete, BLE tap-to-alert loop wired, GPS at alert time. Twilio SMS still a placeholder (awaiting account). Not yet run on device.

---

## Next Actions to be Implemented

1. **First device run** — open `mobile/ios/SoleSignalMobile.xcworkspace` in Xcode, set your team signing, connect iPhone, run. Fix any build errors.
2. **Wire Twilio** — set up account, add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` to `.env`, implement SMS dispatch in `backend/routes/alerts.ts`
3. **Stage 5** — API tests and end-to-end alert flow test

---

## Decisions

- **Database:** SQLite for MVP speed (Prisma makes migration to PostgreSQL straightforward later)
- **JWT:** 24hr expiry, no refresh token, stateless logout (client deletes token)
- **Ownership:** `user_id` always extracted from JWT token, never from request body
- **Password:** bcryptjs (cross-platform), minimum 8 characters per spec
- **SMS:** Twilio API (only external API used in MVP)
- **Type safety:** `@types/*` packages installed; Express Request extended via `types/express.d.ts`

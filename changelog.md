# Changelog

## General Work Plan

Build the SoleSignal MVP backend and mobile app. The backend is a REST API (Node.js + Express + TypeScript + Prisma) serving all 12 endpoints defined in the Software Documentation Master PDF. The mobile app (React Native) handles BLE sensor pairing, tap pattern reception, and alert triggering. SMS delivery uses the Twilio API. Authentication uses stateless JWTs with 24hr expiry. The authoritative spec is `documentation/Software Documentation (Master v0).pdf`.

---

## Implementation by Stages

- **Stage 1 — Backend foundation:** Project setup, Prisma schema (all 4 entities), PostgreSQL DB, Express server, JWT auth middleware.
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
- [x] PostgreSQL database (`solesignal`) created and migrated via `prisma migrate dev`
- [x] JWT auth middleware (`middleware/auth.ts`)
- [x] Express server with route mounting (`server.ts`)
- [x] Morgan HTTP request logger added to `server.ts`
- [x] TypeScript type declarations for Express Request (`types/express.d.ts`)
- [x] `@types/express`, `@types/jsonwebtoken`, `@types/bcryptjs` installed

### Stage 2 — User + Contact APIs
- [x] `POST /users/register` — registerUser() — response matches PDF spec
- [x] `POST /users/login` — loginUser() — JWT payload uses `user_id`, response matches PDF spec
- [x] `POST /contacts` — addContact() — phone format validation, ownership from token

### Stage 3 — Remaining Backend APIs
- [x] `PATCH /users/{id}` — updateUserProfile()
- [x] `POST /users/logout` — logoutUser()
- [x] `POST /sensors/pair` — pairSensor() — returns sensor DB `id` in response
- [x] `GET /sensors/{id}` — getSensorStatus()
- [x] `GET /sensors/me` — returns authenticated user's sensor (no DB id required from client)
- [x] `GET /contacts` — getContacts() — returns `{ contacts: [...] }`
- [x] `PATCH /contacts/{id}` — updateContact()
- [x] `DELETE /contacts/{id}` — deleteContact()
- [x] `POST /alerts` — sendAlert() (Twilio placeholder — awaiting account)
- [x] `GET /alerts/{id}` — getAlertStatus()

### Stage 4 — Mobile App
- [x] React Native (bare CLI) project initialized in `mobile/`
- [x] Theme constants: Scarlet `#CC0033`, Black `#000000`, White `#FFFFFF`
- [x] React Navigation native stack configured
- [x] Axios API service pointing to backend
- [x] iOS Keychain integration (`react-native-keychain`) for secure JWT storage
- [x] BLE service module (`react-native-ble-plx`)
- [x] Register screen
- [x] Login screen
- [x] Home screen (sensor status + manual + auto alert trigger)
- [x] Pairing screen (BLE scan + connect)
- [x] Contacts screen (list, add, edit, delete)
- [x] Alert Sent screen (confirmation)
- [x] Onboarding flow (Register → Pair → Add Contact → Home)
- [x] iOS Info.plist permissions (Bluetooth, Location When In Use)
- [x] CocoaPods installed (80 pods — reanimated removed, incompatible with RN 0.84)
- [x] BLEContext — shares connected device + sensor DB id across screens
- [x] BLE tap pattern monitoring wired to auto-trigger alert in HomeScreen
- [x] GPS one-shot at alert time (3s timeout, graceful fallback)
- [x] Node 20 required — `.xcode.env.local` hardcoded to nvm Node 20 path

**Platform:** iOS only (bare React Native CLI, tested via Xcode on personal device)
**Theme:** Scarlet `#CC0033` / Black `#000000` / White `#FFFFFF` (Rutgers University)
**Key deps:** `react-native-ble-plx`, `react-native-keychain`, `@react-navigation/native`, `@react-navigation/native-stack`, `axios`, `@react-native-community/geolocation`, `morgan`

### Stage 5 — Testing
- [x] API endpoint tests — Vitest + Supertest (45 tests, 4 test files, all passing)
- [x] Integration test — end-to-end register → login → pair sensor → add contact → send alert flow covered in `alerts.test.ts`

### Stage 6 — Deployment
- [ ] Docker setup
- [ ] Production environment configuration

---

## Progress Percentage

**~90%** — Backend complete with logging. Mobile app running on device. All 45 API tests passing. BLE UUIDs updated from firmware team. Twilio SMS still placeholder.

---

## Device Testing Session (2026-03-30)

### What was tested
- Full backend restart and device test after Stage 5 testing and BLE UUID update
- Registered new account, logged in, added contacts — all confirmed working
- Attempted BLE scan and pairing with physical XIAO sensor
- Attempted alert flow

### What worked
- Backend startup and all API endpoints confirmed via Morgan logs
- Register, login, contacts (add/view) working on device
- XIAO sensor was visible in BLE scan after filtering fix
- Alert spam issue identified and fixed

### Bugs found and fixed
| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Backend crashed silently on startup | Zombie node process from previous session still holding port 3000; new `npm run dev` couldn't bind and exited silently | Killed PID with `kill <pid>`, restarted backend cleanly |
| App showing "internal server error" on register/login | Previous backend terminal had commands typed into it, killing the `npm run dev` process while leaving a zombie on port 3000 | Restarted backend in a clean terminal; never type other commands in backend terminal |
| BLE scan flooded with "Unknown device" entries | `startDeviceScan(null, null, ...)` scans all nearby BLE peripherals | Changed to scan specifically for `SOLE_SIGNAL_SERVICE_UUID`; also added name filter in PairingScreen |
| "NOT READY" alert spamming repeatedly after connecting XIAO | `dispatchAlert` returned early without setting `alertInProgress.current = true`, so every BLE characteristic notification re-triggered the alert | Set `alertInProgress` guard at the top of `dispatchAlert`; auto-trigger silently ignores not-ready state (only manual button shows the alert) |
| BASE_URL wrong after network change | IP changed from `192.168.1.243` to `10.75.181.130` between sessions | Updated `api.ts` BASE_URL |

### Known remaining issues
- BLE characteristic fires continuously (not just on tap) — the XIAO firmware sends data constantly, meaning any data triggers `onTapPattern`. Needs firmware-side fix to only notify on confirmed tap pattern
- Twilio SMS not wired — alerts create DB records but no SMS is sent

### Reminder for next session
- Always start backend in a **dedicated terminal** — never type other commands in the same terminal as `npm run dev`
- Run `lsof -i :3000` if the backend exits immediately — there may be a zombie process holding the port
- Run `ipconfig getifaddr en0` to get current IP before testing on device — update `api.ts` if it changed

---

## Device Testing Session (2026-03-25)

### What was tested
- Built and deployed to physical iPhone via Xcode (iOS 26.4, SDK)
- Metro bundler running on Node 20 via nvm
- Backend running locally, PostgreSQL on Homebrew

### What worked
- App installed and launched successfully on device
- Register: account created, confirmed in PostgreSQL (`SELECT * FROM users`)
- Login: JWT received and stored in iOS Keychain

### Bugs found and fixed
| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Data not saving to PostgreSQL | Prisma client generated against old SQLite provider; `dev.db` still existed and intercepted writes | Deleted `dev.db`, ran `prisma generate` to regenerate client for PostgreSQL |
| Contacts not appearing after save | `GET /contacts` returned flat array; mobile expected `{ contacts: [...] }` | Fixed backend to return `{ contacts }` wrapper |
| Contacts screen always empty on fresh account | `GET /contacts` returned 404 for empty list; mobile's catch block swallowed it | Changed to return `200 { contacts: [] }` |
| Build failed: RNReanimated hermes header | `react-native-reanimated` v3 incompatible with RN 0.84 Hermes headers | Removed reanimated entirely (not needed — using native-stack) |
| Metro start failed: `toReversed is not a function` | Node 18 — RN 0.84 requires Node 20 | Installed Node 20 via nvm; hardcoded path in `.xcode.env.local` |
| Backend build phase failed in Xcode | Xcode build environment doesn't load nvm; `NODE_BINARY` resolved to nothing | Created `.xcode.env.local` with absolute path to Node 20 binary |
| Backend wrote to SQLite instead of PostgreSQL | Schema was SQLite; migration to PostgreSQL done but old client cached | Regenerated Prisma client, deleted `dev.db` |

### Known remaining issues
- BLE UUIDs updated — service: `12345678-1234-1234-1234-1234567890ab`, status char: `99999999-8888-7777-6666-555555555555`
- Twilio not wired — alerts create DB records but no SMS is sent
- `BASE_URL` in `api.ts` is hardcoded to local IP — must be updated when network changes

---

## Stage 5 Testing (2026-03-30)

**Test runner:** Vitest + Supertest (switched from Jest due to TypeScript 6 peer dep conflict with ts-jest)

**Architecture change:** Extracted Express app into `backend/app.ts` so tests can import the app without starting the server. `backend/server.ts` now just calls `app.listen()`.

### Test results — 45 tests, 4 files, all passing

| File | Tests | Coverage |
|------|-------|----------|
| `tests/users.test.ts` | 14 | register (success, duplicate, missing fields, short password), login (success, wrong password, wrong email, missing fields), update profile (success, forbidden, no auth, no fields), logout (success, no auth) |
| `tests/contacts.test.ts` | 11 | empty list, add (success, missing name, bad phone, no auth), get populated list, update (success, no fields, 404), delete (success, already deleted) |
| `tests/sensors.test.ts` | 9 | pair (success, missing sensor_id, already claimed by other user, no auth), GET /sensors/me before and after pair, GET /sensors/:id (success, wrong user, bad ID) |
| `tests/alerts.test.ts` | 11 | send alert (with/without GPS, missing coords when location_available true, wrong sensor/contact ownership, missing fields, no auth), get alert status (success, wrong user, bad ID, not found) |

**Run command:** `npm test` from `backend/`

---

## Continuity Audit (2026-03-25)

Full audit of all 24 source files performed. Issues found:

| Issue | Severity | Status |
|-------|----------|--------|
| `GET /contacts` flat array vs `{ contacts }` wrapper | Breaking | **Fixed** |
| `GET /contacts` returns 404 on empty list | Breaking | **Fixed** |
| `sensor_id`/`contact_id` parsed with `parseInt` on already-numeric values | Medium | **Fixed** (use `Number()`) |
| BLE service UUIDs are firmware placeholders | High | Open — needs hardware team input |
| Twilio SMS not implemented | High | Open — awaiting account |
| JWT_SECRET falls back to hardcoded default if env missing | Security | Acceptable for dev; fix before production |

---

## Next Actions to be Implemented

1. **Wire Twilio** — create account, add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` to `.env`, implement SMS in `backend/routes/alerts.ts`
2. ~~**BLE UUIDs**~~ — updated in `mobile/src/services/ble.ts` (provided by firmware team)
3. ~~**Stage 5**~~ — Complete. 45 Vitest + Supertest tests passing across 4 test files.
4. **Wire Twilio** — still pending (requires account credentials)

---

## Decisions

- **Database:** PostgreSQL (per PDF spec) — local Homebrew install for dev (`solesignal` db, port 5432). Prisma migrations in `prisma/migrations/`.
- **JWT:** 24hr expiry, no refresh token, stateless logout (client deletes token)
- **Ownership:** `user_id` always extracted from JWT token, never from request body
- **Password:** bcryptjs (cross-platform), minimum 8 characters per spec
- **SMS:** Twilio API (only external API used in MVP)
- **Type safety:** `@types/*` packages installed; Express Request extended via `types/express.d.ts`

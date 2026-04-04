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
- [x] `POST /alerts` — sendAlert() — Twilio SMS with up to 3 retries (NFR-5); delivery_status set to `delivered` or `failed`
- [x] `GET /alerts/{id}` — getAlertStatus()
- [x] `DELETE /sensors/me` — unpairSensor() — added post-spec (not in original PDF)

### Stage 4 — Mobile App
- [x] React Native (bare CLI) project initialized in `mobile/`
- [x] Theme constants: Scarlet `#CC0033`, Black `#000000`, White `#FFFFFF`
- [x] React Navigation native stack configured
- [x] Axios API service pointing to backend
- [x] iOS Keychain integration (`react-native-keychain`) for secure JWT storage
- [x] BLE service module (`react-native-ble-plx`)
- [x] Register screen
- [x] Login screen
- [x] Home screen (sensor status + event log + manual + auto alert trigger)
- [x] Pairing screen (BLE scan filtered by service UUID + connect)
- [x] Contacts screen (list, add, edit, delete)
- [x] Alert Sent screen (confirmation)
- [x] Onboarding flow (Register → Pair → Add Contact → Home)
- [x] iOS Info.plist permissions (Bluetooth, Location When In Use)
- [x] CocoaPods installed (80 pods — reanimated removed, incompatible with RN 0.84)
- [x] BLEContext — shares connected device + sensor DB id across screens
- [x] BLE tap pattern monitoring wired to auto-trigger alert in HomeScreen
- [x] BLE tap detection fixed — only triggers on decoded value `"1"` (firmware protocol)
- [x] BLE scan filtered by service UUID — only SoleSignal devices shown
- [x] BLE disconnect listener — status dot updates immediately on drop
- [x] GPS one-shot at alert time (3s timeout, graceful fallback)
- [x] Node 20 required — `.xcode.env.local` hardcoded to nvm Node 20 path
- [x] Event log on Home screen — scrolling, timestamped, color-coded (styled after ble_demo.html)
- [x] Reconnect button on Home screen — shown when paired but not connected this session
- [x] Unpair button on Home screen — confirmation dialog, calls DELETE /sensors/me
- [x] Vibration on alert dispatch — `[0, 500, 200, 500]` pattern

**Platform:** iOS only (bare React Native CLI, tested via Xcode on personal device)
**Theme:** Scarlet `#CC0033` / Black `#000000` / White `#FFFFFF` (Rutgers University)
**Key deps:** `react-native-ble-plx`, `react-native-keychain`, `@react-navigation/native`, `@react-navigation/native-stack`, `axios`, `@react-native-community/geolocation`, `morgan`

### Stage 5 — Testing
- [x] API endpoint tests — Vitest + Supertest (45 tests, 4 test files, all passing)
- [x] Integration test — end-to-end register → login → pair sensor → add contact → send alert flow covered in `alerts.test.ts`

### Stage 6 — Deployment
- [x] Docker setup — `backend/Dockerfile`, `docker-compose.yml`, `backend/entrypoint.sh`, `backend/.dockerignore`
- [x] Production environment configuration — `.env.example` documents all required secrets

---

## Session Startup & Shutdown Instructions

### Before every test session

**Step 1 — Check your Mac's IP** (do this first — it changes between sessions on campus networks)
```bash
ipconfig getifaddr en0
```
Compare to `BASE_URL` in `mobile/src/services/api.ts`. If different, update it before building.

**Step 2 — Start PostgreSQL**
```bash
brew services start postgresql@14
```

**Step 3 — Start backend** (dedicated terminal — never type anything else here)
```bash
cd /Users/anishshriram/Desktop/SoleSignal/SoleSignal/backend
npm run dev
```
Should stay running indefinitely showing `Server running on port 3000`. If it exits immediately:
```bash
lsof -i :3000        # find zombie process
kill <PID>           # kill it
npm run dev          # restart
```

**Step 4 — Start Metro** (separate terminal)
```bash
cd /Users/anishshriram/Desktop/SoleSignal/SoleSignal/mobile
nvm use 20
npx react-native start
```

**Step 5 — Build in Xcode**
- Open `mobile/ios/SoleSignalMobile.xcworkspace` (the `.xcworkspace`, not `.xcodeproj`)
- Plug in iPhone
- Press **Cmd+R**

**Step 6 — Configure Metro on device** (first time per install only)
If app shows "Connect to Metro to develop JavaScript":
- Shake phone → **Settings** → **Custom bundler address**
- IP from Step 1, port `8081`, entrypoint `index.js`
- Go back → **Reload**

### Shutdown order
1. `Ctrl+C` in Metro terminal
2. `Ctrl+C` in backend terminal
3. `brew services stop postgresql@14` (optional — safe to leave running)
4. Close Xcode

### Useful debug commands
```bash
# Verify DB contents
psql -d solesignal -c "SELECT * FROM users;"
psql -d solesignal -c "SELECT * FROM sensors;"
psql -d solesignal -c "SELECT * FROM alerts;"

# Check if something is holding port 3000
lsof -i :3000

# Test backend health from Mac
curl http://localhost:3000/

# Test backend reachable from phone (run from Mac, open result URL on iPhone)
echo "http://$(ipconfig getifaddr en0):3000/"
```

---

## Progress Percentage

**100%** — All stages complete. Backend, mobile app, BLE, Twilio SMS, tests, ER diagram, and Docker deployment all done.

---

## Device Testing Session (2026-03-30) — Full End-to-End Confirmed Working

### Confirmed working on physical iPhone (screenshots taken)

| Screen / Feature | Status | Notes |
|-----------------|--------|-------|
| Pairing screen — BLE scan | ✅ | XIAO_THRESHOLD discovered, device ID shown (`B70FA814-...`) |
| Pairing screen — connect | ✅ | Successfully connected to XIAO_THRESHOLD |
| Home screen — status dot green | ✅ | Shows "Paired & connected" with green dot after pairing |
| Home screen — status dot yellow | ✅ | Shows "Paired — sensor not in range" when not connected this session |
| Home screen — event log | ✅ | Streams timestamped BLE data in real time; green/yellow/gray color coding |
| BLE data streaming | ✅ | Characteristic sending `"0"` continuously (~2x per second) |
| Tap pattern detection | ✅ | Firmware sends `"1"` on tap → event log shows yellow "Tap pattern detected — triggering alert" → alert popup fires |
| Alert dispatch (auto) | ✅ | Triggered by `"1"` from XIAO, navigated to Alert Sent screen |
| Alert Sent screen | ✅ | Shows "Alert sent", checkmark, alert ID (e.g. Alert #3) |
| Contacts screen | ✅ | Shows contact name + phone, Edit/Delete buttons, confirmation dialog on delete |
| Unpair dialog | ✅ | Confirmation dialog shown, destructive red Unpair button |
| Manual SEND ALERT button | ✅ | Sends alert record to backend when sensor + contact are set |

### What is still pending
- Twilio SMS — alert record is created in DB but no SMS is physically sent yet
- Auto-reconnect — after app reload, sensor shows yellow (not connected) until user manually reconnects via Pairing screen

---

## Session Summary (2026-03-30) — UX Improvements + Bug Fixes

### Changes made
| Change | File(s) | Notes |
|--------|---------|-------|
| BLE scan now filters by service UUID | `mobile/src/services/ble.ts` | Only SoleSignal devices appear in the scan list |
| PairingScreen filters unnamed devices | `mobile/src/screens/PairingScreen.tsx` | Eliminates "Unknown device" clutter |
| Fixed BLE tap trigger — only fires on value `"1"` | `mobile/src/services/ble.ts` | Previously any characteristic data triggered an alert |
| Fixed alert spam — `alertInProgress` guard set immediately | `mobile/src/screens/HomeScreen.tsx` | Auto-trigger silently ignores not-ready state; only manual button shows the error |
| Added scrolling event log to Home screen | `mobile/src/screens/HomeScreen.tsx` | Dark background, monospace, timestamped, color-coded — styled after `demov1/ble_demo.html` |
| Added Reconnect button | `mobile/src/screens/HomeScreen.tsx` | Shown when sensor is paired in DB but not connected this session |
| Added Unpair button with confirmation | `mobile/src/screens/HomeScreen.tsx` | Calls `DELETE /sensors/me`, clears BLE context |
| Added vibration on alert dispatch | `mobile/src/screens/HomeScreen.tsx` | Pattern: `[0, 500, 200, 500]` |
| Added `DELETE /sensors/me` endpoint | `backend/routes/sensors.ts` | Unpairs and deletes sensor record; alerts cascade-delete |
| Added `unpairSensor()` API call | `mobile/src/services/api.ts` | Calls `DELETE /sensors/me` |
| BLE disconnect listener added | `mobile/src/screens/HomeScreen.tsx` | Status dot updates immediately when device drops |
| Added `onData` callback to `monitorTapPattern` | `mobile/src/services/ble.ts` | Raw characteristic values logged to event log |

### Known remaining issues
- XIAO firmware sends characteristic data continuously — the `"1"` filter now prevents false alerts, but the event log will show every transmission
- Twilio SMS not wired — alerts create DB records but no SMS is sent
- `BASE_URL` in `api.ts` hardcoded to local IP — must be updated when network changes

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

### Reminder for next session
- Always start backend in a **dedicated terminal** — never type other commands in the same terminal as `npm run dev`
- Run `lsof -i :3000` if the backend exits immediately — there may be a zombie process holding the port
- Run `ipconfig getifaddr en0` to get current IP before testing on device — update `api.ts` if it changed

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
| BLE service UUIDs are firmware placeholders | High | **Fixed** — UUIDs provided by firmware team |
| Twilio SMS not implemented | High | Open — awaiting account |
| JWT_SECRET falls back to hardcoded default if env missing | Security | Acceptable for dev; fix before production |

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

---

## Next Actions to be Implemented

1. ~~**Wire Twilio**~~ — complete. SMS sends on every alert with up to 3 retries. `delivery_status` set to `delivered` or `failed`.
2. ~~**BLE UUIDs**~~ — complete
3. ~~**Stage 5 testing**~~ — complete
4. **Stage 6** — Docker + production deployment

---

## Session Summary (2026-04-03) — ER Diagram + Excalidraw Skill Setup

### What was done
- Installed the `excalidraw-diagram` skill from `coleam00/excalidraw-diagram-skill` into `~/.claude/skills/excalidraw-diagram/`
- Installed `uv` (Python package manager) and set up the Playwright-based PNG renderer
- Generated `documentation/SoleSignal_ER_Diagram.excalidraw` — a full ER diagram based entirely on the domain model in the Software Documentation PDF (pages 17–20)
- Rendered to `documentation/SoleSignal_ER_Diagram.png`

### ER Diagram contents
| Entity | Fields | Notes |
|--------|--------|-------|
| `users` | id, name, email, phone_number, password_hash, is_verified, last_login, created_at | Direct from PDF domain model |
| `sensors` | id, sensor_id, user_id (FK), is_paired, is_calibrating, last_connected, created_at | Direct from PDF |
| `emergency_contacts` | id, user_id (FK), name, phone_number, is_valid, created_at | Direct from PDF |
| `alerts` | id, user_id (FK), sensor_id (FK), contact_id (FK), gps_latitude, gps_longitude, loc_available, timestamp, delivery_status, retry_count | Direct from PDF |

Relationships shown: users→sensors (1:1), users→emergency_contacts (1:M), users→alerts (1:M), sensors→alerts (1:M), emergency_contacts→alerts (1:M).

Styling: SoleSignal scarlet `#CC0033` for all headers, borders, and relationship lines — matches `mobile/src/theme.ts`.

### How to re-render after edits
After editing `SoleSignal_ER_Diagram.excalidraw` in excalidraw.com, run:
```bash
source ~/.local/bin/env && cd ~/.claude/skills/excalidraw-diagram/references && uv run python render_excalidraw.py ~/Desktop/SoleSignal/SoleSignal/documentation/SoleSignal_ER_Diagram.excalidraw
```
This overwrites `SoleSignal_ER_Diagram.png` in place.

---

## Session Summary (2026-04-04) — Docker Deployment + ER Diagram Crow's Foot Fix

### What was done
| Change | File(s) | Notes |
|--------|---------|-------|
| Fixed ER diagram crow's foot notation | `documentation/SoleSignal_ER_Diagram.excalidraw`, `.png` | Replaced incorrect single ticks with proper `\|\|` (one and only one) on all one-ends; replaced broken fan with proper `\|<` (tick + outward crow's foot) on all many-ends |
| Changed "one-to-one" label to "1:1" | `documentation/SoleSignal_ER_Diagram.excalidraw` | Matches industry standard labeling |
| Updated legend | `documentation/SoleSignal_ER_Diagram.excalidraw` | Now describes `\|\|` and `\|<` symbols correctly |
| Added `backend/Dockerfile` | `backend/Dockerfile` | Node 20 Alpine; installs deps, generates Prisma client |
| Added `backend/entrypoint.sh` | `backend/entrypoint.sh` | Runs `prisma migrate deploy` then starts server via `tsx` |
| Added `backend/.dockerignore` | `backend/.dockerignore` | Excludes node_modules, dist, .env, tests from image |
| Added `docker-compose.yml` | `docker-compose.yml` | Orchestrates backend + postgres:14-alpine; health check ensures DB ready before backend starts; persistent volume for DB data |
| Added `.env.example` | `.env.example` | Documents all required secrets: DB_PASSWORD, JWT_SECRET, Twilio credentials |

### How to run with Docker
```bash
cp .env.example .env
# fill in .env with real values
docker-compose up --build
```
Backend available at `http://localhost:3000`. PostgreSQL migrations run automatically on startup.

---

## Master Document Update Requirements

The following items were implemented during development but are **not reflected in the current Software Documentation Master PDF**. The document should be updated before final submission or handoff.

| Item | What was built | What the doc says / omits |
|------|---------------|--------------------------|
| `DELETE /sensors/me` endpoint | Unpairs and deletes the user's sensor record | Not listed in the API endpoint table — doc only has 12 endpoints, this is the 13th |
| `GET /sensors/me` endpoint | Returns the authenticated user's sensor without needing to know its DB id | Not listed — doc only has `GET /sensors/{id}` |
| BLE service UUID + characteristic UUID | `12345678-1234-1234-1234-1234567890ab` / `99999999-8888-7777-6666-555555555555` (from firmware team) | Not documented anywhere in the spec |
| BLE tap trigger protocol | Firmware sends `"1"` (ASCII, base64-encoded over BLE) to signal a confirmed tap pattern | Not specified in the doc — only says "tap pattern" without defining the signal value |
| Sensor unpair behavior | Sensor record is deleted on unpair; associated alerts are cascade-deleted | No unpair flow described in the doc |
| `POST /sensors/pair` response shape | Returns `{ message, sensor_id, id }` where `id` is the DB primary key used in alert requests | Doc does not specify that the DB `id` (separate from `sensor_id`) is returned and required for alerts |
| Test framework | Vitest + Supertest (not Jest) due to TypeScript 6 peer dep conflict | Doc says Jest; switched to Vitest — functionally identical API |
| React Native version | 0.84 (bare CLI) — `react-native-reanimated` removed, incompatible with RN 0.84 Hermes | No specific RN version pinned in the doc |
| Node.js version requirement | Node 20 required — RN 0.84 uses `Array.toReversed()` which fails on Node 18 | Not documented |
| JWT payload field | Uses `user_id` (not `id`) in JWT token payload | Doc describes JWT auth but does not specify the payload field name |
| Alert `delivery_status` values | `pending`, `delivered`, `failed` | Doc mentions delivery status but does not enumerate the exact string values |

---

## Decisions

- **Database:** PostgreSQL (per PDF spec) — local Homebrew install for dev (`solesignal` db, port 5432). Prisma migrations in `prisma/migrations/`.
- **JWT:** 24hr expiry, no refresh token, stateless logout (client deletes token)
- **Ownership:** `user_id` always extracted from JWT token, never from request body
- **Password:** bcryptjs (cross-platform), minimum 8 characters per spec
- **SMS:** Twilio API (only external API used in MVP)
- **Type safety:** `@types/*` packages installed; Express Request extended via `types/express.d.ts`

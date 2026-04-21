# Changelog

## General Work Plan

Build the SoleSignal MVP backend and mobile app. The backend is a REST API (Node.js + Express + TypeScript + Prisma) serving all 12 endpoints defined in the Software Documentation Master PDF. The mobile app (React Native) handles BLE sensor pairing, tap pattern reception, and alert triggering. SMS delivery uses the Textbelt API (replaced Twilio — A2P 10DLC and toll-free verification blocked Twilio for US numbers). Authentication uses stateless JWTs with 24hr expiry. The authoritative spec is `documentation/Software Documentation (Master v0).pdf`.

---

## Implementation by Stages

- **Stage 1 — Backend foundation:** Project setup, Prisma schema (all 4 entities), PostgreSQL DB, Express server, JWT auth middleware.
- **Stage 2 — User + Contact APIs:** Register, login, and add-contact endpoints with JWT protection.
- **Stage 3 — Remaining backend APIs:** updateUserProfile, logoutUser, pairSensor, getSensorStatus, getContacts, updateContact, deleteContact, sendAlert (Textbelt), getAlertStatus.
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
- [x] `POST /alerts` — sendAlert() — Textbelt SMS with up to 3 retries (NFR-5); delivery_status set to `delivered` or `failed`
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
- [x] Auto-reconnect on app load — silently attempts BLE reconnect on startup if sensor is paired in DB
- [x] Unpair button on Home screen — confirmation dialog, BLE disconnect + DELETE /sensors/me
- [x] Vibration on alert dispatch — `[0, 500, 200, 500]` pattern
- [x] 10-second cancel countdown overlay — shown for both tap and manual alert triggers; CANCEL button dismisses without sending
- [x] Alert dispatch stale closure fixed — `dispatchAlertRef` pattern ensures setInterval always calls latest function (fixes tap trigger silently failing)
- [x] Reverse geocoding — Nominatim (OpenStreetMap) converts GPS to human-readable address in SMS; falls back to raw coords on failure
- [x] Unpair BLE disconnect fixed — `bleService.disconnect()` called before `clearBLEState()` so ESP32 resumes advertising after unpair
- [x] Twilio replaced with Textbelt — `TEXTBELT_KEY` env var; no carrier registration required; ~$0.01/text
- [x] `hardware/demo_game-4.ino` — active Arduino firmware for demo game (release gate removed; 2-char BLE protocol: `"00"` idle, `"01"` start/resume, `"10"` pause, `"11"` jump)
- [x] demov2 BLE protocol updated for `demo_game-4.ino` — 2-char protocol, name-based BLE filter (`"SoleSignal_Game"`), GATT reconnect on drop

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

**100%** — All stages complete. Backend, mobile app, BLE, Textbelt SMS, tests, ER diagram, and Docker deployment all done.

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

### What is still pending (as of 2026-03-30 — both resolved in later sessions)
- ~~Twilio SMS~~ — resolved 2026-04-20: Twilio replaced with Textbelt; SMS confirmed delivered end-to-end
- ~~Auto-reconnect~~ — resolved 2026-04-04: auto-reconnect implemented on app load via `reconnectAttempted` ref

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

### Known remaining issues (as of 2026-03-30)
- XIAO firmware sends characteristic data continuously — the `"1"` filter now prevents false alerts, but the event log will show every transmission
- ~~Twilio SMS not wired~~ — resolved 2026-04-20: replaced with Textbelt, SMS delivery confirmed
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
| Twilio SMS not implemented | High | **Fixed** — replaced with Textbelt (2026-04-20); see Twilio → Textbelt session summary |
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
4. ~~**Stage 6**~~ — complete. Docker + `docker-compose.yml` + `entrypoint.sh` + `.env.example` all added.

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

## Session Summary (2026-04-20) — Full End-to-End Run + Alert Dispatch Fixes + Geocoding

### What was confirmed working (first full successful end-to-end run)

| Feature | Status | Notes |
|---------|--------|-------|
| Backend startup | ✅ | `npm run dev` on Node 20, PostgreSQL via Homebrew |
| Metro bundler | ✅ | Required Node 20 (`nvm use 20`) — `toReversed` error on Node 18 |
| Xcode build + deploy | ✅ | Cable deploy to iPhone 16 Pro Max (iOS 26.3.1) via Xcode 26.4 |
| Register / Login | ✅ | JWT stored in iOS Keychain |
| Sensor pairing (BLE) | ✅ | Scan → connect → POST /sensors/pair |
| BLE tap detection | ✅ | `"1"` received → countdown starts |
| 10-second cancel window | ✅ | Overlay shown, CANCEL button dismisses it without sending |
| Alert dispatch (tap-triggered) | ✅ | Countdown completes → POST /alerts → SMS sent |
| Alert dispatch (manual button) | ✅ | Same countdown flow |
| SMS delivery via Textbelt | ✅ | Message received on emergency contact phone |
| Reverse geocoding | ✅ | Address shown in SMS instead of raw GPS coords |
| Contacts screen | ✅ | Add / edit / delete working |
| AlertSent screen | ✅ | Shows alert ID after dispatch |

### SMS received (confirmed format after geocoding fix):
```
EMERGENCY ALERT from [Name]. Location: [Street Address, City, State, ZIP, Country]. Time: [ISO timestamp]
```

---

### Bugs fixed this session

#### Bug 1 — Tap pattern detected but alert never sent (stale closure)
**Symptom:** BLE tap triggered the countdown UI but alert never dispatched after countdown ended.
**Root cause:** `startAlertCountdown` was wrapped in `useCallback([alertCountdown])`. The `dispatchAlert` function captured inside the `setInterval` callback was a stale closure — it referenced the version of `dispatchAlert` from when the countdown started, which had stale `resolvedSensorDbId` and `contactId` values. The function silently returned early because `isManual=false` suppressed the error alert.
**Fix:**
- Added `dispatchAlertRef = useRef()` that is updated on every render via `useEffect(() => { dispatchAlertRef.current = dispatchAlert; })`
- The `setInterval` callback now calls `dispatchAlertRef.current(...)` — always the latest version
- Changed `dispatchAlert` to always show an error (not just when `isManual=true`) so failures are visible in the event log
**File:** `mobile/src/screens/HomeScreen.tsx`

#### Bug 2 — No way to cancel an alert after triggering
**Symptom:** Once SEND ALERT or a tap was triggered, the alert dispatched immediately with no cancel window.
**Fix:** Added a 10-second countdown overlay that appears for BOTH tap triggers and manual button presses:
- `alertCountdown` state (null | number) controls overlay visibility
- `countdownTimerRef` holds the `setInterval` reference
- `startAlertCountdown(isManual)` — starts countdown, both paths go through this
- `cancelCountdown()` — clears interval, resets state, logs "Alert cancelled"
- Countdown overlay: dark background, large countdown number (56px), red CANCEL button
- After countdown hits 0: `dispatchAlertRef.current()` fires
- Replaced old `handleAutoAlert()` popup with this flow
**File:** `mobile/src/screens/HomeScreen.tsx`

#### Bug 3 — GPS coordinates in SMS instead of address
**Symptom:** SMS read `GPS: 40.12345, -74.12345` — functionally useless to a recipient.
**Fix:** Added `reverseGeocode()` function to backend using Nominatim (OpenStreetMap):
- Free, no API key required
- Nominatim usage policy requires a descriptive `User-Agent` header
- Returns `display_name` field (full address string)
- Falls back to raw GPS coordinates if geocoding fails (network issue, no response)
- SMS now reads: `Location: 123 Main St, City, State ZIP, Country`
- Removed `Sensor: ${sensor.sensor_id}` from SMS (irrelevant to recipient)
**File:** `backend/routes/alerts.ts`

#### Bug 4 — Unpair then re-scan: sensor not found
**Symptom:** After unpairing a sensor, scanning found nothing.
**Root cause (software):** `handleUnpair` called `clearBLEState()` without first disconnecting the BLE connection. The ESP32 still thought it was connected and stopped advertising.
**Fix (software):** Added `bleService.disconnect(connectedDevice.id)` before `clearBLEState()` in the unpair handler.
**Note:** A hardware-side fix was also applied that resolved this independently. Both fixes are in place.
**File:** `mobile/src/screens/HomeScreen.tsx`

#### Bug 5 — Metro bundler crashed with `toReversed is not a function`
**Symptom:** `npx react-native start` crashed immediately.
**Root cause:** Node 18 — `Array.prototype.toReversed()` requires Node 20.
**Fix:** `nvm install 20 && nvm use 20` before starting Metro.

#### Bug 6 — Backend running with old code after edits (geocoding not applied)
**Symptom:** First alert after geocoding change still used old SMS format with `Sensor:` field.
**Root cause:** Backend was not restarted after the `alerts.ts` edit.
**Fix:** Always restart `npm run dev` after backend changes.

---

### Files changed this session

| File | Change |
|------|--------|
| `mobile/src/screens/HomeScreen.tsx` | Added countdown overlay, `dispatchAlertRef`, BLE disconnect on unpair, removed `handleAutoAlert` |
| `backend/routes/alerts.ts` | Added `reverseGeocode()` using Nominatim, updated SMS body format |

---

## Session Summary (2026-04-20) — demov2 BLE Protocol Update + Alert Cancel Feature

### demov2 changes
| Change | Notes |
|--------|-------|
| BLE protocol updated to match `demo_game-4.ino` | Replaced `"1"` trigger with 2-char protocol: `"00"` idle, `"01"` running/start, `"10"` pause, `"11"` jump |
| BLE filter changed to name-based | `filters: [{ name: "SoleSignal_Game" }]` — 128-bit UUID overflows ESP32 ad packet into scan response which Web Bluetooth ignores |
| GATT reconnect logic added | Extracted `connectGATT()` — auto-reconnects on drop without requiring re-scan |
| Game start/pause/resume wired to protocol | `"01"` → start/resume, `"10"` → pause, `"11"` → jump |
| Death cooldown added | 3s grace period after death before restart is accepted |
| Death restart | After cooldown, either toe hold (`"11"`) or heel hold (`"10"`) restarts the game |
| Obstacle gap increased | 280–480px → 500–700px (one obstacle at a time) |
| Speed reduced | Base 4 → 3 px/frame, ramp slowed |

### Arduino files
| File | Status |
|------|--------|
| `demo_game.ino` | Original — Serial only, no BLE |
| `demo_game-2.ino` | Added native BLE, explicit ad packet fix for UUID filtering |
| `demo_game-3.ino` | Added heartbeat, release gate, reduced hold times to 0.5s |
| `demo_game-4.ino` | Current — release gate removed, everything else same as v3 |

### Next: Alert cancel feature
10-second cancellation window after an alert is staged to send in the mobile app.

### Twilio → Textbelt migration
| What | Detail |
|------|--------|
| Root cause | Twilio toll-free number blocked by US carriers without verification; local 10DLC number blocked without A2P 10DLC brand+campaign registration |
| Replacement | Textbelt — no carrier registration, pay-per-text (~$0.01/text), paid API key |
| Files changed | `backend/routes/alerts.ts`, `backend/routes/contacts.ts`, `mobile/src/services/api.ts`, `docker-compose.yml`, `.env.example`, `documentation/CONTEXT.md`, `documentation/Master_Document_Update_Guide.md`, `demov3/index.html` |
| `twilio` npm package | Remove with `npm uninstall twilio` from `backend/` |
| New env var | `TEXTBELT_KEY` in `backend/.env` |

---

## Session Summary (2026-04-19) — Dino Game + Google Slides Controller + Twilio Investigation

### What was done
| Item | File(s) | Notes |
|------|---------|-------|
| Converted Flappy Bird → Dino game | `demov2/index.html` | Chrome dino style — figure runs rightward, cactus obstacles scroll in, jump only works on ground, speed ramps over time, BLE tap = jump |
| Created HTML slideshow | `demov3/index.html` | 6 SoleSignal-themed slides (title, problem, how it works, ML, stack, stats); BLE tap = next slide; Space/arrow keys work too; connection box matches demov1 style |
| Created Google Slides Python controller | `demov3/sensor_slides.py` | Uses bleak + pynput; connects to sensor via Mac Bluetooth; presses right arrow key system-wide on "1"; works with any app in focus (Google Slides, Keynote, PowerPoint) |
| Investigated Twilio SMS failure | — | Three failure modes found: (1) toll-free number format typo, (2) can't send from/to same number, (3) toll-free numbers blocked by US carriers without verification. Fix: buy local 10-digit Twilio number |
| Cleared database | PostgreSQL | All tables wiped to resolve sensor pairing conflict between accounts |

### Twilio Root Cause
`+18339720819` is a toll-free number (1-833 prefix). US carriers block SMS from toll-free numbers without a separate verification process (enforced since 2023). Fix: purchase a regular local number from Twilio console (~$1.15/month) and update `TWILIO_PHONE_NUMBER` in `.env`.

### Google Slides Setup
```bash
pip3 install bleak pynput
python3 demov3/sensor_slides.py
```
macOS requires Accessibility permission for Terminal on first run (System Settings → Privacy & Security → Accessibility).

### BLE Constraint
Sensor can only hold one BLE connection. iPhone app must be fully closed before Chrome or the Python script can connect.

---

## Session Summary (2026-04-13) — demov2 Flappy Bird + demov3 Slideshow (initial)

### What was done
- Created `demov2/index.html`: Flappy Bird with BLE — tap = jump (later converted to Dino game)
- Created `demov3/index.html`: HTML presentation controllable by sensor tap
- Created `demov3/sensor_slides.py`: Python BLE → Google Slides controller

---

## Session Summary (2026-04-06) — Device Testing + Twilio Setup

### What was done
- Full device test session: registered account, paired sensor, added contacts, triggered alerts
- Diagnosed Twilio failures (toll-free number, unverified numbers, same from/to)
- Wireless Xcode documented as the cable-free build path
- Updated IP to 10.75.155.52

---

## Session Summary (2026-04-05) — CNN Training Pipeline + Arduino Firmware Added

### What was added
| Item | File(s) | Notes |
|------|---------|-------|
| CNN training script | `cnn/Solesignal_train_2ch.PY` | Trains a 1D CNN binary classifier on two analog pressure channels (A0, A2) to distinguish tap gesture from normal walking; outputs TFLite model + Arduino header |
| Arduino firmware | `hardware/SoloSignal.ino` | Runs on nRF52840; samples A0+A2 at 20Hz, runs CNN inference on 50-sample sliding windows, uses 3-vote majority before triggering SOS; sends `"SOS"` to Serial (read by BLE module as `"1"` on the characteristic) |
| Baked model weights | `hardware/solesignal_model.h` | Auto-generated C header containing the TFLite model as a byte array + normalization constants (SCALER_MIN_A0, SCALER_RANGE_A0, etc.) |

### How it connects to the rest of the system
- The firmware's `triggerSOS()` prints `"SOS"` to Serial → BLE module writes `"1"` to `TAP_PATTERN_CHARACTERISTIC_UUID`
- The mobile app's `bleService.monitorTapPattern()` decodes the characteristic value and fires `onTapPattern()` when it sees `"1"`
- This is the signal path described in the BLE section of the Master Document Update Guide

### Key parameters
| Constant | Value | Meaning |
|---------|-------|---------|
| `WINDOW_SIZE` | 50 | Number of samples per inference window |
| `STEP` | 25 | Sliding step (50% overlap) |
| `SOS_THRESHOLD` | 0.7 | Minimum CNN confidence to count as a vote |
| `VOTE_COUNT` | 3 | Consecutive high-confidence windows required to trigger SOS |
| `SAMPLE_MS` | 50ms | Sampling interval (20Hz) |

### What is still pending
- Training data (`tap_data.csv`, `normal_data.csv`) not yet in the repo — needed to re-train the model
- `solesignal_model.h` in the repo is the pre-trained version; re-training requires running the Python script

---

## Session Summary (2026-04-05) — Inline Comments Added to All Source Files

### What was done
All 20 backend and mobile source files now have detailed inline comments explaining what each piece of code does, why design decisions were made, and how components connect. Files covered:

**Backend:** `server.ts`, `app.ts`, `types/express.d.ts`, `middleware/auth.ts`, `routes/users.ts`, `routes/sensors.ts`, `routes/contacts.ts`, `routes/alerts.ts`

**Mobile:** `services/api.ts`, `services/ble.ts`, `context/AuthContext.tsx`, `context/BLEContext.tsx`, `theme.ts`, `App.tsx`, `screens/LoginScreen.tsx`, `screens/RegisterScreen.tsx`, `screens/PairingScreen.tsx`, `screens/ContactsScreen.tsx`, `screens/HomeScreen.tsx`, `screens/AlertSentScreen.tsx`

---

## Session Summary (2026-04-04) — Auto-Reconnect + Reanimated Cleanup + Docker + Crow's Foot Fix

### What was done
| Change | File(s) | Notes |
|--------|---------|-------|
| Added auto-reconnect on app load | `mobile/src/screens/HomeScreen.tsx` | On startup, if sensor is paired in DB but BLE not connected, silently attempts `bleService.connect(sensor_id)` with 5s timeout; uses `reconnectAttempted` ref to only try once per session; logs outcome to event log |
| Removed `react-native-reanimated` | `mobile/package.json`, `mobile/babel.config.js` | Incompatible with RN 0.84 Hermes — was already removed from device build but never committed; cleaned up package-lock.json, Podfile.lock, project.pbxproj |
| Fixed ER diagram crow's foot notation | `documentation/SoleSignal_ER_Diagram.excalidraw`, `.png` | Replaced incorrect single ticks with proper `\|\|` (one and only one) on all one-ends; replaced broken fan with proper `\|<` (tick + outward crow's foot) on all many-ends |
| Changed "one-to-one" label to "1:1" | `documentation/SoleSignal_ER_Diagram.excalidraw` | Matches industry standard labeling |
| Updated legend | `documentation/SoleSignal_ER_Diagram.excalidraw` | Now describes `\|\|` and `\|<` symbols correctly |
| Added `backend/Dockerfile` | `backend/Dockerfile` | Node 20 Alpine; installs deps, generates Prisma client |
| Added `backend/entrypoint.sh` | `backend/entrypoint.sh` | Runs `prisma migrate deploy` then starts server via `tsx` |
| Added `backend/.dockerignore` | `backend/.dockerignore` | Excludes node_modules, dist, .env, tests from image |
| Added `docker-compose.yml` | `docker-compose.yml` | Orchestrates backend + postgres:14-alpine; health check ensures DB ready before backend starts; persistent volume for DB data |
| Added `.env.example` | `.env.example` | Documents all required secrets: DB_PASSWORD, JWT_SECRET, TEXTBELT_KEY |

### Known remaining issues
- Auto-reconnect not yet tested on physical device — requires a build with the new code
- Twilio SMS delivery not verified end-to-end on device (alerts create DB records, SMS send path confirmed in tests)

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
| Twilio replaced with Textbelt | SMS uses Textbelt API (`TEXTBELT_KEY`); no A2P 10DLC or toll-free verification needed | Doc references Twilio throughout |
| Reverse geocoding in SMS | Backend calls Nominatim (OpenStreetMap) to convert GPS to human-readable address before building SMS body | Doc does not describe geocoding; SMS format in doc uses raw coords |
| Alert cancel countdown | 10-second overlay shown on both tap and manual trigger; CANCEL button aborts without sending | Doc does not describe any cancel window |
| Alert dispatch stale closure fix | `dispatchAlertRef` pattern used in HomeScreen so `setInterval` always calls latest `dispatchAlert` with current state | Implementation detail not in doc; relevant if maintaining HomeScreen |
| Unpair BLE disconnect | `bleService.disconnect()` called before `clearBLEState()` on unpair — required for ESP32 to resume advertising | Not described in doc; required for sensor to be re-paired after unpair |
| `demo_game-4.ino` | Arduino firmware for demo game; 2-char BLE protocol (`"00"/"01"/"10"/"11"`), name-based advertisement (`"SoleSignal_Game"`) | Not in spec — demo artifact |
| `POST /sensors/pair` response shape | Returns `{ message, sensor_id, id }` where `id` is the DB primary key used in alert requests | Doc does not specify that the DB `id` (separate from `sensor_id`) is returned and required for alerts |
| Test framework | Vitest + Supertest (not Jest) due to TypeScript 6 peer dep conflict | Doc says Jest; switched to Vitest — functionally identical API |
| React Native version | 0.84 (bare CLI) — `react-native-reanimated` removed, incompatible with RN 0.84 Hermes | No specific RN version pinned in the doc |
| Node.js version requirement | Node 20 required — RN 0.84 uses `Array.toReversed()` which fails on Node 18 | Not documented |
| JWT payload field | Uses `user_id` (not `id`) in JWT token payload | Doc describes JWT auth but does not specify the payload field name |
| Alert `delivery_status` values | `pending`, `delivered`, `failed` | Doc mentions delivery status but does not enumerate the exact string values |

---

## Session Summary (2026-04-21) — demov4: Jumping Game + Sole Rhythm Game

### What was added

| File | Description |
|------|-------------|
| `demov4/index1.html` | "Sole Signal Jumping Game" — BLE-connected browser jump game; sensor tap (`"01"` protocol) triggers jump; UUID-based BLE filter (`12345678-...`); keyboard fallback: ENTER = start, SPACE = jump; SoleSignal scarlet theme |
| `demov4/index2.html` | "Sole Rhythm" — two-sensor BLE rhythm game; toe (`"01"`) and heel (`"10"`) map to separate beat lanes; UUID-based BLE filter; keyboard fallback: A = TOE, S = HEEL; SoleSignal scarlet theme |

Both demos use the production SoleSignal BLE service UUID (`12345678-1234-1234-1234-1234567890ab`) and characteristic UUID (`99999999-8888-7777-6666-555555555555`) and include the same BLE connection/disconnect/log UI pattern established in demov1.

---

## Session Summary (2026-04-21) — Documentation + Code Discrepancy Fixes

### Changes made

| Change | File(s) | Notes |
|--------|---------|-------|
| Fixed stale "Twilio" references in stage description | `changelog.md` | Stage 3 description said "sendAlert (Twilio)" — updated to Textbelt |
| Marked Twilio continuity audit item resolved | `changelog.md` | Had been "Open" since 2026-03-25 despite Textbelt migration on 2026-04-20 |
| Marked pending items resolved (Twilio, auto-reconnect) | `changelog.md` | Device Testing 2026-03-30 section; both resolved in later sessions |
| Marked "Known remaining issues" Twilio item resolved | `changelog.md` | Session 2026-03-30 section |
| Marked Stage 6 complete in Next Actions | `changelog.md` | Item 4 was missing strikethrough despite stage being done |
| Fixed stale `delivery_status: 'pending'` test expectations | `backend/tests/alerts.test.ts` | Tests 1 and 2 expected 'pending' but POST /alerts always returns 'delivered' or 'failed' after Textbelt runs; updated to `toContain(['delivered', 'failed'])` |
| Fixed "Twilio" in JSDoc comment | `backend/routes/alerts.ts` | GET /alerts/:id comment said "Twilio attempts" — updated to Textbelt |
| Added GET /sensors/me + DELETE /sensors/me to endpoint table | `documentation/CONTEXT.md` | Table listed 12 endpoints; actual implementation has 14 |
| Updated navigation tech stack entry | `documentation/CONTEXT.md` | Listed `@react-navigation/stack` only; `@react-navigation/native-stack` is also installed and used for the main stack |
| Updated Known Gaps section | `documentation/TEST_RESULTS.md` | Referenced Twilio — updated to Textbelt |
| Updated Test 1 comment | `documentation/TEST_RESULTS.md` | "(Twilio is not yet wired, so all alerts are pending)" was stale |
| Noted Node version discrepancy | `documentation/TEST_RESULTS.md`, `changelog.md` | `mobile/package.json` `engines` field requires `>= 22.11.0` but all session instructions reference Node 20; both versions are functional but the `engines` field should be reconciled |

### Node version discrepancy

`mobile/package.json` currently specifies `"engines": { "node": ">= 22.11.0" }` but all session startup instructions, the Master Document Update Guide, and `.xcode.env.local` reference Node 20. The `Array.toReversed()` call that originally required Node 20 also works on Node 22. Both versions are functional. If using Node 20 via nvm, npm will emit an engine warning but the app still builds and runs correctly.

---

## Decisions

- **Database:** PostgreSQL (per PDF spec) — local Homebrew install for dev (`solesignal` db, port 5432). Prisma migrations in `prisma/migrations/`.
- **JWT:** 24hr expiry, no refresh token, stateless logout (client deletes token)
- **Ownership:** `user_id` always extracted from JWT token, never from request body
- **Password:** bcryptjs (cross-platform), minimum 8 characters per spec
- **SMS:** Textbelt API (replaced Twilio — see session summary 2026-04-20)
- **Type safety:** `@types/*` packages installed; Express Request extended via `types/express.d.ts`

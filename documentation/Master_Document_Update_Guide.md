# SoleSignal — Master Document Update Guide

This document is a comprehensive list of everything built during MVP implementation that is either **missing from**, **incorrect in**, or **needs to be added to** the Software Documentation Master PDF. It is organized by section to match the structure of the existing document. Use this as a line-by-line guide when updating the master source file.

---

## 1. MVP Definition (Page 1)

**Add under "Backend":**
- The backend is implemented as a REST API using Node.js, Express, and TypeScript
- The database is PostgreSQL, managed via Prisma ORM
- The mobile app is React Native (bare CLI), iOS only for MVP
- Twilio API is used for SMS delivery (option A was selected)

---

## 2. Software System Architecture (Pages 8–9)

### Add: Technology Stack

Add a new subsection after "Basic Architectural Components":

**Backend**
- Runtime: Node.js 20 (required — RN 0.84 uses `Array.toReversed()` which fails on Node 18)
- Framework: Express v5
- Language: TypeScript 6
- ORM: Prisma (manages schema, migrations, and DB queries — raw SQL is not used directly)
- Database: PostgreSQL 14
- HTTP Logger: Morgan
- Password Hashing: bcryptjs (minimum 8 characters enforced)
- JWT Library: jsonwebtoken (24-hour expiry, HS256 algorithm)
- SMS: Twilio Node SDK

**Mobile**
- Framework: React Native 0.84 (bare CLI)
- Platform: iOS only (MVP)
- BLE Library: react-native-ble-plx
- Secure Storage: react-native-keychain (iOS Keychain)
- GPS: @react-native-community/geolocation
- Navigation: @react-navigation/native-stack
- HTTP Client: Axios

### Add: Backend File Structure

```
backend/
  server.ts          — Entry point; calls app.listen()
  app.ts             — Express app definition; imported by tests
  middleware/
    auth.ts          — JWT validation middleware; attaches user_id to req.user
  routes/
    users.ts         — POST /users/register, POST /users/login, PATCH /users/{id}, POST /users/logout
    sensors.ts       — POST /sensors/pair, GET /sensors/{id}, GET /sensors/me, DELETE /sensors/me
    contacts.ts      — POST /contacts, GET /contacts, PATCH /contacts/{id}, DELETE /contacts/{id}
    alerts.ts        — POST /alerts, GET /alerts/{id}
  types/
    express.d.ts     — Extends Express Request to include req.user.user_id
  prisma/
    schema.prisma    — Prisma schema (source of truth for DB structure)
    migrations/      — Migration history managed by Prisma
```

### Add: Mobile App Screens

The UI/UX module contains the following screens:

| Screen | Route Name | Description |
|--------|-----------|-------------|
| RegisterScreen | Register | Email, name, phone, password form; calls POST /users/register |
| LoginScreen | Login | Email + password form; calls POST /users/login |
| HomeScreen | Home | Sensor status dot, event log, Send Alert button, Reconnect/Unpair actions |
| PairingScreen | Pairing | BLE scan + connect; calls POST /sensors/pair |
| ContactsScreen | Contacts | List, add, edit, delete contacts |
| AlertSentScreen | AlertSent | Confirmation screen showing alert ID after dispatch |

**Onboarding flow:** Register → Pair → Contacts → Home (enforced by navigation)

---

## 3. API Specification (Pages 23–35)

### 3.1 Endpoint Overview Table — Add Two Missing Endpoints

The following two endpoints are implemented but not listed in the table:

| Method | URI | Operation Name | Use Case |
|--------|-----|---------------|----------|
| GET | /sensors/me | getMySensor() | UC-2: Pair Sensor with User Account |
| DELETE | /sensors/me | unpairSensor() | (New — not in original use cases) |

The full table should have 14 endpoints, not 12.

---

### 3.2 Corrections to Existing Endpoint Specs

#### pairSensor() — POST /sensors/pair

**Input Arguments — correction:**
The document lists `{ "sensor_id": string, "user_id": integer }`. The `user_id` field in the request body is not used. `user_id` is extracted from the JWT token by the auth middleware. The actual input is:
```json
{ "sensor_id": string }
```

**Return Data — correction:**
The document lists `{ "message": string, "sensor_id": string }`. The actual response also includes the database primary key `id`, which is a separate field from `sensor_id`. The actual response is:
```json
{ "message": "Sensor paired successfully", "sensor_id": string, "id": integer }
```
The `id` field (the database primary key) is **critical** — the mobile app uses it as the `sensor_id` argument when calling POST /alerts. Without it, alert creation fails.

---

#### addContact() — POST /contacts

**Input Arguments — correction:**
The document lists `{ "user_id": integer, "name": string, "phone_number": string }`. The `user_id` is extracted from the JWT token, not the request body. The actual input is:
```json
{ "name": string, "phone_number": string }
```

---

#### getContacts() — GET /contacts

**Input Arguments — correction:**
The document says "Query parameter: user_id (integer)". No query parameter is used. The user is identified via JWT token.

**Return Data — correction:**
The document shows a flat JSON array. The actual response is a wrapped object:
```json
{ "contacts": [ { "id": integer, "name": string, "phone_number": string, "is_valid": boolean }, ... ] }
```

**HTTP Status Codes — correction:**
The document lists 404 if no contacts are found. The actual implementation returns `200 OK` with an empty contacts array `{ "contacts": [] }` — returning 404 on an empty list caused the mobile app to treat it as an error.

---

#### sendAlert() — POST /alerts

**Input Arguments — correction:**
The document lists `"user_id": integer` in the request body. This field is not accepted from the client. `user_id` is extracted from the JWT token. The actual input is:
```json
{
  "sensor_id": integer,
  "contact_id": integer,
  "gps_latitude": decimal,
  "gps_longitude": decimal,
  "location_available": boolean
}
```
Note: `sensor_id` here is the **database primary key** (`id` field returned from pairSensor), not the hardware `sensor_id` string.

---

### 3.3 New Endpoint Specs — Add These Two Pages

#### getMySensor() — GET /sensors/me

| Field | Description |
|-------|-------------|
| Operation Name | getMySensor() |
| Resource | sensors |
| HTTP Method | GET |
| URI | /sensors/me |
| User Role | Registered User |
| Use Case ID | UC-2: Pair Sensor with User Account |
| Input Arguments | None (user identified via JWT token) |
| Input Validation | Authorization header required |
| Return Data | `{ "id": integer, "sensor_id": string, "is_paired": boolean, "is_calibrating": boolean, "last_connected": timestamp }` |
| HTTP Status Codes | 200 OK: sensor found. 404 Not Found: user has no paired sensor. 401 Unauthorized: missing or invalid token. |
| Third Party API? | No |

Example Request:
```
GET /sensors/me
Authorization: Bearer <token>
```
Example Response:
```json
{ "id": 1, "sensor_id": "B70FA814-...", "is_paired": true, "is_calibrating": false, "last_connected": "2026-03-30T14:00:00Z" }
```

Why this endpoint exists: The mobile app cannot call GET /sensors/{id} on startup because it does not know the sensor's database ID after a fresh install. This endpoint allows the app to retrieve the sensor record using only the JWT token.

---

#### unpairSensor() — DELETE /sensors/me

| Field | Description |
|-------|-------------|
| Operation Name | unpairSensor() |
| Resource | sensors |
| HTTP Method | DELETE |
| URI | /sensors/me |
| User Role | Registered User |
| Use Case ID | (No existing use case — new capability) |
| Input Arguments | None (user identified via JWT token) |
| Input Validation | Authorization header required |
| Return Data | `{ "message": "Sensor unpaired successfully" }` |
| HTTP Status Codes | 200 OK: sensor unpaired and deleted. 404 Not Found: no sensor to unpair. 401 Unauthorized. |
| Third Party API? | No |

Example Request:
```
DELETE /sensors/me
Authorization: Bearer <token>
```
Example Response:
```json
{ "message": "Sensor unpaired successfully" }
```

Behavior: The sensor record is **deleted** from the database (not just marked unpaired). All alerts associated with that sensor are cascade-deleted. The mobile app clears local BLE state after a successful call.

---

## 4. Server-Side Routing (Pages 36–40)

### Corrections

**pairSensor() routing — correction:**
The document says the controller validates `sensor_id` and `user_id`. The `user_id` comes from the JWT token (injected by auth middleware as `req.user.user_id`), not from the request body. The controller only reads `sensor_id` from `req.body`.

**getContacts() routing — correction:**
The document says the frontend sends `user_id` as a query parameter. In the actual implementation, the controller reads `user_id` from `req.user.user_id` (JWT). No query parameter is used.

**sendAlert() routing — correction:**
The document says the frontend sends `user_id` in the request body. In the actual implementation, `user_id` is read from `req.user.user_id` (JWT). It is not accepted from the request body.

### Add: Auth Middleware

Add a section describing how the auth middleware works:

All protected endpoints pass through `middleware/auth.ts` before the controller runs. The middleware:
1. Reads the `Authorization` header and extracts the Bearer token
2. Verifies the token signature using the `JWT_SECRET` environment variable
3. Decodes the token payload and attaches `req.user = { user_id, email }`
4. If the token is missing, malformed, or expired, returns 401 immediately

Controllers never need to manually verify the token — they simply read `req.user.user_id` to identify the authenticated user.

### Add: getMySensor() Routing

Frontend Call: The sensor service sends a GET request to /sensors/me.
Route Definition: The sensor router maps GET /sensors/me to the getMySensor() controller function.
Controller Logic: The controller reads user_id from the JWT token and retrieves the sensor record where `user_id` matches.
Database Interaction:
```sql
SELECT id, sensor_id, is_paired, is_calibrating, last_connected
FROM sensors
WHERE user_id = {user_id}
```
Response: Returns 200 with the sensor object. Returns 404 if no sensor is found for this user.

### Add: unpairSensor() Routing

Frontend Call: The sensor service sends a DELETE request to /sensors/me.
Route Definition: The sensor router maps DELETE /sensors/me to the unpairSensor() controller function.
Controller Logic: The controller reads user_id from the JWT token, finds the sensor record belonging to that user, and deletes it. Associated alert records are cascade-deleted by the database foreign key constraint.
Database Interaction:
```sql
DELETE FROM sensors WHERE user_id = {user_id}
```
Response: Returns 200 on success. Returns 404 if no sensor is found for this user.

---

## 5. Authentication and Session Management (Pages 41–42)

The existing section is mostly correct. Add/correct the following:

### Add: Ownership Enforcement Detail

All controllers extract `user_id` exclusively from the validated JWT token (`req.user.user_id`). Any `user_id` field passed in the request body is **ignored**. This applies to all endpoints including `pairSensor`, `addContact`, `sendAlert`, and all GET/PATCH/DELETE endpoints. This prevents users from acting on behalf of other users even if they pass a different `user_id` in the request body.

### Add: Protected Endpoints — Add New Endpoints

Update the Protected vs. Unprotected Endpoints table:

| Endpoint | Protected |
|----------|-----------|
| POST /users/register | No |
| POST /users/login | No |
| PATCH /users/{id} | Yes |
| POST /users/logout | Yes |
| POST /sensors/pair | Yes |
| GET /sensors/{id} | Yes |
| **GET /sensors/me** | **Yes** |
| **DELETE /sensors/me** | **Yes** |
| POST /contacts | Yes |
| GET /contacts | Yes |
| PATCH /contacts/{id} | Yes |
| DELETE /contacts/{id} | Yes |
| POST /alerts | Yes |
| GET /alerts/{id} | Yes |

---

## 6. Database Schema (Pages 21–22)

### Schema Management — Add

The database schema is not managed via raw `CREATE TABLE` statements in production. It is managed by **Prisma ORM**. The source of truth is `backend/prisma/schema.prisma`. Migrations are generated and applied using:
- Development: `npx prisma migrate dev`
- Production: `npx prisma migrate deploy` (runs automatically on Docker startup)

The CREATE TABLE statements in the document are accurate as a conceptual reference, but the Prisma schema is what is actually applied to the database.

### Correction: GPS Column Type

The document specifies `NUMERIC(9,6)` for `gps_latitude` and `gps_longitude`. The Prisma schema uses `Float` (PostgreSQL `DOUBLE PRECISION`). The behavior is equivalent for this application's precision needs.

### Add: Cascade Delete Behavior

When a sensor record is deleted (via DELETE /sensors/me), all alert records referencing that sensor via `sensor_id` foreign key are **cascade-deleted**. This is enforced at the database level via Prisma's `onDelete: Cascade` directive on the alerts → sensors relation.

### Correction: Table Name

The document's `alerts` CREATE TABLE references `emergency_contacts(id)` for `contact_id`. The actual table is named `emergency_contacts` in the Prisma schema but the API and code refer to it as `contacts`. Both refer to the same table.

---

## 7. BLE Integration — Add New Section

This section is entirely absent from the current document. Add it after the API Specification section (or as an appendix).

### BLE Service Identifiers

These UUIDs were provided by the firmware team and are hardcoded in the mobile app:

| Identifier | UUID |
|-----------|------|
| Service UUID | `12345678-1234-1234-1234-1234567890ab` |
| Characteristic UUID | `99999999-8888-7777-6666-555555555555` |

The BLE scan filters exclusively for devices advertising the Service UUID above. Devices not advertising this UUID are not shown in the pairing list.

### Tap Pattern Protocol

The firmware communicates tap status via BLE characteristic notifications on the characteristic UUID above:

| Value (decoded) | Meaning |
|----------------|---------|
| `"0"` | Normal state — continuous heartbeat |
| `"1"` | Emergency tap pattern confirmed by firmware |

Values are transmitted as base64-encoded ASCII strings (standard react-native-ble-plx encoding). The mobile app decodes each notification using `atob()` and only triggers an alert when the decoded value is exactly `"1"`. All other values are logged to the event log but do not trigger an alert.

The firmware performs all tap pattern validation (force threshold, count, timing window) before sending `"1"`. The mobile app does not re-validate — it trusts the `"1"` signal as confirmation of a valid pattern.

### BLE Connection Flow

1. App scans for devices advertising Service UUID (10 second scan window)
2. User selects device from list
3. App connects and discovers all services and characteristics
4. App calls POST /sensors/pair with the BLE device ID as `sensor_id`
5. Backend returns database record `id` (separate from BLE device ID)
6. App stores the live device object + database `id` in BLEContext (in-memory)
7. App begins monitoring the characteristic for notifications

### Auto-Reconnect Behavior

On app load, if a sensor is paired in the database but not connected in the current session:
1. App calls GET /sensors/me to retrieve the stored `sensor_id` (BLE device UUID)
2. App silently attempts `bleService.connect(sensor_id)` with a 5-second timeout
3. On success: BLE monitoring begins automatically
4. On failure (device not in range): user sees yellow status dot and can tap "Reconnect" to go to the Pairing screen

### Disconnect Handling

If the sensor disconnects while the app is running:
- The `onDisconnected` listener fires immediately
- The status dot updates to yellow
- The event log shows "Sensor disconnected unexpectedly"
- BLE context is cleared; the user must reconnect via Pairing screen

### Alert Dispatch Behavior (Mobile Side)

When a tap pattern is detected (`"1"` received):
1. An `alertInProgress` guard is set immediately to prevent duplicate alerts
2. Alert popup shown to user: "Tap pattern detected — Sending emergency alert"
3. One-shot GPS request fired (3 second timeout; graceful fallback if unavailable)
4. Device vibrates: `[0, 500ms, 200ms, 500ms]` pattern
5. POST /alerts called
6. App navigates to AlertSent screen showing the alert ID
7. `alertInProgress` guard released

Manual SEND ALERT button follows the same flow but shows an error dialog if the sensor is not paired or no contact exists.

---

## 8. Use Case Corrections (Pages 11–16)

### UC-1: Register User Account — Correction

The main success scenario (steps 4–5) describes sending and entering a verification code:
> "4. The system sends a verification code via email or SMS."
> "5. The user enters the verification code."

**This is not implemented in the MVP.** The `is_verified` field defaults to `false` on registration and is never updated to `true` in the current system. Email/SMS verification is a non-MVP feature. Remove or mark these steps as a future enhancement.

### UC-5: Detect Emergency Tap Pattern — Correction

Step 6 states:
> "6. The sensor provides haptic feedback to notify the user of successful detection."

**The sensor does not provide haptic feedback.** The mobile app provides vibration feedback via the phone's `Vibration` API after dispatching the alert (`[0, 500ms, 200ms, 500ms]` pattern). The sensor itself has no haptic actuator in the current MVP hardware.

---

## 9. Test Framework — Correction

The document references Jest. The actual test framework is **Vitest + Supertest**. The switch was made due to a peer dependency conflict between ts-jest and TypeScript 6.

**Test summary:**

| File | Count | Coverage |
|------|-------|----------|
| tests/users.test.ts | 14 | register, login, update profile, logout |
| tests/contacts.test.ts | 11 | add, get, update, delete contacts |
| tests/sensors.test.ts | 9 | pair, GET /me, GET /{id} |
| tests/alerts.test.ts | 11 | send alert (with/without GPS), get alert status |
| **Total** | **45** | |

Run command: `npm test` from `backend/`

The `app.ts`/`server.ts` split exists specifically to support testing — `app.ts` exports the Express app without starting the server, allowing Supertest to import it directly.

---

## 10. Deployment — Add New Section

This section is entirely absent from the current document.

### Docker

The backend is containerized using Docker. The following files are included in the repository:

| File | Purpose |
|------|---------|
| `backend/Dockerfile` | Builds the backend image on Node 20 Alpine |
| `backend/entrypoint.sh` | Runs `prisma migrate deploy` then starts server via `tsx` |
| `backend/.dockerignore` | Excludes node_modules, dist, .env, tests from image |
| `docker-compose.yml` | Orchestrates backend + postgres:14-alpine |
| `.env.example` | Documents all required environment variables |

### Running with Docker

```bash
cp .env.example .env
# Fill in .env with real values (see below)
docker-compose up --build
```

Backend is available at `http://localhost:3000`. Database migrations run automatically on startup.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret key for signing JWTs (use a long random string) |
| `TWILIO_ACCOUNT_SID` | Twilio account SID (from console.twilio.com) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Twilio phone number used as SMS sender |
| `DB_PASSWORD` | PostgreSQL password (Docker only) |

### Local Development (without Docker)

Prerequisites:
- Node.js 20 (required — will fail on Node 18)
- PostgreSQL 14 (via Homebrew: `brew services start postgresql@14`)

```bash
cd backend
npm install
npx prisma migrate dev
npm run dev       # starts server on port 3000
```

---

## 11. Additional Implementation Notes

### Phone Number Format

`POST /contacts` validates phone numbers against the E.164 format (`+` followed by country code and digits, e.g. `+17321234567`). Plain 10-digit numbers without country code are rejected.

### Twilio SMS Message Format

The SMS sent to the emergency contact includes:
- Alert ID
- User's name
- GPS coordinates (if available) or "Location unavailable"
- Timestamp

Twilio SMS delivery is retried up to 3 times (per NFR-5) with a short delay between attempts. `delivery_status` is set to `pending` on alert creation, `delivered` on success, or `failed` after exhausting retries.

### React Native — iOS Specific Notes

- Minimum iOS version: iOS 14
- Bluetooth and Location (When In Use) permissions declared in `ios/SoleSignalMobile/Info.plist`
- Node 20 path must be hardcoded in `mobile/ios/.xcode.env.local` for Xcode build phase to resolve the correct Node binary (nvm is not available in Xcode's build environment)
- `react-native-reanimated` is not included — it is incompatible with React Native 0.84 Hermes headers

### Metro Bundler (Development)

When developing on a physical device, the device must point to the Mac's local IP for the Metro bundler:
- Shake device → Settings → Custom bundler address
- Enter the Mac's `en0` IP address, port `8081`, entrypoint `index.js`

The backend's `BASE_URL` in `mobile/src/services/api.ts` must also be updated to the Mac's current IP each session, as campus/home network IPs change between sessions.

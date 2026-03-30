# SoleSignal API Test Results

**Date:** 2026-03-30
**Test runner:** Vitest 3.2.4 + Supertest 7.2.2
**Result:** 45 tests, 4 files — all passing in 2.15s
**Run command:** `npm test` from `backend/`

---

## Setup and Architecture

### Why Vitest instead of Jest

The spec originally called for Jest + Supertest. During setup, `ts-jest` (the TypeScript adapter for Jest) raised a peer dependency conflict with TypeScript 6.0 — `ts-jest` requires TypeScript < 6. Rather than downgrade TypeScript, we switched to **Vitest**, which has native ESM and TypeScript support with no peer dep conflicts. The test API (`describe`, `it`, `expect`, `beforeAll`, `afterAll`) is identical to Jest.

### Why app.ts was extracted from server.ts

Supertest needs to import the Express app object directly — it starts and stops its own internal HTTP server per test. The original `server.ts` both created the app and called `app.listen()`, which would start a real server on port 3000 every time the test file was imported.

**Fix:** Split into two files:
- `backend/app.ts` — creates and exports the Express app (no listen)
- `backend/server.ts` — imports the app, calls `app.listen()`

Tests import from `app.ts`. The running dev server is unaffected.

### Test isolation strategy

Each test file creates its own test user with a unique email (`testuser_${Date.now()}@solesignal.test`). All test data lives under that user account. In `afterAll`, the test user is deleted — because all Prisma relations use `onDelete: Cascade`, this automatically removes all sensors, contacts, and alerts created during the test run. No manual rollback logic is needed per test.

### Vitest config

`vitest.config.ts` sets `pool: 'forks'` with `singleFork: true` to run test files sequentially. This prevents DB contention between suites that share the same PostgreSQL instance.

---

## Test File: users.test.ts

**14 tests**

This file covers the full user lifecycle: registration, login, profile update, and logout.

---

### POST /users/register

#### Test 1 — registers a new user successfully
**Why:** Core happy path. Verifies the endpoint creates a user in the DB and returns the correct shape.
**How:** Sends `{ name, email, phone_number, password }` with a unique email. Checks for HTTP 201 and `{ message: "Registration successful", user_id: <number> }`.
**Result:** ✅ 201 returned, `user_id` present in response.

#### Test 2 — rejects duplicate email
**Why:** The DB has a unique constraint on `email`. The API must return a clear error rather than a 500.
**How:** Sends the same email a second time. Checks for HTTP 409.
**Result:** ✅ 409 returned with `error` field.

#### Test 3 — rejects missing required fields
**Why:** Validates that the endpoint enforces required fields rather than silently writing null values to the DB.
**How:** Sends only `{ email }` with no name, phone, or password. Checks for HTTP 400.
**Result:** ✅ 400 returned with `error` field.

#### Test 4 — rejects password shorter than 8 characters
**Why:** Per spec, minimum password length is 8 characters.
**How:** Sends a valid body but with `password: "abc"` (3 chars). Checks for HTTP 400 and that the error message mentions "8 characters".
**Result:** ✅ 400 returned, error message matches `/8 characters/`.

---

### POST /users/login

#### Test 5 — logs in with correct credentials
**Why:** Core happy path. Verifies a valid JWT is returned on successful login.
**How:** Uses the email/password from the registration test. Checks for HTTP 200 and presence of `token` in the response. Saves the token for subsequent tests.
**Result:** ✅ 200 returned, JWT token present.

#### Test 6 — rejects wrong password
**Why:** Security boundary — must not return a token for incorrect credentials.
**How:** Sends correct email but `password: "wrongpassword"`. Checks for HTTP 401.
**Result:** ✅ 401 returned with `error` field.

#### Test 7 — rejects non-existent email
**Why:** Must not leak whether an email exists. Returns same 401 shape as wrong password.
**How:** Sends an email that was never registered. Checks for HTTP 401.
**Result:** ✅ 401 returned with `error` field.

#### Test 8 — rejects missing fields
**Why:** Ensures the endpoint validates input before attempting a DB lookup.
**How:** Sends `{ email }` with no password. Checks for HTTP 400.
**Result:** ✅ 400 returned with `error` field.

---

### PATCH /users/:id

#### Test 9 — updates own profile successfully
**Why:** Core happy path for profile editing.
**How:** Sends `{ name: "Updated Name" }` to `/users/<own_id>` with a valid JWT. Checks for HTTP 200 and success message.
**Result:** ✅ 200 returned.

#### Test 10 — rejects update of another user's profile
**Why:** Ownership enforcement — users must not be able to edit each other's profiles. The endpoint checks that the token's `user_id` matches the URL param.
**How:** Sends a PATCH to `/users/<own_id + 9999>` (a different user's ID) with the test user's token. Checks for HTTP 403.
**Result:** ✅ 403 returned with `error` field.

#### Test 11 — rejects unauthenticated request
**Why:** The endpoint is JWT-protected. Requests without a token must be rejected.
**How:** Sends a PATCH with no `Authorization` header. Checks for HTTP 401.
**Result:** ✅ 401 returned with `error` field.

#### Test 12 — rejects update with no fields provided
**Why:** A PATCH with an empty body is a no-op and should be explicitly rejected.
**How:** Sends `{}` as the body with a valid token. Checks for HTTP 400.
**Result:** ✅ 400 returned with `error` field.

---

### POST /users/logout

#### Test 13 — logs out with a valid token
**Why:** Verifies the logout endpoint responds correctly. Since logout is stateless (client deletes its token), the server just confirms the token was valid.
**How:** Sends a POST with the valid JWT. Checks for HTTP 200 and `{ message: "Logged out successfully" }`.
**Result:** ✅ 200 returned.

#### Test 14 — rejects logout without a token
**Why:** The logout route is protected — an unauthenticated call should still be rejected.
**How:** Sends a POST with no `Authorization` header. Checks for HTTP 401.
**Result:** ✅ 401 returned with `error` field.

---

## Test File: contacts.test.ts

**11 tests**

This file covers the full emergency contact lifecycle: create, read (empty and populated), update, and delete. A test user is registered and logged in in `beforeAll`.

---

### GET /contacts (before adding any)

#### Test 1 — returns empty list for a new user
**Why:** A critical bug was found during device testing where the backend returned HTTP 404 for an empty contact list. This caused the mobile app's catch block to swallow the response, leaving the contacts screen blank. This test locks in the correct behavior: 200 with an empty array.
**How:** Calls `GET /contacts` immediately after account creation (no contacts added). Checks for HTTP 200 and `{ contacts: [] }`.
**Result:** ✅ 200 returned, `contacts` is an empty array.

---

### POST /contacts

#### Test 2 — adds a contact successfully
**Why:** Core happy path. Verifies a contact is created and a `contact_id` is returned.
**How:** Sends `{ name: "Emergency Bob", phone_number: "+15553334444" }` with a valid JWT. Checks for HTTP 201 and `{ message: "Contact added successfully", contact_id: <number> }`. Saves the `contact_id` for subsequent tests.
**Result:** ✅ 201 returned, `contact_id` present.

#### Test 3 — rejects missing name
**Why:** Both name and phone number are required fields per spec.
**How:** Sends only `{ phone_number }`. Checks for HTTP 400.
**Result:** ✅ 400 returned with `error` field.

#### Test 4 — rejects invalid phone number format
**Why:** The backend validates phone numbers against a regex. Invalid formats must be rejected before reaching the DB.
**How:** Sends `{ name: "Bad Phone", phone_number: "notaphone" }`. Checks for HTTP 400 and that the error mentions "phone".
**Result:** ✅ 400 returned, error matches `/phone/i`.

#### Test 5 — rejects unauthenticated request
**Why:** Contacts are user-owned resources. The endpoint is JWT-protected.
**How:** Sends a POST with no `Authorization` header. Checks for HTTP 401.
**Result:** ✅ 401 returned with `error` field.

---

### GET /contacts (after adding)

#### Test 6 — returns contacts list after adding
**Why:** Verifies the `{ contacts: [...] }` wrapper shape — another bug found during device testing was that the backend previously returned a flat array `[...]` instead of `{ contacts: [...] }`, which broke the mobile app.
**How:** Calls `GET /contacts` after adding a contact. Checks for HTTP 200, a non-empty `contacts` array, and that each contact has `id`, `name`, `phone_number`, and `is_valid` fields.
**Result:** ✅ 200 returned, correct shape confirmed.

---

### PATCH /contacts/:id

#### Test 7 — updates a contact successfully
**Why:** Core happy path for contact editing.
**How:** Sends `{ name: "Updated Bob" }` to `/contacts/<contact_id>` with a valid JWT. Checks for HTTP 200.
**Result:** ✅ 200 returned.

#### Test 8 — rejects update with no fields provided
**Why:** A PATCH with an empty body is a no-op.
**How:** Sends `{}` with a valid token. Checks for HTTP 400.
**Result:** ✅ 400 returned with `error` field.

#### Test 9 — returns 404 for contact not owned by user
**Why:** Ownership enforcement — users must not be able to edit each other's contacts.
**How:** Sends a PATCH to `/contacts/<contact_id + 9999>` (does not belong to this user). Checks for HTTP 404.
**Result:** ✅ 404 returned with `error` field.

---

### DELETE /contacts/:id

#### Test 10 — deletes a contact successfully
**Why:** Core happy path for contact deletion.
**How:** Sends a DELETE to `/contacts/<contact_id>` with a valid JWT. Checks for HTTP 200.
**Result:** ✅ 200 returned.

#### Test 11 — returns 404 when deleting an already-deleted contact
**Why:** Idempotency check — a second delete on the same ID should return 404, not 500.
**How:** Repeats the DELETE on the same `contact_id`. Checks for HTTP 404.
**Result:** ✅ 404 returned with `error` field.

---

## Test File: sensors.test.ts

**9 tests**

This file covers sensor pairing and status retrieval. Two users are registered in `beforeAll` to test ownership boundaries.

---

### GET /sensors/me (before pairing)

#### Test 1 — returns 404 when no sensor is paired
**Why:** A user with no sensor should get a clear 404, not a 500 or an empty object.
**How:** Calls `GET /sensors/me` before any pairing. Checks for HTTP 404.
**Result:** ✅ 404 returned with `error` field.

---

### POST /sensors/pair

#### Test 2 — pairs a sensor successfully
**Why:** Core happy path. Verifies a sensor is created in the DB and both the `sensor_id` (BLE peripheral ID) and `id` (DB primary key) are returned. The DB `id` is what the mobile app stores and sends in alert requests.
**How:** Sends `{ sensor_id: "SENSOR-TEST-<timestamp>" }` with a valid JWT. Checks for HTTP 200, correct `sensor_id`, and presence of `id`. Saves `id` as `sensorDbId`.
**Result:** ✅ 200 returned, both IDs present.

#### Test 3 — rejects missing sensor_id
**Why:** sensor_id is required — the endpoint must validate input.
**How:** Sends `{}` with a valid JWT. Checks for HTTP 400.
**Result:** ✅ 400 returned with `error` field.

#### Test 4 — rejects pairing a sensor already claimed by another user
**Why:** Per spec (C-1), one sensor can only be linked to one user at a time. This test verifies the 409 conflict response.
**How:** The second test user attempts to pair the same `sensor_id` that was already paired by the first user. Checks for HTTP 409.
**Result:** ✅ 409 returned with `error` field.

#### Test 5 — rejects unauthenticated request
**Why:** The endpoint is JWT-protected.
**How:** Sends a POST with no `Authorization` header. Checks for HTTP 401.
**Result:** ✅ 401 returned with `error` field.

---

### GET /sensors/me (after pairing)

#### Test 6 — returns the paired sensor for the authenticated user
**Why:** Verifies the endpoint returns the correct sensor and shape after pairing.
**How:** Calls `GET /sensors/me` after pairing. Checks for HTTP 200, `sensor_id`, `is_paired: true`, `is_calibrating`, and `id` matching `sensorDbId`.
**Result:** ✅ 200 returned, all fields correct.

---

### GET /sensors/:id

#### Test 7 — returns sensor status by DB id
**Why:** The mobile app uses the DB `id` (not the BLE `sensor_id`) to fetch sensor status. Verifies the endpoint returns the correct data.
**How:** Sends `GET /sensors/<sensorDbId>` with the owner's token. Checks for HTTP 200, `sensor_id`, and `is_paired: true`.
**Result:** ✅ 200 returned.

#### Test 8 — returns 404 when sensor belongs to another user
**Why:** Ownership enforcement — users must not be able to read each other's sensor data.
**How:** The second user sends `GET /sensors/<sensorDbId>` (belongs to the first user). Checks for HTTP 404.
**Result:** ✅ 404 returned with `error` field.

#### Test 9 — returns 400 for an invalid (non-numeric) sensor ID
**Why:** The endpoint parses the ID with `parseInt`. A non-numeric path param would produce `NaN`, which must be caught before any DB query.
**How:** Sends `GET /sensors/abc`. Checks for HTTP 400.
**Result:** ✅ 400 returned with `error` field.

---

## Test File: alerts.test.ts

**11 tests**

This file covers alert creation and retrieval. It runs a full setup in `beforeAll`: register user, pair sensor, add contact — then tests the alert endpoints against that state. A second user is also registered for ownership boundary tests.

---

### POST /alerts

#### Test 1 — creates an alert record with location
**Why:** Core happy path with GPS coordinates. Verifies the alert is created in the DB and returns `alert_id` and `delivery_status: "pending"` (Twilio is not yet wired, so all alerts are pending).
**How:** Sends `{ sensor_id, contact_id, gps_latitude: 40.7128, gps_longitude: -74.006, location_available: true }` with a valid JWT. Checks for HTTP 201, `alert_id`, and `delivery_status: "pending"`. Saves `alertId`.
**Result:** ✅ 201 returned, fields correct.

#### Test 2 — creates an alert record without location
**Why:** The GPS module has a 3-second timeout and gracefully falls back when location is unavailable. The backend must accept `location_available: false` without requiring coordinates.
**How:** Sends `{ sensor_id, contact_id, location_available: false }` with no GPS fields. Checks for HTTP 201.
**Result:** ✅ 201 returned.

#### Test 3 — rejects alert when location_available is true but coordinates are missing
**Why:** If `location_available: true` is sent but no GPS values are provided, the backend should reject the request rather than writing null coordinates to the DB when the client claimed they were available.
**How:** Sends `{ sensor_id, contact_id, location_available: true }` with no `gps_latitude`/`gps_longitude`. Checks for HTTP 400.
**Result:** ✅ 400 returned with `error` field.

#### Test 4 — rejects alert for a sensor belonging to another user
**Why:** A user must not be able to trigger an alert using another user's sensor. The backend looks up the sensor and checks ownership before creating the alert record.
**How:** The second user sends a POST with the first user's `sensorDbId`. Checks for HTTP 404.
**Result:** ✅ 404 returned with `error` field.

#### Test 5 — rejects alert for a contact belonging to another user
**Why:** Same ownership principle — a user must not be able to target another user's emergency contact.
**How:** The second user sends a POST with the first user's `contactId` (and also the first user's sensor, so the 404 comes from the sensor check first). Checks for HTTP 404.
**Result:** ✅ 404 returned with `error` field.

#### Test 6 — rejects missing required fields
**Why:** `sensor_id`, `contact_id`, and `location_available` are all required. Sending only `sensor_id` must be rejected before any DB work.
**How:** Sends `{ sensor_id }` only. Checks for HTTP 400.
**Result:** ✅ 400 returned with `error` field.

#### Test 7 — rejects unauthenticated request
**Why:** The endpoint is JWT-protected.
**How:** Sends a full valid body with no `Authorization` header. Checks for HTTP 401.
**Result:** ✅ 401 returned with `error` field.

---

### GET /alerts/:id

#### Test 8 — returns alert status for own alert
**Why:** Core happy path. Verifies the correct shape is returned for an alert owned by the requesting user.
**How:** Sends `GET /alerts/<alertId>` with the owner's token. Checks for HTTP 200, `alert_id`, `delivery_status`, `retry_count`, and `timestamp`.
**Result:** ✅ 200 returned, all fields present.

#### Test 9 — returns 404 for alert belonging to another user
**Why:** Ownership enforcement — users must not be able to read each other's alert records.
**How:** The second user sends `GET /alerts/<alertId>` (alert belongs to first user). Checks for HTTP 404.
**Result:** ✅ 404 returned with `error` field.

#### Test 10 — returns 400 for non-numeric alert ID
**Why:** Same as sensors — `parseInt("abc")` produces `NaN`, which must be caught explicitly.
**How:** Sends `GET /alerts/abc`. Checks for HTTP 400.
**Result:** ✅ 400 returned with `error` field.

#### Test 11 — returns 404 for non-existent alert ID
**Why:** A valid numeric ID that doesn't exist in the DB should return 404, not 500.
**How:** Sends `GET /alerts/999999999`. Checks for HTTP 404.
**Result:** ✅ 404 returned with `error` field.

---

## Full Results Summary

```
 Test Files  4 passed (4)
      Tests  45 passed (45)
   Start at  15:45:16
   Duration  2.15s (transform 66ms, setup 0ms, collect 765ms, tests 1.23s, environment 0ms, prepare 37ms)
```

| File | Tests | Result |
|------|-------|--------|
| tests/users.test.ts | 14 | ✅ All passing |
| tests/contacts.test.ts | 11 | ✅ All passing |
| tests/sensors.test.ts | 9 | ✅ All passing |
| tests/alerts.test.ts | 11 | ✅ All passing |
| **Total** | **45** | **✅ All passing** |

---

## Known Gaps

| Gap | Reason |
|-----|--------|
| Twilio SMS delivery not tested | Twilio not yet configured — all alerts return `delivery_status: "pending"` |
| BLE tap pattern not tested | BLE requires physical hardware; cannot be simulated in a Node.js test environment |
| Sensor calibration mode alert rejection not tested | No endpoint to set `is_calibrating = true` exists yet; would require a direct DB seed or a future admin endpoint |

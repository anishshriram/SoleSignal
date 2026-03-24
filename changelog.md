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
- [ ] `PATCH /users/{id}` — updateUserProfile()
- [ ] `POST /users/logout` — logoutUser()
- [ ] `POST /sensors/pair` — pairSensor()
- [ ] `GET /sensors/{id}` — getSensorStatus()
- [ ] `GET /contacts` — getContacts()
- [ ] `PATCH /contacts/{id}` — updateContact()
- [ ] `DELETE /contacts/{id}` — deleteContact()
- [ ] `POST /alerts` — sendAlert() + Twilio integration
- [ ] `GET /alerts/{id}` — getAlertStatus()

### Stage 4 — Mobile App
- [ ] React Native project setup
- [ ] Registration + login screens
- [ ] BLE sensor pairing screen (FR-5, FR-6, FR-7, FR-8)
- [ ] Emergency contacts management screen (FR-17, FR-18, FR-19)
- [ ] Alert trigger flow (FR-13, FR-14, FR-15, FR-16)
- [ ] Onboarding flow (register → pair → add contact)

### Stage 5 — Testing
- [ ] API endpoint tests
- [ ] Integration tests (end-to-end alert flow)

### Stage 6 — Deployment
- [ ] Docker setup
- [ ] Production environment configuration

---

## Progress Percentage

**~20%** — Backend foundation complete and 3 of 12 API endpoints implemented. No mobile app yet.

---

## Next Actions to be Implemented

1. Complete remaining 9 backend API endpoints (Stage 3), starting with:
   - `PATCH /users/{id}` — updateUserProfile()
   - `POST /users/logout` — logoutUser()
   - `POST /sensors/pair` — pairSensor()
   - `GET /sensors/{id}` — getSensorStatus()
   - `GET /contacts` — getContacts()
   - `PATCH /contacts/{id}` — updateContact()
   - `DELETE /contacts/{id}` — deleteContact()
   - `POST /alerts` — sendAlert() with Twilio
   - `GET /alerts/{id}` — getAlertStatus()
2. Install and configure Twilio SDK for SMS delivery
3. Begin React Native mobile app setup (Stage 4)

---

## Decisions

- **Database:** SQLite for MVP speed (Prisma makes migration to PostgreSQL straightforward later)
- **JWT:** 24hr expiry, no refresh token, stateless logout (client deletes token)
- **Ownership:** `user_id` always extracted from JWT token, never from request body
- **Password:** bcryptjs (cross-platform), minimum 8 characters per spec
- **SMS:** Twilio API (only external API used in MVP)
- **Type safety:** `@types/*` packages installed; Express Request extended via `types/express.d.ts`

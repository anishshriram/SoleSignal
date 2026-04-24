# SoleSignal
 
> **SP26-46 Capstone Design Project — Rutgers University, Department of Electrical and Computer Engineering**
 
**SoleSignal** is a shoe-embedded wearable safety system that converts discrete foot tap patterns into emergency SMS alerts. It is designed for situations where reaching for a phone is dangerous or impossible — giving users a silent, invisible way to call for help.
 
---
 
## Table of Contents
 
- [Overview](#overview)
- [How It Works](#how-it-works)
- [Repository Structure](#repository-structure)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Backend Setup](#backend-setup)
  - [Mobile App Setup](#mobile-app-setup)
- [API Overview](#api-overview)
- [Database Schema](#database-schema)
- [Demo Versions](#demo-versions)
- [Team](#team)
- [License](#license)
---
 
## Overview
 
There are situations where the act of reaching for a phone is itself dangerous. A person in the presence of an active threat cannot always safely call for help or make a visible gesture toward a device. Existing personal safety tools share a common flaw: they require a visible, deliberate action that can be intercepted or punished.
 
SoleSignal solves this by embedding a sensor in the user's footwear. A specific tap pattern performed discreetly with the foot triggers an emergency SMS alert sent to pre-designated contacts with no sound, no visible action, and no phone required.
 
**Key capabilities:**
- Detects a secret foot tap pattern using FSR (Force Sensitive Resistor) pressure sensors
- Classifies patterns using a TFLite CNN model with a 3-window voting system to eliminate false positives
- Communicates with a paired iOS app over Bluetooth Low Energy (BLE)
- Sends an SMS alert with the user's GPS location, identity, timestamp, and sensor ID via Textbelt
- Provides haptic confirmation to the wearer without producing any audible or visible signal
---
 
## How It Works
 
```
Foot Tap → FSR Sensors → ESP32-C3 → CNN Inference (TFLite) → Voting System
    → BLE → iOS App → GPS Location → Alert Package → Textbelt SMS → Emergency Contact
```
 
1. The sensor samples foot pressure data continuously through two FSR analog input channels.
2. Each sample is normalized and fed into a rolling 50-sample buffer.
3. A TFLite model evaluates each buffer and returns a confidence score.
4. A voting system requires 3 consecutive high-confidence windows before triggering an alert — eliminating false positives from accidental gestures or normal walking.
5. The app assembles an alert package (user identity, GPS location, timestamp, sensor ID) and sends it via Textbelt SMS to the designated emergency contact within 5 seconds.
6. The user receives haptic feedback on their phone confirming the alert was dispatched.
---
 
## Repository Structure
 
```
SoleSignal/
├── backend/                  # Node.js/Express REST API
│   ├── server.ts             # Entry point
│   ├── app.ts                # Express app definition
│   ├── middleware/
│   │   └── auth.ts           # JWT validation middleware
│   ├── routes/
│   │   ├── users.ts
│   │   ├── sensors.ts
│   │   ├── contacts.ts
│   │   └── alerts.ts
│   ├── types/
│   │   └── express.d.ts      # Extends Express Request with req.user
│   └── prisma/
│       ├── schema.prisma     # Source of truth for DB schema
│       └── migrations/       # Prisma migration history
├── mobile/                   # React Native iOS app
├── cnn/                      # TFLite CNN model and training
├── hardware/                 # ESP32-C3 firmware (C/C++)
├── demov0/ – demov4/         # Iterative demo versions
├── documentation/            # Software documentation (v1.0)
├── docker-compose.yml        # Local PostgreSQL container
├── .env.example              # Environment variable template
├── changelog.md              # Continuous changelog
└── README.md
```
 
---
 
## Technology Stack
 
| Layer | Technology |
|---|---|
| Microcontroller | ESP32-C3 |
| Sensors | Force Sensitive Resistors (FSR) |
| ML Model | TFLite CNN (trained on SOS tap sequences) |
| Wireless | Bluetooth Low Energy (BLE) |
| Backend Runtime | Node.js 20 |
| Backend Framework | Express v5 |
| Language | TypeScript 6 |
| ORM | Prisma |
| Database | PostgreSQL 14 |
| Auth | JWT (HS256, 24h expiry) via `jsonwebtoken` |
| Password Hashing | bcryptjs |
| SMS Delivery | Textbelt API |
| Reverse Geocoding | Nominatim (OpenStreetMap) |
| HTTP Logger | Morgan |
| Mobile Framework | React Native 0.84 (bare CLI, iOS only) |
| BLE Library | react-native-ble-plx |
| Secure Storage | react-native-keychain (iOS Keychain) |
| GPS | @react-native-community/geolocation |
| Navigation | @react-navigation/native-stack |
| HTTP Client | Axios |
 
---
 
## Getting Started
 
### Prerequisites
 
- Node.js 20+
- PostgreSQL 14+ (or Docker)
- npm or yarn
- Xcode (for iOS mobile build)
- A [Textbelt API key](https://textbelt.com/)
### Environment Variables
 
Copy `.env.example` and fill in the required values:
 
```bash
cp .env.example .env
```
 
```env
DATABASE_URL=postgresql://user:password@localhost:5432/solesignal
JWT_SECRET=your_jwt_secret_here
TEXTBELT_API_KEY=your_textbelt_key_here
PORT=3000
```
 
### Backend Setup
 
```bash
# Start PostgreSQL via Docker (optional)
docker-compose up -d
 
# Install dependencies
cd backend
npm install
 
# Run database migrations
npx prisma migrate deploy
 
# Generate Prisma client
npx prisma generate
 
# Start the development server
npm run dev
```
 
The API will be running at `http://localhost:3000`.
 
### Mobile App Setup
 
```bash
cd mobile
npm install
 
# iOS only
cd ios && pod install && cd ..
 
# Run on iOS simulator
npx react-native run-ios
```
 
> **Note:** The mobile app targets iOS only for the MVP. Android support is out of scope.
 
---
 
## API Overview
 
All protected endpoints require a `Bearer <token>` Authorization header. Tokens are issued at login and expire after 24 hours.
 
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/users/register` | Register a new user account |
| `POST` | `/users/login` | Log in and receive a JWT |
| `PATCH` | `/users/{id}` | Update user profile |
| `POST` | `/users/logout` | Log out (client-side token deletion) |
| `POST` | `/sensors/pair` | Pair a SoleSignal sensor to the account |
| `GET` | `/sensors/{id}` | Get sensor status by ID |
| `GET` | `/sensors/me` | Get the authenticated user's sensor |
| `DELETE` | `/sensors/me` | Unpair and remove sensor |
| `POST` | `/contacts` | Add an emergency contact |
| `GET` | `/contacts` | List all emergency contacts |
| `PATCH` | `/contacts/{id}` | Update a contact |
| `DELETE` | `/contacts/{id}` | Delete a contact |
| `POST` | `/alerts` | Send an emergency alert |
| `GET` | `/alerts/{id}` | Get alert delivery status |
 
For full request/response specifications, see [`documentation/`](./documentation/).
 
---
 
## Database Schema
 
The system uses PostgreSQL with four core entities managed via Prisma ORM:
 
| Table | Description |
|---|---|
| `users` | Registered user accounts |
| `sensors` | Paired SoleSignal shoe sensors (1:1 with users) |
| `contacts` | Emergency contacts per user (1:many) |
| `alerts` | Alert events with GPS, delivery status, and retry count |
 
Key relationships:
- A `user` has one `sensor` and many `contacts` and `alerts`
- A `sensor` and `contact` each link to many `alerts`
- Deleting a sensor cascades to its associated alerts
The schema source of truth is `backend/prisma/schema.prisma`. Migrations are managed with `npx prisma migrate deploy`.
 
---
 
## Demo Versions
 
The `demov0` through `demov4` directories contain iterative prototype builds developed throughout the capstone project lifecycle, showing the evolution of the system from early proof-of-concept to the current MVP. Each version represents a working snapshot at a key milestone.
 
---
 
## Team
 
**SP26-46 — Rutgers University, School of Engineering**
***First Place: Electrical and Computer Engineering***
***First Place: Smart Systems, Sensing, and IoT***
 
| Name | Role | Contact |
|---|---|---|
| Anish Shriram | Software / Backend | as3896@scarletmail.rutgers.edu |
| Om Patel | Hardware | orp9@scarletmail.rutgers.edu |
| Rishi Patel | Hardware | rp1202@scarletmail.rutgers.edu |
| Seungmin Baik | Signal Processing | sb1972@scarletmail.rutgers.edu |
 
**Advisor:** Professor Minning Zhu, Rutgers University
 
---
 
## License
 
Copyright © 2026 Anish Shriram. All Rights Reserved.
 
This project and its source code are the intellectual property of the author. No part of this software may be used, modified, copied, distributed, or integrated into other projects without explicit written permission from the author. This project is currently developed as an academic work and is intended for potential commercial development in the future. This repository is made available solely for evaluation and demonstration purposes.

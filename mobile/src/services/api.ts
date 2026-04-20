// services/api.ts — Centralized HTTP client for all backend API calls.
//
// Uses axios with a base URL pointing at the Express backend.
// An axios interceptor automatically reads the JWT from iOS Keychain and
// attaches it as an Authorization: Bearer header on every request.
// This means individual screen components never need to handle auth headers —
// they just call the exported functions and the token is added automatically.
//
// The Keychain stores the token at login (see AuthContext.tsx) and clears it at logout.
// Every protected backend endpoint will reject requests with a missing/expired token.

import axios from 'axios';
import * as Keychain from 'react-native-keychain';

// The local network IP of the machine running the backend server.
// Must be updated when testing on a physical device — 'localhost' won't work
// because the device is not on the same loopback as the dev machine.
// On simulator, 'http://localhost:3000' works fine.
const BASE_URL = 'http://10.75.132.42:3000';

// Create a shared axios instance with a 10-second request timeout.
// All exported functions use this instance rather than the global axios,
// so they all benefit from the interceptor and base URL config.
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000, // ms — prevents requests from hanging indefinitely
});

// Request interceptor: runs before every axios request.
// Reads the JWT from iOS Keychain (stored as the `password` field in a generic credential)
// and injects it into the Authorization header.
// If no token is found (user is not logged in), the header is simply not set —
// public endpoints (register, login) will still work.
api.interceptors.request.use(async config => {
  const credentials = await Keychain.getGenericPassword();
  if (credentials) {
    // The JWT is stored in the `password` field (the `username` field holds a placeholder)
    config.headers.Authorization = `Bearer ${credentials.password}`;
  }
  return config;
});

// ─── Auth ────────────────────────────────────────────────────────────────────

// Register a new account. Public endpoint — no token needed.
export const registerUser = (data: {
  name: string;
  email: string;
  phone_number: string;
  password: string;
}) => api.post('/users/register', data);

// Log in with email + password. Returns a JWT on success (24hr expiry).
export const loginUser = (data: { email: string; password: string }) =>
  api.post('/users/login', data);

// Stateless logout — confirms token is valid. Client deletes token from Keychain.
export const logoutUser = () => api.post('/users/logout');

// Update the authenticated user's name or phone number.
// `id` must match the user_id in the JWT or the backend returns 403.
export const updateUserProfile = (
  id: number,
  data: Partial<{ name: string; phone_number: string }>,
) => api.patch(`/users/${id}`, data);

// ─── Sensors ─────────────────────────────────────────────────────────────────

// Link a BLE sensor to this user's account.
// `sensor_id` is the BLE hardware UUID (e.g. "B70FA814-..."), NOT the DB primary key.
// Returns { sensor_id, id } — the `id` (DB primary key) is stored and used for alert creation.
export const pairSensor = (sensor_id: string) =>
  api.post('/sensors/pair', { sensor_id });

// Returns the authenticated user's sensor record:
//   { id, sensor_id, is_paired, is_calibrating, last_connected }
// Used at app startup to retrieve the sensor_id for BLE reconnection without knowing the DB id.
export const getMySensor = () => api.get('/sensors/me');

// Returns sensor status by database primary key (not BLE hardware UUID).
export const getSensorStatus = (id: number) => api.get(`/sensors/${id}`);

// Permanently removes the sensor record linked to this user's account.
// Associated alerts are cascade-deleted by the DB foreign key constraint.
export const unpairSensor = () => api.delete('/sensors/me');

// ─── Contacts ────────────────────────────────────────────────────────────────

// Returns all emergency contacts for this user: { contacts: [...] }
// Returns 200 with empty array if no contacts — never 404.
export const getContacts = () => api.get('/contacts');

// Add a new emergency contact (person to SMS during an alert).
export const addContact = (data: { name: string; phone_number: string }) =>
  api.post('/contacts', data);

// Update an existing contact by DB primary key.
export const updateContact = (
  id: number,
  data: Partial<{ name: string; phone_number: string }>,
) => api.patch(`/contacts/${id}`, data);

// Permanently delete an emergency contact by DB primary key.
export const deleteContact = (id: number) => api.delete(`/contacts/${id}`);

// ─── Alerts ──────────────────────────────────────────────────────────────────

// Trigger an emergency alert. The backend validates ownership, sends an SMS via Textbelt,
// and returns { alert_id, delivery_status } whether SMS succeeded or failed.
// sensor_id here is the DATABASE primary key (integer), not the BLE hardware UUID.
export const sendAlert = (data: {
  sensor_id: number;     // DB primary key of the sensor (stored after pairing)
  contact_id: number;    // DB primary key of the emergency contact
  gps_latitude?: number;
  gps_longitude?: number;
  location_available: boolean; // if false, GPS fields are not required
}) => api.post('/alerts', data);

// Poll delivery status of an alert by its DB primary key.
// Returns { alert_id, delivery_status, retry_count, timestamp }
export const getAlertStatus = (id: number) => api.get(`/alerts/${id}`);

export default api;

import axios from 'axios';
import * as Keychain from 'react-native-keychain';

// Update this to your backend IP when testing on device
const BASE_URL = 'http://localhost:3000';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

// Attach JWT to every request if stored
api.interceptors.request.use(async config => {
  const credentials = await Keychain.getGenericPassword();
  if (credentials) {
    config.headers.Authorization = `Bearer ${credentials.password}`;
  }
  return config;
});

// Auth
export const registerUser = (data: {
  name: string;
  email: string;
  phone_number: string;
  password: string;
}) => api.post('/users/register', data);

export const loginUser = (data: { email: string; password: string }) =>
  api.post('/users/login', data);

export const logoutUser = () => api.post('/users/logout');

export const updateUserProfile = (
  id: number,
  data: Partial<{ name: string; phone_number: string }>,
) => api.patch(`/users/${id}`, data);

// Sensors
export const pairSensor = (sensor_id: string) =>
  api.post('/sensors/pair', { sensor_id });

// Returns the authenticated user's sensor (id, sensor_id, is_paired, is_calibrating, last_connected)
export const getMySensor = () => api.get('/sensors/me');

export const getSensorStatus = (id: number) => api.get(`/sensors/${id}`);

// Contacts
export const getContacts = () => api.get('/contacts');

export const addContact = (data: { name: string; phone_number: string }) =>
  api.post('/contacts', data);

export const updateContact = (
  id: number,
  data: Partial<{ name: string; phone_number: string }>,
) => api.patch(`/contacts/${id}`, data);

export const deleteContact = (id: number) => api.delete(`/contacts/${id}`);

// Alerts
export const sendAlert = (data: {
  sensor_id: number;
  contact_id: number;
  gps_latitude?: number;
  gps_longitude?: number;
  location_available: boolean;
}) => api.post('/alerts', data);

export const getAlertStatus = (id: number) => api.get(`/alerts/${id}`);

export default api;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app.js';

const prisma = new PrismaClient();

const suffix = Date.now() + 3;
const TEST_EMAIL = `alerts_${suffix}@solesignal.test`;
const OTHER_EMAIL = `alerts_other_${suffix}@solesignal.test`;
const SENSOR_ID = `SENSOR-ALERT-${suffix}`;

let authToken: string;
let otherToken: string;
let sensorDbId: number;
let contactId: number;
let alertId: number;

beforeAll(async () => {
  // Register + login primary test user
  await request(app).post('/users/register').send({
    name: 'Alert Test User',
    email: TEST_EMAIL,
    phone_number: '+15550005555',
    password: 'testpass123',
  });
  const loginRes = await request(app).post('/users/login').send({
    email: TEST_EMAIL,
    password: 'testpass123',
  });
  authToken = loginRes.body.token;

  // Pair a sensor
  const sensorRes = await request(app)
    .post('/sensors/pair')
    .set('Authorization', `Bearer ${authToken}`)
    .send({ sensor_id: SENSOR_ID });
  sensorDbId = sensorRes.body.id;

  // Add an emergency contact
  const contactRes = await request(app)
    .post('/contacts')
    .set('Authorization', `Bearer ${authToken}`)
    .send({ name: 'Alert Contact', phone_number: '+15556667777' });
  contactId = contactRes.body.contact_id;

  // Register + login a second user for ownership tests
  await request(app).post('/users/register').send({
    name: 'Other Alert User',
    email: OTHER_EMAIL,
    phone_number: '+15550006666',
    password: 'testpass123',
  });
  const otherLoginRes = await request(app).post('/users/login').send({
    email: OTHER_EMAIL,
    password: 'testpass123',
  });
  otherToken = otherLoginRes.body.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: '@solesignal.test' } } });
  await prisma.$disconnect();
});

describe('POST /alerts', () => {
  it('creates an alert record with location', async () => {
    const res = await request(app)
      .post('/alerts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sensor_id: sensorDbId,
        contact_id: contactId,
        gps_latitude: 40.7128,
        gps_longitude: -74.006,
        location_available: true,
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('alert_id');
    expect(res.body).toHaveProperty('delivery_status', 'pending');
    alertId = res.body.alert_id;
  });

  it('creates an alert record without location', async () => {
    const res = await request(app)
      .post('/alerts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sensor_id: sensorDbId,
        contact_id: contactId,
        location_available: false,
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('alert_id');
    expect(res.body).toHaveProperty('delivery_status', 'pending');
  });

  it('rejects alert when location_available is true but coordinates are missing', async () => {
    const res = await request(app)
      .post('/alerts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sensor_id: sensorDbId,
        contact_id: contactId,
        location_available: true,
      });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects alert for a sensor belonging to another user', async () => {
    const res = await request(app)
      .post('/alerts')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        sensor_id: sensorDbId,
        contact_id: contactId,
        location_available: false,
      });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects alert for a contact belonging to another user', async () => {
    // Other user's sensor (not paired, will 404 on sensor lookup)
    const res = await request(app)
      .post('/alerts')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        sensor_id: sensorDbId,
        contact_id: contactId,
        location_available: false,
      });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/alerts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ sensor_id: sensorDbId });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app).post('/alerts').send({
      sensor_id: sensorDbId,
      contact_id: contactId,
      location_available: false,
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /alerts/:id', () => {
  it('returns alert status for own alert', async () => {
    const res = await request(app)
      .get(`/alerts/${alertId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('alert_id', alertId);
    expect(res.body).toHaveProperty('delivery_status');
    expect(res.body).toHaveProperty('retry_count');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('returns 404 for alert belonging to another user', async () => {
    const res = await request(app)
      .get(`/alerts/${alertId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for non-numeric alert ID', async () => {
    const res = await request(app)
      .get('/alerts/abc')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 for non-existent alert ID', async () => {
    const res = await request(app)
      .get('/alerts/999999999')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

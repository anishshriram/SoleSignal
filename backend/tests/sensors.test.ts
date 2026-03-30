import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app.js';

const prisma = new PrismaClient();

const suffix = Date.now() + 2;
const TEST_EMAIL = `sensors_${suffix}@solesignal.test`;
const OTHER_EMAIL = `sensors_other_${suffix}@solesignal.test`;
const SENSOR_ID = `SENSOR-TEST-${suffix}`;

let authToken: string;
let otherToken: string;
let sensorDbId: number;

beforeAll(async () => {
  // Register + login primary test user
  await request(app).post('/users/register').send({
    name: 'Sensor Test User',
    email: TEST_EMAIL,
    phone_number: '+15550003333',
    password: 'testpass123',
  });
  const loginRes = await request(app).post('/users/login').send({
    email: TEST_EMAIL,
    password: 'testpass123',
  });
  authToken = loginRes.body.token;

  // Register + login a second user to test ownership boundaries
  await request(app).post('/users/register').send({
    name: 'Other Sensor User',
    email: OTHER_EMAIL,
    phone_number: '+15550004444',
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

describe('GET /sensors/me (before pairing)', () => {
  it('returns 404 when no sensor is paired', async () => {
    const res = await request(app)
      .get('/sensors/me')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /sensors/pair', () => {
  it('pairs a sensor successfully', async () => {
    const res = await request(app)
      .post('/sensors/pair')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ sensor_id: SENSOR_ID });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Sensor paired successfully');
    expect(res.body).toHaveProperty('sensor_id', SENSOR_ID);
    expect(res.body).toHaveProperty('id');
    sensorDbId = res.body.id;
  });

  it('rejects missing sensor_id', async () => {
    const res = await request(app)
      .post('/sensors/pair')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects pairing a sensor already claimed by another user', async () => {
    const res = await request(app)
      .post('/sensors/pair')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ sensor_id: SENSOR_ID });
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/sensors/pair')
      .send({ sensor_id: `SENSOR-UNAUTH-${suffix}` });
    expect(res.status).toBe(401);
  });
});

describe('GET /sensors/me (after pairing)', () => {
  it('returns the paired sensor for the authenticated user', async () => {
    const res = await request(app)
      .get('/sensors/me')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sensor_id', SENSOR_ID);
    expect(res.body).toHaveProperty('is_paired', true);
    expect(res.body).toHaveProperty('is_calibrating');
    expect(res.body).toHaveProperty('id', sensorDbId);
  });
});

describe('GET /sensors/:id', () => {
  it('returns sensor status by DB id', async () => {
    const res = await request(app)
      .get(`/sensors/${sensorDbId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sensor_id', SENSOR_ID);
    expect(res.body).toHaveProperty('is_paired', true);
  });

  it('returns 404 when sensor belongs to another user', async () => {
    const res = await request(app)
      .get(`/sensors/${sensorDbId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for an invalid (non-numeric) sensor ID', async () => {
    const res = await request(app)
      .get('/sensors/abc')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

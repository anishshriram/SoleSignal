import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app.js';

const prisma = new PrismaClient();

// Unique suffix per test run to avoid collisions with existing data
const suffix = Date.now();
const TEST_EMAIL = `testuser_${suffix}@solesignal.test`;
const TEST_PASSWORD = 'testpass123';
const TEST_NAME = 'Test User';
const TEST_PHONE = '+15550001111';

let userId: number;
let authToken: string;

afterAll(async () => {
  // Cascade deletes sensors, contacts, and alerts linked to this user
  await prisma.user.deleteMany({ where: { email: { endsWith: '@solesignal.test' } } });
  await prisma.$disconnect();
});

describe('POST /users/register', () => {
  it('registers a new user successfully', async () => {
    const res = await request(app).post('/users/register').send({
      name: TEST_NAME,
      email: TEST_EMAIL,
      phone_number: TEST_PHONE,
      password: TEST_PASSWORD,
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('message', 'Registration successful');
    expect(res.body).toHaveProperty('user_id');
    userId = res.body.user_id;
  });

  it('rejects duplicate email', async () => {
    const res = await request(app).post('/users/register').send({
      name: TEST_NAME,
      email: TEST_EMAIL,
      phone_number: TEST_PHONE,
      password: TEST_PASSWORD,
    });
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects missing required fields', async () => {
    const res = await request(app).post('/users/register').send({
      email: `other_${suffix}@solesignal.test`,
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects password shorter than 8 characters', async () => {
    const res = await request(app).post('/users/register').send({
      name: TEST_NAME,
      email: `short_${suffix}@solesignal.test`,
      phone_number: TEST_PHONE,
      password: 'abc',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/);
  });
});

describe('POST /users/login', () => {
  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/users/login').send({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    authToken = res.body.token;
  });

  it('rejects wrong password', async () => {
    const res = await request(app).post('/users/login').send({
      email: TEST_EMAIL,
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects non-existent email', async () => {
    const res = await request(app).post('/users/login').send({
      email: `nobody_${suffix}@solesignal.test`,
      password: TEST_PASSWORD,
    });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects missing fields', async () => {
    const res = await request(app).post('/users/login').send({ email: TEST_EMAIL });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('PATCH /users/:id', () => {
  it('updates own profile successfully', async () => {
    const res = await request(app)
      .patch(`/users/${userId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Profile updated successfully');
  });

  it('rejects update of another user profile', async () => {
    const res = await request(app)
      .patch(`/users/${userId + 9999}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Hacker' });
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app)
      .patch(`/users/${userId}`)
      .send({ name: 'NoAuth' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects update with no fields provided', async () => {
    const res = await request(app)
      .patch(`/users/${userId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /users/logout', () => {
  it('logs out with a valid token', async () => {
    const res = await request(app)
      .post('/users/logout')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Logged out successfully');
  });

  it('rejects logout without a token', async () => {
    const res = await request(app).post('/users/logout');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});

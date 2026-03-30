import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app.js';

const prisma = new PrismaClient();

const suffix = Date.now() + 1;
const TEST_EMAIL = `contacts_${suffix}@solesignal.test`;

let authToken: string;
let contactId: number;

beforeAll(async () => {
  // Register + login a test user
  await request(app).post('/users/register').send({
    name: 'Contacts Test User',
    email: TEST_EMAIL,
    phone_number: '+15550002222',
    password: 'testpass123',
  });
  const loginRes = await request(app).post('/users/login').send({
    email: TEST_EMAIL,
    password: 'testpass123',
  });
  authToken = loginRes.body.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: '@solesignal.test' } } });
  await prisma.$disconnect();
});

describe('GET /contacts (empty)', () => {
  it('returns empty list for a new user', async () => {
    const res = await request(app)
      .get('/contacts')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('contacts');
    expect(res.body.contacts).toEqual([]);
  });
});

describe('POST /contacts', () => {
  it('adds a contact successfully', async () => {
    const res = await request(app)
      .post('/contacts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Emergency Bob', phone_number: '+15553334444' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('message', 'Contact added successfully');
    expect(res.body).toHaveProperty('contact_id');
    contactId = res.body.contact_id;
  });

  it('rejects missing name', async () => {
    const res = await request(app)
      .post('/contacts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ phone_number: '+15553334444' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects invalid phone number format', async () => {
    const res = await request(app)
      .post('/contacts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Bad Phone', phone_number: 'notaphone' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/phone/i);
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/contacts')
      .send({ name: 'Anyone', phone_number: '+15550000000' });
    expect(res.status).toBe(401);
  });
});

describe('GET /contacts', () => {
  it('returns contacts list after adding', async () => {
    const res = await request(app)
      .get('/contacts')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.contacts.length).toBeGreaterThan(0);
    expect(res.body.contacts[0]).toHaveProperty('id');
    expect(res.body.contacts[0]).toHaveProperty('name');
    expect(res.body.contacts[0]).toHaveProperty('phone_number');
    expect(res.body.contacts[0]).toHaveProperty('is_valid');
  });
});

describe('PATCH /contacts/:id', () => {
  it('updates a contact successfully', async () => {
    const res = await request(app)
      .patch(`/contacts/${contactId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Updated Bob' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Contact updated successfully');
  });

  it('rejects update with no fields', async () => {
    const res = await request(app)
      .patch(`/contacts/${contactId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 for contact belonging to another user', async () => {
    const res = await request(app)
      .patch(`/contacts/${contactId + 9999}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Hacker' });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('DELETE /contacts/:id', () => {
  it('deletes a contact successfully', async () => {
    const res = await request(app)
      .delete(`/contacts/${contactId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Contact deleted successfully');
  });

  it('returns 404 when deleting an already-deleted contact', async () => {
    const res = await request(app)
      .delete(`/contacts/${contactId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

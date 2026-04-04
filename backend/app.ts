// app.ts — Express application definition.
// This file creates and configures the Express app but does NOT call app.listen().
// It is imported by server.ts (which starts the server) and by tests (which use
// Supertest to simulate HTTP requests without binding to a real port).

import 'dotenv/config'; // Load .env file into process.env
import express from 'express';
import morgan from 'morgan';
import usersRouter from './routes/users.js';
import contactsRouter from './routes/contacts.js';
import sensorsRouter from './routes/sensors.js';
import alertsRouter from './routes/alerts.js';

const app = express();

// Log every incoming HTTP request to the console (method, path, status, response time)
app.use(morgan('dev'));

// Parse incoming request bodies as JSON so controllers can read req.body
app.use(express.json());

// Mount routers — each handles all endpoints under its prefix
app.use('/users', usersRouter);      // register, login, logout, updateProfile
app.use('/contacts', contactsRouter); // addContact, getContacts, updateContact, deleteContact
app.use('/sensors', sensorsRouter);   // pairSensor, getMySensor, getSensorStatus, unpairSensor
app.use('/alerts', alertsRouter);     // sendAlert, getAlertStatus

// Simple health check
app.get('/', (_req, res) => {
  res.json({ message: 'SoleSignal API is running' });
});

export default app;

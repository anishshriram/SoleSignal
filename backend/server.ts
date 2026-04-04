// server.ts — Entry point for the backend.
// This file's only job is to start the HTTP server on a port.
// The Express app itself is defined in app.ts, which is imported here.
// This separation exists so that tests can import app.ts without actually
// starting a server (Supertest handles that internally during tests).

import 'dotenv/config'; // Load .env file into process.env before anything else
import express from 'express';
import morgan from 'morgan';
import usersRouter from './routes/users.js';
import contactsRouter from './routes/contacts.js';
import sensorsRouter from './routes/sensors.js';
import alertsRouter from './routes/alerts.js';

const app = express();

// Log every incoming HTTP request to the console in a readable format (method, URL, status, time)
app.use(morgan('dev'));

// Parse incoming request bodies as JSON so req.body works in route handlers
app.use(express.json());

// Mount each router at its base path.
// All routes inside usersRouter are prefixed with /users, etc.
app.use('/users', usersRouter);
app.use('/contacts', contactsRouter);
app.use('/sensors', sensorsRouter);
app.use('/alerts', alertsRouter);

// Health check endpoint — useful for confirming the server is running
app.get('/', (_req, res) => {
  res.json({ message: 'SoleSignal API is running' });
});

// Start listening on PORT (defaults to 3000 if not set in environment)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

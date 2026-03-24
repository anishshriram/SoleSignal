import 'dotenv/config';
import express from 'express';
import usersRouter from './routes/users.js';
import contactsRouter from './routes/contacts.js';
import sensorsRouter from './routes/sensors.js';
import alertsRouter from './routes/alerts.js';

const app = express();

app.use(express.json());

app.use('/users', usersRouter);
app.use('/contacts', contactsRouter);
app.use('/sensors', sensorsRouter);
app.use('/alerts', alertsRouter);

app.get('/', (_req, res) => {
  res.json({ message: 'SoleSignal API is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

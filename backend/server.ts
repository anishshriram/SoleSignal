import 'dotenv/config'; // Load environment variables
import express from 'express';
import usersRouter from './routes/users.js'; // User routes (register, login)
import contactsRouter from './routes/contacts.js'; // Emergency contact routes

const app = express();

// Middleware
app.use(express.json()); // Parse JSON request bodies

// Routes
app.use('/users', usersRouter); // Mount user routes at /users
app.use('/contacts', contactsRouter); // Mount contact routes at /contacts

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'SoleSignal API is running' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
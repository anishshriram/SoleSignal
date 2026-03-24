require('dotenv').config(); // Load environment variables
const express = require('express');
// const { PrismaClient } = require('./node_modules/.prisma/client'); // Prisma client - TODO: fix import

const app = express();
// const prisma = new PrismaClient(); // TODO: enable

// Middleware
app.use(express.json()); // Parse JSON bodies

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'SoleSignal API is running' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
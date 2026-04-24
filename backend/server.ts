// server.ts — Entry point for the backend.
// This file's only job is to start the HTTP server on a port.
// The Express app itself is defined in app.ts, which is imported here.
// This separation exists so that tests can import app.ts without actually
// starting a server (Supertest handles that internally during tests).

import app from './app.js';

// Start listening on PORT (defaults to 3000 if not set in environment)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

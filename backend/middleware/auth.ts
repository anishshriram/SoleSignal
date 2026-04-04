// middleware/auth.ts — JWT authentication middleware.
//
// This function runs before any protected route handler. It:
//   1. Reads the Authorization header and extracts the Bearer token
//   2. Verifies the token signature using JWT_SECRET
//   3. Attaches the decoded payload (user_id, email) to req.user
//   4. Calls next() to pass control to the route handler
//
// If the token is missing or invalid, it returns 401 immediately and the
// route handler never runs. Controllers access req.user.user_id to identify
// the caller without trusting anything from the request body.

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// JWT_SECRET must match the secret used in loginUser() when the token was signed.
// Falls back to 'defaultsecret' in development only — must be set via env in production.
const JWT_SECRET = process.env.JWT_SECRET || 'defaultsecret';

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  // The Authorization header is expected in the format: "Bearer <token>"
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Extract just the token after "Bearer "

  if (!token) {
    // No token provided — reject immediately
    return res.status(401).json({ error: 'Authentication token required' });
  }

  // Verify the token: checks signature and expiry.
  // If valid, `decoded` is the original JWT payload object.
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      // Token is expired, tampered with, or otherwise invalid
      return res.status(401).json({ error: 'Token expired, please log in again' });
    }
    // Attach decoded payload to req.user so downstream controllers can use it
    req.user = decoded as Request['user'];
    next(); // Proceed to the route handler
  });
};

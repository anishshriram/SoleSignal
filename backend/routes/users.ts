// routes/users.ts — User account endpoints.
//
// Handles: register, login, update profile, logout.
// Registration and login are public (no token required).
// All other endpoints require a valid JWT via authenticateToken middleware.

import express from 'express';
import bcrypt from 'bcryptjs';       // Password hashing library (cross-platform, no native deps)
import jwt from 'jsonwebtoken';      // Creates and verifies JSON Web Tokens
import { PrismaClient } from '@prisma/client'; // Database ORM client
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// JWT_SECRET is used to sign tokens on login. Must match the secret in auth middleware.
const JWT_SECRET = process.env.JWT_SECRET || 'defaultsecret';

/**
 * POST /users/register
 * Public — no token required.
 * Creates a new user account. Password is hashed before storage (never stored plain).
 * Body: { name, email, phone_number, password }
 * Returns: { message, user_id }
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone_number, password } = req.body;

    // Validate required fields
    if (!name || !phone_number || !password) {
      return res.status(400).json({ error: 'All fields (name, email or phone_number, password) are required' });
    }
    if (!email && !phone_number) {
      return res.status(400).json({ error: 'At least one of email or phone_number is required' });
    }
    // Enforce minimum password length per spec
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check for duplicate email — Prisma will also throw a unique constraint error,
    // but we return a cleaner message by checking first
    const existingUser = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Hash the password with bcrypt (salt rounds = 10, a standard safe value)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user record into the database
    const user = await prisma.user.create({
      data: { name, email, phone_number, password_hash: hashedPassword }
    });

    res.status(201).json({ message: 'Registration successful', user_id: user.id });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /users/login
 * Public — no token required.
 * Verifies credentials and returns a signed JWT valid for 24 hours.
 * The token payload contains user_id and email, which all protected endpoints use.
 * Body: { email, password }
 * Returns: { message, token }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Look up the user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Return same error as wrong password — don't reveal whether email exists
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Compare the provided password against the stored bcrypt hash
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Sign a JWT containing user_id and email — the auth middleware will decode this
    // and attach it to req.user on every subsequent authenticated request
    const token = jwt.sign(
      { user_id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' } // Token expires 24 hours from now
    );

    // Record the login timestamp for auditing
    await prisma.user.update({
      where: { id: user.id },
      data: { last_login: new Date() }
    });

    res.status(200).json({ message: 'Login successful', token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /users/:id
 * Protected. Updates the authenticated user's profile fields.
 * The path param :id must match the token's user_id — a user cannot update someone else's profile.
 * At least one field must be provided; only provided fields are updated (partial update).
 * Body: { name?, email?, phone_number? }
 * Returns: { message }
 */
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    // Parse the :id path parameter as an integer
    const targetId = parseInt(String(req.params.id), 10);

    if (isNaN(targetId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Ownership check — the token's user_id must match the requested :id
    // This prevents user A from modifying user B's profile
    if (!req.user || req.user.user_id !== targetId) {
      return res.status(403).json({ error: 'You do not have permission to update this profile' });
    }

    const { name, email, phone_number } = req.body;

    // Require at least one field to update — reject empty PATCH requests
    if (!name && !email && !phone_number) {
      return res.status(400).json({ error: 'At least one field (name, email, phone_number) must be provided' });
    }

    // Confirm the user record actually exists before attempting update
    const user = await prisma.user.findUnique({ where: { id: targetId } });
    if (!user) {
      return res.status(404).json({ error: `User with ID ${targetId} not found` });
    }

    // Build a partial update object with only the fields that were provided
    const updateData: { name?: string; email?: string; phone_number?: string } = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone_number) updateData.phone_number = phone_number;

    await prisma.user.update({ where: { id: targetId }, data: updateData });

    res.status(200).json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /users/logout
 * Protected. Stateless logout — the server just confirms the token was valid.
 * No database write is needed because the MVP does not maintain a token blacklist.
 * The actual logout is done by the mobile client deleting the token from iOS Keychain.
 * Returns: { message }
 */
router.post('/logout', authenticateToken, (_req, res) => {
  // JWT is stateless — the client is responsible for deleting the token from secure storage.
  // The server simply confirms the token was valid at time of logout request.
  res.status(200).json({ message: 'Logged out successfully' });
});

export default router;

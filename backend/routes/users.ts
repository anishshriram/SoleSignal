// User routes: register, login, logout, updateUserProfile
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'defaultsecret';

/**
 * POST /users/register
 * Body: { name, email, phone_number, password }
 * Returns: { message, user_id }
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone_number, password } = req.body;

    if (!name || !phone_number || !password) {
      return res.status(400).json({ error: 'All fields (name, email or phone_number, password) are required' });
    }
    if (!email && !phone_number) {
      return res.status(400).json({ error: 'At least one of email or phone_number is required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existingUser = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
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
 * Body: { email, password }
 * Returns: { message, token }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { user_id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

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
 * Protected. Updates name, email, and/or phone_number for the authenticated user.
 * Path param must match the token's user_id (ownership).
 * Body: { name?, email?, phone_number? } — at least one required
 * Returns: { message }
 */
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const targetId = parseInt(String(req.params.id), 10);

    if (isNaN(targetId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Ownership check — users can only update their own profile
    if (!req.user || req.user.user_id !== targetId) {
      return res.status(403).json({ error: 'You do not have permission to update this profile' });
    }

    const { name, email, phone_number } = req.body;

    if (!name && !email && !phone_number) {
      return res.status(400).json({ error: 'At least one field (name, email, phone_number) must be provided' });
    }

    const user = await prisma.user.findUnique({ where: { id: targetId } });
    if (!user) {
      return res.status(404).json({ error: `User with ID ${targetId} not found` });
    }

    // Build update object with only provided fields
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
 * Protected. Stateless JWT logout — instructs client to delete its token.
 * No DB write needed (no token blacklist for MVP).
 * Returns: { message }
 */
router.post('/logout', authenticateToken, (_req, res) => {
  // JWT is stateless — the client is responsible for deleting the token from secure storage.
  // The server simply confirms the token was valid at time of logout.
  res.status(200).json({ message: 'Logged out successfully' });
});

export default router;

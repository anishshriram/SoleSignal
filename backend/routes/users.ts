// User routes for registration and login
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '../node_modules/.prisma/client/client.js';

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'defaultsecret';

/**
 * POST /users/register
 * Registers a new user
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
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if user already exists
    const existingUser = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone_number,
        password_hash: hashedPassword
      }
    });

    res.status(201).json({
      message: 'Registration successful',
      user_id: user.id
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /users/login
 * Logs in a user
 * Body: { email, password }
 * Returns: { message, token }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token — payload uses user_id per spec
    const token = jwt.sign(
      { user_id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Update last_login timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { last_login: new Date() }
    });

    res.status(200).json({
      message: 'Login successful',
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
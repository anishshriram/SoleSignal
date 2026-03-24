// Emergency contact routes
import express from 'express';
import { PrismaClient } from '../node_modules/.prisma/client/client.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /contacts
 * Adds an emergency contact for the authenticated user
 * Requires JWT token
 * Body: { name, phone_number }
 * Returns: created contact
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, phone_number } = req.body;

    // Validate required fields
    if (!name || !phone_number) {
      return res.status(400).json({ error: 'Name and phone_number are required' });
    }

    // Create contact linked to authenticated user
    const contact = await prisma.emergencyContact.create({
      data: {
        user_id: req.user.id,
        name,
        phone_number
      }
    });

    res.status(201).json(contact);
  } catch (error) {
    console.error('Add contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

export default router;
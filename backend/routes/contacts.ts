// Emergency contact routes
import express from 'express';
import { PrismaClient } from '../node_modules/.prisma/client/client.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /contacts
 * Adds an emergency contact for the authenticated user
 * Body: { name, phone_number }
 * Returns: { message, contact_id }
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, phone_number } = req.body;

    if (!name || !phone_number) {
      return res.status(400).json({ error: 'Name and phone_number are required' });
    }

    // Basic phone number format validation
    const phoneRegex = /^\+?[\d\s\-().]{7,15}$/;
    if (!phoneRegex.test(phone_number)) {
      return res.status(400).json({ error: 'Phone number format is invalid' });
    }

    // user_id is extracted from the validated JWT token — never trusted from request body
    const contact = await prisma.emergencyContact.create({
      data: {
        user_id: req.user.user_id,
        name,
        phone_number
      }
    });

    res.status(201).json({
      message: 'Contact added successfully',
      contact_id: contact.id
    });
  } catch (error) {
    console.error('Add contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
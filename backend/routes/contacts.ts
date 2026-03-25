// Emergency contact routes: add, get, update, delete
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

const phoneRegex = /^\+?[\d\s\-().]{7,15}$/;

/**
 * POST /contacts
 * Body: { name, phone_number }
 * Returns: { message, contact_id }
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, phone_number } = req.body;

    if (!name || !phone_number) {
      return res.status(400).json({ error: 'Name and phone_number are required' });
    }
    if (!phoneRegex.test(phone_number)) {
      return res.status(400).json({ error: 'Phone number format is invalid' });
    }

    const contact = await prisma.emergencyContact.create({
      data: {
        user_id: req.user!.user_id,
        name,
        phone_number
      }
    });

    res.status(201).json({ message: 'Contact added successfully', contact_id: contact.id });
  } catch (error) {
    console.error('Add contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /contacts
 * Protected. Returns all emergency contacts for the authenticated user.
 * Returns: [ { id, name, phone_number, is_valid }, ... ]
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const contacts = await prisma.emergencyContact.findMany({
      where: { user_id: req.user!.user_id },
      select: { id: true, name: true, phone_number: true, is_valid: true }
    });

    res.status(200).json({ contacts });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /contacts/:id
 * Protected. Updates name and/or phone_number for a contact owned by the authenticated user.
 * Body: { name?, phone_number? } — at least one required
 * Returns: { message }
 */
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const contactId = parseInt(String(req.params.id), 10);
    if (isNaN(contactId)) {
      return res.status(400).json({ error: 'Invalid contact ID' });
    }

    const { name, phone_number } = req.body;
    if (!name && !phone_number) {
      return res.status(400).json({ error: 'At least one field (name, phone_number) must be provided' });
    }
    if (phone_number && !phoneRegex.test(phone_number)) {
      return res.status(400).json({ error: 'Phone number format is invalid' });
    }

    // Verify contact exists and belongs to the authenticated user
    const contact = await prisma.emergencyContact.findUnique({ where: { id: contactId } });
    if (!contact || contact.user_id !== req.user!.user_id) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const updateData: { name?: string; phone_number?: string } = {};
    if (name) updateData.name = name;
    if (phone_number) updateData.phone_number = phone_number;

    await prisma.emergencyContact.update({ where: { id: contactId }, data: updateData });

    res.status(200).json({ message: 'Contact updated successfully' });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /contacts/:id
 * Protected. Deletes a contact owned by the authenticated user.
 * Returns: { message }
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const contactId = parseInt(String(req.params.id), 10);
    if (isNaN(contactId)) {
      return res.status(400).json({ error: 'Invalid contact ID' });
    }

    // Verify contact exists and belongs to the authenticated user
    const contact = await prisma.emergencyContact.findUnique({ where: { id: contactId } });
    if (!contact || contact.user_id !== req.user!.user_id) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await prisma.emergencyContact.delete({ where: { id: contactId } });

    res.status(200).json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

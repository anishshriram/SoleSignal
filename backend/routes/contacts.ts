// routes/contacts.ts — Emergency contact management endpoints.
//
// Handles: add, list, update, and delete a user's emergency contacts.
// All endpoints are protected — require a valid JWT.
//
// Emergency contacts are the people who receive an SMS when the user triggers an alert.
// Each contact is linked to a specific user (user_id foreign key) and has a phone number
// that Textbelt will SMS in the POST /alerts flow.

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Phone number validation regex — permits optional leading +, digits, spaces, dashes,
// dots, and parentheses. Range 7–15 characters to accept international formats.
// Example valid values: "+1 415-555-0100", "07911123456", "+44 20 7946 0958"
const phoneRegex = /^\+?[\d\s\-().]{7,15}$/;

/**
 * POST /contacts
 * Protected. Adds a new emergency contact linked to the authenticated user.
 * Body: { name, phone_number }
 * Returns: { message, contact_id }
 *   - contact_id: the database primary key — stored by the mobile app for future updates/deletes
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, phone_number } = req.body;

    if (!name || !phone_number) {
      return res.status(400).json({ error: 'Name and phone_number are required' });
    }
    // Validate phone format before inserting — Textbelt requires E.164 format
    if (!phoneRegex.test(phone_number)) {
      return res.status(400).json({ error: 'Phone number format is invalid' });
    }

    // Create the contact linked to the authenticated user
    // is_valid defaults to false in the schema — reserved for future phone validation logic
    const contact = await prisma.emergencyContact.create({
      data: {
        user_id: req.user!.user_id, // from JWT, not from the request body
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
 * Returns an empty array (not 404) when the user has no contacts yet.
 * Returns: { contacts: [ { id, name, phone_number, is_valid }, ... ] }
 *   - is_valid: whether the phone number has been confirmed reachable (reserved for future use)
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    // findMany returns [] (empty array) if no records match — never throws on empty result
    const contacts = await prisma.emergencyContact.findMany({
      where: { user_id: req.user!.user_id },
      // Only select the fields the mobile app needs — don't leak user_id or created_at
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
 * Protected. Updates one or both of a contact's name and phone_number.
 * The contact must belong to the authenticated user (ownership enforced).
 * Body: { name?, phone_number? } — at least one field must be provided
 * Returns: { message }
 */
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    // :id is the database primary key of the contact record
    const contactId = parseInt(String(req.params.id), 10);
    if (isNaN(contactId)) {
      return res.status(400).json({ error: 'Invalid contact ID' });
    }

    const { name, phone_number } = req.body;
    // Reject empty PATCH — nothing to update
    if (!name && !phone_number) {
      return res.status(400).json({ error: 'At least one field (name, phone_number) must be provided' });
    }
    // Only validate phone if it was actually provided in this PATCH
    if (phone_number && !phoneRegex.test(phone_number)) {
      return res.status(400).json({ error: 'Phone number format is invalid' });
    }

    // Ownership check: look up the contact and verify it belongs to this user.
    // Return 404 whether the contact doesn't exist OR belongs to someone else —
    // don't reveal that a contact exists but is owned by another user.
    const contact = await prisma.emergencyContact.findUnique({ where: { id: contactId } });
    if (!contact || contact.user_id !== req.user!.user_id) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Build partial update — only include fields that were actually provided
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
 * Protected. Permanently deletes a contact owned by the authenticated user.
 * Returns: { message }
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const contactId = parseInt(String(req.params.id), 10);
    if (isNaN(contactId)) {
      return res.status(400).json({ error: 'Invalid contact ID' });
    }

    // Ownership check — same pattern as PATCH: return 404 for non-existent OR other-user's contact
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

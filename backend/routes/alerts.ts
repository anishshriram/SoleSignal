// Alert routes: sendAlert (placeholder), getAlertStatus
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /alerts
 * Protected. Assembles and sends an emergency alert via Twilio SMS.
 * Body: { sensor_id, contact_id, gps_latitude?, gps_longitude?, location_available }
 * Returns: { message, alert_id, delivery_status }
 *
 * TODO: Twilio integration not yet configured.
 * When a Twilio account is available:
 *   1. npm install twilio
 *   2. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER to .env
 *   3. Replace the placeholder block below with actual Twilio SMS delivery
 *   4. Implement retry logic (up to 3 attempts per NFR-5)
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { sensor_id, contact_id, gps_latitude, gps_longitude, location_available } = req.body;
    const user_id = req.user!.user_id;

    // Validate required fields
    if (!sensor_id || !contact_id || location_available === undefined) {
      return res.status(400).json({ error: 'sensor_id, contact_id, and location_available are required' });
    }
    if (location_available && (gps_latitude === undefined || gps_longitude === undefined)) {
      return res.status(400).json({ error: 'gps_latitude and gps_longitude are required when location_available is true' });
    }

    // Verify the sensor belongs to this user and is not in calibration mode
    const sensor = await prisma.sensor.findUnique({ where: { id: parseInt(sensor_id, 10) } });
    if (!sensor || sensor.user_id !== user_id) {
      return res.status(404).json({ error: 'Sensor not found' });
    }
    if (sensor.is_calibrating) {
      return res.status(400).json({ error: 'Alerts cannot be triggered while sensor is in calibration mode' });
    }

    // Verify the contact belongs to this user
    const contact = await prisma.emergencyContact.findUnique({ where: { id: parseInt(contact_id, 10) } });
    if (!contact || contact.user_id !== user_id) {
      return res.status(404).json({ error: 'Emergency contact not found' });
    }

    // Create the alert record with pending status
    const alert = await prisma.alert.create({
      data: {
        user_id,
        sensor_id: sensor.id,
        contact_id: contact.id,
        gps_latitude: location_available ? parseFloat(gps_latitude) : null,
        gps_longitude: location_available ? parseFloat(gps_longitude) : null,
        location_available: Boolean(location_available),
        delivery_status: 'pending',
        retry_count: 0
      }
    });

    // ── TWILIO PLACEHOLDER ──────────────────────────────────────────────────────
    // Twilio SMS delivery is not yet configured.
    // Once a Twilio account is set up, replace this block with:
    //
    //   const user = await prisma.user.findUnique({ where: { id: user_id } });
    //   const locationText = location_available
    //     ? `GPS: ${gps_latitude}, ${gps_longitude}`
    //     : 'Location unavailable';
    //   const message = `EMERGENCY ALERT from ${user.name}. ${locationText}. Sensor: ${sensor.sensor_id}. Time: ${new Date().toISOString()}`;
    //
    //   const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    //   await twilioClient.messages.create({
    //     body: message,
    //     from: process.env.TWILIO_PHONE_NUMBER,
    //     to: contact.phone_number
    //   });
    //
    // Then update delivery_status to 'delivered' and handle retries on failure.
    // ───────────────────────────────────────────────────────────────────────────

    // Update status to reflect Twilio is not configured
    await prisma.alert.update({
      where: { id: alert.id },
      data: { delivery_status: 'pending' }
    });

    res.status(201).json({
      message: 'Alert record created. SMS delivery pending — Twilio not yet configured.',
      alert_id: alert.id,
      delivery_status: 'pending'
    });
  } catch (error) {
    console.error('Send alert error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /alerts/:id
 * Protected. Returns the delivery status of an alert by its DB id.
 * The alert must belong to the authenticated user.
 * Returns: { alert_id, delivery_status, retry_count, timestamp }
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const alertId = parseInt(String(req.params.id), 10);
    if (isNaN(alertId)) {
      return res.status(400).json({ error: 'Invalid alert ID' });
    }

    const alert = await prisma.alert.findUnique({ where: { id: alertId } });

    // Verify alert exists and belongs to the authenticated user
    if (!alert || alert.user_id !== req.user!.user_id) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.status(200).json({
      alert_id: alert.id,
      delivery_status: alert.delivery_status,
      retry_count: alert.retry_count,
      timestamp: alert.timestamp
    });
  } catch (error) {
    console.error('Get alert status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

// Alert routes: sendAlert, getAlertStatus
import express from 'express';
import twilio from 'twilio';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

const MAX_RETRIES = 3;

/**
 * Attempt to send an SMS via Twilio, retrying up to MAX_RETRIES times.
 * Returns true on success, throws on final failure.
 */
async function sendSMS(to: string, body: string): Promise<void> {
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
  );

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await client.messages.create({
        body,
        from: process.env.TWILIO_PHONE_NUMBER,
        to,
      });
      return; // success
    } catch (err) {
      lastError = err;
      console.error(`Twilio attempt ${attempt}/${MAX_RETRIES} failed:`, err);
    }
  }
  throw lastError;
}

/**
 * POST /alerts
 * Protected. Sends an emergency alert SMS via Twilio and records it in the DB.
 * Body: { sensor_id, contact_id, gps_latitude?, gps_longitude?, location_available }
 * Returns: { message, alert_id, delivery_status }
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
    const sensor = await prisma.sensor.findUnique({ where: { id: Number(sensor_id) } });
    if (!sensor || sensor.user_id !== user_id) {
      return res.status(404).json({ error: 'Sensor not found' });
    }
    if (sensor.is_calibrating) {
      return res.status(400).json({ error: 'Alerts cannot be triggered while sensor is in calibration mode' });
    }

    // Verify the contact belongs to this user
    const contact = await prisma.emergencyContact.findUnique({ where: { id: Number(contact_id) } });
    if (!contact || contact.user_id !== user_id) {
      return res.status(404).json({ error: 'Emergency contact not found' });
    }

    // Fetch user's name for the SMS body
    const user = await prisma.user.findUnique({ where: { id: user_id } });

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
        retry_count: 0,
      },
    });

    // Build SMS message
    const locationText = location_available
      ? `GPS: ${parseFloat(gps_latitude).toFixed(5)}, ${parseFloat(gps_longitude).toFixed(5)}`
      : 'Location unavailable';
    const smsBody = `EMERGENCY ALERT from ${user!.name}. ${locationText}. Sensor: ${sensor.sensor_id}. Time: ${new Date().toISOString()}`;

    // Send SMS with retry logic (up to 3 attempts per NFR-5)
    try {
      await sendSMS(contact.phone_number, smsBody);

      await prisma.alert.update({
        where: { id: alert.id },
        data: { delivery_status: 'delivered', retry_count: MAX_RETRIES - MAX_RETRIES },
      });

      return res.status(201).json({
        message: 'Alert sent successfully',
        alert_id: alert.id,
        delivery_status: 'delivered',
      });
    } catch (smsError) {
      console.error('SMS delivery failed after all retries:', smsError);

      await prisma.alert.update({
        where: { id: alert.id },
        data: { delivery_status: 'failed', retry_count: MAX_RETRIES },
      });

      return res.status(201).json({
        message: 'Alert record created but SMS delivery failed',
        alert_id: alert.id,
        delivery_status: 'failed',
      });
    }
  } catch (error) {
    console.error('Send alert error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /alerts/:id
 * Protected. Returns the delivery status of an alert by its DB id.
 * Returns: { alert_id, delivery_status, retry_count, timestamp }
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const alertId = parseInt(String(req.params.id), 10);
    if (isNaN(alertId)) {
      return res.status(400).json({ error: 'Invalid alert ID' });
    }

    const alert = await prisma.alert.findUnique({ where: { id: alertId } });

    if (!alert || alert.user_id !== req.user!.user_id) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.status(200).json({
      alert_id: alert.id,
      delivery_status: alert.delivery_status,
      retry_count: alert.retry_count,
      timestamp: alert.timestamp,
    });
  } catch (error) {
    console.error('Get alert status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

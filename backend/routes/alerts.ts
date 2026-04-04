// routes/alerts.ts — Alert sending and status endpoints.
//
// Handles: POST /alerts (trigger an emergency alert) and GET /alerts/:id (check delivery status).
// All endpoints are protected — require a valid JWT.
//
// Alert flow:
//   1. Mobile app detects a tap gesture from the BLE sensor
//   2. App calls POST /alerts with sensor_id (DB primary key), contact_id, and optional GPS
//   3. Server validates sensor ownership + calibration state + contact ownership
//   4. Server creates an alert DB record with status "pending"
//   5. Server calls Twilio to SMS the emergency contact (up to 3 attempts)
//   6. Server updates the alert record to "delivered" or "failed"
//   7. Mobile app can poll GET /alerts/:id to confirm delivery

import express from 'express';
import twilio from 'twilio';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Maximum number of Twilio SMS delivery attempts before marking the alert as failed
const MAX_RETRIES = 3;

/**
 * sendSMS — Internal helper that calls the Twilio API to send an SMS.
 * Retries up to MAX_RETRIES times on failure (NFR-5 requirement).
 * The Twilio client is created fresh per-call — this is intentional; environment
 * variables may not be available at module load time in all deployment contexts.
 *
 * @param to   - Recipient phone number (e.g. "+14155550100")
 * @param body - SMS message text
 * @throws     - Rethrows the last error if all attempts fail
 */
async function sendSMS(to: string, body: string): Promise<void> {
  // Initialize Twilio client using credentials from environment variables
  // TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are set in .env / docker-compose
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
  );

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await client.messages.create({
        body,
        from: process.env.TWILIO_PHONE_NUMBER, // The Twilio number we own (set in .env)
        to,
      });
      return; // SMS sent successfully — exit the retry loop
    } catch (err) {
      lastError = err;
      console.error(`Twilio attempt ${attempt}/${MAX_RETRIES} failed:`, err);
      // If there are retries remaining, the loop continues automatically
    }
  }
  // All attempts exhausted — throw so the caller can mark the alert as failed
  throw lastError;
}

/**
 * POST /alerts
 * Protected. Triggers an emergency alert: records it in the DB and sends an SMS.
 *
 * Body:
 *   - sensor_id (number): the sensor's DATABASE primary key (not the BLE hardware UUID)
 *   - contact_id (number): the emergency contact's database ID to SMS
 *   - gps_latitude (number, optional): required if location_available is true
 *   - gps_longitude (number, optional): required if location_available is true
 *   - location_available (boolean): whether the app was able to get GPS coordinates
 *
 * Returns: { message, alert_id, delivery_status }
 *   - delivery_status: "delivered" if Twilio succeeded, "failed" if all retries exhausted
 *   - Note: returns 201 even on SMS failure — the alert DB record was still created
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { sensor_id, contact_id, gps_latitude, gps_longitude, location_available } = req.body;
    // user_id always comes from the verified JWT — never trust it from the request body
    const user_id = req.user!.user_id;

    // Validate required fields — sensor_id and contact_id are DB primary keys (integers)
    if (!sensor_id || !contact_id || location_available === undefined) {
      return res.status(400).json({ error: 'sensor_id, contact_id, and location_available are required' });
    }
    // GPS coordinates must be present when the app reports location is available
    if (location_available && (gps_latitude === undefined || gps_longitude === undefined)) {
      return res.status(400).json({ error: 'gps_latitude and gps_longitude are required when location_available is true' });
    }

    // Verify sensor exists and belongs to this user
    // sensor_id in the body is the DB primary key (INTEGER), not the BLE hardware UUID
    const sensor = await prisma.sensor.findUnique({ where: { id: Number(sensor_id) } });
    if (!sensor || sensor.user_id !== user_id) {
      return res.status(404).json({ error: 'Sensor not found' });
    }
    // Block alerts while calibrating — is_calibrating is set by the sensor hardware during setup
    if (sensor.is_calibrating) {
      return res.status(400).json({ error: 'Alerts cannot be triggered while sensor is in calibration mode' });
    }

    // Verify emergency contact exists and belongs to this user
    const contact = await prisma.emergencyContact.findUnique({ where: { id: Number(contact_id) } });
    if (!contact || contact.user_id !== user_id) {
      return res.status(404).json({ error: 'Emergency contact not found' });
    }

    // Fetch the user's name for the SMS body — recipients need to know who is in trouble
    const user = await prisma.user.findUnique({ where: { id: user_id } });

    // Create the alert record immediately with status "pending"
    // This ensures the event is logged even if SMS delivery ultimately fails
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

    // Build the SMS message text
    // Location formatted to 5 decimal places (~1 meter precision)
    const locationText = location_available
      ? `GPS: ${parseFloat(gps_latitude).toFixed(5)}, ${parseFloat(gps_longitude).toFixed(5)}`
      : 'Location unavailable';
    const smsBody = `EMERGENCY ALERT from ${user!.name}. ${locationText}. Sensor: ${sensor.sensor_id}. Time: ${new Date().toISOString()}`;

    // Attempt SMS delivery with retry logic — up to MAX_RETRIES (3) attempts
    try {
      await sendSMS(contact.phone_number, smsBody);

      // Update the alert record to reflect successful delivery
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

      // Update the alert record to reflect delivery failure after all retries exhausted
      await prisma.alert.update({
        where: { id: alert.id },
        data: { delivery_status: 'failed', retry_count: MAX_RETRIES },
      });

      // Still return 201 — the alert DB record was created; SMS failure is not a server error.
      // The mobile app can read delivery_status to decide whether to show a warning to the user.
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
 * Protected. Returns the current delivery status of an alert by its database primary key.
 * The alert must belong to the authenticated user (ownership enforced).
 *
 * Returns: { alert_id, delivery_status, retry_count, timestamp }
 *   - delivery_status: "pending" | "delivered" | "failed"
 *   - retry_count: number of Twilio attempts made (0–3)
 *   - timestamp: when the alert was created (UTC ISO string)
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const alertId = parseInt(String(req.params.id), 10);
    if (isNaN(alertId)) {
      return res.status(400).json({ error: 'Invalid alert ID' });
    }

    const alert = await prisma.alert.findUnique({ where: { id: alertId } });

    // Return 404 whether alert doesn't exist OR belongs to a different user
    if (!alert || alert.user_id !== req.user!.user_id) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.status(200).json({
      alert_id: alert.id,
      delivery_status: alert.delivery_status, // "pending" | "delivered" | "failed"
      retry_count: alert.retry_count,          // how many Twilio send attempts were made
      timestamp: alert.timestamp,              // when the alert was originally created
    });
  } catch (error) {
    console.error('Get alert status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

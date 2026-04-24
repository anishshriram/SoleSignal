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
//   5. Server calls Textbelt to SMS the emergency contact (up to 3 attempts)
//   6. Server updates the alert record to "delivered" or "failed"
//   7. Mobile app can poll GET /alerts/:id to confirm delivery

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

const MAX_RETRIES = 3;

// Nominatim reverse geocoding — converts GPS coordinates to a human-readable address.
// Free, no API key required. Nominatim policy requires a descriptive User-Agent header.
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { 'User-Agent': 'SoleSignal Emergency Alert App/1.0' } },
    );
    const data = await res.json() as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}

// Textbelt SMS helper — uses Node 20 native fetch, no SDK needed.
// POST https://textbelt.com/text with phone, message, key.
async function sendSMS(to: string, body: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch('https://textbelt.com/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: to,
          message: body,
          key: process.env.TEXTBELT_KEY,
        }),
      });
      const data = await res.json() as { success: boolean; quotaRemaining?: number; textId?: string; error?: string };
      if (!data.success) throw new Error(data.error ?? 'Textbelt error');
      console.log(`SMS sent. textId=${data.textId} quotaRemaining=${data.quotaRemaining}`);
      return;
    } catch (err) {
      lastError = err;
      console.error(`Textbelt attempt ${attempt}/${MAX_RETRIES} failed:`, err);
    }
  }
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
 *   - delivery_status: "delivered" if Textbelt succeeded, "failed" if all retries exhausted
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

    // Build the SMS message text — reverse geocode if GPS is available
    let locationText: string;
    if (location_available) {
      const address = await reverseGeocode(parseFloat(gps_latitude), parseFloat(gps_longitude));
      locationText = address
        ? `Location: ${address}`
        : `GPS: ${parseFloat(gps_latitude).toFixed(5)}, ${parseFloat(gps_longitude).toFixed(5)}`;
    } else {
      locationText = 'Location unavailable';
    }
    const smsBody = `EMERGENCY ALERT from ${user!.name}. ${locationText}. Time: ${new Date().toISOString()}`;

    // Attempt SMS delivery with retry logic — up to MAX_RETRIES (3) attempts
    try {
      await sendSMS(contact.phone_number, smsBody);

      // Update the alert record to reflect successful delivery
      await prisma.alert.update({
        where: { id: alert.id },
        data: { delivery_status: 'delivered', retry_count: 0 },
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
 *   - retry_count: number of Textbelt send attempts made (0–3)
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
      retry_count: alert.retry_count,          // how many Textbelt send attempts were made
      timestamp: alert.timestamp,              // when the alert was originally created
    });
  } catch (error) {
    console.error('Get alert status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

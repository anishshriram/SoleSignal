// routes/sensors.ts — Sensor management endpoints.
//
// Handles: pair, unpair, get authenticated user's sensor, get sensor by DB id.
// All endpoints are protected — require a valid JWT.
//
// Key distinction: a sensor has two IDs:
//   - sensor_id (TEXT): the BLE hardware identifier (e.g. "B70FA814-...")
//   - id (INTEGER): the database primary key assigned when the record is created
// The mobile app stores the database `id` and uses it when creating alerts.

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /sensors/pair
 * Protected. Links a SoleSignal sensor to the authenticated user's account.
 * If the sensor doesn't exist in the DB yet, it is created. If it already exists
 * and belongs to a different user, pairing is rejected.
 * Per spec (C-1): one sensor per user, one user per sensor.
 * Body: { sensor_id: string }  — the BLE hardware UUID, NOT a user-provided value
 * Returns: { message, sensor_id, id }
 *   - sensor_id: the hardware BLE UUID (passed through from request)
 *   - id: the database primary key — the mobile app stores this and uses it for alerts
 */
router.post('/pair', authenticateToken, async (req, res) => {
  try {
    const { sensor_id } = req.body;
    // user_id comes from the verified JWT token, never from the request body
    const user_id = req.user!.user_id;

    if (!sensor_id) {
      return res.status(400).json({ error: 'sensor_id is required' });
    }

    // Check if this user already has a different sensor paired
    const existingUserSensor = await prisma.sensor.findUnique({ where: { user_id } });
    if (existingUserSensor && existingUserSensor.sensor_id !== sensor_id) {
      return res.status(409).json({ error: 'You already have a sensor paired. Unpair it before pairing a new one.' });
    }

    // Check if this sensor hardware ID already exists in the database
    const existingSensor = await prisma.sensor.findUnique({ where: { sensor_id } });

    if (existingSensor) {
      // Sensor record exists — check if it's claimed by someone else
      if (existingSensor.is_paired && existingSensor.user_id !== user_id) {
        return res.status(409).json({ error: 'This sensor is already paired to another account' });
      }

      // Sensor exists but is unowned or owned by this user — update to link it
      await prisma.sensor.update({
        where: { sensor_id },
        data: { user_id, is_paired: true, last_connected: new Date() }
      });
    } else {
      // First time this sensor has been seen — create a new record
      await prisma.sensor.create({
        data: { sensor_id, user_id, is_paired: true, last_connected: new Date() }
      });
    }

    // Fetch the final record to get the database primary key (id)
    const paired = await prisma.sensor.findUnique({ where: { sensor_id } });

    // Return both sensor_id (hardware UUID) and id (DB primary key).
    // The mobile app uses `id` when calling POST /alerts.
    res.status(200).json({ message: 'Sensor paired successfully', sensor_id, id: paired!.id });
  } catch (error) {
    console.error('Pair sensor error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /sensors/me
 * Protected. Unpairs and permanently deletes the authenticated user's sensor record.
 * Associated alert records are cascade-deleted by the database foreign key constraint.
 * Returns: { message }
 */
router.delete('/me', authenticateToken, async (req, res) => {
  try {
    // Look up the sensor belonging to this user
    const sensor = await prisma.sensor.findUnique({
      where: { user_id: req.user!.user_id },
    });

    if (!sensor) {
      return res.status(404).json({ error: 'No sensor paired to this account' });
    }

    // Delete the sensor — Prisma's onDelete: Cascade removes linked alerts automatically
    await prisma.sensor.delete({ where: { id: sensor.id } });

    res.status(200).json({ message: 'Sensor unpaired successfully' });
  } catch (error) {
    console.error('Unpair sensor error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /sensors/me
 * Protected. Returns the authenticated user's sensor record.
 * Used by the mobile app on startup to retrieve the sensor without knowing its DB id.
 * Also used by the auto-reconnect flow to get the BLE hardware UUID (sensor_id).
 * Returns: { id, sensor_id, is_paired, is_calibrating, last_connected }
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const sensor = await prisma.sensor.findUnique({
      where: { user_id: req.user!.user_id },
    });

    if (!sensor) {
      return res.status(404).json({ error: 'No sensor paired to this account' });
    }

    res.status(200).json({
      id: sensor.id,                           // DB primary key — used for alert creation
      sensor_id: sensor.sensor_id,             // BLE hardware UUID — used for BLE reconnection
      is_paired: sensor.is_paired,
      is_calibrating: sensor.is_calibrating,   // If true, alerts cannot be triggered
      last_connected: sensor.last_connected,
    });
  } catch (error) {
    console.error('Get my sensor error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /sensors/:id
 * Protected. Returns sensor status by database primary key.
 * The sensor must belong to the authenticated user (ownership enforced).
 * Returns: { sensor_id, is_paired, is_calibrating, last_connected }
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    // Parse the :id path parameter as an integer (it's the DB primary key, not sensor_id)
    const sensorDbId = parseInt(String(req.params.id), 10);
    if (isNaN(sensorDbId)) {
      return res.status(400).json({ error: 'Invalid sensor ID' });
    }

    const sensor = await prisma.sensor.findUnique({ where: { id: sensorDbId } });

    // Return 404 whether the sensor doesn't exist OR belongs to someone else
    // (don't reveal that a sensor exists but is owned by another user)
    if (!sensor || sensor.user_id !== req.user!.user_id) {
      return res.status(404).json({ error: 'Sensor not found' });
    }

    res.status(200).json({
      sensor_id: sensor.sensor_id,
      is_paired: sensor.is_paired,
      is_calibrating: sensor.is_calibrating,
      last_connected: sensor.last_connected
    });
  } catch (error) {
    console.error('Get sensor status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

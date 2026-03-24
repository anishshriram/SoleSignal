// Sensor routes: pair, getSensorStatus
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /sensors/pair
 * Protected. Links a SoleSignal sensor to the authenticated user's account.
 * Body: { sensor_id: string }
 * Returns: { message, sensor_id }
 *
 * Per spec (C-1): one sensor can only be linked to one user at a time.
 * If the sensor does not exist yet, it is created and paired.
 * If the sensor is already paired to a different user, pairing is rejected (409).
 */
router.post('/pair', authenticateToken, async (req, res) => {
  try {
    const { sensor_id } = req.body;
    const user_id = req.user!.user_id;

    if (!sensor_id) {
      return res.status(400).json({ error: 'sensor_id is required' });
    }

    // Check if the user already has a paired sensor
    const existingUserSensor = await prisma.sensor.findUnique({ where: { user_id } });
    if (existingUserSensor && existingUserSensor.sensor_id !== sensor_id) {
      return res.status(409).json({ error: 'You already have a sensor paired. Unpair it before pairing a new one.' });
    }

    // Check if this sensor_id is already in the system
    const existingSensor = await prisma.sensor.findUnique({ where: { sensor_id } });

    if (existingSensor) {
      // Sensor exists — check if it belongs to a different user
      if (existingSensor.is_paired && existingSensor.user_id !== user_id) {
        return res.status(409).json({ error: 'This sensor is already paired to another account' });
      }

      // Link to this user
      await prisma.sensor.update({
        where: { sensor_id },
        data: { user_id, is_paired: true, last_connected: new Date() }
      });
    } else {
      // Sensor not in system yet — create and pair it
      await prisma.sensor.create({
        data: { sensor_id, user_id, is_paired: true, last_connected: new Date() }
      });
    }

    res.status(200).json({ message: 'Sensor paired successfully', sensor_id });
  } catch (error) {
    console.error('Pair sensor error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /sensors/:id
 * Protected. Returns the status of a sensor by its DB id.
 * The sensor must belong to the authenticated user.
 * Returns: { sensor_id, is_paired, is_calibrating, last_connected }
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const sensorDbId = parseInt(String(req.params.id), 10);
    if (isNaN(sensorDbId)) {
      return res.status(400).json({ error: 'Invalid sensor ID' });
    }

    const sensor = await prisma.sensor.findUnique({ where: { id: sensorDbId } });

    // Verify sensor exists and belongs to the authenticated user
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

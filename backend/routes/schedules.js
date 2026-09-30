const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { getCurrentDateTimeString } = require('../config/timezone');
const { broadcastUpdate } = require('../services/websocket');

// GET all schedules
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT s.*, e.name as employee_name, e.department as employee_department
      FROM employee_schedules s
      JOIN employees e ON s.employee_id = e.employee_id
      ORDER BY e.name ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('[API] Error fetching schedules:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch schedules' });
  }
});

// GET schedule for specific employee
router.get('/:employee_id', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM employee_schedules
      WHERE employee_id = $1
    `, [req.params.employee_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST (Upsert) schedule for employee
router.post('/', async (req, res) => {
  try {
    const {
      employee_id,
      monday = false,
      tuesday = false,
      wednesday = false,
      thursday = false,
      friday = false,
      saturday = false,
      sunday = false,
      reporting_time,
      is_active = true
    } = req.body;

    if (!employee_id || !reporting_time) {
      return res.status(400).json({ success: false, error: 'employee_id and reporting_time are required' });
    }

    // Verify employee exists
    const empRes = await db.query('SELECT * FROM employees WHERE employee_id = $1', [employee_id]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: `Employee '${employee_id}' not found.` });
    }

    const now = getCurrentDateTimeString();

    // Check if schedule already exists
    const checkRes = await db.query('SELECT * FROM employee_schedules WHERE employee_id = $1', [employee_id]);
    let result;

    if (checkRes.rows.length > 0) {
      // Update
      result = await db.query(`
        UPDATE employee_schedules
        SET monday = $1, tuesday = $2, wednesday = $3, thursday = $4, friday = $5, saturday = $6, sunday = $7,
            reporting_time = $8, is_active = $9, updated_at = $10
        WHERE employee_id = $11
        RETURNING *
      `, [
        monday, tuesday, wednesday, thursday, friday, saturday, sunday,
        reporting_time, is_active, now, employee_id
      ]);
    } else {
      // Insert
      result = await db.query(`
        INSERT INTO employee_schedules (
          employee_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday,
          reporting_time, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        employee_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday,
        reporting_time, is_active, now, now
      ]);
    }

    console.log(`[API] Saved schedule for ${employee_id}`);
    broadcastUpdate('DATA_CHANGED', { action: 'SCHEDULE_UPDATED', employee_id });

    res.json({ success: true, data: result.rows[0], message: 'Weekly schedule saved successfully.' });
  } catch (error) {
    console.error('[API] Error saving schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE schedule
router.delete('/:employee_id', async (req, res) => {
  try {
    const result = await db.query('DELETE FROM employee_schedules WHERE employee_id = $1', [req.params.employee_id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    broadcastUpdate('DATA_CHANGED', { action: 'SCHEDULE_DELETED', employee_id: req.params.employee_id });
    res.json({ success: true, message: 'Schedule deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

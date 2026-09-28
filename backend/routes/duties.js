const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { calculateReminderTime, getCurrentDateTimeString, getCurrentDateString } = require('../config/timezone');
const { broadcastUpdate } = require('../services/websocket');

// GET duties (with filter support, e.g. date=today, employee_id, status)
router.get('/', (req, res) => {
  try {
    const { date, employee_id, reminder_status, limit = 100 } = req.query;

    let query = `
      SELECT 
        d.*,
        e.name as employee_name,
        e.phone_number as employee_phone,
        e.department as employee_department,
        e.is_active as employee_active
      FROM duties d
      LEFT JOIN employees e ON d.employee_id = e.employee_id
      WHERE 1=1
    `;
    const params = [];

    if (date === 'today') {
      const todayStr = getCurrentDateString();
      query += ' AND d.duty_date = ?';
      params.push(todayStr);
    } else if (date) {
      query += ' AND d.duty_date = ?';
      params.push(date);
    }

    if (employee_id) {
      query += ' AND d.employee_id = ?';
      params.push(employee_id);
    }

    if (reminder_status) {
      query += ' AND d.reminder_status = ?';
      params.push(reminder_status);
    }

    query += ' ORDER BY d.duty_date DESC, d.reporting_time ASC LIMIT ?';
    params.push(parseInt(limit, 10));

    const duties = db.prepare(query).all(...params);
    res.json({ success: true, data: duties });
  } catch (error) {
    console.error('[API] Error fetching duties:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch duties' });
  }
});

// GET single duty
router.get('/:id', (req, res) => {
  try {
    const duty = db.prepare(`
      SELECT d.*, e.name as employee_name, e.phone_number as employee_phone, e.department as employee_department
      FROM duties d
      LEFT JOIN employees e ON d.employee_id = e.employee_id
      WHERE d.id = ?
    `).get(req.params.id);

    if (!duty) {
      return res.status(404).json({ success: false, error: 'Duty not found' });
    }
    res.json({ success: true, data: duty });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST create duty (Automatically calculates reminder_time = reporting_time - 30 minutes)
router.post('/', (req, res) => {
  try {
    const { employee_id, duty_date, reporting_time } = req.body;

    if (!employee_id || !duty_date || !reporting_time) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: employee_id, duty_date (YYYY-MM-DD), and reporting_time (HH:mm or hh:mm AM/PM) are required.'
      });
    }

    // Verify employee exists
    const employee = db.prepare('SELECT * FROM employees WHERE employee_id = ?').get(employee_id);
    if (!employee) {
      return res.status(404).json({ success: false, error: `Employee '${employee_id}' not found.` });
    }

    // Calculate reminder time (reporting_time - 30 minutes in Asia/Kolkata)
    const timeCalc = calculateReminderTime(duty_date, reporting_time);
    const now = getCurrentDateTimeString();

    const stmt = db.prepare(`
      INSERT INTO duties (
        employee_id, duty_date, reporting_time, reminder_time, reminder_status, call_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'Pending', 'Pending', ?, ?)
    `);

    const result = stmt.run(
      employee_id,
      duty_date,
      timeCalc.reportingTimeFormatted,
      timeCalc.reminderDateTime,
      now,
      now
    );

    const createdDuty = db.prepare(`
      SELECT d.*, e.name as employee_name, e.phone_number as employee_phone, e.department as employee_department
      FROM duties d
      LEFT JOIN employees e ON d.employee_id = e.employee_id
      WHERE d.id = ?
    `).get(result.lastInsertRowid);

    console.log(`[API] Created duty for ${createdDuty.employee_name}: Reporting at ${createdDuty.reporting_time}, Reminder scheduled for ${createdDuty.reminder_time}`);

    broadcastUpdate('DATA_CHANGED', { action: 'DUTY_CREATED', duty: createdDuty });

    res.status(201).json({
      success: true,
      data: createdDuty,
      calculatedTimes: timeCalc,
      message: 'Duty scheduled successfully with auto-calculated 30-minute reminder time.'
    });
  } catch (error) {
    console.error('[API] Error creating duty:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT update duty
router.put('/:id', (req, res) => {
  try {
    const { duty_date, reporting_time, reminder_status } = req.body;
    const existing = db.prepare('SELECT * FROM duties WHERE id = ?').get(req.params.id);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Duty not found' });
    }

    const updatedDate = duty_date || existing.duty_date;
    const updatedReportingTime = reporting_time || existing.reporting_time;
    const updatedStatus = reminder_status || existing.reminder_status;

    // Recalculate reminder time if date or time changed
    let reminderDateTime = existing.reminder_time;
    let reportingTimeFormatted = existing.reporting_time;

    if (duty_date || reporting_time) {
      const timeCalc = calculateReminderTime(updatedDate, updatedReportingTime);
      reminderDateTime = timeCalc.reminderDateTime;
      reportingTimeFormatted = timeCalc.reportingTimeFormatted;
    }

    const now = getCurrentDateTimeString();

    const stmt = db.prepare(`
      UPDATE duties
      SET duty_date = ?, reporting_time = ?, reminder_time = ?, reminder_status = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(updatedDate, reportingTimeFormatted, reminderDateTime, updatedStatus, now, req.params.id);

    const updated = db.prepare(`
      SELECT d.*, e.name as employee_name, e.phone_number as employee_phone, e.department as employee_department
      FROM duties d
      LEFT JOIN employees e ON d.employee_id = e.employee_id
      WHERE d.id = ?
    `).get(req.params.id);

    broadcastUpdate('DATA_CHANGED', { action: 'DUTY_UPDATED', duty: updated });

    res.json({ success: true, data: updated, message: 'Duty updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST reset duty reminder status to 'Pending' (for testing)
router.post('/:id/reset', (req, res) => {
  try {
    const now = getCurrentDateTimeString();
    const stmt = db.prepare(`
      UPDATE duties
      SET reminder_status = 'Pending', call_status = 'Pending', updated_at = ?
      WHERE id = ?
    `);
    const result = stmt.run(now, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Duty not found' });
    }

    broadcastUpdate('DATA_CHANGED', { action: 'DUTY_RESET', id: req.params.id });

    res.json({ success: true, message: 'Duty reminder status reset to Pending.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE duty
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM duties WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Duty not found' });
    }

    broadcastUpdate('DATA_CHANGED', { action: 'DUTY_DELETED', id: req.params.id });

    res.json({ success: true, message: 'Duty deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;


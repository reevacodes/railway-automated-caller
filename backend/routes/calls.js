const express = require('express');
const router = express.Router();
const db = require('../config/db');
const telephonyService = require('../services/telephony/telephonyService');
const { getCurrentDateTimeString, getCurrentDateString } = require('../config/timezone');

// GET all call logs
router.get('/', (req, res) => {
  try {
    const { limit = 100, call_type } = req.query;

    let query = `
      SELECT 
        c.*,
        e.name as employee_name,
        e.department as employee_department,
        d.duty_date,
        d.reporting_time
      FROM call_logs c
      LEFT JOIN employees e ON c.employee_id = e.employee_id
      LEFT JOIN duties d ON c.duty_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (call_type) {
      query += ' AND c.call_type = ?';
      params.push(call_type);
    }

    query += ' ORDER BY c.id DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const logs = db.prepare(query).all(...params);
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('[API] Error fetching call logs:', error.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve call logs' });
  }
});

const { getSchedulerStatus, setSchedulerEnabled, processPendingReminders } = require('../scheduler/reminderScheduler');
const { broadcastUpdate } = require('../services/websocket');

// GET scheduler status
router.get('/scheduler', (req, res) => {
  try {
    const status = getSchedulerStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST toggle scheduler ON/OFF
router.post('/scheduler/toggle', (req, res) => {
  try {
    const { enabled } = req.body;
    const newState = setSchedulerEnabled(enabled !== undefined ? enabled : true);
    broadcastUpdate('DATA_CHANGED', { action: 'SCHEDULER_TOGGLED', enabled: newState });
    res.json({
      success: true,
      data: getSchedulerStatus(),
      message: `Automated background call scheduler is now ${newState ? 'ENABLED' : 'PAUSED'}.`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST force trigger pending reminders scan immediately
router.post('/scheduler/trigger', async (req, res) => {
  try {
    console.log('[API] Manual trigger requested for pending duty reminders scan...');
    const results = await processPendingReminders();
    res.json({
      success: true,
      dispatchedCount: results.length,
      results,
      status: getSchedulerStatus(),
      message: results.length > 0
        ? `Successfully processed and dispatched ${results.length} automated call reminder(s).`
        : 'No pending duty reminders were due at this time.'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET summary stats for Dashboard cards
router.get('/summary', (req, res) => {
  try {
    const todayStr = getCurrentDateString();

    const todaysDuties = db.prepare('SELECT COUNT(*) as count FROM duties WHERE duty_date = ?').get(todayStr).count;
    
    const pendingReminders = db.prepare(`
      SELECT COUNT(*) as count FROM duties 
      WHERE duty_date = ? AND reminder_status = 'Pending'
    `).get(todayStr).count;

    const callsCompleted = db.prepare(`
      SELECT COUNT(*) as count FROM call_logs 
      WHERE status IN ('answered', 'completed') AND strftime('%Y-%m-%d', created_at) = ?
    `).get(todayStr).count;

    const callsFailed = db.prepare(`
      SELECT COUNT(*) as count FROM call_logs 
      WHERE status IN ('failed', 'no-answer', 'busy') AND strftime('%Y-%m-%d', created_at) = ?
    `).get(todayStr).count;

    const schedulerInfo = getSchedulerStatus();

    res.json({
      success: true,
      data: {
        todaysDutiesCount: todaysDuties,
        pendingRemindersCount: pendingReminders,
        callsCompletedCount: callsCompleted,
        callsFailedCount: callsFailed,
        telephonyProvider: telephonyService.getProviderName(),
        isProviderConfigured: telephonyService.isConfigured(),
        demoMode: process.env.DEMO_MODE !== 'false',
        scheduler: schedulerInfo
      }
    });
  } catch (error) {
    console.error('[API] Error fetching summary:', error.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve summary stats' });
  }
});

/**
 * POST /api/calls/test
 * Initiates an explicit manual test call through Exotel
 */
router.post('/test', async (req, res) => {
  const targetPhone = req.body.destination_number || req.body.target_phone_number || req.body.phone_number;
  let employeeId = req.body.employee_id;

  if (!targetPhone) {
    return res.status(400).json({
      success: false,
      error: 'Destination phone number is required. Please provide phone_number or target_phone_number.'
    });
  }

  // Ensure employeeId exists in DB to satisfy Foreign Key constraint
  let empRecord = null;
  if (employeeId) {
    empRecord = db.prepare('SELECT employee_id FROM employees WHERE employee_id = ? OR id = ?').get(employeeId, employeeId);
  }
  if (!empRecord) {
    // Pick first available employee from seeded DB
    empRecord = db.prepare('SELECT employee_id FROM employees LIMIT 1').get();
  }
  const validEmployeeId = empRecord ? empRecord.employee_id : 'EMP-101';

  const voiceMessageText = "Hello. This is a test call from the Railway Duty Reminder System. If you can hear this message, the automated calling system is working correctly. Thank you.";
  const now = getCurrentDateTimeString();
  const webhookUrl = `${req.protocol}://${req.get('host')}/api/webhooks/exotel`;

  try {
    console.log(`[API] Processing explicit Test Call request to target number...`);

    // Call telephony abstraction layer
    const callResult = await telephonyService.callEmployee({
      phoneNumber: String(targetPhone).trim(),
      customMessage: voiceMessageText,
      webhookUrl,
      isTestCall: true
    });

    // Store resulting call information in SQLite call_logs table
    const stmt = db.prepare(`
      INSERT INTO call_logs (
        duty_id, employee_id, phone_number, provider_call_id, call_type, status, voice_message, started_at, created_at
      ) VALUES (NULL, ?, ?, ?, 'test_call', ?, ?, ?, ?)
    `);

    const result = stmt.run(
      validEmployeeId,
      String(targetPhone).trim(),
      callResult.providerCallId || null,
      callResult.status || 'initiated',
      voiceMessageText,
      now,
      now
    );

    const createdLog = db.prepare('SELECT * FROM call_logs WHERE id = ?').get(result.lastInsertRowid);

    broadcastUpdate('DATA_CHANGED', { action: 'TEST_CALL_DISPATCHED', callLog: createdLog });

    // Return response WITHOUT exposing any credentials
    res.json({
      success: true,
      message: 'Test call initiated successfully via Exotel',
      callLog: createdLog,
      telephonyDetails: {
        provider: callResult.provider,
        providerCallId: callResult.providerCallId,
        status: callResult.status
      }
    });
  } catch (error) {
    console.error(`[API] Test Call Error:`, error.message);

    // Log failed attempt in call_logs table for audit trail
    try {
      db.prepare(`
        INSERT INTO call_logs (
          duty_id, employee_id, phone_number, provider_call_id, call_type, status, voice_message, started_at, created_at
        ) VALUES (NULL, ?, ?, NULL, 'test_call', 'failed', ?, ?, ?)
      `).run(
        validEmployeeId,
        String(targetPhone).trim(),
        `Error: ${error.message}`,
        now,
        now
      );
    } catch (dbErr) {
      console.error('[API] Failed to record call log error:', dbErr.message);
    }

    res.status(400).json({
      success: false,
      error: error.message || 'Failed to initiate test call via Exotel'
    });
  }
});

module.exports = router;

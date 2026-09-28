const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { getCurrentDateTimeString } = require('../config/timezone');
const { broadcastUpdate } = require('../services/websocket');

/**
 * Exoml XML endpoint for Exotel Voice Messages / IVR Menu
 * GET or POST /api/webhooks/exoml
 */
router.all('/exoml', (req, res) => {
  try {
    const host = req.get('host') || 'localhost:5000';
    const protocol = req.protocol || 'http';
    const actionUrl = `${protocol}://${host}/api/webhooks/exoml/response`;

    const customMsg = (req.query && req.query.CustomField) || (req.body && req.body.CustomField) || 
      "Hello. This is an automated Railway duty reminder. Please press 1 to confirm your duty reporting, or press 2 to request control room assistance.";

    const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather action="${actionUrl}" method="POST" numDigits="1" timeout="10">
        <Say voice="female" language="en-IN">${customMsg}</Say>
    </Gather>
    <Say voice="female" language="en-IN">We did not receive any input. Thank you and goodbye.</Say>
</Response>`;

    res.set('Content-Type', 'text/xml');
    res.status(200).send(xmlResponse);
  } catch (err) {
    console.error('[Exoml] Error generating XML:', err);
    res.set('Content-Type', 'text/xml');
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Hello. This is an automated duty reminder. Press 1 to confirm. Thank you.</Say></Response>`);
  }
});

/**
 * Exoml Response handler for DTMF Keypress (Press 1 / Press 2)
 * POST or GET /api/webhooks/exoml/response
 */
router.all('/exoml/response', (req, res) => {
  try {
    const digits = (req.body && req.body.Digits) || (req.query && req.query.Digits) || 
                   (req.body && req.body.digits) || (req.query && req.query.digits) || '';
    const callSid = (req.body && req.body.CallSid) || (req.query && req.query.CallSid) || 
                    (req.body && req.body.Sid) || (req.query && req.query.Sid) || '';
    const now = getCurrentDateTimeString();

    console.log(`[Exoml:DTMF] Received keypress '${digits}' for CallSid '${callSid}'`);

    let responseMessage = "Thank you. Have a safe duty.";
    let confirmationStatus = "Acknowledged";
    let dutyStatus = "Completed";

    if (digits === '1') {
      confirmationStatus = "Confirmed (Press 1)";
      dutyStatus = "Confirmed";
      responseMessage = "Thank you! Your duty reporting has been successfully confirmed in the Railway portal. Have a safe duty. Goodbye.";
    } else if (digits === '2') {
      confirmationStatus = "Assistance Requested (Press 2)";
      dutyStatus = "Assistance Requested";
      responseMessage = "Your request for control room assistance has been logged. Divisional control will reach out to you shortly. Goodbye.";
    } else if (digits) {
      confirmationStatus = `Input '${digits}' Received`;
      dutyStatus = "Responded";
      responseMessage = "Option received. Thank you and goodbye.";
    }

    if (callSid) {
      const callLog = db.prepare('SELECT * FROM call_logs WHERE provider_call_id = ?').get(callSid);
      if (callLog) {
        db.prepare(`
          UPDATE call_logs
          SET dtmf_input = ?, confirmation_status = ?, status = 'completed', ended_at = ?
          WHERE id = ?
        `).run(digits || 'none', confirmationStatus, now, callLog.id);

        if (callLog.duty_id) {
          db.prepare(`
            UPDATE duties
            SET reminder_status = ?, call_status = 'Completed', confirmation_time = ?, next_retry_at = NULL, updated_at = ?
            WHERE id = ?
          `).run(dutyStatus, now, now, callLog.duty_id);
        }
      }
    } else {
      const latestLog = db.prepare('SELECT * FROM call_logs ORDER BY id DESC LIMIT 1').get();
      if (latestLog) {
        db.prepare(`
          UPDATE call_logs
          SET dtmf_input = ?, confirmation_status = ?, status = 'completed', ended_at = ?
          WHERE id = ?
        `).run(digits || '1', confirmationStatus, now, latestLog.id);

        if (latestLog.duty_id) {
          db.prepare(`
            UPDATE duties
            SET reminder_status = ?, call_status = 'Completed', confirmation_time = ?, next_retry_at = NULL, updated_at = ?
            WHERE id = ?
          `).run(dutyStatus, now, now, latestLog.duty_id);
        }
      }
    }

    // Broadcast instant WebSocket update
    broadcastUpdate('DATA_CHANGED', { source: 'DTMF_KEYPRESS', digits, confirmationStatus });

    const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="female" language="en-IN">${responseMessage}</Say>
</Response>`;

    res.set('Content-Type', 'text/xml');
    res.status(200).send(xmlResponse);
  } catch (err) {
    console.error('[Exoml:DTMF] Error processing DTMF response:', err);
    res.set('Content-Type', 'text/xml');
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you for your response. Goodbye.</Say></Response>`);
  }
});

/**
 * POST /api/webhooks/dtmf-simulate
 * Explicit endpoint for testing/simulating DTMF keypress input (e.g. Press 1 / Press 2)
 */
router.post('/dtmf-simulate', (req, res) => {
  try {
    const { call_log_id, duty_id, digits = '1' } = req.body;
    const now = getCurrentDateTimeString();

    let targetLog = null;
    if (call_log_id) {
      targetLog = db.prepare('SELECT * FROM call_logs WHERE id = ?').get(call_log_id);
    } else if (duty_id) {
      targetLog = db.prepare('SELECT * FROM call_logs WHERE duty_id = ? ORDER BY id DESC LIMIT 1').get(duty_id);
    } else {
      targetLog = db.prepare('SELECT * FROM call_logs ORDER BY id DESC LIMIT 1').get();
    }

    if (!targetLog) {
      return res.status(404).json({ success: false, error: 'No call log found to attach DTMF response.' });
    }

    let confirmationStatus = "Confirmed (Press 1)";
    let dutyStatus = "Confirmed";

    if (String(digits) === '1') {
      confirmationStatus = "Confirmed (Press 1)";
      dutyStatus = "Confirmed";
    } else if (String(digits) === '2') {
      confirmationStatus = "Assistance Requested (Press 2)";
      dutyStatus = "Assistance Requested";
    } else {
      confirmationStatus = `Input '${digits}' Received`;
      dutyStatus = "Responded";
    }

    db.prepare(`
      UPDATE call_logs
      SET dtmf_input = ?, confirmation_status = ?, status = 'completed', ended_at = ?
      WHERE id = ?
    `).run(String(digits), confirmationStatus, now, targetLog.id);

    if (targetLog.duty_id) {
      db.prepare(`
        UPDATE duties
        SET reminder_status = ?, call_status = 'Completed', confirmation_time = ?, updated_at = ?
        WHERE id = ?
      `).run(dutyStatus, now, now, targetLog.duty_id);
    }

    const updatedLog = db.prepare('SELECT * FROM call_logs WHERE id = ?').get(targetLog.id);

    broadcastUpdate('DATA_CHANGED', { source: 'DTMF_SIMULATE', digits, dutyStatus });

    res.json({
      success: true,
      message: `Simulated DTMF keypress '${digits}' recorded. Duty status updated to '${dutyStatus}'.`,
      data: updatedLog
    });
  } catch (err) {
    console.error('[API] DTMF Simulation Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Exotel Webhook status callback receiver
 * POST /api/webhooks/exotel
 */
router.post('/exotel', (req, res) => {
  try {
    const payload = req.body || {};
    console.log('[Webhook:Exotel] Received callback payload:', JSON.stringify(payload));

    const providerCallId = payload.CallSid || payload.Sid || payload.call_sid || payload.providerCallId;
    const rawStatus = (payload.Status || payload.status || payload.CallStatus || 'unknown').toLowerCase();
    const duration = parseInt(payload.CallDuration || payload.Duration || payload.duration || 0, 10);
    const digits = payload.Digits || payload.digits || payload.CustomFieldDigits || '';
    const now = getCurrentDateTimeString();

    let mappedStatus = rawStatus;
    if (rawStatus.includes('answer') || rawStatus === 'completed') {
      mappedStatus = 'answered';
    } else if (rawStatus.includes('busy')) {
      mappedStatus = 'busy';
    } else if (rawStatus.includes('no-answer') || rawStatus.includes('noanswer')) {
      mappedStatus = 'no-answer';
    } else if (rawStatus.includes('fail') || rawStatus.includes('canceled')) {
      mappedStatus = 'failed';
    } else if (rawStatus.includes('ring')) {
      mappedStatus = 'ringing';
    } else if (rawStatus.includes('init') || rawStatus.includes('queue')) {
      mappedStatus = 'initiated';
    }

    if (!providerCallId) {
      console.warn('[Webhook:Exotel] Callback missing CallSid/Sid. Payload:', payload);
      return res.status(200).json({ success: true, warning: 'No CallSid provided' });
    }

    const existingLog = db.prepare('SELECT * FROM call_logs WHERE provider_call_id = ?').get(providerCallId);

    if (existingLog) {
      let dtmfInput = existingLog.dtmf_input || digits || null;
      let confirmationStatus = existingLog.confirmation_status || null;
      let reminderStatusFinal = existingLog.duty_id ? 'Calling' : null;

      if (digits === '1') {
        dtmfInput = '1';
        confirmationStatus = 'Confirmed (Press 1)';
        reminderStatusFinal = 'Confirmed';
      } else if (digits === '2') {
        dtmfInput = '2';
        confirmationStatus = 'Assistance Requested (Press 2)';
        reminderStatusFinal = 'Assistance Requested';
      } else if (mappedStatus === 'answered' || mappedStatus === 'completed') {
        if (!reminderStatusFinal || reminderStatusFinal === 'Calling') {
          reminderStatusFinal = 'Completed';
        }
      } else if (mappedStatus === 'failed') {
        reminderStatusFinal = 'Failed';
      }

      const updateStmt = db.prepare(`
        UPDATE call_logs
        SET status = ?, duration = ?, ended_at = ?, dtmf_input = ?, confirmation_status = ?
        WHERE id = ?
      `);
      updateStmt.run(mappedStatus, duration, now, dtmfInput, confirmationStatus, existingLog.id);

      if (existingLog.duty_id) {
        const duty = db.prepare('SELECT * FROM duties WHERE id = ?').get(existingLog.duty_id);
        const { DateTime } = require('luxon');
        const nextRetryDt = DateTime.now().setZone('Asia/Kolkata').plus({ minutes: 5 }).toFormat('yyyy-MM-dd HH:mm:ss');
        const isUnanswered = ['no-answer', 'busy', 'failed'].includes(mappedStatus);
        const retryCount = duty ? (duty.retry_count || 0) : 0;
        const maxLimit = duty ? (duty.max_retries || 3) : 3;

        let finalReminderStatus = reminderStatusFinal || 'Completed';
        let calcNextRetry = null;

        if (isUnanswered && !['Confirmed', 'Assistance Requested'].includes(duty?.reminder_status)) {
          if (retryCount >= maxLimit) {
            finalReminderStatus = 'Escalated';
            calcNextRetry = null;
          } else {
            finalReminderStatus = mappedStatus === 'no-answer' ? 'No-Answer' : (mappedStatus === 'busy' ? 'Busy' : 'Failed');
            calcNextRetry = nextRetryDt;
          }
        }

        db.prepare(`
          UPDATE duties
          SET call_status = ?, reminder_status = ?, next_retry_at = ?, updated_at = ?
          WHERE id = ?
        `).run(mappedStatus, finalReminderStatus, calcNextRetry, now, existingLog.duty_id);
      }

      console.log(`[Webhook:Exotel] Updated Call Log #${existingLog.id} (CallSid: ${providerCallId}) to status '${mappedStatus}', DTMF: '${dtmfInput}'`);
    } else {
      console.log(`[Webhook:Exotel] Received webhook for untracked CallSid '${providerCallId}'. Status: '${mappedStatus}'`);
    }

    broadcastUpdate('DATA_CHANGED', { source: 'EXOTEL_WEBHOOK', mappedStatus });

    res.status(200).json({ success: true, status: mappedStatus, receivedCallSid: providerCallId });
  } catch (error) {
    console.error('[Webhook:Exotel] Error processing webhook:', error);
    res.status(200).json({ success: false, error: error.message });
  }
});

module.exports = router;


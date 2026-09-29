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

    // Render proxies HTTP to HTTPS, so req.protocol may be HTTP.
    // Force HTTPS for public Render URL.
    const protocol = host.includes('localhost') ? 'http' : 'https';

    const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
    const actionUrl = `${baseUrl}/api/webhooks/exoml/response`;

    const customMsg =
      (req.query && req.query.CustomField) ||
      (req.body && req.body.CustomField) ||
      "Hello. This is an automated Railway duty reminder. Please press 1 to confirm your duty reporting, or press 2 to request control room assistance.";

    const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather action="${actionUrl}" method="POST" numDigits="1" timeout="10">
        <Say>${customMsg}</Say>
    </Gather>
    <Say>We did not receive any input. Thank you and goodbye.</Say>
</Response>`;

    res.set('Content-Type', 'text/xml');
    res.status(200).send(xmlResponse);
  } catch (err) {
    console.error('[Exoml] Error generating XML:', err);

    res.set('Content-Type', 'text/xml');
    res.status(200).send(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Hello. This is an automated duty reminder. Press 1 to confirm. Thank you.</Say>
</Response>`
    );
  }
});


/**
 * ============================================================
 * Exoml Response handler for DTMF Keypress
 * Press 1 / Press 2
 *
 * POST or GET /api/webhooks/exoml/response
 * ============================================================
 */
router.all('/exoml/response', async (req, res) => {
  try {
    // ---------------------------------------------------------
    // Read DTMF digit
    // Exotel may send:
    //   Digits
    //   digits
    // through query parameters or request body.
    // ---------------------------------------------------------
    const digits =
      (req.body && (req.body.Digits || req.body.digits)) ||
      (req.query && (req.query.Digits || req.query.digits)) ||
      '';

    // ---------------------------------------------------------
    // Read Exotel Call SID
    // ---------------------------------------------------------
    const callSid =
      (req.body && (req.body.CallSid || req.body.Sid)) ||
      (req.query && (req.query.CallSid || req.query.Sid)) ||
      '';

    const normalizedDigits = String(digits || '')
      .trim()
      .replace(/^["']+|["']+$/g, '');
    const normalizedCallSid = String(callSid || '').trim();
    const now = getCurrentDateTimeString();

    console.log(
      `[Exoml:DTMF] Received keypress '${normalizedDigits}' for CallSid '${normalizedCallSid}'`
    );

    // ---------------------------------------------------------
    // Determine response based on key pressed
    // ---------------------------------------------------------
    let confirmationStatus;
    let dutyStatus;
    let responseMessage;

    if (normalizedDigits === '1') {
      confirmationStatus = 'Confirmed (Press 1)';
      dutyStatus = 'Confirmed';

      responseMessage =
        'Thank you! Your duty reporting has been successfully confirmed in the Railway portal. Have a safe duty. Goodbye.';
    } else if (normalizedDigits === '2') {
      confirmationStatus = 'Assistance Requested (Press 2)';
      dutyStatus = 'Assistance Requested';

      responseMessage =
        'Your request for control room assistance has been logged. Divisional control will reach out to you shortly. Goodbye.';
    } else if (normalizedDigits) {
      confirmationStatus = `Input '${normalizedDigits}' Received`;
      dutyStatus = 'Responded';

      responseMessage =
        'Option received. Thank you and goodbye.';
    } else {
      confirmationStatus = 'No Keypress';
      dutyStatus = 'Completed';

      responseMessage =
        'We did not receive any input. Thank you and goodbye.';
    }

    console.log(
      `[Exoml:DTMF] Interpreted response: ` +
      `digit='${normalizedDigits}', ` +
      `confirmation='${confirmationStatus}', ` +
      `dutyStatus='${dutyStatus}'`
    );


    // ---------------------------------------------------------
    // Find the EXACT call log using Exotel CallSid
    // ---------------------------------------------------------
    let callLog = null;

    if (normalizedCallSid) {
      const callLogRes = await db.query(
        `
        SELECT *
        FROM call_logs
        WHERE provider_call_id = $1
        ORDER BY id DESC
        LIMIT 1
        `,
        [normalizedCallSid]
      );

      console.log(
        `[Exoml:DTMF] Matching rows for CallSid '${normalizedCallSid}': ${callLogRes.rows.length}`
      );

      if (callLogRes.rows.length > 0) {
        callLog = callLogRes.rows[0];

        console.log(
          `[Exoml:DTMF] Matched Call Log #${callLog.id}, ` +
          `provider_call_id='${callLog.provider_call_id}', ` +
          `duty_id='${callLog.duty_id}'`
        );
      }
    }


    // ---------------------------------------------------------
    // If we cannot find the call log using CallSid,
    // DO NOT update a random call.
    //
    // This is safer because multiple calls may exist.
    // ---------------------------------------------------------
    if (!callLog) {
      console.error(
        `[Exoml:DTMF] ERROR: No call log found for CallSid '${normalizedCallSid}'`
      );

      console.error(
        `[Exoml:DTMF] DTMF '${normalizedDigits}' was received, ` +
        `but no matching call_logs row exists.`
      );
    }


    // ---------------------------------------------------------
    // Update call_logs
    // ---------------------------------------------------------
    if (callLog) {
      const updateCallLogResult = await db.query(
        `
        UPDATE call_logs
        SET
          dtmf_input = $1,
          confirmation_status = $2,
          status = 'completed',
          ended_at = $3
        WHERE id = $4
        `,
        [
          normalizedDigits || 'none',
          confirmationStatus,
          now,
          callLog.id
        ]
      );

      console.log(
        `[Exoml:DTMF] Call Log #${callLog.id} update affected ` +
        `${updateCallLogResult.rowCount} row(s)`
      );


      // -------------------------------------------------------
      // Verify the update
      // -------------------------------------------------------
      const verifyCallLogRes = await db.query(
        `
        SELECT
          id,
          provider_call_id,
          dtmf_input,
          confirmation_status,
          status,
          ended_at
        FROM call_logs
        WHERE id = $1
        `,
        [callLog.id]
      );

      if (verifyCallLogRes.rows.length > 0) {
        const updatedLog = verifyCallLogRes.rows[0];

        console.log(
          `[Exoml:DTMF] VERIFIED Call Log #${updatedLog.id}: ` +
          `DTMF='${updatedLog.dtmf_input}', ` +
          `Confirmation='${updatedLog.confirmation_status}', ` +
          `Status='${updatedLog.status}'`
        );
      }


      // -------------------------------------------------------
      // Update related duty
      // -------------------------------------------------------
      if (callLog.duty_id) {
        const updateDutyResult = await db.query(
          `
          UPDATE duties
          SET
            reminder_status = $1,
            call_status = 'Completed',
            confirmation_time = $2,
            next_retry_at = NULL,
            updated_at = $3
          WHERE id = $4
          `,
          [
            dutyStatus,
            now,
            now,
            callLog.duty_id
          ]
        );

        console.log(
          `[Exoml:DTMF] Duty #${callLog.duty_id} update affected ` +
          `${updateDutyResult.rowCount} row(s). ` +
          `New reminder_status='${dutyStatus}'`
        );
      }
    }


    // ---------------------------------------------------------
    // Broadcast real-time update to frontend
    // ---------------------------------------------------------
    broadcastUpdate('DATA_CHANGED', {
      source: 'DTMF_KEYPRESS',
      digits: normalizedDigits,
      confirmationStatus,
      dutyStatus
    });


    // ---------------------------------------------------------
    // Send response back to Exotel
    // ---------------------------------------------------------
    const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>${responseMessage}</Say>
</Response>`;

    res.set('Content-Type', 'text/xml');
    res.status(200).send(xmlResponse);

  } catch (err) {
    console.error(
      '[Exoml:DTMF] Error processing DTMF response:',
      err
    );

    // Always return valid ExoML so the call does not fail
    res.set('Content-Type', 'text/xml');

    res.status(200).send(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Thank you for your response. Goodbye.</Say>
</Response>`
    );
  }
});


/**
 * ============================================================
 * DTMF Simulation
 * POST /api/webhooks/dtmf-simulate
 *
 * Useful for testing the dashboard without making a real call.
 * ============================================================
 */
router.post('/dtmf-simulate', async (req, res) => {
  try {
    const {
      call_log_id,
      duty_id,
      digits = '1'
    } = req.body;

    const now = getCurrentDateTimeString();

    let targetLog = null;
    let targetLogRes;


    // ---------------------------------------------------------
    // Find target call log
    // ---------------------------------------------------------
    if (call_log_id) {
      targetLogRes = await db.query(
        'SELECT * FROM call_logs WHERE id = $1',
        [parseInt(call_log_id, 10)]
      );
    } else if (duty_id) {
      targetLogRes = await db.query(
        `
        SELECT *
        FROM call_logs
        WHERE duty_id = $1
        ORDER BY id DESC
        LIMIT 1
        `,
        [parseInt(duty_id, 10)]
      );
    } else {
      targetLogRes = await db.query(
        `
        SELECT *
        FROM call_logs
        ORDER BY id DESC
        LIMIT 1
        `
      );
    }


    if (targetLogRes.rows.length > 0) {
      targetLog = targetLogRes.rows[0];
    }


    if (!targetLog) {
      return res.status(404).json({
        success: false,
        error: 'No call log found to attach DTMF response.'
      });
    }


    // ---------------------------------------------------------
    // Determine response
    // ---------------------------------------------------------
    let confirmationStatus = 'Confirmed (Press 1)';
    let dutyStatus = 'Confirmed';

    if (String(digits) === '1') {
      confirmationStatus = 'Confirmed (Press 1)';
      dutyStatus = 'Confirmed';
    } else if (String(digits) === '2') {
      confirmationStatus = 'Assistance Requested (Press 2)';
      dutyStatus = 'Assistance Requested';
    } else {
      confirmationStatus = `Input '${digits}' Received`;
      dutyStatus = 'Responded';
    }


    // ---------------------------------------------------------
    // Update call log
    // ---------------------------------------------------------
    await db.query(
      `
      UPDATE call_logs
      SET
        dtmf_input = $1,
        confirmation_status = $2,
        status = 'completed',
        ended_at = $3
      WHERE id = $4
      `,
      [
        String(digits),
        confirmationStatus,
        now,
        targetLog.id
      ]
    );


    // ---------------------------------------------------------
    // Update duty
    // ---------------------------------------------------------
    if (targetLog.duty_id) {
      await db.query(
        `
        UPDATE duties
        SET
          reminder_status = $1,
          call_status = 'Completed',
          confirmation_time = $2,
          next_retry_at = NULL,
          updated_at = $3
        WHERE id = $4
        `,
        [
          dutyStatus,
          now,
          now,
          targetLog.duty_id
        ]
      );
    }


    // ---------------------------------------------------------
    // Get updated log
    // ---------------------------------------------------------
    const updatedLogRes = await db.query(
      'SELECT * FROM call_logs WHERE id = $1',
      [targetLog.id]
    );

    const updatedLog = updatedLogRes.rows[0];


    // ---------------------------------------------------------
    // Broadcast frontend update
    // ---------------------------------------------------------
    broadcastUpdate('DATA_CHANGED', {
      source: 'DTMF_SIMULATE',
      digits,
      dutyStatus
    });


    res.json({
      success: true,
      message:
        `Simulated DTMF keypress '${digits}' recorded. ` +
        `Duty status updated to '${dutyStatus}'.`,
      data: updatedLog
    });

  } catch (err) {
    console.error(
      '[API] DTMF Simulation Error:',
      err.message
    );

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});


/**
 * ============================================================
 * Exotel Webhook status callback receiver
 *
 * POST /api/webhooks/exotel
 * ============================================================
 */
router.post('/exotel', async (req, res) => {
  try {
    const payload = req.body || {};

    console.log(
      '[Webhook:Exotel] Received callback payload:',
      JSON.stringify(payload)
    );


    const providerCallId =
      payload.CallSid ||
      payload.Sid ||
      payload.call_sid ||
      payload.providerCallId;

    const rawStatus = (
      payload.Status ||
      payload.status ||
      payload.CallStatus ||
      'unknown'
    ).toLowerCase();

    const duration = parseInt(
      payload.CallDuration ||
      payload.Duration ||
      payload.duration ||
      0,
      10
    );

    const digits =
      payload.Digits ||
      payload.digits ||
      payload.CustomFieldDigits ||
      '';

    const now = getCurrentDateTimeString();


    // ---------------------------------------------------------
    // Map Exotel status to application status
    // ---------------------------------------------------------
    let mappedStatus = rawStatus;

    if (
      rawStatus.includes('answer') ||
      rawStatus === 'completed'
    ) {
      mappedStatus = 'answered';
    } else if (rawStatus.includes('busy')) {
      mappedStatus = 'busy';
    } else if (
      rawStatus.includes('no-answer') ||
      rawStatus.includes('noanswer')
    ) {
      mappedStatus = 'no-answer';
    } else if (
      rawStatus.includes('fail') ||
      rawStatus.includes('canceled')
    ) {
      mappedStatus = 'failed';
    } else if (rawStatus.includes('ring')) {
      mappedStatus = 'ringing';
    } else if (
      rawStatus.includes('init') ||
      rawStatus.includes('queue')
    ) {
      mappedStatus = 'initiated';
    }


    // ---------------------------------------------------------
    // No CallSid = nothing to update
    // ---------------------------------------------------------
    if (!providerCallId) {
      console.warn(
        '[Webhook:Exotel] Callback missing CallSid/Sid. Payload:',
        payload
      );

      return res.status(200).json({
        success: true,
        warning: 'No CallSid provided'
      });
    }


    // ---------------------------------------------------------
    // Find call log
    // ---------------------------------------------------------
    const existingLogRes = await db.query(
      `
      SELECT *
      FROM call_logs
      WHERE provider_call_id = $1
      ORDER BY id DESC
      LIMIT 1
      `,
      [providerCallId]
    );


    if (existingLogRes.rows.length > 0) {
      const existingLog = existingLogRes.rows[0];

      let dtmfInput =
        existingLog.dtmf_input ||
        digits ||
        null;

      let confirmationStatus =
        existingLog.confirmation_status ||
        null;

      let reminderStatusFinal =
        existingLog.duty_id
          ? 'Calling'
          : null;


      // -------------------------------------------------------
      // Preserve DTMF confirmation if already received
      // -------------------------------------------------------
      if (String(dtmfInput) === '1') {
        dtmfInput = '1';
        confirmationStatus = 'Confirmed (Press 1)';
        reminderStatusFinal = 'Confirmed';

      } else if (String(dtmfInput) === '2') {
        dtmfInput = '2';
        confirmationStatus = 'Assistance Requested (Press 2)';
        reminderStatusFinal = 'Assistance Requested';

      } else if (digits === '1') {
        dtmfInput = '1';
        confirmationStatus = 'Confirmed (Press 1)';
        reminderStatusFinal = 'Confirmed';

      } else if (digits === '2') {
        dtmfInput = '2';
        confirmationStatus = 'Assistance Requested (Press 2)';
        reminderStatusFinal = 'Assistance Requested';

      } else if (
        mappedStatus === 'answered' ||
        mappedStatus === 'completed'
      ) {
        if (
          !reminderStatusFinal ||
          reminderStatusFinal === 'Calling'
        ) {
          reminderStatusFinal = 'Completed';
        }

      } else if (mappedStatus === 'failed') {
        reminderStatusFinal = 'Failed';
      }


      // -------------------------------------------------------
      // Update call log
      // -------------------------------------------------------
      await db.query(
        `
        UPDATE call_logs
        SET
          status = $1,
          duration = $2,
          ended_at = $3,
          dtmf_input = $4,
          confirmation_status = $5
        WHERE id = $6
        `,
        [
          mappedStatus,
          duration,
          now,
          dtmfInput,
          confirmationStatus,
          existingLog.id
        ]
      );


      // -------------------------------------------------------
      // Update related duty
      // -------------------------------------------------------
      if (existingLog.duty_id) {
        const dutyRes = await db.query(
          'SELECT * FROM duties WHERE id = $1',
          [existingLog.duty_id]
        );

        const duty =
          dutyRes.rows.length > 0
            ? dutyRes.rows[0]
            : null;


        const { DateTime } = require('luxon');

        const nextRetryDt = DateTime
          .now()
          .setZone('Asia/Kolkata')
          .plus({ minutes: 5 })
          .toFormat('yyyy-MM-dd HH:mm:ss');


        const isUnanswered = [
          'no-answer',
          'busy',
          'failed'
        ].includes(mappedStatus);


        const retryCount =
          duty
            ? (duty.retry_count || 0)
            : 0;

        const maxLimit =
          duty
            ? (duty.max_retries || 3)
            : 3;


        let finalReminderStatus =
          reminderStatusFinal || 'Completed';

        let calcNextRetry = null;


        // -----------------------------------------------------
        // Retry only when nobody answered
        // -----------------------------------------------------
        if (
          isUnanswered &&
          ![
            'Confirmed',
            'Assistance Requested'
          ].includes(duty?.reminder_status)
        ) {
          if (retryCount >= maxLimit) {
            finalReminderStatus = 'Escalated';
            calcNextRetry = null;
          } else {
            finalReminderStatus =
              mappedStatus === 'no-answer'
                ? 'No-Answer'
                : mappedStatus === 'busy'
                  ? 'Busy'
                  : 'Failed';

            calcNextRetry = nextRetryDt;
          }
        }


        // -----------------------------------------------------
        // IMPORTANT:
        // If DTMF confirmation already exists, preserve it.
        // Do NOT replace Confirmed with Completed.
        // -----------------------------------------------------
        if (existingLog.dtmf_input === '1') {
          finalReminderStatus = 'Confirmed';
          calcNextRetry = null;

        } else if (existingLog.dtmf_input === '2') {
          finalReminderStatus = 'Assistance Requested';
          calcNextRetry = null;
        }


        await db.query(
          `
          UPDATE duties
          SET
            call_status = $1,
            reminder_status = $2,
            next_retry_at = $3,
            updated_at = $4
          WHERE id = $5
          `,
          [
            mappedStatus,
            finalReminderStatus,
            calcNextRetry,
            now,
            existingLog.duty_id
          ]
        );
      }


      console.log(
        `[Webhook:Exotel] Updated Call Log #${existingLog.id} ` +
        `(CallSid: ${providerCallId}) ` +
        `to status '${mappedStatus}', ` +
        `DTMF: '${dtmfInput}', ` +
        `Confirmation: '${confirmationStatus}'`
      );

    } else {
      console.log(
        `[Webhook:Exotel] Received webhook for untracked ` +
        `CallSid '${providerCallId}'. Status: '${mappedStatus}'`
      );
    }


    // ---------------------------------------------------------
    // Notify frontend
    // ---------------------------------------------------------
    broadcastUpdate('DATA_CHANGED', {
      source: 'EXOTEL_WEBHOOK',
      mappedStatus
    });


    res.status(200).json({
      success: true,
      status: mappedStatus,
      receivedCallSid: providerCallId
    });

  } catch (error) {
    console.error(
      '[Webhook:Exotel] Error processing webhook:',
      error
    );

    // Return 200 so Exotel doesn't repeatedly retry the webhook.
    res.status(200).json({
      success: false,
      error: error.message
    });
  }
});


module.exports = router;
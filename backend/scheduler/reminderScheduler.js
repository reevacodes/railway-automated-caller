const cron = require('node-cron');
const db = require('../config/db');
const { getCurrentDateTimeString, getCurrentDateString } = require('../config/timezone');
const telephonyService = require('../services/telephony/telephonyService');

let isRunning = false;
let autoSchedulerEnabled = process.env.ENABLE_AUTOMATIC_SCHEDULER === 'true';
let cronTask = null;

function initScheduler() {
  autoSchedulerEnabled = process.env.ENABLE_AUTOMATIC_SCHEDULER === 'true';

  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }

  if (!autoSchedulerEnabled) {
    console.log('[Scheduler] Automatic background call scheduler is currently PAUSED.');
    console.log('[Scheduler] Set ENABLE_AUTOMATIC_SCHEDULER=true or toggle ON from dashboard to resume.');
    return;
  }

  console.log('[Scheduler] ⏰ Initializing automated duty reminder cron job (running every 60 seconds)...');

  cronTask = cron.schedule('* * * * *', async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await processPendingReminders();
    } catch (err) {
      console.error('[Scheduler] Error during reminder processing cycle:', err.message);
    } finally {
      isRunning = false;
    }
  });

  console.log('[Scheduler] Cron job registered successfully.');
}

function setSchedulerEnabled(enabled) {
  autoSchedulerEnabled = Boolean(enabled);
  process.env.ENABLE_AUTOMATIC_SCHEDULER = autoSchedulerEnabled ? 'true' : 'false';
  initScheduler();
  return autoSchedulerEnabled;
}

function getSchedulerStatus() {
  const currentKolkataTimeStr = getCurrentDateTimeString();
  const dueCount = db.prepare(`
    SELECT COUNT(*) as count FROM duties d
    JOIN employees e ON d.employee_id = e.employee_id
    WHERE d.reminder_status = 'Pending'
      AND d.reminder_time <= ?
      AND e.is_active = 1
  `).get(currentKolkataTimeStr).count;

  const totalPending = db.prepare(`
    SELECT COUNT(*) as count FROM duties
    WHERE reminder_status = 'Pending'
  `).get().count;

  return {
    enabled: autoSchedulerEnabled,
    isRunning,
    dueCount,
    totalPending,
    currentKolkataTime: currentKolkataTimeStr
  };
}

/**
 * Process all duties due for initial reminder OR due for an unanswered 5-minute retry call
 */
async function processPendingReminders() {
  const currentKolkataTimeStr = getCurrentDateTimeString();

  // 1. Initial 30-minute advance calls due (reminder_status = 'Pending' AND reminder_time <= now)
  const initialDuties = db.prepare(`
    SELECT d.*, e.name as employee_name, e.phone_number as employee_phone, e.is_active as employee_active
    FROM duties d
    JOIN employees e ON d.employee_id = e.employee_id
    WHERE d.reminder_status = 'Pending'
      AND d.reminder_time <= ?
      AND e.is_active = 1
  `).all(currentKolkataTimeStr);

  // 2. Unanswered / Busy / Failed retry calls due (next_retry_at <= now AND retry_count < max_retries)
  const retryDuties = db.prepare(`
    SELECT d.*, e.name as employee_name, e.phone_number as employee_phone, e.is_active as employee_active
    FROM duties d
    JOIN employees e ON d.employee_id = e.employee_id
    WHERE d.reminder_status IN ('No-Answer', 'Busy', 'Failed')
      AND d.next_retry_at IS NOT NULL
      AND d.next_retry_at <= ?
      AND d.retry_count < COALESCE(d.max_retries, 3)
      AND e.is_active = 1
  `).all(currentKolkataTimeStr);

  const allDutiesToCall = [...initialDuties, ...retryDuties];
  if (allDutiesToCall.length === 0) return [];

  console.log(`[Scheduler] Process cycle: ${initialDuties.length} initial due call(s), ${retryDuties.length} unanswered 5-min retry call(s) due as of ${currentKolkataTimeStr}`);

  const results = [];
  for (const duty of allDutiesToCall) {
    const isRetry = duty.reminder_status !== 'Pending';
    const res = await processSingleDutyReminder(duty, isRetry);
    if (res) results.push(res);
  }
  return results;
}

async function processSingleDutyReminder(duty, isRetry = false) {
  const now = getCurrentDateTimeString();
  const currentRetryCount = (duty.retry_count || 0) + (isRetry ? 1 : 0);

  const lockResult = db.prepare(`
    UPDATE duties
    SET reminder_status = 'Processing', updated_at = ?
    WHERE id = ? AND reminder_status = ?
  `).run(now, duty.id, duty.reminder_status);

  if (lockResult.changes === 0) return null;

  console.log(`[Scheduler] 🚨 AUTOMATED CALL DISPATCH ${isRetry ? `(RETRY #${currentRetryCount})` : '(INITIAL)'}: Calling ${duty.employee_name} (${duty.employee_phone}) for Duty #${duty.id}`);

  try {
    const callResult = await telephonyService.callEmployee({
      phoneNumber: duty.employee_phone,
      employeeName: duty.employee_name,
      dutyTime: duty.reporting_time
    });

    const voiceMsg = isRetry 
      ? `Hello ${duty.employee_name}. This is an automated retry call from Railway duty control. Your duty is scheduled today at ${duty.reporting_time}. Please press 1 to confirm, or press 2 for assistance.`
      : `Hello ${duty.employee_name}. This is an automated duty reminder. Your duty is scheduled today at ${duty.reporting_time}. Please report on time. Thank you.`;

    const callType = isRetry ? `auto_retry_${currentRetryCount}` : 'scheduled_reminder';

    db.prepare(`
      INSERT INTO call_logs (
        duty_id, employee_id, phone_number, provider_call_id, call_type, status, voice_message, started_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      duty.id,
      duty.employee_id,
      duty.employee_phone,
      callResult.providerCallId || null,
      callResult.status || 'initiated',
      voiceMsg,
      now,
      now
    );

    const { DateTime } = require('luxon');
    const nextRetryDt = DateTime.now().setZone('Asia/Kolkata').plus({ minutes: 5 }).toFormat('yyyy-MM-dd HH:mm:ss');

    db.prepare(`
      UPDATE duties
      SET reminder_status = 'Calling', call_status = ?, retry_count = ?, next_retry_at = ?, updated_at = ?
      WHERE id = ?
    `).run(callResult.status || 'initiated', currentRetryCount, nextRetryDt, now, duty.id);

    console.log(`[Scheduler] ✅ Call successfully dispatched. SID: ${callResult.providerCallId}`);

    const { broadcastUpdate } = require('../services/websocket');
    broadcastUpdate('DATA_CHANGED', { source: 'SCHEDULER', dutyId: duty.id, isRetry, retryCount: currentRetryCount });

    return { dutyId: duty.id, success: true, callSid: callResult.providerCallId };
  } catch (error) {
    console.error(`[Scheduler] ❌ Call failed for Duty #${duty.id}:`, error.message);
    const { DateTime } = require('luxon');
    const nextRetryDt = DateTime.now().setZone('Asia/Kolkata').plus({ minutes: 5 }).toFormat('yyyy-MM-dd HH:mm:ss');
    const maxLimit = duty.max_retries || 3;
    const isExhausted = currentRetryCount >= maxLimit;

    db.prepare(`
      UPDATE duties
      SET reminder_status = ?, call_status = 'Failed', retry_count = ?, next_retry_at = ?, updated_at = ?
      WHERE id = ?
    `).run(isExhausted ? 'Escalated' : 'Failed', currentRetryCount, isExhausted ? null : nextRetryDt, now, duty.id);

    const { broadcastUpdate } = require('../services/websocket');
    broadcastUpdate('DATA_CHANGED', { source: 'SCHEDULER_FAILED', dutyId: duty.id });

    return { dutyId: duty.id, success: false, error: error.message };
  }
}

module.exports = {
  initScheduler,
  setSchedulerEnabled,
  getSchedulerStatus,
  processPendingReminders
};


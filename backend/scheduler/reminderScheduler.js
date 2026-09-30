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
      await generateDutiesFromSchedules();
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

async function getSchedulerStatus() {
  const currentKolkataTimeStr = getCurrentDateTimeString();
  const dueCountRes = await db.query(`
    SELECT COUNT(*) as count FROM duties d
    JOIN employees e ON d.employee_id = e.employee_id
    WHERE d.reminder_status = 'Pending'
      AND d.reminder_time <= $1
      AND e.is_active = 1
  `, [currentKolkataTimeStr]);
  const dueCount = parseInt(dueCountRes.rows[0].count, 10);

  const totalPendingRes = await db.query(`
    SELECT COUNT(*) as count FROM duties
    WHERE reminder_status = 'Pending'
  `);
  const totalPending = parseInt(totalPendingRes.rows[0].count, 10);

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
  const initialDutiesRes = await db.query(`
    SELECT d.*, e.name as employee_name, e.phone_number as employee_phone, e.is_active as employee_active
    FROM duties d
    JOIN employees e ON d.employee_id = e.employee_id
    WHERE d.reminder_status = 'Pending'
      AND d.reminder_time <= $1
      AND e.is_active = 1
  `, [currentKolkataTimeStr]);
  const initialDuties = initialDutiesRes.rows;

  // 2. Unanswered / Busy / Failed retry calls due (next_retry_at <= now AND retry_count < max_retries)
  const retryDutiesRes = await db.query(`
    SELECT d.*, e.name as employee_name, e.phone_number as employee_phone, e.is_active as employee_active
    FROM duties d
    JOIN employees e ON d.employee_id = e.employee_id
    WHERE d.reminder_status IN ('No-Answer', 'Busy', 'Failed')
      AND d.next_retry_at IS NOT NULL
      AND d.next_retry_at <= $1
      AND d.retry_count < COALESCE(d.max_retries, 3)
      AND e.is_active = 1
  `, [currentKolkataTimeStr]);
  const retryDuties = retryDutiesRes.rows;

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

  const lockResult = await db.query(`
    UPDATE duties
    SET reminder_status = 'Processing', updated_at = $1
    WHERE id = $2 AND reminder_status = $3
  `, [now, duty.id, duty.reminder_status]);

  if (lockResult.rowCount === 0) return null;

  console.log(`[Scheduler] 🚨 AUTOMATED CALL DISPATCH ${isRetry ? `(RETRY #${currentRetryCount})` : '(INITIAL)'}: Calling ${duty.employee_name} (${duty.employee_phone}) for Duty #${duty.id}`);

  try {
    const webhookUrl = `${process.env.APP_URL || 'https://railway-automated-caller.onrender.com'}/api/webhooks/exotel`;

    const callResult = await telephonyService.callEmployee({
      phoneNumber: duty.employee_phone,
      employeeName: duty.employee_name,
      dutyTime: duty.reporting_time,
      webhookUrl: webhookUrl
    });

    const voiceMsg = isRetry 
      ? `Hello ${duty.employee_name}. This is an automated retry call from Railway duty control. Your duty is scheduled today at ${duty.reporting_time}. Please press 1 to confirm, or press 2 for assistance.`
      : `Hello ${duty.employee_name}. This is an automated duty reminder. Your duty is scheduled today at ${duty.reporting_time}. Please report on time. Thank you.`;

    const callType = isRetry ? `auto_retry_${currentRetryCount}` : 'scheduled_reminder';

    await db.query(`
      INSERT INTO call_logs (
        duty_id, employee_id, phone_number, provider_call_id, call_type, status, voice_message, started_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      duty.id,
      duty.employee_id,
      duty.employee_phone,
      callResult.providerCallId || null,
      callType,
      callResult.status || 'initiated',
      voiceMsg,
      now,
      now
    ]);

    const { DateTime } = require('luxon');
    const nextRetryDt = DateTime.now().setZone('Asia/Kolkata').plus({ minutes: 5 }).toFormat('yyyy-MM-dd HH:mm:ss');

    await db.query(`
      UPDATE duties
      SET reminder_status = 'Calling', call_status = $1, retry_count = $2, next_retry_at = $3, updated_at = $4
      WHERE id = $5
    `, [callResult.status || 'initiated', currentRetryCount, nextRetryDt, now, duty.id]);

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

    await db.query(`
      UPDATE duties
      SET reminder_status = $1, call_status = 'Failed', retry_count = $2, next_retry_at = $3, updated_at = $4
      WHERE id = $5
    `, [isExhausted ? 'Escalated' : 'Failed', currentRetryCount, isExhausted ? null : nextRetryDt, now, duty.id]);

    const { broadcastUpdate } = require('../services/websocket');
    broadcastUpdate('DATA_CHANGED', { source: 'SCHEDULER_FAILED', dutyId: duty.id });

    return { dutyId: duty.id, success: false, error: error.message };
  }
}

/**
 * Generate duty instances from active weekly employee schedules.
 */
async function generateDutiesFromSchedules() {
  const { DateTime } = require('luxon');
  const { calculateReminderTime } = require('../config/timezone');
  
  const now = DateTime.now().setZone('Asia/Kolkata');
  const todayDateStr = now.toFormat('yyyy-MM-dd');
  const todayWeekday = now.weekdayLong.toLowerCase(); // 'monday', 'tuesday', etc.

  try {
    // 1. Get active schedules where today is selected
    const schedulesRes = await db.query(`
      SELECT s.*, e.is_active as employee_active
      FROM employee_schedules s
      JOIN employees e ON s.employee_id = e.employee_id
      WHERE s.is_active = true AND s.${todayWeekday} = true AND e.is_active = 1
    `);

    for (const schedule of schedulesRes.rows) {
      // 2. Generate it! We use calculateReminderTime to precisely format the times.
      // We rely on PostgreSQL's atomic ON CONFLICT DO NOTHING to prevent duplicate generation
      // and safely ignore manually created duties or duplicate scheduler ticks.
      const timeCalc = calculateReminderTime(todayDateStr, schedule.reporting_time);
      const nowStr = getCurrentDateTimeString();

      const insertRes = await db.query(`
        INSERT INTO duties (
          employee_id, duty_date, reporting_time, reminder_time, reminder_status, call_status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'Pending', 'Pending', $5, $6)
        ON CONFLICT (employee_id, duty_date) DO NOTHING
        RETURNING id
      `, [
        schedule.employee_id,
        todayDateStr,
        timeCalc.reportingTimeFormatted,
        timeCalc.reminderDateTime,
        nowStr,
        nowStr
      ]);

      if (insertRes.rows.length > 0) {
        console.log(`[Scheduler] Auto-generated weekly duty #${insertRes.rows[0].id} for ${schedule.employee_id} on ${todayDateStr}`);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error auto-generating duties from schedules:', err.message);
  }
}

module.exports = {
  initScheduler,
  setSchedulerEnabled,
  getSchedulerStatus,
  processPendingReminders,
  generateDutiesFromSchedules
};

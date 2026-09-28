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
 * Process all duties whose reminder time has arrived and status is 'Pending'
 */
async function processPendingReminders() {
  const currentKolkataTimeStr = getCurrentDateTimeString();

  const pendingDuties = db.prepare(`
    SELECT d.*, e.name as employee_name, e.phone_number as employee_phone, e.is_active as employee_active
    FROM duties d
    JOIN employees e ON d.employee_id = e.employee_id
    WHERE d.reminder_status = 'Pending'
      AND d.reminder_time <= ?
      AND e.is_active = 1
  `).all(currentKolkataTimeStr);

  if (pendingDuties.length === 0) return [];

  console.log(`[Scheduler] Found ${pendingDuties.length} pending duty reminder(s) due as of ${currentKolkataTimeStr}`);

  const results = [];
  for (const duty of pendingDuties) {
    const res = await processSingleDutyReminder(duty);
    if (res) results.push(res);
  }
  return results;
}

async function processSingleDutyReminder(duty) {
  const now = getCurrentDateTimeString();

  const lockResult = db.prepare(`
    UPDATE duties
    SET reminder_status = 'Processing', updated_at = ?
    WHERE id = ? AND reminder_status = 'Pending'
  `).run(now, duty.id);

  if (lockResult.changes === 0) return null;

  console.log(`[Scheduler] 🚨 AUTOMATED CALL DISPATCH: Calling ${duty.employee_name} (${duty.employee_phone}) for Duty #${duty.id}`);

  try {
    const callResult = await telephonyService.callEmployee({
      phoneNumber: duty.employee_phone,
      employeeName: duty.employee_name,
      dutyTime: duty.reporting_time
    });

    const voiceMsg = `Hello ${duty.employee_name}. This is an automated duty reminder. Your duty is scheduled today at ${duty.reporting_time}. Please report on time. Thank you.`;

    db.prepare(`
      INSERT INTO call_logs (
        duty_id, employee_id, phone_number, provider_call_id, call_type, status, voice_message, started_at, created_at
      ) VALUES (?, ?, ?, ?, 'scheduled_reminder', ?, ?, ?, ?)
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

    db.prepare(`
      UPDATE duties
      SET reminder_status = ?, call_status = ?, updated_at = ?
      WHERE id = ?
    `).run('Calling', callResult.status || 'initiated', now, duty.id);

    console.log(`[Scheduler] ✅ Call successfully dispatched. SID: ${callResult.providerCallId}`);

    const { broadcastUpdate } = require('../services/websocket');
    broadcastUpdate('DATA_CHANGED', { source: 'SCHEDULER', dutyId: duty.id, callSid: callResult.providerCallId });

    return { dutyId: duty.id, success: true, callSid: callResult.providerCallId };
  } catch (error) {
    console.error(`[Scheduler] ❌ Call failed for Duty #${duty.id}:`, error.message);
    db.prepare(`
      UPDATE duties
      SET reminder_status = 'Failed', call_status = 'Failed', updated_at = ?
      WHERE id = ?
    `).run(now, duty.id);

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


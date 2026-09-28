const { DateTime } = require('luxon');

const TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

/**
 * Get current DateTime object in Asia/Kolkata timezone
 */
function getNow() {
  return DateTime.now().setZone(TIMEZONE);
}

/**
 * Get current date string in YYYY-MM-DD format (Kolkata time)
 */
function getCurrentDateString() {
  return getNow().toFormat('yyyy-MM-dd');
}

/**
 * Get current date & time string in YYYY-MM-DD HH:mm format (Kolkata time)
 */
function getCurrentDateTimeString() {
  return getNow().toFormat('yyyy-MM-dd HH:mm');
}

/**
 * Calculate reminder time (reporting_time - 30 minutes)
 * @param {string} dutyDateStr - Format: YYYY-MM-DD
 * @param {string} reportingTimeStr - Format: HH:mm (24-hour e.g. "10:00" or "14:30")
 * @returns {{ reportingDateTime: string, reminderDateTime: string, reminderTimeFormatted: string, reportingTimeFormatted: string }}
 */
function calculateReminderTime(dutyDateStr, reportingTimeStr) {
  // Parse date and time in Asia/Kolkata timezone
  const fullStr = `${dutyDateStr} ${reportingTimeStr}`;
  let dt = DateTime.fromFormat(fullStr, 'yyyy-MM-dd HH:mm', { zone: TIMEZONE });
  
  if (!dt.isValid) {
    // Try 12-hour format if passed like "10:00 AM"
    dt = DateTime.fromFormat(fullStr, 'yyyy-MM-dd h:mm a', { zone: TIMEZONE });
  }

  if (!dt.isValid) {
    throw new Error(`Invalid date/time format: ${dutyDateStr} ${reportingTimeStr}`);
  }

  const reminderDt = dt.minus({ minutes: 30 });

  return {
    reportingDateTime: dt.toFormat('yyyy-MM-dd HH:mm'),
    reminderDateTime: reminderDt.toFormat('yyyy-MM-dd HH:mm'),
    reportingTimeFormatted: dt.toFormat('hh:mm a'),
    reminderTimeFormatted: reminderDt.toFormat('hh:mm a')
  };
}

/**
 * Check if a reminder datetime string (yyyy-MM-DD HH:mm) has arrived or passed in Kolkata time
 * @param {string} reminderDateTimeStr 
 * @returns {boolean}
 */
function isReminderDue(reminderDateTimeStr) {
  const now = getNow();
  const reminderDt = DateTime.fromFormat(reminderDateTimeStr, 'yyyy-MM-dd HH:mm', { zone: TIMEZONE });
  if (!reminderDt.isValid) return false;
  return now >= reminderDt;
}

module.exports = {
  TIMEZONE,
  getNow,
  getCurrentDateString,
  getCurrentDateTimeString,
  calculateReminderTime,
  isReminderDue
};

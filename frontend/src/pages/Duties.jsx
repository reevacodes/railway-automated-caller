import React, { useState, useEffect } from 'react';
import { getDuties, createDuty, deleteDuty, resetDutyStatus, getEmployees } from '../services/api';
import { CalendarPlus, Trash2, RefreshCw, Clock, Sparkles } from 'lucide-react';
import { DateTime } from 'luxon';

export default function Duties() {
  const [duties, setDuties] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionSuccess, setActionSuccess] = useState('');

  // Form inputs
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [dutyDate, setDutyDate] = useState(() => {
    return DateTime.now().setZone('Asia/Kolkata').toFormat('yyyy-MM-dd');
  });
  const [reportingTime, setReportingTime] = useState('10:00');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dutiesRes, empRes] = await Promise.all([
        getDuties(),
        getEmployees({ active_only: 'true' })
      ]);

      if (dutiesRes.success) setDuties(dutiesRes.data);
      if (empRes.success) {
        setEmployees(empRes.data);
        if (empRes.data.length > 0 && !selectedEmpId) {
          setSelectedEmpId(empRes.data[0].employee_id);
        }
      }
    } catch (err) {
      console.error('Error loading duties:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 1500);
    return () => clearInterval(interval);
  }, []);

  // Calculate preview reminder time on the fly
  const calculatePreview = () => {
    if (!dutyDate || !reportingTime) return null;
    try {
      const full = `${dutyDate} ${reportingTime}`;
      let dt = DateTime.fromFormat(full, 'yyyy-MM-dd HH:mm', { zone: 'Asia/Kolkata' });
      if (!dt.isValid) {
        dt = DateTime.fromFormat(full, 'yyyy-MM-dd h:mm a', { zone: 'Asia/Kolkata' });
      }
      if (!dt.isValid) return null;

      const reminderDt = dt.minus({ minutes: 30 });
      return {
        dutyFormatted: dt.toFormat('hh:mm a'),
        reminderFormatted: reminderDt.toFormat('hh:mm a'),
        reminderFull: reminderDt.toFormat('yyyy-MM-dd HH:mm')
      };
    } catch (e) {
      return null;
    }
  };

  const preview = calculatePreview();

  // Quick helper: Set duty reporting time 31 minutes from now, so reminder time is 1 minute from now!
  const setQuickTestTimer = () => {
    const nowKolkata = DateTime.now().setZone('Asia/Kolkata');
    // Reporting time = Now + 31 mins => Reminder time = Now + 1 min!
    const targetDutyTime = nowKolkata.plus({ minutes: 31 });

    setDutyDate(targetDutyTime.toFormat('yyyy-MM-dd'));
    setReportingTime(targetDutyTime.toFormat('HH:mm'));
    setActionSuccess(`Set quick test duty! Reporting time is ${targetDutyTime.toFormat('hh:mm a')}. Reminder will trigger in 1 minute at ${targetDutyTime.minus({ minutes: 30 }).toFormat('hh:mm a')}.`);
  };

  const handleCreateDuty = async (e) => {
    e.preventDefault();
    setFormError('');
    setActionSuccess('');

    if (!selectedEmpId) {
      setFormError('Please select an employee');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createDuty({
        employee_id: selectedEmpId,
        duty_date: dutyDate,
        reporting_time: reportingTime
      });

      if (res.success && res.data) {
        setActionSuccess(`Duty created successfully for ${res.data.employee_name || selectedEmpId}! Reminder scheduled for ${res.data.reminder_time}`);
        setDuties(prev => [res.data, ...prev.filter(d => d.id !== res.data.id)]);
        loadData();
      } else {
        setFormError(res.error || 'Failed to create duty');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDuty = async (id) => {
    if (!window.confirm('Are you sure you want to delete this duty schedule?')) return;
    try {
      await deleteDuty(id);
      setActionSuccess('Duty deleted');
      loadData();
    } catch (err) {
      alert(`Error deleting duty: ${err.message}`);
    }
  };

  const handleResetStatus = async (id) => {
    try {
      await resetDutyStatus(id);
      setActionSuccess('Reminder status reset to Pending!');
      loadData();
    } catch (err) {
      alert(`Error resetting duty: ${err.message}`);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Duty Scheduling & Reminders</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            System automatically calculates <code>reminder_time = reporting_time - 30 mins</code> in <code>Asia/Kolkata</code>.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadData} disabled={loading}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {actionSuccess && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          color: '#34d399',
          fontSize: '0.85rem',
          marginBottom: '1.5rem'
        }}>
          ✓ {actionSuccess}
        </div>
      )}

      {/* Schedule Duty Form Card */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarPlus size={18} color="#60a5fa" />
            Schedule New Employee Duty
          </h3>
          <button className="btn btn-sm btn-secondary" onClick={setQuickTestTimer}>
            <Sparkles size={14} color="#f59e0b" />
            Set Quick Test Duty (Reminder in 1 min)
          </button>
        </div>

        {formError && (
          <div style={{ padding: '0.55rem 0.85rem', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', marginBottom: '1rem' }}>
            {formError}
          </div>
        )}

        <form onSubmit={handleCreateDuty} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.15rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Select Employee *</label>
            <select
              className="form-select"
              required
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
            >
              {employees.map(emp => (
                <option key={emp.employee_id} value={emp.employee_id}>
                  {emp.name} ({emp.employee_id}) - {emp.department}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Duty Date *</label>
            <input
              type="date"
              className="form-input"
              required
              value={dutyDate}
              onChange={(e) => setDutyDate(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Reporting / Duty Time (24h or HH:mm) *</label>
            <input
              type="time"
              className="form-input"
              required
              value={reportingTime}
              onChange={(e) => setReportingTime(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '42px' }} disabled={isSubmitting}>
              {isSubmitting ? 'Scheduling...' : 'Assign Duty'}
            </button>
          </div>
        </form>

        {/* Automatic Calculation Preview Box (Section 4 Requirement) */}
        {preview && (
          <div style={{
            marginTop: '1.25rem',
            padding: '0.85rem 1.15rem',
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.85rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Clock size={18} color="#fbbf24" />
              <span>
                Calculated Duty Time: <b>{preview.dutyFormatted}</b>
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Auto Reminder (-30 mins): </span>
              <span style={{ color: '#fbbf24', fontWeight: 700, backgroundColor: 'rgba(245, 158, 11, 0.15)', padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-sm)' }}>
                {preview.reminderFull} ({preview.reminderFormatted})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Scheduled Duties Table */}
      <div className="table-card">
        <div className="table-header">
          <h2>All Scheduled Duties</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Showing {duties.length} records
          </span>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Employee</th>
              <th>Reporting Time</th>
              <th>Reminder Time (-30m)</th>
              <th>Reminder Status</th>
              <th>Call Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {duties.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No duties scheduled yet. Use the form above to assign a duty.
                </td>
              </tr>
            ) : (
              duties.map((d) => (
                <tr key={d.id}>
                  <td><code>{d.duty_date}</code></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{d.employee_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.employee_id} • {d.employee_department}</div>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: '#60a5fa' }}>{d.reporting_time}</span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: '#fbbf24' }}>{d.reminder_time}</span>
                  </td>
                  <td>
                    <span className={`badge-status status-${(d.reminder_status || 'pending').toLowerCase()}`}>
                      {d.reminder_status}
                    </span>
                  </td>
                  <td>
                    <span className={`badge-status status-${(d.call_status || 'pending').toLowerCase()}`}>
                      {d.call_status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleResetStatus(d.id)}
                        title="Reset reminder to Pending"
                      >
                        Reset
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeleteDuty(d.id)}
                        title="Delete duty"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

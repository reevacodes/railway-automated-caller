import React, { useState, useEffect } from 'react';
import { getDuties, deleteDuty, resetDutyStatus, getEmployees, getScheduleByEmployee, saveSchedule } from '../services/api';
import { subscribeToWebSocket } from '../services/websocket';
import { CalendarPlus, Trash2, RefreshCw, Clock, Check } from 'lucide-react';
import { DateTime } from 'luxon';

export default function Duties() {
  const [duties, setDuties] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionSuccess, setActionSuccess] = useState('');

  // Form inputs
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [reportingTime, setReportingTime] = useState('10:00');
  const [isActive, setIsActive] = useState(true);
  const [days, setDays] = useState({
    monday: false,
    tuesday: false,
    wednesday: false,
    thursday: false,
    friday: false,
    saturday: false,
    sunday: false
  });

  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dutiesRes, empRes] = await Promise.all([
        getDuties(),
        getEmployees({ active_only: 'true' })
      ]);

      if (dutiesRes.success) {
        setDuties(dutiesRes.data);
      }

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

    const unsubscribe = subscribeToWebSocket((data) => {
      if (data.type === 'DATA_CHANGED') {
        loadData();
      }
    });

    const fallbackInterval = setInterval(loadData, 10000);

    return () => {
      unsubscribe();
      clearInterval(fallbackInterval);
    };
  }, []);

  // Fetch schedule when selected employee changes
  useEffect(() => {
    if (selectedEmpId) {
      fetchEmployeeSchedule(selectedEmpId);
    }
  }, [selectedEmpId]);

  const fetchEmployeeSchedule = async (empId) => {
    try {
      const res = await getScheduleByEmployee(empId);
      if (res.success && res.data) {
        const d = res.data;
        setDays({
          monday: d.monday,
          tuesday: d.tuesday,
          wednesday: d.wednesday,
          thursday: d.thursday,
          friday: d.friday,
          saturday: d.saturday,
          sunday: d.sunday
        });
        setReportingTime(d.reporting_time);
        setIsActive(d.is_active);
      }
    } catch (err) {
      // 404 means no schedule exists yet, reset to defaults
      if (err.response?.status === 404) {
        setDays({
          monday: false, tuesday: false, wednesday: false, thursday: false,
          friday: false, saturday: false, sunday: false
        });
        setReportingTime('10:00');
        setIsActive(true);
      } else {
        console.error('Error fetching schedule:', err);
      }
    }
  };

  const handleDayChange = (day) => {
    setDays(prev => ({ ...prev, [day]: !prev[day] }));
  };

  // Calculate preview reminder time
  const calculatePreview = () => {
    if (!reportingTime) return null;
    try {
      // Use today as a dummy date for preview calculations
      const dummyDate = DateTime.now().toFormat('yyyy-MM-dd');
      const full = `${dummyDate} ${reportingTime}`;
      
      let dt = DateTime.fromFormat(full, 'yyyy-MM-dd HH:mm', { zone: 'Asia/Kolkata' });
      if (!dt.isValid) dt = DateTime.fromFormat(full, 'yyyy-MM-dd h:mm a', { zone: 'Asia/Kolkata' });
      if (!dt.isValid) return null;

      const reminderDt = dt.minus({ minutes: 30 });
      return {
        dutyFormatted: dt.toFormat('hh:mm a'),
        reminderFormatted: reminderDt.toFormat('hh:mm a')
      };
    } catch (e) {
      return null;
    }
  };

  const preview = calculatePreview();

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    setFormError('');
    setActionSuccess('');

    if (!selectedEmpId) {
      setFormError('Please select an employee');
      return;
    }

    const hasAnyDay = Object.values(days).some(val => val === true);
    if (!hasAnyDay && isActive) {
      setFormError('Please select at least one day of the week, or deactivate the schedule.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        employee_id: selectedEmpId,
        ...days,
        reporting_time: reportingTime,
        is_active: isActive
      };

      const res = await saveSchedule(payload);

      if (res.success) {
        const empName = employees.find(e => e.employee_id === selectedEmpId)?.name || selectedEmpId;
        setActionSuccess(`Weekly schedule saved successfully for ${empName}.`);
        loadData(); // refresh history
      } else {
        setFormError(res.error || 'Failed to save schedule');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDuty = async (id) => {
    if (!window.confirm('Are you sure you want to delete this historical duty?')) return;
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

  const daysList = [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sunday', label: 'Sunday' }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Duty Scheduling & Reminders</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Configure recurring weekly schedules for automated voice call reminders.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadData} disabled={loading}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {actionSuccess && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          ✓ {actionSuccess}
        </div>
      )}

      {/* Schedule Duty Form Card */}
      <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarPlus size={18} color="#60a5fa" /> Recurring Weekly Schedule
          </h3>
        </div>

        {formError && (
          <div style={{ padding: '0.55rem 0.85rem', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', marginBottom: '1rem' }}>
            {formError}
          </div>
        )}

        <form onSubmit={handleSaveSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.15rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Select Employee *</label>
              <select className="form-select" required value={selectedEmpId} onChange={(e) => setSelectedEmpId(e.target.value)}>
                {employees.map(emp => (
                  <option key={emp.employee_id} value={emp.employee_id}>
                    {emp.name} ({emp.employee_id}) - {emp.department}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Reporting / Duty Time *</label>
              <input type="time" className="form-input" required value={reportingTime} onChange={(e) => setReportingTime(e.target.value)} />
            </div>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Status</label>
              <select className="form-select" value={isActive ? 'active' : 'inactive'} onChange={(e) => setIsActive(e.target.value === 'active')}>
                <option value="active">Active (Calls Enabled)</option>
                <option value="inactive">Inactive (Calls Paused)</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ marginBottom: '0.75rem', display: 'block' }}>Duty Days *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              {daysList.map(d => (
                <label key={d.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-dark)', userSelect: 'none' }}>
                  <div style={{ 
                    width: '18px', height: '18px', borderRadius: '4px', 
                    border: `1px solid ${days[d.key] ? '#3b82f6' : 'var(--border-light)'}`,
                    backgroundColor: days[d.key] ? '#3b82f6' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {days[d.key] && <Check size={14} color="#fff" strokeWidth={3} />}
                  </div>
                  <input type="checkbox" style={{ display: 'none' }} checked={days[d.key]} onChange={() => handleDayChange(d.key)} />
                  {d.label}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" style={{ padding: '0.6rem 1.5rem' }} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
        </form>

        {/* Automatic Calculation Preview Box */}
        {preview && (
          <div style={{ marginTop: '1.25rem', padding: '0.75rem 1.15rem', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Clock size={16} color="var(--railway-navy)" />
              <span style={{ color: 'var(--text-dark)', fontWeight: 600 }}>Duty Time: {preview.dutyFormatted}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Automated Voice Call Reminder: </span>
              <span style={{ color: '#b45309', fontWeight: 700, backgroundColor: '#fffbe3', padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid #fde68a' }}>
                {preview.reminderFormatted} (30m prior)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Scheduled Duties Table (History/Generated) */}
      <div className="table-card">
        <div className="table-header">
          <h2>Duty Call History / Generated Instances</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Showing {duties.length} records</span>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Employee</th>
              <th>Reporting Time</th>
              <th>Reminder Time</th>
              <th>Reminder Status</th>
              <th>Call Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {duties.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No duties scheduled yet.
                </td>
              </tr>
            ) : (
              duties.map((d) => (
                <tr key={d.id}>
                  <td><b>{d.duty_date}</b></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{d.employee_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.employee_id} • {d.employee_department}</div>
                  </td>
                  <td><span style={{ fontWeight: 600, color: 'var(--railway-navy)' }}>{d.reporting_time}</span></td>
                  <td><span style={{ fontWeight: 600, color: '#b45309' }}>{d.reminder_time}</span></td>
                  <td><span className={`badge-status status-${(d.reminder_status || 'pending').toLowerCase()}`}>{d.reminder_status}</span></td>
                  <td><span className={`badge-status status-${(d.call_status || 'pending').toLowerCase()}`}>{d.call_status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => handleResetStatus(d.id)} title="Reset reminder to Pending">Reset</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDeleteDuty(d.id)} title="Delete duty"><Trash2 size={13} /></button>
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
import React, { useState, useEffect } from 'react';
import { getSummaryStats, getDuties, initiateTestCall, resetDutyStatus, toggleScheduler, triggerScheduler } from '../services/api';
import { subscribeToWebSocket } from '../services/websocket';
import { Calendar, PhoneCall, CheckCircle, AlertTriangle, Clock, RefreshCw, Send, Zap, Play, Pause, Radio } from 'lucide-react';

export default function Dashboard({ onNavigateToTest }) {
  const [stats, setStats] = useState(null);
  const [todaysDuties, setTodaysDuties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testCallLoadingId, setTestCallLoadingId] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [isTogglingScheduler, setIsTogglingScheduler] = useState(false);
  const [isTriggeringScan, setIsTriggeringScan] = useState(false);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const statsRes = await getSummaryStats();
      if (statsRes.success) {
        setStats(statsRes.data);
      }

      const dutiesRes = await getDuties({ date: 'today' });
      if (dutiesRes.success) {
        setTodaysDuties(dutiesRes.data);
      }
    } catch (err) {
      console.error('Error loading dashboard:', err);
      setError('Failed to connect to backend server. Make sure backend is active.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();

    // Subscribe to instant real-time WebSocket pushes
    const unsubscribe = subscribeToWebSocket((data) => {
      if (data.type === 'DATA_CHANGED') {
        loadDashboardData();
      }
    });

    const fallbackInterval = setInterval(loadDashboardData, 10000);
    return () => {
      unsubscribe();
      clearInterval(fallbackInterval);
    };
  }, []);

  const handleToggleScheduler = async () => {
    if (!stats?.scheduler) return;
    setIsTogglingScheduler(true);
    try {
      const targetState = !stats.scheduler.enabled;
      const res = await toggleScheduler(targetState);
      if (res.success) {
        setActionMessage(res.message);
        loadDashboardData();
      }
    } catch (err) {
      setActionMessage(`Scheduler Toggle Error: ${err.message}`);
    } finally {
      setIsTogglingScheduler(false);
    }
  };

  const handleTriggerScan = async () => {
    setIsTriggeringScan(true);
    try {
      const res = await triggerScheduler();
      if (res.success) {
        setActionMessage(res.message);
        loadDashboardData();
      }
    } catch (err) {
      setActionMessage(`Scan Error: ${err.message}`);
    } finally {
      setIsTriggeringScan(false);
    }
  };

  const handleQuickTestCall = async (duty) => {
    setTestCallLoadingId(duty.id);
    setActionMessage('');
    try {
      const res = await initiateTestCall({
        employee_id: duty.employee_id,
        target_phone_number: duty.employee_phone,
        custom_duty_time: duty.reporting_time
      });

      if (res.success) {
        setActionMessage(`Call initiated for ${duty.employee_name}. Exotel Status: ${res.telephonyDetails?.status || 'initiated'}`);
        loadDashboardData();
      } else {
        setActionMessage(`Error: ${res.error}`);
      }
    } catch (err) {
      setActionMessage(`Test Call Error: ${err.message}`);
    } finally {
      setTestCallLoadingId(null);
    }
  };

  const handleResetDuty = async (dutyId) => {
    try {
      await resetDutyStatus(dutyId);
      setActionMessage('Duty reminder status reset to Pending.');
      loadDashboardData();
    } catch (err) {
      setActionMessage(`Error resetting duty: ${err.message}`);
    }
  };

  const getStatusBadge = (status) => {
    const s = (status || 'pending').toLowerCase();
    let className = 'status-pending';
    if (s.includes('confirm') || s === 'completed') className = 'status-completed';
    else if (s.includes('assist') || s.includes('fail') || s.includes('busy') || s.includes('no-answer')) className = 'status-failed';
    else if (s.includes('call') || s.includes('sched') || s.includes('in-prog')) className = 'status-calling';

    return <span className={`badge-status ${className}`}>{status || 'Pending'}</span>;
  };

  const isSchedulerActive = stats?.scheduler?.enabled ?? false;

  return (
    <div>
      {/* Automated Scheduler Banner */}
      <div style={{
        background: isSchedulerActive 
          ? 'linear-gradient(135deg, #0e2439 0%, #1e3a5f 100%)' 
          : 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
        borderRadius: 'var(--radius-md)',
        padding: '1.2rem 1.5rem',
        marginBottom: '1.25rem',
        color: '#ffffff',
        borderLeft: isSchedulerActive ? '5px solid #10b981' : '5px solid #f59e0b',
        boxShadow: 'var(--shadow-md)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            backgroundColor: isSchedulerActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Radio size={22} color={isSchedulerActive ? '#34d399' : '#fbbf24'} className={isSchedulerActive ? 'animate-pulse' : ''} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                AUTOMATED CALL SCHEDULER
              </h3>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.15rem 0.6rem',
                borderRadius: '12px',
                backgroundColor: isSchedulerActive ? '#10b981' : '#f59e0b',
                color: '#ffffff',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                {isSchedulerActive ? '● ACTIVE' : 'PAUSED'}
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', margin: '0.2rem 0 0 0' }}>
              {isSchedulerActive 
                ? `Automated call engine is active. Voice calls trigger automatically 30 minutes prior to duty reporting time.`
                : 'Automated call engine is paused. Enable calling to automatically dispatch duty reminders.'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button
            className="btn"
            onClick={handleTriggerScan}
            disabled={isTriggeringScan}
            style={{
              backgroundColor: 'rgba(255,255,255,0.15)',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.3)',
              fontSize: '0.8rem',
              padding: '0.45rem 0.85rem'
            }}
          >
            <Zap size={14} color="#f59e0b" />
            {isTriggeringScan ? 'Scanning...' : 'Scan & Dispatch Due Calls Now'}
          </button>

          <button
            className="btn"
            onClick={handleToggleScheduler}
            disabled={isTogglingScheduler}
            style={{
              backgroundColor: isSchedulerActive ? '#ef4444' : '#10b981',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.8rem',
              padding: '0.45rem 0.95rem'
            }}
          >
            {isSchedulerActive ? (
              <><Pause size={14} /> Pause Auto Calling</>
            ) : (
              <><Play size={14} /> Enable Auto Calling</>
            )}
          </button>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--railway-navy)' }}>TODAY'S DUTY REMINDER OVERVIEW</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Automated voice call reminders trigger exactly 30 minutes prior to duty reporting time.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="btn btn-secondary" onClick={loadDashboardData} disabled={loading}>
            <RefreshCw size={14} />
            Refresh Desk
          </button>
          <button className="btn btn-primary" onClick={onNavigateToTest}>
            <PhoneCall size={14} />
            Test Call Desk
          </button>
        </div>
      </div>

      {actionMessage && (
        <div style={{
          padding: '0.65rem 0.9rem',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          color: '#1e40af',
          fontSize: '0.82rem',
          marginBottom: '1.25rem',
          fontWeight: 500
        }}>
          ⓘ {actionMessage}
        </div>
      )}

      {/* Summary Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-info">
            <div className="stat-label">Today's Duties</div>
            <div className="stat-value">{stats ? stats.todaysDutiesCount : '-'}</div>
          </div>
          <div className="stat-icon-wrapper icon-blue">
            <Calendar size={20} />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <div className="stat-label">Reminders Pending</div>
            <div className="stat-value">{stats ? stats.pendingRemindersCount : '-'}</div>
          </div>
          <div className="stat-icon-wrapper icon-gold">
            <Clock size={20} />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <div className="stat-label">Calls Completed</div>
            <div className="stat-value">{stats ? stats.callsCompletedCount : '-'}</div>
          </div>
          <div className="stat-icon-wrapper icon-emerald">
            <CheckCircle size={20} />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <div className="stat-label">Calls Unanswered / Failed</div>
            <div className="stat-value">{stats ? stats.callsFailedCount : '-'}</div>
          </div>
          <div className="stat-icon-wrapper icon-rose">
            <AlertTriangle size={20} />
          </div>
        </div>
      </div>

      {/* Today's Scheduled Duties Table */}
      <div className="table-card">
        <div className="table-header">
          <h2>TODAY'S SCHEDULED DUTIES</h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Total Roster: {todaysDuties.length} Duties
          </span>
        </div>

        {todaysDuties.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ fontWeight: 600 }}>No duties assigned for today yet.</p>
            <p style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>
              Select <b>Duty Schedule</b> from the side navigation to assign staff duty schedules.
            </p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee / Staff Details</th>
                <th>Department</th>
                <th>Reporting Time</th>
                <th>Auto Reminder</th>
                <th>Reminder Status</th>
                <th>Call Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {todaysDuties.map((duty) => (
                <tr key={duty.id}>
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--railway-navy)' }}>{duty.employee_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {duty.employee_id} • {duty.employee_phone}</div>
                  </td>
                  <td><b>{duty.employee_department || 'Operations'}</b></td>
                  <td>
                    <span style={{ fontWeight: 700, color: 'var(--railway-navy)' }}>{duty.reporting_time}</span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 700, color: '#b45309' }}>{duty.reminder_time}</span>
                  </td>
                  <td>{getStatusBadge(duty.reminder_status)}</td>
                  <td>{getStatusBadge(duty.call_status)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleQuickTestCall(duty)}
                        disabled={testCallLoadingId === duty.id}
                        title="Dispatch voice call now"
                      >
                        <Send size={12} />
                        {testCallLoadingId === duty.id ? 'Calling...' : 'Call Now'}
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleResetDuty(duty.id)}
                        title="Reset reminder to Pending"
                      >
                        Reset
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

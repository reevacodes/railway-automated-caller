import React, { useState, useEffect } from 'react';
import { getCallLogs, initiateTestCall, getEmployees, simulateDtmfResponse } from '../services/api';
import { subscribeToWebSocket } from '../services/websocket';
import { PhoneCall, RefreshCw, Send, CheckCircle2, AlertCircle, PhoneIncoming, CheckSquare, HelpCircle } from 'lucide-react';

export default function CallLogs() {
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Test Call Form fields
  const [targetPhone, setTargetPhone] = useState('+919876543210');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [dutyTime, setDutyTime] = useState('10:00 AM');
  const [isCalling, setIsCalling] = useState(false);
  const [callResult, setCallResult] = useState(null);
  const [callError, setCallError] = useState(null);
  const [simulatingId, setSimulatingId] = useState(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const [logsRes, empRes] = await Promise.all([
        getCallLogs(),
        getEmployees()
      ]);
      if (logsRes.success) setLogs(logsRes.data);
      if (empRes.success) {
        setEmployees(empRes.data);
        if (empRes.data.length > 0 && !selectedEmpId) {
          setSelectedEmpId(empRes.data[0].employee_id);
          setTargetPhone(empRes.data[0].phone_number);
        }
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();

    // Subscribe to instant real-time WebSocket pushes
    const unsubscribe = subscribeToWebSocket((data) => {
      if (data.type === 'DATA_CHANGED') {
        fetchLogs();
      }
    });

    const fallbackInterval = setInterval(fetchLogs, 10000);
    return () => {
      unsubscribe();
      clearInterval(fallbackInterval);
    };
  }, []);

  const handleSelectEmployee = (empId) => {
    setSelectedEmpId(empId);
    const emp = employees.find(e => e.employee_id === empId);
    if (emp) {
      setTargetPhone(emp.phone_number);
    }
  };

  const handleTestCallSubmit = async (e) => {
    e.preventDefault();
    setIsCalling(true);
    setCallResult(null);
    setCallError(null);

    try {
      const res = await initiateTestCall({
        employee_id: selectedEmpId,
        target_phone_number: targetPhone,
        custom_duty_time: dutyTime
      });

      if (res.success) {
        setCallResult(res);
        fetchLogs();
      } else {
        setCallError(res.error || 'Test call failed');
      }
    } catch (err) {
      setCallError(err.response?.data?.error || err.message);
    } finally {
      setIsCalling(false);
    }
  };

  const getConfirmationBadge = (log) => {
    const status = (log.confirmation_status || log.dtmf_input || '').toLowerCase();
    if (status.includes('confirm') || log.dtmf_input === '1') {
      return (
        <span className="badge-status status-completed" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#047857', border: '1px solid #a7f3d0' }}>
          <CheckSquare size={12} style={{ marginRight: '3px' }} /> Confirmed (Press 1)
        </span>
      );
    }
    if (status.includes('assist') || log.dtmf_input === '2') {
      return (
        <span className="badge-status status-failed" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#b91c1c', border: '1px solid #fca5a5' }}>
          <HelpCircle size={12} style={{ marginRight: '3px' }} /> Assistance Needed (Press 2)
        </span>
      );
    }
    return <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Awaiting Keypress</span>;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Call Logs & IVR Keypress Responses</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            History of automated duty voice call notifications and employee response keypress logs.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={fetchLogs} disabled={loading}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {/* Manual Call Dispatch Panel */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
        marginBottom: '2rem',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PhoneCall size={18} color="var(--railway-blue)" />
            Manual Call Dispatch
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Dispatch an immediate voice call notification to an employee for verification or manual duty alerts.
          </p>
        </div>

        <form onSubmit={handleTestCallSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.15rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Employee Staff</label>
            <select
              className="form-select"
              value={selectedEmpId}
              onChange={(e) => handleSelectEmployee(e.target.value)}
            >
              {employees.map(emp => (
                <option key={emp.employee_id} value={emp.employee_id}>
                  {emp.name} ({emp.employee_id})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Target Phone Number *</label>
            <input
              type="text"
              className="form-input"
              required
              placeholder="+919876543210"
              value={targetPhone}
              onChange={(e) => setTargetPhone(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Duty Time *</label>
            <input
              type="text"
              className="form-input"
              required
              value={dutyTime}
              onChange={(e) => setDutyTime(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '42px' }} disabled={isCalling}>
              <Send size={15} />
              {isCalling ? 'Dialing...' : 'Dispatch Call Now'}
            </button>
          </div>
        </form>

        {/* Test Call Output Banner */}
        {callResult && (
          <div style={{
            marginTop: '1.25rem',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#15803d',
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <CheckCircle2 size={18} color="#15803d" />
            {callResult.message || 'Call successfully dispatched.'}
          </div>
        )}

        {callError && (
          <div style={{
            marginTop: '1.25rem',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#b91c1c',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <AlertCircle size={18} />
            {callError}
          </div>
        )}
      </div>

      {/* Call History Table */}
      <div className="table-card">
        <div className="table-header">
          <h2>Call Logs & IVR Keypress Responses</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Total Calls: {logs.length}
          </span>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Employee</th>
              <th>Phone Number</th>
              <th>Status</th>
              <th>IVR Keypress Response</th>
              <th>Spoken Voice Message</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No call logs recorded yet.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td>#{log.id}</td>
                  <td>
                    {log.call_type === 'test_call' ? (
                      <span className="badge-status status-calling">Manual Call</span>
                    ) : (
                      <span className="badge-status status-completed">Automated</span>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{log.employee_name || log.employee_id}</div>
                  </td>
                  <td><b>{log.phone_number}</b></td>
                  <td>
                    <span className={`badge-status status-${(log.status || 'initiated').toLowerCase()}`}>
                      {log.status}
                    </span>
                  </td>
                  <td>{getConfirmationBadge(log)}</td>
                  <td>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '280px' }}>
                      "{log.voice_message}"
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.78rem' }}>{log.created_at}</div>
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

import React, { useState, useEffect } from 'react';
import { getCallLogs, initiateTestCall, getEmployees, simulateDtmfResponse } from '../services/api';
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

  const handleSimulateDtmf = async (callLogId, digits) => {
    setSimulatingId(callLogId);
    try {
      const res = await simulateDtmfResponse({ call_log_id: callLogId, digits });
      if (res.success) {
        fetchLogs();
      }
    } catch (err) {
      console.error('DTMF Sim error:', err);
    } finally {
      setSimulatingId(null);
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
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Call Logs & IVR Confirmation Desk</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Real-time telephony voice calls with interactive DTMF keypress response handling (Press 1 to Confirm / Press 2 for Assistance).
          </p>
        </div>
        <button className="btn btn-secondary" onClick={fetchLogs} disabled={loading}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {/* Section 7 Test Call Panel */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
        marginBottom: '2rem',
        boxShadow: 'var(--shadow-md)'
      }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PhoneCall size={20} color="#3b82f6" />
            Interactive Test Call Panel
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            To test with your own real Indian mobile number, type your number in the phone field below and click <b>[ Initiate Test Call ]</b>. When picked up, press 1 on your mobile keypad to confirm.
          </p>
        </div>

        <form onSubmit={handleTestCallSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.15rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Employee Context</label>
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
            <label>Target Phone Number for Test Call *</label>
            <input
              type="text"
              className="form-input"
              required
              placeholder="+91XXXXXXXXXX"
              value={targetPhone}
              onChange={(e) => setTargetPhone(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Spoken Duty Time *</label>
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
              {isCalling ? 'Calling Telephony Provider...' : 'Initiate Test Call'}
            </button>
          </div>
        </form>

        {/* Test Call Output Banner */}
        {callResult && (
          <div style={{
            marginTop: '1.25rem',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#34d399',
            fontSize: '0.85rem'
          }}>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <CheckCircle2 size={18} />
              {callResult.message}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#a7f3d0' }}>
              • Provider: <b>{callResult.telephonyDetails?.provider}</b><br />
              • Provider Call SID: <code>{callResult.telephonyDetails?.providerCallId}</code><br />
              • Initial Status: <b>{callResult.telephonyDetails?.status}</b>
            </div>
          </div>
        )}

        {callError && (
          <div style={{
            marginTop: '1.25rem',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
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

      {/* Call History Table (Section 10 Requirement) */}
      <div className="table-card">
        <div className="table-header">
          <h2>Telephony Call History & DTMF Webhook Logs</h2>
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
              <th>IVR DTMF Confirmation</th>
              <th>Spoken Voice Message</th>
              <th>Time</th>
              <th>Keypress Simulation</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No call logs recorded yet. Use the Test Call Panel above or schedule a duty reminder.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td>#{log.id}</td>
                  <td>
                    {log.call_type === 'test_call' ? (
                      <span className="badge-status status-calling">Test Call</span>
                    ) : (
                      <span className="badge-status status-completed">Scheduled</span>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{log.employee_name || log.employee_id}</div>
                  </td>
                  <td><code>{log.phone_number}</code></td>
                  <td>
                    <span className={`badge-status status-${(log.status || 'initiated').toLowerCase()}`}>
                      {log.status}
                    </span>
                  </td>
                  <td>{getConfirmationBadge(log)}</td>
                  <td>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '240px' }}>
                      "{log.voice_message}"
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.78rem' }}>{log.created_at}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        className="btn btn-sm"
                        style={{ backgroundColor: '#10b981', color: '#fff', padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                        onClick={() => handleSimulateDtmf(log.id, '1')}
                        disabled={simulatingId === log.id}
                        title="Simulate user pressing 1 on mobile keypad"
                      >
                        Press 1 (Confirm)
                      </button>
                      <button
                        className="btn btn-sm"
                        style={{ backgroundColor: '#ef4444', color: '#fff', padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                        onClick={() => handleSimulateDtmf(log.id, '2')}
                        disabled={simulatingId === log.id}
                        title="Simulate user pressing 2 on mobile keypad"
                      >
                        Press 2 (Assist)
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

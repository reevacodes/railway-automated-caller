import React, { useState, useEffect } from 'react';
import { getSystemInfo } from '../services/api';
import { Server, PhoneCall, Sliders, CheckCircle2 } from 'lucide-react';

export default function Settings() {
  const [sysInfo, setSysInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSystemInfo()
      .then(res => {
        if (res.success) setSysInfo(res.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>System Configuration & Operational Parameters</h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Overview of operational status, voice telephony gateway, timezone settings, and automated call dispatch rules.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* System Status Card */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--railway-navy)' }}>
            <Server size={18} color="var(--railway-blue)" />
            System & Operational Status
          </h3>

          <div className="form-group">
            <label>Application Desk</label>
            <input type="text" className="form-input" disabled value="Indian Railways Duty Call Portal" />
          </div>

          <div className="form-group">
            <label>System Operational State</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
              <span className="badge-status status-completed" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <CheckCircle2 size={13} /> System Active & Operational
              </span>
            </div>
          </div>

          <div className="form-group">
            <label>Operating Timezone</label>
            <input type="text" className="form-input" disabled value={`Asia/Kolkata (IST) — ${sysInfo?.currentKolkataTime || ''}`} />
          </div>
        </div>

        {/* Telephony Service Card */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--railway-navy)' }}>
            <PhoneCall size={18} color="#b45309" />
            Telephony & Voice Gateway
          </h3>

          <div className="form-group">
            <label>Voice Telephony Gateway</label>
            <input type="text" className="form-input" disabled value="Exotel Interactive Voice Response (IVR)" />
          </div>

          <div className="form-group">
            <label>Outbound Helpline Virtual Caller</label>
            <input type="text" className="form-input" disabled value="08047096052 (Virtual Number Connected)" />
          </div>

          <div className="form-group">
            <label>Interactive Keypress Options</label>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-body)', background: 'var(--bg-subtle)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
              • <b>Press 1</b>: Confirm Duty Attendance<br />
              • <b>Press 2</b>: Request Control Room Assistance
            </div>
          </div>
        </div>

        {/* Automated Rules Card */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem',
          gridColumn: '1 / -1'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--railway-navy)' }}>
            <Sliders size={18} color="var(--railway-blue)" />
            Automated Call Dispatch & Reminder Rules
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
            <div style={{ backgroundColor: 'var(--bg-subtle)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <b style={{ color: 'var(--railway-navy)' }}>Call Advance Window</b>
              <p style={{ marginTop: '0.3rem', color: 'var(--text-muted)' }}>
                Voice reminders dispatch exactly <b>30 minutes</b> before employee reporting time.
              </p>
            </div>

            <div style={{ backgroundColor: 'var(--bg-subtle)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <b style={{ color: 'var(--railway-navy)' }}>Automated Background Engine</b>
              <p style={{ marginTop: '0.3rem', color: 'var(--text-muted)' }}>
                Runs continuous cycles every 60 seconds to process due rosters without manual intervention.
              </p>
            </div>

            <div style={{ backgroundColor: 'var(--bg-subtle)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <b style={{ color: 'var(--railway-navy)' }}>Real-Time Portal Updates</b>
              <p style={{ marginTop: '0.3rem', color: 'var(--text-muted)' }}>
                Instant portal state synchronization captures keypress responses as soon as calls complete.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

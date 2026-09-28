import React, { useState, useEffect } from 'react';
import { getSystemInfo } from '../services/api';
import { ShieldCheck, Server, Radio, Database, Info } from 'lucide-react';

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
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>System Configuration & Telephony Settings</h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Environment state, Exotel API integration, and timezone configuration.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Environment & Demo Mode */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Server size={18} color="#60a5fa" />
            Environment & Security Mode
          </h3>

          <div className="form-group">
            <label>Application Name</label>
            <input type="text" className="form-input" disabled value={sysInfo?.appName || 'Railway Duty Reminder System'} />
          </div>

          <div className="form-group">
            <label>Current Status</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <span className="badge badge-demo">Prototype / Demo V1</span>
              <span className="badge badge-tz">Asia/Kolkata</span>
            </div>
          </div>

          <div className="form-group">
            <label>DEMO_MODE Flag</label>
            <input
              type="text"
              className="form-input"
              disabled
              value={sysInfo?.demoMode ? 'ENABLED (Safe Development Mode)' : 'DISABLED (Live Calls)'}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              In DEMO_MODE, automated scheduler will not call dummy numbers. Test Call button allows calls to your real number.
            </span>
          </div>

          <div className="form-group">
            <label>Local Server Timezone</label>
            <input type="text" className="form-input" disabled value={`${sysInfo?.timezone || 'Asia/Kolkata'} (${sysInfo?.currentKolkataTime || ''})`} />
          </div>
        </div>

        {/* Telephony Exotel Integration */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Radio size={18} color="#f59e0b" />
            Telephony Provider (Exotel)
          </h3>

          <div className="form-group">
            <label>Active Telephony Provider</label>
            <input type="text" className="form-input" disabled value={sysInfo?.telephonyProvider || 'Exotel'} />
          </div>

          <div className="form-group">
            <label>Exotel API Credentials (.env)</label>
            <div className="log-box" style={{ maxHeight: '160px' }}>
              EXOTEL_ACCOUNT_SID=••••••••••••••••<br />
              EXOTEL_API_KEY=••••••••••••••••<br />
              EXOTEL_API_TOKEN=••••••••••••••••<br />
              EXOTEL_PHONE_NUMBER=Virtual Number Set<br />
              EXOTEL_SUBDOMAIN=api.exotel.com
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Credentials remain isolated in root <code>.env</code> file. Never exposed to React frontend.
            </span>
          </div>

          <div className="form-group">
            <label>Webhook Status Callback Endpoint</label>
            <input type="text" className="form-input" disabled value="http://<your-server-ip>:5000/api/webhooks/exotel" />
          </div>
        </div>

        {/* Database & Architecture */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem',
          gridColumn: '1 / -1'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Database size={18} color="#10b981" />
            Database & System Architecture
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <div style={{ backgroundColor: 'var(--bg-dark)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <b style={{ color: '#ffffff' }}>Local SQLite Database</b>
              <p style={{ marginTop: '0.4rem' }}>
                Stored locally at <code>backend/db/railway_reminder.db</code>. No cloud DB dependencies.
              </p>
            </div>

            <div style={{ backgroundColor: 'var(--bg-dark)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <b style={{ color: '#ffffff' }}>Agnostic Telephony Layer</b>
              <p style={{ marginTop: '0.4rem' }}>
                Can easily replace Exotel with another Indian telephony provider by adding a provider class in <code>backend/services/telephony/</code>.
              </p>
            </div>

            <div style={{ backgroundColor: 'var(--bg-dark)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <b style={{ color: '#ffffff' }}>Cron Scheduler</b>
              <p style={{ marginTop: '0.4rem' }}>
                Node-cron job checking pending reminders every 60 seconds using atomic row updates for duplicate call prevention.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

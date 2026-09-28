import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, Calendar, PhoneCall, Settings as SettingsIcon, Train, Clock, ShieldCheck } from 'lucide-react';
import { DateTime } from 'luxon';

import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Duties from './pages/Duties';
import CallLogs from './pages/CallLogs';
import Settings from './pages/Settings';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [kolkataTime, setKolkataTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const formatted = DateTime.now().setZone('Asia/Kolkata').toFormat('yyyy-MM-dd HH:mm:ss');
      setKolkataTime(formatted);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onNavigateToTest={() => setActiveTab('calls')} />;
      case 'employees':
        return <Employees />;
      case 'duties':
        return <Duties />;
      case 'calls':
        return <CallLogs />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard onNavigateToTest={() => setActiveTab('calls')} />;
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'dashboard': return { title: 'OPERATIONS CONTROL DASHBOARD', sub: 'Divisional Automated Crew Duty Reminder & Call Dispatch Desk' };
      case 'employees': return { title: 'EMPLOYEE DIRECTORY', sub: 'Department Staff Records & Communication Contacts' };
      case 'duties': return { title: 'DUTY ROSTER & REMINDER SCHEDULER', sub: 'Automated 30-Minute Reporting Time Call Dispatch' };
      case 'calls': return { title: 'TELEPHONY CALL LOGS & TEST DESK', sub: 'Exotel Voice Reminder Records & Manual Test Call Verification' };
      case 'settings': return { title: 'SYSTEM & PROVIDER CONFIGURATION', sub: 'Exotel Telephony Parameters & Operating Environment' };
      default: return { title: 'OPERATIONS CONTROL DASHBOARD', sub: '' };
    }
  };

  const pageInfo = getPageTitle();

  return (
    <div className="app-container">
      {/* Formal Railway Sidebar */}
      <aside className="sidebar">
        <div className="brand-header">
          <div className="brand-logo">
            <Train size={24} />
          </div>
          <div>
            <div className="brand-title">INDIAN RAILWAYS</div>
            <div className="brand-sub">Duty Call Portal</div>
          </div>
        </div>

        <ul className="nav-list">
          <li className="nav-item">
            <button
              className={activeTab === 'dashboard' ? 'active' : ''}
              onClick={() => setActiveTab('dashboard')}
            >
              <LayoutDashboard size={17} />
              Control Dashboard
            </button>
          </li>

          <li className="nav-item">
            <button
              className={activeTab === 'employees' ? 'active' : ''}
              onClick={() => setActiveTab('employees')}
            >
              <Users size={17} />
              Employee Roster
            </button>
          </li>

          <li className="nav-item">
            <button
              className={activeTab === 'duties' ? 'active' : ''}
              onClick={() => setActiveTab('duties')}
            >
              <Calendar size={17} />
              Duty Schedule
            </button>
          </li>

          <li className="nav-item">
            <button
              className={activeTab === 'calls' ? 'active' : ''}
              onClick={() => setActiveTab('calls')}
            >
              <PhoneCall size={17} />
              Call Logs & Test
            </button>
          </li>

          <li className="nav-item">
            <button
              className={activeTab === 'settings' ? 'active' : ''}
              onClick={() => setActiveTab('settings')}
            >
              <SettingsIcon size={17} />
              System Config
            </button>
          </li>
        </ul>

        <div className="sidebar-footer">
          <div style={{ fontWeight: 700, color: '#ffffff' }}>Operating Department</div>
          <div>Automated Duty Reminder MVP</div>
          <div style={{ marginTop: '6px', color: 'var(--railway-gold-light)' }}>Telephony: Exotel</div>
        </div>
      </aside>

      {/* Main Layout Area */}
      <main className="main-content">
        <header className="top-bar">
          <div className="page-title-group">
            <h1>{pageInfo.title}</h1>
            <p>{pageInfo.sub}</p>
          </div>

          <div className="top-badges">
            <span className="badge badge-demo">
              <ShieldCheck size={13} />
              PROTOTYPE / DEMO V1
            </span>

            <span className="badge badge-tz">
              <Clock size={13} />
              IST: {kolkataTime || '13:00:00'}
            </span>
          </div>
        </header>

        <div className="content-body">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

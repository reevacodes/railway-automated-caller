import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, Calendar, PhoneCall, Settings as SettingsIcon, Train, Clock, ShieldCheck, Menu, X } from 'lucide-react';
import { DateTime } from 'luxon';

import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Duties from './pages/Duties';
import CallLogs from './pages/CallLogs';
import Settings from './pages/Settings';

const getInitialTab = () => {
  const hash = window.location.hash.replace('#', '').trim().toLowerCase();
  const validTabs = ['dashboard', 'employees', 'duties', 'calls', 'settings'];
  if (validTabs.includes(hash)) return hash;
  const stored = localStorage.getItem('railway_active_tab');
  if (validTabs.includes(stored)) return stored;
  return 'dashboard';
};

export default function App() {
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [kolkataTime, setKolkataTime] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const changeTab = (tab) => {
    setActiveTab(tab);
    window.location.hash = tab;
    localStorage.setItem('railway_active_tab', tab);
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '').trim().toLowerCase();
      const validTabs = ['dashboard', 'employees', 'duties', 'calls', 'settings'];
      if (validTabs.includes(hash)) {
        setActiveTab(hash);
        localStorage.setItem('railway_active_tab', hash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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
        return <Dashboard onNavigateToTest={() => changeTab('calls')} />;
      case 'employees':
        return <Employees />;
      case 'duties':
        return <Duties />;
      case 'calls':
        return <CallLogs />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard onNavigateToTest={() => changeTab('calls')} />;
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'dashboard': return { title: 'OPERATIONS CONTROL DASHBOARD', sub: 'Divisional Automated Crew Duty Reminder & Call Dispatch Desk' };
      case 'employees': return { title: 'EMPLOYEE DIRECTORY', sub: 'Department Staff Records & Communication Contacts' };
      case 'duties': return { title: 'DUTY ROSTER & REMINDER SCHEDULER', sub: 'Automated Reporting Time Call Dispatch' };
      case 'calls': return { title: 'CALL LOGS & RESPONSE DESK', sub: 'Voice Reminder Records & Manual Call Dispatch' };
      case 'settings': return { title: 'SYSTEM CONFIGURATION', sub: 'Operational Parameters & Telephony Settings' };
      default: return { title: 'OPERATIONS CONTROL DASHBOARD', sub: '' };
    }
  };

  const pageInfo = getPageTitle();

  return (
    <div className="app-container">
      {/* Mobile Top Header */}
      <div className="mobile-header">
        <div className="mobile-brand">
          <Train size={20} color="#c59b27" />
          <span>INDIAN RAILWAYS</span>
        </div>
        <button
          className="mobile-toggle-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle Navigation Menu"
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Formal Railway Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
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
              onClick={() => changeTab('dashboard')}
            >
              <LayoutDashboard size={17} />
              Control Dashboard
            </button>
          </li>

          <li className="nav-item">
            <button
              className={activeTab === 'employees' ? 'active' : ''}
              onClick={() => changeTab('employees')}
            >
              <Users size={17} />
              Employee Roster
            </button>
          </li>

          <li className="nav-item">
            <button
              className={activeTab === 'duties' ? 'active' : ''}
              onClick={() => changeTab('duties')}
            >
              <Calendar size={17} />
              Duty Schedule
            </button>
          </li>

          <li className="nav-item">
            <button
              className={activeTab === 'calls' ? 'active' : ''}
              onClick={() => changeTab('calls')}
            >
              <PhoneCall size={17} />
              Call Logs & Dispatch
            </button>
          </li>

          <li className="nav-item">
            <button
              className={activeTab === 'settings' ? 'active' : ''}
              onClick={() => changeTab('settings')}
            >
              <SettingsIcon size={17} />
              System Settings
            </button>
          </li>
        </ul>

        <div className="sidebar-footer">
          <div style={{ fontWeight: 700, color: '#ffffff' }}>Operating Department</div>
          <div>Automated Duty Reminder System</div>
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
            <span className="badge" style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
              <ShieldCheck size={13} color="#15803d" />
              SYSTEM ONLINE
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

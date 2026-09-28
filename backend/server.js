require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const employeesRouter = require('./routes/employees');
const dutiesRouter = require('./routes/duties');
const callsRouter = require('./routes/calls');
const webhooksRouter = require('./routes/webhooks');
const { initScheduler } = require('./scheduler/reminderScheduler');
const { getCurrentDateTimeString, TIMEZONE } = require('./config/timezone');
const telephonyService = require('./services/telephony/telephonyService');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors());

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  if (req.originalUrl !== '/api/system/time') {
    console.log(`[${getCurrentDateTimeString()}] ${req.method} ${req.originalUrl}`);
  }
  next();
});

// API Routes
app.use('/api/employees', employeesRouter);
app.use('/api/duties', dutiesRouter);
app.use('/api/calls', callsRouter);
app.use('/api/webhooks', webhooksRouter);

// System Status Endpoint
app.get('/api/system/info', (req, res) => {
  res.json({
    success: true,
    data: {
      appName: 'Railway Employee Duty Reminder System',
      version: '1.0.0 (MVP Prototype)',
      timezone: TIMEZONE,
      currentKolkataTime: getCurrentDateTimeString(),
      demoMode: process.env.DEMO_MODE !== 'false',
      telephonyProvider: telephonyService.getProviderName(),
      telephonyConfigured: telephonyService.isConfigured()
    }
  });
});

// 404 Handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'API route not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Error]:', err);
  res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚂 Railway Duty Reminder System API Server`);
  console.log(`📡 Listening on http://localhost:${PORT}`);
  console.log(`⏰ Timezone: ${TIMEZONE} (${getCurrentDateTimeString()})`);
  console.log(`⚙️  DEMO_MODE: ${process.env.DEMO_MODE !== 'false' ? 'ENABLED (Safe Mode)' : 'DISABLED (Live Calls)'}`);
  console.log(`📞 Telephony Provider: ${telephonyService.getProviderName()} (${telephonyService.isConfigured() ? 'Configured' : 'Using Demo Mock'})`);
  console.log(`=======================================================`);

  // Start automated cron scheduler
  initScheduler();
});

const { Pool } = require('pg');
const { getCurrentDateTimeString } = require('./timezone');

// The user requested to use Render PostgreSQL through DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/railway_reminder',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false // SSL is often required on Render
});

async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        employee_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        department TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS duties (
        id SERIAL PRIMARY KEY,
        employee_id TEXT NOT NULL,
        duty_date TEXT NOT NULL,
        reporting_time TEXT NOT NULL,
        reminder_time TEXT NOT NULL,
        reminder_status TEXT NOT NULL DEFAULT 'Pending',
        call_status TEXT NOT NULL DEFAULT 'Pending',
        confirmation_time TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        next_retry_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS call_logs (
        id SERIAL PRIMARY KEY,
        duty_id INTEGER,
        employee_id TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        provider_call_id TEXT,
        call_type TEXT NOT NULL,
        status TEXT NOT NULL,
        voice_message TEXT,
        dtmf_input TEXT,
        confirmation_status TEXT,
        started_at TEXT,
        ended_at TEXT,
        duration INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (duty_id) REFERENCES duties(id) ON DELETE SET NULL,
        FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_duties_date_status ON duties (duty_date, reminder_status);
      CREATE INDEX IF NOT EXISTS idx_call_logs_provider ON call_logs (provider_call_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_duties_emp_date ON duties (employee_id, duty_date);

      CREATE TABLE IF NOT EXISTS employee_schedules (
        id SERIAL PRIMARY KEY,
        employee_id TEXT UNIQUE NOT NULL,
        monday BOOLEAN DEFAULT false,
        tuesday BOOLEAN DEFAULT false,
        wednesday BOOLEAN DEFAULT false,
        thursday BOOLEAN DEFAULT false,
        friday BOOLEAN DEFAULT false,
        saturday BOOLEAN DEFAULT false,
        sunday BOOLEAN DEFAULT false,
        reporting_time TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
      );
    `);

    // Seed default dummy employees if empty (approx 8-10 normal employees)
    const countRes = await pool.query('SELECT COUNT(*) as count FROM employees');
    const count = parseInt(countRes.rows[0].count, 10);

    if (count === 0) {
      console.log('[DB] Seeding default dummy employees (8 employees)...');
      const now = getCurrentDateTimeString();

      const seedEmployees = [
        { id: 'EMP-101', name: 'Rahul Sharma', phone: '+919876543210', dept: 'Operations' },
        { id: 'EMP-102', name: 'Priya Verma', phone: '+919876543211', dept: 'Safety & Crew' },
        { id: 'EMP-103', name: 'Amit Kumar', phone: '+919876543212', dept: 'Engineering (Track)' },
        { id: 'EMP-104', name: 'Sunita Devi', phone: '+919876543213', dept: 'Signal & Telecom' },
        { id: 'EMP-105', name: 'Vikram Singh', phone: '+919876543214', dept: 'Traffic Control' },
        { id: 'EMP-106', name: 'Ananya Roy', phone: '+919876543215', dept: 'Electrical Traction' },
        { id: 'EMP-107', name: 'Rajesh Patel', phone: '+919876543216', dept: 'Carriage & Wagon' },
        { id: 'EMP-108', name: 'Meena Joshi', phone: '+919876543217', dept: 'Control Room' }
      ];

      const insertText = `
        INSERT INTO employees (employee_id, name, phone_number, department, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 1, $5, $6)
      `;

      for (const emp of seedEmployees) {
        await pool.query(insertText, [emp.id, emp.name, emp.phone, emp.dept, now, now]);
      }
      console.log('[DB] Seeded 8 dummy employees successfully.');
    }
  } catch (err) {
    console.error('[DB] Initialization error:', err);
  }
}

// Initialize asynchronously on startup
initDatabase();

module.exports = pool;

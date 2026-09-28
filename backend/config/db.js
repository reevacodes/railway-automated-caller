const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { getCurrentDateTimeString } = require('./timezone');

const dbDir = path.join(__dirname, '..', 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'railway_reminder.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      department TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS duties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      duty_date TEXT NOT NULL,
      reporting_time TEXT NOT NULL,
      reminder_time TEXT NOT NULL,
      reminder_status TEXT NOT NULL DEFAULT 'Pending',
      call_status TEXT NOT NULL DEFAULT 'Pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      duty_id INTEGER,
      employee_id TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      provider_call_id TEXT,
      call_type TEXT NOT NULL,
      status TEXT NOT NULL,
      voice_message TEXT,
      started_at TEXT,
      ended_at TEXT,
      duration INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (duty_id) REFERENCES duties(id) ON DELETE SET NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_duties_date_status ON duties (duty_date, reminder_status);
    CREATE INDEX IF NOT EXISTS idx_call_logs_provider ON call_logs (provider_call_id);
  `);

  // Migrate existing tables to add DTMF columns if they don't exist
  try { db.exec(`ALTER TABLE call_logs ADD COLUMN dtmf_input TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE call_logs ADD COLUMN confirmation_status TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE duties ADD COLUMN confirmation_time TEXT;`); } catch (e) {}

  // Seed default dummy employees if empty (approx 8-10 normal employees)
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM employees');
  const { count } = countStmt.get();

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

    const insertStmt = db.prepare(`
      INSERT INTO employees (employee_id, name, phone_number, department, is_active, created_at, updated_at)
      VALUES (@id, @name, @phone, @dept, 1, @now, @now)
    `);

    const insertMany = db.transaction((employees) => {
      for (const emp of employees) {
        insertStmt.run({ ...emp, now });
      }
    });

    insertMany(seedEmployees);
    console.log('[DB] Seeded 8 dummy employees successfully.');
  }
}

// Initialize on module load
initDatabase();

module.exports = db;

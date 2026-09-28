const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { getCurrentDateTimeString } = require('../config/timezone');
const { broadcastUpdate } = require('../services/websocket');

// GET all employees
router.get('/', (req, res) => {
  try {
    const { search, department, active_only } = req.query;
    let query = 'SELECT * FROM employees WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (name LIKE ? OR employee_id LIKE ? OR phone_number LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (department) {
      query += ' AND department = ?';
      params.push(department);
    }

    if (active_only === 'true') {
      query += ' AND is_active = 1';
    }

    query += ' ORDER BY id DESC';

    const employees = db.prepare(query).all(...params);
    res.json({ success: true, data: employees });
  } catch (error) {
    console.error('[API] Error fetching employees:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch employees' });
  }
});

// GET single employee by ID
router.get('/:id', (req, res) => {
  try {
    const employee = db.prepare('SELECT * FROM employees WHERE id = ? OR employee_id = ?').get(req.params.id, req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }
    res.json({ success: true, data: employee });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST create employee
router.post('/', (req, res) => {
  try {
    const { employee_id, name, phone_number, department, is_active = 1 } = req.body;

    if (!employee_id || !name || !phone_number || !department) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: employee_id, name, phone_number, and department are required.'
      });
    }

    // Check for duplicate employee_id
    const existing = db.prepare('SELECT id FROM employees WHERE employee_id = ?').get(employee_id);
    if (existing) {
      return res.status(400).json({ success: false, error: `Employee ID '${employee_id}' already exists.` });
    }

    const now = getCurrentDateTimeString();

    const stmt = db.prepare(`
      INSERT INTO employees (employee_id, name, phone_number, department, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(employee_id.trim(), name.trim(), phone_number.trim(), department.trim(), is_active ? 1 : 0, now, now);

    const newEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid);
    console.log(`[API] Created employee: ${newEmployee.name} (${newEmployee.employee_id})`);

    broadcastUpdate('DATA_CHANGED', { action: 'EMPLOYEE_CREATED', employee: newEmployee });

    res.status(201).json({ success: true, data: newEmployee, message: 'Employee added successfully' });
  } catch (error) {
    console.error('[API] Error adding employee:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT update employee
router.put('/:id', (req, res) => {
  try {
    const { name, phone_number, department, is_active } = req.body;
    const empId = req.params.id;

    const existing = db.prepare('SELECT * FROM employees WHERE id = ? OR employee_id = ?').get(empId, empId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    const now = getCurrentDateTimeString();

    const updatedName = name !== undefined ? name.trim() : existing.name;
    const updatedPhone = phone_number !== undefined ? phone_number.trim() : existing.phone_number;
    const updatedDept = department !== undefined ? department.trim() : existing.department;
    const updatedActive = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;

    const stmt = db.prepare(`
      UPDATE employees
      SET name = ?, phone_number = ?, department = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(updatedName, updatedPhone, updatedDept, updatedActive, now, existing.id);

    const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(existing.id);

    broadcastUpdate('DATA_CHANGED', { action: 'EMPLOYEE_UPDATED', employee: updated });

    res.json({ success: true, data: updated, message: 'Employee updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE employee
router.delete('/:id', (req, res) => {
  try {
    const empId = req.params.id;
    const existing = db.prepare('SELECT * FROM employees WHERE id = ? OR employee_id = ?').get(empId, empId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    db.prepare('DELETE FROM employees WHERE id = ?').run(existing.id);
    console.log(`[API] Deleted employee: ${existing.name} (${existing.employee_id})`);

    broadcastUpdate('DATA_CHANGED', { action: 'EMPLOYEE_DELETED', id: existing.id });

    res.json({ success: true, message: 'Employee deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;


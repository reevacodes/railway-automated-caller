const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { getCurrentDateTimeString } = require('../config/timezone');
const { broadcastUpdate } = require('../services/websocket');

// GET all employees
router.get('/', async (req, res) => {
  try {
    const { search, department, active_only } = req.query;
    let query = 'SELECT * FROM employees WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR employee_id ILIKE $${paramIndex} OR phone_number ILIKE $${paramIndex})`;
      const term = `%${search}%`;
      params.push(term);
      paramIndex++;
    }

    if (department) {
      query += ` AND department = $${paramIndex}`;
      params.push(department);
      paramIndex++;
    }

    if (active_only === 'true') {
      query += ' AND is_active = 1';
    }

    query += ' ORDER BY id DESC';

    const result = await db.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('[API] Error fetching employees:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch employees' });
  }
});

// GET single employee by ID
router.get('/:id', async (req, res) => {
  try {
    // Determine if it's an integer ID or a string employee_id
    const isInt = !isNaN(parseInt(req.params.id, 10));
    
    let result;
    if (isInt) {
      result = await db.query('SELECT * FROM employees WHERE id = $1 OR employee_id = $2', [parseInt(req.params.id, 10), req.params.id]);
    } else {
      result = await db.query('SELECT * FROM employees WHERE employee_id = $1', [req.params.id]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST create employee
router.post('/', async (req, res) => {
  try {
    const { employee_id, name, phone_number, department, is_active = 1 } = req.body;

    if (!employee_id || !name || !phone_number || !department) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: employee_id, name, phone_number, and department are required.'
      });
    }

    // Check for duplicate employee_id
    const existing = await db.query('SELECT id FROM employees WHERE employee_id = $1', [employee_id]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: `Employee ID '${employee_id}' already exists.` });
    }

    const now = getCurrentDateTimeString();

    const insertResult = await db.query(`
      INSERT INTO employees (employee_id, name, phone_number, department, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [employee_id.trim(), name.trim(), phone_number.trim(), department.trim(), is_active ? 1 : 0, now, now]);

    const newEmployee = insertResult.rows[0];
    console.log(`[API] Created employee: ${newEmployee.name} (${newEmployee.employee_id})`);

    broadcastUpdate('DATA_CHANGED', { action: 'EMPLOYEE_CREATED', employee: newEmployee });

    res.status(201).json({ success: true, data: newEmployee, message: 'Employee added successfully' });
  } catch (error) {
    console.error('[API] Error adding employee:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT update employee
router.put('/:id', async (req, res) => {
  try {
    const { name, phone_number, department, is_active } = req.body;
    const empId = req.params.id;
    const isInt = !isNaN(parseInt(empId, 10));

    let existingRes;
    if (isInt) {
      existingRes = await db.query('SELECT * FROM employees WHERE id = $1 OR employee_id = $2', [parseInt(empId, 10), empId]);
    } else {
      existingRes = await db.query('SELECT * FROM employees WHERE employee_id = $1', [empId]);
    }

    if (existingRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }
    const existing = existingRes.rows[0];

    const now = getCurrentDateTimeString();

    const updatedName = name !== undefined ? name.trim() : existing.name;
    const updatedPhone = phone_number !== undefined ? phone_number.trim() : existing.phone_number;
    const updatedDept = department !== undefined ? department.trim() : existing.department;
    const updatedActive = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;

    const updateRes = await db.query(`
      UPDATE employees
      SET name = $1, phone_number = $2, department = $3, is_active = $4, updated_at = $5
      WHERE id = $6
      RETURNING *
    `, [updatedName, updatedPhone, updatedDept, updatedActive, now, existing.id]);

    if (updateRes.rowCount === 0) {
      return res.status(500).json({ success: false, error: 'Database update failed: No rows were modified in PostgreSQL.' });
    }

    const updated = updateRes.rows[0];

    broadcastUpdate('DATA_CHANGED', { action: 'EMPLOYEE_UPDATED', employee: updated });

    res.json({ success: true, data: updated, message: 'Employee updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE employee
router.delete('/:id', async (req, res) => {
  try {
    const empId = req.params.id;
    const isInt = !isNaN(parseInt(empId, 10));

    let existingRes;
    if (isInt) {
      existingRes = await db.query('SELECT * FROM employees WHERE id = $1 OR employee_id = $2', [parseInt(empId, 10), empId]);
    } else {
      existingRes = await db.query('SELECT * FROM employees WHERE employee_id = $1', [empId]);
    }

    if (existingRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }
    const existing = existingRes.rows[0];

    await db.query('DELETE FROM employees WHERE id = $1', [existing.id]);
    console.log(`[API] Deleted employee: ${existing.name} (${existing.employee_id})`);

    broadcastUpdate('DATA_CHANGED', { action: 'EMPLOYEE_DELETED', id: existing.id });

    res.json({ success: true, message: 'Employee deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;


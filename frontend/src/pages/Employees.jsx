import React, { useState, useEffect } from 'react';
import { getEmployees, createEmployee, updateEmployee, deleteEmployee, initiateTestCall } from '../services/api';
import { UserPlus, Search, Edit2, Trash2, PhoneCall, Check, X, Phone } from 'lucide-react';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  
  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTestCallModalOpen, setIsTestCallModalOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    employee_id: '',
    name: '',
    phone_number: '',
    department: 'Operations',
    is_active: 1
  });
  
  const [testCallPhone, setTestCallPhone] = useState('');
  const [testCallTime, setTestCallTime] = useState('10:00 AM');
  const [formError, setFormError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await getEmployees({ search, department: deptFilter });
      if (res.success) {
        setEmployees(res.data);
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [search, deptFilter]);

  const handleOpenAdd = () => {
    const nextIdNum = 101 + employees.length;
    setFormData({
      employee_id: `EMP-${nextIdNum}`,
      name: '',
      phone_number: '+91',
      department: 'Operations',
      is_active: 1
    });
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (emp) => {
    setSelectedEmp(emp);
    setFormData({
      employee_id: emp.employee_id,
      name: emp.name,
      phone_number: emp.phone_number,
      department: emp.department,
      is_active: emp.is_active
    });
    setFormError('');
    setIsEditModalOpen(true);
  };

  const handleOpenTestCall = (emp) => {
    setSelectedEmp(emp);
    setTestCallPhone(emp.phone_number);
    setTestCallTime('10:00 AM');
    setIsTestCallModalOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setIsSubmitting(true);

    try {
      const res = await createEmployee(formData);
      if (res.success) {
        setActionSuccess(`Employee '${formData.name}' added successfully!`);
        setIsAddModalOpen(false);
        fetchEmployees();
      } else {
        setFormError(res.error || 'Failed to add employee');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setIsSubmitting(true);

    try {
      const res = await updateEmployee(selectedEmp.id, formData);
      if (res.success) {
        setActionSuccess(`Employee '${formData.name}' updated successfully!`);
        setIsEditModalOpen(false);
        fetchEmployees();
      } else {
        setFormError(res.error || 'Failed to update employee');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (emp) => {
    if (!window.confirm(`Are you sure you want to delete employee ${emp.name} (${emp.employee_id})?`)) {
      return;
    }

    try {
      const res = await deleteEmployee(emp.id);
      if (res.success) {
        setActionSuccess(`Employee ${emp.name} deleted.`);
        fetchEmployees();
      }
    } catch (err) {
      alert(`Error deleting employee: ${err.message}`);
    }
  };

  const handleTestCallSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await initiateTestCall({
        employee_id: selectedEmp.employee_id,
        target_phone_number: testCallPhone,
        custom_duty_time: testCallTime
      });

      if (res.success) {
        alert(`Test Call Initiated successfully!\nStatus: ${res.telephonyDetails?.status || 'initiated'}\nProvider: ${res.telephonyDetails?.provider}`);
        setIsTestCallModalOpen(false);
      } else {
        alert(`Error initiating call: ${res.error}`);
      }
    } catch (err) {
      alert(`Test Call Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const departmentsList = [
    'Operations',
    'Safety & Crew',
    'Engineering (Track)',
    'Signal & Telecom',
    'Traffic Control',
    'Electrical Traction',
    'Carriage & Wagon',
    'Control Room'
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Employee Directory</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Manage staff profiles and telephone notification contacts.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenAdd}>
          <UserPlus size={16} />
          Add Employee
        </button>
      </div>

      {actionSuccess && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          color: '#34d399',
          fontSize: '0.85rem',
          marginBottom: '1.5rem'
        }}>
          ✓ {actionSuccess}
        </div>
      )}

      {/* Filter & Search Toolbar */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '1.5rem',
        flexWrap: 'wrap'
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '2.4rem' }}
            placeholder="Search by Name, Employee ID, or Phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="form-select"
          style={{ width: '220px' }}
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
        >
          <option value="">All Departments</option>
          {departmentsList.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Employees Table */}
      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Phone Number</th>
              <th>Department</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No employees found matching criteria.
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr key={emp.id}>
                  <td>
                    <span style={{ fontWeight: 600, color: '#60a5fa' }}>{emp.employee_id}</span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{emp.name}</td>
                  <td>
                    <code>{emp.phone_number}</code>
                  </td>
                  <td>{emp.department}</td>
                  <td>
                    {emp.is_active ? (
                      <span className="badge-status status-completed">Active</span>
                    ) : (
                      <span className="badge-status status-failed">Inactive</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleOpenTestCall(emp)}
                        title="Trigger test voice call"
                      >
                        <PhoneCall size={13} />
                        Test Call
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleOpenEdit(emp)}
                        title="Edit employee details"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(emp)}
                        title="Delete employee"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Employee Modal */}
      {isAddModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Add New Railway Employee</h3>
              <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            {formError && (
              <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                {formError}
              </div>
            )}
            <form onSubmit={handleCreateSubmit}>
              <div className="form-group">
                <label>Employee ID *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Employee Full Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Ramesh Chandra"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Phone Number *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="+919876543210"
                  required
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Department *</label>
                <select
                  className="form-select"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                >
                  {departmentsList.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  className="form-select"
                  value={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: parseInt(e.target.value, 10) })}
                >
                  <option value={1}>Active</option>
                  <option value={0}>Inactive</option>
                </select>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {isEditModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Edit Employee: {formData.employee_id}</h3>
              <button onClick={() => setIsEditModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            {formError && (
              <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                {formError}
              </div>
            )}
            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label>Employee Full Name *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Phone Number *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Department *</label>
                <select
                  className="form-select"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                >
                  {departmentsList.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  className="form-select"
                  value={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: parseInt(e.target.value, 10) })}
                >
                  <option value={1}>Active</option>
                  <option value={0}>Inactive</option>
                </select>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Updating...' : 'Update Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Call Modal */}
      {isTestCallModalOpen && selectedEmp && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Initiate Call to {selectedEmp.name}</h3>
              <button onClick={() => setIsTestCallModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleTestCallSubmit} style={{ marginTop: '0.5rem' }}>
              <div className="form-group">
                <label>Employee</label>
                <input type="text" className="form-input" disabled value={`${selectedEmp.name} (${selectedEmp.employee_id})`} />
              </div>

              <div className="form-group">
                <label>Target Phone Number *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="+919876543210"
                  value={testCallPhone}
                  onChange={(e) => setTestCallPhone(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Duty Time *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={testCallTime}
                  onChange={(e) => setTestCallTime(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsTestCallModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  <PhoneCall size={15} />
                  {isSubmitting ? 'Dialing...' : 'Dispatch Call Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const getSystemInfo = async () => {
  const res = await api.get('/system/info');
  return res.data;
};

export const getSummaryStats = async () => {
  const res = await api.get('/calls/summary');
  return res.data;
};

// Employees
export const getEmployees = async (params = {}) => {
  const res = await api.get('/employees', { params });
  return res.data;
};

export const createEmployee = async (employeeData) => {
  const res = await api.post('/employees', employeeData);
  return res.data;
};

export const updateEmployee = async (id, employeeData) => {
  const res = await api.put(`/employees/${id}`, employeeData);
  return res.data;
};

export const deleteEmployee = async (id) => {
  const res = await api.delete(`/employees/${id}`);
  return res.data;
};

// Duties
export const getDuties = async (params = {}) => {
  const res = await api.get('/duties', { params });
  return res.data;
};

export const createDuty = async (dutyData) => {
  const res = await api.post('/duties', dutyData);
  return res.data;
};

export const updateDuty = async (id, dutyData) => {
  const res = await api.put(`/duties/${id}`, dutyData);
  return res.data;
};

export const deleteDuty = async (id) => {
  const res = await api.delete(`/duties/${id}`);
  return res.data;
};

export const resetDutyStatus = async (id) => {
  const res = await api.post(`/duties/${id}/reset`);
  return res.data;
};

// Calls & Test Call
export const getCallLogs = async (params = {}) => {
  const res = await api.get('/calls', { params });
  return res.data;
};

export const initiateTestCall = async (testData) => {
  const res = await api.post('/calls/test', testData);
  return res.data;
};

// Scheduler Control
export const getSchedulerStatus = async () => {
  const res = await api.get('/calls/scheduler');
  return res.data;
};

export const toggleScheduler = async (enabled) => {
  const res = await api.post('/calls/scheduler/toggle', { enabled });
  return res.data;
};

export const triggerScheduler = async () => {
  const res = await api.post('/calls/scheduler/trigger');
  return res.data;
};

export const simulateDtmfResponse = async (data) => {
  const res = await api.post('/webhooks/dtmf-simulate', data);
  return res.data;
};

export default api;

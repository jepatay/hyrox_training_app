const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

function getToken() {
  return new URLSearchParams(window.location.search).get('access') ||
         sessionStorage.getItem('access_token') || ''
}

async function request(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Access-Token': getToken(),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  // Training
  getTrainingSessions: () => request('GET', '/training'),
  getTrainingSession: (id) => request('GET', `/training/${id}`),
  createTrainingSession: (data) => request('POST', '/training', data),
  updateTrainingSession: (id, data) => request('PUT', `/training/${id}`, data),
  deleteTrainingSession: (id) => request('DELETE', `/training/${id}`),

  // Objectives
  getObjectives: () => request('GET', '/objectives'),
  createObjective: (data) => request('POST', '/objectives', data),
  updateObjective: (id, data) => request('PUT', `/objectives/${id}`, data),
  deleteObjective: (id) => request('DELETE', `/objectives/${id}`),

  // Records
  getRecords: () => request('GET', '/records'),
  createRecord: (data) => request('POST', '/records', data),
  updateRecord: (id, data) => request('PUT', `/records/${id}`, data),
  deleteRecord: (id) => request('DELETE', `/records/${id}`),

  // Suggestions
  getSuggestion: (params) => request('POST', '/suggestions', params),

  // Venues
  getVenues: () => request('GET', '/venues'),
  createVenue: (data) => request('POST', '/venues', data),
  updateVenue: (id, data) => request('PUT', `/venues/${id}`, data),
  deleteVenue: (id) => request('DELETE', `/venues/${id}`),

  // Coaching
  getCoachingFeedback: (sessionId) => request('GET', `/coaching/${sessionId}`),

  // Reports
  getMonthlyReport: (year, month) => request('GET', `/reports/${year}/${month}`),
}

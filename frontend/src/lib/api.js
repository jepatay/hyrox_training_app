const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function getToken() {
  return localStorage.getItem('access_token') || '';
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
  };
}

async function request(method, path, body) {
  const opts = { method, headers: headers() };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (res.status === 401) {
    localStorage.removeItem('access_token');
    window.dispatchEvent(new Event('unauthorized'));
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
};

// Domain-specific helpers
export const objectivesApi = {
  list: () => api.get('/api/objectives'),
  get: (id) => api.get(`/api/objectives/${id}`),
  create: (data) => api.post('/api/objectives', data),
  update: (id, data) => api.put(`/api/objectives/${id}`, data),
  delete: (id) => api.delete(`/api/objectives/${id}`),
  readiness: (id) => api.post(`/api/objectives/${id}/readiness`, {}),
};

export const sessionsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/api/sessions${qs ? '?' + qs : ''}`);
  },
  get: (id) => api.get(`/api/sessions/${id}`),
  create: (data) => api.post('/api/sessions', data),
  update: (id, data) => api.put(`/api/sessions/${id}`, data),
  delete: (id) => api.delete(`/api/sessions/${id}`),
};

export const recordsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/api/records${qs ? '?' + qs : ''}`);
  },
  create: (data) => api.post('/api/records', data),
  update: (id, data) => api.put(`/api/records/${id}`, data),
  delete: (id) => api.delete(`/api/records/${id}`),
};

export const coachingApi = {
  generateFeedback: (sessionId) => api.post('/api/coaching/feedback', { sessionId }),
  reply: (sessionId, reply) => api.post('/api/coaching/feedback/reply', { sessionId, reply }),
  generateStationScores: (sessionId) => api.post('/api/coaching/station-scores', { sessionId }),
};

export const suggestionsApi = {
  generate: (data) => api.post('/api/suggestions', data),
  refine: (previousSuggestion, refinement) => api.post('/api/suggestions/refine', { previousSuggestion, refinement }),
  getStationFocus: () => api.get('/api/suggestions/station-focus'),
  recalculateStationFocus: () => api.post('/api/suggestions/station-focus', {}),
};

export const profileApi = {
  get: () => api.get('/api/profile'),
  update: (data) => api.put('/api/profile', data),
};

export const reportsApi = {
  monthly: (_month, _year, endDate) => api.get(`/api/reports/monthly${endDate ? `?endDate=${endDate}` : ''}`),
};

export const venuesApi = {
  list: () => api.get('/api/venues'),
  create: (data) => api.post('/api/venues', data),
  update: (id, data) => api.put(`/api/venues/${id}`, data),
  delete: (id) => api.delete(`/api/venues/${id}`),
};

export const knowledgeApi = {
  get: (id) => api.get(`/api/knowledge/${id}`),
  save: (id, content) => api.put(`/api/knowledge/${id}`, { content }),
};

export const stravaApi = {
  getStatus: () => api.get('/api/strava/status'),
  getAuthUrl: () => api.get('/api/strava/auth-url'),
  exchange: (code) => api.post('/api/strava/exchange', { code }),
  sync: () => api.post('/api/strava/sync', {}),
  backfillNotes: () => api.post('/api/strava/backfill-notes', {}),
  disconnect: () => api.delete('/api/strava/disconnect'),
  debug: () => api.get('/api/strava/debug'),
};

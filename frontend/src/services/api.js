/**
 * API Service Layer
 * Centralized API client with proper error handling, auth, and environment config
 */

import { parseError } from '../errors';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// ============================================
// API Client Setup
// ============================================
class ApiClient {
  constructor(baseURL) {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  setAuthToken(token) {
    if (token) {
      this.defaultHeaders['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.defaultHeaders['Authorization'];
    }
  }

  async request(method, endpoint, data = null, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      method,
      headers: { ...this.defaultHeaders, ...options.headers },
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, config);
      const responseData = await response.json().catch(() => null);

      if (!response.ok) {
        // Parse standardized error response
        const error = parseError({ 
          ok: false, 
          status: response.status, 
          data: responseData 
        });
        throw error;
      }

      return { success: true, data: responseData };
    } catch (error) {
      console.error(`[API] ${method} ${endpoint} failed:`, error);
      throw error;
    }
  }

  get(endpoint, options) {
    return this.request('GET', endpoint, null, options);
  }

  post(endpoint, data, options) {
    return this.request('POST', endpoint, data, options);
  }

  put(endpoint, data, options) {
    return this.request('PUT', endpoint, data, options);
  }

  patch(endpoint, data, options) {
    return this.request('PATCH', endpoint, data, options);
  }

  delete(endpoint, options) {
    return this.request('DELETE', endpoint, null, options);
  }
}

// Create singleton instance
export const api = new ApiClient(API_URL);

// ============================================
// API Contract - Session Endpoints
// ============================================

/**
 * Session API Contract
 * 
 * GET /api/stream/session/:id
 *   Response: { session: {...}, scenes: [...] }
 * 
 * POST /api/stream/story/sync
 *   Body: { input, genre, chapters, protagonist }
 *   Response: { sessionId, chapters: [...] }
 * 
 * POST /api/stream/session/:id/chapter/:index
 *   Body: { content }
 *   Response: { success, chapter: {...} }
 * 
 * POST /api/stream/session/:id/recompute/:index
 *   Response: SSE stream of chapter events
 */

// Session endpoints
export const sessionApi = {
  get: async (id) => {
    const { data } = await api.get(`/api/stream/session/${id}`);
    
    // HARD ENFORCEMENT: throws if invalid
    const { validateSession, validateScene } = await import('../contracts.js');
    validateSession(data.session);
    data.scenes.forEach(scene => validateScene(scene));
    
    return data;
  },
  
  createStory: async (data) => {
    // HARD ENFORCEMENT: throws if invalid
    const { validateGenerateStoryRequest } = await import('../contracts.js');
    validateGenerateStoryRequest(data);
    
    const { data: result } = await api.post('/api/stream/story/sync', data);
    
    // HARD ENFORCEMENT: throws if invalid
    const { validateGenerateStoryResponse } = await import('../contracts.js');
    validateGenerateStoryResponse(result);
    
    return result;
  },
  
  editChapter: async (sessionId, index, content) => {
    const { data } = await api.post(`/api/stream/session/${sessionId}/chapter/${index + 1}`, { content });
    
    // HARD ENFORCEMENT: throws if invalid
    const { validateEditChapterResponse } = await import('../contracts.js');
    validateEditChapterResponse(data);
    
    return data;
  },
  
  recompute: async (sessionId, index) => {
    // Returns SSE stream, handled by caller
    return fetch(`${API_URL}/api/stream/session/${sessionId}/recompute/${index + 1}`, {
      method: 'POST',
    });
  },
};

// ============================================
// API Contract - Export Endpoints
// ============================================

/**
 * Export API Contract
 * 
 * POST /api/export
 *   Body: { sessionId, mode, branchId? }
 *   Response: { success, exportUrl }
 */

// Export endpoints
export const exportApi = {
  export: async (data) => {
    // HARD ENFORCEMENT: throws if invalid
    const { validateExportRequest } = await import('../contracts.js');
    validateExportRequest(data);
    
    const { data: result } = await api.post('/api/export', data);
    
    // HARD ENFORCEMENT: throws if invalid
    const { validateExportResponse } = await import('../contracts.js');
    validateExportResponse(result);
    
    return result;
  },
};

// ============================================
// API Contract - Branch Endpoints
// ============================================

/**
 * Branch API Contract
 * 
 * GET /api/stream/session/:id/branches
 *   Response: { branches: [...] }
 * 
 * POST /api/stream/session/:id/branch/:chapterIndex
 *   Body: { parentBranchId, name, choiceText }
 *   Response: { branchId }
 */

// Branch endpoints
export const branchApi = {
  getTree: async (sessionId) => {
    const { data } = await api.get(`/api/stream/session/${sessionId}/branches`);
    
    // HARD ENFORCEMENT: throws if invalid
    const { validateBranch } = await import('../contracts.js');
    data.branches.forEach(branch => validateBranch(branch));
    
    return data;
  },
  
  create: async (sessionId, chapterIndex, data) => {
    // HARD ENFORCEMENT: throws if invalid
    const { validateCreateBranchRequest } = await import('../contracts.js');
    validateCreateBranchRequest(data);
    
    const { data: result } = await api.post(`/api/stream/session/${sessionId}/branch/${chapterIndex}`, data);
    
    return result;
  },
  
  checkout: async (sessionId, branchId) => {
    const { data } = await api.post(`/api/stream/session/${sessionId}/branch/${branchId}/checkout`);
    
    return data;
  },
  
  merge: async (sessionId, branchId) => {
    const { data } = await api.post(`/api/stream/session/${sessionId}/branch/${branchId}/merge`);
    
    return data;
  },
};

// ============================================
// Error Handling Utilities
// ============================================

export function handleApiError(error) {
  if (error.status) {
    const errorMessages = {
      400: 'Invalid request. Please check your input.',
      401: 'Unauthorized. Please log in again.',
      403: 'Forbidden. You do not have permission.',
      404: 'Resource not found.',
      409: 'Conflict. Another operation may be in progress.',
      422: 'Validation error. Please check your input.',
      500: 'Server error. Please try again later.',
    };
    return errorMessages[error.status] || error.message || 'An error occurred';
  }
  return error.message || 'Network error. Please check your connection.';
}

export function isRetryableError(error) {
  // Retry on network errors or 5xx server errors
  if (!error.status) return true;
  return error.status >= 500;
}

// ============================================
// Usage Example
// ============================================

/**
 * Example usage:
 * 
 * import { sessionApi, handleApiError } from '../services/api';
 * 
 * async function loadSession(id) {
 *   try {
 *     const { data } = await sessionApi.get(id);
 *     return data;
 *   } catch (err) {
 *     alert(handleApiError(err));
 *   }
 * }
 * 
 * async function editChapter(sessionId, index, content) {
 *   try {
 *     const { data } = await sessionApi.editChapter(sessionId, index, content);
 *     return data;
 *   } catch (err) {
 *     console.error('Edit failed:', err);
 *     throw err;
 *   }
 * }
 */
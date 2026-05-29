import axios from 'axios';

const pendingRequests = new Map();

const stableStringify = (value) => {
  if (!value) return '';
  if (typeof value !== 'object') return String(value);

  return JSON.stringify(value, Object.keys(value).sort());
};

const getRequestKey = (config) => {
  const method = (config.method || 'get').toUpperCase();
  const url = `${config.baseURL || ''}${config.url || ''}`;
  const params = stableStringify(config.params);
  const data = stableStringify(config.data);

  return [method, url, params, data].join('|');
};

axios.interceptors.request.use((config) => {
  const requestKey = getRequestKey(config);

  if (pendingRequests.has(requestKey)) {
    throw new axios.CanceledError('Duplicate request blocked');
  }

  config.__requestKey = requestKey;
  pendingRequests.set(requestKey, true);
  return config;
});

axios.interceptors.response.use(
  (response) => {
    if (response.config.__requestKey) {
      pendingRequests.delete(response.config.__requestKey);
    }
    return response;
  },
  (error) => {
    if (error.config?.__requestKey) {
      pendingRequests.delete(error.config.__requestKey);
    }
    return Promise.reject(error);
  }
);

export const isDuplicateRequest = (error) => (
  axios.isCancel(error) && error.message === 'Duplicate request blocked'
);

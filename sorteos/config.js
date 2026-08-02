const ES_LOCAL =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

window.API_BASE_URL = ES_LOCAL
  ? 'http://localhost:3000/api'
  : 'https://deseo-premios-api.onrender.com/api';

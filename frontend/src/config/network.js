const browserHost = window.location.hostname || 'localhost';
const apiProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

const apiOrigin = import.meta.env.VITE_API_ORIGIN || `${apiProtocol}//${browserHost}:8000`;
const wsOrigin = import.meta.env.VITE_WS_ORIGIN || `${wsProtocol}//${browserHost}:8000`;

export const API_ROOT = `${apiOrigin}/api`;
export const WS_ROOT = wsOrigin;
export const UPLOADS_ROOT = `${apiOrigin}/uploads`;

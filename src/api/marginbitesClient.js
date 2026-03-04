/**
 * Legacy compatibility shim.
 * All logic has moved to src/api/pb.js.
 * Pages that import from '@/api/marginbitesClient' continue to work unchanged.
 */
export { pb, auth, appLogs, entities, marginbites, toFilter } from './pb.js';
export { marginbites as default } from './pb.js';

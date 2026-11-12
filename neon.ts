// Neon CLI project services. The final options are validated when you run
// `neon init ...` then `neon config plan` with the installed CLI.
// Do not add secrets to this file.
import { defineConfig } from '@neon/config/v1';
export default defineConfig({
  auth: true,
  aiGateway: true,
  preview: { realtime: true },
  buckets: {
    'hebron-private': { access: 'private' },
  },
  functions: {
    health: {
      name: 'Hebron database health',
      source: './neon-functions/health.ts',
    },
  },
});

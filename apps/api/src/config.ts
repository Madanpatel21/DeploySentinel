import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  WEB_URL: z.string().default('http://localhost:3000'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  SUPABASE_DB_SCHEMA: z.string().default('releaseguard'),
  JWT_SECRET: z.string().min(16),
  PASSPORT_SIGNING_SECRET: z.string().min(16),
  WEBHOOK_SIGNING_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(16),
  REDIS_URL: z.string().optional().default(''),
  AI_PROVIDER: z.enum(['local', 'openai', 'anthropic', 'ollama']).default('local'),
  OPENAI_API_KEY: z.string().optional().default(''),
});

export const config = EnvSchema.parse(process.env);

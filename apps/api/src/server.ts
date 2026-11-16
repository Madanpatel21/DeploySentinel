import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { config } from './config.js';
import { supabase } from './db/supabase.js';
import { authRoutes } from './routes/auth.js';
import { releaseRoutes } from './routes/releases.js';
import { governanceRoutes } from './routes/governance.js';
import { opsRoutes } from './routes/ops.js';

export async function buildApp() {
  const app = Fastify({
    logger: { level: config.NODE_ENV === 'test' ? 'silent' : 'info' },
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'ReleaseGuard Control Plane API',
        description: 'Enterprise DevOps Intelligence, Release Risk Management & SRE Control Plane REST API v1',
        version: '1.0.0',
      },
      servers: [{ url: '/api/v1' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          apiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/v1/docs',
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: 'Validation failed',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : String(err);
    return reply.code(statusCode).send({
      error: statusCode >= 500 && config.NODE_ENV === 'production' ? 'Internal server error' : message,
    });
  });

  app.get('/healthz', async () => ({ status: 'ok', service: 'releaseguard-api', timestamp: new Date().toISOString() }));

  app.get('/readyz', async (_req, reply) => {
    const { error } = await supabase.from('organizations').select('id').limit(1);
    if (error) {
      return reply.code(503).send({ status: 'degraded', db: 'unreachable', error: error.message });
    }
    return { status: 'ready', db: 'supabase-pg17-releaseguard', timestamp: new Date().toISOString() };
  });

  app.get('/metrics', async (_req, reply) => {
    const [{ count: relCount }, { count: incCount }] = await Promise.all([
      supabase.from('releases').select('id', { count: 'exact', head: true }),
      supabase.from('incidents').select('id', { count: 'exact', head: true }).neq('status', 'RESOLVED'),
    ]);
    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return [
      '# HELP releaseguard_releases_total Total releases analyzed across tenants',
      '# TYPE releaseguard_releases_total gauge',
      `releaseguard_releases_total ${relCount ?? 0}`,
      '# HELP releaseguard_open_incidents_total Active unresolved incidents',
      '# TYPE releaseguard_open_incidents_total gauge',
      `releaseguard_open_incidents_total ${incCount ?? 0}`,
      `releaseguard_up 1`,
    ].join('\n');
  });

  await app.register(
    async (v1) => {
      await v1.register(authRoutes);
      await v1.register(releaseRoutes);
      await v1.register(governanceRoutes);
      await v1.register(opsRoutes);
    },
    { prefix: '/api/v1' }
  );

  return app;
}

if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  const app = await buildApp();
  await app.listen({ port: config.PORT, host: config.HOST });
}

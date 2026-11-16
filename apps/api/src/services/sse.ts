import type { FastifyReply } from 'fastify';

interface SseClient {
  organizationId: string;
  reply: FastifyReply;
}

const clients = new Set<SseClient>();

export function registerSseClient(organizationId: string, reply: FastifyReply): () => void {
  const client: SseClient = { organizationId, reply };
  clients.add(client);
  return () => {
    clients.delete(client);
  };
}

export function broadcastOrgEvent(organizationId: string, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify({ timestamp: new Date().toISOString(), ...((typeof data === 'object' && data) || { value: data }) })}\n\n`;
  for (const client of clients) {
    if (client.organizationId === organizationId) {
      try {
        client.reply.raw.write(payload);
      } catch {
        clients.delete(client);
      }
    }
  }
}

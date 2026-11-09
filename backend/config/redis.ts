import { Redis } from '@upstash/redis';
import { logger } from './logger.js';

let client: Redis | null = null;

export function getRedis(): Redis | null {
  return client;
}

export async function connectRedis(): Promise<void> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    logger.warn('UPSTASH_REDIS_REST_URL/TOKEN non définis — cache Redis désactivé');
    return;
  }

  try {
    client = new Redis({ url, token });
    await client.ping(); // Vérifie la connectivité au démarrage
    logger.info('Redis (Upstash) connecté');
  } catch (err) {
    logger.warn('Redis non disponible — cache désactivé', { message: (err as Error).message });
    client = null;
  }
}

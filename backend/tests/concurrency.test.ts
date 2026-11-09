import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../utils/concurrency.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('mapWithConcurrency', () => {
  it('ne dépasse jamais la limite de tâches simultanées', async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
      running++;
      peak = Math.max(peak, running);
      await sleep(5);
      running--;
    });
    expect(peak).toBe(3);
  });

  it("conserve l'ordre des résultats même si les tâches finissent dans le désordre", async () => {
    const results = await mapWithConcurrency([30, 5, 15], 3, async ms => { await sleep(ms); return ms; });
    expect(results.map(r => (r.status === 'fulfilled' ? r.value : null))).toEqual([30, 5, 15]);
  });

  it("rapporte l'échec d'une tâche sans interrompre les autres", async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async n => {
      if (n === 2) throw new Error('boom');
      return n;
    });
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });

  it('accepte une liste vide', async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
  });

  it('traite tout même avec une limite supérieure au nombre de tâches', async () => {
    const results = await mapWithConcurrency([1, 2], 10, async n => n * 2);
    expect(results.map(r => (r.status === 'fulfilled' ? r.value : null))).toEqual([2, 4]);
  });
});

import { Router, Request, Response } from 'express';
import Suggestion from '../models/Suggestion.model.js';
import { logAction } from '../models/HistoryLog.model.js';
import { verifyJWT } from './auth.routes.js';
import { cache, invalidateCache } from '../middleware/cache.js';
import { logger } from '../config/logger.js';
import {
  SUGGESTION_TYPES, SuggestionOrderError, compareSuggestions, nextPosition, reorder, setPinned, sortSuggestions, type SuggestionType,
} from '../services/suggestionOrder.js';

const router = Router();

const invalidateSuggestions = () => invalidateCache('/api/suggestions');

const isType = (v: unknown): v is SuggestionType => typeof v === 'string' && (SUGGESTION_TYPES as string[]).includes(v);

// La position et l'épingle ne se règlent que par leurs routes dédiées : jamais par le corps d'une création ou d'une modification.
function withoutOrdering(body: Record<string, unknown>): Record<string, unknown> {
  const { ordre: _ordre, epinglee: _epinglee, ...rest } = body ?? {};
  void _ordre; void _epinglee;
  return rest;
}

// ── GET /api/suggestions — Public (actives, filtrables par type) ──────────────
router.get('/', cache(300), async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: Record<string, unknown> = { actif: true };
    if (req.query.type) filter.type = req.query.type;
    // Ordre : épinglée d'abord, puis position réglée par l'équipe, puis les plus récentes (voir services/suggestionOrder.ts).
    const suggestions = sortSuggestions(await Suggestion.find(filter).lean());
    res.json({ success: true, data: suggestions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur récupération suggestions', error: (error as Error).message });
  }
});

// ── GET /api/suggestions/all — Admin (toutes, filtrables, pas de cache) ───────
router.get('/all', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.actif !== undefined) filter.actif = req.query.actif === 'true';
    const found = await Suggestion.find(filter).lean();
    const suggestions = found.sort((a, b) => a.type.localeCompare(b.type) || compareSuggestions(a, b));
    res.json({ success: true, data: suggestions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur', error: (error as Error).message });
  }
});

// ── POST /api/suggestions ─────────────────────────────────────────────────────
router.post('/', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = withoutOrdering(req.body);
    if (!isType(body.type)) { res.status(400).json({ success: false, message: 'Type de suggestion invalide (crudites ou fruits).' }); return; }
    // Ajoutée en fin de liste : une nouvelle suggestion ne déplace jamais les autres, ni la meilleure salade épinglée.
    const suggestion = new Suggestion({ ...body, ordre: await nextPosition(body.type) });
    await suggestion.save();
    await logAction(`Suggestion "${suggestion.nom}" créée`, 'menu', 'Admin');
    await invalidateSuggestions();
    res.status(201).json({ success: true, data: suggestion });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur création suggestion', error: (error as Error).message });
  }
});

// ── PATCH /api/suggestions/reorder — Nouvel ordre d'un type (admin) ───────────
router.patch('/reorder', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, ids } = (req.body ?? {}) as { type?: unknown; ids?: unknown };
    if (!isType(type)) { res.status(400).json({ success: false, message: 'Type de suggestion invalide (crudites ou fruits).' }); return; }
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id))) {
      res.status(400).json({ success: false, message: "Liste d'identifiants invalide." }); return;
    }
    await reorder(type, ids as string[]);
    await logAction(`Ordre des suggestions « ${type} » modifié`, 'menu', 'Admin');
    await invalidateSuggestions();
    res.json({ success: true });
  } catch (error) {
    if (error instanceof SuggestionOrderError) { res.status(error.status).json({ success: false, message: error.message }); return; }
    logger.error('[Suggestions] réordonnancement impossible', { message: (error as Error).message });
    res.status(500).json({ success: false, message: 'Erreur lors du réordonnancement' });
  }
});

// ── PATCH /api/suggestions/:id/pin — Épingler la « meilleure salade » en première position (admin) ──
router.patch('/:id/pin', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { epinglee } = (req.body ?? {}) as { epinglee?: unknown };
    if (typeof epinglee !== 'boolean') { res.status(400).json({ success: false, message: 'epinglee doit être vrai ou faux.' }); return; }
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) { res.status(404).json({ success: false, message: 'Suggestion introuvable' }); return; }
    const suggestion = await setPinned(req.params.id, epinglee);
    await logAction(`Suggestion "${suggestion?.nom}" ${epinglee ? 'épinglée en première position' : 'désépinglée'}`, 'menu', 'Admin');
    await invalidateSuggestions();
    res.json({ success: true, data: suggestion });
  } catch (error) {
    if (error instanceof SuggestionOrderError) { res.status(error.status).json({ success: false, message: error.message }); return; }
    logger.error('[Suggestions] épinglage impossible', { message: (error as Error).message });
    res.status(500).json({ success: false, message: "Erreur lors de l'épinglage" });
  }
});

// ── PATCH /api/suggestions/:id ────────────────────────────────────────────────
router.patch('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = withoutOrdering(req.body);
    const current = await Suggestion.findById(req.params.id).select('type').lean();
    if (!current) { res.status(404).json({ success: false, message: 'Suggestion introuvable' }); return; }
    // Changer de type = rejoindre la fin de la liste de l'autre type, sans reprendre l'épingle de l'ancien.
    const moving = body.type !== undefined && body.type !== current.type;
    if (moving && !isType(body.type)) { res.status(400).json({ success: false, message: 'Type de suggestion invalide (crudites ou fruits).' }); return; }
    const update = moving ? { ...body, ordre: await nextPosition(body.type as SuggestionType), epinglee: false } : body;
    const suggestion = await Suggestion.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!suggestion) { res.status(404).json({ success: false, message: 'Suggestion introuvable' }); return; }
    await logAction(`Suggestion "${suggestion.nom}" modifiée`, 'menu', 'Admin');
    await invalidateSuggestions();
    res.json({ success: true, data: suggestion });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Erreur modification', error: (error as Error).message });
  }
});

// ── DELETE /api/suggestions/:id ───────────────────────────────────────────────
router.delete('/:id', verifyJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const suggestion = await Suggestion.findByIdAndDelete(req.params.id);
    if (!suggestion) { res.status(404).json({ success: false, message: 'Suggestion introuvable' }); return; }
    await logAction(`Suggestion "${suggestion.nom}" supprimée`, 'menu', 'Admin');
    await invalidateSuggestions();
    res.json({ success: true, message: 'Suggestion supprimée' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur suppression', error: (error as Error).message });
  }
});

export default router;

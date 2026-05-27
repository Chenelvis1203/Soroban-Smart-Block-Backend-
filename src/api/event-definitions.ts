import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prismaRead, prismaWrite } from '../db';

export const eventDefinitionRouter = Router();

// Verified creators must supply a developer or premium API key (X-API-Key header).
// The key is stored as `submittedBy` for audit purposes; actual key validation
// is handled by the tieredRateLimit middleware mounted in router.ts.
function requireApiKey(req: Request, res: Response): string | null {
  const key = req.headers['x-api-key'] as string | undefined;
  if (!key) {
    res.status(401).json({ error: 'X-API-Key header required to submit event definitions' });
    return null;
  }
  return key;
}

const definitionSchema = z.object({
  topicSymbol: z.string().min(1).max(64),
  humanTemplate: z.string().min(1).max(512),
});

const bulkSchema = z.object({
  definitions: z.array(definitionSchema).min(1).max(50),
});

// GET /contracts/:address/event-definitions
// List all custom event definitions for a contract.
eventDefinitionRouter.get('/', async (req: Request, res: Response) => {
  const { address } = req.params;
  const defs = await prismaRead.eventDefinition.findMany({
    where: { contractAddress: address },
    select: { id: true, topicSymbol: true, humanTemplate: true, submittedBy: true, updatedAt: true },
    orderBy: { topicSymbol: 'asc' },
  });
  res.json(defs);
});

// POST /contracts/:address/event-definitions
// Submit one or more event symbol → template bindings.
// Body: { definitions: [{ topicSymbol, humanTemplate }] }
eventDefinitionRouter.post('/', async (req: Request, res: Response) => {
  const key = requireApiKey(req, res);
  if (!key) return;

  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { address } = req.params;
  const { definitions } = parsed.data;

  // Upsert each binding — idempotent so re-submissions update the template.
  const results = await Promise.all(
    definitions.map((d) =>
      prismaWrite.eventDefinition.upsert({
        where: { contractAddress_topicSymbol: { contractAddress: address, topicSymbol: d.topicSymbol } },
        update: { humanTemplate: d.humanTemplate, submittedBy: key },
        create: { contractAddress: address, topicSymbol: d.topicSymbol, humanTemplate: d.humanTemplate, submittedBy: key },
        select: { id: true, topicSymbol: true, humanTemplate: true },
      })
    )
  );

  res.status(201).json(results);
});

// DELETE /contracts/:address/event-definitions/:topicSymbol
// Remove a single binding.
eventDefinitionRouter.delete('/:topicSymbol', async (req: Request, res: Response) => {
  const key = requireApiKey(req, res);
  if (!key) return;

  const { address, topicSymbol } = req.params;
  try {
    await prismaWrite.eventDefinition.delete({
      where: { contractAddress_topicSymbol: { contractAddress: address, topicSymbol } },
    });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: 'Event definition not found' });
  }
});

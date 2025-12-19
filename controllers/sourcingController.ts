import { Request, Response } from 'express';
import prisma from '../prisma/client';
import { getProductOrFetch } from '../services/productService';
import logger from '../lib/logger';

export const listSourcingNotes = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const notes = await prisma.sourcingNote.findMany({
    where: { organizationId: req.user.organizationId },
    include: { product: true }
  });
  return res.json(notes);
};

export const addSourcingNote = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const { asin, supplierUrl, costPrice, minOrderQty } = req.body;
  if (!asin || typeof asin !== 'string') {
    return res.status(400).json({ error: 'ASIN is required' });
  }

  try {
    await getProductOrFetch(asin);
    const note = await prisma.sourcingNote.create({
      data: {
        productId: asin,
        userId: req.user.userId,
        organizationId: req.user.organizationId,
        supplierUrl,
        costPrice: costPrice ?? 0,
        minOrderQty
      }
    });
    return res.status(201).json(note);
  } catch (err) {
    logger.warn('Failed to add sourcing note', { error: err });
    return res.status(400).json({ error: 'Could not add sourcing note' });
  }
};

export const deleteSourcingNote = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.params;
  await prisma.sourcingNote.deleteMany({
    where: { id, organizationId: req.user.organizationId }
  });
  return res.status(204).send();
};


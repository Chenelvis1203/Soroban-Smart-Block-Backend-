import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Mock DB first with inlined methods
vi.mock('../../src/db', () => ({
  prismaRead: {
    transaction: { findMany: vi.fn() },
    event: { findMany: vi.fn() },
  },
  prismaWrite: {
    exportJob: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

// Mock fs to avoid writing actual files
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn().mockReturnValue({
      write: vi.fn(),
      end: vi.fn().mockImplementation(function (cb: (err: null) => void) {
        cb(null);
      }),
    }),
  };
});

// 2. Safe imports
import * as db from '../../src/db';
import { enqueueExport, runExportJob } from '../../src/indexer/csv-exporter';

describe('enqueueExport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an export job and returns its id', async () => {
    vi.mocked(db.prismaWrite.exportJob.create).mockResolvedValue({
      id: 'job-abc',
      exportType: 'transactions',
      filters: {},
      status: 'pending',
    } as any);
    vi.mocked(db.prismaWrite.exportJob.findUnique).mockResolvedValue({
      id: 'job-abc',
      exportType: 'transactions',
      filters: {},
      status: 'pending',
    } as any);
    vi.mocked(db.prismaRead.transaction.findMany).mockResolvedValue([]);
    vi.mocked(db.prismaWrite.exportJob.update).mockResolvedValue({} as any);

    const jobId = await enqueueExport('transactions', { contract: 'CA...' });
    expect(jobId).toBe('job-abc');
    expect(db.prismaWrite.exportJob.create).toHaveBeenCalledOnce();
  });
});

describe('runExportJob', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips job that does not exist', async () => {
    vi.mocked(db.prismaWrite.exportJob.findUnique).mockResolvedValue(null);
    await runExportJob('nonexistent-job');
    expect(db.prismaWrite.exportJob.update).not.toHaveBeenCalled();
  });

  it('skips job that is not pending', async () => {
    vi.mocked(db.prismaWrite.exportJob.findUnique).mockResolvedValue({
      id: 'job-1',
      status: 'done',
      exportType: 'transactions',
      filters: {},
    } as any);
    await runExportJob('job-1');
    expect(db.prismaWrite.exportJob.update).not.toHaveBeenCalled();
  });

  it('processes a transactions export job to completion', async () => {
    vi.mocked(db.prismaWrite.exportJob.findUnique).mockResolvedValue({
      id: 'job-tx',
      exportType: 'transactions',
      filters: {},
      status: 'pending',
    } as any);
    vi.mocked(db.prismaRead.transaction.findMany).mockResolvedValue([]);
    vi.mocked(db.prismaWrite.exportJob.update).mockResolvedValue({} as any);

    await runExportJob('job-tx');

    expect(db.prismaWrite.exportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'done' }) }),
    );
  });

  it('processes an events export job to completion', async () => {
    vi.mocked(db.prismaWrite.exportJob.findUnique).mockResolvedValue({
      id: 'job-ev',
      exportType: 'events',
      filters: {},
      status: 'pending',
    } as any);
    vi.mocked(db.prismaRead.event.findMany).mockResolvedValue([]);
    vi.mocked(db.prismaWrite.exportJob.update).mockResolvedValue({} as any);

    await runExportJob('job-ev');

    expect(db.prismaWrite.exportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'done' }) }),
    );
  });

  it('marks job as failed when an error occurs', async () => {
    vi.mocked(db.prismaWrite.exportJob.findUnique).mockResolvedValue({
      id: 'job-fail',
      exportType: 'transactions',
      filters: {},
      status: 'pending',
    } as any);
    vi.mocked(db.prismaWrite.exportJob.update).mockResolvedValueOnce({} as any); // running update
    vi.mocked(db.prismaRead.transaction.findMany).mockRejectedValue(new Error('DB error'));

    await expect(runExportJob('job-fail')).rejects.toThrow('DB error');

    expect(db.prismaWrite.exportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
  });
});

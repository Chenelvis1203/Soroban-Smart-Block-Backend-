import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  contract: {
    findUnique: vi.fn(),
  },
  transaction: {
    groupBy: vi.fn(),
  },
};

vi.mock('../src/db', () => ({
  prisma: prismaMock,
}));

describe('getContractFunctionStats', () => {
  beforeEach(() => {
    prismaMock.contract.findUnique.mockReset();
    prismaMock.transaction.groupBy.mockReset();
  });

  it('returns grouped function stats sorted by call count', async () => {
    prismaMock.contract.findUnique.mockResolvedValue({ address: 'C123' });
    prismaMock.transaction.groupBy.mockResolvedValue([
      {
        functionName: 'swap',
        _count: { functionName: 7 },
        _max: { ledgerCloseTime: new Date('2026-05-20T10:00:00.000Z') },
      },
      {
        functionName: 'deposit',
        _count: { functionName: 3 },
        _max: { ledgerCloseTime: new Date('2026-05-19T09:00:00.000Z') },
      },
    ]);

    const { getContractFunctionStats } = await import('../src/api/contracts');
    const result = await getContractFunctionStats('C123');

    expect(prismaMock.transaction.groupBy).toHaveBeenCalledWith({
      by: ['functionName'],
      where: {
        contractAddress: 'C123',
        functionName: { not: null },
      },
      _count: { functionName: true },
      _max: { ledgerCloseTime: true },
      orderBy: [
        { _count: { functionName: 'desc' } },
        { functionName: 'asc' },
      ],
    });
    expect(result).toEqual([
      {
        functionName: 'swap',
        callCount: 7,
        lastCalledAt: new Date('2026-05-20T10:00:00.000Z'),
      },
      {
        functionName: 'deposit',
        callCount: 3,
        lastCalledAt: new Date('2026-05-19T09:00:00.000Z'),
      },
    ]);
  });

  it('applies the since filter when provided', async () => {
    const since = new Date('2026-05-01T00:00:00.000Z');
    prismaMock.contract.findUnique.mockResolvedValue({ address: 'C123' });
    prismaMock.transaction.groupBy.mockResolvedValue([]);

    const { getContractFunctionStats } = await import('../src/api/contracts');
    await getContractFunctionStats('C123', since);

    expect(prismaMock.transaction.groupBy).toHaveBeenCalledWith({
      by: ['functionName'],
      where: {
        contractAddress: 'C123',
        functionName: { not: null },
        ledgerCloseTime: { gte: since },
      },
      _count: { functionName: true },
      _max: { ledgerCloseTime: true },
      orderBy: [
        { _count: { functionName: 'desc' } },
        { functionName: 'asc' },
      ],
    });
  });

  it('returns an empty array when the contract exists but has no transactions', async () => {
    prismaMock.contract.findUnique.mockResolvedValue({ address: 'C123' });
    prismaMock.transaction.groupBy.mockResolvedValue([]);

    const { getContractFunctionStats } = await import('../src/api/contracts');
    const result = await getContractFunctionStats('C123');

    expect(result).toEqual([]);
  });

  it('returns null when the contract does not exist', async () => {
    prismaMock.contract.findUnique.mockResolvedValue(null);

    const { getContractFunctionStats } = await import('../src/api/contracts');
    const result = await getContractFunctionStats('C404');

    expect(prismaMock.transaction.groupBy).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});

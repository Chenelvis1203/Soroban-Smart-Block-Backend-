import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decodeEvent } from '../src/indexer/decoder';
import { renderHuman, SEP41_ABI } from '../src/indexer/registry';
import { xdr, ScInt, Address, nativeToScVal } from '@stellar/stellar-sdk';

// Helper: encode a ScVal to base64
function toBase64(val: xdr.ScVal): string {
  return val.toXDR('base64');
}

describe('decodeEvent', () => {
  it('decodes a SEP-41 transfer event', () => {
    const from = 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE';
    const to   = 'GXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE';

    const topics = [
      toBase64(nativeToScVal('transfer', { type: 'symbol' })),
      toBase64(nativeToScVal(from, { type: 'string' })),
      toBase64(nativeToScVal(to,   { type: 'string' })),
    ];
    const data = toBase64(nativeToScVal(1000n, { type: 'i128' }));

    const result = decodeEvent(topics, data);

    expect(result.eventType).toBe('transfer');
    expect(result.decoded.from).toBe(from);
    expect(result.decoded.to).toBe(to);
    expect(result.decoded.amount).toBe('0.0001000');
  });

  it('decodes a SEP-41 mint event', () => {
    const to = 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE';
    const topics = [
      toBase64(nativeToScVal('mint', { type: 'symbol' })),
      toBase64(nativeToScVal(to, { type: 'string' })),
    ];
    const data = toBase64(nativeToScVal(500n, { type: 'i128' }));

    const result = decodeEvent(topics, data);

    expect(result.eventType).toBe('mint');
    expect(result.decoded.to).toBe(to);
    expect(result.decoded.amount).toBe('0.0000500');
  });

  it('falls back gracefully on unknown event type', () => {
    const topics = [toBase64(nativeToScVal('custom_event', { type: 'symbol' }))];
    const data   = toBase64(nativeToScVal('some_data', { type: 'string' }));

    const result = decodeEvent(topics, data);

    expect(result.eventType).toBe('custom');
    expect(result.decoded).toHaveProperty('topics');
  });

  it('handles malformed XDR without throwing', () => {
    const result = decodeEvent(['not-valid-base64!!!'], 'also-bad');
    expect(result.eventType).toBe('unknown');
  });
});

describe('renderHuman', () => {
  it('renders a transfer template', () => {
    const args = { from: 'GABC...', to: 'GXYZ...', amount: 1000n };
    const result = renderHuman('transfer', args as Record<string, unknown>, SEP41_ABI, 'MyToken');
    expect(result).toContain('GABC...');
    expect(result).toContain('GXYZ...');
    expect(result).toContain('MyToken');
  });

  it('falls back when function not in ABI', () => {
    const result = renderHuman('unknown_fn', {}, SEP41_ABI, 'MyContract');
    expect(result).toContain('unknown_fn');
  });
});

import type { AxiosError } from 'axios';
import { SorobanRpc } from '@stellar/stellar-sdk';
import { config } from '../config';

export const rpc = new SorobanRpc.Server(config.stellarRpcUrl, { allowHttp: true });

export interface LedgerEvent {
  contractId: string;
  transactionHash: string;
  ledgerSequence: number;
  ledgerCloseTime: Date;
  topics: string[];
  data: string;
}

const EVENT_PAGE_SIZE = 200;
const MAX_RETRY_ATTEMPTS = 6;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  const axiosError = error as AxiosError | undefined;
  const status = axiosError?.response?.status ?? (error as any)?.status;
  return status === 429 || String((error as any)?.message ?? '').includes('429');
}

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (!isRateLimitError(error) || attempt >= MAX_RETRY_ATTEMPTS) {
        throw error;
      }

      const backoff = Math.min(16000, 500 * 2 ** attempt);
      const jitter = Math.floor(Math.random() * 300);
      attempt += 1;
      console.warn(`RPC rate limit hit, retrying in ${backoff + jitter}ms (attempt ${attempt})`);
      await sleep(backoff + jitter);
    }
  }
}

async function fetchEventsPage(startLedger: number, cursor?: string) {
  return retry(() =>
    rpc.getEvents({
      startLedger,
      filters: [{ type: 'contract' }],
      limit: EVENT_PAGE_SIZE,
      cursor,
    }),
  );
}

/**
 * Fetch Soroban events for a ledger range from the RPC node.
 */
export async function fetchEvents(startLedger: number, endLedger: number): Promise<LedgerEvent[]> {
  const events: LedgerEvent[] = [];
  let cursor: string | undefined;

  while (true) {
    const response = await fetchEventsPage(startLedger, cursor);
    const page = (response.events ?? []) as any[];

    if (!page.length) {
      break;
    }

    const mapped = page
      .filter((e) => typeof e.ledger === 'number' && e.ledger >= startLedger && e.ledger <= endLedger)
      .map((e) => ({
        contractId: String(e.contractId ?? ''),
        transactionHash: String(e.txHash ?? ''),
        ledgerSequence: Number(e.ledger),
        ledgerCloseTime: new Date(e.ledgerClosedAt ?? Date.now()),
        topics: Array.isArray(e.topic) ? e.topic.map((t: any) => t.toXDR('base64')) : [],
        data: e.value?.toXDR ? e.value.toXDR('base64') : String(e.value ?? ''),
      }));

    events.push(...mapped);

    if (page.length < EVENT_PAGE_SIZE) {
      break;
    }

    cursor = String((response as any).paging_token ?? (response as any).next_cursor ?? '');
    if (!cursor) {
      break;
    }
  }

  return events;
}

/**
 * Fetch the latest ledger number from the RPC node.
 */
export async function getLatestLedger(): Promise<number> {
  const info = await retry(() => rpc.getLatestLedger());
  return Number(info.sequence);
}

/**
 * Fetch a transaction by hash.
 */
export async function getTransaction(hash: string) {
  return retry(() => rpc.getTransaction(hash));
}

export function getRpcWebsocketUrl(): string {
  return config.stellarRpcWsUrl;
}

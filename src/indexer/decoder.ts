import { xdr, scValToNative, Address } from '@stellar/stellar-sdk';
import { getContractAbi, decodeArgs, renderHuman } from './registry';
import { prisma } from '../db';

export interface DecodedTransaction {
  contractAddress: string | null;
  functionName: string | null;
  functionArgs: Record<string, unknown> | null;
  humanReadable: string | null;
}

/**
 * Decode a raw transaction XDR into human-readable form.
 */
export async function decodeTransaction(rawXdr: string): Promise<DecodedTransaction> {
  let envelope: xdr.TransactionEnvelope;
  try {
    envelope = xdr.TransactionEnvelope.fromXDR(rawXdr, 'base64');
  } catch {
    return { contractAddress: null, functionName: null, functionArgs: null, humanReadable: null };
  }

  // Determine which arm is active and extract operations
  let ops: xdr.Operation[];
  try {
    const switchName = envelope.switch().name;
    if (switchName === 'envelopeTypeTx') {
      ops = envelope.v1().tx().operations();
    } else if (switchName === 'envelopeTypeTxV0') {
      ops = envelope.v0().tx().operations();
    } else {
      return { contractAddress: null, functionName: null, functionArgs: null, humanReadable: null };
    }
  } catch {
    return { contractAddress: null, functionName: null, functionArgs: null, humanReadable: null };
  }

  const invokeOp = ops.find(
    (op) => op.body().switch().name === 'invokeHostFunction'
  );

  if (!invokeOp) {
    return { contractAddress: null, functionName: null, functionArgs: null, humanReadable: null };
  }

  const hostFn = invokeOp.body().invokeHostFunctionOp().hostFunction();
  if (hostFn.switch().name !== 'hostFunctionTypeInvokeContract') {
    return { contractAddress: null, functionName: null, functionArgs: null, humanReadable: null };
  }

  const invokeArgs = hostFn.invokeContract();
  const contractAddress = Address.fromScAddress(invokeArgs.contractAddress()).toString();
  const functionName = invokeArgs.functionName().toString();
  const rawArgs = invokeArgs.args();

  const abi = await getContractAbi(contractAddress);
  if (!abi) {
    return { contractAddress, functionName, functionArgs: null, humanReadable: `Called ${functionName} on ${contractAddress}` };
  }

  const contract = await prisma.contract.findUnique({ where: { address: contractAddress } });
  const decoded = decodeArgs(functionName, rawArgs, abi);
  const human = decoded
    ? renderHuman(functionName, decoded, abi, contract?.name, contract?.tokenDecimals ?? undefined)
    : `Called ${functionName} on ${contract?.name ?? contractAddress}`;

  return { contractAddress, functionName, functionArgs: decoded, humanReadable: human };
}

/**
 * Decode a Soroban event topic/data into a human-readable event.
 */
export function decodeEvent(
  topics: string[],
  data: string,
  contractName?: string | null
): { eventType: string; decoded: Record<string, unknown> } {
  try {
    const topicVals = topics.map((t) => xdr.ScVal.fromXDR(t, 'base64'));
    const dataVal = xdr.ScVal.fromXDR(data, 'base64');

    // First topic is usually the event name symbol
    const eventType = topicVals[0]
      ? String(scValToNative(topicVals[0]))
      : 'unknown';

    const decoded: Record<string, unknown> = { event: eventType };

    // SEP-41 transfer event: topics = [Symbol("transfer"), from, to], data = amount
    if (eventType === 'transfer' && topicVals.length >= 3) {
      decoded.from = String(scValToNative(topicVals[1]));
      decoded.to = String(scValToNative(topicVals[2]));
      decoded.amount = String(scValToNative(dataVal));
    } else if (eventType === 'mint' && topicVals.length >= 2) {
      decoded.to = String(scValToNative(topicVals[1]));
      decoded.amount = String(scValToNative(dataVal));
    } else if (eventType === 'burn' && topicVals.length >= 2) {
      decoded.from = String(scValToNative(topicVals[1]));
      decoded.amount = String(scValToNative(dataVal));
    } else {
      // Generic: decode all topics and data
      decoded.topics = topicVals.map((t) => scValToNative(t));
      decoded.data = scValToNative(dataVal);
    }

    return { eventType: normalizeEventType(eventType), decoded };
  } catch {
    return { eventType: 'unknown', decoded: { raw: { topics, data } } };
  }
}

function normalizeEventType(raw: string): string {
  const known = [
    'transfer',
    'mint',
    'burn',
    'swap',
    'approve',
    'add_liquidity',
    'remove_liquidity',
    'session_authorization',
    'authorize_session',
    'hot_signer_authorized',
    'ephemeral_key_auth',
    'authorization_window',
  ];
  const normalized = raw.toLowerCase();
  return known.includes(normalized) ? normalized : normalized || 'custom';
}

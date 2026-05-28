/**
 * #59 SorobanAuthorizedInvocation Tree Flattener
 *
 * Recursively parses nested SorobanAuthorizedInvocation structures inside
 * transaction auth entries and converts them into a flat, ordered list of
 * who authorized which contract function sub-calls — ready for UI display.
 */

import { xdr, StrKey } from '@stellar/stellar-sdk';
import { scValToJson } from './xdr-parser';

export interface FlatAuthNode {
  /** Depth in the original tree (0 = root invocation) */
  depth: number;
  /** Address that signed this authorization entry */
  signerAddress: string;
  /** "account" | "contract" | "source" */
  signerType: string;
  /** Contract being called */
  contractId: string;
  /** Function being called */
  functionName: string;
  /** Decoded arguments */
  args: Array<{ index: number; type: string; value: unknown }>;
  /** Human-readable summary */
  summary: string;
}

function scAddressToString(addr: xdr.ScAddress): string {
  return addr.switch().name === 'scAddressTypeAccount'
    ? StrKey.encodeEd25519PublicKey(addr.accountId().ed25519())
    : StrKey.encodeContract(addr.contractId());
}

/**
 * Recursively walk a SorobanAuthorizedInvocation tree and push flat nodes.
 */
function walkInvocation(
  invocation: xdr.SorobanAuthorizedInvocation,
  signerAddress: string,
  signerType: string,
  depth: number,
  out: FlatAuthNode[]
): void {
  const fn = invocation.function();
  if (fn.switch().name !== 'sorobanAuthorizedFunctionTypeContractFn') return;

  const contractFn = fn.contractFn();
  const contractId = StrKey.encodeContract(contractFn.contractAddress().contractId());
  const functionName = contractFn.functionName().toString();
  const args = contractFn.args().map((a: xdr.ScVal, i: number) => ({ index: i, ...scValToJson(a) }));

  const summary =
    `${signerAddress.slice(0, 8)}… authorized ${functionName}(` +
    args.map((a) => String(a.value)).join(', ') +
    `) on ${contractId.slice(0, 8)}…`;

  out.push({ depth, signerAddress, signerType, contractId, functionName, args, summary });

  for (const sub of invocation.subInvocations()) {
    walkInvocation(sub, signerAddress, signerType, depth + 1, out);
  }
}

/**
 * Flatten all auth entries from a transaction envelope into an ordered list.
 * Returns an empty array if the tx has no InvokeHostFunction op or no auth.
 */
export function flattenAuthTree(envelopeXdr: string): FlatAuthNode[] {
  let envelope: xdr.TransactionEnvelope;
  try {
    envelope = xdr.TransactionEnvelope.fromXDR(envelopeXdr, 'base64');
  } catch {
    return [];
  }

  const ops: xdr.Operation[] =
    envelope.switch().name === 'envelopeTypeTx'
      ? envelope.v1().tx().operations()
      : envelope.switch().name === 'envelopeTypeTxV0'
      ? envelope.v0().tx().operations()
      : [];

  const invokeOp = ops.find((op) => op.body().switch().name === 'invokeHostFunction');
  if (!invokeOp) return [];

  const authEntries: xdr.SorobanAuthorizationEntry[] =
    invokeOp.body().invokeHostFunctionOp().auth();

  const result: FlatAuthNode[] = [];

  for (const entry of authEntries) {
    const creds = entry.credentials();
    let signerAddress = 'source';
    let signerType = 'source';

    if (creds.switch().name === 'sorobanCredentialsAddress') {
      const addr = creds.address().address();
      signerAddress = scAddressToString(addr);
      signerType = addr.switch().name === 'scAddressTypeContract' ? 'contract' : 'account';
    }

    walkInvocation(entry.rootInvocation(), signerAddress, signerType, 0, result);
  }

  return result;
}

/**
 * Flatten auth entries from already-parsed xdr.SorobanAuthorizationEntry[].
 * Useful when the envelope has already been decoded upstream.
 */
export function flattenAuthEntries(entries: xdr.SorobanAuthorizationEntry[]): FlatAuthNode[] {
  const result: FlatAuthNode[] = [];

  for (const entry of entries) {
    const creds = entry.credentials();
    let signerAddress = 'source';
    let signerType = 'source';

    if (creds.switch().name === 'sorobanCredentialsAddress') {
      const addr = creds.address().address();
      signerAddress = scAddressToString(addr);
      signerType = addr.switch().name === 'scAddressTypeContract' ? 'contract' : 'account';
    }

    walkInvocation(entry.rootInvocation(), signerAddress, signerType, 0, result);
  }

  return result;
}

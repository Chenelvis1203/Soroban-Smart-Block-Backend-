# Checked Arithmetic Integration Guide

## Quick Start

### 1. Update Args Decoder

The args-decoder has been updated to support 256-bit integers. No additional configuration needed.

**New Capabilities:**
- `i256` and `u256` type support
- Automatic 256-bit extraction from XDR
- Seamless integration with existing pipeline

### 2. Register API Routes

Update `src/api/router.ts` to include the new endpoints:

```typescript
import checkedArithmeticRouter from './checked-arithmetic';

// In your Express app setup:
app.use('/api/v1/checked-arithmetic', checkedArithmeticRouter);
```

### 3. Integrate Analysis Hook

Update `src/indexer/decoder.ts` to call the analysis hook:

```typescript
import { analyzeTransactionForCheckedArithmetic } from './checked-arithmetic-integration';

// In your transaction processing:
async function decodeTransaction(rawXdr: string): Promise<DecodedTransaction> {
  // ... existing decoding logic ...
  
  // After extracting function call details:
  if (contractAddress && functionName) {
    const checkedResult = await analyzeTransactionForCheckedArithmetic({
      transactionHash: tx.hash,
      contractAddress,
      functionName,
      rawArgs,
      resultVal: extractResultValue(tx), // Your existing result extraction
      ledgerSequence: ledger.sequence,
      ledgerCloseTime: ledger.closeTime,
    });

    // Enrich function args with checked arithmetic data
    if (checkedResult.isCheckedArithmetic && checkedResult.enrichedFunctionArgs) {
      functionArgs = {
        ...functionArgs,
        ...checkedResult.enrichedFunctionArgs,
      };
    }
  }
  
  return result;
}
```

### 4. Store Analysis Results

Update `src/indexer/ledgerProcessor.ts` to store analysis:

```typescript
import { storeCheckedArithmeticAnalysis } from './checked-arithmetic-integration';

// During transaction processing:
if (isCheckedArithmeticFunction(functionName)) {
  const analysis = analyzeCheckedArithmetic(functionName, rawArgs, resultVal);
  if (analysis.isCheckedOperation) {
    await storeCheckedArithmeticAnalysis({
      transactionHash: tx.hash,
      contractAddress,
      functionName,
      rawArgs,
      resultVal,
      ledgerSequence,
      ledgerCloseTime,
    }, analysis);
  }
}
```

## Integration Points

### 1. Transaction Decoder

**File**: `src/indexer/decoder.ts`

Add checked arithmetic analysis after function decoding:

```typescript
import { analyzeTransactionForCheckedArithmetic } from './checked-arithmetic-integration';

export async function decodeTransaction(rawXdr: string): Promise<DecodedTransaction> {
  const parsed = parseInvokeHostFunction(rawXdr);
  if (!parsed) return { /* ... */ };

  const { contractId: contractAddress, functionName } = parsed;

  // Analyze for checked arithmetic
  const checkedAnalysis = await analyzeTransactionForCheckedArithmetic({
    transactionHash: txHash,
    contractAddress,
    functionName,
    rawArgs: parsed.args,
    resultVal: extractResult(rawXdr),
    ledgerSequence,
    ledgerCloseTime,
  });

  // Enrich output
  if (checkedAnalysis.isCheckedArithmetic) {
    humanReadable = checkedAnalysis.humanReadable || humanReadable;
  }

  return { contractAddress, functionName, functionArgs, humanReadable };
}
```

### 2. Ledger Processor

**File**: `src/indexer/ledgerProcessor.ts`

Add periodic analysis of checked arithmetic patterns:

```typescript
import { analyzeCheckedArithmeticPatterns } from './checked-arithmetic-integration';

export async function processLedger(ledger: Ledger) {
  // ... existing processing ...
  
  // Every 1000 ledgers, analyze patterns
  if (ledger.sequence % 1000 === 0) {
    const patterns = await analyzeCheckedArithmeticPatterns(
      ledger.sequence - 1000,
      ledger.sequence
    );
    
    console.log(`[CheckedArithmetic] Patterns:`, {
      total: patterns.totalCheckedOperations,
      overflows: patterns.overflowCount,
      rate: (patterns.overflowCount / patterns.totalCheckedOperations * 100).toFixed(2) + '%',
    });
  }
}
```

### 3. Event Ingestion

**File**: `src/indexer/eventIngestor.ts`

Optional: Track checked arithmetic events:

```typescript
// If contracts emit events for arithmetic operations
export async function ingestEvent(event: Event) {
  // ... existing event processing ...
  
  // Check for arithmetic-related events
  if (event.eventType === 'arithmetic_overflow') {
    console.warn('[CheckedArithmetic] Overflow event detected:', {
      contract: event.contractAddress,
      ledger: event.ledgerSequence,
    });
  }
}
```

## Testing

### Unit Tests

Create `tests/checked-arithmetic.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  isCheckedArithmeticFunction,
  analyzeCheckedArithmetic,
  validateOperands,
  isValidI256,
  isValidU256,
} from '../src/indexer/checked-arithmetic-decoder';
import { xdr } from '@stellar/stellar-sdk';

describe('Checked Arithmetic Decoder', () => {
  it('should identify checked arithmetic functions', () => {
    expect(isCheckedArithmeticFunction('checked_add_i256')).toBe(true);
    expect(isCheckedArithmeticFunction('checked_mul_u256')).toBe(true);
    expect(isCheckedArithmeticFunction('transfer')).toBe(false);
  });

  it('should validate i256 bounds', () => {
    const max = BigInt(2) ** BigInt(255) - BigInt(1);
    const min = -(BigInt(2) ** BigInt(255));
    
    expect(isValidI256(max)).toBe(true);
    expect(isValidI256(min)).toBe(true);
    expect(isValidI256(max + BigInt(1))).toBe(false);
  });

  it('should validate u256 bounds', () => {
    const max = BigInt(2) ** BigInt(256) - BigInt(1);
    
    expect(isValidU256(BigInt(0))).toBe(true);
    expect(isValidU256(max)).toBe(true);
    expect(isValidU256(max + BigInt(1))).toBe(false);
    expect(isValidU256(BigInt(-1))).toBe(false);
  });

  it('should detect overflow in addition', () => {
    const max = BigInt(2) ** BigInt(255) - BigInt(1);
    const operands = [max, BigInt(1)];
    
    const analysis = analyzeCheckedArithmetic(
      'checked_add_i256',
      [
        xdr.ScVal.scValTypeI256(/* ... */),
        xdr.ScVal.scValTypeI256(/* ... */),
      ],
      xdr.ScVal.scvVoid() // Void = overflow
    );
    
    expect(analysis.operation?.result.status).toBe('overflow');
  });

  it('should handle successful operations', () => {
    const operands = [BigInt(100), BigInt(200)];
    
    const analysis = analyzeCheckedArithmetic(
      'checked_add_i256',
      [/* args */],
      xdr.ScVal.scValTypeI256(/* result: 300 */)
    );
    
    expect(analysis.operation?.result.status).toBe('success');
    expect(analysis.operation?.result.value).toBe(BigInt(300));
  });
});
```

### Integration Tests

Test the full pipeline:

```bash
# Run with test database
DATABASE_URL="postgresql://test:test@localhost/soroban_test" npm run test:integration
```

## Monitoring & Alerting

### Prometheus Metrics

Export metrics for monitoring:

```typescript
import { register, Counter, Gauge } from 'prom-client';

const checkedArithmeticCounter = new Counter({
  name: 'checked_arithmetic_operations_total',
  help: 'Total checked arithmetic operations',
  labelNames: ['operation', 'operand_type', 'result'],
});

const overflowGauge = new Gauge({
  name: 'checked_arithmetic_overflows',
  help: 'Current overflow count',
  labelNames: ['operation'],
});

// Update metrics during analysis
checkedArithmeticCounter.inc({
  operation: 'checked_add',
  operand_type: 'i256',
  result: 'overflow',
});
```

### Alerting Rules

Example Prometheus alert rules:

```yaml
groups:
  - name: checked_arithmetic
    rules:
      - alert: HighOverflowRate
        expr: |
          (rate(checked_arithmetic_overflows[5m]) / 
           rate(checked_arithmetic_operations_total[5m])) > 0.1
        for: 10m
        annotations:
          summary: "High arithmetic overflow rate detected"
      
      - alert: ContractOverflowPattern
        expr: |
          rate(checked_arithmetic_overflows{operation="checked_mul"}[5m]) > 1
        for: 5m
        annotations:
          summary: "Contract experiencing frequent multiplication overflows"
```

## Performance Tuning

### Query Optimization

For large datasets, use pagination:

```typescript
// Instead of fetching all at once
const txs = await prisma.transaction.findMany({
  where: { functionName: { in: ['checked_add_i256', ...] } },
  take: 1000,
  skip: offset,
});
```

### Index Maintenance

Periodically rebuild indexes:

```sql
-- Optimize queries on checked arithmetic functions
CREATE INDEX IF NOT EXISTS idx_tx_checked_arithmetic 
ON "Transaction"(functionName) 
WHERE functionName LIKE 'checked_%';

-- Optimize overflow queries
CREATE INDEX IF NOT EXISTS idx_tx_overflow 
ON "Transaction"(contractAddress, ledgerSequence DESC) 
WHERE functionArgs->>'_checkedArithmetic.overflowDetected' = 'true';
```

### Archive Old Data

Archive analysis older than 1 year:

```sql
DELETE FROM "Transaction"
WHERE functionName LIKE 'checked_%'
  AND "createdAt" < NOW() - INTERVAL '1 year'
  AND functionArgs->>'_checkedArithmetic.result.status' = 'success';
```

## Troubleshooting

### Issue: Checked Arithmetic Not Detected

**Diagnosis**:
1. Check that hook is being called
2. Verify function names match exactly
3. Check database connection

**Solution**:
```typescript
// Add debug logging
console.log(`[CheckedArithmetic] Processing: ${functionName}`);
console.log(`[CheckedArithmetic] Is checked: ${isCheckedArithmeticFunction(functionName)}`);
```

### Issue: Incorrect Overflow Detection

**Diagnosis**:
1. Verify result is Void (scvVoid)
2. Check operand extraction
3. Validate bounds

**Solution**:
```typescript
// Debug: Check result type
console.log(`[CheckedArithmetic] Result type: ${resultVal.switch().name}`);
console.log(`[CheckedArithmetic] Is void: ${resultVal.switch().name === 'scvVoid'}`);
```

### Issue: 256-bit Integer Parsing Fails

**Diagnosis**:
1. Check XDR structure
2. Verify part extraction
3. Validate bit shifting

**Solution**:
```typescript
// Debug: Check parts
const parts = val.i256();
console.log(`[CheckedArithmetic] Parts:`, {
  hiHi: parts.hiHi().toString(),
  hiLo: parts.hiLo().toString(),
  loHi: parts.loHi().toString(),
  loLo: parts.loLo().toString(),
});
```

## Next Steps

1. **Deploy** - Integrate hooks and register routes
2. **Monitor** - Watch for overflow patterns
3. **Analyze** - Review overflow reports regularly
4. **Optimize** - Adjust parameters based on findings
5. **Iterate** - Refine analysis as network evolves

## Support

For issues or questions:
1. Check the [Checked Arithmetic Analysis Documentation](./CHECKED_ARITHMETIC_ANALYSIS.md)
2. Review test cases in `tests/`
3. Check application logs for debug output
4. Open an issue with detailed reproduction steps

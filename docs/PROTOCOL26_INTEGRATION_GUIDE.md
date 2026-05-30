# Protocol 26 State Extension Integration Guide

## Quick Start

### 1. Database Migration

Apply the migration to add state extension tracking tables:

```bash
# Using Prisma
npx prisma migrate deploy

# Or manually run the SQL migration
psql -U postgres -d soroban_db -f prisma/migrations/add_protocol26_state_extension_tracking.sql
```

### 2. Update Prisma Schema

Add the new models to `prisma/schema.prisma`:

```prisma
model StateExtensionAnalysis {
  id                        String   @id @default(cuid())
  transactionHash           String   @unique
  contractAddress           String
  ledgerSequence            Int
  ledgerCloseTime           DateTime
  
  extend_to                 String?
  min_extension             String?
  max_extension             String?
  
  extensionRangeMin         String
  extensionRangeMax         String
  extensionRangeSpread      String
  extensionRangeSpreadPercent Float
  
  networkMaxExtension       String
  contractMaxExtension      String
  clampingRatio             Float
  isClamped                 Boolean
  clampingTightness         String
  
  rentTopUpAmount           String
  topUpPerLedger            Float
  fairnessScore             Int
  complianceStatus          String
  
  previousExtensionLedger   Int?
  extensionFrequency        String
  averageExtensionSize      String?
  
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt
  
  violations                StateExtensionViolation[]
  
  @@index([transactionHash])
  @@index([contractAddress])
  @@index([ledgerSequence])
  @@index([complianceStatus])
  @@index([clampingTightness])
}

model StateExtensionViolation {
  id                String   @id @default(cuid())
  analysisId        String
  contractAddress   String
  transactionHash   String
  ledgerSequence    Int
  violationType     String
  severity          String
  description       String
  recommendedAction String?
  reviewed          Boolean  @default(false)
  reviewedBy        String?
  reviewedAt        DateTime?
  notes             String?
  
  createdAt         DateTime @default(now())
  
  analysis          StateExtensionAnalysis @relation(fields: [analysisId], references: [id])
  
  @@index([contractAddress])
  @@index([violationType])
  @@index([severity])
}

model ContractStateExtensionProfile {
  id                      String   @id @default(cuid())
  contractAddress         String   @unique
  totalExtensionCalls     Int      @default(0)
  averageFairnessScore    Float    @default(0)
  averageClampingRatio    Float    @default(0)
  violationCount          Int      @default(0)
  extremeClampingCount    Int      @default(0)
  lastAnalyzedLedger      Int?
  riskLevel               String   @default("low")
  complianceStatus        String   @default("compliant")
  
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  
  @@index([contractAddress])
  @@index([riskLevel])
  @@index([complianceStatus])
}

model StateExtensionMetricsSnapshot {
  id                      String   @id @default(cuid())
  ledgerSequence          Int
  ledgerCloseTime         DateTime
  totalExtensionCalls     Int
  contractsUsingExtension Int
  averageClampingRatio    Float
  tightClampingCount      Int
  violationCount          Int
  excellentEquityCount    Int
  goodEquityCount         Int
  fairEquityCount         Int
  poorEquityCount         Int
  criticalEquityCount     Int
  
  createdAt               DateTime @default(now())
  
  @@index([ledgerSequence])
  @@index([ledgerCloseTime])
}
```

### 3. Integrate Hook into Indexer

Update `src/indexer/indexer.ts` to call the analysis hook:

```typescript
import { onTransactionDecoded } from './protocol26-state-extension-hook';
import { xdr } from '@stellar/stellar-sdk';

// In your transaction processing loop:
async function processTransaction(tx: Transaction, ledger: Ledger) {
  // ... existing processing ...
  
  // Extract function call details
  const contractAddress = tx.contractAddress;
  const functionName = tx.functionName;
  const rawArgs = extractRawArgs(tx); // Your existing extraction logic
  
  // Call Protocol 26 analysis hook
  if (contractAddress && functionName) {
    await onTransactionDecoded({
      contractAddress,
      transactionHash: tx.hash,
      functionName,
      rawArgs,
      ledgerSequence: ledger.sequence,
      ledgerCloseTime: ledger.closeTime,
    });
  }
  
  // ... rest of processing ...
}
```

### 4. Register API Routes

Update `src/api/router.ts` to include the new endpoints:

```typescript
import protocol26Router from './protocol26-state-extension';

// In your Express app setup:
app.use('/api/v1/protocol26', protocol26Router);
```

### 5. Configuration

Create or update `.env` with Protocol 26 settings:

```env
# Protocol 26 State Extension Analysis
PROTOCOL26_ANALYSIS_ENABLED=true
PROTOCOL26_API_ENABLED=true
PROTOCOL26_MONITORING_ENABLED=true
PROTOCOL26_MAX_EXTENSION_LEDGERS=315360000
PROTOCOL26_FAIR_EXTENSION_THRESHOLD=52560000
```

### 6. Start Monitoring

Add monitoring to your application startup:

```typescript
import { monitorStateExtensionPatterns } from './indexer/protocol26-state-extension-hook';
import { PROTOCOL_26_CONFIG } from './config/protocol26.config';

// In your app initialization:
if (PROTOCOL_26_CONFIG.MONITORING.ENABLED) {
  setInterval(async () => {
    const status = await monitorStateExtensionPatterns();
    if (status.violationCount > 0 || status.extremeClampingCount > 0) {
      console.warn('[Protocol26] Monitoring Alert:', status);
      // Send alert to monitoring system
    }
  }, PROTOCOL_26_CONFIG.MONITORING.INTERVAL_MS);
}
```

## Integration Points

### 1. Transaction Decoder

**File**: `src/indexer/decoder.ts`

Add analysis call after decoding:

```typescript
import { onTransactionDecoded } from './protocol26-state-extension-hook';

export async function decodeTransaction(rawXdr: string): Promise<DecodedTransaction> {
  // ... existing decoding logic ...
  
  // After successful decode:
  if (contractAddress && functionName) {
    await onTransactionDecoded({
      contractAddress,
      transactionHash: txHash,
      functionName,
      rawArgs,
      ledgerSequence,
      ledgerCloseTime,
    });
  }
  
  return result;
}
```

### 2. Ledger Processor

**File**: `src/indexer/ledgerProcessor.ts`

Add periodic metric snapshots:

```typescript
import { generateStateExtensionMetrics } from './protocol26-state-extension-analyzer';

export async function processLedger(ledger: Ledger) {
  // ... existing processing ...
  
  // Every 100 ledgers, generate metrics snapshot
  if (ledger.sequence % 100 === 0) {
    const metrics = await generateStateExtensionMetrics(
      ledger.sequence - 100,
      ledger.sequence
    );
    
    await prisma.stateExtensionMetricsSnapshot.create({
      data: {
        ledgerSequence: ledger.sequence,
        ledgerCloseTime: ledger.closeTime,
        totalExtensionCalls: metrics.totalExtensionCalls,
        contractsUsingExtension: metrics.contractsUsingExtension,
        averageClampingRatio: metrics.averageClampingRatio,
        tightClampingCount: metrics.tightClampingCount,
        violationCount: metrics.violationCount,
        excellentEquityCount: metrics.equityScoreDistribution.excellent,
        goodEquityCount: metrics.equityScoreDistribution.good,
        fairEquityCount: metrics.equityScoreDistribution.fair,
        poorEquityCount: metrics.equityScoreDistribution.poor,
        criticalEquityCount: metrics.equityScoreDistribution.critical,
      },
    });
  }
}
```

### 3. Event Ingestion

**File**: `src/indexer/eventIngestor.ts`

Add event-based analysis (optional):

```typescript
import { onEventIngested } from './protocol26-state-extension-hook';

export async function ingestEvent(event: Event) {
  // ... existing event processing ...
  
  // Check for state extension-related events
  await onEventIngested(
    event.contractAddress,
    event.eventType,
    event.topics,
    event.data
  );
}
```

## Testing

### Unit Tests

Create `tests/protocol26-state-extension.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  extractStateExtensionParams,
  analyzeStateExtension,
} from '../src/indexer/protocol26-state-extension-analyzer';
import { xdr } from '@stellar/stellar-sdk';

describe('Protocol 26 State Extension Analysis', () => {
  it('should extract extend_to parameters', () => {
    const args = [xdr.ScVal.scValTypeI64(xdr.Int64.fromString('50100000'))];
    const params = extractStateExtensionParams('extend_to', args);
    
    expect(params).toBeDefined();
    expect(params?.extend_to).toBe(BigInt(50100000));
  });

  it('should classify clamping tightness correctly', async () => {
    const analysis = await analyzeStateExtension(
      'CAAAA...',
      'abc123...',
      'max_extension',
      [xdr.ScVal.scValTypeI64(xdr.Int64.fromString('78840000'))],
      50000000,
      new Date()
    );
    
    expect(analysis?.clampingAnalysis.clampingTightness).toBe('moderate');
  });

  it('should calculate fairness scores', async () => {
    const analysis = await analyzeStateExtension(
      'CAAAA...',
      'abc123...',
      'extend_to',
      [xdr.ScVal.scValTypeI64(xdr.Int64.fromString('50100000'))],
      50000000,
      new Date()
    );
    
    expect(analysis?.equityMetrics.fairnessScore).toBeGreaterThan(0);
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

const stateExtensionCounter = new Counter({
  name: 'protocol26_state_extensions_total',
  help: 'Total state extension calls',
  labelNames: ['contract', 'function'],
});

const complianceViolations = new Gauge({
  name: 'protocol26_compliance_violations',
  help: 'Current compliance violations',
  labelNames: ['severity'],
});

// Update metrics during analysis
stateExtensionCounter.inc({ contract: contractAddress, function: functionName });
```

### Alerting Rules

Example Prometheus alert rules:

```yaml
groups:
  - name: protocol26
    rules:
      - alert: HighComplianceViolations
        expr: protocol26_compliance_violations{severity="critical"} > 5
        for: 10m
        annotations:
          summary: "High number of critical compliance violations"
      
      - alert: ExtremeClampingDetected
        expr: protocol26_extreme_clamping_count > 10
        for: 5m
        annotations:
          summary: "Multiple contracts with extreme clamping detected"
```

## Troubleshooting

### Issue: No analysis data appearing

**Diagnosis**:
1. Check that hook is being called: `console.log` in `onTransactionDecoded`
2. Verify function names match exactly
3. Check database connection

**Solution**:
```typescript
// Add debug logging
console.log(`[Protocol26] Processing: ${functionName} on ${contractAddress}`);
```

### Issue: Incorrect fairness scores

**Diagnosis**:
1. Verify `extend_to` extraction
2. Check ledger sequence accuracy
3. Validate threshold configuration

**Solution**:
```typescript
// Log extracted parameters
console.log(`[Protocol26] Params:`, params);
console.log(`[Protocol26] Ledger:`, ledgerSequence);
```

### Issue: Database migration fails

**Diagnosis**:
1. Check PostgreSQL version (requires 12+)
2. Verify user permissions
3. Check for existing tables

**Solution**:
```bash
# Check existing tables
psql -U postgres -d soroban_db -c "\dt"

# Drop and recreate if needed
psql -U postgres -d soroban_db -c "DROP TABLE IF EXISTS \"StateExtensionAnalysis\" CASCADE;"
```

## Performance Tuning

### Query Optimization

For large datasets, use pagination:

```typescript
// Instead of fetching all at once
const txs = await prisma.transaction.findMany({
  where: { functionName: { in: ['extend_to', ...] } },
  take: 1000,
  skip: offset,
});
```

### Index Maintenance

Periodically rebuild indexes:

```sql
REINDEX TABLE "StateExtensionAnalysis";
REINDEX TABLE "StateExtensionViolation";
```

### Archive Old Data

Archive analysis older than 1 year:

```sql
DELETE FROM "StateExtensionAnalysis"
WHERE "createdAt" < NOW() - INTERVAL '1 year'
AND "complianceStatus" = 'compliant';
```

## Next Steps

1. **Deploy** - Apply migrations and integrate hooks
2. **Monitor** - Watch for violations and patterns
3. **Analyze** - Review equity reports regularly
4. **Optimize** - Adjust parameters based on findings
5. **Iterate** - Refine thresholds as network evolves

## Support

For issues or questions:
1. Check the [Protocol 26 Analysis Documentation](./PROTOCOL26_STATE_EXTENSION_ANALYSIS.md)
2. Review test cases in `tests/`
3. Check application logs for debug output
4. Open an issue with detailed reproduction steps

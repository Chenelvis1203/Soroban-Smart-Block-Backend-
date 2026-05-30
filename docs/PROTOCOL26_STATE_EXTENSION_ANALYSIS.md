# Protocol 26 State Extension Analytical Engine

## Overview

The Protocol 26 State Extension Analytical Engine is a comprehensive system for parsing, analyzing, and monitoring the updated state extension functions introduced in Protocol 26:

- **`extend_to(ledger_seq: u32)`** - Sets the exact ledger sequence to extend state to
- **`min_extension(ledgers: u32)`** - Specifies the minimum ledger extension allowed
- **`max_extension(ledgers: u32)`** - Specifies the maximum ledger extension allowed

This engine provides developers with clear insights into how equitably their rent top-ups are being enforced and how tightly they clamp their state extension limits against maximum network parameters.

## Architecture

### Core Components

#### 1. **State Extension Analyzer** (`protocol26-state-extension-analyzer.ts`)

The main analytical engine that performs comprehensive analysis on state extension transactions.

**Key Functions:**

- `extractStateExtensionParams()` - Extracts raw parameters from XDR
- `analyzeStateExtension()` - Performs full analysis pipeline
- `storeStateExtensionAnalysis()` - Persists results to database
- `generateStateExtensionMetrics()` - Aggregates metrics across contracts
- `identifyProblematicContracts()` - Flags contracts with concerning patterns

**Analysis Dimensions:**

1. **Extension Range Analysis**
   - Calculates min-to-max spread
   - Computes spread percentage
   - Identifies flexibility in extension parameters

2. **Clamping Analysis**
   - Compares contract max against network max
   - Calculates clamping ratio
   - Classifies tightness: loose → moderate → tight → extreme

3. **Equity Metrics**
   - Calculates rent top-up amounts
   - Computes fairness scores (0-100)
   - Determines compliance status
   - Tracks historical patterns

4. **Historical Context**
   - Identifies previous extension ledgers
   - Determines extension frequency
   - Calculates average extension sizes

#### 2. **API Endpoints** (`protocol26-state-extension.ts`)

REST API for querying and analyzing state extension data.

**Endpoints:**

```
GET /api/v1/protocol26/state-extensions
  - List state extension transactions with filtering
  - Query params: contractAddress, ledgerMin, ledgerMax, complianceStatus, clampingTightness

GET /api/v1/protocol26/state-extensions/:txHash
  - Get detailed analysis for a specific transaction

GET /api/v1/protocol26/contracts/:contractAddress/state-extensions
  - Get all state extensions for a contract

GET /api/v1/protocol26/metrics
  - Get aggregate metrics for a ledger range
  - Query params: ledgerMin, ledgerMax (required)

GET /api/v1/protocol26/problematic-contracts
  - Identify contracts with concerning patterns
  - Query params: threshold ('tight' | 'extreme')

GET /api/v1/protocol26/equity-report
  - Generate detailed equity report
  - Query params: ledgerMin, ledgerMax (optional)
```

#### 3. **Integration Hook** (`protocol26-state-extension-hook.ts`)

Integrates analysis into the main indexing pipeline.

**Key Functions:**

- `onTransactionDecoded()` - Analyzes transactions during indexing
- `analyzeHistoricalStateExtensions()` - Backfills analysis for existing data
- `monitorStateExtensionPatterns()` - Real-time monitoring

#### 4. **Database Schema**

New tables for storing analysis results:

- `StateExtensionAnalysis` - Detailed analysis per transaction
- `StateExtensionViolation` - Compliance violations log
- `ContractStateExtensionProfile` - Aggregated metrics per contract
- `StateExtensionMetricsSnapshot` - Periodic metric snapshots

## Analysis Metrics

### Extension Range Metrics

```typescript
{
  min: bigint;           // Minimum extension in ledgers
  max: bigint;           // Maximum extension in ledgers
  spread: bigint;        // max - min
  spreadPercent: number; // (spread / max) * 100
}
```

### Clamping Analysis

```typescript
{
  networkMaxExtension: bigint;    // Protocol 26 network max (~10 years)
  contractMaxExtension: bigint;   // Contract's configured max
  clampingRatio: number;          // contractMax / networkMax (0-1)
  isClamped: boolean;             // contractMax < networkMax
  clampingTightness: string;      // 'loose' | 'moderate' | 'tight' | 'extreme'
}
```

**Clamping Tightness Classification:**

- **Loose** (ratio > 0.75): Contract allows near-maximum extensions
- **Moderate** (ratio 0.25-0.75): Contract moderately restricts extensions
- **Tight** (ratio 0.25-0.75): Contract significantly restricts extensions
- **Extreme** (ratio < 0.25): Contract severely restricts extensions

### Equity Metrics

```typescript
{
  rentTopUpAmount: bigint;    // Extension amount in ledgers
  topUpPerLedger: number;     // Normalized top-up ratio
  fairnessScore: number;      // 0-100 scale
  complianceStatus: string;   // 'compliant' | 'warning' | 'violation'
}
```

**Fairness Score Calculation:**

- **100** (Excellent): Extends ≥ 1.67 years
- **75** (Good): Extends ≥ 0.83 years
- **50** (Fair): Extends ≥ 0.42 years
- **25** (Poor): Extends > 0 but < 0.42 years
- **0** (Critical): No extension

**Compliance Status:**

- **Compliant**: Fairness ≥ 75 AND max ≥ 0.83 years
- **Warning**: Fairness ≥ 50 OR max ≥ 0.42 years
- **Violation**: Fairness < 50 AND max < 0.42 years

## Usage Examples

### 1. Query State Extensions for a Contract

```bash
curl "http://localhost:3000/api/v1/protocol26/contracts/CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4/state-extensions"
```

Response:
```json
{
  "contractAddress": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  "data": [
    {
      "transactionHash": "abc123...",
      "functionName": "extend_to",
      "ledgerSequence": 50000000,
      "ledgerCloseTime": "2026-05-29T10:30:00Z",
      "analysis": {
        "params": {
          "extend_to": "50100000"
        },
        "extensionRange": {
          "min": "0",
          "max": "315360000",
          "spread": "315360000",
          "spreadPercent": 100
        },
        "clampingAnalysis": {
          "networkMaxExtension": "315360000",
          "contractMaxExtension": "315360000",
          "clampingRatio": 1,
          "isClamped": false,
          "clampingTightness": "loose"
        },
        "equityMetrics": {
          "rentTopUpAmount": "100000",
          "topUpPerLedger": 0.317,
          "fairnessScore": 100,
          "complianceStatus": "compliant"
        }
      }
    }
  ]
}
```

### 2. Get Aggregate Metrics

```bash
curl "http://localhost:3000/api/v1/protocol26/metrics?ledgerMin=50000000&ledgerMax=50100000"
```

Response:
```json
{
  "ledgerRange": {
    "start": 50000000,
    "end": 50100000
  },
  "metrics": {
    "totalExtensionCalls": 1250,
    "contractsUsingExtension": 342,
    "averageClampingRatio": 0.68,
    "tightClampingCount": 89,
    "violationCount": 12,
    "equityScoreDistribution": {
      "excellent": 450,
      "good": 380,
      "fair": 250,
      "poor": 120,
      "critical": 50
    }
  }
}
```

### 3. Identify Problematic Contracts

```bash
curl "http://localhost:3000/api/v1/protocol26/problematic-contracts?threshold=extreme"
```

Response:
```json
{
  "threshold": "extreme",
  "count": 5,
  "contracts": [
    {
      "contractAddress": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
      "violationCount": 8,
      "averageFairnessScore": 15,
      "clampingTightness": "extreme"
    }
  ]
}
```

### 4. Generate Equity Report

```bash
curl "http://localhost:3000/api/v1/protocol26/equity-report?ledgerMin=50000000&ledgerMax=50100000"
```

Response:
```json
{
  "ledgerRange": {
    "start": 50000000,
    "end": 50100000
  },
  "contractCount": 342,
  "contracts": {
    "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4": {
      "extensionCount": 12,
      "averageFairnessScore": 85,
      "complianceViolations": 0,
      "clampingTightness": "moderate"
    }
  }
}
```

## Integration with Indexer

### Automatic Analysis During Indexing

The hook is automatically called during transaction decoding:

```typescript
import { onTransactionDecoded } from './protocol26-state-extension-hook';

// During transaction processing
await onTransactionDecoded({
  contractAddress: 'CAAAA...',
  transactionHash: 'abc123...',
  functionName: 'extend_to',
  rawArgs: [xdr.ScVal],
  ledgerSequence: 50000000,
  ledgerCloseTime: new Date(),
});
```

### Backfilling Historical Data

```typescript
import { analyzeHistoricalStateExtensions } from './protocol26-state-extension-hook';

const result = await analyzeHistoricalStateExtensions(49000000, 50000000);
console.log(`Processed: ${result.processed}, Analyzed: ${result.analyzed}, Errors: ${result.errors}`);
```

### Real-time Monitoring

```typescript
import { monitorStateExtensionPatterns } from './protocol26-state-extension-hook';

const status = await monitorStateExtensionPatterns();
console.log(`Violations: ${status.violationCount}, Extreme Clamping: ${status.extremeClampingCount}`);
```

## Network Parameters

Protocol 26 defines the following state extension parameters:

```typescript
const PROTOCOL_26_PARAMS = {
  MAX_EXTENSION_LEDGERS: BigInt(315360000),  // ~10 years
  MIN_EXTENSION_LEDGERS: BigInt(1),
  FAIR_EXTENSION_THRESHOLD: BigInt(52560000), // ~1.67 years
  EQUITY_CHECK_INTERVAL: 100,                 // Check every 100 ledgers
};
```

These can be adjusted in `protocol26-state-extension-analyzer.ts` if network parameters change.

## Compliance Monitoring

### Violation Types

1. **Extreme Clamping** - Contract max < 25% of network max
2. **Unfair Top-up** - Fairness score < 50
3. **Threshold Breach** - Multiple violations in short period

### Severity Levels

- **Critical** - Immediate action required
- **High** - Should be addressed soon
- **Medium** - Monitor and plan remediation
- **Low** - Informational

### Recommended Actions

The system provides specific recommendations for each violation type:

- **Extreme Clamping**: "Increase max_extension to allow more flexible rent top-ups"
- **Unfair Top-up**: "Increase extend_to amount to provide more equitable rent coverage"
- **Threshold Breach**: "Review extension strategy and align with network fairness standards"

## Performance Considerations

### Database Indexes

The schema includes optimized indexes for:

- Transaction hash lookups
- Contract address filtering
- Ledger sequence range queries
- Compliance status filtering
- Clamping tightness classification

### Query Optimization

- Composite indexes for common filter combinations
- Ledger sequence DESC for time-series queries
- Contract address + ledger sequence for contract-specific analysis

### Batch Processing

For large ledger ranges:

1. Use pagination with `limit` and `offset`
2. Query in smaller ledger ranges (e.g., 100k ledgers at a time)
3. Use `StateExtensionMetricsSnapshot` for pre-computed aggregates

## Troubleshooting

### No Analysis Data

**Issue**: Transactions show no `_analysis` field

**Solution**: 
1. Ensure hook is integrated in indexer
2. Check that function names match exactly: 'extend_to', 'min_extension', 'max_extension'
3. Verify XDR parsing is working correctly

### Incorrect Fairness Scores

**Issue**: Fairness scores seem too high or low

**Solution**:
1. Verify `FAIR_EXTENSION_THRESHOLD` is set correctly
2. Check that `extend_to` values are being extracted properly
3. Ensure ledger sequence is accurate

### Missing Contracts

**Issue**: Expected contracts not appearing in problematic list

**Solution**:
1. Verify threshold setting ('tight' vs 'extreme')
2. Check ledger range includes the contract's transactions
3. Ensure analysis has been run for those ledgers

## Future Enhancements

1. **Machine Learning** - Predict extension patterns and anomalies
2. **Alerting** - Real-time alerts for compliance violations
3. **Recommendations** - AI-powered suggestions for optimal parameters
4. **Visualization** - Dashboard for equity metrics and trends
5. **Benchmarking** - Compare contract patterns against peers
6. **Simulation** - Model impact of parameter changes

## References

- [Protocol 26 Specification](https://stellar.org/protocol-26)
- [Soroban State Extension RFC](https://github.com/stellar/stellar-protocol)
- [Rent and State Extension Guide](https://developers.stellar.org/docs/learn/soroban/state-extension)

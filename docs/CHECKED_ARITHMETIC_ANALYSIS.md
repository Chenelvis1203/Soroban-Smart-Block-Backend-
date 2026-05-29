# Checked Arithmetic Analysis Engine

## Overview

The Checked Arithmetic Analysis Engine is a comprehensive system for parsing, analyzing, and monitoring Protocol 26's native checked variants of 256-bit mathematical host functions:

- **`checked_add_i256 / checked_add_u256`** - Safe addition with overflow detection
- **`checked_sub_i256 / checked_sub_u256`** - Safe subtraction with overflow detection
- **`checked_mul_i256 / checked_mul_u256`** - Safe multiplication with overflow detection
- **`checked_pow_i256 / checked_pow_u256`** - Safe exponentiation with overflow detection

Instead of letting the host trap and crash the transaction unconditionally, these functions return a structural `Void` when an overflow boundary is detected. This engine decodes that case and transforms it visually into a safe text notice: **"Operation checked for arithmetic overflow safely."**

## Architecture

### Core Components

#### 1. **Checked Arithmetic Decoder** (`checked-arithmetic-decoder.ts`)

The main analytical engine for parsing and analyzing checked arithmetic operations.

**Key Functions:**

- `isCheckedArithmeticFunction()` - Identifies checked arithmetic functions
- `analyzeCheckedArithmetic()` - Performs full analysis pipeline
- `extract256BitInteger()` - Extracts 256-bit values from XDR
- `isVoidResult()` - Detects overflow (Void result)
- `didOverflow()` - Checks if operation overflowed
- `getOverflowedOperations()` - Filters overflowed operations
- `validateOperands()` - Validates operand bounds
- `generateDiagnosticReport()` - Creates detailed diagnostic data

**Analysis Dimensions:**

1. **Operation Detection**
   - Identifies checked arithmetic function names
   - Parses operation type (add/sub/mul/pow)
   - Determines operand type (i256/u256)

2. **Operand Extraction**
   - Reconstructs 256-bit integers from XDR
   - Handles both signed and unsigned types
   - Validates operand bounds

3. **Result Analysis**
   - Detects Void results (overflow)
   - Extracts computed values (success)
   - Classifies operation outcome

4. **Human-Readable Formatting**
   - Generates descriptive operation summaries
   - Creates safe overflow notices
   - Provides diagnostic information

#### 2. **Integration Module** (`checked-arithmetic-integration.ts`)

Integrates checked arithmetic analysis into the transaction processing pipeline.

**Key Functions:**

- `analyzeTransactionForCheckedArithmetic()` - Analyzes transactions during decoding
- `storeCheckedArithmeticAnalysis()` - Persists analysis results
- `analyzeCheckedArithmeticPatterns()` - Identifies network patterns
- `identifyOverflowSafeContracts()` - Finds contracts handling overflows
- `generateCheckedArithmeticReport()` - Creates comprehensive reports

#### 3. **API Endpoints** (`checked-arithmetic.ts`)

REST API for querying and analyzing checked arithmetic data.

**Endpoints:**

```
GET /api/v1/checked-arithmetic/operations
  - List checked arithmetic operations with filtering
  - Query params: contractAddress, operationType, operandType, overflowOnly, ledgerMin, ledgerMax

GET /api/v1/checked-arithmetic/operations/:txHash
  - Get detailed analysis for a specific transaction

GET /api/v1/checked-arithmetic/contracts/:contractAddress/operations
  - Get all checked arithmetic operations for a contract

GET /api/v1/checked-arithmetic/patterns
  - Analyze patterns across the network
  - Query params: ledgerMin, ledgerMax (required)

GET /api/v1/checked-arithmetic/overflow-safe-contracts
  - Identify contracts that handle overflows safely
  - Query params: minOverflowCount

GET /api/v1/checked-arithmetic/report
  - Generate comprehensive report
  - Query params: ledgerMin, ledgerMax (required)
```

#### 4. **Args Decoder Integration** (`args-decoder.ts`)

Enhanced integer parsing layer with 256-bit support.

**New Capabilities:**

- `decode256BitInteger()` - Extracts 256-bit values from XDR
- Support for `i256` and `u256` types
- Seamless integration with existing decoding pipeline

## Analysis Metrics

### Checked Arithmetic Operation

```typescript
{
  type: 'checked_add' | 'checked_sub' | 'checked_mul' | 'checked_pow';
  operandType: 'i256' | 'u256';
  operands: bigint[];
  result: CheckedArithmeticResult;
}
```

### Result Status

```typescript
type CheckedArithmeticResult =
  | { status: 'success'; value: bigint }
  | { status: 'overflow'; value: null };
```

### Overflow Detection

- **Void Result** → Overflow detected
- **Computed Value** → Operation succeeded
- **Invalid Result** → Parsing error

## Usage Examples

### 1. Query Checked Arithmetic Operations

```bash
curl "http://localhost:3000/api/v1/checked-arithmetic/operations?overflowOnly=true"
```

Response:
```json
{
  "data": [
    {
      "transactionHash": "abc123...",
      "contractAddress": "CAAAA...",
      "functionName": "checked_add_i256",
      "ledgerSequence": 50000000,
      "ledgerCloseTime": "2026-05-29T10:30:00Z",
      "operation": "checked_add",
      "operandType": "i256",
      "operands": ["9223372036854775807", "1"],
      "result": {
        "status": "overflow",
        "value": null
      },
      "overflowDetected": true,
      "humanReadable": "Checked add (signed 256-bit): Operation checked for arithmetic overflow safely. Operands: [9223372036854775807, 1]"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

### 2. Get Overflow-Safe Contracts

```bash
curl "http://localhost:3000/api/v1/checked-arithmetic/overflow-safe-contracts?minOverflowCount=1"
```

Response:
```json
{
  "minOverflowCount": 1,
  "count": 3,
  "contracts": [
    {
      "contractAddress": "CAAAA...",
      "totalCheckedOperations": 150,
      "overflowCount": 12,
      "successCount": 138,
      "overflowRate": 0.08
    }
  ]
}
```

### 3. Analyze Network Patterns

```bash
curl "http://localhost:3000/api/v1/checked-arithmetic/patterns?ledgerMin=50000000&ledgerMax=50100000"
```

Response:
```json
{
  "ledgerRange": {
    "start": 50000000,
    "end": 50100000
  },
  "patterns": {
    "totalCheckedOperations": 2500,
    "overflowCount": 45,
    "successCount": 2455,
    "overflowRate": 1.8,
    "contractsUsing": 87,
    "operationTypes": {
      "checked_add_i256": 800,
      "checked_add_u256": 600,
      "checked_mul_i256": 700,
      "checked_mul_u256": 400
    }
  }
}
```

### 4. Generate Comprehensive Report

```bash
curl "http://localhost:3000/api/v1/checked-arithmetic/report?ledgerMin=50000000&ledgerMax=50100000"
```

Response:
```json
{
  "ledgerRange": {
    "start": 50000000,
    "end": 50100000
  },
  "summary": {
    "totalCheckedOperations": 2500,
    "overflowCount": 45,
    "successCount": 2455,
    "overflowRate": 1.8
  },
  "operationTypes": {
    "checked_add_i256": 800,
    "checked_add_u256": 600,
    "checked_mul_i256": 700,
    "checked_mul_u256": 400
  },
  "contractsUsingCheckedArithmetic": 87,
  "overflowSafeContracts": [
    {
      "contractAddress": "CAAAA...",
      "totalCheckedOperations": 150,
      "overflowCount": 12,
      "successCount": 138,
      "overflowRate": 0.08
    }
  ]
}
```

## Integration with Transaction Decoder

### Automatic Analysis During Indexing

The checked arithmetic analysis is automatically called during transaction decoding:

```typescript
import { analyzeTransactionForCheckedArithmetic } from './checked-arithmetic-integration';

// During transaction processing
const result = await analyzeTransactionForCheckedArithmetic({
  transactionHash: 'abc123...',
  contractAddress: 'CAAAA...',
  functionName: 'checked_add_i256',
  rawArgs: [xdr.ScVal, xdr.ScVal],
  resultVal: xdr.ScVal,
  ledgerSequence: 50000000,
  ledgerCloseTime: new Date(),
});

// Result includes enriched function args and human-readable description
console.log(result.humanReadable);
// "Checked add (signed 256-bit): Operation checked for arithmetic overflow safely. Operands: [...]"
```

### Enriched Function Arguments

Checked arithmetic operations are enriched with overflow information:

```json
{
  "_checkedArithmetic": {
    "operation": "checked_add",
    "operandType": "i256",
    "operands": ["9223372036854775807", "1"],
    "result": {
      "status": "overflow",
      "value": null
    },
    "overflowDetected": true,
    "humanReadable": "Operation checked for arithmetic overflow safely."
  }
}
```

## 256-bit Integer Handling

### Reconstruction from XDR

256-bit integers are stored as four 64-bit parts in XDR:

```
i256/u256 = (hiHi << 192) | (hiLo << 128) | (loHi << 64) | loLo
```

### Bounds Validation

- **i256 Range**: -(2^255) to (2^255 - 1)
- **u256 Range**: 0 to (2^256 - 1)

### Safe Arithmetic

The engine validates operands before analysis:

```typescript
const isValid = validateOperands(operands, 'i256');
// Ensures all operands are within i256 bounds
```

## Overflow Detection Patterns

### Pattern 1: Addition Overflow

```
checked_add_i256(9223372036854775807, 1)
→ Void (overflow detected)
→ "Operation checked for arithmetic overflow safely."
```

### Pattern 2: Multiplication Overflow

```
checked_mul_u256(2^255, 2)
→ Void (overflow detected)
→ "Operation checked for arithmetic overflow safely."
```

### Pattern 3: Successful Operation

```
checked_add_i256(100, 200)
→ 300 (success)
→ "Result: 300"
```

## Monitoring & Alerting

### Overflow Patterns

Monitor contracts that frequently encounter overflows:

```typescript
const safeContracts = await identifyOverflowSafeContracts(minOverflowCount);
// Identifies contracts handling overflows gracefully
```

### Network Statistics

Track overflow rates across the network:

```typescript
const patterns = await analyzeCheckedArithmeticPatterns(ledgerStart, ledgerEnd);
console.log(`Overflow rate: ${patterns.overflowCount / patterns.totalCheckedOperations * 100}%`);
```

## Performance Considerations

### Database Indexes

Optimized queries for:
- Function name lookups
- Contract address filtering
- Ledger sequence range queries
- Overflow status filtering

### Batch Processing

For large ledger ranges:

1. Use pagination with `limit` and `offset`
2. Query in smaller ranges (e.g., 100k ledgers at a time)
3. Use pre-computed metrics for historical analysis

## Troubleshooting

### Issue: No Overflow Detected

**Diagnosis**:
1. Verify function name matches exactly
2. Check that result is Void (scvVoid)
3. Ensure XDR parsing is working

**Solution**:
```typescript
// Debug: Check raw result
console.log(resultVal.switch().name); // Should be 'scvVoid' for overflow
```

### Issue: Incorrect Operand Extraction

**Diagnosis**:
1. Verify operands are 256-bit integers
2. Check XDR structure
3. Validate bounds

**Solution**:
```typescript
// Debug: Validate operands
const isValid = validateOperands(operands, operandType);
console.log(`Operands valid: ${isValid}`);
```

### Issue: Missing Checked Arithmetic Data

**Diagnosis**:
1. Ensure integration hook is active
2. Check function names are recognized
3. Verify database connection

**Solution**:
```typescript
// Debug: Check function recognition
const isChecked = isCheckedArithmeticFunction(functionName);
console.log(`Is checked arithmetic: ${isChecked}`);
```

## Future Enhancements

1. **Machine Learning** - Predict overflow patterns
2. **Alerting** - Real-time alerts for overflow events
3. **Recommendations** - Suggest safer arithmetic patterns
4. **Visualization** - Dashboard for overflow trends
5. **Benchmarking** - Compare contract arithmetic safety
6. **Simulation** - Model impact of different operands

## References

- [Protocol 26 Specification](https://stellar.org/protocol-26)
- [Soroban Host Functions](https://developers.stellar.org/docs/learn/soroban/host-functions)
- [256-bit Integer Arithmetic](https://developers.stellar.org/docs/learn/soroban/types)
- [Overflow Handling Guide](https://developers.stellar.org/docs/learn/soroban/arithmetic-safety)

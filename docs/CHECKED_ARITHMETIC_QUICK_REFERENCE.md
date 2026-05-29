# Checked Arithmetic - Quick Reference

## Supported Functions

| Function | Type | Description |
|----------|------|-------------|
| `checked_add_i256` | Signed | Safe addition with overflow detection |
| `checked_add_u256` | Unsigned | Safe addition with overflow detection |
| `checked_sub_i256` | Signed | Safe subtraction with overflow detection |
| `checked_sub_u256` | Unsigned | Safe subtraction with overflow detection |
| `checked_mul_i256` | Signed | Safe multiplication with overflow detection |
| `checked_mul_u256` | Unsigned | Safe multiplication with overflow detection |
| `checked_pow_i256` | Signed | Safe exponentiation with overflow detection |
| `checked_pow_u256` | Unsigned | Safe exponentiation with overflow detection |

## Overflow Detection

### What Triggers Overflow?

```
Result = Void (scvVoid) → Overflow detected
Result = Value (i256/u256) → Operation succeeded
```

### Example: Addition Overflow

```
checked_add_i256(9223372036854775807, 1)
↓
Result: Void
↓
"Operation checked for arithmetic overflow safely."
```

## API Quick Reference

### List Overflow Operations

```bash
curl "http://localhost:3000/api/v1/checked-arithmetic/operations?overflowOnly=true"
```

### Get Specific Transaction

```bash
curl "http://localhost:3000/api/v1/checked-arithmetic/operations/abc123..."
```

### Get Contract Operations

```bash
curl "http://localhost:3000/api/v1/checked-arithmetic/contracts/CAAAA.../operations"
```

### Analyze Network Patterns

```bash
curl "http://localhost:3000/api/v1/checked-arithmetic/patterns?ledgerMin=50000000&ledgerMax=50100000"
```

### Find Overflow-Safe Contracts

```bash
curl "http://localhost:3000/api/v1/checked-arithmetic/overflow-safe-contracts"
```

### Generate Report

```bash
curl "http://localhost:3000/api/v1/checked-arithmetic/report?ledgerMin=50000000&ledgerMax=50100000"
```

## Code Integration

### Detect Checked Arithmetic

```typescript
import { isCheckedArithmeticFunction } from './checked-arithmetic-decoder';

if (isCheckedArithmeticFunction(functionName)) {
  // This is a checked arithmetic operation
}
```

### Analyze Operation

```typescript
import { analyzeCheckedArithmetic } from './checked-arithmetic-decoder';

const analysis = analyzeCheckedArithmetic(
  functionName,
  rawArgs,
  resultVal
);

if (analysis.isCheckedOperation) {
  console.log(analysis.humanReadable);
  // "Operation checked for arithmetic overflow safely."
}
```

### Check for Overflow

```typescript
import { didOverflow } from './checked-arithmetic-decoder';

if (didOverflow(analysis)) {
  console.log('Overflow detected!');
}
```

### Validate Operands

```typescript
import { validateOperands } from './checked-arithmetic-decoder';

const isValid = validateOperands(operands, 'i256');
```

## 256-bit Integer Bounds

### i256 (Signed)
- **Min**: -(2^255) = -57896044618658097711785492504343953926634992332820282019728792003956564819968
- **Max**: (2^255 - 1) = 57896044618658097711785492504343953926634992332820282019728792003956564819967

### u256 (Unsigned)
- **Min**: 0
- **Max**: (2^256 - 1) = 115792089237316195423570985008687907853269984665640564039457584007913129639935

## Response Format

### Overflow Response

```json
{
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
```

### Success Response

```json
{
  "operation": "checked_add",
  "operandType": "i256",
  "operands": ["100", "200"],
  "result": {
    "status": "success",
    "value": "300"
  },
  "overflowDetected": false,
  "humanReadable": "Checked add (signed 256-bit): 300. Operands: [100, 200]"
}
```

## Common Patterns

### Pattern 1: Safe Addition

```
checked_add_i256(100, 200) → 300 ✓
```

### Pattern 2: Overflow on Addition

```
checked_add_i256(max_i256, 1) → Void ⚠️
```

### Pattern 3: Safe Multiplication

```
checked_mul_u256(1000, 2000) → 2000000 ✓
```

### Pattern 4: Overflow on Multiplication

```
checked_mul_u256(2^255, 2) → Void ⚠️
```

## Monitoring

### Key Metrics

- **Total Operations**: Count of all checked arithmetic calls
- **Overflow Count**: Number of operations that overflowed
- **Overflow Rate**: (Overflows / Total) × 100%
- **Contracts Using**: Number of unique contracts
- **Operation Types**: Distribution by operation type

### Alert Thresholds

- **High Overflow Rate**: > 10% in 5 minutes
- **Frequent Overflows**: > 1 per minute for multiplication
- **Unusual Patterns**: Deviation from baseline

## Troubleshooting

### No Overflow Detected

**Check:**
1. Function name matches exactly
2. Result is Void (scvVoid)
3. XDR parsing is working

### Incorrect Operands

**Check:**
1. Operands are 256-bit integers
2. XDR structure is valid
3. Bounds are correct

### Missing Data

**Check:**
1. Integration hook is active
2. Database connection is working
3. Function names are recognized

## Performance Tips

1. **Use Pagination**: Limit results to 50-100 per request
2. **Filter Early**: Use query parameters to reduce data
3. **Batch Analysis**: Process large ranges in chunks
4. **Cache Results**: Store frequently accessed data

## Files Reference

| File | Purpose |
|------|---------|
| `src/indexer/checked-arithmetic-decoder.ts` | Core analysis engine |
| `src/indexer/checked-arithmetic-integration.ts` | Pipeline integration |
| `src/api/checked-arithmetic.ts` | REST endpoints |
| `src/indexer/args-decoder.ts` | 256-bit integer support |
| `docs/CHECKED_ARITHMETIC_ANALYSIS.md` | Full documentation |
| `docs/CHECKED_ARITHMETIC_INTEGRATION_GUIDE.md` | Integration guide |

## Key Functions

### Detection
- `isCheckedArithmeticFunction(name)` - Check if function is checked arithmetic
- `parseCheckedFunctionName(name)` - Extract operation and type

### Analysis
- `analyzeCheckedArithmetic(name, args, result)` - Full analysis
- `extract256BitInteger(val)` - Extract 256-bit value from XDR
- `isVoidResult(val)` - Check if result is Void (overflow)

### Utilities
- `didOverflow(analysis)` - Check if operation overflowed
- `validateOperands(operands, type)` - Validate operand bounds
- `isValidI256(value)` - Check i256 bounds
- `isValidU256(value)` - Check u256 bounds

### Reporting
- `analyzeCheckedArithmeticPatterns(start, end)` - Network patterns
- `identifyOverflowSafeContracts(min)` - Find safe contracts
- `generateCheckedArithmeticReport(start, end)` - Full report

## Examples

### Example 1: Detect Overflow

```typescript
const analysis = analyzeCheckedArithmetic(
  'checked_add_i256',
  [operand1, operand2],
  voidResult
);

if (analysis.operation?.result.status === 'overflow') {
  console.log('Overflow detected!');
}
```

### Example 2: Get Safe Contracts

```typescript
const safeContracts = await identifyOverflowSafeContracts(minOverflowCount);
safeContracts.forEach(contract => {
  console.log(`${contract.contractAddress}: ${contract.overflowRate * 100}% overflow rate`);
});
```

### Example 3: Analyze Patterns

```typescript
const patterns = await analyzeCheckedArithmeticPatterns(50000000, 50100000);
console.log(`Total operations: ${patterns.totalCheckedOperations}`);
console.log(`Overflow rate: ${(patterns.overflowCount / patterns.totalCheckedOperations * 100).toFixed(2)}%`);
```

## Related Documentation

- [Full Analysis Documentation](./CHECKED_ARITHMETIC_ANALYSIS.md)
- [Integration Guide](./CHECKED_ARITHMETIC_INTEGRATION_GUIDE.md)
- [Implementation Summary](./CHECKED_ARITHMETIC_SUMMARY.md)
- [Protocol 26 Specification](https://stellar.org/protocol-26)

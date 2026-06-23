import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Soroban Smart Block Explorer API',
      version: '1.0.0',
      description: 'Human-readable Soroban contract explorer. Decodes raw XDR into plain English.',
    },
    // TODO(#251): `servers` base is already /api/v1, but route @swagger paths
    // also include /api/v1 (matching alerts.ts), so rendered URLs are duplicated.
    // Kept consistent for now — raise with maintainers before changing either side.
    servers: [{ url: '/api/v1', description: 'API v1' }],
    tags: [
      { name: 'Transactions', description: 'Soroban transaction queries and decoding' },
      { name: 'Events', description: 'Contract event queries' },
      { name: 'Contracts', description: 'Smart contract metadata and ABI management' },
      { name: 'Wallets', description: 'Wallet/account transaction history' },
      { name: 'Tokens', description: 'Token balances, info, and transfers' },
      { name: 'Render', description: 'Human-readable transaction rendering' },
      { name: 'Simulate', description: 'Transaction simulation' },
      { name: 'Verify', description: 'Contract source code verification' },
      { name: 'Authorizations', description: 'Session authorization tracking' },
      { name: 'Sync State', description: 'Indexer synchronization status' },
      { name: 'Network', description: 'Network protocol status' },
      { name: 'Token Metadata', description: 'Token metadata resolution' },
      { name: 'Protocol', description: 'Protocol version and reconciliation' },
      { name: 'i18n', description: 'Internationalization translation management' },
      { name: 'Threat Intelligence', description: 'Advisories, review workflow, subscriptions, webhooks, RSS/JSON feeds, analytics, and source management' },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description:
            'Optional API key. Tiers: public (100 req/min), developer (300 req/min), premium (1000 req/min).',
        },
      },
      schemas: {
        StorageEfficiencyLog: {
          type: 'object',
          properties: {
            transactionHash: { type: 'string' },
            contractAddress: { type: 'string', nullable: true },
            ledgerSequence: { type: 'integer' },
            readOnlyKeys: {
              type: 'integer',
              description: 'Number of declared read-only footprint keys',
            },
            readWriteKeys: {
              type: 'integer',
              description: 'Number of declared read-write footprint keys',
            },
            footprintBytes: {
              type: 'integer',
              description: 'Total declared byte budget (rent-paying storage)',
            },
            actualReadBytes: { type: 'integer', description: 'Actual bytes read during execution' },
            actualWriteBytes: {
              type: 'integer',
              description: 'Actual bytes written during execution',
            },
            unusedBytes: {
              type: 'integer',
              description: 'Unutilised storage bytes (footprintBytes - actualTotal)',
            },
            efficiencyPct: { type: 'number', description: 'Storage efficiency percentage (0–100)' },
          },
        },
        WebhookSubscription: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            url: { type: 'string', format: 'uri' },
            contractAddress: { type: 'string', nullable: true },
            eventType: { type: 'string', nullable: true },
            topicSymbol: { type: 'string', nullable: true },
            active: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        // Shared error envelope returned by route handlers, e.g. { error: "..." }.
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Human-readable error message',
              // Neutral fallback; each error response overrides this with a
              // response-level example reflecting that endpoint's real message.
              example: 'Bad request',
            },
          },
        },
        // Core entity: a decoded Soroban contract event (full record).
        Event: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example:
                '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566-AAAADwAAAAh0cmFuc2Zlcg==',
            },
            transactionHash: {
              type: 'string',
              example: '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566',
            },
            contractAddress: {
              type: 'string',
              example: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
            },
            eventType: {
              type: 'string',
              description: 'transfer | swap | mint | burn | custom',
              example: 'transfer',
            },
            topicSymbol: {
              type: 'string',
              nullable: true,
              description: 'First topic decoded as a symbol (e.g. "transfer", "mint_pass")',
              example: 'transfer',
            },
            topics: {
              type: 'array',
              items: { type: 'string' },
              description: 'Raw event topics (base64-encoded XDR)',
              example: ['AAAADwAAAAh0cmFuc2Zlcg==', 'AAAAEgAAAAAAAAAAjbb31xRk1h0='],
            },
            data: {
              type: 'object',
              description: 'Raw event data, wrapped as { raw: <base64-encoded XDR> }',
              properties: { raw: { type: 'string', example: 'AAAACgAAAAAAAAAAAAAAADuaygA=' } },
              example: { raw: 'AAAACgAAAAAAAAAAAAAAADuaygA=' },
            },
            decoded: {
              type: 'object',
              nullable: true,
              description: 'Human-readable decoded event payload',
              example: {
                from: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
                to: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
                amount: '1000000000',
              },
            },
            ledgerSequence: { type: 'integer', example: 3168075 },
            ledgerCloseTime: {
              type: 'string',
              format: 'date-time',
              example: '2026-06-19T07:24:26.000Z',
            },
            compacted: {
              type: 'boolean',
              description: 'True once the event is rolled into a SettlementBatchSummary (#220)',
              example: false,
            },
            createdAt: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:27.000Z' },
          },
        },
        // Core entity: an indexed Soroban transaction, as projected by the API
        // handler's `select` (TX_SELECT). Field types follow the Transaction model
        // in prisma/schema.prisma; columns the handler omits (id, rawXdr,
        // flashLoanAlert, reentrantAlert, createdAt) are intentionally excluded so
        // that $ref-ing this schema from both routes stays accurate.
        Transaction: {
          type: 'object',
          properties: {
            hash: {
              type: 'string',
              example: '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566',
            },
            ledgerSequence: { type: 'integer', example: 3168075 },
            ledgerCloseTime: {
              type: 'string',
              format: 'date-time',
              example: '2026-06-19T07:24:26.000Z',
            },
            sourceAccount: {
              type: 'string',
              example: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
            },
            contractAddress: {
              type: 'string',
              nullable: true,
              example: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
            },
            functionName: { type: 'string', nullable: true, example: 'swap' },
            functionArgs: {
              type: 'object',
              nullable: true,
              description: 'Decoded function arguments (key/value map)',
              example: { amount: '1000000000', token_in: 'USDC', token_out: 'XLM' },
            },
            status: { type: 'string', description: 'success | failed', example: 'success' },
            humanReadable: {
              type: 'string',
              nullable: true,
              description: 'Plain-English summary, e.g. "Address X swapped 100 USDC → 98.7 XLM"',
              example: 'GBZX...swapped 100 USDC for 98.7 XLM on StellarSwap',
            },
            feeCharged: {
              type: 'string',
              nullable: true,
              description: 'Fee charged, in stroops',
              example: '100',
            },
            sorobanResources: {
              type: 'object',
              nullable: true,
              description: '#48: CPU, memory, and ledger footprint metrics',
              example: {
                cpuInstructions: 24500000,
                memoryBytes: 1048576,
                readBytes: 4096,
                writeBytes: 512,
              },
            },
            failureReason: {
              type: 'string',
              nullable: true,
              description: '#49: human-readable failure explanation',
              example: null,
            },
            freezeViolation: {
              type: 'boolean',
              description: 'CAP-0077: transaction touches a consensus-frozen ledger key',
              example: false,
            },
          },
        },
        // Core entity: a registered/indexed Soroban contract (full record).
        // Field types follow the Contract model in prisma/schema.prisma.
        Contract: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2abcd1234' },
            address: {
              type: 'string',
              example: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
            },
            name: { type: 'string', nullable: true, example: 'USD Coin' },
            description: {
              type: 'string',
              nullable: true,
              example: 'USDC stablecoin token contract',
            },
            abi: {
              type: 'object',
              nullable: true,
              description: 'ABI-like metadata: functions, events, types',
              example: {
                functions: [
                  {
                    name: 'transfer',
                    inputs: [
                      { name: 'to', type: 'Address' },
                      { name: 'amount', type: 'i128' },
                    ],
                  },
                ],
              },
            },
            functionSignatures: {
              type: 'array',
              nullable: true,
              items: { type: 'object' },
              description: 'Decoded function signatures, e.g. [{ name, inputs, outputs }]',
              example: [{ name: 'transfer', inputs: ['Address', 'i128'], outputs: [] }],
            },
            isToken: { type: 'boolean', example: true },
            tokenSymbol: { type: 'string', nullable: true, example: 'USDC' },
            tokenName: { type: 'string', nullable: true, example: 'USD Coin' },
            tokenDecimals: { type: 'integer', nullable: true, example: 7 },
            wasmHash: {
              type: 'string',
              nullable: true,
              description: 'Fuzzy hash of compiled Wasm bytecode for similarity detection',
              example: 'e5f40312233445566778899aabbccddeeff00112233445566778899aabbccddee',
            },
            isVerified: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:26.000Z' },
            updatedAt: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:26.000Z' },
          },
        },
        // Token summary: the token-specific fields of a Contract, as returned by
        // GET /tokens. Field types follow the Contract model in prisma/schema.prisma.
        Token: {
          type: 'object',
          properties: {
            address: {
              type: 'string',
              example: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
            },
            tokenName: { type: 'string', nullable: true, example: 'USD Coin' },
            tokenSymbol: { type: 'string', nullable: true, example: 'USDC' },
            tokenDecimals: { type: 'integer', nullable: true, example: 7 },
          },
        },
        // Soroban simulation execution trace (TraceResult from trace-engine.ts).
        SimulationTrace: {
          type: 'object',
          properties: {
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  seq: { type: 'integer', example: 0 },
                  depth: { type: 'integer', example: 0 },
                  type: {
                    type: 'string',
                    enum: ['host_function', 'event', 'state_change'],
                    example: 'host_function',
                  },
                  function: { type: 'string', example: 'swap' },
                  args: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', example: 'i128' },
                        value: { example: '1000000000' },
                      },
                    },
                    example: [{ type: 'i128', value: '1000000000' }],
                  },
                  gasUsed: { type: 'integer', example: 24500000 },
                  memUsed: { type: 'integer', example: 1048576 },
                  stateChanges: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        key: {
                          type: 'string',
                          example:
                            'Balance(GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI)',
                        },
                        before: { example: '0' },
                        after: { example: '1000000000' },
                        changeType: {
                          type: 'string',
                          enum: ['write', 'read', 'delete'],
                          example: 'write',
                        },
                      },
                    },
                    example: [
                      {
                        key: 'Balance(GBZX...)',
                        before: '0',
                        after: '1000000000',
                        changeType: 'write',
                      },
                    ],
                  },
                  returnValue: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      type: { type: 'string', example: 'i128' },
                      value: { example: '987000000' },
                    },
                    example: { type: 'i128', value: '987000000' },
                  },
                  error: { type: 'string', nullable: true, example: null },
                },
              },
            },
            totalGas: { type: 'integer', example: 24500000 },
            totalMemory: { type: 'integer', example: 1048576 },
            callGraph: {
              type: 'object',
              properties: {
                nodes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', example: 'node-0' },
                      contract: {
                        type: 'string',
                        example: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
                      },
                      function: { type: 'string', example: 'swap' },
                      gas: { type: 'integer', example: 24500000 },
                      depth: { type: 'integer', example: 0 },
                    },
                  },
                },
                edges: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      from: { type: 'string', example: 'node-0' },
                      to: { type: 'string', example: 'node-1' },
                      type: { type: 'string', enum: ['call', 'return'], example: 'call' },
                    },
                  },
                },
              },
            },
            events: { type: 'array', items: { type: 'object' }, example: [] },
            success: { type: 'boolean', example: true },
            error: { type: 'string', nullable: true, example: null },
          },
        },
        // Simulation failure analysis (RevertAnalysis from revert-analyzer.ts).
        RevertAnalysis: {
          type: 'object',
          properties: {
            errorType: {
              type: 'string',
              enum: [
                'panic',
                'contract_error',
                'resource_limit',
                'auth_error',
                'wasm_error',
                'storage_error',
                'unknown',
              ],
              example: 'contract_error',
            },
            message: { type: 'string', example: 'Contract call failed: insufficient balance' },
            detail: { type: 'string', nullable: true, example: 'Error(Contract, #3)' },
            callStack: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  depth: { type: 'integer', example: 0 },
                  contractId: {
                    type: 'string',
                    example: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
                  },
                  function: { type: 'string', example: 'swap' },
                },
              },
              example: [
                {
                  depth: 0,
                  contractId: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
                  function: 'swap',
                },
              ],
            },
            suggestedFixes: {
              type: 'array',
              items: { type: 'string' },
              example: ['Ensure the account has sufficient balance before calling swap.'],
            },
          },
        },
        // Static descriptor for a supported privacy protocol (PRIVACY_PROTOCOLS_INFO).
        PrivacyProtocolInfo: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'zk-SNARK' },
            description: {
              type: 'string',
              example:
                'Zero-knowledge Succinct Non-Interactive Argument of Knowledge. Groth16 and PLONK proving systems for private transactions.',
            },
            category: {
              type: 'string',
              description: 'transfer | zkp | address | mixer | voting | data | storage | analytics',
              example: 'zkp',
            },
            strength: {
              type: 'integer',
              description: 'Relative privacy strength weight',
              example: 15,
            },
          },
        },
        // A detected privacy-preserving transaction (full PrivacyTransaction record).
        // Field types follow the PrivacyTransaction model in prisma/schema.prisma.
        PrivacyTransaction: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2privtx01' },
            txHash: {
              type: 'string',
              example: '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566',
            },
            protocols: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'SHIELDED_TRANSFER',
                  'ZK_SNARK',
                  'ZK_STARK',
                  'BULLETPROOF',
                  'STEALTH_ADDRESS',
                  'MIXER',
                  'PRIVATE_VOTING',
                  'OFF_CHAIN_DATA',
                  'ENCRYPTED_STATE',
                  'DIFFERENTIAL_PRIVACY',
                ],
              },
              example: ['ZK_SNARK', 'SHIELDED_TRANSFER'],
            },
            guarantees: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'SENDER_PRIVACY',
                  'RECIPIENT_PRIVACY',
                  'AMOUNT_PRIVACY',
                  'ASSET_TYPE_PRIVACY',
                  'VOTE_PRIVACY',
                  'FULL_PRIVACY',
                ],
              },
              example: ['SENDER_PRIVACY', 'AMOUNT_PRIVACY'],
            },
            cryptographicPrimitives: {
              type: 'object',
              nullable: true,
              description: 'Detected primitives (proving system, curve, hash function)',
              example: { provingSystem: 'Groth16', curve: 'BLS12-381' },
            },
            anonymitySetSize: { type: 'integer', nullable: true, example: 128 },
            effectiveAnonymitySet: { type: 'integer', nullable: true, example: 96 },
            privacyScore: {
              type: 'number',
              nullable: true,
              description: 'Privacy score (0-100)',
              example: 87.5,
            },
            riskScore: {
              type: 'number',
              nullable: true,
              description: 'De-anonymization risk score (0-100)',
              example: 12,
            },
            totalValue: {
              type: 'string',
              nullable: true,
              description: 'Raw value in base units',
              example: '1000000000',
            },
            usdValue: { type: 'number', nullable: true, example: 100 },
            assetType: { type: 'string', nullable: true, example: 'USDC' },
            contractAddresses: {
              type: 'array',
              items: { type: 'string' },
              example: ['CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5'],
            },
            participants: {
              type: 'array',
              items: { type: 'string' },
              example: ['GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI'],
            },
            participantCount: { type: 'integer', example: 1 },
            ledgerSequence: { type: 'integer', example: 3168075 },
            timestamp: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:26.000Z' },
          },
        },
        // Per-address privacy compliance report (PrivacyComplianceReport record).
        PrivacyComplianceReport: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2report01' },
            address: {
              type: 'string',
              example: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
            },
            totalPrivateTx: { type: 'integer', example: 12 },
            protocolsUsed: {
              type: 'array',
              items: { type: 'string' },
              description: 'Protocol ids this address has used',
              example: ['ZK_SNARK', 'MIXER'],
            },
            riskScore: { type: 'number', nullable: true, description: '0-100', example: 35 },
            flagged: { type: 'boolean', example: false },
            flagReason: { type: 'string', nullable: true, example: null },
            complianceLabel: { type: 'string', nullable: true, example: null },
            linkedAddresses: {
              type: 'array',
              items: { type: 'string' },
              example: ['GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'],
            },
            lastActivity: {
              type: 'string',
              format: 'date-time',
              example: '2026-06-19T07:24:26.000Z',
            },
            reportGeneratedAt: {
              type: 'string',
              format: 'date-time',
              example: '2026-06-19T07:24:27.000Z',
            },
          },
        },
        // A de-anonymization finding linking a private transaction to an address.
        DeAnonymizationFinding: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2finding1' },
            sourceTx: {
              type: 'string',
              example: '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566',
            },
            targetAddress: {
              type: 'string',
              example: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
            },
            technique: {
              type: 'string',
              description: 'Heuristic used: timing | amount_correlation | taint | common_input',
              example: 'amount_correlation',
            },
            confidence: { type: 'number', description: 'Confidence (0-1)', example: 0.82 },
            evidence: {
              type: 'object',
              description: 'Supporting evidence for the finding',
              example: { privateAmount: '1000000000', publicAmount: '1000000000', timeDelta: 12 },
            },
            linkedAddresses: {
              type: 'array',
              items: { type: 'string' },
              example: ['GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'],
            },
            probability: { type: 'number', nullable: true, example: 0.74 },
            detectedAt: {
              type: 'string',
              format: 'date-time',
              example: '2026-06-19T07:24:26.000Z',
            },
          },
        },
        // A periodic snapshot of privacy adoption metrics (PrivacyAnalytics record).
        PrivacyAnalytics: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2analyt01' },
            timestamp: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:26.000Z' },
            period: {
              type: 'string',
              description: 'Aggregation period: hour | day | week',
              example: 'day',
            },
            totalPrivateTx: { type: 'integer', example: 320 },
            totalTx: { type: 'integer', example: 15430 },
            totalVolume: {
              type: 'string',
              description: 'Raw value in base units',
              example: '4500000000000',
            },
            privacyShare: {
              type: 'number',
              description: 'Private tx / total tx (0-1)',
              example: 0.0207,
            },
            volumeShare: { type: 'number', nullable: true, example: 0.034 },
            byProtocol: {
              type: 'object',
              description: 'Per-protocol transaction counts',
              example: { ZK_SNARK: 120, MIXER: 45, SHIELDED_TRANSFER: 80 },
            },
            avgAnonymitySet: { type: 'number', nullable: true, example: 96.4 },
            maxAnonymitySet: { type: 'integer', nullable: true, example: 256 },
            medianAnonymitySet: { type: 'number', nullable: true, example: 88 },
            avgPrivacyScore: { type: 'number', nullable: true, example: 71.2 },
            avgRiskScore: { type: 'number', nullable: true, example: 18.5 },
            deAnonymizedCount: { type: 'integer', nullable: true, example: 7 },
            uniqueUsers: { type: 'integer', nullable: true, example: 210 },
            uniqueContracts: { type: 'integer', nullable: true, example: 34 },
          },
        },
        // A periodic metrics snapshot for a single privacy protocol.
        PrivacyProtocolDetail: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2detail01' },
            protocol: {
              type: 'string',
              enum: [
                'SHIELDED_TRANSFER',
                'ZK_SNARK',
                'ZK_STARK',
                'BULLETPROOF',
                'STEALTH_ADDRESS',
                'MIXER',
                'PRIVATE_VOTING',
                'OFF_CHAIN_DATA',
                'ENCRYPTED_STATE',
                'DIFFERENTIAL_PRIVACY',
              ],
              example: 'ZK_SNARK',
            },
            timestamp: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:26.000Z' },
            period: { type: 'string', example: 'day' },
            txCount: { type: 'integer', example: 120 },
            volume: { type: 'string', nullable: true, example: '1200000000000' },
            uniqueUsers: { type: 'integer', nullable: true, example: 64 },
            uniqueContracts: { type: 'integer', nullable: true, example: 8 },
            avgAnonymitySet: { type: 'number', nullable: true, example: 112.5 },
            cryptographicPrimitivesUsed: {
              type: 'object',
              nullable: true,
              example: { provingSystem: 'Groth16', curve: 'BLS12-381' },
            },
          },
        },
        // A point-in-time anonymity set size for a protocol (AnonymitySetSnapshot record).
        AnonymitySetSnapshot: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2snap01' },
            protocol: {
              type: 'string',
              enum: [
                'SHIELDED_TRANSFER',
                'ZK_SNARK',
                'ZK_STARK',
                'BULLETPROOF',
                'STEALTH_ADDRESS',
                'MIXER',
                'PRIVATE_VOTING',
                'OFF_CHAIN_DATA',
                'ENCRYPTED_STATE',
                'DIFFERENTIAL_PRIVACY',
              ],
              example: 'MIXER',
            },
            contractAddress: {
              type: 'string',
              nullable: true,
              example: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
            },
            setSize: {
              type: 'integer',
              description: 'Theoretical anonymity set size',
              example: 128,
            },
            effectiveSetSize: {
              type: 'integer',
              nullable: true,
              description: 'Effective set size after de-anonymization heuristics',
              example: 96,
            },
            timestamp: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:26.000Z' },
          },
        },
        // Validation error envelope for routes that parse with zod. The `error`
        // field is the array of Zod issues (res.json({ error: e.errors })).
        ZodValidationError: {
          type: 'object',
          properties: {
            error: {
              type: 'array',
              description: 'Zod validation issues from the failed parse',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'invalid_type' },
                  expected: { type: 'string', example: 'string' },
                  received: { type: 'string', example: 'undefined' },
                  path: { type: 'array', items: { type: 'string' }, example: ['txHash'] },
                  message: { type: 'string', example: 'Required' },
                },
              },
            },
          },
        },
        // A detected MEV event (full MevEvent record).
        // Field types follow the MevEvent model in prisma/schema.prisma.
        MevEvent: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2mevevt01' },
            txHash: {
              type: 'string',
              example: '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566',
            },
            ledgerSeq: { type: 'integer', example: 3168075 },
            timestamp: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:26.000Z' },
            mevType: {
              type: 'string',
              enum: [
                'sandwich',
                'flash_loan_attack',
                'backrunning',
                'displacement',
                'jit_liquidity',
                'cex_dex_arbitrage',
                'cross_dex_arbitrage',
                'liquidation',
                'nft_mev',
              ],
              example: 'sandwich',
            },
            victimAddress: {
              type: 'string',
              nullable: true,
              example: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
            },
            attackerAddress: {
              type: 'string',
              nullable: true,
              example: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
            },
            protocolAddress: {
              type: 'string',
              nullable: true,
              example: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
            },
            tokenIn: { type: 'string', nullable: true, example: 'USDC' },
            tokenOut: { type: 'string', nullable: true, example: 'XLM' },
            amountIn: {
              type: 'string',
              nullable: true,
              description: 'Raw amount in base units',
              example: '1000000000',
            },
            amountOut: { type: 'string', nullable: true, example: '987000000' },
            profitAmount: { type: 'string', nullable: true, example: '15240000' },
            profitUsd: { type: 'number', nullable: true, example: 152.4 },
            lossAmount: { type: 'string', nullable: true, example: '18060000' },
            lossUsd: { type: 'number', nullable: true, example: 180.6 },
            txOrder: {
              type: 'object',
              nullable: true,
              description: 'Bundle ordering (front-run, victim, back-run tx hashes)',
              example: { frontRun: '3389e9f0...', victim: 'a1b2c3d4...', backRun: '9f8e7d6c...' },
            },
            confidence: {
              type: 'number',
              description: 'Detection confidence (0-1)',
              example: 0.95,
            },
            details: {
              type: 'object',
              nullable: true,
              description: 'Detector-specific metadata',
              example: {
                pool: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
                slippage: 0.05,
              },
            },
            createdAt: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:27.000Z' },
          },
        },
        // An address harmed by MEV (full MevVictim record).
        MevVictim: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2victim01' },
            address: {
              type: 'string',
              example: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
            },
            totalLossUsd: { type: 'number', example: 180.6 },
            incidentCount: { type: 'integer', example: 3 },
            lastIncidentAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-06-19T07:24:26.000Z',
            },
            firstIncidentAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-06-01T00:00:00.000Z',
            },
            protectionScore: { type: 'number', nullable: true, example: 50 },
            createdAt: { type: 'string', format: 'date-time', example: '2026-06-01T00:00:00.000Z' },
            updatedAt: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:27.000Z' },
          },
        },
        // An address (or contract) that extracts MEV (full MevAttacker record).
        MevAttacker: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2attack01' },
            address: {
              type: 'string',
              example: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
            },
            totalProfitUsd: { type: 'number', example: 1520.4 },
            attackCount: { type: 'integer', example: 42 },
            favoriteType: {
              type: 'string',
              nullable: true,
              enum: [
                'sandwich',
                'flash_loan_attack',
                'backrunning',
                'displacement',
                'jit_liquidity',
                'cex_dex_arbitrage',
                'cross_dex_arbitrage',
                'liquidation',
                'nft_mev',
              ],
              example: 'sandwich',
            },
            lastAttackAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-06-19T07:24:26.000Z',
            },
            firstSeen: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-06-01T00:00:00.000Z',
            },
            isContract: { type: 'boolean', example: true },
            tags: {
              type: 'array',
              items: { type: 'string' },
              nullable: true,
              example: ['known-bot'],
            },
            createdAt: { type: 'string', format: 'date-time', example: '2026-06-01T00:00:00.000Z' },
            updatedAt: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:27.000Z' },
          },
        },
        // A protocol's MEV-resistance profile (full ProtocolMevResistance record).
        ProtocolMevResistance: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2protmev1' },
            contractAddress: {
              type: 'string',
              example: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
            },
            contractName: { type: 'string', nullable: true, example: 'StellarSwap Router' },
            score: { type: 'number', description: 'MEV-resistance score (0-100)', example: 72.5 },
            commitReveal: { type: 'boolean', example: false },
            batchAuctions: { type: 'boolean', example: true },
            slippageDefault: { type: 'number', nullable: true, example: 0.005 },
            privateMempool: { type: 'boolean', example: false },
            encryptedTxs: { type: 'boolean', example: false },
            mevExtractedUsd: { type: 'number', example: 12500.5 },
            totalIncidents: { type: 'integer', example: 37 },
            lastIncidentAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-06-19T07:24:26.000Z',
            },
            scoreHistory: {
              type: 'array',
              nullable: true,
              items: { type: 'object' },
              description: 'Score samples over time',
              example: [
                { score: 70, timestamp: '2026-06-01T00:00:00.000Z' },
                { score: 72.5, timestamp: '2026-06-19T07:24:26.000Z' },
              ],
            },
            recommendations: {
              type: 'array',
              nullable: true,
              items: { type: 'string' },
              example: ['Enable batch auctions', 'Lower default slippage'],
            },
            createdAt: { type: 'string', format: 'date-time', example: '2026-06-01T00:00:00.000Z' },
            updatedAt: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:27.000Z' },
          },
        },
        // An MEV alert (full MevAlert record).
        MevAlert: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2mevalrt1' },
            alertType: {
              type: 'string',
              enum: [
                'sandwich_in_progress',
                'sandwich_detected',
                'mev_spike',
                'protocol_targeted',
                'user_victim',
              ],
              example: 'sandwich_detected',
            },
            severity: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
              example: 'high',
            },
            txHash: {
              type: 'string',
              nullable: true,
              example: '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566',
            },
            victimAddress: {
              type: 'string',
              nullable: true,
              example: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
            },
            protocolAddress: {
              type: 'string',
              nullable: true,
              example: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
            },
            title: { type: 'string', example: 'Sandwich attack detected' },
            description: {
              type: 'string',
              example: 'Victim swap was front-run and back-run on the same pool',
            },
            estimatedLoss: { type: 'number', nullable: true, example: 180.6 },
            recommendedAction: {
              type: 'string',
              nullable: true,
              example: 'Route transaction through private mempool',
            },
            acknowledged: { type: 'boolean', example: false },
            createdAt: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:26.000Z' },
            resolvedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
          },
        },
        // Aggregate MEV summary (MevOverview from mev-classifier.ts).
        MevOverview: {
          type: 'object',
          properties: {
            totalEvents: { type: 'integer', example: 1543 },
            totalProfitUsd: { type: 'number', example: 84250.75 },
            totalLossUsd: { type: 'number', example: 91200.4 },
            byType: {
              type: 'object',
              description: 'Per-type event counts',
              example: { sandwich: 820, cross_dex_arbitrage: 410, flash_loan_attack: 95 },
            },
            topAttackers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  address: {
                    type: 'string',
                    example: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
                  },
                  totalProfitUsd: { type: 'number', example: 1520.4 },
                  attackCount: { type: 'integer', example: 42 },
                },
              },
            },
            topVictims: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  address: {
                    type: 'string',
                    example: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
                  },
                  totalLossUsd: { type: 'number', example: 180.6 },
                  incidentCount: { type: 'integer', example: 3 },
                },
              },
            },
            recentEvents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', example: 'clz9q1x4t0000s6h2mevevt01' },
                  txHash: {
                    type: 'string',
                    example: '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566',
                  },
                  mevType: { type: 'string', example: 'sandwich' },
                  confidence: { type: 'number', example: 0.95 },
                  createdAt: {
                    type: 'string',
                    format: 'date-time',
                    example: '2026-06-19T07:24:26.000Z',
                  },
                },
              },
            },
          },
        },
        // ── Soroban Temporal Orchestrator (#251) ──────────────────────────────
        // A scheduled/temporal operation detected on a contract (full record).
        // Field types follow the ScheduledOperation model in prisma/schema.prisma.
        ScheduledOperation: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2schedop1' },
            contractAddress: {
              type: 'string',
              example: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
            },
            timerType: {
              type: 'string',
              enum: [
                'TIMELOCK',
                'VESTING',
                'DEADLINE',
                'COOLDOWN',
                'RECURRING',
                'TIME_WEIGHTED',
                'MULTI_STAGE',
                'ABSOLUTE',
              ],
              example: 'VESTING',
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'ACTIVE', 'EXECUTED', 'EXPIRED', 'CANCELLED', 'FAILED'],
              example: 'PENDING',
            },
            functionName: { type: 'string', example: 'release' },
            description: {
              type: 'string',
              nullable: true,
              example: 'Cliff unlock for team allocation',
            },
            triggerTime: {
              type: 'string',
              format: 'date-time',
              example: '2026-06-19T07:24:26.000Z',
            },
            windowStart: { type: 'string', format: 'date-time', nullable: true, example: null },
            windowEnd: { type: 'string', format: 'date-time', nullable: true, example: null },
            intervalSeconds: {
              type: 'integer',
              nullable: true,
              description: 'Recurrence interval in seconds',
              example: 86400,
            },
            recurrenceCount: { type: 'integer', nullable: true, example: 12 },
            eventsExecuted: { type: 'integer', example: 0 },
            parameters: {
              type: 'object',
              nullable: true,
              description: 'Operation-specific parameters',
              example: { amount: '1000000000', token: 'USDC' },
            },
            sourceTx: {
              type: 'string',
              nullable: true,
              example: '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566',
            },
            createdBy: { type: 'string', nullable: true, example: null },
            detectedAt: {
              type: 'string',
              format: 'date-time',
              example: '2026-06-19T07:24:26.000Z',
            },
            lastExecutedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
            nextTriggerAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-06-19T07:24:26.000Z',
            },
          },
        },
        // A token vesting schedule for a beneficiary (full record).
        // Decimal columns (totalAmount, cliffAmount, amountPerPeriod, nextUnlockAmount,
        // totalUnlocked, totalClaimed) serialise to strings over JSON.
        VestingSchedule: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2vesting1' },
            contractAddress: {
              type: 'string',
              example: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
            },
            tokenAddress: {
              type: 'string',
              example: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
            },
            tokenSymbol: { type: 'string', nullable: true, example: 'USDC' },
            beneficiary: {
              type: 'string',
              example: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
            },
            totalAmount: {
              type: 'string',
              description: 'Decimal serialised as a string (raw base units)',
              example: '1000000000',
            },
            cliffDate: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-06-19T07:24:26.000Z',
            },
            cliffAmount: {
              type: 'string',
              nullable: true,
              description: 'Decimal serialised as a string',
              example: '250000000',
            },
            startDate: { type: 'string', format: 'date-time', example: '2026-06-01T00:00:00.000Z' },
            endDate: { type: 'string', format: 'date-time', example: '2027-06-01T00:00:00.000Z' },
            vestingType: {
              type: 'string',
              description: 'e.g. linear | cliff | stepped',
              example: 'linear',
            },
            periodSeconds: { type: 'integer', nullable: true, example: 86400 },
            amountPerPeriod: {
              type: 'string',
              nullable: true,
              description: 'Decimal serialised as a string',
              example: '2739726',
            },
            periodsTotal: { type: 'integer', nullable: true, example: 365 },
            nextUnlockDate: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-06-19T07:24:26.000Z',
            },
            nextUnlockAmount: {
              type: 'string',
              nullable: true,
              description: 'Decimal serialised as a string',
              example: '2739726',
            },
            totalUnlocked: {
              type: 'string',
              description: 'Decimal serialised as a string',
              example: '500000000',
            },
            totalClaimed: {
              type: 'string',
              description: 'Decimal serialised as a string',
              example: '250000000',
            },
            status: {
              type: 'string',
              description: 'e.g. active | completed | cancelled',
              example: 'active',
            },
            sourceTx: {
              type: 'string',
              nullable: true,
              example: '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566',
            },
            detectedAt: {
              type: 'string',
              format: 'date-time',
              example: '2026-06-19T07:24:26.000Z',
            },
          },
        },
        // A queued governance timelock operation (full record).
        GovernanceTimelock: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2govtl001' },
            contractAddress: {
              type: 'string',
              example: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
            },
            proposalId: { type: 'string', nullable: true, example: 'prop-42' },
            title: { type: 'string', nullable: true, example: 'Upgrade router to v2' },
            description: {
              type: 'string',
              nullable: true,
              example: 'Migrate liquidity router to the audited v2 implementation',
            },
            proposer: {
              type: 'string',
              example: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
            },
            executor: { type: 'string', nullable: true, example: null },
            targets: {
              type: 'array',
              items: { type: 'string' },
              description: 'Target contract addresses for the queued calls',
              example: ['CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5'],
            },
            values: {
              type: 'array',
              items: { type: 'string' },
              description: 'Call values (raw base units as strings)',
              example: ['0'],
            },
            calldatas: {
              type: 'array',
              items: { type: 'string' },
              description: 'Encoded call payloads',
              example: ['AAAADwAAAAh1cGdyYWRl'],
            },
            operationHash: {
              type: 'string',
              nullable: true,
              example: 'e5f40312233445566778899aabbccddeeff00112233445566778899aabbccddee',
            },
            queuedAt: { type: 'string', format: 'date-time', example: '2026-06-17T07:24:26.000Z' },
            minDelay: {
              type: 'integer',
              description: 'Minimum timelock delay in seconds',
              example: 172800,
            },
            executionTime: {
              type: 'string',
              format: 'date-time',
              example: '2026-06-19T07:24:26.000Z',
            },
            expiryTime: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-06-26T07:24:26.000Z',
            },
            status: {
              type: 'string',
              description: 'e.g. queued | executable | executed | expired | cancelled',
              example: 'queued',
            },
            executedTx: { type: 'string', nullable: true, example: null },
            cancelledBy: { type: 'string', nullable: true, example: null },
            gracePeriod: {
              type: 'integer',
              nullable: true,
              description: 'Grace period in seconds after executionTime',
              example: 604800,
            },
          },
        },
        // A scheduled cron job for a contract function (full record).
        CronJob: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2cronjob1' },
            contractAddress: {
              type: 'string',
              example: 'CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5',
            },
            cronExpression: { type: 'string', example: '0 0 * * *' },
            functionName: { type: 'string', example: 'distribute' },
            functionArgs: {
              type: 'object',
              description: 'Arguments passed to the function on each run',
              example: { recipient: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI' },
            },
            description: { type: 'string', nullable: true, example: 'Daily distribution' },
            lastRunAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-06-18T00:00:00.000Z',
            },
            nextRunAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-06-20T00:00:00.000Z',
            },
            totalRuns: { type: 'integer', example: 18 },
            successfulRuns: { type: 'integer', example: 17 },
            failedRuns: { type: 'integer', example: 1 },
            maxRuns: { type: 'integer', nullable: true, example: 30 },
            enabled: { type: 'boolean', example: true },
            createdBy: { type: 'string', nullable: true, example: null },
            createdAt: { type: 'string', format: 'date-time', example: '2026-06-01T00:00:00.000Z' },
          },
        },
        // A single cron job execution record (full record).
        CronExecution: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2cronex01' },
            cronJobId: { type: 'string', example: 'clz9q1x4t0000s6h2cronjob1' },
            executedAt: {
              type: 'string',
              format: 'date-time',
              example: '2026-06-19T07:24:26.000Z',
            },
            success: { type: 'boolean', example: true },
            txHash: {
              type: 'string',
              nullable: true,
              example: '3389e9f0f1a4e32477b1c0d9e8a6f5b4c3d2e1f0a9b8c7d6e5f40312233445566',
            },
            errorMessage: { type: 'string', nullable: true, example: null },
            gasUsed: { type: 'integer', nullable: true, example: 24500000 },
            duration: {
              type: 'integer',
              nullable: true,
              description: 'Execution duration in milliseconds',
              example: 240,
            },
          },
        },
        // An alert raised for a scheduled operation (full record).
        TimerAlert: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2tmalrt01' },
            scheduledOpId: { type: 'string', nullable: true, example: 'clz9q1x4t0000s6h2schedop1' },
            alertType: {
              type: 'string',
              description: 'e.g. upcoming | overdue | executed | failed',
              example: 'upcoming',
            },
            severity: {
              type: 'string',
              description: 'e.g. info | warning | critical',
              example: 'warning',
            },
            title: { type: 'string', example: 'Vesting unlock in 24h' },
            message: {
              type: 'string',
              example: 'Scheduled VESTING operation release triggers in 24 hours',
            },
            triggerTime: {
              type: 'string',
              format: 'date-time',
              example: '2026-06-19T07:24:26.000Z',
            },
            delivered: { type: 'boolean', example: false },
            acknowledged: { type: 'boolean', example: false },
          },
        },
        // ── Threat Intelligence Platform (#251) ───────────────────────────────
        // Full ThreatAdvisory record as stored in DB. mitigations is String? in
        // the schema even though the Zod input accepts an array.
        ThreatAdvisory: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2advis001' },
            title: { type: 'string', example: 'Reentrancy in transfer hook' },
            description: { type: 'string', nullable: true, example: 'A reentrancy vulnerability allows double-spend via malicious token hook.' },
            severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'], example: 'high' },
            cvssScore: { type: 'number', nullable: true, example: 8.1 },
            cveId: { type: 'string', nullable: true, example: 'CVE-2026-1234' },
            ghsaId: { type: 'string', nullable: true, example: null },
            affectedContracts: { type: 'array', items: { type: 'string' }, example: ['CALLD5GHXR4QSTKHSWQEK4UVMHM4QHU4KZ5G4SBKWY7C7TXKZ45RJ4M5'] },
            affectedChains: { type: 'array', items: { type: 'string' }, example: ['stellar'] },
            mitigations: { type: 'string', nullable: true, description: 'Stored as a serialised value (schema column is String?)', example: null },
            tags: { type: 'array', items: { type: 'string' }, example: ['reentrancy', 'community'] },
            sourceId: { type: 'string', nullable: true, example: 'clz9q1x4t0000s6h2vsource1' },
            status: { type: 'string', enum: ['open', 'under_review', 'resolved', 'disputed'], example: 'open' },
            publishedAt: { type: 'string', format: 'date-time', nullable: true, example: '2026-06-19T07:24:26.000Z' },
            externalUrl: { type: 'string', nullable: true, example: null },
            createdAt: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:26.000Z' },
            updatedAt: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:27.000Z' },
          },
        },
        // A review decision for a ThreatAdvisory (full ThreatReview record).
        ThreatReview: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2review001' },
            advisoryId: { type: 'string', example: 'clz9q1x4t0000s6h2advis001' },
            role: { type: 'string', nullable: true, enum: ['analyst', 'admin'], example: 'analyst' },
            decision: { type: 'string', nullable: true, enum: ['approve', 'reject', 'escalate'], example: 'approve' },
            notes: { type: 'string', nullable: true, example: 'Confirmed exploitable on testnet.' },
            reviewerKey: { type: 'string', example: 'sk_live_abc123' },
            createdAt: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:26.000Z' },
          },
        },
        // A community comment on a ThreatAdvisory (full ThreatComment record).
        ThreatComment: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2comment01' },
            advisoryId: { type: 'string', example: 'clz9q1x4t0000s6h2advis001' },
            authorKey: { type: 'string', description: 'X-API-Key header value, or "anonymous" if absent', example: 'anonymous' },
            body: { type: 'string', example: 'Reproduced on testnet ledger 3168075.' },
            createdAt: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:26.000Z' },
          },
        },
        // A TIP notification subscription (full TipSubscription record).
        TipSubscription: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2tipsub01' },
            channel: { type: 'string', enum: ['email', 'slack', 'discord', 'telegram'], example: 'slack' },
            target: { type: 'string', description: 'Channel-specific destination (email address, webhook URL, user id, etc.)', example: '#security-alerts' },
            active: { type: 'boolean', example: true },
            filters: {
              type: 'object',
              nullable: true,
              description: 'Optional severity/tag filters',
              properties: {
                severity: { type: 'array', items: { type: 'string' }, example: ['critical', 'high'] },
                tags: { type: 'array', items: { type: 'string' }, example: ['reentrancy'] },
              },
              example: { severity: ['critical', 'high'] },
            },
            createdAt: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:26.000Z' },
            updatedAt: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:27.000Z' },
          },
        },
        // A registered threat intelligence feed source (full VulnerabilitySource record).
        VulnerabilitySource: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz9q1x4t0000s6h2vsource1' },
            name: { type: 'string', description: 'Unique source identifier, e.g. NVD_CVE, GHSA, COMMUNITY', example: 'NVD_CVE' },
            sourceType: { type: 'string', description: 'Feed type: cve | ghsa | manual | onchain', example: 'cve' },
            feedUrl: { type: 'string', nullable: true, example: 'https://services.nvd.nist.gov/rest/json/cves/2.0' },
            lastFetchAt: { type: 'string', format: 'date-time', nullable: true, example: '2026-06-19T07:24:26.000Z' },
            active: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:26.000Z' },
            updatedAt: { type: 'string', format: 'date-time', example: '2026-06-19T07:24:27.000Z' },
          },
        },
        // Validation error envelope for routes using .safeParse() + .flatten().
        // Shape differs from ZodValidationError (which wraps .errors array).
        ZodFlattenedError: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                formErrors: { type: 'array', items: { type: 'string' }, example: [] },
                fieldErrors: {
                  type: 'object',
                  additionalProperties: { type: 'array', items: { type: 'string' } },
                  example: { title: ['String must contain at least 3 character(s)'] },
                },
              },
            },
          },
        },
      },
    },
    security: [{ ApiKeyAuth: [] }],
  },
  // Scan all route files for @swagger JSDoc comments
  apis: [
    path.join(__dirname, '../api/*.ts'),
    path.join(__dirname, '../api/*.js'),
    path.join(__dirname, '../middleware/*.ts'),
    path.join(__dirname, '../middleware/*.js'),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);

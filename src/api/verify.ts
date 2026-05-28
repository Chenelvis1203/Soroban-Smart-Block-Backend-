import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as os from 'os';
import { prisma } from '../db';
import { extractArchive, compileSandboxed, hashFile, cleanupDir, extractSourceFiles } from './compiler';

export const verifyRouter = Router();

// Store uploads in OS temp dir; 50 MB limit
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.tar.gz', '.tgz', '.zip'];
    const ok = allowed.some(ext => file.originalname.endsWith(ext));
    cb(ok ? null : new Error('Only .tar.gz / .zip archives are accepted'), ok);
  },
});

// POST /verify — submit a source archive for verification
verifyRouter.post('/', upload.single('archive'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No archive uploaded. Use field name "archive".' });
    return;
  }

  const { contractAddress, toolchain = 'soroban-cli@0.9.4' } = req.body as {
    contractAddress?: string;
    toolchain?: string;
  };

  // Hash the raw archive for deduplication / audit
  const uploadedHash = hashFile(req.file.path);

  // Create the job record immediately so the client can poll
  const job = await prisma.verificationJob.create({
    data: { contractAddress, toolchain, status: 'pending', uploadedHash },
  });

  // Run compilation asynchronously — do not await
  runVerification(job.id, req.file.path, req.file.mimetype, toolchain, contractAddress).catch(() => {
    // errors are persisted inside runVerification
  });

  res.status(202).json({ jobId: job.id, status: 'pending' });
});

// GET /verify/:id — poll job status
verifyRouter.get('/:id', async (req: Request, res: Response) => {
  const job = await prisma.verificationJob.findUnique({ where: { id: req.params.id } });
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});

// GET /verify/:id/snippet — return extracted source code files for a verification job
verifyRouter.get('/:id/snippet', async (req: Request, res: Response) => {
  const job = await prisma.verificationJob.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true, sourceFiles: true },
  });
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  if (!job.sourceFiles) {
    res.status(404).json({ error: 'Source files not available. Job may still be pending or failed before extraction.' });
    return;
  }
  res.json({ jobId: job.id, status: job.status, files: job.sourceFiles });
});

// ── async worker ─────────────────────────────────────────────────────────────

async function runVerification(
  jobId: string,
  archivePath: string,
  mimeType: string,
  toolchain: string,
  contractAddress?: string,
): Promise<void> {
  let extractedDir: string | null = null;

  try {
    await prisma.verificationJob.update({ where: { id: jobId }, data: { status: 'compiling' } });

    extractedDir = await extractArchive(archivePath, mimeType);

    // Capture source files before compilation (they get cleaned up after)
    const sourceFiles = await extractSourceFiles(extractedDir).catch(() => []);
    if (sourceFiles.length > 0) {
      await prisma.verificationJob.update({ where: { id: jobId }, data: { sourceFiles } });
    }

    const { wasmHash, logs } = await compileSandboxed(extractedDir, toolchain);

    // Optionally fetch on-chain Wasm hash via RPC
    let onChainWasmHash: string | null = null;
    if (contractAddress) {
      onChainWasmHash = await fetchOnChainHash(contractAddress).catch(() => null);
    }

    const matched = onChainWasmHash != null ? wasmHash === onChainWasmHash : null;

    await prisma.verificationJob.update({
      where: { id: jobId },
      data: {
        status: 'verified',
        compiledWasmHash: wasmHash,
        onChainWasmHash,
        matched,
        logs,
      },
    });
  } catch (err: any) {
    await prisma.verificationJob.update({
      where: { id: jobId },
      data: { status: 'failed', errorMsg: err.message ?? String(err) },
    }).catch(() => {});
  } finally {
    if (extractedDir) await cleanupDir(path.dirname(extractedDir));
    await cleanupDir(archivePath);
  }
}

/**
 * Fetches the Wasm hash for a deployed contract from the Stellar RPC.
 * Returns the hex-encoded SHA-256 of the contract's Wasm bytecode.
 */
async function fetchOnChainHash(contractAddress: string): Promise<string> {
  const { SorobanRpc, Contract } = await import('@stellar/stellar-sdk');
  const rpcUrl = process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org';
  const server = new SorobanRpc.Server(rpcUrl);

  // getLedgerEntries for the contract's Wasm entry
  const contract = new Contract(contractAddress);
  const key = contract.getFootprint();
  const resp = await server.getLedgerEntries(key);

  if (!resp.entries?.length) throw new Error('Contract not found on-chain');

  const entry = resp.entries[0];
  // The Wasm hash is stored in the contract instance ledger entry
  const wasmHash = (entry.val as any)?.contract_code?.hash;
  if (!wasmHash) throw new Error('Could not extract Wasm hash from ledger entry');

  return Buffer.from(wasmHash).toString('hex');
}

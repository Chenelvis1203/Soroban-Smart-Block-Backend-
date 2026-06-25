#!/usr/bin/env ts-node
/**
 * scripts/validate-prisma-references.ts
 *
 * Phase 2 — Schema-to-Code Validator
 * Parses prisma/schema.prisma, extracts every model + its fields, then scans
 * all src/ TypeScript files for references to those model names combined with
 * field-like property accesses (e.g. `tx.decodedDescription`) and flags any
 * field that does not exist on the Prisma model.
 *
 * Phase 3 — Migration Impact Analysis
 * When invoked with --diff <old-schema-file> it compares the two schemas and
 * reports removed / renamed / type-changed fields together with all source
 * locations that reference them.
 *
 * Usage:
 *   npx ts-node scripts/validate-prisma-references.ts
 *   npx ts-node scripts/validate-prisma-references.ts --diff prisma/schema.prisma.bak
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelField {
  name: string;
  type: string;
  isOptional: boolean;
  isArray: boolean;
}

interface PrismaModel {
  name: string;
  fields: ModelField[];
}

interface Reference {
  file: string;
  line: number;
  column: number;
  text: string;
  modelName: string;
  fieldName: string;
}

interface ValidationResult {
  phantomReferences: Reference[];
  validReferences: number;
}

interface DiffReport {
  removedFields: Array<{ model: string; field: string; references: Reference[] }>;
  renamedCandidates: Array<{ model: string; oldField: string; possibleNewField: string }>;
  typeChangedFields: Array<{ model: string; field: string; oldType: string; newType: string }>;
}

// ---------------------------------------------------------------------------
// Schema parser
// ---------------------------------------------------------------------------

export function parsePrismaSchema(schemaPath: string): Map<string, PrismaModel> {
  const content = fs.readFileSync(schemaPath, 'utf-8');
  const models = new Map<string, PrismaModel>();

  // Match model blocks
  const modelRegex = /^model\s+(\w+)\s*\{([^}]+)\}/gm;
  let modelMatch: RegExpExecArray | null;

  while ((modelMatch = modelRegex.exec(content)) !== null) {
    const modelName = modelMatch[1];
    const body = modelMatch[2];
    const fields: ModelField[] = [];

    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip blank lines, comments, @@directives, and relation lines
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;

      // Field line: <name> <type>[?|[]] ...
      const fieldMatch = trimmed.match(/^(\w+)\s+([\w.]+)(\[\])?(\?)?/);
      if (!fieldMatch) continue;

      const fieldName = fieldMatch[1];
      const fieldType = fieldMatch[2];
      const isArray = Boolean(fieldMatch[3]);
      const isOptional = Boolean(fieldMatch[4]);

      // Skip relation fields (they start with uppercase model names but we
      // only want scalar / Json / primitive fields that appear in select clauses)
      fields.push({ name: fieldName, type: fieldType, isOptional, isArray });
    }

    models.set(modelName, { name: modelName, fields });
  }

  return models;
}

// ---------------------------------------------------------------------------
// Source scanner
// ---------------------------------------------------------------------------

/**
 * Build a map of Prisma variable name → model name by scanning `prisma.X.`
 * call sites and `select:` shapes.  This is a heuristic — it catches the
 * common patterns used in this codebase.
 */
function buildVariableModelMap(content: string): Map<string, string> {
  const map = new Map<string, string>();

  // Pattern: prisma.modelName.findMany(...) / findFirst / findUnique / count
  // variable assigned from that: const [rows, ...] = await Promise.all([prisma.transaction...
  const prismaCallRegex =
    /prisma\.(\w+)\.(findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|create|update|upsert|delete|count)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = prismaCallRegex.exec(content)) !== null) {
    // Try to find preceding variable names in the same statement
    const before = content.slice(Math.max(0, m.index - 300), m.index);
    // const txs = await prisma.transaction...
    const constMatch = before.match(/(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?$/);
    if (constMatch) {
      map.set(constMatch[1], capitalize(m[1]));
    }
    // Destructuring: const [txs, total] = await Promise.all([...
    const destructMatch = before.match(/const\s+\[([^\]]+)\]\s*=\s*await\s+Promise\.all\s*\(\s*\[$/);
    if (destructMatch) {
      const vars = destructMatch[1].split(',').map((v) => v.trim());
      if (vars[0]) map.set(vars[0], capitalize(m[1]));
    }
  }

  // Pattern: .map((tx) => or .map((event) =>
  // We can infer from the variable name alone for common conventions
  const mapRegex = /\.map\s*\(\s*\((\w+)\)\s*=>/g;
  while ((m = mapRegex.exec(content)) !== null) {
    const varName = m[1];
    // Guess model from common naming conventions
    const guesses: [string, string][] = [
      ['tx', 'Transaction'],
      ['transaction', 'Transaction'],
      ['event', 'Event'],
      ['ledger', 'Ledger'],
      ['contract', 'Contract'],
    ];
    for (const [pattern, model] of guesses) {
      if (varName === pattern || varName.startsWith(pattern)) {
        if (!map.has(varName)) map.set(varName, model);
      }
    }
  }

  return map;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function scanFile(
  filePath: string,
  models: Map<string, PrismaModel>,
): { phantom: Reference[]; valid: number } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const phantom: Reference[] = [];
  let valid = 0;

  const varMap = buildVariableModelMap(content);

  // Scan every occurrence of `varName.fieldName` where varName is in our map
  for (const [varName, modelName] of varMap) {
    const model = models.get(modelName);
    if (!model) continue;

    const pattern = new RegExp(`\\b${varName}\\.(\\w+)`, 'g');
    let m: RegExpExecArray | null;

    while ((m = pattern.exec(content)) !== null) {
      const fieldName = m[1];
      // Skip method calls (they have `(` immediately after)
      const after = content[m.index + m[0].length];
      if (after === '(') continue;

      const fieldExists = model.fields.some((f) => f.name === fieldName);
      // Compute line / column
      const before = content.slice(0, m.index);
      const lineNum = before.split('\n').length;
      const lastNewline = before.lastIndexOf('\n');
      const col = m.index - lastNewline;
      const lineText = lines[lineNum - 1] || '';

      if (fieldExists) {
        valid++;
      } else {
        phantom.push({
          file: filePath,
          line: lineNum,
          column: col,
          text: lineText.trim(),
          modelName,
          fieldName,
        });
      }
    }
  }

  return { phantom, valid };
}

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Phase 2 — Validator
// ---------------------------------------------------------------------------

export function runValidator(schemaPath: string, srcDir: string): ValidationResult {
  const models = parsePrismaSchema(schemaPath);
  console.log(`📋 Parsed ${models.size} Prisma models from ${schemaPath}`);

  const files = collectTsFiles(srcDir);
  console.log(`🔍 Scanning ${files.length} TypeScript files in ${srcDir}`);

  const allPhantom: Reference[] = [];
  let totalValid = 0;

  for (const file of files) {
    const { phantom, valid } = scanFile(file, models);
    allPhantom.push(...phantom);
    totalValid += valid;
  }

  return { phantomReferences: allPhantom, validReferences: totalValid };
}

// ---------------------------------------------------------------------------
// Phase 3 — Migration Impact Analysis
// ---------------------------------------------------------------------------

export function runDiffAnalysis(
  newSchemaPath: string,
  oldSchemaPath: string,
  srcDir: string,
): DiffReport {
  const newModels = parsePrismaSchema(newSchemaPath);
  const oldModels = parsePrismaSchema(oldSchemaPath);
  const files = collectTsFiles(srcDir);

  // Build a set of all references in src/
  const allRefs: Reference[] = [];
  for (const file of files) {
    // We scan against new models to find what's still there;
    // we'll also check old models.
    const { phantom } = scanFile(file, oldModels);
    allRefs.push(...phantom);
  }

  const removedFields: DiffReport['removedFields'] = [];
  const renamedCandidates: DiffReport['renamedCandidates'] = [];
  const typeChangedFields: DiffReport['typeChangedFields'] = [];

  for (const [modelName, oldModel] of oldModels) {
    const newModel = newModels.get(modelName);

    for (const oldField of oldModel.fields) {
      const newField = newModel?.fields.find((f) => f.name === oldField.name);

      if (!newField) {
        // Field removed — find all references to it
        const refs: Reference[] = [];
        for (const file of files) {
          const content = fs.readFileSync(file, 'utf-8');
          const lines = content.split('\n');
          const pattern = new RegExp(`\\.${oldField.name}\\b`, 'g');
          let m: RegExpExecArray | null;
          while ((m = pattern.exec(content)) !== null) {
            const before = content.slice(0, m.index);
            const lineNum = before.split('\n').length;
            const lastNl = before.lastIndexOf('\n');
            refs.push({
              file,
              line: lineNum,
              column: m.index - lastNl,
              text: (lines[lineNum - 1] || '').trim(),
              modelName,
              fieldName: oldField.name,
            });
          }
        }
        if (refs.length > 0) {
          removedFields.push({ model: modelName, field: oldField.name, references: refs });
        }

        // Rename candidate: new model has a field with similar name
        if (newModel) {
          for (const nf of newModel.fields) {
            if (
              nf.name !== oldField.name &&
              (nf.name.toLowerCase().includes(oldField.name.toLowerCase().slice(0, 4)) ||
                oldField.name.toLowerCase().includes(nf.name.toLowerCase().slice(0, 4)))
            ) {
              renamedCandidates.push({
                model: modelName,
                oldField: oldField.name,
                possibleNewField: nf.name,
              });
            }
          }
        }
      } else if (newField.type !== oldField.type) {
        typeChangedFields.push({
          model: modelName,
          field: oldField.name,
          oldType: oldField.type,
          newType: newField.type,
        });
      }
    }
  }

  return { removedFields, renamedCandidates, typeChangedFields };
}

// ---------------------------------------------------------------------------
// CLI output
// ---------------------------------------------------------------------------

function printValidationResult(result: ValidationResult): void {
  const { phantomReferences, validReferences } = result;

  console.log(`\n✅ Valid field references found: ${validReferences}`);

  if (phantomReferences.length === 0) {
    console.log('✅ No phantom Prisma field references detected.\n');
    process.exit(0);
  }

  console.error(`\n❌ Found ${phantomReferences.length} phantom field reference(s):\n`);
  for (const ref of phantomReferences) {
    const rel = path.relative(process.cwd(), ref.file);
    console.error(`  ${rel}:${ref.line}:${ref.column}`);
    console.error(`    Model  : ${ref.modelName}`);
    console.error(`    Field  : ${ref.fieldName}  (does not exist)`);
    console.error(`    Source : ${ref.text}`);
    console.error('');
  }
  process.exit(1);
}

function printDiffReport(report: DiffReport): void {
  let issues = 0;

  if (report.removedFields.length > 0) {
    console.error('\n🗑️  REMOVED FIELDS that are still referenced in src/:');
    for (const { model, field, references } of report.removedFields) {
      console.error(`\n  ${model}.${field}`);
      for (const ref of references) {
        const rel = path.relative(process.cwd(), ref.file);
        console.error(`    ${rel}:${ref.line}  → ${ref.text}`);
        issues++;
      }
    }
  }

  if (report.renamedCandidates.length > 0) {
    console.warn('\n🔄 POSSIBLE RENAMES (manual review needed):');
    for (const { model, oldField, possibleNewField } of report.renamedCandidates) {
      console.warn(`  ${model}.${oldField}  →  possibly ${model}.${possibleNewField}`);
    }
  }

  if (report.typeChangedFields.length > 0) {
    console.warn('\n⚠️  TYPE-CHANGED FIELDS:');
    for (const { model, field, oldType, newType } of report.typeChangedFields) {
      console.warn(`  ${model}.${field}: ${oldType} → ${newType}`);
    }
  }

  if (issues === 0) {
    console.log('\n✅ Migration impact analysis: no breaking references found.\n');
  } else {
    console.error(`\n❌ Migration impact analysis: ${issues} potential break(s) detected.\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main (only runs when the script is executed directly)
// ---------------------------------------------------------------------------

if (require.main === module) {
  const ROOT = path.resolve(__dirname, '..');
  const SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma');
  const SRC = path.join(ROOT, 'src');

  const args = process.argv.slice(2);
  const diffIdx = args.indexOf('--diff');

  if (diffIdx !== -1) {
    const oldSchema = args[diffIdx + 1];
    if (!oldSchema || !fs.existsSync(oldSchema)) {
      console.error('Usage: --diff <path-to-old-schema.prisma>');
      process.exit(1);
    }
    console.log(`\n🔎 Migration impact analysis: ${oldSchema}  →  ${SCHEMA}\n`);
    const report = runDiffAnalysis(SCHEMA, oldSchema, SRC);
    printDiffReport(report);
  } else {
    console.log('\n🔎 Prisma field reference validator\n');
    const result = runValidator(SCHEMA, SRC);
    printValidationResult(result);
  }
}

// Optional check against a real statement PDF. Skipped in CI (no fixture is
// committed — real bank statements must not live in a public repo).
// Run locally with:  node tests/realpdf.mjs /path/to/statement.pdf
import fs from "fs";
import assert from "node:assert/strict";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractPages } from "../src/lib/pdf/extract.js";
import { detectParser } from "../src/lib/statements/index.js";

const path = process.argv[2];
if (!path) { console.log("usage: node tests/realpdf.mjs <statement.pdf>"); process.exit(0); }

const buf = fs.readFileSync(path);
const pages = await extractPages(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { getDocument });
const parser = detectParser(pages);
assert.ok(parser, "no parser matched this PDF");
const r = parser.parse(pages);

console.log(`parser:        ${parser.name}`);
console.log(`account:       ${r.accountNumber}`);
console.log(`period:        ${r.period ? `${r.period.start} .. ${r.period.end}` : "(not found)"}`);
console.log(`pdf pages:     ${pages.length} (${r.statementPages} with transactions)`);
console.log(`transactions:  ${r.transactions.length}`);
console.log(`opening:       ${r.opening}`);
console.log(`closing:       ${r.closing}`);
console.log(`sum withdraw:  ${r.reconciliation.sumWithdrawals}  (printed ${r.totals?.withdrawals})`);
console.log(`sum deposit:   ${r.reconciliation.sumDeposits}  (printed ${r.totals?.deposits})`);
console.log(`row mismatches:${r.reconciliation.rowMismatches.length}`);
console.log(`warnings:      ${r.warnings.length ? r.warnings.join(" | ") : "none"}`);
console.log(`RECONCILED:    ${r.reconciliation.ok ? "YES" : "NO"}`);

assert.equal(r.reconciliation.ok, true, "reconciliation failed");
console.log("\nOK");

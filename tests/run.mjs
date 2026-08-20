import { runUnitTests } from "./unit.mjs";
import { runGitHubTests } from "./github.mjs";
import { runOcbcTests } from "./ocbc.mjs";
import { runAssetTests } from "./assets.mjs";
import { runQuoteTests } from "./quotes.mjs";

const pending = [];
const t = (name, fn) => pending.push({ name, fn });

runUnitTests(t);
runGitHubTests(t);
runOcbcTests(t);
runAssetTests(t);
runQuoteTests(t);

let pass = 0, fail = 0;
const lines = [];
for (const { name, fn } of pending) {
  try { await fn(); pass++; lines.push(`  ✓ ${name}`); }
  catch (e) { fail++; lines.push(`  ✗ ${name}\n      ${String(e.message).split("\n")[0]}`); }
}
console.log(lines.join("\n"));
console.log(`\n${pass} passed, ${fail} failed, ${pending.length} total`);
process.exit(fail === 0 ? 0 : 1);

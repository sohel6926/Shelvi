// Rewrites the job-role block of firestore.rules from functions/src/roles/permRules.ts.
// Run from the project folder after `cd functions && npm test` (it needs the compiled lib-test):  node tools/gen-role-rules.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { rulesRoleBlock, RULES_BLOCK_START, RULES_BLOCK_END } = require("../functions/lib-test/src/roles/rulesBlock.js");
const file = new URL("../firestore.rules", import.meta.url);
const text = readFileSync(file, "utf8");
const a = text.indexOf(RULES_BLOCK_START), b = text.indexOf(RULES_BLOCK_END);
if (a < 0 || b < 0) throw new Error("job-role markers not found in firestore.rules");
writeFileSync(file, text.slice(0, a) + rulesRoleBlock() + text.slice(b + RULES_BLOCK_END.length));
console.log("firestore.rules: job-role block rewritten");

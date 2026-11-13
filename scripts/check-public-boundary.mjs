import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Split spellings keep the publication guard from flagging its own policy.
const vendorNames = ['su'+'no(?!s)', 'mu'+'reka', 'fl'+'itt', 'tb'+'c', 'comet'+'api', 'seed'+'ance', 'byte'+'plus', 'eleven'+'labs', 'ki'+'ts'];
const vendor = new RegExp(`(?:${vendorNames.join('|')})(?!s-)`, 'i');
const privateHost = /(?:https?:\/\/)[^\s"'<>]*(?:\.railway\.app|\.neon\.tech|redpandaai\.)/i;
const credential = /\b(?:sk_live_[A-Za-z0-9]{16,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{30,})\b/;
const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const failures = [];
for (const path of paths) {
  let buffer;
  try { buffer = readFileSync(path); } catch { continue; }
  if (buffer.includes(0)) continue;
  const content = buffer.toString('utf8');
  if (vendor.test(path) || vendor.test(content.replace(/integrity: [^\n]+/g, 'integrity: [hash]')) || privateHost.test(content) || credential.test(content)) failures.push(path);
}
if (failures.length) {
  console.error('Public boundary violations (paths only):\n' + failures.join('\n'));
  process.exit(1);
}
console.log(`Public boundary OK: ${paths.length} tracked files inspected`);

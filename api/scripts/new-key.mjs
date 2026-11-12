// Prints a new random API key (once, for you to store) and the credential entry for API_CREDENTIALS.
// Only the SHA-256 goes to the server. Usage: node api/scripts/new-key.mjs <credential-id> <actor-id> [more actor ids]
import { createHash, randomBytes } from 'node:crypto';
const [id, ...actors] = process.argv.slice(2);
if (!id || !actors.length) { console.error('usage: node api/scripts/new-key.mjs <credential-id> <actor-id> [actor-id...]'); process.exit(1); }
const key = 'hr_' + randomBytes(32).toString('base64url');
const sha256 = createHash('sha256').update(key).digest('hex');
console.error('API key (shown once, store it in the assistant / a password manager, not in git):');
console.error(key);
console.log(JSON.stringify({ id, sha256, actors }));

// Writes the walk's table (docs/console-desktop-check/walk/README.md) between its markers; the text around them is kept.
import fs from 'node:fs';
import path from 'node:path';
export function report({ OUT, results, requests, aborted, outbound, proof, SCREENS }) {
  const f = path.join(OUT, 'README.md'); const A = '<!-- results:start -->', B = '<!-- results:end -->';
  const esc = (t) => String(t).replace(/\|/g, '/').replace(/\s+/g, ' ');
  const parts = [...new Set(results.map((r) => r.part))]; const lines = [];
  lines.push(`Run ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC, commit ${process.env.WALK_COMMIT || 'working folder'}. ${results.filter((r) => r.ok).length} passed, ${results.filter((r) => !r.ok).length} failed.`, '', '| Part | Step | Passed | Failed |', '| --- | --- | --- | --- |');
  for (const p of parts) for (const st of [...new Set(results.filter((r) => r.part === p && !/^(screen|demo|today) [a-z]+(:.*)?$/.test(r.step)).map((r) => r.step))]) { const l = results.filter((r) => r.part === p && r.step === st); lines.push(`| ${p} | ${esc(st)} | ${l.filter((r) => r.ok).length} | ${l.filter((r) => !r.ok).length} |`); }
  for (const p of parts) { const l = results.filter((r) => r.part === p && /^(screen|demo|today) [a-z]+(:.*)?$/.test(r.step)); if (l.length) lines.push(`| ${p} | the sixteen screens | ${l.filter((r) => r.ok).length} | ${l.filter((r) => !r.ok).length} |`); }
  lines.push('', '### Failed checks', ''); for (const r of results.filter((q) => !q.ok)) lines.push(`- [${r.part}] ${esc(r.step)}: ${esc(r.check)}. ${esc(r.note).slice(0, 300)}`); if (!results.some((q) => !q.ok)) lines.push('None.');
  lines.push('', '### Requests to open each screen', '', '| Screen | Worker requests | Firestore queries of the browser | Today\'s Worker | Firestore (today) |', '| --- | --- | --- | --- | --- |');
  const c = (k, t) => requests[k]?.[t];
  for (const [t] of SCREENS) { const b = c('branch', t) || { worker: [], firestore: '-' }, o = c('today', t) || { worker: [], firestore: '-' }; lines.push(`| ${t} | ${b.worker.length}: ${b.worker.map((q) => '`' + q + '`').join(' ')} | ${b.firestore} | ${o.worker.length} | ${o.firestore} |`); }
  const k = requests.keysWith7?.keys; if (k) lines.push('', `Keys screen with seven keys: ${k.worker.length} Worker requests, ${k.firestore} Firestore queries (one per key).`);
  lines.push('', '### Network', '', `- Sandbox proof at the start: ${esc(proof)}.`, `- Aborted in the browser: ${aborted.length ? aborted.map((a) => '`' + a.url + '`').join(', ') : 'none'}.`, `- Asked by a Worker of the outside world (answered or refused on this computer): ${JSON.stringify(outbound)}.`);
  const block = `${A}\n${lines.join('\n')}\n${B}`; let t = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : `# Owner walk of the console\n\n${A}\n${B}\n`;
  t = t.includes(A) ? t.slice(0, t.indexOf(A)) + block + t.slice(t.indexOf(B) + B.length) : t + '\n' + block + '\n';
  fs.writeFileSync(f, t);
}

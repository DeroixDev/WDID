// Schreibt www/build-info.js und kopiert die Capacitor-Runtime nach www/vendor.
// Aufruf: node scripts/build-info.mjs [--expires 2026-10-27T19:00:00Z]
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';

const i = process.argv.indexOf('--expires');
const builtAt = new Date();
const expiresAt = i > -1 ? new Date(process.argv[i + 1]) : new Date(builtAt.getTime() + 7 * 864e5);
if (isNaN(expiresAt)) throw new Error('Ungültiges Ablaufdatum: ' + process.argv[i + 1]);

writeFileSync('www/build-info.js',
  `window.WDID_BUILD = ${JSON.stringify({ builtAt: builtAt.toISOString(), expiresAt: expiresAt.toISOString() })};\n`);
mkdirSync('www/vendor', { recursive: true });
copyFileSync('node_modules/@capacitor/core/dist/capacitor.js', 'www/vendor/capacitor.js');
console.log('Build-Info: Signatur gültig bis', expiresAt.toLocaleString('de-DE'));

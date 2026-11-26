// Only -PsurveyTestBackend=true adds this directory to a debug APK. Release always uses its packaged assets.
import fs from 'node:fs/promises';
import { build } from 'esbuild';
const config = JSON.parse(await fs.readFile('site.config.json', 'utf8'));
config.firebase.projectId = 'demo-havat-ravve';
config.firebase.authDomain = 'demo-havat-ravve.firebaseapp.com';
const out = 'android/app/build/survey-test-assets/public/app.js';
await build({
  stdin: {
    contents: `
import {GoogleAuthProvider,connectAuthEmulator,signInWithCredential} from 'firebase/auth';
import {connectFirestoreEmulator} from 'firebase/firestore';
import {db,readyAuth} from './src/app/firebase';
connectFirestoreEmulator(db,'localhost',8080);
const auth=await readyAuth();
connectAuthEmulator(auth,'http://localhost:9099',{disableWarnings:true});
await auth.authStateReady();
if(!auth.currentUser) await signInWithCredential(auth,GoogleAuthProvider.credential(JSON.stringify({sub:'farm-survey-owner',email:'farm-owner@example.test',email_verified:true,name:'בעלי החווה'})));
await import('./src/app-entry');`,
    resolveDir: process.cwd(),
    sourcefile: 'survey-emulator-entry.ts',
  },
  bundle: true,
  target: 'es2022',
  format: 'esm',
  jsx: 'automatic',
  external: ['/assets/*'],
  outfile: out,
  minify: true,
  plugins: [
    {
      name: 'local-fixture',
      setup(b) {
        b.onLoad({ filter: /site\.config\.json$/ }, () => ({ contents: JSON.stringify(config), loader: 'json' }));
      },
    },
  ],
});
console.log('Built isolated emulator assets');

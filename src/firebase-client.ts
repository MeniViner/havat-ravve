import {initializeApp,getApps} from 'firebase/app';import {getFirestore} from 'firebase/firestore';import config from '../site.config.json';
export const app=getApps()[0]||initializeApp(config.firebase);export const db=getFirestore(app);export {config};

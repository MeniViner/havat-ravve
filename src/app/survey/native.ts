import { Capacitor, registerPlugin } from '@capacitor/core';
import { readyAuth } from '../firebase';
import { demoOnly } from '../demo/store';
import type { Fix, Recording, Sample } from './model';

export type Level = 'prompt' | 'precise' | 'approximate' | 'denied' | 'blocked' | 'browser';
export type Status = { level: Level; enabled: boolean; notifications: boolean; session?: Recording };
type Key = { key: string };
type Control = 'start' | 'resume' | 'pause' | 'finish' | 'saved';
interface Recorder {
  authorize(args: { uid: string; token: string; previousKey: string }): Promise<Key>;
  disconnect(args: Key): Promise<void>;
  status(args: Key): Promise<Status>;
  ask(args: Key): Promise<Status>;
  askNotifications(args: Key): Promise<Status>;
  settings(args: Key & { target: 'device' | 'app' | 'notifications' }): Promise<void>;
  control(args: Key & { id: string; action: Control }): Promise<{ session?: Recording }>;
  readFix(args: Key): Promise<Fix>;
  samples(args: Key & { id: string; after: number }): Promise<{ items: Sample[] }>;
}
// The hosted site and older Android wrappers use browser location. Only the trusted local app can record trails.
export const hasSurveyRecorder = location.origin === 'https://localhost' && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('FarmSurvey');
export const recorder = registerPlugin<Recorder>('FarmSurvey');
const prefix = 'farm-survey-auth:';
export async function connectSurvey(uid: string) {
  const user = (await readyAuth()).currentUser;
  if (!hasSurveyRecorder || demoOnly() || !user || user.uid !== uid) throw new Error('נדרשת כניסה לחשבון הבעלים');
  const token = await user.getIdToken().catch((e: { code?: string }) => {
    if (e.code === 'auth/network-request-failed' || !navigator.onLine) return '';
    throw e;
  });
  const grant = await recorder.authorize({ uid, token, previousKey: localStorage.getItem(prefix + uid) || '' });
  if ((await readyAuth()).currentUser?.uid !== uid || demoOnly()) {
    await recorder.disconnect(grant);
    throw new Error('החשבון התחלף');
  }
  localStorage.setItem(prefix + uid, grant.key);
  return grant;
}
export async function disconnectSurvey(uid?: string) {
  if (!hasSurveyRecorder || !uid) return;
  const key = localStorage.getItem(prefix + uid);
  if (key) {
    try {
      await recorder.disconnect({ key });
    } catch (error) {
      if ((error as { code?: string }).code !== 'owner') throw error;
    }
    localStorage.removeItem(prefix + uid);
  }
}

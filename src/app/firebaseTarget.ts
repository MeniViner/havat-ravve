import { isNative } from './native';
export const useEmulator = !isNative && typeof location !== 'undefined' && location.hostname === 'localhost' && new URLSearchParams(location.search).has('emulator');

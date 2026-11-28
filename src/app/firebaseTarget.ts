export const useEmulator = typeof location !== 'undefined' && location.hostname === 'localhost' && new URLSearchParams(location.search).has('emulator');

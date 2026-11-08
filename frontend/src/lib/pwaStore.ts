import { writable } from 'svelte/store';

export const deferredPrompt = writable<any>(null);
export const isPWA = writable<boolean>(false);

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt.set(e);
  });

  const checkPWA = () => {
    isPWA.set(
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
  };
  checkPWA();
  window.matchMedia('(display-mode: standalone)').addEventListener('change', checkPWA);
}

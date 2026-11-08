import React, { useEffect, useState } from 'react';
import { Download, Wifi, WifiOff, Share, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAStatus() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const triggerInstall = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isOnline,
    triggerInstall,
  };
}

export const PWAStatusAndInstall: React.FC<{ onOfflineSync?: () => void }> = ({ onOfflineSync }) => {
  const { isInstallable, isInstalled, isIOS, isOnline, triggerInstall } = usePWAStatus();
  const [showModal, setShowModal] = useState(false);
  const syncCallbackRef = React.useRef(onOfflineSync);
  syncCallbackRef.current = onOfflineSync;

  useEffect(() => {
    if (isOnline && syncCallbackRef.current) {
      syncCallbackRef.current();
    }
  }, [isOnline]);

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
      {/* Offline / Online Readiness Indicator */}
      <div
        className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
          isOnline
            ? 'bg-[#0f172a]/92 border-slate-700/80 text-slate-300'
            : 'bg-amber-950/95 border-amber-500/60 text-amber-300'
        }`}
        title={
          isOnline
            ? 'Online — Leaderboards synced & Offline Play cached'
            : 'Offline Mode Active — Full game & local leaderboards available without internet'
        }
      >
        {isOnline ? (
          <>
            <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">Offline Ready</span>
          </>
        ) : (
          <>
            <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="whitespace-nowrap">Offline</span>
          </>
        )}
      </div>

      {/* Install App Button (Always available unless already running standalone) */}
      {!isInstalled && (
        <button
          onClick={() => {
            if (isInstallable) {
              triggerInstall();
            } else {
              setShowModal(true);
            }
          }}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          title="Install Katana Nectar 3D for instant offline play"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden xs:inline sm:inline">Install</span>
        </button>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 pointer-events-auto">
          <div className="w-full max-w-md rounded-xl bg-[#111827] border border-slate-700 p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold font-display text-amber-400">
                Install Katana Nectar 3D (Offline PWA)
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-300 leading-relaxed">
              <p>
                <strong>Katana Nectar 3D</strong> caches all 3D models, physics, shaders, and audio locally so you can slice anywhere without an internet connection.
              </p>
              {isIOS ? (
                <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold">
                    <Share className="w-4 h-4" />
                    <span>Install on iPhone / iPad:</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-xs text-slate-300">
                    <li>Tap the <strong>Share</strong> button in Safari&apos;s toolbar.</li>
                    <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                  </ol>
                </div>
              ) : (
                <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                  <p className="text-xs text-slate-300">
                    • In Chrome, Edge, or Brave, click the <strong>Install icon</strong> in the address bar (or open the browser menu and choose <strong>Install Katana Nectar 3D</strong>).
                  </p>
                  <p className="text-xs text-emerald-400">
                    ✓ Service Worker &amp; Offline Cache are already active in this browser tab!
                  </p>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

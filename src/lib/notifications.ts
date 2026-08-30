// Audio Context and Native System Notification Utility

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playNotificationSound(type: 'order' | 'delivered' | 'merchant' | 'test' = 'order') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (type === 'order' || type === 'test') {
      // Cheerful 3-tone chime (C5 -> E5 -> G5 -> C6)
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.12);

        gain.gain.setValueAtTime(0.01, now + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.3, now + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.36);
      });
    } else if (type === 'delivered') {
      // Double Success Tone (E5 -> B5)
      const notes = [659.25, 987.77];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.16);

        gain.gain.setValueAtTime(0.01, now + i * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.35, now + i * 0.16 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.16 + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + i * 0.16);
        osc.stop(now + i * 0.16 + 0.42);
      });
    } else if (type === 'merchant') {
      // Regal Fanfare (D5 -> F#5 -> A5)
      const notes = [587.33, 739.99, 880.0];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.14);

        gain.gain.setValueAtTime(0.01, now + i * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.3, now + i * 0.14 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + 0.38);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + i * 0.14);
        osc.stop(now + i * 0.14 + 0.4);
      });
    }
  } catch (err) {
    console.warn('Audio playback error:', err);
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  // Also unlock audio context on user interaction
  getAudioContext();

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted' && 'serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch (e) {
        console.warn('SW registration:', e);
      }
    }
    return permission;
  } catch {
    return 'denied';
  }
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermissionStatus(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

export interface SendSystemNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
  soundType?: 'order' | 'delivered' | 'merchant' | 'test';
}

export async function sendSystemNotification({
  title,
  body,
  icon = '/icon-192.png',
  url = '/admin/orders',
  tag,
  soundType = 'order',
}: SendSystemNotificationOptions) {
  // Always play sound
  playNotificationSound(soundType);

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }

  if (Notification.permission !== 'granted') {
    return;
  }

  try {
    // Try Service Worker registration first for better background / mobile support
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon,
          badge: icon,
          tag: tag || 'etihad-alert-' + Date.now(),
          data: { url },
          vibrate: [200, 100, 200, 100, 200],
          requireInteraction: true,
        } as any);
        return;
      }
    }

    // Fallback to standard Notification constructor
    const notif = new Notification(title, {
      body,
      icon,
      tag: tag || 'etihad-alert-' + Date.now(),
      requireInteraction: true,
    } as any);

    notif.onclick = function () {
      window.focus();
      if (url) {
        window.location.href = url;
      }
      notif.close();
    };
  } catch (err) {
    console.warn('Failed to send notification:', err);
  }
}

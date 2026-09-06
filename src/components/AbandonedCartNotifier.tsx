'use client';

import React, { useEffect, useRef } from 'react';
import { useCart } from '@/context/CartContext';
import { sendSystemNotification, getNotificationPermissionStatus } from '@/lib/notifications';

const ABANDONED_CART_KEY = 'souq_abandoned_cart_last_alert';
const COOLDOWN_HOURS = 3; // Cooldown between alerts to prevent spamming

export default function AbandonedCartNotifier() {
  const { cart } = useCart();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // If cart is empty, clear any pending abandoned timer
    if (cart.length === 0) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const checkAndSendReminder = () => {
      if (cart.length === 0) return;
      if (typeof window === 'undefined') return;

      const permission = getNotificationPermissionStatus();
      if (permission !== 'granted') return;

      const lastAlertTime = Number(localStorage.getItem(ABANDONED_CART_KEY) || 0);
      const now = Date.now();
      const cooldownMs = COOLDOWN_HOURS * 60 * 60 * 1000;

      // Check if cooldown has passed
      if (now - lastAlertTime < cooldownMs) {
        return;
      }

      // Mark sent time
      localStorage.setItem(ABANDONED_CART_KEY, now.toString());

      // Trigger reminder
      sendSystemNotification({
        title: '🛒 ناسي المسواك بالسّلة ..',
        body: 'كمّل الطلب وخلّي المسواك يوصلك وين متكون 📦✨',
        url: '/cart',
        tag: 'abandoned-cart-' + Math.floor(now / 3600000),
        soundType: 'order',
      });
    };

    // 1. Schedule a timeout (e.g., 5 minutes after adding items if user stays inactive)
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      checkAndSendReminder();
    }, 5 * 60 * 1000); // 5 minutes

    // 2. Tab visibility change (When user switches apps or minimizes browser with items in cart)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && cart.length > 0) {
        // Send reminder shortly after switching away
        setTimeout(() => {
          checkAndSendReminder();
        }, 1500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cart]);

  return null;
}

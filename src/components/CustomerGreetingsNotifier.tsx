'use client';

import React, { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { sendSystemNotification, getNotificationPermissionStatus } from '@/lib/notifications';

const LAST_VISIT_KEY = 'souq_last_visit_timestamp';
const WELCOME_NEW_KEY = 'souq_new_user_welcomed_';
const ABSENCE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days of absence

export default function CustomerGreetingsNotifier() {
  const { user } = useAuth();
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    const now = Date.now();
    const lastVisitStr = localStorage.getItem(LAST_VISIT_KEY);
    const lastVisit = lastVisitStr ? Number(lastVisitStr) : null;

    // Save current visit time
    localStorage.setItem(LAST_VISIT_KEY, now.toString());

    const permission = getNotificationPermissionStatus();
    if (permission !== 'granted') return;

    // Small delay so the page settles before triggering the greeting
    const timer = setTimeout(() => {
      // 1. Check if user is newly registered and hasn't received welcome greeting yet
      if (user?.id) {
        const welcomeKey = `${WELCOME_NEW_KEY}${user.id}`;
        const alreadyWelcomed = localStorage.getItem(welcomeKey);

        if (!alreadyWelcomed) {
          localStorage.setItem(welcomeKey, 'true');
          sendSystemNotification({
            title: `🎁 أهلاً وسهلاً بك ${user.name ? `يا ${user.name.split(' ')[0]}` : ''} في سوق الجملة!`,
            body: 'نورت متجرك يا غالي! حسابك جاهز لتسوّق أفضل المواد الغذائية والسناكات بأسعار الجملة والمفرد مع توصيل فوري لكربلاء 🚚✨',
            url: '/products?filter=offers',
            tag: 'welcome-new-user-' + user.id,
            soundType: 'merchant',
          });
          return;
        }
      }

      // 2. Check for returning customer who has been absent for > 7 days
      if (lastVisit && now - lastVisit >= ABSENCE_THRESHOLD_MS) {
        const userName = user?.name ? `يا ${user.name.split(' ')[0]}` : 'يا غالي';
        sendSystemNotification({
          title: `❤️ مشتاقين لشوفتك ${userName}!`,
          body: 'أهلاً بعودتك لسوق الجملة! جهّزنا لك عروض وتخفيضات وبضائع جديدة ومميزة بانتظارك اليوم ✨🛍️',
          url: '/products?filter=offers',
          tag: 'welcome-back-' + Math.floor(now / (24 * 60 * 60 * 1000)),
          soundType: 'delivered',
        });
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [user]);

  return null;
}

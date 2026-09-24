'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AccountType, MerchantStatus, RegisterMerchantData } from '@/types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isApprovedMerchant: boolean;
  isPendingMerchant: boolean;
  isApprovedMarket: boolean;
  isPendingMarket: boolean;
  isPendingApproval: boolean;
  login: (identifier: string, password?: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  registerIndividual: (name: string, phone: string, password?: string, email?: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  registerMarket: (data: {
    name: string;
    phone: string;
    password?: string;
    email?: string;
    businessName: string;
    address?: string;
    city?: string;
    storefrontImage?: string;
    lat?: number;
    lng?: number;
    mapsUrl?: string;
  }) => Promise<{ success: boolean; error?: string; message?: string; user?: User }>;
  registerWholesale: (data: RegisterMerchantData) => Promise<{ success: boolean; error?: string; message?: string; user?: User }>;
  registerMerchant: (data: any) => Promise<{ success: boolean; error?: string; message?: string; user?: User }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<{ success: boolean; error?: string; user?: User }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const saveUserToStorage = (userData: User | null, token?: string) => {
    setUser(userData);
    if (userData) {
      try {
        const safeUser = { ...userData };
        if (safeUser.storefrontImage && safeUser.storefrontImage.startsWith('data:image/')) {
          safeUser.storefrontImage = '';
        }
        localStorage.setItem('etihad_user_iq', JSON.stringify(safeUser));
        if (token) {
          localStorage.setItem('etihad_customer_token', token);
        }
      } catch (err) {
        console.warn('LocalStorage save warning:', err);
      }
    } else {
      try {
        localStorage.removeItem('etihad_user_iq');
        localStorage.removeItem('etihad_customer_token');
      } catch {}
    }
  };

  const refreshUser = async () => {
    try {
      const saved = localStorage.getItem('etihad_user_iq');
      const currentUser = user || (saved ? JSON.parse(saved) : null);
      if (currentUser) {
        const token = typeof window !== 'undefined' ? localStorage.getItem('etihad_customer_token') : null;
        const res = await fetch('/api/auth', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data.success && data.user) {
          saveUserToStorage(data.user);
        } else {
          // If user deleted or reset from database, clear storage!
          saveUserToStorage(null);
        }
      }
    } catch (e) {
      console.error('Error refreshing user status:', e);
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem('etihad_user_iq');
      if (saved) {
        const parsed = JSON.parse(saved);
        setUser(parsed);
        // Automatically sync and verify fresh status from server in background
        const token = typeof window !== 'undefined' ? localStorage.getItem('etihad_customer_token') : null;
        fetch('/api/auth', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.user) {
              saveUserToStorage(data.user);
            } else {
              // If user was deleted or reset from database, log out immediately!
              saveUserToStorage(null);
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  }, []);

  const login = async (identifier: string, password?: string) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', identifier, password }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        saveUserToStorage(data.user, data.token);
        return { success: true, user: data.user };
      } else {
        return { success: false, error: data.error || 'فشل تسجيل الدخول' };
      }
    } catch (err: any) {
      return { success: false, error: 'حدث خطأ في الاتصال' };
    }
  };

  const registerIndividual = async (name: string, phone: string, password?: string, email?: string) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          name,
          email: email || undefined,
          phone,
          password: password || undefined,
          accountType: 'individual',
        }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        saveUserToStorage(data.user, data.token);
        return { success: true, user: data.user };
      } else {
        return { success: false, error: data.error || 'فشل التسجيل' };
      }
    } catch {
      return { success: false, error: 'حدث خطأ أثناء إنشاء الحساب' };
    }
  };

  const registerMarket = async (data: {
    name: string;
    email?: string;
    phone: string;
    businessName: string;
    address?: string;
    city?: string;
    password?: string;
    storefrontImage?: string;
    lat?: number;
    lng?: number;
    mapsUrl?: string;
  }) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          name: data.name,
          email: data.email || undefined,
          phone: data.phone,
          password: data.password || undefined,
          accountType: 'market',
          businessName: data.businessName,
          city: data.city || 'كربلاء المقدسة',
          address: data.address || '',
          storefrontImage: data.storefrontImage,
          lat: data.lat,
          lng: data.lng,
          mapsUrl: data.mapsUrl,
        }),
      });
      const resData = await res.json();
      if (resData.success && resData.user) {
        saveUserToStorage(resData.user, resData.token);
        return {
          success: true,
          message: resData.message,
          user: resData.user,
        };
      } else {
        return {
          success: false,
          error: resData.error || 'فشل إنشاء حساب الماركت',
        };
      }
    } catch {
      return { success: false, error: 'حدث خطأ أثناء إنشاء الحساب' };
    }
  };

  const registerWholesale = async (data: RegisterMerchantData) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          name: data.name,
          email: data.email || undefined,
          phone: data.phone,
          password: data.password || undefined,
          accountType: 'wholesale',
          businessName: data.businessName,
          businessType: data.businessType,
          city: data.city,
          address: data.address,
          lat: data.lat,
          lng: data.lng,
          mapsUrl: data.mapsUrl,
        }),
      });
      const resData = await res.json();
      if (resData.success && resData.user) {
        saveUserToStorage(resData.user, resData.token);
        return {
          success: true,
          message: resData.message,
          user: resData.user,
        };
      } else {
        return {
          success: false,
          error: resData.error || 'فشل تقديم طلب تاجر الجملة',
        };
      }
    } catch {
      return { success: false, error: 'حدث خطأ أثناء تقديم الطلب' };
    }
  };

  const registerMerchant = registerWholesale;

  const updateProfile = async (updates: Partial<User>) => {
    if (!user) return { success: false, error: 'غير مسجل الدخول' };
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('etihad_customer_token') : null;
      const res = await fetch('/api/auth', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        saveUserToStorage(data.user, data.token);
        return { success: true, user: data.user };
      } else {
        return { success: false, error: data.error || 'فشل تحديث البيانات' };
      }
    } catch {
      return { success: false, error: 'حدث خطأ في الاتصال' };
    }
  };

  const logout = () => {
    try {
      localStorage.removeItem('etihad_food_cart_iq');
      localStorage.removeItem('etihad_food_coupon_iq');
      localStorage.removeItem('etihad_cart_guest');
      localStorage.removeItem('etihad_coupon_guest');
      localStorage.removeItem('etihad_customer_token');
      fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      }).catch(() => {});
    } catch {}
    saveUserToStorage(null);
  };

  const isWholesale = user?.accountType === 'wholesale' || user?.accountType === 'merchant';
  const isMarket = user?.accountType === 'market';
  const isApprovedMerchant = (isWholesale || isMarket) && user?.merchantStatus === 'approved';
  const isPendingMerchant = isWholesale && user?.merchantStatus === 'pending';
  const isApprovedMarket = isMarket && user?.merchantStatus === 'approved';
  const isPendingMarket = isMarket && user?.merchantStatus === 'pending';
  const isPendingApproval = (isWholesale || isMarket) && user?.merchantStatus === 'pending';

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isApprovedMerchant,
        isPendingMerchant,
        isApprovedMarket,
        isPendingMarket,
        isPendingApproval,
        login,
        registerIndividual,
        registerMarket,
        registerWholesale,
        registerMerchant,
        logout,
        refreshUser,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

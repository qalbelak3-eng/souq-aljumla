'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { CartItem, Product, Coupon, SaleType, User } from '@/types';
import { getProductPriceForUser } from '@/lib/pricing';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';

import { getEffectiveDeliveryFee } from '@/lib/delivery';

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number, saleType?: SaleType) => void;
  removeFromCart: (productId: string, saleType: SaleType) => void;
  updateQuantity: (productId: string, quantity: number, saleType: SaleType) => void;
  clearCart: () => void;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  totalItemsCount: number;
  appliedCoupon: Coupon | null;
  applyCoupon: (code: string) => Promise<{ success: boolean; message: string }>;
  removeCoupon: () => void;
  isCartDrawerOpen: boolean;
  setIsCartDrawerOpen: (open: boolean) => void;
  freeDeliveryThreshold: number;
  amountNeededForFreeDelivery: number;
  isFreeDelivery: boolean;
  minOrderAmount: number;
  amountNeededForMinOrder: number;
  isBelowMinOrder: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const toast = useToast();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const prevUserKeyRef = useRef<string | null>(null);
  const [storeSettings, setStoreSettings] = useState<{ deliveryFee: number; freeDeliveryThreshold: number; minOrderAmount: number }>({
    deliveryFee: 5000,
    freeDeliveryThreshold: 50000,
    minOrderAmount: 10000,
  });

  const getCartStorageKey = (userId?: string | null) => {
    return userId ? `etihad_cart_user_${userId}` : 'etihad_cart_guest';
  };

  const getCouponStorageKey = (userId?: string | null) => {
    return userId ? `etihad_coupon_user_${userId}` : 'etihad_coupon_guest';
  };

  const loadCartFromKey = (storageKey: string, activeUser?: User | null): CartItem[] => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((item: any) => item && item.product && item.product.id)
            .map((item: any) => {
              const { price: newPrice } = getProductPriceForUser(item.product, item.saleType || 'retail', activeUser);
              return {
                ...item,
                pricePerUnit: newPrice,
              };
            });
        }
      }
    } catch (e) {
      console.error('Failed to load cart from', storageKey, e);
    }
    return [];
  };

  const loadCouponFromKey = (storageKey: string): Coupon | null => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  };

  // Fetch settings dynamically from server
  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.settings) {
          setStoreSettings({
            deliveryFee: Number(data.settings.deliveryFee) ?? 5000,
            freeDeliveryThreshold: Number(data.settings.freeDeliveryThreshold) ?? 50000,
            minOrderAmount: Number(data.settings.minOrderAmount) ?? 10000,
          });
        }
      })
      .catch((err) => console.error('Failed to load store settings in cart:', err));
  }, []);

  // Synchronize cart with active user session (per-user isolation)
  useEffect(() => {
    if (isAuthLoading) return;

    const currentKey = user?.id ? user.id : 'guest';

    // Initial load
    if (prevUserKeyRef.current === null) {
      prevUserKeyRef.current = currentKey;
      const currentStorageKey = getCartStorageKey(user?.id);
      let loadedCart = loadCartFromKey(currentStorageKey, user);

      // Check legacy global key if user cart is empty
      if (loadedCart.length === 0) {
        const legacyCart = loadCartFromKey('etihad_food_cart_iq', user);
        if (legacyCart.length > 0) {
          loadedCart = legacyCart;
        }
      }
      // Always remove legacy global key to prevent cross-account pollution
      try {
        localStorage.removeItem('etihad_food_cart_iq');
        localStorage.removeItem('etihad_food_coupon_iq');
      } catch {}

      setCart(loadedCart);
      setAppliedCoupon(loadCouponFromKey(getCouponStorageKey(user?.id)));
      setIsInitialized(true);
      return;
    }

    // Active session changed (login, logout, or account switch)
    if (prevUserKeyRef.current !== currentKey) {
      const previousKey = prevUserKeyRef.current;
      prevUserKeyRef.current = currentKey;

      if (currentKey === 'guest') {
        // User logged out: clear active cart and guest storage so it doesn't leak
        setCart([]);
        setAppliedCoupon(null);
        try {
          localStorage.removeItem('etihad_cart_guest');
          localStorage.removeItem('etihad_coupon_guest');
        } catch {}
      } else if (previousKey === 'guest') {
        // Visitor logged in: if guest had items, transfer them to user if user cart is empty
        const userCart = loadCartFromKey(getCartStorageKey(user?.id), user);
        if (cart.length > 0 && userCart.length === 0) {
          const updatedCart = cart.map((item) => {
            const { price: newPrice } = getProductPriceForUser(item.product, item.saleType, user);
            return { ...item, pricePerUnit: newPrice };
          });
          setCart(updatedCart);
          try {
            localStorage.setItem(getCartStorageKey(user?.id), JSON.stringify(updatedCart));
            localStorage.removeItem('etihad_cart_guest');
          } catch {}
        } else {
          setCart(userCart);
          setAppliedCoupon(loadCouponFromKey(getCouponStorageKey(user?.id)));
        }
      } else {
        // Switched between two different accounts
        const newUserCart = loadCartFromKey(getCartStorageKey(user?.id), user);
        setCart(newUserCart);
        setAppliedCoupon(loadCouponFromKey(getCouponStorageKey(user?.id)));
      }
    }
  }, [user?.id, isAuthLoading]);

  // Save cart to active user / guest storage
  useEffect(() => {
    if (!isInitialized || isAuthLoading) return;
    const storageKey = getCartStorageKey(user?.id);
    const couponKey = getCouponStorageKey(user?.id);

    try {
      localStorage.setItem(storageKey, JSON.stringify(cart));
      if (appliedCoupon) {
        localStorage.setItem(couponKey, JSON.stringify(appliedCoupon));
      } else {
        localStorage.removeItem(couponKey);
      }
    } catch (e) {
      console.error('Failed to save cart to storage', e);
    }
  }, [cart, appliedCoupon, isInitialized, user?.id, isAuthLoading]);

  const addToCart = (product: Product, quantity = 1, saleType: SaleType = 'retail') => {
    if (!product || !product.id) return;

    let activeUser = user;
    if (!activeUser) {
      try {
        const saved = localStorage.getItem('etihad_user_iq');
        if (saved) activeUser = JSON.parse(saved);
      } catch {}
    }

    const { price: pricePerUnit } = getProductPriceForUser(product, saleType, activeUser);
    const unitLabel = saleType === 'wholesale' ? product.wholesaleUnit : product.retailUnit;

    setCart((prev) => {
      const validPrev = prev.filter((item) => item && item.product && item.product.id);
      const existingIndex = validPrev.findIndex(
        (item) => item.product.id === product.id && item.saleType === saleType
      );

      if (existingIndex > -1) {
        const newCart = [...validPrev];
        newCart[existingIndex].quantity += quantity;
        newCart[existingIndex].pricePerUnit = pricePerUnit;
        return newCart;
      } else {
        return [...validPrev, { product, quantity, saleType, pricePerUnit, unitLabel }];
      }
    });
  };

  const removeFromCart = (productId: string, saleType: SaleType) => {
    setCart((prev) =>
      prev.filter((item) => item && item.product && !(item.product.id === productId && item.saleType === saleType))
    );
  };

  const updateQuantity = (productId: string, quantity: number, saleType: SaleType) => {
    if (quantity <= 0) {
      removeFromCart(productId, saleType);
      return;
    }

    setCart((prev) =>
      prev.map((item) => {
        if (item && item.product && item.product.id === productId && item.saleType === saleType) {
          return { ...item, quantity };
        }
        return item;
      })
    );
  };

  const clearCart = () => {
    setCart([]);
    setAppliedCoupon(null);
    try {
      const storageKey = getCartStorageKey(user?.id);
      const couponKey = getCouponStorageKey(user?.id);
      localStorage.removeItem(storageKey);
      localStorage.removeItem(couponKey);
      localStorage.removeItem('etihad_food_cart_iq');
      localStorage.removeItem('etihad_food_coupon_iq');
    } catch {}
  };

  const validCart = cart.filter((item) => item && item.product && item.product.id);
  const subtotal = validCart.reduce((acc, item) => acc + (Number(item.pricePerUnit) || 0) * (Number(item.quantity) || 0), 0);
  const totalItemsCount = validCart.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);

  // Dynamic Free Delivery & Minimum Order Calculation
  const isFreeDelivery = subtotal >= storeSettings.freeDeliveryThreshold && subtotal > 0;
  const deliveryFee = getEffectiveDeliveryFee(subtotal, storeSettings, user);
  const amountNeededForFreeDelivery = Math.max(0, storeSettings.freeDeliveryThreshold - subtotal);
  const minOrderAmount = storeSettings.minOrderAmount || 10000;
  const isBelowMinOrder = subtotal > 0 && subtotal < minOrderAmount;
  const amountNeededForMinOrder = Math.max(0, minOrderAmount - subtotal);

  let discount = 0;
  if (appliedCoupon && subtotal > 0) {
    if (appliedCoupon.discountType === 'percentage') {
      discount = Math.round((subtotal * appliedCoupon.discountValue) / 100);
    } else {
      discount = Math.min(subtotal, appliedCoupon.discountValue);
    }
  }

  const total = Math.max(0, subtotal - discount + deliveryFee);

  const applyCoupon = async (code: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal, userAccountType: user?.accountType }),
      });
      const data = await res.json();
      if (data.success && data.coupon) {
        setAppliedCoupon(data.coupon);
        return { success: true, message: data.message };
      } else {
        return { success: false, message: data.error || 'كوبون الخصم غير صالح' };
      }
    } catch {
      return { success: false, message: 'حدث خطأ أثناء فحص الكوبون' };
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
  };

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        subtotal,
        deliveryFee,
        discount,
        total,
        totalItemsCount,
        appliedCoupon,
        applyCoupon,
        removeCoupon,
        isCartDrawerOpen,
        setIsCartDrawerOpen,
        freeDeliveryThreshold: storeSettings.freeDeliveryThreshold,
        amountNeededForFreeDelivery,
        isFreeDelivery,
        minOrderAmount,
        amountNeededForMinOrder,
        isBelowMinOrder,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

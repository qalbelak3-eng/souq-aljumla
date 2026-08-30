'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem, Product, Coupon, SaleType, User } from '@/types';
import { getProductPriceForUser } from '@/lib/pricing';
import { useToast } from '@/context/ToastContext';

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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [storeSettings, setStoreSettings] = useState<{ deliveryFee: number; freeDeliveryThreshold: number; minOrderAmount: number }>({
    deliveryFee: 5000,
    freeDeliveryThreshold: 50000,
    minOrderAmount: 10000,
  });

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

  useEffect(() => {
    try {
      const savedCart = localStorage.getItem('etihad_food_cart_iq');
      if (savedCart) {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed)) {
          setCart(parsed.filter((item: any) => item && item.product && item.product.id));
        }
      }
      const savedCoupon = localStorage.getItem('etihad_food_coupon_iq');
      if (savedCoupon) {
        setAppliedCoupon(JSON.parse(savedCoupon));
      }
    } catch (e) {
      console.error('Failed to load cart from storage', e);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    try {
      localStorage.setItem('etihad_food_cart_iq', JSON.stringify(cart));
      if (appliedCoupon) {
        localStorage.setItem('etihad_food_coupon_iq', JSON.stringify(appliedCoupon));
      } else {
        localStorage.removeItem('etihad_food_coupon_iq');
      }
    } catch (e) {
      console.error('Failed to save cart to storage', e);
    }
  }, [cart, appliedCoupon, isInitialized]);

  const addToCart = (product: Product, quantity = 1, saleType: SaleType = 'retail') => {
    if (!product || !product.id) return;
    let authUser: User | null = null;
    try {
      const saved = localStorage.getItem('etihad_auth_user');
      if (saved) authUser = JSON.parse(saved);
    } catch {}

    const { price: pricePerUnit } = getProductPriceForUser(product, saleType, authUser);
    const unitLabel = saleType === 'wholesale' ? product.wholesaleUnit : product.retailUnit;

    setCart((prev) => {
      const validPrev = prev.filter((item) => item && item.product && item.product.id);
      const existingIndex = validPrev.findIndex(
        (item) => item.product.id === product.id && item.saleType === saleType
      );

      if (existingIndex > -1) {
        const newCart = [...validPrev];
        newCart[existingIndex].quantity += quantity;
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
  };

  const validCart = cart.filter((item) => item && item.product && item.product.id);
  const subtotal = validCart.reduce((acc, item) => acc + (Number(item.pricePerUnit) || 0) * (Number(item.quantity) || 0), 0);
  const totalItemsCount = validCart.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);

  // Dynamic Free Delivery & Minimum Order Calculation
  const isFreeDelivery = subtotal >= storeSettings.freeDeliveryThreshold && subtotal > 0;
  const deliveryFee = isFreeDelivery || subtotal === 0 ? 0 : storeSettings.deliveryFee;
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
        body: JSON.stringify({ code, subtotal }),
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

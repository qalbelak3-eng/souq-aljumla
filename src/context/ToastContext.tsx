'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
  url?: string;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, title?: string, duration?: number, url?: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string, duration: number = 3500, url?: string) => {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
      const newToast: ToastItem = { id, type, title, message, duration, url };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  // NOTE: souq-live-system-alert is now handled directly in admin/layout.tsx
  // to avoid double-toasting. ToastContext is used by store pages only.

  const success = useCallback(
    (message: string, title?: string) => showToast(message, 'success', title),
    [showToast]
  );
  const error = useCallback(
    (message: string, title?: string) => showToast(message, 'error', title),
    [showToast]
  );
  const warning = useCallback(
    (message: string, title?: string) => showToast(message, 'warning', title),
    [showToast]
  );
  const info = useCallback(
    (message: string, title?: string) => showToast(message, 'info', title),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}

      {/* Modern Floating Toasts Container (clearly visible at the top of the screen) */}
      <div className="fixed top-20 sm:top-24 left-1/2 -translate-x-1/2 z-[999999] flex flex-col items-center gap-2.5 w-full max-w-md px-4 pointer-events-none">
        {toasts.map((toast) => {
          let bgClass = 'bg-white/95 text-slate-900 border-slate-200 shadow-xl';
          let icon = <Info className="w-5 h-5 text-blue-500 shrink-0" />;

          if (toast.type === 'success') {
            bgClass = 'bg-white/95 text-slate-900 border-emerald-300 shadow-xl shadow-emerald-500/10';
            icon = <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />;
          } else if (toast.type === 'error') {
            bgClass = 'bg-white/95 text-slate-900 border-red-300 shadow-xl shadow-red-500/10';
            icon = <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />;
          } else if (toast.type === 'warning') {
            bgClass = 'bg-white/95 text-slate-900 border-amber-300 shadow-xl shadow-amber-500/10';
            icon = <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />;
          }

          return (
            <div
              key={toast.id}
              onClick={() => {
                if (toast.url && typeof window !== 'undefined') {
                  window.location.href = toast.url;
                }
              }}
              className={`pointer-events-auto w-full p-3.5 sm:p-4 rounded-2xl border backdrop-blur-md flex items-start gap-3 transition-all transform animate-in slide-in-from-top-4 fade-in duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.99] ${bgClass}`}
            >
              {icon}

              <div className="flex-1 text-right text-xs">
                {toast.title && <div className="font-black mb-0.5 text-[13px] text-slate-900">{toast.title}</div>}
                <div className="font-bold text-slate-700 leading-relaxed">{toast.message}</div>
                {toast.url && (
                  <span className="text-[10px] text-brand-blue font-bold inline-block mt-1 underline">
                    انقر للانتقال المباشر ↗
                  </span>
                )}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(toast.id);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition shrink-0 cursor-pointer"
                title="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: (msg: string) => console.log(msg),
      success: (msg: string) => console.log(msg),
      error: (msg: string) => console.log(msg),
      warning: (msg: string) => console.log(msg),
      info: (msg: string) => console.log(msg),
    };
  }
  return context;
}


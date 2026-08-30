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
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => void;
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
    (message: string, type: ToastType = 'info', title?: string, duration: number = 3500) => {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
      const newToast: ToastItem = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

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

      {/* Modern Floating Toasts Container (clearly visible below navbar tabs) */}
      <div className="fixed top-24 sm:top-28 left-1/2 -translate-x-1/2 z-[99999] flex flex-col items-center gap-2.5 w-full max-w-md px-4 pointer-events-none">
        {toasts.map((toast) => {
          let bgClass = 'bg-white/95 text-slate-900 border-slate-200';
          let icon = <Info className="w-5 h-5 text-blue-500 shrink-0" />;

          if (toast.type === 'success') {
            bgClass = 'bg-white/95 text-slate-900 border-emerald-300 shadow-emerald-500/10';
            icon = <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />;
          } else if (toast.type === 'error') {
            bgClass = 'bg-white/95 text-slate-900 border-red-300 shadow-red-500/10';
            icon = <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />;
          } else if (toast.type === 'warning') {
            bgClass = 'bg-white/95 text-slate-900 border-amber-300 shadow-amber-500/10';
            icon = <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />;
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto w-full p-3.5 sm:p-4 rounded-2xl border shadow-xl backdrop-blur-md flex items-start gap-3 transition-all transform animate-in slide-in-from-top-4 fade-in duration-200 ${bgClass}`}
            >
              {icon}

              <div className="flex-1 text-right text-xs">
                {toast.title && <div className="font-black mb-0.5 text-[13px]">{toast.title}</div>}
                <div className="font-bold text-slate-700 leading-relaxed">{toast.message}</div>
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition shrink-0 cursor-pointer"
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


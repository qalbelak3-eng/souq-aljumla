'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AlertTriangle, Trash2, HelpCircle, CheckCircle2, X } from 'lucide-react';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info' | 'success';
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ message: '' });
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions | string): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const normalizedOpts: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts;
      setOptions(normalizedOpts);
      setResolver(() => resolve);
      setIsOpen(true);
    });
  }, []);

  const handleConfirm = () => {
    setIsOpen(false);
    if (resolver) resolver(true);
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (resolver) resolver(false);
  };

  const type = options.type || 'danger';

  let icon = <Trash2 className="w-8 h-8 text-rose-600 animate-pulse" />;
  let headerBg = 'bg-rose-50 text-rose-700 border-rose-200';
  let confirmBtnClass = 'bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-700 hover:to-red-800 text-white shadow-rose-500/25';

  if (type === 'warning') {
    icon = <AlertTriangle className="w-8 h-8 text-amber-600" />;
    headerBg = 'bg-amber-50 text-amber-700 border-amber-200';
    confirmBtnClass = 'bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white shadow-amber-500/25';
  } else if (type === 'info') {
    icon = <HelpCircle className="w-8 h-8 text-blue-600" />;
    headerBg = 'bg-blue-50 text-blue-700 border-blue-200';
    confirmBtnClass = 'bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white shadow-blue-500/25';
  } else if (type === 'success') {
    icon = <CheckCircle2 className="w-8 h-8 text-emerald-600" />;
    headerBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    confirmBtnClass = 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white shadow-emerald-500/25';
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {isOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 select-none"
          style={{ zIndex: 99999999 }}
          dir="rtl"
        >
          {/* Strong Full-Screen Backdrop covering all headers and tabs */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
            style={{ zIndex: 99999998 }}
            onClick={handleCancel}
          />

          {/* Dialog Modal Card */}
          <div
            className="relative bg-white w-full max-w-sm sm:max-w-md rounded-3xl shadow-2xl border-2 border-slate-200 p-6 sm:p-8 text-center transform animate-in zoom-in-95 duration-200"
            style={{ zIndex: 99999999 }}
          >
            {/* Close Button (X) */}
            <button
              type="button"
              onClick={handleCancel}
              className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Icon Circle */}
            <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 border-2 border-red-200 bg-red-50 text-red-600 shadow-inner">
              {type === 'warning' ? (
                <AlertTriangle className="w-8 h-8 text-amber-600" />
              ) : type === 'info' ? (
                <HelpCircle className="w-8 h-8 text-blue-600" />
              ) : type === 'success' ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              ) : (
                <Trash2 className="w-8 h-8 text-red-600 animate-bounce" />
              )}
            </div>

            {/* Title */}
            <h3 className="text-lg sm:text-xl font-black text-slate-900 mb-2">
              {options.title || (type === 'danger' ? 'تأكيد الحذف' : 'تأكيد الإجراء')}
            </h3>

            {/* Message */}
            <p className="text-xs sm:text-sm font-bold text-slate-700 leading-relaxed mb-6 whitespace-pre-line px-2">
              {options.message}
            </p>

            {/* Action Buttons with 100% visible solid colors */}
            <div className="flex items-center gap-3">
              {/* Primary Action Button (e.g. Red for Delete) */}
              <button
                type="button"
                onClick={handleConfirm}
                className={`flex-1 py-3.5 px-4 rounded-2xl font-black text-xs sm:text-sm text-white shadow-lg transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${
                  type === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/30'
                    : type === 'info'
                    ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/30'
                    : type === 'success'
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30'
                    : 'bg-red-600 hover:bg-red-700 active:bg-red-800 shadow-red-600/30'
                }`}
              >
                {options.confirmText || (type === 'danger' ? 'نعم، احذف' : 'نعم، متابعة')}
              </button>

              {/* Cancel Button */}
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 py-3.5 px-4 rounded-2xl font-black text-xs sm:text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {options.cancelText || 'إلغاء الأمر'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    return {
      confirm: async (opts: ConfirmOptions | string) => {
        const msg = typeof opts === 'string' ? opts : opts.message;
        return typeof window !== 'undefined' ? window.confirm(msg) : true;
      },
    };
  }
  return context;
}
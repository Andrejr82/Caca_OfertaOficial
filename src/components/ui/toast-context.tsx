"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { X } from "lucide-react";

export interface ToastOptions {
  id?: string;
  title: string;
  description?: string;
  imageUrl?: string | null;
  actionText?: string;
  onAction?: () => void;
  duration?: number;
}

interface Toast extends ToastOptions {
  id: string;
}

interface ToastContextType {
  showToast: (options: ToastOptions) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast deve ser usado dentro de um ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((options: ToastOptions) => {
    const id = options.id || Math.random().toString(36).substring(2, 9);
    const duration = options.duration ?? 8000;

    setToasts((prev) => {
      // Evita toasts duplicados com o mesmo ID (por exemplo, mesma oferta disparando repetido)
      if (prev.some((t) => t.id === id)) return prev;
      return [...prev, { ...options, id }];
    });

    if (duration > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, duration);
    }
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {/* Container flutuante para os toasts */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 w-full max-w-md pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex w-full items-start gap-4 rounded-lg border border-moss/10 bg-white p-4 shadow-xl ring-1 ring-black/5 transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 md:slide-in-from-right-5"
            role="alert"
          >
            {/* Thumbnail do produto se disponível */}
            {toast.imageUrl && (
              <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border border-moss/10 bg-gray-50">
                <img
                  src={toast.imageUrl}
                  alt={toast.title}
                  className="h-full w-full object-cover object-center"
                />
              </div>
            )}

            <div className="flex-1">
              <h3 className="text-sm font-black text-ink">{toast.title}</h3>
              {toast.description && (
                <p className="mt-1 text-xs text-ink/70 line-clamp-2 leading-relaxed">
                  {toast.description}
                </p>
              )}
              {toast.actionText && toast.onAction && (
                <button
                  onClick={() => {
                    toast.onAction?.();
                    dismissToast(toast.id);
                  }}
                  className="focus-ring mt-2 inline-flex items-center gap-1 rounded bg-moss/10 px-2 py-1 text-xs font-bold text-moss transition-colors hover:bg-moss/20"
                >
                  {toast.actionText}
                </button>
              )}
            </div>

            <button
              onClick={() => dismissToast(toast.id)}
              className="text-ink/40 transition-colors hover:text-ink/80 focus:outline-none"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

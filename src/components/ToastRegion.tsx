import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function ToastRegion() {
  const { toasts, dismissToast, announcement } = useApp();

  return (
    <>
      {/* Screen-reader live announcer for dynamic booking & language changes */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <div
        className="fixed bottom-4 inset-inline-end-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none no-print"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-xl border p-3.5 shadow-lg flex items-start gap-3 text-sm font-medium ${
              t.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950 dark:bg-emerald-950 dark:border-emerald-700 dark:text-emerald-100'
                : t.type === 'error'
                  ? 'bg-red-50 border-red-300 text-red-950 dark:bg-red-950 dark:border-red-700 dark:text-red-100'
                  : 'bg-white border-slate-200 text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100'
            }`}
          >
            {t.type === 'success' && (
              <CheckCircle2 className="w-5 h-5 text-[#21A675] shrink-0 mt-0.5" aria-hidden="true" />
            )}
            {t.type === 'error' && (
              <AlertCircle className="w-5 h-5 text-[#DC5960] shrink-0 mt-0.5" aria-hidden="true" />
            )}
            {t.type === 'info' && (
              <Info className="w-5 h-5 text-[#087F8C] shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss"
              className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

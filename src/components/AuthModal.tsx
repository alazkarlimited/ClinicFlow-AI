import React, { useEffect, useRef } from 'react';
import { ShieldCheck, UserCheck, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';

export function AuthModal() {
  const { t } = useTranslation();
  const {
    showAuthModal,
    setShowAuthModal,
    signInGoogle,
    switchDemoRole,
    navigate,
  } = useApp();

  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (showAuthModal) {
      closeBtnRef.current?.focus();
    }
  }, [showAuthModal]);

  useEffect(() => {
    if (!showAuthModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAuthModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showAuthModal, setShowAuthModal]);

  if (!showAuthModal) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2
              id="auth-modal-title"
              className="text-xl font-bold text-[#14283F] dark:text-white"
            >
              {t('auth.authRequiredTitle')}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {t('auth.authRequiredBody')}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={() => setShowAuthModal(false)}
            aria-label={t('common.close')}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={signInGoogle}
          className="w-full min-h-[48px] px-4 rounded-xl bg-[#14283F] hover:bg-[#1e3a5a] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
        >
          <ShieldCheck className="w-5 h-5 text-teal-300" aria-hidden="true" />
          <span>{t('auth.googleSignIn')}</span>
        </button>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {t('auth.demoSectionTitle')}
          </p>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => {
                switchDemoRole('patient');
                setShowAuthModal(false);
              }}
              className="w-full min-h-[44px] px-4 rounded-xl bg-[#087F8C] hover:bg-[#066873] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <UserCheck className="w-4 h-4" aria-hidden="true" />
              <span>{t('auth.continueAsDemoPatient')}</span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  switchDemoRole('receptionist');
                  setShowAuthModal(false);
                  navigate('reception');
                }}
                className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {t('auth.roleReceptionist')}
              </button>
              <button
                type="button"
                onClick={() => {
                  switchDemoRole('admin');
                  setShowAuthModal(false);
                  navigate('admin');
                }}
                className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {t('auth.roleAdmin')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { ClinicLogo } from './ClinicLogo';

export function Footer() {
  const { t } = useTranslation();
  const { navigate, language } = useApp();

  return (
    <footer className="no-print mt-16 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <ClinicLogo />
              <span className="font-bold text-lg text-[#14283F] dark:text-white">
                {language === 'ar-EG' ? 'كلينيك فلو AI' : 'ClinicFlow AI'}
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm leading-relaxed">
              {t('brand.tagline')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('common.footerTimezone')}
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-bold text-[#14283F] dark:text-white">
              {language === 'ar-EG' ? 'الروابط السريعة' : 'Quick Links'}
            </h2>
            <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
              <li>
                <button
                  type="button"
                  onClick={() => navigate('specialties')}
                  className="hover:text-[#087F8C] dark:hover:text-teal-300 py-1"
                >
                  {t('nav.specialties')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('doctors')}
                  className="hover:text-[#087F8C] dark:hover:text-teal-300 py-1"
                >
                  {t('nav.doctors')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('book')}
                  className="hover:text-[#087F8C] dark:hover:text-teal-300 py-1"
                >
                  {t('nav.book')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('assistant')}
                  className="hover:text-[#087F8C] dark:hover:text-teal-300 py-1"
                >
                  {t('nav.assistant')}
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-bold text-[#14283F] dark:text-white">
              {t('nav.about')}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {t('home.accessibilityDesc')}
            </p>
            <button
              type="button"
              onClick={() => navigate('about')}
              className="text-sm font-semibold text-[#087F8C] dark:text-teal-300 hover:underline py-1"
            >
              {t('nav.about')}
            </button>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{t('common.footerRights')}</span>
          <span>WCAG 2.2 AA · RTL / LTR</span>
        </div>
      </div>
    </footer>
  );
}

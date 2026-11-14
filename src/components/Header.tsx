import React, { useState } from 'react';
import {
  Eye,
  Globe,
  LogIn,
  Menu,
  Moon,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp, type AppRoute } from '../context/AppContext';
import type { UserRole } from '../shared/types';
import { ClinicLogo } from './ClinicLogo';

export function Header() {
  const { t } = useTranslation();
  const {
    route,
    navigate,
    language,
    toggleLanguage,
    theme,
    toggleTheme,
    elderlyMode,
    toggleElderlyMode,
    activeRole,
    demoMode,
    switchDemoRole,
    firebaseUser,
    signOutAll,
    setShowAuthModal,
  } = useApp();

  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: Array<{ route: AppRoute; label: string }> = [
    { route: 'home', label: t('nav.home') },
    { route: 'specialties', label: t('nav.specialties') },
    { route: 'doctors', label: t('nav.doctors') },
    { route: 'book', label: t('nav.book') },
    { route: 'assistant', label: t('nav.assistant') },
  ];

  const handleNav = (r: AppRoute) => {
    setMobileOpen(false);
    navigate(r);
  };

  const rolePortals: Array<{ role: UserRole; route: AppRoute; label: string }> = [
    { role: 'patient', route: 'patient', label: t('nav.patientPortal') },
    { role: 'receptionist', route: 'reception', label: t('nav.reception') },
    { role: 'admin', route: 'admin', label: t('nav.admin') },
  ];

  const demoRoles: Array<{ role: UserRole; label: string }> = [
    { role: 'guest', label: t('auth.roleGuest') },
    { role: 'patient', label: t('auth.rolePatient') },
    { role: 'receptionist', label: t('auth.roleReceptionist') },
    { role: 'admin', label: t('auth.roleAdmin') },
  ];

  const portalForActiveRole: AppRoute | null =
    activeRole === 'admin'
      ? 'admin'
      : activeRole === 'receptionist'
        ? 'reception'
        : activeRole === 'patient'
          ? 'patient'
          : null;

  return (
    <div className="no-print">
      <a href="#main-content" className="skip-link">
        {t('nav.skipToContent')}
      </a>

      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 xl:gap-6">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => handleNav('home')}
            className="flex items-center gap-2.5 text-start whitespace-nowrap shrink-0 rounded-lg p-1 hover:opacity-90 transition-opacity"
          >
            <ClinicLogo />
            <span className="text-lg font-bold tracking-tight text-[#14283F] dark:text-white">
              {language === 'ar-EG' ? 'كلينيك فلو' : 'ClinicFlow AI'}
            </span>
          </button>

          {/* Zone 2: Concise single-line navigation links */}
          <nav
            aria-label={language === 'ar-EG' ? 'التنقل الرئيسي' : 'Primary Navigation'}
            className="hidden lg:flex items-center gap-3.5 xl:gap-6"
          >
            {navItems.map((item) => {
              const active = route === item.route;
              return (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => handleNav(item.route)}
                  aria-current={active ? 'page' : undefined}
                  className={`py-2 text-sm font-semibold whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                    active
                      ? 'border-[#087F8C] text-[#087F8C] dark:text-teal-300 dark:border-teal-400'
                      : 'border-transparent text-slate-700 dark:text-slate-300 hover:text-[#14283F] dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
            {portalForActiveRole && (
              <button
                type="button"
                onClick={() => handleNav(portalForActiveRole)}
                aria-current={route === portalForActiveRole ? 'page' : undefined}
                className={`py-2 text-sm font-semibold whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                  route === portalForActiveRole
                    ? 'border-[#087F8C] text-[#087F8C] dark:text-teal-300 dark:border-teal-400'
                    : 'border-transparent text-slate-700 dark:text-slate-300 hover:text-[#14283F] dark:hover:text-white'
                }`}
              >
                {rolePortals.find((p) => p.route === portalForActiveRole)?.label}
              </button>
            )}
          </nav>

          {/* Zone 3: Language Switcher + Primary Action + Mobile Menu */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleLanguage}
              aria-label={t('nav.languageSwitch')}
              className="min-h-[44px] min-w-[44px] px-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-[#14283F] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 transition-colors"
            >
              <Globe className="w-4 h-4 text-[#087F8C] dark:text-teal-400" aria-hidden="true" />
              <span>{language === 'ar-EG' ? 'EN' : 'AR'}</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? t('nav.themeDark') : t('nav.themeLight')}
              className="hidden sm:inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Sun className="w-4 h-4" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              aria-label={t('auth.signIn')}
              className="hidden sm:inline-flex min-h-[44px] px-3.5 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#14283F] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 transition-colors"
            >
              {firebaseUser && !demoMode ? (
                <>
                  <UserCheck className="w-4 h-4 text-[#21A675]" aria-hidden="true" />
                  <span className="max-w-[110px] truncate">
                    {firebaseUser.displayName || firebaseUser.email}
                  </span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4 text-[#087F8C] dark:text-teal-400" aria-hidden="true" />
                  <span>{t('auth.signIn')}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleNav('book')}
              className="hidden xl:inline-flex min-h-[44px] px-4 items-center justify-center rounded-lg bg-[#087F8C] hover:bg-[#066873] text-white text-sm font-semibold whitespace-nowrap shrink-0 transition-colors"
            >
              {t('home.ctaPrimary')}
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-drawer"
              aria-label={mobileOpen ? t('nav.closeMenu') : t('nav.menu')}
              className="lg:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-[#14283F] dark:text-slate-100"
            >
              {mobileOpen ? (
                <X className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileOpen && (
          <nav
            id="mobile-nav-drawer"
            aria-label={language === 'ar-EG' ? 'قائمة الجوال' : 'Mobile Navigation'}
            className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-4 space-y-2"
          >
            {navItems.map((item) => (
              <button
                key={item.route}
                type="button"
                onClick={() => handleNav(item.route)}
                className={`w-full min-h-[44px] px-3 rounded-lg text-start text-sm font-semibold flex items-center justify-between ${
                  route === item.route
                    ? 'bg-[#E6F5F5] text-[#087F8C] dark:bg-teal-950/60 dark:text-teal-300'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {item.label}
              </button>
            ))}
            {rolePortals.map((p) => {
              if (activeRole !== p.role && !demoMode) return null;
              return (
                <button
                  key={p.route}
                  type="button"
                  onClick={() => {
                    if (demoMode && activeRole !== p.role) {
                      switchDemoRole(p.role);
                    }
                    handleNav(p.route);
                  }}
                  className={`w-full min-h-[44px] px-3 rounded-lg text-start text-sm font-semibold flex items-center justify-between ${
                    route === p.route
                      ? 'bg-[#E6F5F5] text-[#087F8C] dark:bg-teal-950/60 dark:text-teal-300'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => handleNav('about')}
              className="w-full min-h-[44px] px-3 rounded-lg text-start text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {t('nav.about')}
            </button>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                className="min-h-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                <span>{theme === 'light' ? t('nav.themeDark') : t('nav.themeLight')}</span>
              </button>
              <button
                type="button"
                onClick={toggleElderlyMode}
                aria-pressed={elderlyMode}
                className={`min-h-[44px] px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 ${
                  elderlyMode
                    ? 'border-[#087F8C] bg-[#E6F5F5] text-[#087F8C] dark:bg-teal-950 dark:text-teal-300'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <Eye className="w-4 h-4" aria-hidden="true" />
                <span>{t('nav.elderlyMode')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  setShowAuthModal(true);
                }}
                className="min-h-[44px] px-3 rounded-lg bg-[#14283F] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <LogIn className="w-4 h-4" aria-hidden="true" />
                <span>{t('auth.signIn')}</span>
              </button>
            </div>
          </nav>
        )}
      </header>

      {/* Isolated Presentation Demo Bar (non-sticky so mobile sticky cap <= 15% is strictly honored) */}
      <div className="bg-[#14283F] text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-teal-300">
              {demoMode ? t('brand.demoBadge') : t('auth.signIn')}
            </span>
            <span className="text-slate-400" aria-hidden="true">·</span>
            <span className="text-slate-300">
              {t('auth.roleSwitcherLabel')}:
            </span>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('auth.roleSwitcherLabel')}>
              {demoRoles.map((item) => {
                const isSelected = demoMode && activeRole === item.role;
                return (
                  <button
                    key={item.role}
                    type="button"
                    onClick={() => {
                      switchDemoRole(item.role);
                      if (item.role === 'patient') navigate('patient');
                      else if (item.role === 'receptionist') navigate('reception');
                      else if (item.role === 'admin') navigate('admin');
                      else navigate('home');
                    }}
                    className={`min-h-[34px] px-2.5 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
                      isSelected
                        ? 'bg-[#087F8C] text-white'
                        : 'bg-white/10 text-slate-200 hover:bg-white/20'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleElderlyMode}
              aria-pressed={elderlyMode}
              className={`min-h-[34px] px-2.5 py-1 rounded inline-flex items-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                elderlyMode
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-white/10 text-slate-200 hover:bg-white/20'
              }`}
            >
              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('nav.elderlyMode')}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('about')}
              className="min-h-[34px] px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white font-semibold inline-flex items-center whitespace-nowrap transition-colors"
            >
              {t('nav.about')}
            </button>
            {firebaseUser && !demoMode && (
              <button
                type="button"
                onClick={signOutAll}
                className="text-rose-200 hover:text-white font-semibold whitespace-nowrap"
              >
                {t('auth.signOut')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

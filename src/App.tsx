/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { Component, Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { AuthModal } from './components/AuthModal';
import { ToastRegion } from './components/ToastRegion';

const HomePage = lazy(() => import('./pages/HomePage'));
const SpecialtiesPage = lazy(() => import('./pages/SpecialtiesPage'));
const DoctorsPage = lazy(() => import('./pages/DoctorsPage'));
const BookingWizardPage = lazy(() => import('./pages/BookingWizardPage'));
const PatientPortalPage = lazy(() => import('./pages/PatientPortalPage'));
const ReceptionDashboardPage = lazy(() => import('./pages/ReceptionDashboardPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const AiAssistantPage = lazy(() => import('./pages/AiAssistantPage'));
const AboutProjectPage = lazy(() => import('./pages/AboutProjectPage'));

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected error',
    };
  }

  render() {
    if (this.state.hasError) {
      const isAr = document.documentElement.lang.startsWith('ar');
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F6FAFB] dark:bg-slate-950 p-6">
          <div className="max-w-md w-full rounded-2xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 p-6 space-y-4 text-center shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950 text-[#DC5960] mx-auto flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-bold text-[#14283F] dark:text-white">
              {isAr ? 'حدث خطأ غير متوقع' : 'Something went wrong'}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-5 rounded-xl bg-[#087F8C] text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-[#066873]"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              <span>{isAr ? 'إعادة تحميل التطبيق' : 'Reload Application'}</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function PageLoader() {
  const { t } = useTranslation();
  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-6"
      role="status"
      aria-label={t('common.loading')}
    >
      <div className="h-8 w-56 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="h-44 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="h-44 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="h-44 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
      </div>
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}

function ClinicShell() {
  const { route, stateError, refreshState, loadingState, clinicState } = useApp();
  const { t } = useTranslation();

  const renderPage = () => {
    switch (route) {
      case 'specialties':
        return <SpecialtiesPage />;
      case 'doctors':
        return <DoctorsPage />;
      case 'book':
        return <BookingWizardPage />;
      case 'patient':
        return <PatientPortalPage />;
      case 'reception':
        return <ReceptionDashboardPage />;
      case 'admin':
        return <AdminDashboardPage />;
      case 'assistant':
        return <AiAssistantPage />;
      case 'about':
        return <AboutProjectPage />;
      case 'home':
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F6FAFB] dark:bg-slate-950 text-[#14283F] dark:text-slate-100">
      <Header />

      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {stateError && !clinicState && (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8">
            <div
              role="alert"
              className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/60 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#DC5960] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="font-bold text-sm text-red-950 dark:text-red-100">
                    {t('common.error')}
                  </p>
                  <p className="text-xs text-red-800 dark:text-red-200">
                    {stateError}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={refreshState}
                disabled={loadingState}
                className="min-h-[44px] px-4 rounded-xl bg-[#087F8C] text-white text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#066873] shrink-0"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                <span>{t('common.retry')}</span>
              </button>
            </div>
          </div>
        )}

        <Suspense fallback={<PageLoader />}>{renderPage()}</Suspense>
      </main>

      <Footer />
      <AuthModal />
      <ToastRegion />
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppProvider>
        <ClinicShell />
      </AppProvider>
    </AppErrorBoundary>
  );
}

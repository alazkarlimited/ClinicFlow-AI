import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import {
  auth,
  saveUserLanguageInFirestore,
  signInWithGooglePopup,
  signOutFirebase,
  syncUserAccountInFirestore,
} from '../firebase';
import { applyDocumentLanguage } from '../i18n';
import type {
  ClinicBootstrapState,
  LanguageCode,
  UserRole,
} from '../shared/types';

export type AppRoute =
  | 'home'
  | 'specialties'
  | 'doctors'
  | 'book'
  | 'patient'
  | 'reception'
  | 'admin'
  | 'assistant'
  | 'about';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AppContextValue {
  route: AppRoute;
  navigate: (nextRoute: AppRoute, params?: Record<string, string>) => void;
  routeParams: Record<string, string>;
  language: LanguageCode;
  toggleLanguage: () => void;
  setLanguage: (lang: LanguageCode) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  elderlyMode: boolean;
  toggleElderlyMode: () => void;
  firebaseUser: User | null;
  authReady: boolean;
  demoMode: boolean;
  demoRole: UserRole;
  activeRole: UserRole;
  activeUid: string;
  switchDemoRole: (role: UserRole) => void;
  signInGoogle: () => Promise<void>;
  signOutAll: () => Promise<void>;
  clinicState: ClinicBootstrapState | null;
  loadingState: boolean;
  stateError: string | null;
  refreshState: () => Promise<void>;
  apiFetch: <T>(url: string, init?: RequestInit) => Promise<T>;
  toast: (type: ToastItem['type'], message: string) => void;
  toasts: ToastItem[];
  dismissToast: (id: string) => void;
  announce: (text: string) => void;
  announcement: string;
  showAuthModal: boolean;
  setShowAuthModal: (open: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const ROUTE_PATHS: Record<AppRoute, string> = {
  home: '/',
  specialties: '/specialties',
  doctors: '/doctors',
  book: '/book',
  patient: '/patient',
  reception: '/reception',
  admin: '/admin',
  assistant: '/assistant',
  about: '/about',
};

function parseRouteFromLocation(): { route: AppRoute; params: Record<string, string> } {
  const path = window.location.pathname;
  const search = new URLSearchParams(window.location.search);
  const params: Record<string, string> = {};
  search.forEach((v, k) => {
    params[k] = v;
  });
  for (const [key, val] of Object.entries(ROUTE_PATHS)) {
    if (path === val) {
      return { route: key as AppRoute, params };
    }
  }
  return { route: 'home', params };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();

  const initialLoc = parseRouteFromLocation();
  const [route, setRoute] = useState<AppRoute>(initialLoc.route);
  const [routeParams, setRouteParams] = useState<Record<string, string>>(initialLoc.params);

  const [language, setLanguageState] = useState<LanguageCode>(
    (i18n.language as LanguageCode) || 'ar-EG'
  );
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('clinicflow_theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [elderlyMode, setElderlyMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('clinicflow_elderly') === 'true';
    } catch {
      return false;
    }
  });

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Isolated Demo Mode state (defaults to active with 'patient' or 'guest' so graduation committee can explore immediately)
  const [demoMode, setDemoMode] = useState<boolean>(true);
  const [demoRole, setDemoRole] = useState<UserRole>(() => {
    try {
      const saved = localStorage.getItem('clinicflow_demo_role') as UserRole | null;
      if (saved && ['guest', 'patient', 'receptionist', 'admin'].includes(saved)) {
        return saved;
      }
    } catch {
      // Ignore
    }
    return 'patient';
  });

  const [resolvedServerRole, setResolvedServerRole] = useState<UserRole>('guest');
  const [resolvedServerUid, setResolvedServerUid] = useState<string>('guest');

  const [clinicState, setClinicState] = useState<ClinicBootstrapState | null>(null);
  const [loadingState, setLoadingState] = useState<boolean>(true);
  const [stateError, setStateError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);

  const announce = useCallback((text: string) => {
    setAnnouncement('');
    setTimeout(() => setAnnouncement(text), 20);
  }, []);

  const toast = useCallback(
    (type: ToastItem['type'], message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
      announce(message);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    [announce]
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const setLanguage = useCallback(
    (nextLang: LanguageCode) => {
      setLanguageState(nextLang);
      applyDocumentLanguage(nextLang);
      i18n.changeLanguage(nextLang);
      if (firebaseUser) {
        saveUserLanguageInFirestore(firebaseUser, nextLang).catch(() => {});
      }
      announce(
        nextLang === 'ar-EG'
          ? 'تم تحويل لغة الواجهة إلى العربية'
          : 'Interface language switched to English'
      );
    },
    [i18n, firebaseUser, announce]
  );

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'ar-EG' ? 'en' : 'ar-EG');
  }, [language, setLanguage]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      if (next === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      try {
        localStorage.setItem('clinicflow_theme', next);
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  const toggleElderlyMode = useCallback(() => {
    setElderlyMode((prev) => {
      const next = !prev;
      document.documentElement.style.fontSize = next ? '19px' : '16px';
      try {
        localStorage.setItem('clinicflow_elderly', String(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = elderlyMode ? '19px' : '16px';
  }, [elderlyMode]);

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseRouteFromLocation();
      setRoute(parsed.route);
      setRouteParams(parsed.params);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback(
    (nextRoute: AppRoute, params: Record<string, string> = {}) => {
      const base = ROUTE_PATHS[nextRoute] ?? '/';
      const qs = new URLSearchParams(params).toString();
      const targetUrl = qs ? `${base}?${qs}` : base;
      window.history.pushState({}, '', targetUrl);
      setRoute(nextRoute);
      setRouteParams(params);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (user) {
        setDemoMode(false);
        const storedLang = await syncUserAccountInFirestore(user, language);
        if (storedLang !== language) {
          setLanguageState(storedLang);
          applyDocumentLanguage(storedLang);
          i18n.changeLanguage(storedLang);
        }
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apiFetch = useCallback(
    async <T,>(url: string, init: RequestInit = {}): Promise<T> => {
      const headers = new Headers(init.headers);
      if (!headers.has('Content-Type') && init.body) {
        headers.set('Content-Type', 'application/json');
      }

      if (firebaseUser && !demoMode) {
        const token = await firebaseUser.getIdToken();
        headers.set('Authorization', `Bearer ${token}`);
      } else if (demoMode) {
        headers.set('x-demo-mode', 'true');
        headers.set('x-demo-role', demoRole);
      }

      const response = await fetch(url, { ...init, headers });
      const data = (await response.json().catch(() => ({}))) as T & {
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        const err = new Error(data.error || `HTTP ${response.status}`) as Error & {
          code?: string;
          status?: number;
        };
        err.code = data.code;
        err.status = response.status;
        throw err;
      }
      return data;
    },
    [firebaseUser, demoMode, demoRole]
  );

  const refreshState = useCallback(async () => {
    setLoadingState(true);
    setStateError(null);
    try {
      const data = await apiFetch<
        ClinicBootstrapState & {
          caller?: { uid: string; role: UserRole; demoMode: boolean };
        }
      >('/api/clinic/state');
      setClinicState(data);
      if (data.caller) {
        setResolvedServerRole(data.caller.role);
        setResolvedServerUid(data.caller.uid);
      }
    } catch (err) {
      setStateError(err instanceof Error ? err.message : 'Failed to load clinic state');
    } finally {
      setLoadingState(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (authReady) {
      refreshState();
    }
  }, [authReady, demoMode, demoRole, firebaseUser, refreshState]);

  const switchDemoRole = useCallback((role: UserRole) => {
    setDemoMode(true);
    setDemoRole(role);
    try {
      localStorage.setItem('clinicflow_demo_role', role);
    } catch {
      // Ignore
    }
  }, []);

  const signInGoogle = useCallback(async () => {
    try {
      await signInWithGooglePopup();
      setDemoMode(false);
      setShowAuthModal(false);
      toast(
        'success',
        language === 'ar-EG'
          ? 'تم تسجيل الدخول بحساب Google بنجاح.'
          : 'Signed in with Google successfully.'
      );
    } catch (err) {
      toast(
        'error',
        err instanceof Error
          ? err.message
          : language === 'ar-EG'
            ? 'تعذر إتمام تسجيل الدخول.'
            : 'Failed to sign in.'
      );
    }
  }, [language, toast]);

  const signOutAll = useCallback(async () => {
    if (firebaseUser) {
      await signOutFirebase();
    }
    setDemoMode(true);
    setDemoRole('guest');
    toast(
      'info',
      language === 'ar-EG' ? 'تم تسجيل الخروج.' : 'Signed out.'
    );
  }, [firebaseUser, language, toast]);

  const activeRole = demoMode ? demoRole : resolvedServerRole;
  const activeUid = demoMode
    ? demoRole === 'patient'
      ? 'demo-patient-1'
      : demoRole === 'receptionist'
        ? 'demo-reception-1'
        : demoRole === 'admin'
          ? 'demo-admin-1'
          : 'guest'
    : resolvedServerUid;

  return (
    <AppContext.Provider
      value={{
        route,
        navigate,
        routeParams,
        language,
        toggleLanguage,
        setLanguage,
        theme,
        toggleTheme,
        elderlyMode,
        toggleElderlyMode,
        firebaseUser,
        authReady,
        demoMode,
        demoRole,
        activeRole,
        activeUid,
        switchDemoRole,
        signInGoogle,
        signOutAll,
        clinicState,
        loadingState,
        stateError,
        refreshState,
        apiFetch,
        toast,
        toasts,
        dismissToast,
        announce,
        announcement,
        showAuthModal,
        setShowAuthModal,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

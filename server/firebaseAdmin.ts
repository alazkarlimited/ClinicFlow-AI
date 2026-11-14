import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export interface FirebaseAppletConfig {
  projectId: string;
  appId?: string;
  apiKey?: string;
  authDomain?: string;
  firestoreDatabaseId: string;
}

export interface AdminFirebaseContext {
  app: App;
  db: Firestore;
  auth: Auth;
  projectId: string;
  databaseId: string;
}

let cachedAppletConfig: FirebaseAppletConfig | null = null;
let cachedAdminCtx: AdminFirebaseContext | null | undefined = undefined;

export function getFirebaseAppletConfig(): FirebaseAppletConfig {
  if (cachedAppletConfig) return cachedAppletConfig;

  let fileConfig: Partial<FirebaseAppletConfig> = {};
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(moduleDir, '..', 'firebase-applet-config.json'),
    path.resolve(moduleDir, 'firebase-applet-config.json'),
  ];

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        fileConfig = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<FirebaseAppletConfig>;
        break;
      }
    } catch {
      // Ignore malformed/missing candidate
    }
  }

  cachedAppletConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID || fileConfig.projectId || '',
    appId: fileConfig.appId,
    apiKey: process.env.FIREBASE_API_KEY || fileConfig.apiKey || '',
    authDomain: fileConfig.authDomain,
    firestoreDatabaseId:
      process.env.FIREBASE_DATABASE_ID ||
      fileConfig.firestoreDatabaseId ||
      '(default)',
  };

  return cachedAppletConfig;
}

function parseServiceAccountFromEnv(): ServiceAccount | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    try {
      const decoded = rawJson.startsWith('{')
        ? rawJson
        : Buffer.from(rawJson, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded) as ServiceAccount & {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      return {
        projectId: parsed.projectId ?? parsed.project_id,
        clientEmail: parsed.clientEmail ?? parsed.client_email,
        privateKey: (parsed.privateKey ?? parsed.private_key)?.replace(/\\n/g, '\n'),
      };
    } catch (err) {
      console.error('[ClinicFlow] Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', err);
      return null;
    }
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (clientEmail && privateKey) {
    const cfg = getFirebaseAppletConfig();
    return {
      projectId: process.env.FIREBASE_PROJECT_ID || cfg.projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

export function getAdminFirebase(): AdminFirebaseContext | null {
  if (cachedAdminCtx !== undefined) return cachedAdminCtx;

  const cfg = getFirebaseAppletConfig();
  const sa = parseServiceAccountFromEnv();
  const hasAdc =
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) ||
    process.env.FIREBASE_USE_ADC === 'true';

  if (!sa && !hasAdc) {
    if (process.env.REQUIRE_FIRESTORE === 'true') {
      throw new Error(
        'REQUIRE_FIRESTORE=true but no Firebase Admin credentials (FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS) were found.'
      );
    }
    cachedAdminCtx = null;
    return null;
  }

  try {
    const projectId = sa?.projectId || cfg.projectId;
    const app =
      getApps().length > 0
        ? getApps()[0]!
        : initializeApp({
            credential: sa ? cert(sa) : applicationDefault(),
            projectId: projectId || undefined,
          });

    const db =
      cfg.firestoreDatabaseId && cfg.firestoreDatabaseId !== '(default)'
        ? getFirestore(app, cfg.firestoreDatabaseId)
        : getFirestore(app);

    db.settings({ ignoreUndefinedProperties: true });

    const auth = getAuth(app);
    cachedAdminCtx = {
      app,
      db,
      auth,
      projectId,
      databaseId: cfg.firestoreDatabaseId,
    };
    return cachedAdminCtx;
  } catch (err) {
    console.error('[ClinicFlow] Failed to initialize Firebase Admin SDK:', err);
    if (process.env.REQUIRE_FIRESTORE === 'true') {
      throw err;
    }
    cachedAdminCtx = null;
    return null;
  }
}

export async function verifyFirestoreConnectionAtBoot(): Promise<'firestore' | 'memory-fallback'> {
  const ctx = getAdminFirebase();
  if (!ctx) return 'memory-fallback';

  try {
    await ctx.db.collection('clinicSettings').doc('default').get();
    return 'firestore';
  } catch (err) {
    console.error('[ClinicFlow] Firestore Admin connectivity check failed:', err);
    if (process.env.REQUIRE_FIRESTORE === 'true') {
      throw err;
    }
    cachedAdminCtx = null;
    return 'memory-fallback';
  }
}

export function getStorageMode(): 'firestore' | 'memory-fallback' {
  return getAdminFirebase() ? 'firestore' : 'memory-fallback';
}

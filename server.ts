import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  addScheduleExceptionAtomic,
  BookingError,
  cancelAppointmentAtomic,
  confirmWaitlistOfferAtomic,
  createAppointmentAtomic,
  getAvailabilityForDoctorDate,
  getNextSlotForDoctor,
  getRawSnapshotForAi,
  getStateForRole,
  joinWaitlistAtomic,
  markNotificationReadAtomic,
  resetDemoDatabase,
  triggerWaitlistOfferManually,
  updateAppointmentStatusAtomic,
  updatePatientProfileAtomic,
  updateSettingsAtomic,
  upsertDoctorAndScheduleAtomic,
  upsertStaffAccountAtomic,
} from './server/store';
import {
  runAdminAnalyticsAssistant,
  runPatientAssistant,
} from './server/geminiService';
import type { LanguageCode, UserRole } from './src/shared/types';

const ADMIN_ALLOWLIST = new Set(
  (process.env.ADMIN_EMAILS ?? 'eng4elec.eg@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

interface CallerContext {
  uid: string;
  email?: string;
  role: UserRole;
  demoMode: boolean;
}

let firebaseApiKey: string | null = null;
async function getFirebaseApiKey(): Promise<string | null> {
  if (firebaseApiKey !== null) return firebaseApiKey;
  try {
    const raw = await fs.readFile(
      path.resolve(process.cwd(), 'firebase-applet-config.json'),
      'utf8'
    );
    const parsed = JSON.parse(raw) as { apiKey?: string };
    firebaseApiKey = parsed.apiKey ?? '';
  } catch {
    firebaseApiKey = '';
  }
  return firebaseApiKey;
}

async function verifyFirebaseToken(
  idToken: string
): Promise<{ uid: string; email?: string; emailVerified: boolean } | null> {
  const apiKey = await getFirebaseApiKey();
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: Array<{ localId: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user?.localId) return null;
    return {
      uid: user.localId,
      email: user.email?.toLowerCase(),
      emailVerified: Boolean(user.emailVerified),
    };
  } catch {
    return null;
  }
}

async function resolveCaller(req: Request): Promise<CallerContext> {
  const authHeader = req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const verified = await verifyFirebaseToken(token);
    if (verified) {
      const state = await getRawSnapshotForAi();
      let role: UserRole = 'patient';
      if (verified.email && verified.emailVerified) {
        if (ADMIN_ALLOWLIST.has(verified.email)) {
          role = 'admin';
        } else {
          const staff = state.staffAccounts.find(
            (s) => s.email.toLowerCase() === verified.email
          );
          if (staff) role = staff.role;
        }
      }
      return {
        uid: verified.uid,
        email: verified.email,
        role,
        demoMode: false,
      };
    }
  }

  // Isolated fictional Demo Mode context (never accesses production Firestore admin resources)
  const isDemo = req.header('x-demo-mode') === 'true';
  if (isDemo) {
    const requestedRole = req.header('x-demo-role') as UserRole | undefined;
    const allowedDemoRoles: UserRole[] = ['guest', 'patient', 'receptionist', 'admin'];
    const role: UserRole =
      requestedRole && allowedDemoRoles.includes(requestedRole)
        ? requestedRole
        : 'patient';
    const uidMap: Record<UserRole, string> = {
      guest: 'guest',
      patient: 'demo-patient-1',
      receptionist: 'demo-reception-1',
      admin: 'demo-admin-1',
    };
    return {
      uid: uidMap[role],
      role,
      demoMode: true,
    };
  }

  return {
    uid: 'guest',
    role: 'guest',
    demoMode: false,
  };
}

function sendError(res: Response, err: unknown) {
  if (err instanceof BookingError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      issues: err.issues,
    });
  }
  console.error('Server error:', err);
  return res.status(500).json({
    error: err instanceof Error ? err.message : 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}

const createAppointmentSchema = z.object({
  doctorId: z.string().min(1).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeSlot: z.string().regex(/^\d{2}:\d{2}$/),
  patientName: z.string().trim().min(2).max(120),
  patientPhone: z.string().trim().regex(/^\+?[0-9\-\s]{8,20}$/),
  bookingType: z
    .enum(['online', 'walk_in', 'reception_assisted', 'waitlist_offer'])
    .optional(),
  notes: z.string().max(400).optional(),
  patientUidOverride: z.string().max(128).optional(),
});

const waitlistSchema = z.object({
  doctorId: z.string().min(1).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  patientName: z.string().trim().min(2).max(120),
  patientPhone: z.string().trim().regex(/^\+?[0-9\-\s]{8,20}$/),
});

const statusUpdateSchema = z.object({
  status: z.enum(['confirmed', 'checked_in', 'completed', 'cancelled', 'no_show']),
});

const doctorScheduleSchema = z.object({
  doctor: z.object({
    id: z.string().min(1).max(64),
    specialtyId: z.string().min(1).max(64),
    nameAr: z.string().min(2).max(120),
    nameEn: z.string().min(2).max(120),
    titleAr: z.string().min(2).max(120),
    titleEn: z.string().min(2).max(120),
    bioAr: z.string().max(500).default(''),
    bioEn: z.string().max(500).default(''),
    avatarUrl: z.string().max(300).default('/src/assets/images/doctor_male_senior_1794660437808.jpg'),
    consultationFeeEgp: z.number().min(0).max(50000),
    active: z.boolean(),
    isDemoProfile: z.boolean().default(true),
  }),
  schedule: z.object({
    id: z.string().min(1).max(64),
    doctorId: z.string().min(1).max(64),
    workingDays: z.array(z.number().int().min(0).max(6)).max(7),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    breakStart: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
    breakEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
    slotDurationMinutes: z.number().int().min(10).max(120),
    dailyCapacity: z.number().int().min(1).max(100),
    perSlotCapacity: z.number().int().min(1).max(10),
    bookingsPaused: z.boolean(),
  }),
});

const exceptionSchema = z.object({
  id: z.string().min(1).max(100),
  doctorId: z.string().min(1).max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isClosed: z.boolean(),
  reasonAr: z.string().max(200).optional(),
  reasonEn: z.string().max(200).optional(),
  customCapacity: z.number().int().min(0).max(100).optional(),
});

const settingsSchema = z.object({
  clinicNameAr: z.string().min(2).max(120).optional(),
  clinicNameEn: z.string().min(2).max(120).optional(),
  timezone: z.string().min(3).max(64).optional(),
  cancellationCutoffHours: z.number().int().min(0).max(72).optional(),
  defaultDailyLimit: z.number().int().min(1).max(100).optional(),
  waitlistOfferExpirationMinutes: z.number().int().min(5).max(1440).optional(),
});

const staffSchema = z.object({
  email: z.string().email().max(160),
  displayName: z.string().min(2).max(120),
  role: z.enum(['admin', 'receptionist']),
});

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^\+?[0-9\-\s]{8,20}$/),
  email: z.string().email().max(160).optional().or(z.literal('')),
  preferredLanguage: z.enum(['ar-EG', 'en']),
  elderlyAssistMode: z.boolean(),
});

const aiChatSchema = z.object({
  message: z.string().trim().min(1).max(1200),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      })
    )
    .max(16)
    .default([]),
  language: z.enum(['ar-EG', 'en']).default('ar-EG'),
});

const aiBiSchema = z.object({
  question: z.string().trim().min(2).max(600),
  language: z.enum(['ar-EG', 'en']).default('ar-EG'),
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'clinicflow-ai', timestamp: new Date().toISOString() });
  });

  app.get('/api/clinic/state', async (req, res) => {
    try {
      const caller = await resolveCaller(req);
      const state = await getStateForRole({
        role: caller.role,
        uid: caller.uid,
        demoMode: caller.demoMode,
      });
      res.json({ caller, ...state });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/clinic/availability', async (req, res) => {
    try {
      const doctorId = String(req.query.doctorId ?? '');
      const date = String(req.query.date ?? '');
      if (!doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Invalid doctorId or date', code: 'BAD_QUERY' });
      }
      const availability = await getAvailabilityForDoctorDate(doctorId, date);
      if (!availability) {
        return res.status(404).json({ error: 'Doctor not found', code: 'DOCTOR_NOT_FOUND' });
      }
      res.json(availability);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/clinic/next-slot', async (req, res) => {
    try {
      const doctorId = String(req.query.doctorId ?? '');
      if (!doctorId) {
        return res.status(400).json({ error: 'Missing doctorId', code: 'BAD_QUERY' });
      }
      const next = await getNextSlotForDoctor(doctorId);
      res.json({ next });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/appointments', async (req, res) => {
    try {
      const caller = await resolveCaller(req);
      if (caller.role === 'guest') {
        return res.status(401).json({
          error: 'Authentication or Demo Patient sign-in required to complete booking.',
          code: 'AUTH_REQUIRED',
        });
      }
      const body = createAppointmentSchema.parse(req.body);
      const isStaff = caller.role === 'receptionist' || caller.role === 'admin';
      const targetUid =
        isStaff && body.patientUidOverride
          ? body.patientUidOverride
          : isStaff && body.bookingType !== 'online'
            ? `walkin-${body.patientPhone.replace(/\D/g, '')}`
            : caller.uid;

      const bookingType =
        isStaff && body.bookingType ? body.bookingType : 'online';

      const appointment = await createAppointmentAtomic({
        patientUid: targetUid,
        patientName: body.patientName,
        patientPhone: body.patientPhone,
        doctorId: body.doctorId,
        date: body.date,
        timeSlot: body.timeSlot,
        bookingType,
        notes: body.notes,
        actorUid: caller.uid,
        actorRole: caller.role,
      });

      res.status(201).json({ appointment });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/appointments/:id/cancel', async (req, res) => {
    try {
      const caller = await resolveCaller(req);
      if (caller.role === 'guest') {
        return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
      }
      const result = await cancelAppointmentAtomic({
        appointmentId: req.params.id,
        actorUid: caller.uid,
        actorRole: caller.role,
      });
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.patch('/api/appointments/:id/status', async (req, res) => {
    try {
      const caller = await resolveCaller(req);
      if (caller.role !== 'receptionist' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Staff privileges required', code: 'FORBIDDEN' });
      }
      const body = statusUpdateSchema.parse(req.body);
      const appointment = await updateAppointmentStatusAtomic({
        appointmentId: req.params.id,
        nextStatus: body.status,
        actorUid: caller.uid,
        actorRole: caller.role,
      });
      res.json({ appointment });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/waitlist', async (req, res) => {
    try {
      const caller = await resolveCaller(req);
      if (caller.role === 'guest') {
        return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
      }
      const body = waitlistSchema.parse(req.body);
      const entry = await joinWaitlistAtomic({
        patientUid: caller.uid,
        patientName: body.patientName,
        patientPhone: body.patientPhone,
        doctorId: body.doctorId,
        date: body.date,
      });
      res.status(201).json({ entry });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/waitlist/:id/confirm', async (req, res) => {
    try {
      const caller = await resolveCaller(req);
      if (caller.role === 'guest') {
        return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
      }
      const result = await confirmWaitlistOfferAtomic({
        entryId: req.params.id,
        actorUid: caller.uid,
        actorRole: caller.role,
      });
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/waitlist/:id/offer', async (req, res) => {
    try {
      const caller = await resolveCaller(req);
      if (caller.role !== 'receptionist' && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Staff privileges required', code: 'FORBIDDEN' });
      }
      const entry = await triggerWaitlistOfferManually({
        entryId: req.params.id,
        actorUid: caller.uid,
        actorRole: caller.role,
      });
      res.json({ entry });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put('/api/patient/profile', async (req, res) => {
    try {
      const caller = await resolveCaller(req);
      if (caller.role === 'guest') {
        return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
      }
      const body = profileSchema.parse(req.body);
      const profile = await updatePatientProfileAtomic({
        uid: caller.uid,
        fullName: body.fullName,
        phone: body.phone,
        email: body.email || undefined,
        preferredLanguage: body.preferredLanguage,
        elderlyAssistMode: body.elderlyAssistMode,
      });
      res.json({ profile });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/notifications/:id/read', async (req, res) => {
    try {
      const caller = await resolveCaller(req);
      if (caller.role === 'guest') {
        return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
      }
      await markNotificationReadAtomic(req.params.id, caller.uid);
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/admin/doctors', async (req, res) => {
    try {
      const caller = await resolveCaller(req);
      if (caller.role !== 'admin') {
        return res.status(403).json({ error: 'Administrator privileges required', code: 'FORBIDDEN' });
      }
      const body = doctorScheduleSchema.parse(req.body);
      const result = await upsertDoctorAndScheduleAtomic({
        doctor: body.doctor,
        schedule: {
          ...body.schedule,
          breakStart: body.schedule.breakStart || undefined,
          breakEnd: body.schedule.breakEnd || undefined,
        },
        actorUid: caller.uid,
      });
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/admin/exceptions', async (req, res) => {
    try {
      const caller = await resolveCaller(req);
      if (caller.role !== 'admin') {
        return res.status(403).json({ error: 'Administrator privileges required', code: 'FORBIDDEN' });
      }
      const body = exceptionSchema.parse(req.body);
      const exception = await addScheduleExceptionAtomic({
        exception: body,
        actorUid: caller.uid,
      });
      res.json({ exception });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put('/api/admin/settings', async (req, res) => {
    try {
      const caller = await resolveCaller(req);
      if (caller.role !== 'admin') {
        return res.status(403).json({ error: 'Administrator privileges required', code: 'FORBIDDEN' });
      }
      const body = settingsSchema.parse(req.body);
      const settings = await updateSettingsAtomic({
        settings: body,
        actorUid: caller.uid,
      });
      res.json({ settings });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/admin/staff', async (req, res) => {
    try {
      const caller = await resolveCaller(req);
      if (caller.role !== 'admin') {
        return res.status(403).json({ error: 'Administrator privileges required', code: 'FORBIDDEN' });
      }
      const body = staffSchema.parse(req.body);
      const staff = await upsertStaffAccountAtomic({
        email: body.email,
        displayName: body.displayName,
        role: body.role,
        actorUid: caller.uid,
      });
      res.json({ staff });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/demo/reset', async (req, res) => {
    try {
      const caller = await resolveCaller(req);
      if (!caller.demoMode && caller.role !== 'admin') {
        return res.status(403).json({ error: 'Demo reset requires Demo Mode or Admin role', code: 'FORBIDDEN' });
      }
      await resetDemoDatabase(caller.uid);
      const state = await getStateForRole({
        role: caller.role,
        uid: caller.uid,
        demoMode: caller.demoMode,
      });
      res.json({ ok: true, ...state });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const caller = await resolveCaller(req);
      const body = aiChatSchema.parse(req.body);
      const result = await runPatientAssistant({
        message: body.message,
        history: body.history as Array<{ role: 'user' | 'assistant'; content: string }>,
        language: body.language as LanguageCode,
        callerUid: caller.uid,
        callerRole: caller.role,
      });
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/ai/bi', async (req, res) => {
    try {
      const caller = await resolveCaller(req);
      if (caller.role !== 'admin') {
        return res.status(403).json({ error: 'Administrator privileges required for AI BI', code: 'FORBIDDEN' });
      }
      const body = aiBiSchema.parse(req.body);
      const result = await runAdminAnalyticsAssistant({
        question: body.question,
        language: body.language as LanguageCode,
      });
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found', code: 'NOT_FOUND' });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        maxAge: '1h',
        setHeaders(res, filePath) {
          if (filePath.includes('/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Global error guard
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    sendError(res, err);
  });

  const PORT = Number(process.env.PORT ?? 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClinicFlow AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

import { Timestamp, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore';
import {
  addDaysToDateStr,
  canCancelAppointment,
  computeAnalyticsSummary,
  computeDayAvailability,
  findNextAvailableSlot,
  getNowInTimezone,
  isValidStatusTransition,
  isWaitlistOfferValid,
  validateScheduleChangeSafety,
} from '../src/shared/bookingEngine';
import { buildSeedDatabase } from '../src/shared/seedData';
import type {
  Appointment,
  AppointmentStatus,
  AuditLog,
  BookingType,
  ClinicSettings,
  DayAvailability,
  Doctor,
  DoctorDateOccupancy,
  DoctorSchedule,
  LanguageCode,
  NotificationItem,
  PatientProfile,
  ScheduleException,
  Specialty,
  StaffAccount,
  UserRole,
  WaitlistEntry,
} from '../src/shared/types';
import { getAdminFirebase } from './firebaseAdmin';

export type StoreEnv = 'demo' | 'production';

export interface DatabaseState {
  scenarioDate: string;
  scenarioDoctorId: string;
  specialties: Specialty[];
  doctors: Doctor[];
  schedules: DoctorSchedule[];
  exceptions: ScheduleException[];
  settings: ClinicSettings;
  appointments: Appointment[];
  waitlist: WaitlistEntry[];
  notifications: NotificationItem[];
  auditLogs: AuditLog[];
  staffAccounts: StaffAccount[];
  patientProfiles: Record<string, PatientProfile>;
}

export class BookingError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function resolveEnv(demoMode?: boolean): StoreEnv {
  return demoMode === false ? 'production' : 'demo';
}

function colName(env: StoreEnv, base: string): string {
  return env === 'demo' ? `demo_${base}` : base;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeBookingRef(): string {
  const digits = Math.floor(100000 + Math.random() * 899999);
  return `CF-${digits}`;
}

function toIso(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return String(value);
}

function toTs(isoOrDate?: string | Date): Timestamp {
  if (!isoOrDate) return Timestamp.now();
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  return Timestamp.fromDate(Number.isNaN(d.getTime()) ? new Date() : d);
}

function sanitizeDoc<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

function slotDocId(doctorId: string, date: string, timeSlot: string): string {
  return `${doctorId}_${date}_${timeSlot.replace(':', '-')}`;
}

function dailyCapDocId(doctorId: string, date: string): string {
  return `${doctorId}_${date}`;
}

function mapAppointmentFromFs(data: Record<string, unknown>): Appointment {
  return {
    id: String(data.id),
    bookingRef: String(data.bookingRef),
    patientUid: String(data.patientUid),
    patientName: String(data.patientName),
    patientPhone: String(data.patientPhone),
    doctorId: String(data.doctorId),
    doctorNameSnapshotAr: String(data.doctorNameSnapshotAr),
    doctorNameSnapshotEn: String(data.doctorNameSnapshotEn),
    specialtyId: String(data.specialtyId),
    specialtyNameSnapshotAr: String(data.specialtyNameSnapshotAr),
    specialtyNameSnapshotEn: String(data.specialtyNameSnapshotEn),
    date: String(data.date),
    timeSlot: String(data.timeSlot),
    status: data.status as AppointmentStatus,
    bookingType: data.bookingType as BookingType,
    ...(typeof data.notes === 'string' && data.notes.length > 0 ? { notes: data.notes } : {}),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function mapWaitlistFromFs(data: Record<string, unknown>): WaitlistEntry {
  return {
    id: String(data.id),
    patientUid: String(data.patientUid),
    patientName: String(data.patientName),
    patientPhone: String(data.patientPhone),
    doctorId: String(data.doctorId),
    specialtyId: String(data.specialtyId),
    date: String(data.date),
    status: data.status as WaitlistEntry['status'],
    ...(typeof data.offeredTimeSlot === 'string' ? { offeredTimeSlot: data.offeredTimeSlot } : {}),
    ...(data.offerExpiresAt ? { offerExpiresAt: toIso(data.offerExpiresAt) } : {}),
    createdAt: toIso(data.createdAt),
  };
}

function mapNotificationFromFs(data: Record<string, unknown>): NotificationItem {
  return {
    id: String(data.id),
    recipientUid: String(data.recipientUid),
    titleAr: String(data.titleAr),
    titleEn: String(data.titleEn),
    bodyAr: String(data.bodyAr),
    bodyEn: String(data.bodyEn),
    channel: data.channel as NotificationItem['channel'],
    read: Boolean(data.read),
    createdAt: toIso(data.createdAt),
  };
}

function mapAuditFromFs(data: Record<string, unknown>): AuditLog {
  return {
    id: String(data.id),
    actorUid: String(data.actorUid),
    actorRole: data.actorRole as AuditLog['actorRole'],
    action: String(data.action),
    targetType: String(data.targetType),
    targetId: String(data.targetId),
    summaryAr: String(data.summaryAr),
    summaryEn: String(data.summaryEn),
    createdAt: toIso(data.createdAt),
  };
}

function mapSettingsFromFs(data: Record<string, unknown>): ClinicSettings {
  return {
    id: String(data.id || 'default'),
    clinicNameAr: String(data.clinicNameAr),
    clinicNameEn: String(data.clinicNameEn),
    timezone: String(data.timezone),
    cancellationCutoffHours: Number(data.cancellationCutoffHours),
    defaultDailyLimit: Number(data.defaultDailyLimit),
    waitlistOfferExpirationMinutes: Number(data.waitlistOfferExpirationMinutes),
    updatedAt: toIso(data.updatedAt),
  };
}

function mapStaffFromFs(data: Record<string, unknown>): StaffAccount {
  return {
    uid: String(data.uid),
    email: String(data.email),
    displayName: String(data.displayName),
    role: data.role as StaffAccount['role'],
    assignedAt: toIso(data.assignedAt),
  };
}

function mapProfileFromFs(data: Record<string, unknown>): PatientProfile {
  return {
    uid: String(data.uid),
    fullName: String(data.fullName),
    phone: String(data.phone),
    ...(typeof data.email === 'string' && data.email ? { email: data.email } : {}),
    preferredLanguage: (data.preferredLanguage as LanguageCode) || 'ar-EG',
    elderlyAssistMode: Boolean(data.elderlyAssistMode),
    updatedAt: toIso(data.updatedAt),
  };
}

// ============================================================================
// EPHEMERAL IN-MEMORY STORE (Unit Tests & Unconfigured Offline Sandbox Only)
// Zero JSON files are ever read from or written to disk.
// ============================================================================
let lockChain: Promise<void> = Promise.resolve();

export async function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lockChain;
  let release!: () => void;
  lockChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

const memoryStates: Partial<Record<StoreEnv, DatabaseState>> = {};

function createFreshMemoryState(env: StoreEnv): DatabaseState {
  const seeded = buildSeedDatabase();
  if (env === 'production') {
    // Production starts with verified clinic catalog & settings only (zero fake patient data)
    return {
      scenarioDate: seeded.scenarioDate,
      scenarioDoctorId: seeded.scenarioDoctorId,
      specialties: seeded.specialties,
      doctors: seeded.doctors,
      schedules: seeded.schedules,
      exceptions: [],
      settings: seeded.settings,
      appointments: [],
      waitlist: [],
      notifications: [],
      auditLogs: [],
      staffAccounts: [],
      patientProfiles: {},
    };
  }
  return {
    ...seeded,
    patientProfiles: {
      'demo-patient-1': {
        uid: 'demo-patient-1',
        fullName: 'محمود عبد الله حسن',
        phone: '01012345601',
        email: 'patient.demo@clinicflow.local',
        preferredLanguage: 'ar-EG',
        elderlyAssistMode: false,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

function loadMemoryState(env: StoreEnv): DatabaseState {
  if (!memoryStates[env]) {
    memoryStates[env] = createFreshMemoryState(env);
  }
  return memoryStates[env]!;
}

function expireStaleOffersInMemory(state: DatabaseState, now: Date = new Date()): void {
  const affectedPairs = new Set<string>();
  for (const entry of state.waitlist) {
    if (entry.status === 'offered' && entry.offerExpiresAt) {
      if (now.getTime() > new Date(entry.offerExpiresAt).getTime()) {
        entry.status = 'expired';
        affectedPairs.add(`${entry.doctorId}|${entry.date}`);
      }
    }
  }
  for (const pair of affectedPairs) {
    const [doctorId, date] = pair.split('|');
    promoteNextWaitlistEntryInMemory(state, doctorId, date, now);
  }
}

function promoteNextWaitlistEntryInMemory(
  state: DatabaseState,
  doctorId: string,
  date: string,
  now: Date = new Date()
): WaitlistEntry | null {
  const doctor = state.doctors.find((d) => d.id === doctorId);
  const schedule = state.schedules.find((s) => s.doctorId === doctorId);
  if (!doctor || !schedule) return null;

  const hasActiveOffer = state.waitlist.some(
    (w) =>
      w.doctorId === doctorId &&
      w.date === date &&
      w.status === 'offered' &&
      isWaitlistOfferValid(w, now)
  );
  if (hasActiveOffer) return null;

  const avail = computeDayAvailability({
    doctor,
    schedule,
    exceptions: state.exceptions,
    appointments: state.appointments,
    dateStr: date,
    timeZone: state.settings.timezone,
    now,
  });

  const openSlot = avail.slots.find((s) => s.available);
  if (!openSlot || avail.remainingCapacity <= 0) return null;

  const nextWaiting = state.waitlist
    .filter((w) => w.doctorId === doctorId && w.date === date && w.status === 'waiting')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

  if (!nextWaiting) return null;

  const expiresAt = new Date(
    now.getTime() + state.settings.waitlistOfferExpirationMinutes * 60000
  ).toISOString();

  nextWaiting.status = 'offered';
  nextWaiting.offeredTimeSlot = openSlot.timeSlot;
  nextWaiting.offerExpiresAt = expiresAt;

  state.notifications.unshift({
    id: makeId('notif'),
    recipientUid: nextWaiting.patientUid,
    titleAr: 'توفر موعد من قائمة الانتظار',
    titleEn: 'Waitlist Appointment Slot Available',
    bodyAr: `تتوفر فرصة حجز مع ${doctor.nameAr} بتاريخ ${date} الساعة ${openSlot.timeSlot}. يرجى التأكيد خلال ${state.settings.waitlistOfferExpirationMinutes} دقيقة.`,
    bodyEn: `A slot opened with ${doctor.nameEn} on ${date} at ${openSlot.timeSlot}. Please confirm within ${state.settings.waitlistOfferExpirationMinutes} minutes.`,
    channel: 'in_app',
    read: false,
    createdAt: now.toISOString(),
  });

  state.auditLogs.unshift({
    id: makeId('audit'),
    actorUid: 'system',
    actorRole: 'system',
    action: 'WAITLIST_OFFER_SENT',
    targetType: 'waitlist',
    targetId: nextWaiting.id,
    summaryAr: `تم إرسال عرض موعد الساعة ${openSlot.timeSlot} بتاريخ ${date} للمريض ${nextWaiting.patientName} من قائمة الانتظار.`,
    summaryEn: `Offered ${openSlot.timeSlot} on ${date} to waitlisted patient ${nextWaiting.patientName}.`,
    createdAt: now.toISOString(),
  });

  return nextWaiting;
}

// ============================================================================
// CLOUD FIRESTORE SEEDING & TRANSACTION HELPERS
// ============================================================================
const seededFirestoreEnvs: Record<StoreEnv, boolean> = {
  demo: false,
  production: false,
};
const seedingInFlight: Partial<Record<StoreEnv, Promise<void>>> = {};

async function commitBatchedWrites(
  db: Firestore,
  ops: Array<{ ref: DocumentReference; data: Record<string, unknown> }>
): Promise<void> {
  const CHUNK_SIZE = 400;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const batch = db.batch();
    const slice = ops.slice(i, i + CHUNK_SIZE);
    for (const item of slice) {
      batch.set(item.ref, sanitizeDoc(item.data));
    }
    await batch.commit();
  }
}

async function seedFirestoreEnvironment(db: Firestore, env: StoreEnv): Promise<void> {
  const seeded = buildSeedDatabase();
  const ops: Array<{ ref: DocumentReference; data: Record<string, unknown> }> = [];

  for (const sp of seeded.specialties) {
    ops.push({
      ref: db.collection(colName(env, 'specialties')).doc(sp.id),
      data: { ...sp },
    });
  }
  for (const docItem of seeded.doctors) {
    ops.push({
      ref: db.collection(colName(env, 'doctors')).doc(docItem.id),
      data: { ...docItem },
    });
  }
  for (const sched of seeded.schedules) {
    ops.push({
      ref: db.collection(colName(env, 'doctorSchedules')).doc(sched.id),
      data: { ...sched },
    });
  }
  ops.push({
    ref: db.collection(colName(env, 'clinicSettings')).doc('default'),
    data: {
      ...seeded.settings,
      updatedAt: toTs(seeded.settings.updatedAt),
    },
  });

  if (env === 'demo') {
    for (const exc of seeded.exceptions) {
      ops.push({
        ref: db.collection(colName(env, 'scheduleExceptions')).doc(exc.id),
        data: { ...exc },
      });
    }

    const capCounts = new Map<string, { doctorId: string; date: string; count: number; maxCap: number }>();
    for (const apt of seeded.appointments) {
      ops.push({
        ref: db.collection(colName(env, 'appointments')).doc(apt.id),
        data: {
          ...apt,
          createdAt: toTs(apt.createdAt),
          updatedAt: toTs(apt.updatedAt),
        },
      });
      if (apt.status === 'confirmed' || apt.status === 'checked_in') {
        const key = dailyCapDocId(apt.doctorId, apt.date);
        const sched = seeded.schedules.find((s) => s.doctorId === apt.doctorId);
        const prev = capCounts.get(key) ?? {
          doctorId: apt.doctorId,
          date: apt.date,
          count: 0,
          maxCap: sched?.dailyCapacity ?? 20,
        };
        prev.count += 1;
        capCounts.set(key, prev);

        const resId = slotDocId(apt.doctorId, apt.date, apt.timeSlot);
        ops.push({
          ref: db.collection(colName(env, 'slotReservations')).doc(resId),
          data: {
            id: resId,
            doctorId: apt.doctorId,
            date: apt.date,
            timeSlot: apt.timeSlot,
            appointmentId: apt.id,
            status: 'active',
          },
        });
      }
    }

    for (const [id, info] of capCounts.entries()) {
      ops.push({
        ref: db.collection(colName(env, 'dailyCapacity')).doc(id),
        data: {
          id,
          doctorId: info.doctorId,
          date: info.date,
          bookedCount: info.count,
          maxCapacity: info.maxCap,
          updatedAt: Timestamp.now(),
        },
      });
    }

    for (const w of seeded.waitlist) {
      ops.push({
        ref: db.collection(colName(env, 'waitlist')).doc(w.id),
        data: {
          ...w,
          ...(w.offerExpiresAt ? { offerExpiresAt: toTs(w.offerExpiresAt) } : {}),
          createdAt: toTs(w.createdAt),
        },
      });
    }
    for (const n of seeded.notifications) {
      ops.push({
        ref: db.collection(colName(env, 'notifications')).doc(n.id),
        data: {
          ...n,
          createdAt: toTs(n.createdAt),
        },
      });
    }
    for (const a of seeded.auditLogs) {
      ops.push({
        ref: db.collection(colName(env, 'auditLogs')).doc(a.id),
        data: {
          ...a,
          createdAt: toTs(a.createdAt),
        },
      });
    }

    ops.push({
      ref: db.collection(colName(env, 'patientProfiles')).doc('demo-patient-1'),
      data: {
        uid: 'demo-patient-1',
        fullName: 'محمود عبد الله حسن',
        phone: '01012345601',
        email: 'patient.demo@clinicflow.local',
        preferredLanguage: 'ar-EG',
        elderlyAssistMode: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
    });
  }

  ops.push({
    ref: db.collection(colName(env, 'systemMeta')).doc('bootstrap'),
    data: {
      initializedAt: Timestamp.now(),
      env,
      scenarioDate: seeded.scenarioDate,
      scenarioDoctorId: seeded.scenarioDoctorId,
    },
  });

  await commitBatchedWrites(db, ops);
}

async function ensureSeededFirestore(db: Firestore, env: StoreEnv): Promise<void> {
  if (seededFirestoreEnvs[env]) return;
  if (seedingInFlight[env]) return seedingInFlight[env];

  seedingInFlight[env] = (async () => {
    try {
      const metaSnap = await db.collection(colName(env, 'systemMeta')).doc('bootstrap').get();
      if (!metaSnap.exists) {
        await seedFirestoreEnvironment(db, env);
      }
      seededFirestoreEnvs[env] = true;
    } finally {
      delete seedingInFlight[env];
    }
  })();

  return seedingInFlight[env];
}

async function fetchFullStateFromFirestore(db: Firestore, env: StoreEnv): Promise<DatabaseState> {
  await ensureSeededFirestore(db, env);

  const [
    specSnap,
    docSnap,
    schedSnap,
    excSnap,
    settingsSnap,
    aptSnap,
    wlSnap,
    notifSnap,
    auditSnap,
    staffSnap,
    profileSnap,
    metaSnap,
  ] = await Promise.all([
    db.collection(colName(env, 'specialties')).get(),
    db.collection(colName(env, 'doctors')).get(),
    db.collection(colName(env, 'doctorSchedules')).get(),
    db.collection(colName(env, 'scheduleExceptions')).get(),
    db.collection(colName(env, 'clinicSettings')).doc('default').get(),
    db.collection(colName(env, 'appointments')).get(),
    db.collection(colName(env, 'waitlist')).get(),
    db.collection(colName(env, 'notifications')).get(),
    db.collection(colName(env, 'auditLogs')).get(),
    db.collection(colName(env, 'staffAccounts')).get(),
    db.collection(colName(env, 'patientProfiles')).get(),
    db.collection(colName(env, 'systemMeta')).doc('bootstrap').get(),
  ]);

  const fallback = buildSeedDatabase();
  const metaData = metaSnap.data() as { scenarioDate?: string; scenarioDoctorId?: string } | undefined;

  const appointments = aptSnap.docs
    .map((d) => mapAppointmentFromFs(d.data()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const waitlist = wlSnap.docs
    .map((d) => mapWaitlistFromFs(d.data()))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const notifications = notifSnap.docs
    .map((d) => mapNotificationFromFs(d.data()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const auditLogs = auditSnap.docs
    .map((d) => mapAuditFromFs(d.data()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const patientProfiles: Record<string, PatientProfile> = {};
  for (const d of profileSnap.docs) {
    const p = mapProfileFromFs(d.data());
    patientProfiles[p.uid] = p;
  }

  return {
    scenarioDate: metaData?.scenarioDate ?? fallback.scenarioDate,
    scenarioDoctorId: metaData?.scenarioDoctorId ?? fallback.scenarioDoctorId,
    specialties: specSnap.docs.map((d) => d.data() as Specialty),
    doctors: docSnap.docs.map((d) => d.data() as Doctor),
    schedules: schedSnap.docs.map((d) => d.data() as DoctorSchedule),
    exceptions: excSnap.docs.map((d) => d.data() as ScheduleException),
    settings: settingsSnap.exists
      ? mapSettingsFromFs(settingsSnap.data()!)
      : fallback.settings,
    appointments,
    waitlist,
    notifications,
    auditLogs,
    staffAccounts: staffSnap.docs.map((d) => mapStaffFromFs(d.data())),
    patientProfiles,
  };
}

async function expireAndPromoteWaitlistFirestore(
  db: Firestore,
  env: StoreEnv,
  now: Date = new Date()
): Promise<void> {
  const offeredSnap = await db
    .collection(colName(env, 'waitlist'))
    .where('status', '==', 'offered')
    .get();

  const expiredPairs = new Set<string>();
  const expireBatch = db.batch();
  let hasExpired = false;

  for (const docSnap of offeredSnap.docs) {
    const entry = mapWaitlistFromFs(docSnap.data());
    if (entry.offerExpiresAt && now.getTime() > new Date(entry.offerExpiresAt).getTime()) {
      expireBatch.update(docSnap.ref, { status: 'expired' });
      expiredPairs.add(`${entry.doctorId}|${entry.date}`);
      hasExpired = true;
    }
  }

  if (hasExpired) {
    await expireBatch.commit();
    for (const pair of expiredPairs) {
      const [doctorId, date] = pair.split('|');
      await db.runTransaction(async (tx) => {
        await promoteNextWaitlistInTx(tx, db, env, doctorId, date, now);
      });
    }
  }
}

async function promoteNextWaitlistInTx(
  tx: Transaction,
  db: Firestore,
  env: StoreEnv,
  doctorId: string,
  date: string,
  now: Date,
  cancelledAppointmentId?: string
): Promise<WaitlistEntry | null> {
  const doctorRef = db.collection(colName(env, 'doctors')).doc(doctorId);
  const scheduleRef = db.collection(colName(env, 'doctorSchedules')).doc(`sched-${doctorId}`);
  const settingsRef = db.collection(colName(env, 'clinicSettings')).doc('default');
  const excQuery = db
    .collection(colName(env, 'scheduleExceptions'))
    .where('doctorId', '==', doctorId)
    .where('date', '==', date);
  const aptQuery = db
    .collection(colName(env, 'appointments'))
    .where('doctorId', '==', doctorId)
    .where('date', '==', date);
  const wlQuery = db
    .collection(colName(env, 'waitlist'))
    .where('doctorId', '==', doctorId)
    .where('date', '==', date);

  const [doctorSnap, schedSnap, settingsSnap, excSnap, aptSnap, wlSnap] = await Promise.all([
    tx.get(doctorRef),
    tx.get(scheduleRef),
    tx.get(settingsRef),
    tx.get(excQuery),
    tx.get(aptQuery),
    tx.get(wlQuery),
  ]);

  if (!doctorSnap.exists || !schedSnap.exists) return null;
  const doctor = doctorSnap.data() as Doctor;
  const schedule = schedSnap.data() as DoctorSchedule;
  const settings = settingsSnap.exists
    ? mapSettingsFromFs(settingsSnap.data()!)
    : buildSeedDatabase().settings;
  const exceptions = excSnap.docs.map((d) => d.data() as ScheduleException);
  const appointments = aptSnap.docs
    .map((d) => mapAppointmentFromFs(d.data()))
    .map((a) => (cancelledAppointmentId && a.id === cancelledAppointmentId ? { ...a, status: 'cancelled' as const } : a));
  const wlEntries = wlSnap.docs.map((d) => mapWaitlistFromFs(d.data()));

  const hasActiveOffer = wlEntries.some(
    (w) => w.status === 'offered' && isWaitlistOfferValid(w, now)
  );
  if (hasActiveOffer) return null;

  const avail = computeDayAvailability({
    doctor,
    schedule,
    exceptions,
    appointments,
    dateStr: date,
    timeZone: settings.timezone,
    now,
  });

  const openSlot = avail.slots.find((s) => s.available);
  if (!openSlot || avail.remainingCapacity <= 0) return null;

  const nextWaiting = wlEntries
    .filter((w) => w.status === 'waiting')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

  if (!nextWaiting) return null;

  const expiresAtIso = new Date(
    now.getTime() + settings.waitlistOfferExpirationMinutes * 60000
  ).toISOString();

  const updatedEntry: WaitlistEntry = {
    ...nextWaiting,
    status: 'offered',
    offeredTimeSlot: openSlot.timeSlot,
    offerExpiresAt: expiresAtIso,
  };

  const notifId = makeId('notif');
  const auditId = makeId('audit');

  tx.update(db.collection(colName(env, 'waitlist')).doc(nextWaiting.id), {
    status: 'offered',
    offeredTimeSlot: openSlot.timeSlot,
    offerExpiresAt: toTs(expiresAtIso),
  });

  tx.set(db.collection(colName(env, 'notifications')).doc(notifId), {
    id: notifId,
    recipientUid: nextWaiting.patientUid,
    titleAr: 'توفر موعد من قائمة الانتظار',
    titleEn: 'Waitlist Appointment Slot Available',
    bodyAr: `تتوفر فرصة حجز مع ${doctor.nameAr} بتاريخ ${date} الساعة ${openSlot.timeSlot}. يرجى التأكيد خلال ${settings.waitlistOfferExpirationMinutes} دقيقة.`,
    bodyEn: `A slot opened with ${doctor.nameEn} on ${date} at ${openSlot.timeSlot}. Please confirm within ${settings.waitlistOfferExpirationMinutes} minutes.`,
    channel: 'in_app',
    read: false,
    createdAt: Timestamp.fromDate(now),
  });

  tx.set(db.collection(colName(env, 'auditLogs')).doc(auditId), {
    id: auditId,
    actorUid: 'system',
    actorRole: 'system',
    action: 'WAITLIST_OFFER_SENT',
    targetType: 'waitlist',
    targetId: nextWaiting.id,
    summaryAr: `تم إرسال عرض موعد الساعة ${openSlot.timeSlot} بتاريخ ${date} للمريض ${nextWaiting.patientName} من قائمة الانتظار.`,
    summaryEn: `Offered ${openSlot.timeSlot} on ${date} to waitlisted patient ${nextWaiting.patientName}.`,
    createdAt: Timestamp.fromDate(now),
  });

  return updatedEntry;
}

// ============================================================================
// PUBLIC STORE API (Firestore Transactions -> Ephemeral RAM fallback)
// ============================================================================

export async function resolveStaffRoleFromStore(
  email?: string,
  uid?: string
): Promise<UserRole | null> {
  const adminCtx = getAdminFirebase();
  const normalizedEmail = email?.trim().toLowerCase();

  if (adminCtx) {
    const { db } = adminCtx;
    if (uid) {
      const [adminDoc, recDoc] = await Promise.all([
        db.collection('admins').doc(uid).get(),
        db.collection('receptionists').doc(uid).get(),
      ]);
      if (adminDoc.exists) return 'admin';
      if (recDoc.exists) return 'receptionist';
    }
    if (normalizedEmail) {
      const staffSnap = await db
        .collection('staffAccounts')
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();
      if (!staffSnap.empty) {
        const staff = mapStaffFromFs(staffSnap.docs[0]!.data());
        return staff.role;
      }
    }
    return null;
  }

  return withStoreLock(async () => {
    const state = loadMemoryState('production');
    if (normalizedEmail) {
      const staff = state.staffAccounts.find(
        (s) => s.email.toLowerCase() === normalizedEmail
      );
      if (staff) return staff.role;
    }
    return null;
  });
}

function buildOccupancyMap(state: DatabaseState, today: string, now: Date) {
  const occupancyByDoctorDate: Record<string, DoctorDateOccupancy> = {};
  for (const doc of state.doctors) {
    if (!doc.active) continue;
    const sched = state.schedules.find((s) => s.doctorId === doc.id);
    if (!sched) continue;
    for (let i = 0; i < 14; i++) {
      const dStr = addDaysToDateStr(today, i);
      const avail = computeDayAvailability({
        doctor: doc,
        schedule: sched,
        exceptions: state.exceptions,
        appointments: state.appointments,
        dateStr: dStr,
        timeZone: state.settings.timezone,
        now,
      });
      occupancyByDoctorDate[`${doc.id}|${dStr}`] = {
        bookedCount: avail.bookedCount,
        dailyCapacity: avail.dailyCapacity,
        remainingCapacity: avail.remainingCapacity,
        isClosed: avail.isClosed || !avail.isWorkingDay || avail.bookingsPaused,
      };
    }
  }
  return occupancyByDoctorDate;
}

export async function getStateForRole(params: {
  role: UserRole;
  uid: string;
  demoMode: boolean;
}) {
  const env = resolveEnv(params.demoMode);
  const adminCtx = getAdminFirebase();

  const buildPayload = (state: DatabaseState) => {
    const now = new Date();
    const { dateStr: today } = getNowInTimezone(now, state.settings.timezone);

    const visibleAppointments =
      params.role === 'admin' || params.role === 'receptionist'
        ? state.appointments
        : params.role === 'patient'
          ? state.appointments.filter((a) => a.patientUid === params.uid)
          : [];

    const visibleWaitlist =
      params.role === 'admin' || params.role === 'receptionist'
        ? state.waitlist
        : params.role === 'patient'
          ? state.waitlist.filter((w) => w.patientUid === params.uid)
          : [];

    const visibleNotifications =
      params.role === 'admin'
        ? state.notifications
        : params.role === 'patient' || params.role === 'receptionist'
          ? state.notifications.filter((n) => n.recipientUid === params.uid)
          : [];

    const analytics = computeAnalyticsSummary({
      specialties: state.specialties,
      doctors: state.doctors,
      schedules: state.schedules,
      appointments: state.appointments,
      waitlist: state.waitlist,
      settings: state.settings,
      todayDateStr: today,
    });

    return {
      demoMode: params.demoMode,
      scenarioDate: state.scenarioDate,
      scenarioDoctorId: state.scenarioDoctorId,
      specialties: state.specialties,
      doctors: state.doctors,
      schedules: state.schedules,
      exceptions: state.exceptions,
      settings: state.settings,
      appointments: visibleAppointments,
      waitlist: visibleWaitlist,
      notifications: visibleNotifications,
      auditLogs: params.role === 'admin' ? state.auditLogs : [],
      staffAccounts: params.role === 'admin' ? state.staffAccounts : [],
      patientProfile: params.uid ? state.patientProfiles[params.uid] : undefined,
      occupancyByDoctorDate: buildOccupancyMap(state, today, now),
      analytics,
    };
  };

  if (adminCtx) {
    await ensureSeededFirestore(adminCtx.db, env);
    await expireAndPromoteWaitlistFirestore(adminCtx.db, env);
    const state = await fetchFullStateFromFirestore(adminCtx.db, env);
    return buildPayload(state);
  }

  return withStoreLock(async () => {
    const state = loadMemoryState(env);
    expireStaleOffersInMemory(state);
    return buildPayload(state);
  });
}

export async function getAvailabilityForDoctorDate(
  doctorId: string,
  dateStr: string,
  demoMode: boolean = true
): Promise<DayAvailability | null> {
  const env = resolveEnv(demoMode);
  const adminCtx = getAdminFirebase();

  if (adminCtx) {
    const { db } = adminCtx;
    await ensureSeededFirestore(db, env);
    await expireAndPromoteWaitlistFirestore(db, env);

    const [docSnap, schedSnap, settingsSnap, excSnap, aptSnap] = await Promise.all([
      db.collection(colName(env, 'doctors')).doc(doctorId).get(),
      db.collection(colName(env, 'doctorSchedules')).doc(`sched-${doctorId}`).get(),
      db.collection(colName(env, 'clinicSettings')).doc('default').get(),
      db
        .collection(colName(env, 'scheduleExceptions'))
        .where('doctorId', '==', doctorId)
        .where('date', '==', dateStr)
        .get(),
      db
        .collection(colName(env, 'appointments'))
        .where('doctorId', '==', doctorId)
        .where('date', '==', dateStr)
        .get(),
    ]);

    if (!docSnap.exists || !schedSnap.exists) return null;
    const doctor = docSnap.data() as Doctor;
    const schedule = schedSnap.data() as DoctorSchedule;
    const settings = settingsSnap.exists
      ? mapSettingsFromFs(settingsSnap.data()!)
      : buildSeedDatabase().settings;
    const exceptions = excSnap.docs.map((d) => d.data() as ScheduleException);
    const appointments = aptSnap.docs.map((d) => mapAppointmentFromFs(d.data()));

    return computeDayAvailability({
      doctor,
      schedule,
      exceptions,
      appointments,
      dateStr,
      timeZone: settings.timezone,
    });
  }

  return withStoreLock(async () => {
    const state = loadMemoryState(env);
    expireStaleOffersInMemory(state);
    const doctor = state.doctors.find((d) => d.id === doctorId);
    const schedule = state.schedules.find((s) => s.doctorId === doctorId);
    if (!doctor || !schedule) return null;
    return computeDayAvailability({
      doctor,
      schedule,
      exceptions: state.exceptions,
      appointments: state.appointments,
      dateStr,
      timeZone: state.settings.timezone,
    });
  });
}

export async function getNextSlotForDoctor(
  doctorId: string,
  demoMode: boolean = true
) {
  const env = resolveEnv(demoMode);
  const adminCtx = getAdminFirebase();

  if (adminCtx) {
    const state = await fetchFullStateFromFirestore(adminCtx.db, env);
    const doctor = state.doctors.find((d) => d.id === doctorId);
    const schedule = state.schedules.find((s) => s.doctorId === doctorId);
    if (!doctor || !schedule) return null;
    const { dateStr: today } = getNowInTimezone(new Date(), state.settings.timezone);
    return findNextAvailableSlot({
      doctor,
      schedule,
      exceptions: state.exceptions,
      appointments: state.appointments,
      startDateStr: today,
      daysToSearch: 21,
      timeZone: state.settings.timezone,
    });
  }

  return withStoreLock(async () => {
    const state = loadMemoryState(env);
    const doctor = state.doctors.find((d) => d.id === doctorId);
    const schedule = state.schedules.find((s) => s.doctorId === doctorId);
    if (!doctor || !schedule) return null;
    const { dateStr: today } = getNowInTimezone(new Date(), state.settings.timezone);
    return findNextAvailableSlot({
      doctor,
      schedule,
      exceptions: state.exceptions,
      appointments: state.appointments,
      startDateStr: today,
      daysToSearch: 21,
      timeZone: state.settings.timezone,
    });
  });
}

export async function createAppointmentAtomic(input: {
  patientUid: string;
  patientName: string;
  patientPhone: string;
  doctorId: string;
  date: string;
  timeSlot: string;
  bookingType: BookingType;
  notes?: string;
  actorUid: string;
  actorRole: UserRole;
  demoMode?: boolean;
}): Promise<Appointment> {
  const env = resolveEnv(input.demoMode);
  const adminCtx = getAdminFirebase();

  if (adminCtx) {
    const { db } = adminCtx;
    await ensureSeededFirestore(db, env);

    return db.runTransaction(async (tx) => {
      const now = new Date();
      const doctorRef = db.collection(colName(env, 'doctors')).doc(input.doctorId);
      const schedRef = db.collection(colName(env, 'doctorSchedules')).doc(`sched-${input.doctorId}`);
      const settingsRef = db.collection(colName(env, 'clinicSettings')).doc('default');
      const dailyCapRef = db
        .collection(colName(env, 'dailyCapacity'))
        .doc(dailyCapDocId(input.doctorId, input.date));
      const slotResRef = db
        .collection(colName(env, 'slotReservations'))
        .doc(slotDocId(input.doctorId, input.date, input.timeSlot));

      const excQuery = db
        .collection(colName(env, 'scheduleExceptions'))
        .where('doctorId', '==', input.doctorId)
        .where('date', '==', input.date);
      const aptQuery = db
        .collection(colName(env, 'appointments'))
        .where('doctorId', '==', input.doctorId)
        .where('date', '==', input.date);

      // All reads executed before any writes inside Firestore transaction
      const [doctorSnap, schedSnap, settingsSnap, dailyCapSnap, slotResSnap, excSnap, aptSnap] =
        await Promise.all([
          tx.get(doctorRef),
          tx.get(schedRef),
          tx.get(settingsRef),
          tx.get(dailyCapRef),
          tx.get(slotResRef),
          tx.get(excQuery),
          tx.get(aptQuery),
        ]);

      if (!doctorSnap.exists || !(doctorSnap.data() as Doctor).active) {
        throw new BookingError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found or inactive.');
      }
      const doctor = doctorSnap.data() as Doctor;
      const specialtySnap = await tx.get(
        db.collection(colName(env, 'specialties')).doc(doctor.specialtyId)
      );

      if (!schedSnap.exists || !specialtySnap.exists) {
        throw new BookingError(404, 'SCHEDULE_NOT_FOUND', 'Doctor schedule not configured.');
      }

      const schedule = schedSnap.data() as DoctorSchedule;
      const specialty = specialtySnap.data() as Specialty;
      const settings = settingsSnap.exists
        ? mapSettingsFromFs(settingsSnap.data()!)
        : buildSeedDatabase().settings;
      const exceptions = excSnap.docs.map((d) => d.data() as ScheduleException);
      const appointments = aptSnap.docs.map((d) => mapAppointmentFromFs(d.data()));

      const dayAvail = computeDayAvailability({
        doctor,
        schedule,
        exceptions,
        appointments,
        dateStr: input.date,
        timeZone: settings.timezone,
        now,
      });

      if (dayAvail.isClosed || !dayAvail.isWorkingDay || dayAvail.bookingsPaused) {
        throw new BookingError(409, 'CLINIC_CLOSED', 'Doctor is not available on the selected date.');
      }

      const existingBookedViaCap = dailyCapSnap.exists
        ? Number((dailyCapSnap.data() as { bookedCount?: number }).bookedCount ?? 0)
        : 0;
      const effectiveBooked = Math.max(dayAvail.bookedCount, existingBookedViaCap);

      if (dayAvail.remainingCapacity <= 0 || effectiveBooked >= dayAvail.dailyCapacity) {
        throw new BookingError(
          409,
          'CAPACITY_FULL',
          'Daily booking limit reached. Please join the waitlist.'
        );
      }

      const slot = dayAvail.slots.find((s) => s.timeSlot === input.timeSlot);
      if (!slot) {
        throw new BookingError(400, 'INVALID_SLOT', 'Selected time slot is outside doctor schedule.');
      }
      if (!slot.available) {
        const code = slot.reason === 'past' ? 'PAST_TIME_SLOT' : 'SLOT_UNAVAILABLE';
        throw new BookingError(409, code, `Time slot unavailable (${slot.reason ?? 'booked'}).`);
      }

      if (
        schedule.perSlotCapacity <= 1 &&
        slotResSnap.exists &&
        (slotResSnap.data() as { status?: string }).status === 'active'
      ) {
        throw new BookingError(409, 'SLOT_UNAVAILABLE', 'Time slot is already reserved.');
      }

      const duplicate = appointments.find(
        (a) =>
          a.patientUid === input.patientUid &&
          a.timeSlot === input.timeSlot &&
          (a.status === 'confirmed' || a.status === 'checked_in')
      );
      if (duplicate) {
        throw new BookingError(409, 'DUPLICATE_BOOKING', 'You already have an active booking for this slot.');
      }

      const aptId = makeId('apt');
      const nowIso = now.toISOString();
      const notesTrimmed = input.notes?.trim() || undefined;
      const apt: Appointment = {
        id: aptId,
        bookingRef: makeBookingRef(),
        patientUid: input.patientUid,
        patientName: input.patientName.trim(),
        patientPhone: input.patientPhone.trim(),
        doctorId: doctor.id,
        doctorNameSnapshotAr: doctor.nameAr,
        doctorNameSnapshotEn: doctor.nameEn,
        specialtyId: specialty.id,
        specialtyNameSnapshotAr: specialty.nameAr,
        specialtyNameSnapshotEn: specialty.nameEn,
        date: input.date,
        timeSlot: input.timeSlot,
        status: 'confirmed',
        bookingType: input.bookingType,
        ...(notesTrimmed ? { notes: notesTrimmed } : {}),
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const notifId = makeId('notif');
      const auditId = makeId('audit');
      const nowTs = Timestamp.fromDate(now);

      tx.set(
        db.collection(colName(env, 'appointments')).doc(apt.id),
        sanitizeDoc({
          ...apt,
          createdAt: nowTs,
          updatedAt: nowTs,
        })
      );

      tx.set(dailyCapRef, {
        id: dailyCapRef.id,
        doctorId: doctor.id,
        date: input.date,
        bookedCount: effectiveBooked + 1,
        maxCapacity: dayAvail.dailyCapacity,
        updatedAt: nowTs,
      });

      tx.set(slotResRef, {
        id: slotResRef.id,
        doctorId: doctor.id,
        date: input.date,
        timeSlot: input.timeSlot,
        appointmentId: apt.id,
        status: 'active',
      });

      tx.set(db.collection(colName(env, 'notifications')).doc(notifId), {
        id: notifId,
        recipientUid: input.patientUid,
        titleAr: `تأكيد الحجز ${apt.bookingRef}`,
        titleEn: `Booking Confirmed ${apt.bookingRef}`,
        bodyAr: `تم تأكيد موعدك مع ${doctor.nameAr} يوم ${apt.date} الساعة ${apt.timeSlot}.`,
        bodyEn: `Your appointment with ${doctor.nameEn} on ${apt.date} at ${apt.timeSlot} is confirmed.`,
        channel: 'in_app',
        read: false,
        createdAt: nowTs,
      });

      tx.set(db.collection(colName(env, 'auditLogs')).doc(auditId), {
        id: auditId,
        actorUid: input.actorUid,
        actorRole: input.actorRole,
        action: 'CREATE_APPOINTMENT',
        targetType: 'appointment',
        targetId: apt.id,
        summaryAr: `تم حجز الموعد ${apt.bookingRef} (${doctor.nameAr}) بتاريخ ${apt.date} الساعة ${apt.timeSlot}.`,
        summaryEn: `Created appointment ${apt.bookingRef} (${doctor.nameEn}) on ${apt.date} at ${apt.timeSlot}.`,
        createdAt: nowTs,
      });

      return apt;
    });
  }

  return withStoreLock(async () => {
    const state = loadMemoryState(env);
    const now = new Date();
    expireStaleOffersInMemory(state, now);

    const doctor = state.doctors.find((d) => d.id === input.doctorId && d.active);
    if (!doctor) {
      throw new BookingError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found or inactive.');
    }
    const schedule = state.schedules.find((s) => s.doctorId === doctor.id);
    const specialty = state.specialties.find((s) => s.id === doctor.specialtyId);
    if (!schedule || !specialty) {
      throw new BookingError(404, 'SCHEDULE_NOT_FOUND', 'Doctor schedule not configured.');
    }

    const dayAvail = computeDayAvailability({
      doctor,
      schedule,
      exceptions: state.exceptions,
      appointments: state.appointments,
      dateStr: input.date,
      timeZone: state.settings.timezone,
      now,
    });

    if (dayAvail.isClosed || !dayAvail.isWorkingDay || dayAvail.bookingsPaused) {
      throw new BookingError(409, 'CLINIC_CLOSED', 'Doctor is not available on the selected date.');
    }

    if (dayAvail.remainingCapacity <= 0) {
      throw new BookingError(
        409,
        'CAPACITY_FULL',
        'Daily booking limit reached. Please join the waitlist.'
      );
    }

    const slot = dayAvail.slots.find((s) => s.timeSlot === input.timeSlot);
    if (!slot) {
      throw new BookingError(400, 'INVALID_SLOT', 'Selected time slot is outside doctor schedule.');
    }
    if (!slot.available) {
      const code = slot.reason === 'past' ? 'PAST_TIME_SLOT' : 'SLOT_UNAVAILABLE';
      throw new BookingError(409, code, `Time slot unavailable (${slot.reason ?? 'booked'}).`);
    }

    const duplicate = state.appointments.find(
      (a) =>
        a.patientUid === input.patientUid &&
        a.doctorId === input.doctorId &&
        a.date === input.date &&
        a.timeSlot === input.timeSlot &&
        (a.status === 'confirmed' || a.status === 'checked_in')
    );
    if (duplicate) {
      throw new BookingError(409, 'DUPLICATE_BOOKING', 'You already have an active booking for this slot.');
    }

    const apt: Appointment = {
      id: makeId('apt'),
      bookingRef: makeBookingRef(),
      patientUid: input.patientUid,
      patientName: input.patientName.trim(),
      patientPhone: input.patientPhone.trim(),
      doctorId: doctor.id,
      doctorNameSnapshotAr: doctor.nameAr,
      doctorNameSnapshotEn: doctor.nameEn,
      specialtyId: specialty.id,
      specialtyNameSnapshotAr: specialty.nameAr,
      specialtyNameSnapshotEn: specialty.nameEn,
      date: input.date,
      timeSlot: input.timeSlot,
      status: 'confirmed',
      bookingType: input.bookingType,
      notes: input.notes?.trim() || undefined,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    state.appointments.unshift(apt);

    state.notifications.unshift({
      id: makeId('notif'),
      recipientUid: input.patientUid,
      titleAr: `تأكيد الحجز ${apt.bookingRef}`,
      titleEn: `Booking Confirmed ${apt.bookingRef}`,
      bodyAr: `تم تأكيد موعدك مع ${doctor.nameAr} يوم ${apt.date} الساعة ${apt.timeSlot}.`,
      bodyEn: `Your appointment with ${doctor.nameEn} on ${apt.date} at ${apt.timeSlot} is confirmed.`,
      channel: 'in_app',
      read: false,
      createdAt: now.toISOString(),
    });

    state.auditLogs.unshift({
      id: makeId('audit'),
      actorUid: input.actorUid,
      actorRole: input.actorRole,
      action: 'CREATE_APPOINTMENT',
      targetType: 'appointment',
      targetId: apt.id,
      summaryAr: `تم حجز الموعد ${apt.bookingRef} (${doctor.nameAr}) بتاريخ ${apt.date} الساعة ${apt.timeSlot}.`,
      summaryEn: `Created appointment ${apt.bookingRef} (${doctor.nameEn}) on ${apt.date} at ${apt.timeSlot}.`,
      createdAt: now.toISOString(),
    });

    return apt;
  });
}

export async function cancelAppointmentAtomic(input: {
  appointmentId: string;
  actorUid: string;
  actorRole: UserRole;
  demoMode?: boolean;
}): Promise<{ appointment: Appointment; promotedWaitlist: WaitlistEntry | null }> {
  const env = resolveEnv(input.demoMode);
  const adminCtx = getAdminFirebase();

  if (adminCtx) {
    const { db } = adminCtx;
    await ensureSeededFirestore(db, env);

    return db.runTransaction(async (tx) => {
      const now = new Date();
      const byIdRef = db.collection(colName(env, 'appointments')).doc(input.appointmentId);
      const [byIdSnap, byRefSnap, settingsSnap] = await Promise.all([
        tx.get(byIdRef),
        tx.get(
          db
            .collection(colName(env, 'appointments'))
            .where('bookingRef', '==', input.appointmentId)
            .limit(1)
        ),
        tx.get(db.collection(colName(env, 'clinicSettings')).doc('default')),
      ]);

      const targetDoc = byIdSnap.exists
        ? byIdSnap
        : !byRefSnap.empty
          ? byRefSnap.docs[0]!
          : null;

      if (!targetDoc) {
        throw new BookingError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }

      const apt = mapAppointmentFromFs(targetDoc.data()!);
      if (input.actorRole === 'patient' && apt.patientUid !== input.actorUid) {
        throw new BookingError(403, 'FORBIDDEN', 'Cannot cancel another patient appointment.');
      }

      const settings = settingsSnap.exists
        ? mapSettingsFromFs(settingsSnap.data()!)
        : buildSeedDatabase().settings;

      const check = canCancelAppointment({
        appointment: apt,
        actorRole: input.actorRole,
        cutoffHours: settings.cancellationCutoffHours,
        timeZone: settings.timezone,
        now,
      });
      if (!check.allowed) {
        const code = check.reason === 'cutoff_passed' ? 'CUTOFF_PASSED' : 'CANNOT_CANCEL';
        throw new BookingError(409, code, `Cancellation rejected: ${check.reason}`);
      }

      const dailyCapRef = db
        .collection(colName(env, 'dailyCapacity'))
        .doc(dailyCapDocId(apt.doctorId, apt.date));
      const slotResRef = db
        .collection(colName(env, 'slotReservations'))
        .doc(slotDocId(apt.doctorId, apt.date, apt.timeSlot));

      const doctorRef = db.collection(colName(env, 'doctors')).doc(apt.doctorId);
      const schedRef = db.collection(colName(env, 'doctorSchedules')).doc(`sched-${apt.doctorId}`);
      const excQuery = db
        .collection(colName(env, 'scheduleExceptions'))
        .where('doctorId', '==', apt.doctorId)
        .where('date', '==', apt.date);
      const sameDayAptsQuery = db
        .collection(colName(env, 'appointments'))
        .where('doctorId', '==', apt.doctorId)
        .where('date', '==', apt.date);
      const wlQuery = db
        .collection(colName(env, 'waitlist'))
        .where('doctorId', '==', apt.doctorId)
        .where('date', '==', apt.date);

      const [dailyCapSnap, slotResSnap, doctorSnap, schedSnap, excSnap, sameDayAptsSnap, wlSnap] =
        await Promise.all([
          tx.get(dailyCapRef),
          tx.get(slotResRef),
          tx.get(doctorRef),
          tx.get(schedRef),
          tx.get(excQuery),
          tx.get(sameDayAptsQuery),
          tx.get(wlQuery),
        ]);

      const nowTs = Timestamp.fromDate(now);
      const nowIso = now.toISOString();
      const updatedApt: Appointment = { ...apt, status: 'cancelled', updatedAt: nowIso };

      // Calculate post-cancel availability & waitlist promotion before writing
      let promotedWaitlist: WaitlistEntry | null = null;
      let nextOpenSlot: string | null = null;
      let nextWaitingEntry: WaitlistEntry | null = null;
      let doctorNameAr = apt.doctorNameSnapshotAr;
      let doctorNameEn = apt.doctorNameSnapshotEn;

      if (doctorSnap.exists && schedSnap.exists) {
        const doctor = doctorSnap.data() as Doctor;
        const schedule = schedSnap.data() as DoctorSchedule;
        doctorNameAr = doctor.nameAr;
        doctorNameEn = doctor.nameEn;
        const exceptions = excSnap.docs.map((d) => d.data() as ScheduleException);
        const postCancelApts = sameDayAptsSnap.docs
          .map((d) => mapAppointmentFromFs(d.data()))
          .map((a) => (a.id === apt.id ? updatedApt : a));
        const wlEntries = wlSnap.docs.map((d) => mapWaitlistFromFs(d.data()));

        const hasActiveOffer = wlEntries.some(
          (w) => w.status === 'offered' && isWaitlistOfferValid(w, now)
        );
        if (!hasActiveOffer) {
          const avail = computeDayAvailability({
            doctor,
            schedule,
            exceptions,
            appointments: postCancelApts,
            dateStr: apt.date,
            timeZone: settings.timezone,
            now,
          });
          const open = avail.slots.find((s) => s.available);
          if (open && avail.remainingCapacity > 0) {
            const candidate = wlEntries
              .filter((w) => w.status === 'waiting')
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
            if (candidate) {
              nextOpenSlot = open.timeSlot;
              nextWaitingEntry = candidate;
            }
          }
        }
      }

      // Perform all writes
      tx.update(targetDoc.ref, { status: 'cancelled', updatedAt: nowTs });

      if (dailyCapSnap.exists) {
        const prevCount = Number((dailyCapSnap.data() as { bookedCount?: number }).bookedCount ?? 1);
        tx.update(dailyCapRef, {
          bookedCount: Math.max(0, prevCount - 1),
          updatedAt: nowTs,
        });
      }

      const otherActiveInSlot = sameDayAptsSnap.docs
        .map((d) => mapAppointmentFromFs(d.data()))
        .some(
          (a) =>
            a.id !== apt.id &&
            a.timeSlot === apt.timeSlot &&
            (a.status === 'confirmed' || a.status === 'checked_in')
        );
      if (slotResSnap.exists && !otherActiveInSlot) {
        tx.update(slotResRef, { status: 'released' });
      }

      const cancelNotifId = makeId('notif');
      tx.set(db.collection(colName(env, 'notifications')).doc(cancelNotifId), {
        id: cancelNotifId,
        recipientUid: apt.patientUid,
        titleAr: `إلغاء الموعد ${apt.bookingRef}`,
        titleEn: `Appointment Cancelled ${apt.bookingRef}`,
        bodyAr: `تم إلغاء موعدك بتاريخ ${apt.date} الساعة ${apt.timeSlot}.`,
        bodyEn: `Your appointment on ${apt.date} at ${apt.timeSlot} has been cancelled.`,
        channel: 'in_app',
        read: false,
        createdAt: nowTs,
      });

      const cancelAuditId = makeId('audit');
      tx.set(db.collection(colName(env, 'auditLogs')).doc(cancelAuditId), {
        id: cancelAuditId,
        actorUid: input.actorUid,
        actorRole: input.actorRole,
        action: 'CANCEL_APPOINTMENT',
        targetType: 'appointment',
        targetId: apt.id,
        summaryAr: `تم إلغاء الموعد ${apt.bookingRef} (${apt.doctorNameSnapshotAr}) بتاريخ ${apt.date}.`,
        summaryEn: `Cancelled appointment ${apt.bookingRef} (${apt.doctorNameSnapshotEn}) on ${apt.date}.`,
        createdAt: nowTs,
      });

      if (nextWaitingEntry && nextOpenSlot) {
        const expiresAtIso = new Date(
          now.getTime() + settings.waitlistOfferExpirationMinutes * 60000
        ).toISOString();
        promotedWaitlist = {
          ...nextWaitingEntry,
          status: 'offered',
          offeredTimeSlot: nextOpenSlot,
          offerExpiresAt: expiresAtIso,
        };
        tx.update(db.collection(colName(env, 'waitlist')).doc(nextWaitingEntry.id), {
          status: 'offered',
          offeredTimeSlot: nextOpenSlot,
          offerExpiresAt: toTs(expiresAtIso),
        });
        const wlNotifId = makeId('notif');
        tx.set(db.collection(colName(env, 'notifications')).doc(wlNotifId), {
          id: wlNotifId,
          recipientUid: nextWaitingEntry.patientUid,
          titleAr: 'توفر موعد من قائمة الانتظار',
          titleEn: 'Waitlist Appointment Slot Available',
          bodyAr: `تتوفر فرصة حجز مع ${doctorNameAr} بتاريخ ${apt.date} الساعة ${nextOpenSlot}. يرجى التأكيد خلال ${settings.waitlistOfferExpirationMinutes} دقيقة.`,
          bodyEn: `A slot opened with ${doctorNameEn} on ${apt.date} at ${nextOpenSlot}. Please confirm within ${settings.waitlistOfferExpirationMinutes} minutes.`,
          channel: 'in_app',
          read: false,
          createdAt: nowTs,
        });
        const wlAuditId = makeId('audit');
        tx.set(db.collection(colName(env, 'auditLogs')).doc(wlAuditId), {
          id: wlAuditId,
          actorUid: 'system',
          actorRole: 'system',
          action: 'WAITLIST_OFFER_SENT',
          targetType: 'waitlist',
          targetId: nextWaitingEntry.id,
          summaryAr: `تم إرسال عرض موعد الساعة ${nextOpenSlot} بتاريخ ${apt.date} للمريض ${nextWaitingEntry.patientName} من قائمة الانتظار.`,
          summaryEn: `Offered ${nextOpenSlot} on ${apt.date} to waitlisted patient ${nextWaitingEntry.patientName}.`,
          createdAt: nowTs,
        });
      }

      return { appointment: updatedApt, promotedWaitlist };
    });
  }

  return withStoreLock(async () => {
    const state = loadMemoryState(env);
    const now = new Date();
    const apt = state.appointments.find(
      (a) => a.id === input.appointmentId || a.bookingRef === input.appointmentId
    );
    if (!apt) {
      throw new BookingError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
    }

    if (input.actorRole === 'patient' && apt.patientUid !== input.actorUid) {
      throw new BookingError(403, 'FORBIDDEN', 'Cannot cancel another patient appointment.');
    }

    const check = canCancelAppointment({
      appointment: apt,
      actorRole: input.actorRole,
      cutoffHours: state.settings.cancellationCutoffHours,
      timeZone: state.settings.timezone,
      now,
    });
    if (!check.allowed) {
      const code = check.reason === 'cutoff_passed' ? 'CUTOFF_PASSED' : 'CANNOT_CANCEL';
      throw new BookingError(409, code, `Cancellation rejected: ${check.reason}`);
    }

    apt.status = 'cancelled';
    apt.updatedAt = now.toISOString();

    state.notifications.unshift({
      id: makeId('notif'),
      recipientUid: apt.patientUid,
      titleAr: `إلغاء الموعد ${apt.bookingRef}`,
      titleEn: `Appointment Cancelled ${apt.bookingRef}`,
      bodyAr: `تم إلغاء موعدك بتاريخ ${apt.date} الساعة ${apt.timeSlot}.`,
      bodyEn: `Your appointment on ${apt.date} at ${apt.timeSlot} has been cancelled.`,
      channel: 'in_app',
      read: false,
      createdAt: now.toISOString(),
    });

    state.auditLogs.unshift({
      id: makeId('audit'),
      actorUid: input.actorUid,
      actorRole: input.actorRole,
      action: 'CANCEL_APPOINTMENT',
      targetType: 'appointment',
      targetId: apt.id,
      summaryAr: `تم إلغاء الموعد ${apt.bookingRef} (${apt.doctorNameSnapshotAr}) بتاريخ ${apt.date}.`,
      summaryEn: `Cancelled appointment ${apt.bookingRef} (${apt.doctorNameSnapshotEn}) on ${apt.date}.`,
      createdAt: now.toISOString(),
    });

    const promotedWaitlist = promoteNextWaitlistEntryInMemory(state, apt.doctorId, apt.date, now);
    return { appointment: apt, promotedWaitlist };
  });
}

export async function updateAppointmentStatusAtomic(input: {
  appointmentId: string;
  nextStatus: AppointmentStatus;
  actorUid: string;
  actorRole: UserRole;
  demoMode?: boolean;
}): Promise<Appointment> {
  const env = resolveEnv(input.demoMode);
  const adminCtx = getAdminFirebase();

  if (adminCtx) {
    const { db } = adminCtx;
    await ensureSeededFirestore(db, env);

    return db.runTransaction(async (tx) => {
      const now = new Date();
      const aptRef = db.collection(colName(env, 'appointments')).doc(input.appointmentId);
      const aptSnap = await tx.get(aptRef);
      if (!aptSnap.exists) {
        throw new BookingError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }

      const apt = mapAppointmentFromFs(aptSnap.data()!);
      if (!isValidStatusTransition(apt.status, input.nextStatus, input.actorRole)) {
        throw new BookingError(
          409,
          'INVALID_STATUS_TRANSITION',
          `Cannot transition appointment from ${apt.status} to ${input.nextStatus}.`
        );
      }

      const prevStatus = apt.status;
      const nowTs = Timestamp.fromDate(now);
      const updatedApt: Appointment = {
        ...apt,
        status: input.nextStatus,
        updatedAt: now.toISOString(),
      };

      const dailyCapRef = db
        .collection(colName(env, 'dailyCapacity'))
        .doc(dailyCapDocId(apt.doctorId, apt.date));
      const slotResRef = db
        .collection(colName(env, 'slotReservations'))
        .doc(slotDocId(apt.doctorId, apt.date, apt.timeSlot));

      const [dailyCapSnap, slotResSnap] = await Promise.all([
        tx.get(dailyCapRef),
        tx.get(slotResRef),
      ]);

      tx.update(aptRef, { status: input.nextStatus, updatedAt: nowTs });

      const wasActive = prevStatus === 'confirmed' || prevStatus === 'checked_in';
      const nowInactive = input.nextStatus === 'cancelled' || input.nextStatus === 'no_show';
      if (wasActive && nowInactive) {
        if (dailyCapSnap.exists && input.nextStatus === 'cancelled') {
          const prevCount = Number((dailyCapSnap.data() as { bookedCount?: number }).bookedCount ?? 1);
          tx.update(dailyCapRef, {
            bookedCount: Math.max(0, prevCount - 1),
            updatedAt: nowTs,
          });
        }
        if (slotResSnap.exists && input.nextStatus === 'cancelled') {
          tx.update(slotResRef, { status: 'released' });
        }
      }

      const auditId = makeId('audit');
      tx.set(db.collection(colName(env, 'auditLogs')).doc(auditId), {
        id: auditId,
        actorUid: input.actorUid,
        actorRole: input.actorRole,
        action: 'UPDATE_APPOINTMENT_STATUS',
        targetType: 'appointment',
        targetId: apt.id,
        summaryAr: `تغيير حالة الموعد ${apt.bookingRef} من ${prevStatus} إلى ${input.nextStatus}.`,
        summaryEn: `Changed appointment ${apt.bookingRef} status from ${prevStatus} to ${input.nextStatus}.`,
        createdAt: nowTs,
      });

      return updatedApt;
    });
  }

  return withStoreLock(async () => {
    const state = loadMemoryState(env);
    const now = new Date();
    const apt = state.appointments.find((a) => a.id === input.appointmentId);
    if (!apt) {
      throw new BookingError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
    }

    if (!isValidStatusTransition(apt.status, input.nextStatus, input.actorRole)) {
      throw new BookingError(
        409,
        'INVALID_STATUS_TRANSITION',
        `Cannot transition appointment from ${apt.status} to ${input.nextStatus}.`
      );
    }

    const prevStatus = apt.status;
    apt.status = input.nextStatus;
    apt.updatedAt = now.toISOString();

    state.auditLogs.unshift({
      id: makeId('audit'),
      actorUid: input.actorUid,
      actorRole: input.actorRole,
      action: 'UPDATE_APPOINTMENT_STATUS',
      targetType: 'appointment',
      targetId: apt.id,
      summaryAr: `تغيير حالة الموعد ${apt.bookingRef} من ${prevStatus} إلى ${input.nextStatus}.`,
      summaryEn: `Changed appointment ${apt.bookingRef} status from ${prevStatus} to ${input.nextStatus}.`,
      createdAt: now.toISOString(),
    });

    if (input.nextStatus === 'cancelled') {
      promoteNextWaitlistEntryInMemory(state, apt.doctorId, apt.date, now);
    }

    return apt;
  });
}

export async function joinWaitlistAtomic(input: {
  patientUid: string;
  patientName: string;
  patientPhone: string;
  doctorId: string;
  date: string;
  demoMode?: boolean;
}): Promise<WaitlistEntry> {
  const env = resolveEnv(input.demoMode);
  const adminCtx = getAdminFirebase();

  if (adminCtx) {
    const { db } = adminCtx;
    await ensureSeededFirestore(db, env);

    return db.runTransaction(async (tx) => {
      const now = new Date();
      const doctorRef = db.collection(colName(env, 'doctors')).doc(input.doctorId);
      const wlQuery = db
        .collection(colName(env, 'waitlist'))
        .where('patientUid', '==', input.patientUid)
        .where('doctorId', '==', input.doctorId)
        .where('date', '==', input.date);

      const [doctorSnap, wlSnap] = await Promise.all([tx.get(doctorRef), tx.get(wlQuery)]);
      if (!doctorSnap.exists || !(doctorSnap.data() as Doctor).active) {
        throw new BookingError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found.');
      }
      const doctor = doctorSnap.data() as Doctor;

      const duplicate = wlSnap.docs
        .map((d) => mapWaitlistFromFs(d.data()))
        .find((w) => w.status === 'waiting' || w.status === 'offered');
      if (duplicate) {
        throw new BookingError(
          409,
          'DUPLICATE_WAITLIST',
          'You already have an active waitlist entry for this doctor and date.'
        );
      }

      const nowTs = Timestamp.fromDate(now);
      const entry: WaitlistEntry = {
        id: makeId('wl'),
        patientUid: input.patientUid,
        patientName: input.patientName.trim(),
        patientPhone: input.patientPhone.trim(),
        doctorId: doctor.id,
        specialtyId: doctor.specialtyId,
        date: input.date,
        status: 'waiting',
        createdAt: now.toISOString(),
      };

      tx.set(db.collection(colName(env, 'waitlist')).doc(entry.id), {
        ...entry,
        createdAt: nowTs,
      });

      const notifId = makeId('notif');
      tx.set(db.collection(colName(env, 'notifications')).doc(notifId), {
        id: notifId,
        recipientUid: input.patientUid,
        titleAr: 'تم تسجيلك في قائمة الانتظار',
        titleEn: 'Added to Waitlist',
        bodyAr: `تمت إضافتك لقائمة انتظار ${doctor.nameAr} ليوم ${input.date}. سنُخطرك فور توفر موعد.`,
        bodyEn: `You are on the waitlist for ${doctor.nameEn} on ${input.date}. We will notify you if a slot opens.`,
        channel: 'in_app',
        read: false,
        createdAt: nowTs,
      });

      const auditId = makeId('audit');
      tx.set(db.collection(colName(env, 'auditLogs')).doc(auditId), {
        id: auditId,
        actorUid: input.patientUid,
        actorRole: 'patient',
        action: 'JOIN_WAITLIST',
        targetType: 'waitlist',
        targetId: entry.id,
        summaryAr: `انضمام ${entry.patientName} إلى قائمة انتظار ${doctor.nameAr} بتاريخ ${input.date}.`,
        summaryEn: `${entry.patientName} joined waitlist for ${doctor.nameEn} on ${input.date}.`,
        createdAt: nowTs,
      });

      return entry;
    });
  }

  return withStoreLock(async () => {
    const state = loadMemoryState(env);
    const now = new Date();
    expireStaleOffersInMemory(state, now);

    const doctor = state.doctors.find((d) => d.id === input.doctorId && d.active);
    if (!doctor) {
      throw new BookingError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found.');
    }

    const duplicate = state.waitlist.find(
      (w) =>
        w.patientUid === input.patientUid &&
        w.doctorId === input.doctorId &&
        w.date === input.date &&
        (w.status === 'waiting' || w.status === 'offered')
    );
    if (duplicate) {
      throw new BookingError(
        409,
        'DUPLICATE_WAITLIST',
        'You already have an active waitlist entry for this doctor and date.'
      );
    }

    const entry: WaitlistEntry = {
      id: makeId('wl'),
      patientUid: input.patientUid,
      patientName: input.patientName.trim(),
      patientPhone: input.patientPhone.trim(),
      doctorId: doctor.id,
      specialtyId: doctor.specialtyId,
      date: input.date,
      status: 'waiting',
      createdAt: now.toISOString(),
    };

    state.waitlist.push(entry);

    state.notifications.unshift({
      id: makeId('notif'),
      recipientUid: input.patientUid,
      titleAr: 'تم تسجيلك في قائمة الانتظار',
      titleEn: 'Added to Waitlist',
      bodyAr: `تمت إضافتك لقائمة انتظار ${doctor.nameAr} ليوم ${input.date}. سنُخطرك فور توفر موعد.`,
      bodyEn: `You are on the waitlist for ${doctor.nameEn} on ${input.date}. We will notify you if a slot opens.`,
      channel: 'in_app',
      read: false,
      createdAt: now.toISOString(),
    });

    state.auditLogs.unshift({
      id: makeId('audit'),
      actorUid: input.patientUid,
      actorRole: 'patient',
      action: 'JOIN_WAITLIST',
      targetType: 'waitlist',
      targetId: entry.id,
      summaryAr: `انضمام ${entry.patientName} إلى قائمة انتظار ${doctor.nameAr} بتاريخ ${input.date}.`,
      summaryEn: `${entry.patientName} joined waitlist for ${doctor.nameEn} on ${input.date}.`,
      createdAt: now.toISOString(),
    });

    return entry;
  });
}

export async function confirmWaitlistOfferAtomic(input: {
  entryId: string;
  actorUid: string;
  actorRole: UserRole;
  demoMode?: boolean;
}): Promise<{ entry: WaitlistEntry; appointment: Appointment }> {
  const env = resolveEnv(input.demoMode);
  const adminCtx = getAdminFirebase();

  if (adminCtx) {
    const { db } = adminCtx;
    await ensureSeededFirestore(db, env);

    return db.runTransaction(async (tx) => {
      const now = new Date();
      const entryRef = db.collection(colName(env, 'waitlist')).doc(input.entryId);
      const entrySnap = await tx.get(entryRef);
      if (!entrySnap.exists) {
        throw new BookingError(404, 'WAITLIST_NOT_FOUND', 'Waitlist entry not found.');
      }

      const entry = mapWaitlistFromFs(entrySnap.data()!);
      if (input.actorRole === 'patient' && entry.patientUid !== input.actorUid) {
        throw new BookingError(403, 'FORBIDDEN', 'Cannot confirm another patient waitlist offer.');
      }
      if (entry.status === 'expired') {
        throw new BookingError(409, 'OFFER_EXPIRED', 'Waitlist offer has expired.');
      }
      if (!isWaitlistOfferValid(entry, now) || !entry.offeredTimeSlot) {
        throw new BookingError(409, 'OFFER_INVALID', 'No active valid offer on this waitlist entry.');
      }

      const doctorRef = db.collection(colName(env, 'doctors')).doc(entry.doctorId);
      const schedRef = db.collection(colName(env, 'doctorSchedules')).doc(`sched-${entry.doctorId}`);
      const settingsRef = db.collection(colName(env, 'clinicSettings')).doc('default');
      const dailyCapRef = db
        .collection(colName(env, 'dailyCapacity'))
        .doc(dailyCapDocId(entry.doctorId, entry.date));
      const slotResRef = db
        .collection(colName(env, 'slotReservations'))
        .doc(slotDocId(entry.doctorId, entry.date, entry.offeredTimeSlot));
      const excQuery = db
        .collection(colName(env, 'scheduleExceptions'))
        .where('doctorId', '==', entry.doctorId)
        .where('date', '==', entry.date);
      const aptQuery = db
        .collection(colName(env, 'appointments'))
        .where('doctorId', '==', entry.doctorId)
        .where('date', '==', entry.date);

      const [doctorSnap, schedSnap, settingsSnap, dailyCapSnap, slotResSnap, excSnap, aptSnap] =
        await Promise.all([
          tx.get(doctorRef),
          tx.get(schedRef),
          tx.get(settingsRef),
          tx.get(dailyCapRef),
          tx.get(slotResRef),
          tx.get(excQuery),
          tx.get(aptQuery),
        ]);

      const doctor = doctorSnap.data() as Doctor;
      const specialtySnap = await tx.get(
        db.collection(colName(env, 'specialties')).doc(doctor.specialtyId)
      );
      const specialty = specialtySnap.data() as Specialty;
      const schedule = schedSnap.data() as DoctorSchedule;
      const settings = settingsSnap.exists
        ? mapSettingsFromFs(settingsSnap.data()!)
        : buildSeedDatabase().settings;
      const exceptions = excSnap.docs.map((d) => d.data() as ScheduleException);
      const appointments = aptSnap.docs.map((d) => mapAppointmentFromFs(d.data()));

      const avail = computeDayAvailability({
        doctor,
        schedule,
        exceptions,
        appointments,
        dateStr: entry.date,
        timeZone: settings.timezone,
        now,
      });

      const slot = avail.slots.find((s) => s.timeSlot === entry.offeredTimeSlot);
      if (!slot || !slot.available || avail.remainingCapacity <= 0) {
        tx.update(entryRef, { status: 'expired' });
        throw new BookingError(409, 'SLOT_NO_LONGER_AVAILABLE', 'Offered slot is no longer available.');
      }

      const nowTs = Timestamp.fromDate(now);
      const nowIso = now.toISOString();
      const apt: Appointment = {
        id: makeId('apt'),
        bookingRef: makeBookingRef(),
        patientUid: entry.patientUid,
        patientName: entry.patientName,
        patientPhone: entry.patientPhone,
        doctorId: doctor.id,
        doctorNameSnapshotAr: doctor.nameAr,
        doctorNameSnapshotEn: doctor.nameEn,
        specialtyId: specialty.id,
        specialtyNameSnapshotAr: specialty.nameAr,
        specialtyNameSnapshotEn: specialty.nameEn,
        date: entry.date,
        timeSlot: entry.offeredTimeSlot,
        status: 'confirmed',
        bookingType: 'waitlist_offer',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const existingCap = dailyCapSnap.exists
        ? Number((dailyCapSnap.data() as { bookedCount?: number }).bookedCount ?? avail.bookedCount)
        : avail.bookedCount;

      tx.update(entryRef, { status: 'confirmed' });
      tx.set(db.collection(colName(env, 'appointments')).doc(apt.id), {
        ...apt,
        createdAt: nowTs,
        updatedAt: nowTs,
      });
      tx.set(dailyCapRef, {
        id: dailyCapRef.id,
        doctorId: doctor.id,
        date: entry.date,
        bookedCount: Math.max(avail.bookedCount, existingCap) + 1,
        maxCapacity: avail.dailyCapacity,
        updatedAt: nowTs,
      });
      tx.set(slotResRef, {
        id: slotResRef.id,
        doctorId: doctor.id,
        date: entry.date,
        timeSlot: entry.offeredTimeSlot,
        appointmentId: apt.id,
        status: 'active',
      });

      const notifId = makeId('notif');
      tx.set(db.collection(colName(env, 'notifications')).doc(notifId), {
        id: notifId,
        recipientUid: entry.patientUid,
        titleAr: `تم تأكيد عرض الانتظار ${apt.bookingRef}`,
        titleEn: `Waitlist Offer Confirmed ${apt.bookingRef}`,
        bodyAr: `تم تثبيت حجزك مع ${doctor.nameAr} يوم ${apt.date} الساعة ${apt.timeSlot}.`,
        bodyEn: `Your waitlisted appointment with ${doctor.nameEn} on ${apt.date} at ${apt.timeSlot} is confirmed.`,
        channel: 'in_app',
        read: false,
        createdAt: nowTs,
      });

      const auditId = makeId('audit');
      tx.set(db.collection(colName(env, 'auditLogs')).doc(auditId), {
        id: auditId,
        actorUid: input.actorUid,
        actorRole: input.actorRole,
        action: 'CONFIRM_WAITLIST_OFFER',
        targetType: 'appointment',
        targetId: apt.id,
        summaryAr: `تم تأكيد عرض قائمة الانتظار وتحويله للحجز ${apt.bookingRef}.`,
        summaryEn: `Confirmed waitlist offer into appointment ${apt.bookingRef}.`,
        createdAt: nowTs,
      });

      return { entry: { ...entry, status: 'confirmed' }, appointment: apt };
    });
  }

  return withStoreLock(async () => {
    const state = loadMemoryState(env);
    const now = new Date();
    expireStaleOffersInMemory(state, now);

    const entry = state.waitlist.find((w) => w.id === input.entryId);
    if (!entry) {
      throw new BookingError(404, 'WAITLIST_NOT_FOUND', 'Waitlist entry not found.');
    }

    if (input.actorRole === 'patient' && entry.patientUid !== input.actorUid) {
      throw new BookingError(403, 'FORBIDDEN', 'Cannot confirm another patient waitlist offer.');
    }

    if (entry.status === 'expired') {
      throw new BookingError(409, 'OFFER_EXPIRED', 'Waitlist offer has expired.');
    }

    if (!isWaitlistOfferValid(entry, now) || !entry.offeredTimeSlot) {
      throw new BookingError(409, 'OFFER_INVALID', 'No active valid offer on this waitlist entry.');
    }

    const doctor = state.doctors.find((d) => d.id === entry.doctorId)!;
    const specialty = state.specialties.find((s) => s.id === doctor.specialtyId)!;
    const schedule = state.schedules.find((s) => s.doctorId === doctor.id)!;

    const avail = computeDayAvailability({
      doctor,
      schedule,
      exceptions: state.exceptions,
      appointments: state.appointments,
      dateStr: entry.date,
      timeZone: state.settings.timezone,
      now,
    });

    const slot = avail.slots.find((s) => s.timeSlot === entry.offeredTimeSlot);
    if (!slot || !slot.available || avail.remainingCapacity <= 0) {
      entry.status = 'expired';
      throw new BookingError(409, 'SLOT_NO_LONGER_AVAILABLE', 'Offered slot is no longer available.');
    }

    const apt: Appointment = {
      id: makeId('apt'),
      bookingRef: makeBookingRef(),
      patientUid: entry.patientUid,
      patientName: entry.patientName,
      patientPhone: entry.patientPhone,
      doctorId: doctor.id,
      doctorNameSnapshotAr: doctor.nameAr,
      doctorNameSnapshotEn: doctor.nameEn,
      specialtyId: specialty.id,
      specialtyNameSnapshotAr: specialty.nameAr,
      specialtyNameSnapshotEn: specialty.nameEn,
      date: entry.date,
      timeSlot: entry.offeredTimeSlot,
      status: 'confirmed',
      bookingType: 'waitlist_offer',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    entry.status = 'confirmed';
    state.appointments.unshift(apt);

    state.notifications.unshift({
      id: makeId('notif'),
      recipientUid: entry.patientUid,
      titleAr: `تم تأكيد عرض الانتظار ${apt.bookingRef}`,
      titleEn: `Waitlist Offer Confirmed ${apt.bookingRef}`,
      bodyAr: `تم تثبيت حجزك مع ${doctor.nameAr} يوم ${apt.date} الساعة ${apt.timeSlot}.`,
      bodyEn: `Your waitlisted appointment with ${doctor.nameEn} on ${apt.date} at ${apt.timeSlot} is confirmed.`,
      channel: 'in_app',
      read: false,
      createdAt: now.toISOString(),
    });

    state.auditLogs.unshift({
      id: makeId('audit'),
      actorUid: input.actorUid,
      actorRole: input.actorRole,
      action: 'CONFIRM_WAITLIST_OFFER',
      targetType: 'appointment',
      targetId: apt.id,
      summaryAr: `تم تأكيد عرض قائمة الانتظار وتحويله للحجز ${apt.bookingRef}.`,
      summaryEn: `Confirmed waitlist offer into appointment ${apt.bookingRef}.`,
      createdAt: now.toISOString(),
    });

    return { entry, appointment: apt };
  });
}

export async function triggerWaitlistOfferManually(input: {
  entryId: string;
  actorUid: string;
  actorRole: UserRole;
  demoMode?: boolean;
}): Promise<WaitlistEntry> {
  const env = resolveEnv(input.demoMode);
  const adminCtx = getAdminFirebase();

  if (adminCtx) {
    const { db } = adminCtx;
    await ensureSeededFirestore(db, env);

    return db.runTransaction(async (tx) => {
      const now = new Date();
      const entrySnap = await tx.get(db.collection(colName(env, 'waitlist')).doc(input.entryId));
      if (!entrySnap.exists) {
        throw new BookingError(404, 'WAITLIST_NOT_FOUND', 'Waitlist entry not found.');
      }
      const entry = mapWaitlistFromFs(entrySnap.data()!);
      const promoted = await promoteNextWaitlistInTx(tx, db, env, entry.doctorId, entry.date, now);
      if (!promoted) {
        throw new BookingError(
          409,
          'NO_OPEN_CAPACITY',
          'Cannot offer waitlist slot because daily capacity is currently full or another offer is active.'
        );
      }
      return promoted;
    });
  }

  return withStoreLock(async () => {
    const state = loadMemoryState(env);
    const now = new Date();
    const entry = state.waitlist.find((w) => w.id === input.entryId);
    if (!entry) {
      throw new BookingError(404, 'WAITLIST_NOT_FOUND', 'Waitlist entry not found.');
    }
    const promoted = promoteNextWaitlistEntryInMemory(state, entry.doctorId, entry.date, now);
    if (!promoted) {
      throw new BookingError(
        409,
        'NO_OPEN_CAPACITY',
        'Cannot offer waitlist slot because daily capacity is currently full or another offer is active.'
      );
    }
    return promoted;
  });
}

export async function upsertDoctorAndScheduleAtomic(input: {
  doctor: Doctor;
  schedule: DoctorSchedule;
  actorUid: string;
  demoMode?: boolean;
}): Promise<{ doctor: Doctor; schedule: DoctorSchedule }> {
  const env = resolveEnv(input.demoMode);
  const adminCtx = getAdminFirebase();

  if (adminCtx) {
    const { db } = adminCtx;
    await ensureSeededFirestore(db, env);

    return db.runTransaction(async (tx) => {
      const now = new Date();
      const [settingsSnap, aptSnap] = await Promise.all([
        tx.get(db.collection(colName(env, 'clinicSettings')).doc('default')),
        tx.get(
          db
            .collection(colName(env, 'appointments'))
            .where('doctorId', '==', input.doctor.id)
        ),
      ]);
      const settings = settingsSnap.exists
        ? mapSettingsFromFs(settingsSnap.data()!)
        : buildSeedDatabase().settings;
      const { dateStr: today } = getNowInTimezone(now, settings.timezone);
      const appointments = aptSnap.docs.map((d) => mapAppointmentFromFs(d.data()));

      const safety = validateScheduleChangeSafety({
        doctorId: input.doctor.id,
        newSchedule: input.schedule,
        appointments,
        todayDateStr: today,
      });

      if (!safety.safe) {
        throw new BookingError(
          409,
          'SCHEDULE_CONFLICT',
          `Cannot apply schedule change: ${safety.conflictingAppointmentsCount} future confirmed appointment(s) would be invalidated.`
        );
      }

      tx.set(
        db.collection(colName(env, 'doctors')).doc(input.doctor.id),
        sanitizeDoc({ ...input.doctor })
      );
      tx.set(
        db.collection(colName(env, 'doctorSchedules')).doc(input.schedule.id),
        sanitizeDoc({ ...input.schedule })
      );

      const auditId = makeId('audit');
      tx.set(db.collection(colName(env, 'auditLogs')).doc(auditId), {
        id: auditId,
        actorUid: input.actorUid,
        actorRole: 'admin',
        action: 'UPSERT_DOCTOR_SCHEDULE',
        targetType: 'doctor',
        targetId: input.doctor.id,
        summaryAr: `تم تحديث بيانات وجدول ${input.doctor.nameAr} (الحد اليومي: ${input.schedule.dailyCapacity}).`,
        summaryEn: `Updated profile & schedule for ${input.doctor.nameEn} (daily cap: ${input.schedule.dailyCapacity}).`,
        createdAt: Timestamp.fromDate(now),
      });

      return { doctor: input.doctor, schedule: input.schedule };
    });
  }

  return withStoreLock(async () => {
    const state = loadMemoryState(env);
    const now = new Date();
    const { dateStr: today } = getNowInTimezone(now, state.settings.timezone);

    const safety = validateScheduleChangeSafety({
      doctorId: input.doctor.id,
      newSchedule: input.schedule,
      appointments: state.appointments,
      todayDateStr: today,
    });

    if (!safety.safe) {
      throw new BookingError(
        409,
        'SCHEDULE_CONFLICT',
        `Cannot apply schedule change: ${safety.conflictingAppointmentsCount} future confirmed appointment(s) would be invalidated.`
      );
    }

    const docIdx = state.doctors.findIndex((d) => d.id === input.doctor.id);
    if (docIdx >= 0) {
      state.doctors[docIdx] = input.doctor;
    } else {
      state.doctors.push(input.doctor);
    }

    const schedIdx = state.schedules.findIndex((s) => s.doctorId === input.doctor.id);
    if (schedIdx >= 0) {
      state.schedules[schedIdx] = input.schedule;
    } else {
      state.schedules.push(input.schedule);
    }

    state.auditLogs.unshift({
      id: makeId('audit'),
      actorUid: input.actorUid,
      actorRole: 'admin',
      action: 'UPSERT_DOCTOR_SCHEDULE',
      targetType: 'doctor',
      targetId: input.doctor.id,
      summaryAr: `تم تحديث بيانات وجدول ${input.doctor.nameAr} (الحد اليومي: ${input.schedule.dailyCapacity}).`,
      summaryEn: `Updated profile & schedule for ${input.doctor.nameEn} (daily cap: ${input.schedule.dailyCapacity}).`,
      createdAt: now.toISOString(),
    });

    return { doctor: input.doctor, schedule: input.schedule };
  });
}

export async function addScheduleExceptionAtomic(input: {
  exception: ScheduleException;
  actorUid: string;
  demoMode?: boolean;
}): Promise<ScheduleException> {
  const env = resolveEnv(input.demoMode);
  const adminCtx = getAdminFirebase();

  if (adminCtx) {
    const { db } = adminCtx;
    await ensureSeededFirestore(db, env);

    return db.runTransaction(async (tx) => {
      const now = new Date();
      if (input.exception.isClosed) {
        const aptSnap = await tx.get(
          db
            .collection(colName(env, 'appointments'))
            .where('doctorId', '==', input.exception.doctorId)
            .where('date', '==', input.exception.date)
        );
        const activeOnDate = aptSnap.docs
          .map((d) => mapAppointmentFromFs(d.data()))
          .filter((a) => a.status === 'confirmed' || a.status === 'checked_in');
        if (activeOnDate.length > 0) {
          throw new BookingError(
            409,
            'CLOSURE_CONFLICT',
            `Cannot close ${input.exception.date}: ${activeOnDate.length} confirmed appointment(s) already exist.`
          );
        }
      }

      const docId = `${input.exception.doctorId}_${input.exception.date}`;
      const record: ScheduleException = { ...input.exception, id: input.exception.id || docId };
      tx.set(
        db.collection(colName(env, 'scheduleExceptions')).doc(record.id),
        sanitizeDoc({ ...record })
      );

      const auditId = makeId('audit');
      tx.set(db.collection(colName(env, 'auditLogs')).doc(auditId), {
        id: auditId,
        actorUid: input.actorUid,
        actorRole: 'admin',
        action: 'ADD_SCHEDULE_EXCEPTION',
        targetType: 'schedule_exception',
        targetId: record.id,
        summaryAr: `تم تسجيل استثناء جدول للطبيب ${record.doctorId} بتاريخ ${record.date}.`,
        summaryEn: `Added schedule exception for ${record.doctorId} on ${record.date}.`,
        createdAt: Timestamp.fromDate(now),
      });

      return record;
    });
  }

  return withStoreLock(async () => {
    const state = loadMemoryState(env);
    const now = new Date();

    if (input.exception.isClosed) {
      const activeOnDate = state.appointments.filter(
        (a) =>
          a.doctorId === input.exception.doctorId &&
          a.date === input.exception.date &&
          (a.status === 'confirmed' || a.status === 'checked_in')
      );
      if (activeOnDate.length > 0) {
        throw new BookingError(
          409,
          'CLOSURE_CONFLICT',
          `Cannot close ${input.exception.date}: ${activeOnDate.length} confirmed appointment(s) already exist.`
        );
      }
    }

    const existingIdx = state.exceptions.findIndex(
      (e) => e.doctorId === input.exception.doctorId && e.date === input.exception.date
    );
    if (existingIdx >= 0) {
      state.exceptions[existingIdx] = input.exception;
    } else {
      state.exceptions.push(input.exception);
    }

    state.auditLogs.unshift({
      id: makeId('audit'),
      actorUid: input.actorUid,
      actorRole: 'admin',
      action: 'ADD_SCHEDULE_EXCEPTION',
      targetType: 'schedule_exception',
      targetId: input.exception.id,
      summaryAr: `تم تسجيل استثناء جدول للطبيب ${input.exception.doctorId} بتاريخ ${input.exception.date}.`,
      summaryEn: `Added schedule exception for ${input.exception.doctorId} on ${input.exception.date}.`,
      createdAt: now.toISOString(),
    });

    return input.exception;
  });
}

export async function updateSettingsAtomic(input: {
  settings: Partial<ClinicSettings>;
  actorUid: string;
  demoMode?: boolean;
}): Promise<ClinicSettings> {
  const env = resolveEnv(input.demoMode);
  const adminCtx = getAdminFirebase();

  if (adminCtx) {
    const { db } = adminCtx;
    await ensureSeededFirestore(db, env);

    return db.runTransaction(async (tx) => {
      const now = new Date();
      const settingsRef = db.collection(colName(env, 'clinicSettings')).doc('default');
      const snap = await tx.get(settingsRef);
      const current = snap.exists
        ? mapSettingsFromFs(snap.data()!)
        : buildSeedDatabase().settings;

      const updated: ClinicSettings = {
        ...current,
        ...input.settings,
        id: 'default',
        updatedAt: now.toISOString(),
      };

      const nowTs = Timestamp.fromDate(now);
      tx.set(settingsRef, { ...updated, updatedAt: nowTs });

      const auditId = makeId('audit');
      tx.set(db.collection(colName(env, 'auditLogs')).doc(auditId), {
        id: auditId,
        actorUid: input.actorUid,
        actorRole: 'admin',
        action: 'UPDATE_CLINIC_SETTINGS',
        targetType: 'settings',
        targetId: 'default',
        summaryAr: 'تم تحديث سياسات الحجز وإعدادات العيادة العامة.',
        summaryEn: 'Updated global clinic booking policies and settings.',
        createdAt: nowTs,
      });

      return updated;
    });
  }

  return withStoreLock(async () => {
    const state = loadMemoryState(env);
    const now = new Date();
    state.settings = {
      ...state.settings,
      ...input.settings,
      id: 'default',
      updatedAt: now.toISOString(),
    };

    state.auditLogs.unshift({
      id: makeId('audit'),
      actorUid: input.actorUid,
      actorRole: 'admin',
      action: 'UPDATE_CLINIC_SETTINGS',
      targetType: 'settings',
      targetId: 'default',
      summaryAr: 'تم تحديث سياسات الحجز وإعدادات العيادة العامة.',
      summaryEn: 'Updated global clinic booking policies and settings.',
      createdAt: now.toISOString(),
    });

    return state.settings;
  });
}

export async function upsertStaffAccountAtomic(input: {
  email: string;
  displayName: string;
  role: 'admin' | 'receptionist';
  actorUid: string;
  demoMode?: boolean;
}): Promise<StaffAccount> {
  const env = resolveEnv(input.demoMode);
  const adminCtx = getAdminFirebase();
  const normalizedEmail = input.email.trim().toLowerCase();

  if (adminCtx) {
    const { db, auth } = adminCtx;
    await ensureSeededFirestore(db, env);

    // Resolve real Firebase Auth UID if user already signed in before
    let resolvedUid: string | null = null;
    if (env === 'production') {
      try {
        const userRecord = await auth.getUserByEmail(normalizedEmail);
        resolvedUid = userRecord.uid;
      } catch {
        // User hasn't logged in yet; email allowlist still grants role on first login
      }
    }

    const record = await db.runTransaction(async (tx) => {
      const now = new Date();
      const nowTs = Timestamp.fromDate(now);
      const staffSnap = await tx.get(
        db
          .collection(colName(env, 'staffAccounts'))
          .where('email', '==', normalizedEmail)
          .limit(1)
      );

      const existing = !staffSnap.empty ? mapStaffFromFs(staffSnap.docs[0]!.data()) : null;
      const docId = resolvedUid || existing?.uid || makeId('staff');
      const next: StaffAccount = {
        uid: docId,
        email: normalizedEmail,
        displayName: input.displayName.trim(),
        role: input.role,
        assignedAt: existing?.assignedAt ?? now.toISOString(),
      };

      tx.set(db.collection(colName(env, 'staffAccounts')).doc(docId), {
        ...next,
        assignedAt: toTs(next.assignedAt),
      });

      // Keep Firestore Security Rules role collections synchronized in production
      if (env === 'production' && resolvedUid) {
        if (input.role === 'admin') {
          tx.set(db.collection('admins').doc(resolvedUid), {
            uid: resolvedUid,
            email: normalizedEmail,
            assignedAt: nowTs,
          });
          tx.delete(db.collection('receptionists').doc(resolvedUid));
        } else {
          tx.set(db.collection('receptionists').doc(resolvedUid), {
            uid: resolvedUid,
            email: normalizedEmail,
            assignedAt: nowTs,
          });
          tx.delete(db.collection('admins').doc(resolvedUid));
        }
      }

      const auditId = makeId('audit');
      tx.set(db.collection(colName(env, 'auditLogs')).doc(auditId), {
        id: auditId,
        actorUid: input.actorUid,
        actorRole: 'admin',
        action: 'ASSIGN_STAFF_ROLE',
        targetType: 'staff',
        targetId: next.uid,
        summaryAr: `تم تعيين صلاحية ${next.role} للحساب ${next.email}.`,
        summaryEn: `Assigned role ${next.role} to ${next.email}.`,
        createdAt: nowTs,
      });

      return next;
    });

    return record;
  }

  return withStoreLock(async () => {
    const state = loadMemoryState(env);
    const now = new Date();
    const existing = state.staffAccounts.find(
      (s) => s.email.toLowerCase() === normalizedEmail
    );

    const record: StaffAccount = existing
      ? { ...existing, displayName: input.displayName.trim(), role: input.role }
      : {
          uid: makeId('staff'),
          email: normalizedEmail,
          displayName: input.displayName.trim(),
          role: input.role,
          assignedAt: now.toISOString(),
        };

    if (!existing) {
      state.staffAccounts.push(record);
    } else {
      const idx = state.staffAccounts.indexOf(existing);
      state.staffAccounts[idx] = record;
    }

    state.auditLogs.unshift({
      id: makeId('audit'),
      actorUid: input.actorUid,
      actorRole: 'admin',
      action: 'ASSIGN_STAFF_ROLE',
      targetType: 'staff',
      targetId: record.uid,
      summaryAr: `تم تعيين صلاحية ${record.role} للحساب ${record.email}.`,
      summaryEn: `Assigned role ${record.role} to ${record.email}.`,
      createdAt: now.toISOString(),
    });

    return record;
  });
}

export async function updatePatientProfileAtomic(input: {
  uid: string;
  fullName: string;
  phone: string;
  email?: string;
  preferredLanguage: LanguageCode;
  elderlyAssistMode: boolean;
  demoMode?: boolean;
}): Promise<PatientProfile> {
  const env = resolveEnv(input.demoMode);
  const adminCtx = getAdminFirebase();

  if (adminCtx) {
    const { db } = adminCtx;
    await ensureSeededFirestore(db, env);

    return db.runTransaction(async (tx) => {
      const now = new Date();
      const nowTs = Timestamp.fromDate(now);
      const ref = db.collection(colName(env, 'patientProfiles')).doc(input.uid);
      const existingSnap = await tx.get(ref);
      const createdAt = existingSnap.exists
        ? (existingSnap.data()?.createdAt ?? nowTs)
        : nowTs;

      const profile: PatientProfile = {
        uid: input.uid,
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        ...(input.email?.trim() ? { email: input.email.trim() } : {}),
        preferredLanguage: input.preferredLanguage,
        elderlyAssistMode: input.elderlyAssistMode,
        updatedAt: now.toISOString(),
      };

      tx.set(
        ref,
        sanitizeDoc({
          ...profile,
          createdAt,
          updatedAt: nowTs,
        })
      );

      return profile;
    });
  }

  return withStoreLock(async () => {
    const state = loadMemoryState(env);
    const profile: PatientProfile = {
      uid: input.uid,
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim() || undefined,
      preferredLanguage: input.preferredLanguage,
      elderlyAssistMode: input.elderlyAssistMode,
      updatedAt: new Date().toISOString(),
    };
    state.patientProfiles[input.uid] = profile;
    return profile;
  });
}

export async function markNotificationReadAtomic(
  notificationId: string,
  uid: string,
  demoMode: boolean = true
): Promise<void> {
  const env = resolveEnv(demoMode);
  const adminCtx = getAdminFirebase();

  if (adminCtx) {
    const { db } = adminCtx;
    const ref = db.collection(colName(env, 'notifications')).doc(notificationId);
    const snap = await ref.get();
    if (snap.exists && snap.data()?.recipientUid === uid) {
      await ref.update({ read: true });
    }
    return;
  }

  return withStoreLock(async () => {
    const state = loadMemoryState(env);
    const n = state.notifications.find(
      (item) => item.id === notificationId && item.recipientUid === uid
    );
    if (n) {
      n.read = true;
    }
  });
}

export async function resetDemoDatabase(actorUid: string): Promise<DatabaseState> {
  const adminCtx = getAdminFirebase();

  if (adminCtx) {
    const { db } = adminCtx;
    const demoCollections = [
      'specialties',
      'doctors',
      'doctorSchedules',
      'scheduleExceptions',
      'dailyCapacity',
      'slotReservations',
      'appointments',
      'waitlist',
      'notifications',
      'clinicSettings',
      'auditLogs',
      'patientProfiles',
      'staffAccounts',
      'systemMeta',
    ];

    // Clear demo_* collections only (production collections are untouched)
    for (const base of demoCollections) {
      const snap = await db.collection(colName('demo', base)).get();
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db.batch();
        for (const docSnap of snap.docs.slice(i, i + 400)) {
          batch.delete(docSnap.ref);
        }
        await batch.commit();
      }
    }

    seededFirestoreEnvs.demo = false;
    await seedFirestoreEnvironment(db, 'demo');
    seededFirestoreEnvs.demo = true;

    const auditId = makeId('audit');
    await db.collection(colName('demo', 'auditLogs')).doc(auditId).set({
      id: auditId,
      actorUid,
      actorRole: 'admin',
      action: 'RESET_DEMO_DATA',
      targetType: 'system',
      targetId: 'demo',
      summaryAr: 'تمت إعادة ضبط بيانات العرض التجريبي إلى الحالة القياسية (19/20).',
      summaryEn: 'Reset demonstration dataset back to baseline (19/20 scenario).',
      createdAt: Timestamp.now(),
    });

    return fetchFullStateFromFirestore(db, 'demo');
  }

  return withStoreLock(async () => {
    const fresh = createFreshMemoryState('demo');
    fresh.auditLogs.unshift({
      id: makeId('audit'),
      actorUid,
      actorRole: 'admin',
      action: 'RESET_DEMO_DATA',
      targetType: 'system',
      targetId: 'demo',
      summaryAr: 'تمت إعادة ضبط بيانات العرض التجريبي إلى الحالة القياسية (19/20).',
      summaryEn: 'Reset demonstration dataset back to baseline (19/20 scenario).',
      createdAt: new Date().toISOString(),
    });
    memoryStates.demo = fresh;
    return fresh;
  });
}

export async function getRawSnapshotForAi(demoMode: boolean = true): Promise<DatabaseState> {
  const env = resolveEnv(demoMode);
  const adminCtx = getAdminFirebase();

  if (adminCtx) {
    await ensureSeededFirestore(adminCtx.db, env);
    await expireAndPromoteWaitlistFirestore(adminCtx.db, env);
    return fetchFullStateFromFirestore(adminCtx.db, env);
  }

  return withStoreLock(async () => {
    const state = loadMemoryState(env);
    expireStaleOffersInMemory(state);
    return state;
  });
}

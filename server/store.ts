import fs from 'node:fs/promises';
import path from 'node:path';
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

const DATA_FILE = path.resolve(process.cwd(), '.clinicflow-data.json');

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

let cachedState: DatabaseState | null = null;

async function loadState(): Promise<DatabaseState> {
  if (cachedState) return cachedState;
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as DatabaseState;
    if (parsed && Array.isArray(parsed.specialties) && Array.isArray(parsed.appointments)) {
      cachedState = parsed;
      return cachedState;
    }
  } catch {
    // Seed fresh database
  }
  const seeded = buildSeedDatabase();
  cachedState = {
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
  await persistState(cachedState);
  return cachedState;
}

async function persistState(state: DatabaseState): Promise<void> {
  cachedState = state;
  await fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeBookingRef(): string {
  const digits = Math.floor(100000 + Math.random() * 899999);
  return `CF-${digits}`;
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
  // Promote next waiting entry if capacity is still free
  for (const pair of affectedPairs) {
    const [doctorId, date] = pair.split('|');
    promoteNextWaitlistEntry(state, doctorId, date, now);
  }
}

function promoteNextWaitlistEntry(
  state: DatabaseState,
  doctorId: string,
  date: string,
  now: Date = new Date()
): WaitlistEntry | null {
  const doctor = state.doctors.find((d) => d.id === doctorId);
  const schedule = state.schedules.find((s) => s.doctorId === doctorId);
  if (!doctor || !schedule) return null;

  // Check if an active offer already exists for this doctor/date
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

export async function getStateForRole(params: {
  role: UserRole;
  uid: string;
  demoMode: boolean;
}) {
  return withStoreLock(async () => {
    const state = await loadState();
    expireStaleOffersInMemory(state);
    await persistState(state);

    const { dateStr: today } = getNowInTimezone(new Date(), state.settings.timezone);

    // Filter private records based on caller role
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

    const occupancyByDoctorDate: Record<string, DoctorDateOccupancy> = {};
    const now = new Date();
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
      occupancyByDoctorDate,
      analytics,
    };
  });
}

export async function getAvailabilityForDoctorDate(
  doctorId: string,
  dateStr: string
): Promise<DayAvailability | null> {
  return withStoreLock(async () => {
    const state = await loadState();
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

export async function getNextSlotForDoctor(doctorId: string) {
  return withStoreLock(async () => {
    const state = await loadState();
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

export class BookingError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
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
}): Promise<Appointment> {
  return withStoreLock(async () => {
    const state = await loadState();
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

    // Prevent duplicate active booking for same patient, doctor, date, and time
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

    await persistState(state);
    return apt;
  });
}

export async function cancelAppointmentAtomic(input: {
  appointmentId: string;
  actorUid: string;
  actorRole: UserRole;
}): Promise<{ appointment: Appointment; promotedWaitlist: WaitlistEntry | null }> {
  return withStoreLock(async () => {
    const state = await loadState();
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

    const promotedWaitlist = promoteNextWaitlistEntry(state, apt.doctorId, apt.date, now);
    await persistState(state);
    return { appointment: apt, promotedWaitlist };
  });
}

export async function updateAppointmentStatusAtomic(input: {
  appointmentId: string;
  nextStatus: AppointmentStatus;
  actorUid: string;
  actorRole: UserRole;
}): Promise<Appointment> {
  return withStoreLock(async () => {
    const state = await loadState();
    const now = new Date();
    const apt = state.appointments.find((a) => a.id === input.appointmentId);
    if (!apt) {
      throw new BookingError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
    }

    if (!isValidStatusTransition(apt.status, input.nextStatus, input.actorRole)) {
      throw new BookingError(
        409,
        'INVALID_STATUS_TRANSITION',
        `Transition from ${apt.status} to ${input.nextStatus} is not permitted for ${input.actorRole}.`
      );
    }

    const prevStatus = apt.status;
    apt.status = input.nextStatus;
    apt.updatedAt = now.toISOString();

    state.auditLogs.unshift({
      id: makeId('audit'),
      actorUid: input.actorUid,
      actorRole: input.actorRole,
      action: 'UPDATE_STATUS',
      targetType: 'appointment',
      targetId: apt.id,
      summaryAr: `تغيير حالة الموعد ${apt.bookingRef} من ${prevStatus} إلى ${input.nextStatus}.`,
      summaryEn: `Changed appointment ${apt.bookingRef} status from ${prevStatus} to ${input.nextStatus}.`,
      createdAt: now.toISOString(),
    });

    if (input.nextStatus === 'cancelled') {
      promoteNextWaitlistEntry(state, apt.doctorId, apt.date, now);
    }

    await persistState(state);
    return apt;
  });
}

export async function joinWaitlistAtomic(input: {
  patientUid: string;
  patientName: string;
  patientPhone: string;
  doctorId: string;
  date: string;
}): Promise<WaitlistEntry> {
  return withStoreLock(async () => {
    const state = await loadState();
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

    await persistState(state);
    return entry;
  });
}

export async function confirmWaitlistOfferAtomic(input: {
  entryId: string;
  actorUid: string;
  actorRole: UserRole;
}): Promise<{ entry: WaitlistEntry; appointment: Appointment }> {
  return withStoreLock(async () => {
    const state = await loadState();
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
      await persistState(state);
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

    await persistState(state);
    return { entry, appointment: apt };
  });
}

export async function triggerWaitlistOfferManually(input: {
  entryId: string;
  actorUid: string;
  actorRole: UserRole;
}): Promise<WaitlistEntry> {
  return withStoreLock(async () => {
    const state = await loadState();
    const now = new Date();
    const entry = state.waitlist.find((w) => w.id === input.entryId);
    if (!entry) {
      throw new BookingError(404, 'WAITLIST_NOT_FOUND', 'Waitlist entry not found.');
    }
    const promoted = promoteNextWaitlistEntry(state, entry.doctorId, entry.date, now);
    if (!promoted) {
      throw new BookingError(
        409,
        'NO_OPEN_CAPACITY',
        'Cannot offer waitlist slot because daily capacity is currently full or another offer is active.'
      );
    }
    await persistState(state);
    return promoted;
  });
}

export async function upsertDoctorAndScheduleAtomic(input: {
  doctor: Doctor;
  schedule: DoctorSchedule;
  actorUid: string;
}): Promise<{ doctor: Doctor; schedule: DoctorSchedule }> {
  return withStoreLock(async () => {
    const state = await loadState();
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

    await persistState(state);
    return { doctor: input.doctor, schedule: input.schedule };
  });
}

export async function addScheduleExceptionAtomic(input: {
  exception: ScheduleException;
  actorUid: string;
}): Promise<ScheduleException> {
  return withStoreLock(async () => {
    const state = await loadState();
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

    await persistState(state);
    return input.exception;
  });
}

export async function updateSettingsAtomic(input: {
  settings: Partial<ClinicSettings>;
  actorUid: string;
}): Promise<ClinicSettings> {
  return withStoreLock(async () => {
    const state = await loadState();
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

    await persistState(state);
    return state.settings;
  });
}

export async function upsertStaffAccountAtomic(input: {
  email: string;
  displayName: string;
  role: 'admin' | 'receptionist';
  actorUid: string;
}): Promise<StaffAccount> {
  return withStoreLock(async () => {
    const state = await loadState();
    const now = new Date();
    const normalizedEmail = input.email.trim().toLowerCase();
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

    await persistState(state);
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
}): Promise<PatientProfile> {
  return withStoreLock(async () => {
    const state = await loadState();
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
    await persistState(state);
    return profile;
  });
}

export async function markNotificationReadAtomic(
  notificationId: string,
  uid: string
): Promise<void> {
  return withStoreLock(async () => {
    const state = await loadState();
    const n = state.notifications.find(
      (item) => item.id === notificationId && item.recipientUid === uid
    );
    if (n) {
      n.read = true;
      await persistState(state);
    }
  });
}

export async function resetDemoDatabase(actorUid: string): Promise<DatabaseState> {
  return withStoreLock(async () => {
    const seeded = buildSeedDatabase();
    const fresh: DatabaseState = {
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
    await persistState(fresh);
    return fresh;
  });
}

export async function getRawSnapshotForAi() {
  return withStoreLock(async () => {
    const state = await loadState();
    expireStaleOffersInMemory(state);
    return state;
  });
}

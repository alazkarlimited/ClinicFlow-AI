import type {
  AnalyticsSummary,
  Appointment,
  AppointmentStatus,
  ClinicSettings,
  DayAvailability,
  Doctor,
  DoctorSchedule,
  ScheduleException,
  Specialty,
  TimeSlotAvailability,
  UserRole,
  WaitlistEntry,
} from './types';

const ACTIVE_CAPACITY_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  'confirmed',
  'checked_in',
  'completed',
  'no_show',
]);

const TERMINAL_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  'completed',
  'cancelled',
  'no_show',
]);

export function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function formatMinutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Returns the current date (YYYY-MM-DD), time (HH:mm), and day of week (0-6)
 * in the clinic's configured timezone (defaults to Africa/Cairo).
 */
export function getNowInTimezone(
  now: Date = new Date(),
  timeZone: string = 'Africa/Cairo'
): { dateStr: string; timeStr: string; minutesOfDay: number; dayOfWeek: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(now);

  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const hour = Number(map.hour ?? '0');
  const minute = Number(map.minute ?? '0');
  return {
    dateStr: `${map.year}-${map.month}-${map.day}`,
    timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    minutesOfDay: hour * 60 + minute,
    dayOfWeek: weekdayMap[map.weekday ?? 'Sun'] ?? 0,
  };
}

export function getDayOfWeekForDate(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
}

export function addDaysToDateStr(dateStr: string, deltaDays: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + deltaDays, 12, 0, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Counts appointments that consume daily capacity (cancelled appointments release capacity).
 */
export function countBookedCapacity(
  appointments: Appointment[],
  doctorId: string,
  dateStr: string
): number {
  return appointments.filter(
    (a) =>
      a.doctorId === doctorId &&
      a.date === dateStr &&
      ACTIVE_CAPACITY_STATUSES.has(a.status)
  ).length;
}

export function generateScheduleSlots(schedule: DoctorSchedule): string[] {
  const startMin = parseTimeToMinutes(schedule.startTime);
  const endMin = parseTimeToMinutes(schedule.endTime);
  const breakStartMin = schedule.breakStart
    ? parseTimeToMinutes(schedule.breakStart)
    : null;
  const breakEndMin = schedule.breakEnd
    ? parseTimeToMinutes(schedule.breakEnd)
    : null;

  const slots: string[] = [];
  for (let m = startMin; m + schedule.slotDurationMinutes <= endMin; m += schedule.slotDurationMinutes) {
    const slotEnd = m + schedule.slotDurationMinutes;
    const overlapsBreak =
      breakStartMin !== null &&
      breakEndMin !== null &&
      m < breakEndMin &&
      slotEnd > breakStartMin;
    if (!overlapsBreak) {
      slots.push(formatMinutesToTime(m));
    }
  }
  return slots;
}

export function computeDayAvailability(params: {
  doctor: Doctor;
  schedule: DoctorSchedule;
  exceptions: ScheduleException[];
  appointments: Appointment[];
  dateStr: string;
  timeZone?: string;
  now?: Date;
}): DayAvailability {
  const {
    doctor,
    schedule,
    exceptions,
    appointments,
    dateStr,
    timeZone = 'Africa/Cairo',
    now = new Date(),
  } = params;

  const nowTz = getNowInTimezone(now, timeZone);
  const dayOfWeek = getDayOfWeekForDate(dateStr);
  const isWorkingDay = schedule.workingDays.includes(dayOfWeek);
  const exception = exceptions.find(
    (e) => e.doctorId === doctor.id && e.date === dateStr
  );
  const isClosed = Boolean(exception?.isClosed) || !doctor.active;
  const dailyCapacity =
    typeof exception?.customCapacity === 'number'
      ? exception.customCapacity
      : schedule.dailyCapacity;

  const bookedCount = countBookedCapacity(appointments, doctor.id, dateStr);
  const remainingCapacity = Math.max(0, dailyCapacity - bookedCount);

  const isPastDate = dateStr < nowTz.dateStr;
  const isToday = dateStr === nowTz.dateStr;

  const rawSlots = generateScheduleSlots(schedule);
  const slots: TimeSlotAvailability[] = rawSlots.map((timeSlot) => {
    const slotBooked = appointments.filter(
      (a) =>
        a.doctorId === doctor.id &&
        a.date === dateStr &&
        a.timeSlot === timeSlot &&
        ACTIVE_CAPACITY_STATUSES.has(a.status)
    ).length;

    const slotMinutes = parseTimeToMinutes(timeSlot);
    const isPastSlot = isPastDate || (isToday && slotMinutes <= nowTz.minutesOfDay);

    if (isClosed) {
      return {
        timeSlot,
        available: false,
        bookedCount: slotBooked,
        maxSlotCapacity: schedule.perSlotCapacity,
        reason: 'closed',
      };
    }
    if (!isWorkingDay) {
      return {
        timeSlot,
        available: false,
        bookedCount: slotBooked,
        maxSlotCapacity: schedule.perSlotCapacity,
        reason: 'closed',
      };
    }
    if (schedule.bookingsPaused) {
      return {
        timeSlot,
        available: false,
        bookedCount: slotBooked,
        maxSlotCapacity: schedule.perSlotCapacity,
        reason: 'paused',
      };
    }
    if (isPastSlot) {
      return {
        timeSlot,
        available: false,
        bookedCount: slotBooked,
        maxSlotCapacity: schedule.perSlotCapacity,
        reason: 'past',
      };
    }
    if (bookedCount >= dailyCapacity) {
      return {
        timeSlot,
        available: false,
        bookedCount: slotBooked,
        maxSlotCapacity: schedule.perSlotCapacity,
        reason: 'daily_full',
      };
    }
    if (slotBooked >= schedule.perSlotCapacity) {
      return {
        timeSlot,
        available: false,
        bookedCount: slotBooked,
        maxSlotCapacity: schedule.perSlotCapacity,
        reason: 'booked',
      };
    }

    return {
      timeSlot,
      available: true,
      bookedCount: slotBooked,
      maxSlotCapacity: schedule.perSlotCapacity,
    };
  });

  return {
    doctorId: doctor.id,
    date: dateStr,
    isWorkingDay,
    isClosed,
    closureReasonAr: exception?.reasonAr,
    closureReasonEn: exception?.reasonEn,
    bookingsPaused: schedule.bookingsPaused,
    dailyCapacity,
    bookedCount,
    remainingCapacity: isClosed || !isWorkingDay || schedule.bookingsPaused || isPastDate ? 0 : remainingCapacity,
    slots,
  };
}

export function findNextAvailableSlot(params: {
  doctor: Doctor;
  schedule: DoctorSchedule;
  exceptions: ScheduleException[];
  appointments: Appointment[];
  startDateStr: string;
  daysToSearch?: number;
  timeZone?: string;
  now?: Date;
}): { date: string; timeSlot: string } | null {
  const daysToSearch = params.daysToSearch ?? 14;
  for (let i = 0; i < daysToSearch; i++) {
    const candidateDate = addDaysToDateStr(params.startDateStr, i);
    const day = computeDayAvailability({
      ...params,
      dateStr: candidateDate,
    });
    const openSlot = day.slots.find((s) => s.available);
    if (openSlot) {
      return { date: candidateDate, timeSlot: openSlot.timeSlot };
    }
  }
  return null;
}

export function canCancelAppointment(params: {
  appointment: Appointment;
  actorRole: UserRole;
  cutoffHours: number;
  timeZone?: string;
  now?: Date;
}): { allowed: boolean; reason?: 'terminal_status' | 'cutoff_passed' | 'unauthorized' } {
  const {
    appointment,
    actorRole,
    cutoffHours,
    timeZone = 'Africa/Cairo',
    now = new Date(),
  } = params;

  if (TERMINAL_STATUSES.has(appointment.status) || appointment.status === 'checked_in') {
    if (actorRole === 'admin' && appointment.status !== 'cancelled') {
      return { allowed: true };
    }
    return { allowed: false, reason: 'terminal_status' };
  }

  if (actorRole === 'admin' || actorRole === 'receptionist') {
    return { allowed: true };
  }

  if (actorRole !== 'patient') {
    return { allowed: false, reason: 'unauthorized' };
  }

  const nowTz = getNowInTimezone(now, timeZone);
  const [aY, aM, aD] = appointment.date.split('-').map(Number);
  const [nY, nM, nD] = nowTz.dateStr.split('-').map(Number);
  const aptMinutesTotal =
    Math.floor(Date.UTC(aY, aM - 1, aD) / 60000) + parseTimeToMinutes(appointment.timeSlot);
  const nowMinutesTotal =
    Math.floor(Date.UTC(nY, nM - 1, nD) / 60000) + nowTz.minutesOfDay;

  const diffMinutes = aptMinutesTotal - nowMinutesTotal;
  if (diffMinutes < cutoffHours * 60) {
    return { allowed: false, reason: 'cutoff_passed' };
  }
  return { allowed: true };
}

export function isValidStatusTransition(
  currentStatus: AppointmentStatus,
  nextStatus: AppointmentStatus,
  actorRole: UserRole
): boolean {
  if (currentStatus === nextStatus) return false;
  if (TERMINAL_STATUSES.has(currentStatus)) {
    return actorRole === 'admin' && nextStatus === 'confirmed';
  }
  if (currentStatus === 'confirmed') {
    if (actorRole === 'patient') {
      return nextStatus === 'cancelled';
    }
    return ['checked_in', 'completed', 'cancelled', 'no_show'].includes(nextStatus);
  }
  if (currentStatus === 'checked_in') {
    return actorRole !== 'patient' && ['completed', 'cancelled', 'no_show'].includes(nextStatus);
  }
  return false;
}

export function isWaitlistOfferValid(
  entry: WaitlistEntry,
  now: Date = new Date()
): boolean {
  if (entry.status !== 'offered' || !entry.offerExpiresAt) return false;
  return now.getTime() <= new Date(entry.offerExpiresAt).getTime();
}

export function validateScheduleChangeSafety(params: {
  doctorId: string;
  newSchedule: DoctorSchedule;
  appointments: Appointment[];
  todayDateStr: string;
}): { safe: boolean; conflictingAppointmentsCount: number } {
  const futureActive = params.appointments.filter(
    (a) =>
      a.doctorId === params.doctorId &&
      a.date >= params.todayDateStr &&
      (a.status === 'confirmed' || a.status === 'checked_in')
  );

  const conflicts = futureActive.filter((a) => {
    const dow = getDayOfWeekForDate(a.date);
    if (!params.newSchedule.workingDays.includes(dow)) return true;
    const validSlots = generateScheduleSlots(params.newSchedule);
    if (!validSlots.includes(a.timeSlot)) return true;
    const dayBooked = futureActive.filter((x) => x.date === a.date).length;
    if (dayBooked > params.newSchedule.dailyCapacity) return true;
    return false;
  });

  return {
    safe: conflicts.length === 0,
    conflictingAppointmentsCount: conflicts.length,
  };
}

export function computeAnalyticsSummary(params: {
  specialties: Specialty[];
  doctors: Doctor[];
  schedules: DoctorSchedule[];
  appointments: Appointment[];
  waitlist: WaitlistEntry[];
  settings: ClinicSettings;
  todayDateStr: string;
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    specialtyId?: string;
    doctorId?: string;
    status?: AppointmentStatus | 'all';
  };
}): AnalyticsSummary {
  const {
    specialties,
    doctors,
    schedules,
    appointments,
    waitlist,
    todayDateStr,
    filters,
  } = params;

  const filtered = appointments.filter((a) => {
    if (filters?.dateFrom && a.date < filters.dateFrom) return false;
    if (filters?.dateTo && a.date > filters.dateTo) return false;
    if (filters?.specialtyId && filters.specialtyId !== 'all' && a.specialtyId !== filters.specialtyId) return false;
    if (filters?.doctorId && filters.doctorId !== 'all' && a.doctorId !== filters.doctorId) return false;
    if (filters?.status && filters.status !== 'all' && a.status !== filters.status) return false;
    return true;
  });

  const totalAppointments = filtered.length;
  const todayAppointments = filtered.filter((a) => a.date === todayDateStr).length;
  const completedCount = filtered.filter((a) => a.status === 'completed').length;
  const cancelledCount = filtered.filter((a) => a.status === 'cancelled').length;
  const noShowCount = filtered.filter((a) => a.status === 'no_show').length;

  const activeDoctors = doctors.filter((d) => d.active);
  const dailyCapacityTotal = activeDoctors.reduce((sum, doc) => {
    const sched = schedules.find((s) => s.doctorId === doc.id);
    return sum + (sched && !sched.bookingsPaused ? sched.dailyCapacity : 0);
  }, 0);

  const uniqueDates = Array.from(new Set(filtered.map((a) => a.date))).sort();
  const periodDaysCount = Math.max(1, uniqueDates.length);
  const totalAvailableCapacity = dailyCapacityTotal * Math.min(periodDaysCount, 30);

  const activeBookedTotal = filtered.filter((a) => ACTIVE_CAPACITY_STATUSES.has(a.status)).length;
  const utilizationRate =
    totalAvailableCapacity > 0
      ? Math.min(100, Math.round((activeBookedTotal / totalAvailableCapacity) * 100))
      : 0;

  const noShowRate =
    totalAppointments > 0 ? Math.round((noShowCount / totalAppointments) * 100) : 0;
  const cancellationRate =
    totalAppointments > 0 ? Math.round((cancelledCount / totalAppointments) * 100) : 0;

  const waitlistCount = waitlist.filter(
    (w) => w.status === 'waiting' || w.status === 'offered'
  ).length;

  const recentDates = uniqueDates.slice(-14);
  const dailyTrends = recentDates.map((d) => {
    const dayItems = filtered.filter((a) => a.date === d);
    return {
      date: d,
      total: dayItems.length,
      completed: dayItems.filter((a) => a.status === 'completed').length,
      cancelled: dayItems.filter((a) => a.status === 'cancelled').length,
      noShow: dayItems.filter((a) => a.status === 'no_show').length,
    };
  });

  const bySpecialty = specialties.map((sp) => {
    const spDocs = activeDoctors.filter((d) => d.specialtyId === sp.id);
    const spDailyCap = spDocs.reduce((sum, d) => {
      const sched = schedules.find((s) => s.doctorId === d.id);
      return sum + (sched?.dailyCapacity ?? 0);
    }, 0);
    const spTotalCap = spDailyCap * Math.min(periodDaysCount, 30);
    const spBooked = filtered.filter(
      (a) => a.specialtyId === sp.id && ACTIVE_CAPACITY_STATUSES.has(a.status)
    ).length;
    return {
      specialtyId: sp.id,
      nameAr: sp.nameAr,
      nameEn: sp.nameEn,
      total: filtered.filter((a) => a.specialtyId === sp.id).length,
      capacity: spTotalCap,
      utilizationRate:
        spTotalCap > 0 ? Math.min(100, Math.round((spBooked / spTotalCap) * 100)) : 0,
    };
  });

  const byDoctor = activeDoctors.map((doc) => {
    const sched = schedules.find((s) => s.doctorId === doc.id);
    const docBooked = filtered.filter(
      (a) => a.doctorId === doc.id && ACTIVE_CAPACITY_STATUSES.has(a.status)
    ).length;
    const docCap = (sched?.dailyCapacity ?? 20) * Math.min(periodDaysCount, 30);
    return {
      doctorId: doc.id,
      nameAr: doc.nameAr,
      nameEn: doc.nameEn,
      booked: docBooked,
      capacity: docCap,
      utilizationRate: docCap > 0 ? Math.min(100, Math.round((docBooked / docCap) * 100)) : 0,
    };
  });

  const hourCounts = new Map<string, number>();
  for (const a of filtered) {
    const hour = `${a.timeSlot.slice(0, 2)}:00`;
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }
  const peakHours = Array.from(hourCounts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hour, count]) => ({ hour, count }));

  const reportingPeriod =
    uniqueDates.length > 0
      ? `${uniqueDates[0]} → ${uniqueDates[uniqueDates.length - 1]}`
      : todayDateStr;

  return {
    reportingPeriod,
    totalAppointments,
    todayAppointments,
    totalAvailableCapacity,
    utilizationRate,
    completedCount,
    cancelledCount,
    noShowCount,
    noShowRate,
    cancellationRate,
    waitlistCount,
    activeDoctorsCount: activeDoctors.length,
    dailyTrends,
    bySpecialty,
    byDoctor,
    peakHours,
  };
}

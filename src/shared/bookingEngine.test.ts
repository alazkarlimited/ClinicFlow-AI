import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysToDateStr,
  canCancelAppointment,
  computeAnalyticsSummary,
  computeDayAvailability,
  countBookedCapacity,
  findNextAvailableSlot,
  generateScheduleSlots,
  getNowInTimezone,
  isValidStatusTransition,
  isWaitlistOfferValid,
  validateScheduleChangeSafety,
} from './bookingEngine';
import { buildSeedDatabase } from './seedData';

test('generateScheduleSlots excludes break window accurately', () => {
  const seed = buildSeedDatabase(new Date('2026-11-14T09:00:00Z'));
  const sched = seed.schedules.find((s) => s.doctorId === 'doc-internal-1')!;
  const slots = generateScheduleSlots(sched);
  assert.equal(slots.includes('15:00'), false);
  assert.equal(slots.includes('15:30'), false);
  assert.equal(slots.includes('10:00'), true);
  assert.equal(slots.includes('16:00'), true);
  assert.equal(slots.length, 20);
});

test('Last Available Appointment scenario starts at 19/20 booked and 1 remaining', () => {
  const fixedNow = new Date('2026-11-14T08:00:00Z');
  const seed = buildSeedDatabase(fixedNow);
  const doctor = seed.doctors.find((d) => d.id === seed.scenarioDoctorId)!;
  const schedule = seed.schedules.find((s) => s.doctorId === seed.scenarioDoctorId)!;

  const day = computeDayAvailability({
    doctor,
    schedule,
    exceptions: seed.exceptions,
    appointments: seed.appointments,
    dateStr: seed.scenarioDate,
    now: fixedNow,
  });

  assert.equal(day.dailyCapacity, 20);
  assert.equal(day.bookedCount, 19);
  assert.equal(day.remainingCapacity, 1);
  const openSlots = day.slots.filter((s) => s.available);
  assert.equal(openSlots.length, 1);
});

test('Booking 20th appointment closes daily capacity and blocks 21st', () => {
  const fixedNow = new Date('2026-11-14T08:00:00Z');
  const seed = buildSeedDatabase(fixedNow);
  const doctor = seed.doctors.find((d) => d.id === seed.scenarioDoctorId)!;
  const schedule = seed.schedules.find((s) => s.doctorId === seed.scenarioDoctorId)!;

  const before = computeDayAvailability({
    doctor,
    schedule,
    exceptions: seed.exceptions,
    appointments: seed.appointments,
    dateStr: seed.scenarioDate,
    now: fixedNow,
  });
  const finalSlot = before.slots.find((s) => s.available)!;

  seed.appointments.push({
    id: 'apt-20th',
    bookingRef: 'CF-9999',
    patientUid: 'pat-20',
    patientName: 'Test Patient 20',
    patientPhone: '01012345678',
    doctorId: doctor.id,
    doctorNameSnapshotAr: doctor.nameAr,
    doctorNameSnapshotEn: doctor.nameEn,
    specialtyId: doctor.specialtyId,
    specialtyNameSnapshotAr: 'الباطنة العامة',
    specialtyNameSnapshotEn: 'Internal Medicine',
    date: seed.scenarioDate,
    timeSlot: finalSlot.timeSlot,
    status: 'confirmed',
    bookingType: 'online',
    createdAt: fixedNow.toISOString(),
    updatedAt: fixedNow.toISOString(),
  });

  const after = computeDayAvailability({
    doctor,
    schedule,
    exceptions: seed.exceptions,
    appointments: seed.appointments,
    dateStr: seed.scenarioDate,
    now: fixedNow,
  });
  assert.equal(after.bookedCount, 20);
  assert.equal(after.remainingCapacity, 0);
  assert.equal(after.slots.filter((s) => s.available).length, 0);
});

test('Past dates and past same-day slots are never bookable', () => {
  const fixedNow = new Date('2026-11-14T14:30:00Z'); // 16:30 Africa/Cairo (UTC+2)
  const { dateStr: today } = getNowInTimezone(fixedNow, 'Africa/Cairo');
  const seed = buildSeedDatabase(fixedNow);
  const doctor = seed.doctors.find((d) => d.id === 'doc-internal-1')!;
  const schedule = seed.schedules.find((s) => s.doctorId === 'doc-internal-1')!;

  const yesterday = addDaysToDateStr(today, -1);
  const pastDay = computeDayAvailability({
    doctor,
    schedule,
    exceptions: [],
    appointments: [],
    dateStr: yesterday,
    now: fixedNow,
  });
  assert.equal(pastDay.slots.some((s) => s.available), false);

  const todayAvail = computeDayAvailability({
    doctor,
    schedule,
    exceptions: [],
    appointments: [],
    dateStr: today,
    now: fixedNow,
  });
  const slot1000 = todayAvail.slots.find((s) => s.timeSlot === '10:00')!;
  const slot1800 = todayAvail.slots.find((s) => s.timeSlot === '18:00')!;
  assert.equal(slot1000.available, false);
  assert.equal(slot1000.reason, 'past');
  assert.equal(slot1800.available, true);
});

test('Cancellation cutoff enforces 4-hour rule for patients but allows staff override', () => {
  const fixedNow = new Date('2026-11-14T10:00:00Z'); // 12:00 Cairo
  const { dateStr: today } = getNowInTimezone(fixedNow, 'Africa/Cairo');

  const soonApt = {
    id: 'a1',
    bookingRef: 'CF-1',
    patientUid: 'p1',
    patientName: 'Patient',
    patientPhone: '01012345678',
    doctorId: 'doc-internal-1',
    doctorNameSnapshotAr: 'د',
    doctorNameSnapshotEn: 'Dr',
    specialtyId: 'spec-internal',
    specialtyNameSnapshotAr: 'ب',
    specialtyNameSnapshotEn: 'I',
    date: today,
    timeSlot: '14:00', // 2 hours away
    status: 'confirmed' as const,
    bookingType: 'online' as const,
    createdAt: fixedNow.toISOString(),
    updatedAt: fixedNow.toISOString(),
  };

  const patCheck = canCancelAppointment({
    appointment: soonApt,
    actorRole: 'patient',
    cutoffHours: 4,
    now: fixedNow,
  });
  assert.equal(patCheck.allowed, false);
  assert.equal(patCheck.reason, 'cutoff_passed');

  const recCheck = canCancelAppointment({
    appointment: soonApt,
    actorRole: 'receptionist',
    cutoffHours: 4,
    now: fixedNow,
  });
  assert.equal(recCheck.allowed, true);
});

test('Status transitions prevent patients from self-completing and lock terminal states for staff', () => {
  assert.equal(isValidStatusTransition('confirmed', 'completed', 'patient'), false);
  assert.equal(isValidStatusTransition('confirmed', 'cancelled', 'patient'), true);
  assert.equal(isValidStatusTransition('confirmed', 'checked_in', 'receptionist'), true);
  assert.equal(isValidStatusTransition('checked_in', 'completed', 'receptionist'), true);
  assert.equal(isValidStatusTransition('completed', 'cancelled', 'receptionist'), false);
  assert.equal(isValidStatusTransition('no_show', 'confirmed', 'receptionist'), false);
});

test('Waitlist offer validity checks expiration timestamp strictly', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  const activeOffer = {
    id: 'w1',
    patientUid: 'p1',
    patientName: 'Test',
    patientPhone: '01012345678',
    doctorId: 'doc-internal-1',
    specialtyId: 'spec-internal',
    date: '2026-11-15',
    status: 'offered' as const,
    offeredTimeSlot: '10:30',
    offerExpiresAt: '2026-11-14T12:30:00Z',
    createdAt: '2026-11-14T11:00:00Z',
  };
  const expiredOffer = {
    ...activeOffer,
    offerExpiresAt: '2026-11-14T11:59:00Z',
  };
  assert.equal(isWaitlistOfferValid(activeOffer, now), true);
  assert.equal(isWaitlistOfferValid(expiredOffer, now), false);
});

test('Schedule modification safety detects conflicting future confirmed appointments', () => {
  const fixedNow = new Date('2026-11-14T08:00:00Z');
  const seed = buildSeedDatabase(fixedNow);
  const { dateStr: today } = getNowInTimezone(fixedNow, 'Africa/Cairo');
  const sched = { ...seed.schedules.find((s) => s.doctorId === seed.scenarioDoctorId)! };
  sched.dailyCapacity = 5; // Lower than 19 confirmed appointments!

  const check = validateScheduleChangeSafety({
    doctorId: seed.scenarioDoctorId,
    newSchedule: sched,
    appointments: seed.appointments,
    todayDateStr: today,
  });
  assert.equal(check.safe, false);
  assert.ok(check.conflictingAppointmentsCount >= 19);
});

test('Analytics summary & next available slot return consistent real numbers', () => {
  const fixedNow = new Date('2026-11-14T08:00:00Z');
  const seed = buildSeedDatabase(fixedNow);
  const { dateStr: today } = getNowInTimezone(fixedNow, 'Africa/Cairo');

  const analytics = computeAnalyticsSummary({
    specialties: seed.specialties,
    doctors: seed.doctors,
    schedules: seed.schedules,
    appointments: seed.appointments,
    waitlist: seed.waitlist,
    settings: seed.settings,
    todayDateStr: today,
  });

  assert.equal(analytics.totalAppointments, seed.appointments.length);
  assert.equal(analytics.activeDoctorsCount, 12);
  assert.equal(
    countBookedCapacity(seed.appointments, seed.scenarioDoctorId, seed.scenarioDate),
    19
  );

  const next = findNextAvailableSlot({
    doctor: seed.doctors[0],
    schedule: seed.schedules[0],
    exceptions: seed.exceptions,
    appointments: seed.appointments,
    startDateStr: seed.scenarioDate,
    now: fixedNow,
  });
  assert.ok(next !== null);
});

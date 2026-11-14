import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BookingError,
  cancelAppointmentAtomic,
  confirmWaitlistOfferAtomic,
  createAppointmentAtomic,
  getAvailabilityForDoctorDate,
  joinWaitlistAtomic,
  resetDemoDatabase,
} from './store';

test('Concurrent bookings for the 20th/20 slot allow exactly one winner', async () => {
  const fresh = await resetDemoDatabase('test-runner');
  const dayBefore = await getAvailabilityForDoctorDate(
    fresh.scenarioDoctorId,
    fresh.scenarioDate
  );
  assert.ok(dayBefore);
  assert.equal(dayBefore.bookedCount, 19);
  assert.equal(dayBefore.remainingCapacity, 1);

  const lastSlot = dayBefore.slots.find((s) => s.available)!;

  const [r1, r2] = await Promise.allSettled([
    createAppointmentAtomic({
      patientUid: 'pat-race-1',
      patientName: 'مريض السباق الأول',
      patientPhone: '01011111111',
      doctorId: fresh.scenarioDoctorId,
      date: fresh.scenarioDate,
      timeSlot: lastSlot.timeSlot,
      bookingType: 'online',
      actorUid: 'pat-race-1',
      actorRole: 'patient',
    }),
    createAppointmentAtomic({
      patientUid: 'pat-race-2',
      patientName: 'مريض السباق الثاني',
      patientPhone: '01022222222',
      doctorId: fresh.scenarioDoctorId,
      date: fresh.scenarioDate,
      timeSlot: lastSlot.timeSlot,
      bookingType: 'online',
      actorUid: 'pat-race-2',
      actorRole: 'patient',
    }),
  ]);

  const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
  const rejected = [r1, r2].filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  const err = (rejected[0] as PromiseRejectedResult).reason;
  assert.ok(err instanceof BookingError);
  assert.equal(err.code, 'CAPACITY_FULL');

  // Verify 20/20 state
  const dayAfter = await getAvailabilityForDoctorDate(
    fresh.scenarioDoctorId,
    fresh.scenarioDate
  );
  assert.equal(dayAfter?.bookedCount, 20);
  assert.equal(dayAfter?.remainingCapacity, 0);

  // Join waitlist for new patient, then cancel an eligible appointment and verify auto-offer & confirm
  const wl = await joinWaitlistAtomic({
    patientUid: 'pat-wl-test',
    patientName: 'مريض قائمة الانتظار',
    patientPhone: '01033333333',
    doctorId: fresh.scenarioDoctorId,
    date: fresh.scenarioDate,
  });
  assert.equal(wl.status, 'waiting');

  const winnerApt = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof createAppointmentAtomic>>>).value;
  const cancelRes = await cancelAppointmentAtomic({
    appointmentId: winnerApt.id,
    actorUid: 'pat-race-1',
    actorRole: 'patient',
  });
  assert.equal(cancelRes.appointment.status, 'cancelled');
  assert.ok(cancelRes.promotedWaitlist);
  assert.equal(cancelRes.promotedWaitlist.status, 'offered');

  const confirmedOffer = await confirmWaitlistOfferAtomic({
    entryId: cancelRes.promotedWaitlist.id,
    actorUid: cancelRes.promotedWaitlist.patientUid,
    actorRole: 'patient',
  });
  assert.equal(confirmedOffer.entry.status, 'confirmed');
  assert.equal(confirmedOffer.appointment.bookingType, 'waitlist_offer');

  // Restore clean demo seed state for UI
  await resetDemoDatabase('test-runner');
});

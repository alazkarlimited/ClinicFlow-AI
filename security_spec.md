# ClinicFlow AI — Firestore Security Specification

## 1. Data Invariants
1. A user cannot self-assign `admin` or `receptionist` roles in `users`, `patientProfiles`, `admins`, or `receptionists`.
2. Patients can only `get`, `list`, `create`, and `update` (cancel own active appointment) records where `patientUid == request.auth.uid`.
3. `patientProfiles` and `appointments` PII (`patientPhone`, `email`) cannot be read by unrelated patients.
4. Terminal appointment statuses (`completed`, `cancelled`, `no_show`) are locked against non-admin mutations.
5. `auditLogs` are append-only for admins/staff and strictly immutable (`allow update, delete: if false`).
6. Every write requires `request.auth != null && request.auth.token.email_verified == true`.
7. Document IDs must match `^[a-zA-Z0-9_\-]+$` with max length 128.
8. Every string field enforces strict `.size()` bounds to prevent resource exhaustion.

## 2. Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Appointment Read**: `get /appointments/apt-1` with `auth = null`.
2. **Cross-Patient Appointment List**: `list /appointments` as `patientA` without `where('patientUid', '==', 'patientA')`.
3. **Self-Admin Escalation**: `create /admins/patientA` as `patientA`.
4. **Ghost Field Shadow Write**: `create /users/patientA` containing `{ uid: 'patientA', displayName: 'Test', preferredLanguage: 'ar-EG', isAdmin: true, createdAt: serverTimestamp, updatedAt: serverTimestamp }`.
5. **Unverified Email Spoof**: `create /specialties/cardio` with `email: 'eng4elec.eg@gmail.com'` and `email_verified: false`.
6. **Patient Modifying Doctor Schedule**: `update /doctorSchedules/doc-1` as `patientA`.
7. **Patient Marking Own Appointment Completed**: `update /appointments/apt-1` setting `status: 'completed'` as `patientA`.
8. **Mutating Terminal Appointment**: `update /appointments/apt-completed` as `patientA` or `receptionist` after `status == 'completed'`.
9. **ID Poisoning Attack**: `create /appointments/<2KB string>` with invalid characters.
10. **1MB String Overflow**: `create /patientProfiles/patientA` with `fullName` length 5000 chars.
11. **Timestamp Forgery**: `create /users/patientA` with `createdAt: '2020-01-01'` instead of `request.time`.
12. **Audit Log Tampering**: `delete /auditLogs/log-1` or `update /auditLogs/log-1` even by an admin.

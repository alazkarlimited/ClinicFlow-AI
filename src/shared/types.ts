export type LanguageCode = 'ar-EG' | 'en';
export type UserRole = 'guest' | 'patient' | 'receptionist' | 'admin';

export type AppointmentStatus =
  | 'confirmed'
  | 'checked_in'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type BookingType =
  | 'online'
  | 'walk_in'
  | 'reception_assisted'
  | 'waitlist_offer';

export type WaitlistStatus =
  | 'waiting'
  | 'offered'
  | 'confirmed'
  | 'expired'
  | 'cancelled';

export interface Specialty {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  iconKey: string;
  active: boolean;
}

export interface Doctor {
  id: string;
  specialtyId: string;
  nameAr: string;
  nameEn: string;
  titleAr: string;
  titleEn: string;
  bioAr: string;
  bioEn: string;
  avatarUrl: string;
  consultationFeeEgp: number;
  active: boolean;
  isDemoProfile: boolean;
}

export interface DoctorSchedule {
  id: string;
  doctorId: string;
  workingDays: number[]; // 0 = Sunday ... 6 = Saturday
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  breakStart?: string; // HH:mm
  breakEnd?: string; // HH:mm
  slotDurationMinutes: number;
  dailyCapacity: number;
  perSlotCapacity: number;
  bookingsPaused: boolean;
}

export interface ScheduleException {
  id: string;
  doctorId: string;
  date: string; // YYYY-MM-DD
  isClosed: boolean;
  reasonAr?: string;
  reasonEn?: string;
  customCapacity?: number;
}

export interface Appointment {
  id: string;
  bookingRef: string;
  patientUid: string;
  patientName: string;
  patientPhone: string;
  doctorId: string;
  doctorNameSnapshotAr: string;
  doctorNameSnapshotEn: string;
  specialtyId: string;
  specialtyNameSnapshotAr: string;
  specialtyNameSnapshotEn: string;
  date: string; // YYYY-MM-DD
  timeSlot: string; // HH:mm
  status: AppointmentStatus;
  bookingType: BookingType;
  notes?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface WaitlistEntry {
  id: string;
  patientUid: string;
  patientName: string;
  patientPhone: string;
  doctorId: string;
  specialtyId: string;
  date: string; // YYYY-MM-DD
  status: WaitlistStatus;
  offeredTimeSlot?: string;
  offerExpiresAt?: string; // ISO
  createdAt: string; // ISO
}

export interface NotificationItem {
  id: string;
  recipientUid: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  channel: 'in_app' | 'simulated_sms' | 'simulated_whatsapp';
  read: boolean;
  createdAt: string; // ISO
}

export interface ClinicSettings {
  id: string;
  clinicNameAr: string;
  clinicNameEn: string;
  timezone: string;
  cancellationCutoffHours: number;
  defaultDailyLimit: number;
  waitlistOfferExpirationMinutes: number;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorRole: UserRole | 'system';
  action: string;
  targetType: string;
  targetId: string;
  summaryAr: string;
  summaryEn: string;
  createdAt: string;
}

export interface StaffAccount {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'receptionist';
  assignedAt: string;
}

export interface PatientProfile {
  uid: string;
  fullName: string;
  phone: string;
  email?: string;
  preferredLanguage: LanguageCode;
  elderlyAssistMode: boolean;
  updatedAt: string;
}

export interface TimeSlotAvailability {
  timeSlot: string;
  available: boolean;
  bookedCount: number;
  maxSlotCapacity: number;
  reason?: 'booked' | 'past' | 'break' | 'daily_full' | 'closed' | 'paused';
}

export interface DayAvailability {
  doctorId: string;
  date: string;
  isWorkingDay: boolean;
  isClosed: boolean;
  closureReasonAr?: string;
  closureReasonEn?: string;
  bookingsPaused: boolean;
  dailyCapacity: number;
  bookedCount: number;
  remainingCapacity: number;
  slots: TimeSlotAvailability[];
}

export interface AnalyticsSummary {
  reportingPeriod: string;
  totalAppointments: number;
  todayAppointments: number;
  totalAvailableCapacity: number;
  utilizationRate: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  noShowRate: number;
  cancellationRate: number;
  waitlistCount: number;
  activeDoctorsCount: number;
  dailyTrends: Array<{
    date: string;
    total: number;
    completed: number;
    cancelled: number;
    noShow: number;
  }>;
  bySpecialty: Array<{
    specialtyId: string;
    nameAr: string;
    nameEn: string;
    total: number;
    capacity: number;
    utilizationRate: number;
  }>;
  byDoctor: Array<{
    doctorId: string;
    nameAr: string;
    nameEn: string;
    booked: number;
    capacity: number;
    utilizationRate: number;
  }>;
  peakHours: Array<{
    hour: string;
    count: number;
  }>;
}

export interface AiChatActionCard {
  type: 'slots' | 'confirm_booking' | 'booking_receipt' | 'confirm_cancel' | 'doctors';
  titleAr: string;
  titleEn: string;
  payload: Record<string, unknown>;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  cards?: AiChatActionCard[];
  error?: boolean;
}

export interface AiBiReport {
  reportingPeriod: string;
  executiveSummary: string;
  importantFindings: string[];
  bottlenecks: string[];
  recommendations: Array<{
    title: string;
    action: string;
    evidence: string;
  }>;
  disclaimer: string;
}

export interface DoctorDateOccupancy {
  bookedCount: number;
  dailyCapacity: number;
  remainingCapacity: number;
  isClosed: boolean;
}

export interface ClinicBootstrapState {
  demoMode: boolean;
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
  patientProfile?: PatientProfile;
  occupancyByDoctorDate: Record<string, DoctorDateOccupancy>;
  analytics: AnalyticsSummary;
}

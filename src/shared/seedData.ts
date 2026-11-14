import {
  addDaysToDateStr,
  generateScheduleSlots,
  getDayOfWeekForDate,
  getNowInTimezone,
} from './bookingEngine';
import type {
  Appointment,
  AppointmentStatus,
  AuditLog,
  ClinicSettings,
  Doctor,
  DoctorSchedule,
  NotificationItem,
  ScheduleException,
  Specialty,
  StaffAccount,
  WaitlistEntry,
} from './types';

export const SPECIALTIES_SEED: Specialty[] = [
  {
    id: 'spec-internal',
    nameAr: 'الباطنة العامة',
    nameEn: 'Internal Medicine',
    descriptionAr: 'متابعة الأمراض المزمنة، الفحوصات الدورية، وتشخيص اضطرابات الجهاز الهضمي والضغط والسكري.',
    descriptionEn: 'Comprehensive adult primary care, chronic condition management, hypertension, diabetes, and digestive health.',
    iconKey: 'Stethoscope',
    active: true,
  },
  {
    id: 'spec-pediatrics',
    nameAr: 'طب الأطفال وحديثي الولادة',
    nameEn: 'Pediatrics',
    descriptionAr: 'رعاية شاملة للأطفال، متابعة النمو والتطعيمات، وعلاج الحالات الحادة والموسمية.',
    descriptionEn: 'Child growth monitoring, routine vaccinations, newborn follow-ups, and acute pediatric care.',
    iconKey: 'Baby',
    active: true,
  },
  {
    id: 'spec-orthopedics',
    nameAr: 'العظام والمفاصل',
    nameEn: 'Orthopedics',
    descriptionAr: 'تشخيص وعلاج آلام الظهر والمفاصل، إصابات الملاعب، ومتابعة الكسور والتأهيل الحركي.',
    descriptionEn: 'Joint and spine care, sports injuries, fracture follow-up, and musculoskeletal rehabilitation.',
    iconKey: 'Bone',
    active: true,
  },
  {
    id: 'spec-dermatology',
    nameAr: 'الجلدية والتجميل الطبي',
    nameEn: 'Dermatology',
    descriptionAr: 'علاج أمراض الجلد والشعر والأظافر، الحساسية الجلدية، والاستشارات الطبية المتخصصة.',
    descriptionEn: 'Clinical skin, hair, and nail care, eczema, allergies, and medical dermatology consultations.',
    iconKey: 'Sparkles',
    active: true,
  },
  {
    id: 'spec-cardiology',
    nameAr: 'القلب والأوعية الدموية',
    nameEn: 'Cardiology',
    descriptionAr: 'تقييم صحة القلب، رسم القلب والإيكو، وضبط ضغط الدم والوقاية القلبية.',
    descriptionEn: 'Cardiac risk evaluation, ECG & echocardiography follow-up, and blood pressure optimization.',
    iconKey: 'HeartPulse',
    active: true,
  },
  {
    id: 'spec-ent',
    nameAr: 'الأنف والأذن والحنجرة',
    nameEn: 'ENT',
    descriptionAr: 'فحص الجيوب الأنفية، مشكلات السمع والاتزان، والتهابات الحلق واللوزتين.',
    descriptionEn: 'Sinus disorders, hearing & balance assessments, tonsillitis, and throat care.',
    iconKey: 'Ear',
    active: true,
  },
  {
    id: 'spec-obgyn',
    nameAr: 'النساء والتوليد',
    nameEn: 'Obstetrics & Gynecology',
    descriptionAr: 'متابعة الحمل الدورية، صحة المرأة، والاستشارات الوقائية في بيئة هادئة ومريحة.',
    descriptionEn: 'Prenatal follow-ups, women’s preventive wellness, and specialized gynecological consultations.',
    iconKey: 'HeartHandshake',
    active: true,
  },
  {
    id: 'spec-dentistry',
    nameAr: 'طب الأسنان',
    nameEn: 'Dentistry',
    descriptionAr: 'الكشف الدوري، حشوات الأسنان، علاج الجذور واللثة، ورعاية أسنان الأطفال.',
    descriptionEn: 'Routine dental exams, restorative fillings, endodontics, gum care, and pediatric dentistry.',
    iconKey: 'Smile',
    active: true,
  },
];

export const DOCTORS_SEED: Doctor[] = [
  {
    id: 'doc-internal-1',
    specialtyId: 'spec-internal',
    nameAr: 'د. كريم السيد منصور (ملف تجريبي)',
    nameEn: 'Dr. Karim El-Sayed Mansour (Demo)',
    titleAr: 'استشاري الباطنة والغدد الصماء',
    titleEn: 'Consultant of Internal Medicine & Endocrinology',
    bioAr: 'نموذج تعريفي لطبيب استشاري متخصص في متابعة السكري وارتفاع ضغط الدم والفحوصات الشاملة.',
    bioEn: 'Fictional demo consultant specializing in diabetes care, hypertension management, and comprehensive adult checkups.',
    avatarUrl: '/src/assets/images/doctor_male_senior_1794660437808.jpg',
    consultationFeeEgp: 450,
    active: true,
    isDemoProfile: true,
  },
  {
    id: 'doc-internal-2',
    specialtyId: 'spec-internal',
    nameAr: 'د. سلمى طارق عبد الرحمن (ملف تجريبي)',
    nameEn: 'Dr. Salma Tarek Abdelrahman (Demo)',
    titleAr: 'أخصائي الباطنة والجهاز الهضمي',
    titleEn: 'Specialist in Internal Medicine & Gastroenterology',
    bioAr: 'نموذج تعريفي لطبيبة متخصصة في اضطرابات الجهاز الهضمي والتغذية العلاجية.',
    bioEn: 'Fictional demo specialist focusing on digestive disorders and clinical nutrition.',
    avatarUrl: '/src/assets/images/doctor_female_specialist_1794660438986.jpg',
    consultationFeeEgp: 400,
    active: true,
    isDemoProfile: true,
  },
  {
    id: 'doc-peds-1',
    specialtyId: 'spec-pediatrics',
    nameAr: 'د. يوسف شريف حسن (ملف تجريبي)',
    nameEn: 'Dr. Youssef Sherif Hassan (Demo)',
    titleAr: 'استشاري طب الأطفال وحديثي الولادة',
    titleEn: 'Consultant Pediatrician & Neonatologist',
    bioAr: 'نموذج تعريفي لاستشاري متابعة نمو الأطفال والتطعيمات الدورية وحساسية الصدر.',
    bioEn: 'Fictional demo consultant for childhood growth tracking, vaccinations, and pediatric respiratory care.',
    avatarUrl: '/src/assets/images/doctor_pediatrician_1794660439839.jpg',
    consultationFeeEgp: 420,
    active: true,
    isDemoProfile: true,
  },
  {
    id: 'doc-peds-2',
    specialtyId: 'spec-pediatrics',
    nameAr: 'د. نورهان عادل فهمي (ملف تجريبي)',
    nameEn: 'Dr. Nourhan Adel Fahmy (Demo)',
    titleAr: 'أخصائي طب الأطفال والتغذية',
    titleEn: 'Pediatric & Child Nutrition Specialist',
    bioAr: 'نموذج تعريفي لطبيبة أطفال متخصصة في التغذية السليمة ورعاية الرضع.',
    bioEn: 'Fictional demo pediatric specialist focused on infant wellness and balanced nutrition.',
    avatarUrl: '/src/assets/images/doctor_female_specialist_1794660438986.jpg',
    consultationFeeEgp: 380,
    active: true,
    isDemoProfile: true,
  },
  {
    id: 'doc-ortho-1',
    specialtyId: 'spec-orthopedics',
    nameAr: 'د. أحمد مجدي النجار (ملف تجريبي)',
    nameEn: 'Dr. Ahmed Magdy El-Naggar (Demo)',
    titleAr: 'استشاري جراحة العظام والمفاصل',
    titleEn: 'Consultant of Orthopedics & Joint Care',
    bioAr: 'نموذج تعريفي لاستشاري آلام العمود الفقري وخشونة المفاصل وإصابات الملاعب.',
    bioEn: 'Fictional demo orthopedic consultant specializing in spine health, arthritis, and sports rehabilitation.',
    avatarUrl: '/src/assets/images/doctor_male_senior_1794660437808.jpg',
    consultationFeeEgp: 500,
    active: true,
    isDemoProfile: true,
  },
  {
    id: 'doc-ortho-2',
    specialtyId: 'spec-orthopedics',
    nameAr: 'د. مصطفى حاتم زكي (ملف تجريبي)',
    nameEn: 'Dr. Mostafa Hatem Zaki (Demo)',
    titleAr: 'أخصائي إصابات الملاعب والكسور',
    titleEn: 'Sports Injury & Trauma Specialist',
    bioAr: 'نموذج تعريفي لأخصائي متابعة الكسور وإعادة التأهيل الحركي.',
    bioEn: 'Fictional demo specialist in fracture recovery and sports medicine.',
    avatarUrl: '/src/assets/images/doctor_pediatrician_1794660439839.jpg',
    consultationFeeEgp: 420,
    active: true,
    isDemoProfile: true,
  },
  {
    id: 'doc-derm-1',
    specialtyId: 'spec-dermatology',
    nameAr: 'د. مريم نبيل صادق (ملف تجريبي)',
    nameEn: 'Dr. Mariam Nabil Sadek (Demo)',
    titleAr: 'استشاري الأمراض الجلدية',
    titleEn: 'Consultant Dermatologist',
    bioAr: 'نموذج تعريفي لاستشارية علاج الأكزيما والصدفية وأمراض الشعر والأظافر.',
    bioEn: 'Fictional demo consultant dermatologist treating eczema, psoriasis, and hair conditions.',
    avatarUrl: '/src/assets/images/doctor_female_specialist_1794660438986.jpg',
    consultationFeeEgp: 450,
    active: true,
    isDemoProfile: true,
  },
  {
    id: 'doc-cardio-1',
    specialtyId: 'spec-cardiology',
    nameAr: 'د. هشام فؤاد الشناوي (ملف تجريبي)',
    nameEn: 'Dr. Hesham Fouad El-Shenawy (Demo)',
    titleAr: 'استشاري أمراض القلب والقسطرة',
    titleEn: 'Consultant Cardiologist',
    bioAr: 'نموذج تعريفي لاستشاري تقييم شرايين القلب وضغط الدم المزمن والإيكو.',
    bioEn: 'Fictional demo cardiologist specializing in preventive cardiology, hypertension, and echocardiography.',
    avatarUrl: '/src/assets/images/doctor_male_senior_1794660437808.jpg',
    consultationFeeEgp: 600,
    active: true,
    isDemoProfile: true,
  },
  {
    id: 'doc-ent-1',
    specialtyId: 'spec-ent',
    nameAr: 'د. عمر وليد بركات (ملف تجريبي)',
    nameEn: 'Dr. Omar Walid Barakat (Demo)',
    titleAr: 'أخصائي الأنف والأذن والحنجرة',
    titleEn: 'ENT Specialist',
    bioAr: 'نموذج تعريفي لأخصائي حساسية الأنف والجيوب الأنفية واضطرابات السمع.',
    bioEn: 'Fictional demo ENT specialist covering sinus care, ear infections, and audiology follow-up.',
    avatarUrl: '/src/assets/images/doctor_pediatrician_1794660439839.jpg',
    consultationFeeEgp: 380,
    active: true,
    isDemoProfile: true,
  },
  {
    id: 'doc-obgyn-1',
    specialtyId: 'spec-obgyn',
    nameAr: 'د. هبة الله محمود سالم (ملف تجريبي)',
    nameEn: 'Dr. Hebatallah Mahmoud Salem (Demo)',
    titleAr: 'استشاري أمراض النساء والتوليد',
    titleEn: 'Consultant OB/GYN',
    bioAr: 'نموذج تعريفي لاستشارية متابعة الحمل الآمن والفحوصات الدورية للسيدات.',
    bioEn: 'Fictional demo OB/GYN consultant providing prenatal monitoring and preventive care.',
    avatarUrl: '/src/assets/images/doctor_female_specialist_1794660438986.jpg',
    consultationFeeEgp: 500,
    active: true,
    isDemoProfile: true,
  },
  {
    id: 'doc-dent-1',
    specialtyId: 'spec-dentistry',
    nameAr: 'د. زياد أيمن راشد (ملف تجريبي)',
    nameEn: 'Dr. Ziad Ayman Rashed (Demo)',
    titleAr: 'أخصائي طب وجراحة الفم والأسنان',
    titleEn: 'Dental & Endodontic Specialist',
    bioAr: 'نموذج تعريفي لطبيب أسنان متخصص في علاج الجذور والحشوات التجميلية.',
    bioEn: 'Fictional demo dental specialist for root canal therapy and restorative dentistry.',
    avatarUrl: '/src/assets/images/doctor_pediatrician_1794660439839.jpg',
    consultationFeeEgp: 350,
    active: true,
    isDemoProfile: true,
  },
  {
    id: 'doc-dent-2',
    specialtyId: 'spec-dentistry',
    nameAr: 'د. رنا خالد الجوهري (ملف تجريبي)',
    nameEn: 'Dr. Rana Khaled El-Gohary (Demo)',
    titleAr: 'أخصائي طب أسنان الأطفال واللثة',
    titleEn: 'Pediatric Dentistry & Periodontics',
    bioAr: 'نموذج تعريفي لطبيبة أسنان متخصصة في رعاية أسنان الأطفال وعلاج اللثة.',
    bioEn: 'Fictional demo dentist focused on gentle pediatric dental care and gum health.',
    avatarUrl: '/src/assets/images/doctor_female_specialist_1794660438986.jpg',
    consultationFeeEgp: 350,
    active: true,
    isDemoProfile: true,
  },
];

// Working days: Sunday(0) to Thursday(4) + Saturday(6), Friday(5) off.
export const SCHEDULES_SEED: DoctorSchedule[] = [
  {
    id: 'sched-internal-1',
    doctorId: 'doc-internal-1',
    workingDays: [0, 1, 2, 3, 4, 6],
    startTime: '10:00',
    endTime: '21:00',
    breakStart: '15:00',
    breakEnd: '16:00',
    slotDurationMinutes: 30,
    dailyCapacity: 20,
    perSlotCapacity: 1,
    bookingsPaused: false,
  },
  {
    id: 'sched-internal-2',
    doctorId: 'doc-internal-2',
    workingDays: [0, 1, 3, 4, 6],
    startTime: '12:00',
    endTime: '20:00',
    breakStart: '16:00',
    breakEnd: '16:30',
    slotDurationMinutes: 30,
    dailyCapacity: 14,
    perSlotCapacity: 1,
    bookingsPaused: false,
  },
  {
    id: 'sched-peds-1',
    doctorId: 'doc-peds-1',
    workingDays: [0, 1, 2, 3, 4, 6],
    startTime: '11:00',
    endTime: '21:00',
    breakStart: '15:30',
    breakEnd: '16:30',
    slotDurationMinutes: 30,
    dailyCapacity: 16,
    perSlotCapacity: 1,
    bookingsPaused: false,
  },
  {
    id: 'sched-peds-2',
    doctorId: 'doc-peds-2',
    workingDays: [0, 2, 4, 6],
    startTime: '10:00',
    endTime: '18:00',
    slotDurationMinutes: 30,
    dailyCapacity: 14,
    perSlotCapacity: 1,
    bookingsPaused: false,
  },
  {
    id: 'sched-ortho-1',
    doctorId: 'doc-ortho-1',
    workingDays: [0, 1, 2, 3, 6],
    startTime: '13:00',
    endTime: '21:00',
    slotDurationMinutes: 30,
    dailyCapacity: 14,
    perSlotCapacity: 1,
    bookingsPaused: false,
  },
  {
    id: 'sched-ortho-2',
    doctorId: 'doc-ortho-2',
    workingDays: [1, 3, 4, 6],
    startTime: '14:00',
    endTime: '21:00',
    slotDurationMinutes: 30,
    dailyCapacity: 12,
    perSlotCapacity: 1,
    bookingsPaused: false,
  },
  {
    id: 'sched-derm-1',
    doctorId: 'doc-derm-1',
    workingDays: [0, 1, 2, 3, 4],
    startTime: '12:00',
    endTime: '20:00',
    slotDurationMinutes: 20,
    dailyCapacity: 18,
    perSlotCapacity: 1,
    bookingsPaused: false,
  },
  {
    id: 'sched-cardio-1',
    doctorId: 'doc-cardio-1',
    workingDays: [0, 2, 3, 6],
    startTime: '16:00',
    endTime: '22:00',
    slotDurationMinutes: 30,
    dailyCapacity: 10,
    perSlotCapacity: 1,
    bookingsPaused: false,
  },
  {
    id: 'sched-ent-1',
    doctorId: 'doc-ent-1',
    workingDays: [0, 1, 3, 4, 6],
    startTime: '13:00',
    endTime: '20:00',
    slotDurationMinutes: 20,
    dailyCapacity: 16,
    perSlotCapacity: 1,
    bookingsPaused: false,
  },
  {
    id: 'sched-obgyn-1',
    doctorId: 'doc-obgyn-1',
    workingDays: [0, 1, 2, 4, 6],
    startTime: '11:00',
    endTime: '19:00',
    slotDurationMinutes: 30,
    dailyCapacity: 14,
    perSlotCapacity: 1,
    bookingsPaused: false,
  },
  {
    id: 'sched-dent-1',
    doctorId: 'doc-dent-1',
    workingDays: [0, 1, 2, 3, 4, 6],
    startTime: '12:00',
    endTime: '21:00',
    slotDurationMinutes: 30,
    dailyCapacity: 15,
    perSlotCapacity: 1,
    bookingsPaused: false,
  },
  {
    id: 'sched-dent-2',
    doctorId: 'doc-dent-2',
    workingDays: [0, 2, 3, 4, 6],
    startTime: '11:00',
    endTime: '18:00',
    slotDurationMinutes: 30,
    dailyCapacity: 12,
    perSlotCapacity: 1,
    bookingsPaused: false,
  },
];

const DEMO_PATIENT_NAMES = [
  { name: 'محمود عبد الله حسن', phone: '01012345601' },
  { name: 'فاطمة إبراهيم علي', phone: '01123456702' },
  { name: 'أحمد مصطفى قاسم', phone: '01234567803' },
  { name: 'سارة محمد عبد العزيز', phone: '01545678904' },
  { name: 'خالد سمير توفيق', phone: '01098765405' },
  { name: 'منى جمال الدين', phone: '01187654306' },
  { name: 'طارق صلاح الدين', phone: '01276543207' },
  { name: 'نادية حسين سليمان', phone: '01065432108' },
  { name: 'ياسر فتحي رضوان', phone: '01154321009' },
  { name: 'أمل عادل زينهم', phone: '01243210910' },
  { name: 'عماد حمدي الشريف', phone: '01032109811' },
  { name: 'دعاء كمال نصار', phone: '01521098712' },
  { name: 'إبراهيم سعيد علام', phone: '01011223313' },
  { name: 'ليلى عبد الحميد بدر', phone: '01122334414' },
  { name: 'حسام الدين شوقي', phone: '01233445515' },
  { name: 'نجلاء فوزي مطر', phone: '01044556616' },
  { name: 'وليد عصام الدين', phone: '01155667717' },
  { name: 'شيماء رضا المهدي', phone: '01266778818' },
  { name: 'سيد عبد المنعم علي', phone: '01077889919' },
];

export function buildSeedDatabase(now: Date = new Date()): {
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
} {
  const { dateStr: today } = getNowInTimezone(now, 'Africa/Cairo');
  const scenarioDoctorId = 'doc-internal-1';
  const scenarioSchedule = SCHEDULES_SEED.find((s) => s.doctorId === scenarioDoctorId)!;

  // Choose the next future working day for Dr. Karim El-Sayed
  let scenarioDate = addDaysToDateStr(today, 1);
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = addDaysToDateStr(today, offset);
    if (scenarioSchedule.workingDays.includes(getDayOfWeekForDate(candidate))) {
      scenarioDate = candidate;
      break;
    }
  }

  const appointments: Appointment[] = [];
  let seq = 1001;

  const findSpec = (specId: string) =>
    SPECIALTIES_SEED.find((s) => s.id === specId)!;

  // 1) Dedicated Graduation Scenario: 19/20 confirmed appointments on scenarioDate for doc-internal-1
  const scenarioSlots = generateScheduleSlots(scenarioSchedule); // 20 slots total (10:00..20:30 minus 15:00-16:00)
  const doc1 = DOCTORS_SEED.find((d) => d.id === scenarioDoctorId)!;
  const spec1 = findSpec(doc1.specialtyId);

  for (let i = 0; i < 19 && i < scenarioSlots.length; i++) {
    const pat = DEMO_PATIENT_NAMES[i % DEMO_PATIENT_NAMES.length];
    const isDemoPatient = i === 0;
    const id = `apt-scen-${i + 1}`;
    appointments.push({
      id,
      bookingRef: `CF-${seq++}`,
      patientUid: isDemoPatient ? 'demo-patient-1' : `demo-pat-${i + 1}`,
      patientName: pat.name,
      patientPhone: pat.phone,
      doctorId: doc1.id,
      doctorNameSnapshotAr: doc1.nameAr,
      doctorNameSnapshotEn: doc1.nameEn,
      specialtyId: spec1.id,
      specialtyNameSnapshotAr: spec1.nameAr,
      specialtyNameSnapshotEn: spec1.nameEn,
      date: scenarioDate,
      timeSlot: scenarioSlots[i],
      status: 'confirmed',
      bookingType: i % 5 === 0 ? 'reception_assisted' : 'online',
      createdAt: new Date(now.getTime() - (24 - i) * 3600000).toISOString(),
      updatedAt: new Date(now.getTime() - (24 - i) * 3600000).toISOString(),
    });
  }

  // 2) Today's operational appointments for Reception Dashboard (mix of confirmed, checked_in, completed, no_show)
  const todayStatuses: AppointmentStatus[] = [
    'completed',
    'completed',
    'checked_in',
    'checked_in',
    'confirmed',
    'confirmed',
    'no_show',
    'cancelled',
  ];
  for (let dIdx = 0; dIdx < DOCTORS_SEED.length; dIdx++) {
    const doc = DOCTORS_SEED[dIdx];
    const sched = SCHEDULES_SEED.find((s) => s.doctorId === doc.id)!;
    const sp = findSpec(doc.specialtyId);
    const slots = generateScheduleSlots(sched);
    const dow = getDayOfWeekForDate(today);
    if (!sched.workingDays.includes(dow)) continue;

    for (let k = 0; k < Math.min(3, slots.length); k++) {
      const pat = DEMO_PATIENT_NAMES[(dIdx * 3 + k) % DEMO_PATIENT_NAMES.length];
      const status = todayStatuses[(dIdx + k) % todayStatuses.length];
      appointments.push({
        id: `apt-today-${doc.id}-${k}`,
        bookingRef: `CF-${seq++}`,
        patientUid: dIdx === 1 && k === 0 ? 'demo-patient-1' : `demo-pat-t-${dIdx}-${k}`,
        patientName: pat.name,
        patientPhone: pat.phone,
        doctorId: doc.id,
        doctorNameSnapshotAr: doc.nameAr,
        doctorNameSnapshotEn: doc.nameEn,
        specialtyId: sp.id,
        specialtyNameSnapshotAr: sp.nameAr,
        specialtyNameSnapshotEn: sp.nameEn,
        date: today,
        timeSlot: slots[Math.min(slots.length - 1, k + 2)],
        status,
        bookingType: k === 2 ? 'walk_in' : 'online',
        createdAt: new Date(now.getTime() - 18 * 3600000).toISOString(),
        updatedAt: new Date(now.getTime() - 2 * 3600000).toISOString(),
      });
    }
  }

  // 3) Previous 30 days historical data for rich Analytics Charts
  for (let dayOffset = -30; dayOffset <= -1; dayOffset++) {
    const histDate = addDaysToDateStr(today, dayOffset);
    const dow = getDayOfWeekForDate(histDate);
    if (dow === 5) continue; // Friday closed

    for (let dIdx = 0; dIdx < DOCTORS_SEED.length; dIdx++) {
      const doc = DOCTORS_SEED[dIdx];
      const sched = SCHEDULES_SEED.find((s) => s.doctorId === doc.id)!;
      if (!sched.workingDays.includes(dow)) continue;
      const sp = findSpec(doc.specialtyId);
      const slots = generateScheduleSlots(sched);

      // Deterministic realistic load (Internal medicine & Pediatrics busier)
      const countForDay =
        doc.specialtyId === 'spec-internal' || doc.specialtyId === 'spec-pediatrics'
          ? Math.min(6, slots.length)
          : Math.min(4, slots.length);

      for (let sIdx = 0; sIdx < countForDay; sIdx++) {
        const mod = (Math.abs(dayOffset) + dIdx + sIdx) % 12;
        const status: AppointmentStatus =
          mod === 0 ? 'no_show' : mod === 1 || mod === 2 ? 'cancelled' : 'completed';
        const pat = DEMO_PATIENT_NAMES[(Math.abs(dayOffset) + dIdx + sIdx) % DEMO_PATIENT_NAMES.length];
        appointments.push({
          id: `apt-hist-${histDate}-${doc.id}-${sIdx}`,
          bookingRef: `CF-${seq++}`,
          patientUid: sIdx === 0 && dayOffset === -3 && dIdx === 0 ? 'demo-patient-1' : `demo-pat-h-${dIdx}-${sIdx}`,
          patientName: pat.name,
          patientPhone: pat.phone,
          doctorId: doc.id,
          doctorNameSnapshotAr: doc.nameAr,
          doctorNameSnapshotEn: doc.nameEn,
          specialtyId: sp.id,
          specialtyNameSnapshotAr: sp.nameAr,
          specialtyNameSnapshotEn: sp.nameEn,
          date: histDate,
          timeSlot: slots[(sIdx * 2) % slots.length],
          status,
          bookingType: sIdx === 3 ? 'walk_in' : 'online',
          createdAt: `${histDate}T08:00:00.000Z`,
          updatedAt: `${histDate}T18:00:00.000Z`,
        });
      }
    }
  }

  // 4) Upcoming 14 days baseline appointments
  for (let dayOffset = 2; dayOffset <= 14; dayOffset++) {
    const futDate = addDaysToDateStr(today, dayOffset);
    const dow = getDayOfWeekForDate(futDate);
    if (dow === 5) continue;

    for (let dIdx = 0; dIdx < 6; dIdx++) {
      const doc = DOCTORS_SEED[dIdx];
      const sched = SCHEDULES_SEED.find((s) => s.doctorId === doc.id)!;
      if (!sched.workingDays.includes(dow)) continue;
      const sp = findSpec(doc.specialtyId);
      const slots = generateScheduleSlots(sched);
      for (let sIdx = 0; sIdx < 2; sIdx++) {
        const pat = DEMO_PATIENT_NAMES[(dayOffset + dIdx + sIdx) % DEMO_PATIENT_NAMES.length];
        appointments.push({
          id: `apt-fut-${futDate}-${doc.id}-${sIdx}`,
          bookingRef: `CF-${seq++}`,
          patientUid: dayOffset === 3 && dIdx === 2 && sIdx === 0 ? 'demo-patient-1' : `demo-pat-f-${dIdx}-${sIdx}`,
          patientName: pat.name,
          patientPhone: pat.phone,
          doctorId: doc.id,
          doctorNameSnapshotAr: doc.nameAr,
          doctorNameSnapshotEn: doc.nameEn,
          specialtyId: sp.id,
          specialtyNameSnapshotAr: sp.nameAr,
          specialtyNameSnapshotEn: sp.nameEn,
          date: futDate,
          timeSlot: slots[sIdx],
          status: 'confirmed',
          bookingType: 'online',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
      }
    }
  }

  const exceptions: ScheduleException[] = [
    {
      id: 'exc-demo-1',
      doctorId: 'doc-cardio-1',
      date: addDaysToDateStr(today, 6),
      isClosed: true,
      reasonAr: 'إجازة مؤتمر طبي دوري',
      reasonEn: 'Medical Conference Closure',
    },
  ];

  const waitlist: WaitlistEntry[] = [
    {
      id: 'wl-demo-1',
      patientUid: 'demo-pat-wl-1',
      patientName: 'سعاد عبد الرحمن حسن',
      patientPhone: '01099887766',
      doctorId: scenarioDoctorId,
      specialtyId: 'spec-internal',
      date: scenarioDate,
      status: 'waiting',
      createdAt: new Date(now.getTime() - 3600000).toISOString(),
    },
    {
      id: 'wl-demo-2',
      patientUid: 'demo-pat-wl-2',
      patientName: 'عادل محمود شوقي',
      patientPhone: '01188776655',
      doctorId: 'doc-peds-1',
      specialtyId: 'spec-pediatrics',
      date: addDaysToDateStr(today, 2),
      status: 'waiting',
      createdAt: new Date(now.getTime() - 7200000).toISOString(),
    },
  ];

  const notifications: NotificationItem[] = [
    {
      id: 'notif-demo-1',
      recipientUid: 'demo-patient-1',
      titleAr: 'تذكير بموعد العيادة القادم',
      titleEn: 'Upcoming Clinic Appointment Reminder',
      bodyAr: `لديك حجز مؤكد مع ${doc1.nameAr} بتاريخ ${scenarioDate} الساعة ${scenarioSlots[0]}.`,
      bodyEn: `You have a confirmed appointment with ${doc1.nameEn} on ${scenarioDate} at ${scenarioSlots[0]}.`,
      channel: 'in_app',
      read: false,
      createdAt: new Date(now.getTime() - 1800000).toISOString(),
    },
    {
      id: 'notif-demo-2',
      recipientUid: 'demo-patient-1',
      titleAr: 'محاكاة إشعار SMS (تجريبي)',
      titleEn: 'Simulated SMS Notification (Demo)',
      bodyAr: 'تنبيه تجريبي: يرجى الحضور قبل الموعد بـ 15 دقيقة لإتمام تسجيل الوصول.',
      bodyEn: 'Demo notice: Please arrive 15 minutes early for reception check-in.',
      channel: 'simulated_sms',
      read: true,
      createdAt: new Date(now.getTime() - 86400000).toISOString(),
    },
  ];

  const settings: ClinicSettings = {
    id: 'default',
    clinicNameAr: 'مركز كلينيك فلو الطبي التخصصي',
    clinicNameEn: 'ClinicFlow Medical Center',
    timezone: 'Africa/Cairo',
    cancellationCutoffHours: 4,
    defaultDailyLimit: 20,
    waitlistOfferExpirationMinutes: 30,
    updatedAt: now.toISOString(),
  };

  const auditLogs: AuditLog[] = [
    {
      id: 'audit-seed-1',
      actorUid: 'system',
      actorRole: 'system',
      action: 'SEED_DEMO_SCENARIO',
      targetType: 'schedule',
      targetId: scenarioDoctorId,
      summaryAr: `تم تجهيز سيناريو آخر موعد متاح (19/20) لعيادة الباطنة بتاريخ ${scenarioDate}.`,
      summaryEn: `Initialized Last Available Appointment scenario (19/20) for Internal Medicine on ${scenarioDate}.`,
      createdAt: now.toISOString(),
    },
  ];

  const staffAccounts: StaffAccount[] = [
    {
      uid: 'staff-admin-1',
      email: 'eng4elec.eg@gmail.com',
      displayName: 'مدير النظام الرئيسي',
      role: 'admin',
      assignedAt: now.toISOString(),
    },
    {
      uid: 'staff-rec-1',
      email: 'reception.demo@clinicflow.local',
      displayName: 'مكتب الاستقبال — الفترة الصباحية',
      role: 'receptionist',
      assignedAt: now.toISOString(),
    },
  ];

  return {
    scenarioDate,
    scenarioDoctorId,
    specialties: SPECIALTIES_SEED,
    doctors: DOCTORS_SEED,
    schedules: SCHEDULES_SEED,
    exceptions,
    settings,
    appointments,
    waitlist,
    notifications,
    auditLogs,
    staffAccounts,
  };
}

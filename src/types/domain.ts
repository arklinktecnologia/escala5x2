export type ShiftId = '01' | '02';

export type WeekdayKey = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab';
export type DayKey = WeekdayKey | 'dom';

export type DayStatus = 'TRABALHO' | 'FOLGA' | 'DSR';

export const WORKDAYS_MON_SAT: readonly WeekdayKey[] = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const;
export const ALL_DAYS: readonly DayKey[] = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;

export const DAY_LABELS: Record<DayKey, { short: string; full: string }> = {
  seg: { short: 'Seg', full: 'Segunda-feira' },
  ter: { short: 'Ter', full: 'Terça-feira' },
  qua: { short: 'Qua', full: 'Quarta-feira' },
  qui: { short: 'Qui', full: 'Quinta-feira' },
  sex: { short: 'Sex', full: 'Sexta-feira' },
  sab: { short: 'Sáb', full: 'Sábado' },
  dom: { short: 'Dom', full: 'Domingo' },
};

export interface Employee {
  id: string;
  fullName: string;
  role: string;
  shift: ShiftId;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftTimeRange {
  start: string; // HH:mm
  end: string;   // HH:mm
}

export interface ShiftConfig {
  id: ShiftId;
  name: string;
  weekdayHours: ShiftTimeRange;  // Seg a Sex
  saturdayHours: ShiftTimeRange; // Sábado
  minWorking?: number;           // Cobertura mínima operacional por dia (Seg a Sáb)
}

export interface SystemSettings {
  companyName: string;
  shifts: Record<ShiftId, ShiftConfig>;
  roles: string[];
  historyRetentionWeeks: number;
}

export type ConstraintType =
  | 'coverage'
  | 'cannot_off_together'
  | 'must_off_together'
  | 'individual_forbidden_day'
  | 'individual_priority_day';

export interface BaseConstraint {
  id: string;
  type: ConstraintType;
  active: boolean;
  description?: string;
  createdAt: string;
}

export interface CoverageConstraint extends BaseConstraint {
  type: 'coverage';
  shift: ShiftId;
  day: WeekdayKey | 'all_weekdays';
  minWorking?: number;
  maxOff?: number;
}

export interface PairGroupConstraint extends BaseConstraint {
  type: 'cannot_off_together' | 'must_off_together';
  employeeIds: string[];
}

export interface IndividualDayConstraint extends BaseConstraint {
  type: 'individual_forbidden_day' | 'individual_priority_day';
  employeeId: string;
  day: WeekdayKey;
  strict?: boolean; // when true on priority_day, forces the day off if possible
}

export type OperationalConstraint =
  | CoverageConstraint
  | PairGroupConstraint
  | IndividualDayConstraint;

export interface ScheduleEntry {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  shift: ShiftId;
  weekdayHours: ShiftTimeRange;
  saturdayHours: ShiftTimeRange;
  offDay: WeekdayKey; // Rotating day off Mon-Fri
  days: Record<DayKey, DayStatus>;
}

export interface ScheduleChangeLog {
  employeeId: string;
  employeeName: string;
  detail: string;
}

export interface WeeklySchedule {
  id: string;
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string;   // YYYY-MM-DD (Sunday)
  version: number;
  generatedAt: string;
  confirmedAt: string;
  status: 'confirmed';
  entries: ScheduleEntry[];
  supervisorShift01: string;
  supervisorShift02: string;
  notes?: string;
  changesFromPrevious?: ScheduleChangeLog[];
}

export interface DraftSchedule {
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  entries: ScheduleEntry[];
  warnings: string[];
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  suggestion?: string;
  employeeId?: string;
  shift?: ShiftId;
  day?: DayKey;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface AppDatabase {
  schemaVersion: number;
  updatedAt: string;
  employees: Employee[];
  constraints: OperationalConstraint[];
  schedules: WeeklySchedule[];
  settings: SystemSettings;
}

export type NavigationSection =
  | 'dashboard'
  | 'employees'
  | 'generator'
  | 'weekly'
  | 'history'
  | 'constraints'
  | 'settings'
  | 'backup';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
}

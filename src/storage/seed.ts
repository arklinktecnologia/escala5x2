import { AppDatabase, Employee, SystemSettings } from '../types/domain';

export const CURRENT_SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: SystemSettings = {
  companyName: 'Supermercado Casagrande',
  shifts: {
    '01': {
      id: '01',
      name: 'Turno 01',
      weekdayHours: { start: '06:40', end: '16:00' },
      saturdayHours: { start: '06:40', end: '15:00' },
      minWorking: 0,
    },
    '02': {
      id: '02',
      name: 'Turno 02',
      weekdayHours: { start: '11:10', end: '20:30' },
      saturdayHours: { start: '10:10', end: '18:00' },
      minWorking: 0,
    },
  },
  roles: [
    'Fiscal de Caixa',
    'Operador de Caixa',
    'Empacotador',
    'Recepção',
  ],
  historyRetentionWeeks: 12,
};

export function createInitialEmployees(timestamp = new Date().toISOString()): Employee[] {
  return [
    {
      id: 'emp_kaleby_fabrete_t01',
      fullName: 'Kaleby Fabrete',
      role: 'Encarregado',
      shift: '01',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'emp_eduarda_pancieri_t02',
      fullName: 'Eduarda Pancieri',
      role: 'Encarregada',
      shift: '02',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
}

export function createInitialDatabase(): AppDatabase {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: now,
    employees: createInitialEmployees(now),
    constraints: [],
    schedules: [],
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as SystemSettings,
  };
}

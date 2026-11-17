import {
  AppDatabase,
  Employee,
  OperationalConstraint,
  SystemSettings,
  WeeklySchedule,
} from '../types/domain';
import { CURRENT_SCHEMA_VERSION, DEFAULT_SETTINGS, createInitialDatabase } from './seed';

export const STORAGE_KEY = 'casagrande_escalas_db_v1';

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

class BrowserLocalStorageAdapter implements StorageAdapter {
  getItem(key: string): string | null {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  }
  setItem(key: string, value: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  }
  removeItem(key: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(key);
  }
}

export interface StorageResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  recovered?: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidTimeHHMM(val: unknown): val is string {
  return typeof val === 'string' && /^\d{2}:\d{2}$/.test(val);
}

function sanitizeSettings(raw: unknown): SystemSettings {
  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as SystemSettings;
  if (!isObject(raw)) return base;

  if (typeof raw.companyName === 'string' && raw.companyName.trim()) {
    base.companyName = raw.companyName.trim();
  }

  base.roles = [...DEFAULT_SETTINGS.roles];

  if (typeof raw.historyRetentionWeeks === 'number' && raw.historyRetentionWeeks >= 8) {
    base.historyRetentionWeeks = Math.min(104, Math.floor(raw.historyRetentionWeeks));
  }

  if (isObject(raw.shifts)) {
    for (const shiftId of ['01', '02'] as const) {
      const s = raw.shifts[shiftId];
      if (isObject(s)) {
        if (typeof s.name === 'string' && s.name.trim()) {
          base.shifts[shiftId].name = s.name.trim();
        }
        if (isObject(s.weekdayHours) && isValidTimeHHMM(s.weekdayHours.start) && isValidTimeHHMM(s.weekdayHours.end)) {
          base.shifts[shiftId].weekdayHours = {
            start: s.weekdayHours.start,
            end: s.weekdayHours.end,
          };
        }
        if (isObject(s.saturdayHours) && isValidTimeHHMM(s.saturdayHours.start) && isValidTimeHHMM(s.saturdayHours.end)) {
          base.shifts[shiftId].saturdayHours = {
            start: s.saturdayHours.start,
            end: s.saturdayHours.end,
          };
        }
        if (typeof s.minWorking === 'number' && !Number.isNaN(s.minWorking) && s.minWorking >= 0) {
          base.shifts[shiftId].minWorking = Math.floor(s.minWorking);
        }
      }
    }
  }

  return base;
}

export function validateDatabasePayload(raw: unknown): { valid: boolean; database?: AppDatabase; error?: string } {
  if (!isObject(raw)) {
    return { valid: false, error: 'Formato de dados inválido: objeto raiz ausente.' };
  }

  if (typeof raw.schemaVersion !== 'number' || raw.schemaVersion < 1) {
    return { valid: false, error: 'Versão de esquema ausente ou inválida.' };
  }

  if (!Array.isArray(raw.employees)) {
    return { valid: false, error: 'Lista de funcionários ausente ou corrompida.' };
  }

  if (!Array.isArray(raw.constraints)) {
    return { valid: false, error: 'Lista de restrições ausente ou corrompida.' };
  }

  if (!Array.isArray(raw.schedules)) {
    return { valid: false, error: 'Histórico de escalas ausente ou corrompido.' };
  }

  const validEmployees: Employee[] = [];
  const seenEmployeeIds = new Set<string>();
  for (const emp of raw.employees) {
    if (!isObject(emp)) continue;
    if (
      typeof emp.id === 'string' &&
      emp.id.trim() &&
      typeof emp.fullName === 'string' &&
      emp.fullName.trim() &&
      typeof emp.role === 'string' &&
      emp.role.trim() &&
      (emp.shift === '01' || emp.shift === '02')
    ) {
      if (seenEmployeeIds.has(emp.id)) continue;
      seenEmployeeIds.add(emp.id);
      validEmployees.push({
        id: emp.id,
        fullName: emp.fullName.trim(),
        role: emp.role.trim(),
        shift: emp.shift,
        createdAt: typeof emp.createdAt === 'string' ? emp.createdAt : new Date().toISOString(),
        updatedAt: typeof emp.updatedAt === 'string' ? emp.updatedAt : new Date().toISOString(),
      });
    }
  }

  const validConstraints: OperationalConstraint[] = raw.constraints.filter(
    (c): c is OperationalConstraint =>
      isObject(c) &&
      typeof c.id === 'string' &&
      typeof c.type === 'string' &&
      typeof c.active === 'boolean'
  );

  const validSchedules: WeeklySchedule[] = raw.schedules.filter(
    (s): s is WeeklySchedule =>
      isObject(s) &&
      typeof s.id === 'string' &&
      typeof s.weekStart === 'string' &&
      typeof s.weekEnd === 'string' &&
      Array.isArray(s.entries)
  );

  const migrated: AppDatabase = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    employees: validEmployees,
    constraints: validConstraints,
    schedules: validSchedules,
    settings: sanitizeSettings(raw.settings),
  };

  return { valid: true, database: migrated };
}

export class ScheduleRepository {
  private adapter: StorageAdapter;
  private storageKey: string;

  constructor(adapter: StorageAdapter = new BrowserLocalStorageAdapter(), storageKey = STORAGE_KEY) {
    this.adapter = adapter;
    this.storageKey = storageKey;
  }

  load(): StorageResult<AppDatabase> {
    try {
      const rawText = this.adapter.getItem(this.storageKey);
      if (!rawText) {
        const initial = createInitialDatabase();
        this.save(initial);
        return { ok: true, data: initial };
      }

      const parsed = JSON.parse(rawText) as unknown;
      const validation = validateDatabasePayload(parsed);

      if (!validation.valid || !validation.database) {
        const fallback = createInitialDatabase();
        return {
          ok: false,
          data: fallback,
          recovered: true,
          error: validation.error || 'Dados armazenados inválidos. Estado inicial restaurado com segurança.',
        };
      }

      return { ok: true, data: validation.database };
    } catch (err) {
      const fallback = createInitialDatabase();
      return {
        ok: false,
        data: fallback,
        recovered: true,
        error: `Erro ao ler armazenamento local: ${err instanceof Error ? err.message : 'erro desconhecido'}.`,
      };
    }
  }

  save(db: AppDatabase): StorageResult<AppDatabase> {
    try {
      const payload: AppDatabase = {
        ...db,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
      };
      this.adapter.setItem(this.storageKey, JSON.stringify(payload));
      return { ok: true, data: payload };
    } catch (err) {
      return {
        ok: false,
        error: `Falha ao salvar no navegador (verifique espaço disponível): ${
          err instanceof Error ? err.message : 'erro desconhecido'
        }`,
      };
    }
  }

  resetToInitial(): StorageResult<AppDatabase> {
    const fresh = createInitialDatabase();
    return this.save(fresh);
  }

  exportBackupJson(db: AppDatabase): string {
    const envelope = {
      application: 'Supermercado Casagrande — Gestão de Escalas',
      exportedAt: new Date().toISOString(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: db,
    };
    return JSON.stringify(envelope, null, 2);
  }

  parseBackupJson(jsonText: string): { valid: boolean; database?: AppDatabase; exportedAt?: string; error?: string } {
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      if (!isObject(parsed)) {
        return { valid: false, error: 'Arquivo JSON inválido.' };
      }

      const candidate = isObject(parsed.data) ? parsed.data : parsed;
      const validation = validateDatabasePayload(candidate);
      if (!validation.valid || !validation.database) {
        return { valid: false, error: validation.error || 'Estrutura de backup incompatível.' };
      }

      return {
        valid: true,
        database: validation.database,
        exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined,
      };
    } catch {
      return { valid: false, error: 'O arquivo selecionado não contém um JSON válido.' };
    }
  }
}

export const defaultRepository = new ScheduleRepository();

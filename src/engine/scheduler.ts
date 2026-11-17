import {
  ALL_DAYS,
  CoverageConstraint,
  DAY_LABELS,
  DayKey,
  DayStatus,
  DraftSchedule,
  Employee,
  OperationalConstraint,
  ScheduleChangeLog,
  ScheduleEntry,
  ShiftId,
  SystemSettings,
  ValidationIssue,
  ValidationResult,
  WORKDAYS_MON_SAT,
  WeekdayKey,
  WeeklySchedule,
} from '../types/domain';
import { getSundayOfWeek } from '../utils/dateUtils';

export interface GenerationOptions {
  weekStart: string;
  employees: Employee[];
  constraints: OperationalConstraint[];
  history: WeeklySchedule[];
  settings: SystemSettings;
  previousSignatures?: string[];
  randomSeed?: number;
}

export interface GenerationOutcome {
  success: boolean;
  draft?: DraftSchedule;
  validation: ValidationResult;
  usedFallbackRelaxation?: boolean;
  noAlternativeSignature?: boolean;
}

interface EmployeeRotationStats {
  lastOffDay: WeekdayKey | null;
  offDayCounts: Record<WeekdayKey, number>;
}

/**
 * Builds the strict 5x2 daily status map for a given rotating weekday off.
 */
export function build5x2DaysMap(offDay: WeekdayKey): Record<DayKey, DayStatus> {
  return {
    seg: offDay === 'seg' ? 'FOLGA' : 'TRABALHO',
    ter: offDay === 'ter' ? 'FOLGA' : 'TRABALHO',
    qua: offDay === 'qua' ? 'FOLGA' : 'TRABALHO',
    qui: offDay === 'qui' ? 'FOLGA' : 'TRABALHO',
    sex: offDay === 'sex' ? 'FOLGA' : 'TRABALHO',
    sab: offDay === 'sab' ? 'FOLGA' : 'TRABALHO',
    dom: 'DSR',
  };
}

/**
 * Creates a deterministic signature string for a distribution of rotating off days.
 */
export function computeDistributionSignature(entries: Pick<ScheduleEntry, 'employeeId' | 'offDay'>[]): string {
  return [...entries]
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId))
    .map((e) => `${e.employeeId}:${e.offDay}`)
    .join('|');
}

/**
 * Analyzes up to the last 8 confirmed weeks before `targetWeekStart` for each employee.
 */
export function analyzeEightWeekHistory(
  employees: Employee[],
  history: WeeklySchedule[],
  targetWeekStart: string
): Map<string, EmployeeRotationStats> {
  const relevantHistory = [...history]
    .filter((s) => s.weekStart < targetWeekStart)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .slice(0, 8);

  const statsMap = new Map<string, EmployeeRotationStats>();

  for (const emp of employees) {
    const counts: Record<WeekdayKey, number> = {
      seg: 0,
      ter: 0,
      qua: 0,
      qui: 0,
      sex: 0,
      sab: 0,
    };
    let lastOffDay: WeekdayKey | null = null;

    for (let i = 0; i < relevantHistory.length; i++) {
      const week = relevantHistory[i];
      const entry = week.entries.find((e) => e.employeeId === emp.id);
      if (entry && WORKDAYS_MON_SAT.includes(entry.offDay)) {
        if (i === 0 && lastOffDay === null) {
          lastOffDay = entry.offDay;
        }
        counts[entry.offDay] += 1;
      }
    }

    statsMap.set(emp.id, { lastOffDay, offDayCounts: counts });
  }

  return statsMap;
}

/**
 * Computes effective per-shift, per-day (Seg-Sáb) maxOff limits from settings and active coverage constraints.
 */
function getShiftWeekdayLimits(
  shiftEmployeesCount: number,
  shift: ShiftId,
  constraints: OperationalConstraint[],
  settings?: SystemSettings
): Record<WeekdayKey, { maxOff: number; minWorking: number; sources: CoverageConstraint[] }> {
  const result = {} as Record<WeekdayKey, { maxOff: number; minWorking: number; sources: CoverageConstraint[] }>;
  const settingsMinWorking = Math.max(0, Math.floor(settings?.shifts[shift]?.minWorking ?? 0));

  for (const day of WORKDAYS_MON_SAT) {
    let minWorking = settingsMinWorking;
    let maxOff = Math.max(0, shiftEmployeesCount - settingsMinWorking);
    const sources: CoverageConstraint[] = [];

    for (const c of constraints) {
      if (!c.active || c.type !== 'coverage' || c.shift !== shift) continue;
      if (c.day !== 'all_weekdays' && c.day !== day) continue;

      sources.push(c);
      if (typeof c.minWorking === 'number' && !Number.isNaN(c.minWorking)) {
        minWorking = Math.max(minWorking, c.minWorking);
        maxOff = Math.min(maxOff, Math.max(0, shiftEmployeesCount - minWorking));
      }
      if (typeof c.maxOff === 'number' && !Number.isNaN(c.maxOff)) {
        maxOff = Math.min(maxOff, Math.max(0, c.maxOff));
      }
    }

    result[day] = { maxOff, minWorking, sources };
  }

  return result;
}

/**
 * Validates a set of schedule entries against:
 * 1) Strict 5x2 rules (Sunday fixed DSR, 1 rotating Mon-Sat FOLGA, 5 work days)
 * 2) Minimum operational coverage from settings and active operational constraints
 * 3) Consecutive repeated day-off warnings (soft)
 */
export function validateScheduleEntries(
  entries: ScheduleEntry[],
  constraints: OperationalConstraint[],
  history: WeeklySchedule[],
  weekStart: string,
  settings?: SystemSettings
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (entries.length === 0) {
    errors.push({
      severity: 'error',
      code: 'EMPTY_SCHEDULE',
      message: 'Nenhum funcionário incluído na escala.',
      suggestion: 'Cadastre funcionários antes de gerar a escala semanal.',
    });
    return { valid: false, errors, warnings };
  }

  const entryMap = new Map<string, ScheduleEntry>();
  for (const entry of entries) {
    entryMap.set(entry.employeeId, entry);

    // 1. Validate Sunday DSR
    if (entry.days.dom !== 'DSR') {
      errors.push({
        severity: 'error',
        code: 'SUNDAY_MUST_BE_DSR',
        employeeId: entry.employeeId,
        day: 'dom',
        message: `${entry.employeeName} não está com DSR obrigatório no domingo.`,
        suggestion: 'Domingo é DSR fixo para toda a equipe.',
      });
    }

    // 2. Validate exactly 1 FOLGA between Mon and Sat and 5 work days total
    const monSatOffDays = WORKDAYS_MON_SAT.filter((d) => entry.days[d] === 'FOLGA');
    const totalWorkDays = ALL_DAYS.filter((d) => entry.days[d] === 'TRABALHO').length;

    if (monSatOffDays.length !== 1) {
      errors.push({
        severity: 'error',
        code: 'INVALID_WEEKDAY_OFF_COUNT',
        employeeId: entry.employeeId,
        message: `${entry.employeeName} possui ${monSatOffDays.length} folga(s) de segunda a sábado (obrigatório: exatamente 1).`,
        suggestion: 'Ajuste para que cada funcionário tenha exatamente 1 folga rotativa entre segunda e sábado.',
      });
    } else if (entry.offDay !== monSatOffDays[0]) {
      errors.push({
        severity: 'error',
        code: 'OFFDAY_MISMATCH',
        employeeId: entry.employeeId,
        message: `Inconsistência na folga registrada para ${entry.employeeName}.`,
      });
    }

    if (totalWorkDays !== 5) {
      errors.push({
        severity: 'error',
        code: 'INVALID_WORK_DAYS_COUNT',
        employeeId: entry.employeeId,
        message: `${entry.employeeName} está com ${totalWorkDays} dias trabalhados (obrigatório: 5 dias no regime 5x2).`,
      });
    }
  }

  // 3. Validate Minimum Operational Coverage (from Settings) & Coverage Constraints per shift and day
  for (const shift of ['01', '02'] as const) {
    const shiftEntries = entries.filter((e) => e.shift === shift);
    if (shiftEntries.length === 0) continue;

    const settingsMinWorking = Math.max(0, Math.floor(settings?.shifts[shift]?.minWorking ?? 0));
    if (settingsMinWorking > 0) {
      for (const day of WORKDAYS_MON_SAT) {
        const offCount = shiftEntries.filter((e) => e.offDay === day).length;
        const workingCount = shiftEntries.length - offCount;
        if (workingCount < settingsMinWorking) {
          errors.push({
            severity: 'error',
            code: 'SETTINGS_MIN_COVERAGE',
            shift,
            day,
            message: `Turno ${shift} na ${DAY_LABELS[day].full}: ${workingCount} trabalhando (cobertura mínima nas configurações: ${settingsMinWorking}).`,
            suggestion: `Redistribua as folgas do Turno ${shift} entre segunda e sábado ou ajuste a cobertura mínima nas configurações.`,
          });
        }
      }
    }

    for (const c of constraints) {
      if (!c.active || c.type !== 'coverage' || c.shift !== shift) continue;
      const daysToCheck: WeekdayKey[] = c.day === 'all_weekdays' ? [...WORKDAYS_MON_SAT] : [c.day];

      for (const day of daysToCheck) {
        const offCount = shiftEntries.filter((e) => e.offDay === day).length;
        const workingCount = shiftEntries.length - offCount;

        if (typeof c.minWorking === 'number' && workingCount < c.minWorking) {
          errors.push({
            severity: 'error',
            code: 'COVERAGE_MIN_WORKING',
            shift,
            day,
            message: `Turno ${shift} na ${DAY_LABELS[day].full}: apenas ${workingCount} trabalhando (mínimo exigido: ${c.minWorking}).`,
            suggestion: `Mova a folga de um funcionário do Turno ${shift} para outro dia entre segunda e sábado ou ajuste a restrição de cobertura.`,
          });
        }

        if (typeof c.maxOff === 'number' && offCount > c.maxOff) {
          errors.push({
            severity: 'error',
            code: 'COVERAGE_MAX_OFF',
            shift,
            day,
            message: `Turno ${shift} na ${DAY_LABELS[day].full}: ${offCount} folgas atribuídas (máximo permitido: ${c.maxOff}).`,
            suggestion: `Redistribua as folgas do Turno ${shift} para respeitar o máximo de ${c.maxOff} folga(s).`,
          });
        }
      }
    }
  }

  // 5. Validate Individual & Pair Constraints
  for (const c of constraints) {
    if (!c.active) continue;

    if (c.type === 'individual_forbidden_day') {
      const entry = entryMap.get(c.employeeId);
      if (entry && entry.offDay === c.day) {
        errors.push({
          severity: 'error',
          code: 'INDIVIDUAL_FORBIDDEN_DAY',
          employeeId: entry.employeeId,
          day: c.day,
          message: `${entry.employeeName} possui restrição impedindo folga na ${DAY_LABELS[c.day].full}.`,
          suggestion: `Altere a folga de ${entry.employeeName} para outro dia útil disponível.`,
        });
      }
    }

    if (c.type === 'individual_priority_day') {
      const entry = entryMap.get(c.employeeId);
      if (entry && entry.offDay !== c.day) {
        if (c.strict) {
          errors.push({
            severity: 'error',
            code: 'INDIVIDUAL_PRIORITY_STRICT',
            employeeId: entry.employeeId,
            day: c.day,
            message: `${entry.employeeName} tem prioridade obrigatória para folgar na ${DAY_LABELS[c.day].full}.`,
            suggestion: `Atribua ${DAY_LABELS[c.day].full} para ${entry.employeeName} ou remova a obrigatoriedade da prioridade.`,
          });
        } else {
          warnings.push({
            severity: 'warning',
            code: 'INDIVIDUAL_PRIORITY_SOFT',
            employeeId: entry.employeeId,
            day: c.day,
            message: `Preferência de folga de ${entry.employeeName} na ${DAY_LABELS[c.day].full} não pôde ser atendida devido a outras restrições.`,
          });
        }
      }
    }

    if (c.type === 'cannot_off_together') {
      const involved = c.employeeIds
        .map((id) => entryMap.get(id))
        .filter((e): e is ScheduleEntry => Boolean(e));

      const dayBuckets = new Map<WeekdayKey, ScheduleEntry[]>();
      for (const e of involved) {
        const list = dayBuckets.get(e.offDay) ?? [];
        list.push(e);
        dayBuckets.set(e.offDay, list);
      }

      for (const [day, list] of dayBuckets.entries()) {
        if (list.length > 1) {
          errors.push({
            severity: 'error',
            code: 'CANNOT_OFF_TOGETHER',
            day,
            message: `${list.map((x) => x.employeeName).join(' e ')} não podem folgar juntos (${DAY_LABELS[day].full}).`,
            suggestion: 'Separe as folgas desses funcionários em dias úteis diferentes.',
          });
        }
      }
    }

    if (c.type === 'must_off_together') {
      const involved = c.employeeIds
        .map((id) => entryMap.get(id))
        .filter((e): e is ScheduleEntry => Boolean(e));

      if (involved.length >= 2) {
        const distinctDays = new Set(involved.map((e) => e.offDay));
        if (distinctDays.size > 1) {
          errors.push({
            severity: 'error',
            code: 'MUST_OFF_TOGETHER',
            message: `${involved.map((x) => x.employeeName).join(' e ')} precisam folgar juntos, mas estão em dias diferentes.`,
            suggestion: 'Alinhe os dias de folga desses funcionários ou revise a restrição de grupo.',
          });
        }
      }
    }
  }

  // 6. Soft warning: consecutive repeated day off vs previous week
  const fakeEmployees: Employee[] = entries.map((e) => ({
    id: e.employeeId,
    fullName: e.employeeName,
    role: e.employeeRole,
    shift: e.shift,
    createdAt: '',
    updatedAt: '',
  }));
  const stats = analyzeEightWeekHistory(fakeEmployees, history, weekStart);

  for (const entry of entries) {
    const empStats = stats.get(entry.employeeId);
    if (empStats?.lastOffDay && empStats.lastOffDay === entry.offDay) {
      warnings.push({
        severity: 'warning',
        code: 'CONSECUTIVE_REPEAT_DAY',
        employeeId: entry.employeeId,
        day: entry.offDay,
        message: `${entry.employeeName} repetiu a folga na ${DAY_LABELS[entry.offDay].full} em relação à semana anterior.`,
        suggestion: 'Se houver outra combinação válida, considere rotacionar para o próximo dia útil.',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Performs pre-solve feasibility diagnostics when backtracking finds no solution.
 */
function diagnoseInfeasibility(
  employees: Employee[],
  constraints: OperationalConstraint[],
  domains: Map<string, WeekdayKey[]>,
  settings?: SystemSettings
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const empById = new Map(employees.map((e) => [e.id, e]));

  // Check empty individual domains
  for (const emp of employees) {
    const dom = domains.get(emp.id) ?? [];
    if (dom.length === 0) {
      issues.push({
        severity: 'error',
        code: 'DOMAIN_EXHAUSTED',
        employeeId: emp.id,
        message: `${emp.fullName} não possui nenhum dia disponível entre segunda e sábado devido às restrições individuais acumuladas.`,
        suggestion: `Remova ao menos uma restrição individual de ${emp.fullName}.`,
      });
    }
  }

  // Check shift total capacity vs shift team size
  for (const shift of ['01', '02'] as const) {
    const shiftEmps = employees.filter((e) => e.shift === shift);
    if (shiftEmps.length === 0) continue;

    const limits = getShiftWeekdayLimits(shiftEmps.length, shift, constraints, settings);
    const totalWeeklySlots = WORKDAYS_MON_SAT.reduce((acc, d) => acc + limits[d].maxOff, 0);

    if (totalWeeklySlots < shiftEmps.length) {
      issues.push({
        severity: 'error',
        code: 'SHIFT_CAPACITY_INSUFFICIENT',
        shift,
        message: `Conflito de cobertura no Turno ${shift}: há ${shiftEmps.length} funcionário(s), mas a cobertura mínima configurada permite no máximo ${totalWeeklySlots} folga(s) somadas entre segunda e sábado.`,
        suggestion: `Reduza a cobertura mínima operacional nas configurações/restrições ou aumente o máximo de folgas por dia no Turno ${shift}.`,
      });
    }

    // Check if individual constraints starve available days
    for (const day of WORKDAYS_MON_SAT) {
      if (limits[day].maxOff === 0) {
        const forcedHere = shiftEmps.filter((e) => {
          const dom = domains.get(e.id) ?? [];
          return dom.length === 1 && dom[0] === day;
        });
        if (forcedHere.length > 0) {
          issues.push({
            severity: 'error',
            code: 'COVERAGE_VS_PRIORITY_CONFLICT',
            shift,
            day,
            message: `${forcedHere.map((x) => x.fullName).join(', ')} precisa(m) folgar na ${DAY_LABELS[day].full}, mas a cobertura do Turno ${shift} exige 0 folgas neste dia.`,
            suggestion: `Ajuste a cobertura da ${DAY_LABELS[day].full} ou flexibilize a restrição individual.`,
          });
        }
      }
    }
  }

  // Check must_off_together vs cannot_off_together or shift maxOff
  for (const c of constraints) {
    if (!c.active) continue;
    if (c.type === 'must_off_together' && c.employeeIds.length >= 2) {
      const members = c.employeeIds.map((id) => empById.get(id)).filter((e): e is Employee => Boolean(e));
      if (members.length < 2) continue;

      const commonDays = WORKDAYS_MON_SAT.filter((d) =>
        members.every((m) => (domains.get(m.id) ?? []).includes(d))
      );

      if (commonDays.length === 0) {
        issues.push({
          severity: 'error',
          code: 'MUST_OFF_NO_COMMON_DAY',
          message: `${members.map((m) => m.fullName).join(' e ')} precisam folgar juntos, mas não há nenhum dia em comum permitido entre segunda e sábado.`,
          suggestion: 'Revise as restrições individuais ou a regra de folgar juntos.',
        });
      } else {
        for (const shift of ['01', '02'] as const) {
          const sameShiftCount = members.filter((m) => m.shift === shift).length;
          if (sameShiftCount > 1) {
            const shiftCount = employees.filter((e) => e.shift === shift).length;
            const limits = getShiftWeekdayLimits(shiftCount, shift, constraints, settings);
            const feasibleDay = commonDays.some((d) => limits[d].maxOff >= sameShiftCount);
            if (!feasibleDay) {
              issues.push({
                severity: 'error',
                code: 'MUST_OFF_EXCEEDS_MAX_OFF',
                shift,
                message: `Regra "folgar juntos" exige ${sameShiftCount} folgas simultâneas no Turno ${shift}, mas o limite de cobertura não permite tantos funcionários de folga no mesmo dia.`,
                suggestion: `Aumente o máximo de folgas permitido ou remova a exigência de folgarem juntos.`,
              });
            }
          }
        }
      }
    }
  }

  if (issues.length === 0) {
    issues.push({
      severity: 'error',
      code: 'CONSTRAINTS_OVERCONSTRAINED',
      message: 'A combinação atual de regras de cobertura, restrições individuais e grupos de folga não possui solução matemática no regime 5x2.',
      suggestion: 'Flexibilize uma das restrições de cobertura, grupos ("não folgar juntos" / "folgar juntos") ou dias bloqueados.',
    });
  }

  return issues;
}

/**
 * Generates an intelligent 5x2 weekly schedule using 8-week rotation history
 * and a constraint-satisfaction backtracking solver.
 */
export function generateIntelligentSchedule(options: GenerationOptions): GenerationOutcome {
  const {
    weekStart,
    employees,
    constraints,
    history,
    settings,
    previousSignatures = [],
    randomSeed = 0,
  } = options;

  if (employees.length === 0) {
    const emptyValidation = validateScheduleEntries([], constraints, history, weekStart);
    return { success: false, validation: emptyValidation };
  }

  const weekEnd = getSundayOfWeek(weekStart);
  const sortedEmployees = [...employees].sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));
  const rotationStats = analyzeEightWeekHistory(sortedEmployees, history, weekStart);
  const excludedSigSet = new Set(previousSignatures);

  // Build hard domains per employee
  const domains = new Map<string, WeekdayKey[]>();
  for (const emp of sortedEmployees) {
    let allowed: WeekdayKey[] = [...WORKDAYS_MON_SAT];

    // Apply individual forbidden days
    const forbidden = new Set<WeekdayKey>();
    let forcedDay: WeekdayKey | null = null;

    for (const c of constraints) {
      if (!c.active) continue;
      if (c.type === 'individual_forbidden_day' && c.employeeId === emp.id) {
        forbidden.add(c.day);
      }
      if (c.type === 'individual_priority_day' && c.employeeId === emp.id && c.strict) {
        forcedDay = c.day;
      }
    }

    if (forcedDay) {
      allowed = forbidden.has(forcedDay) ? [] : [forcedDay];
    } else {
      allowed = allowed.filter((d) => !forbidden.has(d));
    }

    domains.set(emp.id, allowed);
  }

  // Precompute shift limits (incorporating settings operational coverage + constraints)
  const shiftCounts: Record<ShiftId, number> = {
    '01': sortedEmployees.filter((e) => e.shift === '01').length,
    '02': sortedEmployees.filter((e) => e.shift === '02').length,
  };
  const shiftLimits: Record<ShiftId, Record<WeekdayKey, { maxOff: number; minWorking: number }>> = {
    '01': getShiftWeekdayLimits(shiftCounts['01'], '01', constraints, settings),
    '02': getShiftWeekdayLimits(shiftCounts['02'], '02', constraints, settings),
  };

  // Per-shift alphabetical index for clean initial Mon-Sat staggering per shift
  const shiftEmpIndex = new Map<string, number>();
  let idx01 = 0;
  let idx02 = 0;
  for (const emp of sortedEmployees) {
    if (emp.shift === '01') shiftEmpIndex.set(emp.id, idx01++);
    else shiftEmpIndex.set(emp.id, idx02++);
  }

  // Precompute pair constraints lookup
  const cannotTogetherWith = new Map<string, Set<string>>();
  const mustTogetherWith = new Map<string, Set<string>>();
  for (const emp of sortedEmployees) {
    cannotTogetherWith.set(emp.id, new Set());
    mustTogetherWith.set(emp.id, new Set());
  }

  for (const c of constraints) {
    if (!c.active) continue;
    if (c.type === 'cannot_off_together') {
      for (const idA of c.employeeIds) {
        for (const idB of c.employeeIds) {
          if (idA !== idB) cannotTogetherWith.get(idA)?.add(idB);
        }
      }
    }
    if (c.type === 'must_off_together') {
      for (const idA of c.employeeIds) {
        for (const idB of c.employeeIds) {
          if (idA !== idB) mustTogetherWith.get(idA)?.add(idB);
        }
      }
    }
  }

  // Soft priority lookup
  const softPriorityDays = new Map<string, Set<WeekdayKey>>();
  for (const c of constraints) {
    if (c.active && c.type === 'individual_priority_day' && !c.strict) {
      const set = softPriorityDays.get(c.employeeId) ?? new Set();
      set.add(c.day);
      softPriorityDays.set(c.employeeId, set);
    }
  }

  // Deterministic pseudo-random helper for tie-breaking / randomization rounds
  let rngState = (randomSeed * 2654435761 + 1013904223) >>> 0;
  const nextRand = () => {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  };

  // Variable ordering: MRV (smallest domain first, then those with pair constraints, then shift)
  const orderedEmployees = [...sortedEmployees].sort((a, b) => {
    const domDiff = (domains.get(a.id)?.length ?? 0) - (domains.get(b.id)?.length ?? 0);
    if (domDiff !== 0) return domDiff;
    const pairA = (mustTogetherWith.get(a.id)?.size ?? 0) + (cannotTogetherWith.get(a.id)?.size ?? 0);
    const pairB = (mustTogetherWith.get(b.id)?.size ?? 0) + (cannotTogetherWith.get(b.id)?.size ?? 0);
    if (pairA !== pairB) return pairB - pairA;
    if (randomSeed > 0) return nextRand() - 0.5;
    return a.fullName.localeCompare(b.fullName, 'pt-BR');
  });

  function runSolver(avoidConsecutiveRepeat: boolean, avoidPreviousSignatures: boolean): Record<string, WeekdayKey> | null {
    const assignment: Record<string, WeekdayKey> = {};
    const shiftDayOffCount: Record<ShiftId, Record<WeekdayKey, number>> = {
      '01': { seg: 0, ter: 0, qua: 0, qui: 0, sex: 0, sab: 0 },
      '02': { seg: 0, ter: 0, qua: 0, qui: 0, sex: 0, sab: 0 },
    };
    let steps = 0;
    const MAX_STEPS = 40000;

    function isConsistent(emp: Employee, day: WeekdayKey): boolean {
      // Shift daily coverage limit
      if (shiftDayOffCount[emp.shift][day] + 1 > shiftLimits[emp.shift][day].maxOff) {
        return false;
      }

      // Consecutive repeat check if enabled
      const stats = rotationStats.get(emp.id);
      if (avoidConsecutiveRepeat && stats?.lastOffDay === day) {
        return false;
      }

      // Cannot off together
      const cannotSet = cannotTogetherWith.get(emp.id);
      if (cannotSet) {
        for (const otherId of cannotSet) {
          if (assignment[otherId] === day) return false;
        }
      }

      // Must off together
      const mustSet = mustTogetherWith.get(emp.id);
      if (mustSet) {
        for (const otherId of mustSet) {
          if (assignment[otherId] !== undefined && assignment[otherId] !== day) {
            return false;
          }
          const otherDomain = domains.get(otherId);
          if (otherDomain && !otherDomain.includes(day)) {
            return false;
          }
        }
      }

      return true;
    }

    function scoreCandidate(emp: Employee, day: WeekdayKey, empIdx: number): number {
      const stats = rotationStats.get(emp.id);
      const dayIdx = WORKDAYS_MON_SAT.indexOf(day);
      let score = 0;

      // 1. Balance across shift workdays Mon-Sat (strongly prefer days with fewer people off in this shift)
      const currentOffInShift = shiftDayOffCount[emp.shift][day];
      const idealTargetPerDay = shiftCounts[emp.shift] / 6;
      score -= currentOffInShift * 40;
      if (currentOffInShift >= Math.ceil(idealTargetPerDay)) {
        score -= 25;
      }

      // 2. Natural 6-day forward rotation (Seg -> Ter -> Qua -> Qui -> Sex -> Sáb -> Seg)
      if (stats?.lastOffDay) {
        const lastIdx = WORKDAYS_MON_SAT.indexOf(stats.lastOffDay);
        const nextExpectedIdx = (lastIdx + 1) % 6;
        if (dayIdx === nextExpectedIdx) {
          score += 35;
        } else if (day === stats.lastOffDay) {
          score -= 120;
        } else {
          const dist = (dayIdx - lastIdx + 6) % 6;
          score += (6 - dist) * 4;
        }
      } else {
        // First time being scheduled: stagger naturally across Mon-Sat per shift
        const staggerIdx = (shiftEmpIndex.get(emp.id) ?? empIdx) % 6;
        if (dayIdx === staggerIdx) score += 20;
      }

      // 3. 8-week fairness: prefer days taken least often in last 8 weeks
      const historicalCount = stats?.offDayCounts[day] ?? 0;
      score -= historicalCount * 22;

      // 4. Soft priority day preference
      if (softPriorityDays.get(emp.id)?.has(day)) {
        score += 55;
      }

      // 5. Randomization / variation jitter when user clicks "Randomizar novamente"
      if (randomSeed > 0) {
        score += (nextRand() - 0.5) * 48;
      }

      return score;
    }

    function backtrack(index: number): boolean {
      if (steps++ > MAX_STEPS) return false;
      if (index === orderedEmployees.length) {
        if (avoidPreviousSignatures && excludedSigSet.size > 0) {
          const sig = computeDistributionSignature(
            orderedEmployees.map((e) => ({ employeeId: e.id, offDay: assignment[e.id] }))
          );
          if (excludedSigSet.has(sig)) return false;
        }
        return true;
      }

      const emp = orderedEmployees[index];
      const allowed = domains.get(emp.id) ?? [];

      const candidates = allowed
        .filter((d) => isConsistent(emp, d))
        .map((d) => ({ day: d, score: scoreCandidate(emp, d, index) }))
        .sort((a, b) => b.score - a.score);

      for (const { day } of candidates) {
        assignment[emp.id] = day;
        shiftDayOffCount[emp.shift][day] += 1;

        if (backtrack(index + 1)) return true;

        shiftDayOffCount[emp.shift][day] -= 1;
        delete assignment[emp.id];
      }

      return false;
    }

    return backtrack(0) ? assignment : null;
  }

  // Pass 1: Strict non-consecutive repeat + distinct from previous drafts
  let solution = runSolver(true, true);
  let usedFallbackRelaxation = false;
  let noAlternativeSignature = false;

  // Pass 2: Allow consecutive repeat if strictly necessary, still try distinct signature
  if (!solution) {
    solution = runSolver(false, true);
    if (solution) {
      usedFallbackRelaxation = true;
    }
  }

  // Pass 3: If excluded signatures exhausted all valid solutions, allow repeating a previous signature
  if (!solution && excludedSigSet.size > 0) {
    solution = runSolver(true, false);
    if (!solution) {
      solution = runSolver(false, false);
      if (solution) usedFallbackRelaxation = true;
    }
    if (solution) {
      noAlternativeSignature = true;
    }
  }

  if (!solution) {
    const diagnostics = diagnoseInfeasibility(sortedEmployees, constraints, domains, settings);
    return {
      success: false,
      validation: {
        valid: false,
        errors: diagnostics,
        warnings: [],
      },
    };
  }

  const entries: ScheduleEntry[] = sortedEmployees.map((emp) => {
    const offDay = solution[emp.id];
    const shiftConfig = settings.shifts[emp.shift];
    return {
      employeeId: emp.id,
      employeeName: emp.fullName,
      employeeRole: emp.role,
      shift: emp.shift,
      weekdayHours: { ...shiftConfig.weekdayHours },
      saturdayHours: { ...shiftConfig.saturdayHours },
      offDay,
      days: build5x2DaysMap(offDay),
    };
  });

  const validation = validateScheduleEntries(entries, constraints, history, weekStart, settings);

  if (!validation.valid) {
    return {
      success: false,
      validation,
    };
  }

  const warnings: string[] = validation.warnings.map((w) => w.message);
  if (noAlternativeSignature) {
    warnings.push(
      'Todas as combinações válidas que respeitam suas restrições já foram exibidas nesta sessão.'
    );
  }

  return {
    success: true,
    usedFallbackRelaxation,
    noAlternativeSignature,
    validation,
    draft: {
      weekStart,
      weekEnd,
      generatedAt: new Date().toISOString(),
      entries,
      warnings,
    },
  };
}

/**
 * Computes human-readable change logs comparing a new schedule against an earlier schedule
 * (either previous version of the same week, or the prior week).
 */
export function computeScheduleChanges(
  newEntries: ScheduleEntry[],
  previousSchedule?: WeeklySchedule
): ScheduleChangeLog[] {
  if (!previousSchedule) return [];
  const prevById = new Map(previousSchedule.entries.map((e) => [e.employeeId, e]));
  const changes: ScheduleChangeLog[] = [];

  for (const entry of newEntries) {
    const prev = prevById.get(entry.employeeId);
    if (!prev) {
      changes.push({
        employeeId: entry.employeeId,
        employeeName: entry.employeeName,
        detail: `Adicionado à escala (Turno ${entry.shift}, folga na ${DAY_LABELS[entry.offDay].full}).`,
      });
      continue;
    }
    if (prev.shift !== entry.shift) {
      changes.push({
        employeeId: entry.employeeId,
        employeeName: entry.employeeName,
        detail: `Transferido do Turno ${prev.shift} para Turno ${entry.shift}.`,
      });
    }
    if (prev.offDay !== entry.offDay) {
      changes.push({
        employeeId: entry.employeeId,
        employeeName: entry.employeeName,
        detail: `Folga alterada de ${DAY_LABELS[prev.offDay].short} para ${DAY_LABELS[entry.offDay].short}.`,
      });
    }
  }

  for (const prev of previousSchedule.entries) {
    if (!newEntries.some((e) => e.employeeId === prev.employeeId)) {
      changes.push({
        employeeId: prev.employeeId,
        employeeName: prev.employeeName,
        detail: `Removido da escala (anteriormente no Turno ${prev.shift}).`,
      });
    }
  }

  return changes;
}

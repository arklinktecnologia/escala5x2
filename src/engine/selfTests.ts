import {
  ALL_DAYS,
  AppDatabase,
  Employee,
  OperationalConstraint,
  WORKDAYS_MON_SAT,
  WeeklySchedule,
} from '../types/domain';
import { ScheduleRepository, StorageAdapter } from '../storage/repository';
import { DEFAULT_SETTINGS, createInitialDatabase } from '../storage/seed';
import {
  computeDistributionSignature,
  generateIntelligentSchedule,
  validateScheduleEntries,
} from './scheduler';

export interface SelfTestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

function makeEmp(id: string, fullName: string, role: string, shift: '01' | '02'): Employee {
  const now = '2026-11-01T10:00:00.000Z';
  return { id, fullName, role, shift, createdAt: now, updatedAt: now };
}

export function runAllSchedulingTests(): SelfTestResult[] {
  const results: SelfTestResult[] = [];

  const testEmployees: Employee[] = [
    makeEmp('e1', 'Kaleby Fabrete', 'Encarregado', '01'),
    makeEmp('e2', 'Ana Beatriz', 'Operador de Caixa', '01'),
    makeEmp('e3', 'Carlos Eduardo', 'Repositor', '01'),
    makeEmp('e4', 'Marcos Vinicius', 'Açougueiro', '01'),
    makeEmp('e5', 'Juliana Rocha', 'Fiscal de Caixa', '01'),
    makeEmp('e6', 'Eduarda Pancieri', 'Encarregada', '02'),
    makeEmp('e7', 'Fernanda Lima', 'Operador de Caixa', '02'),
    makeEmp('e8', 'Rafael Souza', 'Estoquista', '02'),
  ];

  const baseOutcome = generateIntelligentSchedule({
    weekStart: '2026-11-16',
    employees: testEmployees,
    constraints: [],
    history: [],
    settings: DEFAULT_SETTINGS,
  });

  // Test 1: Sunday DSR
  {
    const ok =
      baseOutcome.success &&
      Boolean(baseOutcome.draft) &&
      baseOutcome.draft!.entries.every((e) => e.days.dom === 'DSR');
    results.push({
      id: 'T01',
      name: 'Domingo é DSR fixo para todos os funcionários',
      passed: ok,
      details: ok
        ? `${baseOutcome.draft?.entries.length} funcionários validados com domingo = DSR.`
        : 'Falha ao garantir DSR obrigatório no domingo.',
    });
  }

  // Test 2: Exactly 1 rotating off day Mon-Sat
  {
    const ok =
      baseOutcome.success &&
      Boolean(baseOutcome.draft) &&
      baseOutcome.draft!.entries.every((e) => {
        const offs = WORKDAYS_MON_SAT.filter((d) => e.days[d] === 'FOLGA');
        return offs.length === 1 && e.offDay === offs[0];
      });
    results.push({
      id: 'T02',
      name: 'Exatamente uma folga rotativa entre segunda e sábado',
      passed: ok,
      details: ok
        ? 'Todos os funcionários possuem exatamente 1 folga entre segunda e sábado.'
        : 'Encontrado funcionário com quantidade inválida de folgas.',
    });
  }

  // Test 3: Saturday participates in the 6-day Mon-Sat rotation
  {
    let sawSaturdayOff = false;
    let simHistory: WeeklySchedule[] = [];
    const simEmp = testEmployees.slice(0, 6);
    for (let w = 0; w < 6; w++) {
      const weekStr = `2026-11-${String(16 + w * 7).padStart(2, '0')}`;
      const dayDate = new Date(2026, 10, 16 + w * 7, 12, 0, 0);
      const iso = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(
        dayDate.getDate()
      ).padStart(2, '0')}`;
      const out = generateIntelligentSchedule({
        weekStart: iso,
        employees: simEmp,
        constraints: [],
        history: simHistory,
        settings: DEFAULT_SETTINGS,
      });
      if (out.success && out.draft) {
        if (out.draft.entries.some((e) => e.offDay === 'sab')) {
          sawSaturdayOff = true;
        }
        simHistory = [
          ...simHistory,
          {
            id: `sim_${w}_${weekStr}`,
            weekStart: out.draft.weekStart,
            weekEnd: out.draft.weekEnd,
            version: 1,
            generatedAt: out.draft.generatedAt,
            confirmedAt: out.draft.generatedAt,
            status: 'confirmed',
            entries: out.draft.entries,
            supervisorShift01: 'Kaleby Fabrete',
            supervisorShift02: 'Eduarda Pancieri',
          },
        ];
      }
    }
    results.push({
      id: 'T03',
      name: 'Sábado participa normalmente do rodízio semanal de folgas',
      passed: sawSaturdayOff,
      details: sawSaturdayOff
        ? 'Rodízio distribuiu folgas de segunda a sábado incluindo o sábado.'
        : 'Nenhuma folga foi alocada no sábado durante o ciclo.',
    });
  }

  // Test 4: Exactly 5 working days per week
  {
    const ok =
      baseOutcome.success &&
      Boolean(baseOutcome.draft) &&
      baseOutcome.draft!.entries.every(
        (e) => ALL_DAYS.filter((d) => e.days[d] === 'TRABALHO').length === 5
      );
    results.push({
      id: 'T04',
      name: 'Regra 5x2 estrita (5 dias trabalhados e 2 de descanso)',
      passed: ok,
      details: ok
        ? 'Carga de 5 dias de trabalho + 1 folga útil + 1 DSR confirmada para todos.'
        : 'Detectado desvio na contagem de 5 dias trabalhados.',
    });
  }

  // Test 5: No consecutive repeated off day across weeks when alternative exists
  {
    let passed = false;
    let details = '';
    if (baseOutcome.success && baseOutcome.draft) {
      const week1: WeeklySchedule = {
        id: 'sch_w1',
        weekStart: '2026-11-16',
        weekEnd: '2026-11-22',
        version: 1,
        generatedAt: '2026-11-15T10:00:00.000Z',
        confirmedAt: '2026-11-15T10:05:00.000Z',
        status: 'confirmed',
        entries: baseOutcome.draft.entries,
        supervisorShift01: 'Kaleby Fabrete',
        supervisorShift02: 'Eduarda Pancieri',
      };

      const week2Outcome = generateIntelligentSchedule({
        weekStart: '2026-11-23',
        employees: testEmployees,
        constraints: [],
        history: [week1],
        settings: DEFAULT_SETTINGS,
      });

      if (week2Outcome.success && week2Outcome.draft) {
        const repeats = week2Outcome.draft.entries.filter((e2) => {
          const e1 = week1.entries.find((x) => x.employeeId === e2.employeeId);
          return e1 && e1.offDay === e2.offDay;
        });
        passed = repeats.length === 0;
        details = passed
          ? 'Rodízio avançou sem repetir o mesmo dia da semana anterior para nenhum funcionário.'
          : `${repeats.length} funcionário(s) repetiram o dia sem necessidade.`;
      } else {
        details = 'Falha ao gerar semana 2 para teste de rodízio.';
      }
    }
    results.push({
      id: 'T05',
      name: 'Sem repetição consecutiva do dia de folga quando há alternativa viável',
      passed,
      details,
    });
  }

  // Test 6: Individual restrictions and pair rules respected
  {
    const constraints: OperationalConstraint[] = [
      {
        id: 'c_forbid',
        type: 'individual_forbidden_day',
        employeeId: 'e2',
        day: 'seg',
        active: true,
        createdAt: '2026-11-01T00:00:00Z',
      },
      {
        id: 'c_prio',
        type: 'individual_priority_day',
        employeeId: 'e3',
        day: 'sex',
        strict: true,
        active: true,
        createdAt: '2026-11-01T00:00:00Z',
      },
      {
        id: 'c_cannot',
        type: 'cannot_off_together',
        employeeIds: ['e1', 'e2'],
        active: true,
        createdAt: '2026-11-01T00:00:00Z',
      },
      {
        id: 'c_must',
        type: 'must_off_together',
        employeeIds: ['e7', 'e8'],
        active: true,
        createdAt: '2026-11-01T00:00:00Z',
      },
    ];

    const outcome = generateIntelligentSchedule({
      weekStart: '2026-11-16',
      employees: testEmployees,
      constraints,
      history: [],
      settings: DEFAULT_SETTINGS,
    });

    const e1 = outcome.draft?.entries.find((e) => e.employeeId === 'e1');
    const e2 = outcome.draft?.entries.find((e) => e.employeeId === 'e2');
    const e3 = outcome.draft?.entries.find((e) => e.employeeId === 'e3');
    const e7 = outcome.draft?.entries.find((e) => e.employeeId === 'e7');
    const e8 = outcome.draft?.entries.find((e) => e.employeeId === 'e8');

    const passed = Boolean(
      outcome.success &&
        e2 &&
        e2.offDay !== 'seg' &&
        e3 &&
        e3.offDay === 'sex' &&
        e1 &&
        e1.offDay !== e2.offDay &&
        e7 &&
        e8 &&
        e7.offDay === e8.offDay
    );

    results.push({
      id: 'T06',
      name: 'Restrições individuais e de grupo são respeitadas',
      passed,
      details: passed
        ? 'Proibição individual, prioridade obrigatória, "não folgar juntos" e "folgar juntos" atendidos.'
        : 'Uma ou mais restrições individuais/grupo não foram atendidas.',
    });
  }

  // Test 7: Coverage limits enforced & infeasible scenario generates clear explanation
  {
    const feasibleCoverage: OperationalConstraint[] = [
      {
        id: 'cov_ok',
        type: 'coverage',
        shift: '01',
        day: 'all_weekdays',
        minWorking: 4,
        maxOff: 1,
        active: true,
        createdAt: '2026-11-01T00:00:00Z',
      },
    ];

    const settingsWithCoverage = {
      ...DEFAULT_SETTINGS,
      shifts: {
        ...DEFAULT_SETTINGS.shifts,
        '01': { ...DEFAULT_SETTINGS.shifts['01'], minWorking: 4 },
      },
    };

    const okOutcome = generateIntelligentSchedule({
      weekStart: '2026-11-16',
      employees: testEmployees,
      constraints: feasibleCoverage,
      history: [],
      settings: settingsWithCoverage,
    });

    const minWorkingHonored =
      okOutcome.success &&
      Boolean(okOutcome.draft) &&
      WORKDAYS_MON_SAT.every((day) => {
        const working = okOutcome.draft!.entries.filter(
          (e) => e.shift === '01' && e.days[day] === 'TRABALHO'
        ).length;
        return working >= 4;
      });

    const impossibleCoverage: OperationalConstraint[] = [
      {
        id: 'cov_impossible',
        type: 'coverage',
        shift: '01',
        day: 'all_weekdays',
        minWorking: 5, // 5 employees in shift 01 => 0 off allowed, impossible to give 5 people a day off!
        active: true,
        createdAt: '2026-11-01T00:00:00Z',
      },
    ];

    const failOutcome = generateIntelligentSchedule({
      weekStart: '2026-11-16',
      employees: testEmployees,
      constraints: impossibleCoverage,
      history: [],
      settings: DEFAULT_SETTINGS,
    });

    const passed =
      minWorkingHonored &&
      !failOutcome.success &&
      failOutcome.validation.errors.length > 0 &&
      Boolean(failOutcome.validation.errors[0].message);

    results.push({
      id: 'T07',
      name: 'Cobertura mínima das configurações/restrições respeitada e conflito diagnosticado',
      passed,
      details: passed
        ? 'Cobertura mínima operacional (Seg–Sáb) atendida e conflito impossível bloqueado com explicação clara.'
        : 'Falha ao validar ou diagnosticar conflito de cobertura.',
    });
  }

  // Test 8: Shift transfer does not modify historical confirmed schedules
  {
    const confirmedEntry = baseOutcome.draft!.entries.find((e) => e.employeeId === 'e2')!;
    const historicalSchedule: WeeklySchedule = {
      id: 'sch_hist_1',
      weekStart: '2026-11-09',
      weekEnd: '2026-11-15',
      version: 1,
      generatedAt: '2026-11-08T10:00:00.000Z',
      confirmedAt: '2026-11-08T10:10:00.000Z',
      status: 'confirmed',
      entries: JSON.parse(JSON.stringify(baseOutcome.draft!.entries)),
      supervisorShift01: 'Kaleby Fabrete',
      supervisorShift02: 'Eduarda Pancieri',
    };

    const modifiedEmployees = testEmployees.map((emp) =>
      emp.id === 'e2' ? { ...emp, shift: '02' as const } : emp
    );

    const nextWeekOutcome = generateIntelligentSchedule({
      weekStart: '2026-11-16',
      employees: modifiedEmployees,
      constraints: [],
      history: [historicalSchedule],
      settings: DEFAULT_SETTINGS,
    });

    const histEntryAfter = historicalSchedule.entries.find((e) => e.employeeId === 'e2')!;
    const nextEntryAfter = nextWeekOutcome.draft?.entries.find((e) => e.employeeId === 'e2');

    const passed =
      histEntryAfter.shift === confirmedEntry.shift &&
      nextEntryAfter?.shift === '02';

    results.push({
      id: 'T08',
      name: 'Transferência de turno preserva histórico e atualiza próximas escalas',
      passed,
      details: passed
        ? 'Histórico manteve Turno 01 enquanto a nova escala já refletiu Turno 02.'
        : 'Transferência de turno afetou o histórico ou não refletiu na nova escala.',
    });
  }

  // Test 9: Randomize & new generation never alters confirmed schedules and avoids repeating signature
  {
    const confirmedCopy: WeeklySchedule = {
      id: 'sch_conf_9',
      weekStart: '2026-11-09',
      weekEnd: '2026-11-15',
      version: 1,
      generatedAt: '2026-11-08T10:00:00.000Z',
      confirmedAt: '2026-11-08T10:10:00.000Z',
      status: 'confirmed',
      entries: JSON.parse(JSON.stringify(baseOutcome.draft!.entries)),
      supervisorShift01: 'Kaleby Fabrete',
      supervisorShift02: 'Eduarda Pancieri',
    };
    const sig1 = computeDistributionSignature(baseOutcome.draft!.entries);
    const reRandomized = generateIntelligentSchedule({
      weekStart: '2026-11-16',
      employees: testEmployees,
      constraints: [],
      history: [confirmedCopy],
      settings: DEFAULT_SETTINGS,
      previousSignatures: [sig1],
      randomSeed: 42,
    });
    const sig2 = reRandomized.draft ? computeDistributionSignature(reRandomized.draft.entries) : '';
    const histSig = computeDistributionSignature(confirmedCopy.entries);

    const passed =
      reRandomized.success &&
      sig2 !== sig1 &&
      histSig === sig1;

    results.push({
      id: 'T09',
      name: 'Nova geração / randomização preserva escalas confirmadas e gera alternativa válida',
      passed,
      details: passed
        ? 'Escala confirmada intacta e nova variação válida gerada sem repetir a anterior.'
        : 'Falha ao gerar variação distinta ou preservar escala confirmada.',
    });
  }

  // Test 10: Persistence round-trip integrity (simulate reload)
  {
    const adapter = new MemoryStorageAdapter();
    const repo1 = new ScheduleRepository(adapter, 'test_key');
    const db: AppDatabase = createInitialDatabase();
    db.employees.push(makeEmp('e_extra', 'Teste Persistência', 'Repositor', '01'));
    const saveRes = repo1.save(db);

    const repo2 = new ScheduleRepository(adapter, 'test_key');
    const loadRes = repo2.load();

    // Also test validator rejects breaking 5x2 (e.g., working on Sunday instead of DSR)
    const brokenEntries = JSON.parse(JSON.stringify(baseOutcome.draft!.entries));
    brokenEntries[0].days.dom = 'TRABALHO';
    const brokenValidation = validateScheduleEntries(brokenEntries, [], [], '2026-11-16');

    const passed =
      saveRes.ok &&
      loadRes.ok &&
      loadRes.data?.employees.length === 3 &&
      loadRes.data.employees.some((e) => e.id === 'e_extra') &&
      !brokenValidation.valid;

    results.push({
      id: 'T10',
      name: 'Persistência íntegra após recarregamento e bloqueio de escala fora da regra 5x2',
      passed,
      details: passed
        ? 'Dados recuperados integralmente após recarga simulada e validação bloqueou trabalho no domingo.'
        : 'Falha na persistência ou na validação de bloqueio 5x2.',
    });
  }

  return results;
}

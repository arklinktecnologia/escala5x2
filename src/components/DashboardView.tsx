import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ALL_DAYS,
  DAY_LABELS,
  Employee,
  NavigationSection,
  OperationalConstraint,
  ShiftId,
  SystemSettings,
  WORKDAYS_MON_SAT,
  WeekdayKey,
  WeeklySchedule,
} from '../types/domain';
import {
  formatDateBR,
  formatDateTimeBR,
  formatWeekRangeBR,
  getMondayOfWeek,
  getWeekDayDates,
  toIsoDate,
} from '../utils/dateUtils';
import { validateScheduleEntries } from '../engine/scheduler';

interface WorkloadDatum {
  employeeId: string;
  shortName: string;
  fullName: string;
  role: string;
  shift: ShiftId;
  trabalhados: number;
  folgas: number;
  folgasRotativas: number;
  dsrs: number;
  semanas: number;
}

function formatShortAxisName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].length > 15 ? `${parts[0].slice(0, 14)}…` : parts[0];
  }
  const combined = `${parts[0]} ${parts[parts.length - 1]}`;
  return combined.length > 16 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : combined;
}

interface WorkloadTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: WorkloadDatum }>;
}

function WorkloadTooltip({ active, payload }: WorkloadTooltipProps) {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) {
    return null;
  }
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 shadow-md text-xs text-slate-700">
      <p className="font-semibold text-slate-900">{item.fullName}</p>
      <p className="text-slate-500 mt-0.5">
        {item.role} · Turno {item.shift} ·{' '}
        <span className="tabular-nums">{item.semanas} semana(s)</span>
      </p>
      <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 tabular-nums">
        <div className="flex items-center justify-between gap-5">
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-700 inline-block" aria-hidden="true" />
            Dias trabalhados
          </span>
          <span className="font-semibold text-emerald-800">{item.trabalhados} dia(s)</span>
        </div>
        <div className="flex items-center justify-between gap-5">
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-sm bg-orange-600 inline-block" aria-hidden="true" />
            Folgas (totais)
          </span>
          <span className="font-semibold text-orange-700">{item.folgas} dia(s)</span>
        </div>
        <p className="text-[11px] text-slate-500 pl-4">
          {item.folgasRotativas} rotativa(s) + {item.dsrs} DSR(s)
        </p>
      </div>
    </div>
  );
}

interface DashboardViewProps {
  employees: Employee[];
  schedules: WeeklySchedule[];
  constraints: OperationalConstraint[];
  settings: SystemSettings;
  onNavigate: (section: NavigationSection) => void;
}

export function DashboardView({
  employees,
  schedules,
  constraints,
  settings,
  onNavigate,
}: DashboardViewProps) {
  const currentWeekStart = getMondayOfWeek(new Date());
  const todayIso = toIsoDate(new Date());

  const shift01Count = employees.filter((e) => e.shift === '01').length;
  const shift02Count = employees.filter((e) => e.shift === '02').length;

  const [chartShiftFilter, setChartShiftFilter] = useState<'all' | ShiftId>('all');

  const sortedSchedules = [...schedules].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const currentWeekSchedule = schedules.find((s) => s.weekStart === currentWeekStart);
  const latestGeneratedSchedule = [...schedules].sort((a, b) =>
    b.confirmedAt.localeCompare(a.confirmedAt)
  )[0];

  const referenceSchedule = currentWeekSchedule ?? sortedSchedules[0];
  const last4Weeks = useMemo(() => sortedSchedules.slice(0, 4), [sortedSchedules]);

  const workloadChartData = useMemo<WorkloadDatum[]>(() => {
    if (last4Weeks.length === 0) return [];

    const byEmployee = new Map<string, WorkloadDatum>();

    // Seed with current registered employees in alphabetical order
    const sortedEmployees = [...employees].sort((a, b) =>
      a.fullName.localeCompare(b.fullName, 'pt-BR')
    );

    for (const emp of sortedEmployees) {
      byEmployee.set(emp.id, {
        employeeId: emp.id,
        shortName: formatShortAxisName(emp.fullName),
        fullName: emp.fullName,
        role: emp.role,
        shift: emp.shift,
        trabalhados: 0,
        folgas: 0,
        folgasRotativas: 0,
        dsrs: 0,
        semanas: 0,
      });
    }

    for (const week of last4Weeks) {
      for (const entry of week.entries) {
        let acc = byEmployee.get(entry.employeeId);
        if (!acc) {
          acc = {
            employeeId: entry.employeeId,
            shortName: formatShortAxisName(entry.employeeName),
            fullName: entry.employeeName,
            role: entry.employeeRole,
            shift: entry.shift,
            trabalhados: 0,
            folgas: 0,
            folgasRotativas: 0,
            dsrs: 0,
            semanas: 0,
          };
          byEmployee.set(entry.employeeId, acc);
        }

        acc.semanas += 1;
        for (const dayKey of ALL_DAYS) {
          const status = entry.days[dayKey];
          if (status === 'TRABALHO') {
            acc.trabalhados += 1;
          } else if (status === 'FOLGA') {
            acc.folgas += 1;
            acc.folgasRotativas += 1;
          } else if (status === 'DSR') {
            acc.folgas += 1;
            acc.dsrs += 1;
          }
        }
      }
    }

    return Array.from(byEmployee.values())
      .filter((item) => chartShiftFilter === 'all' || item.shift === chartShiftFilter)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));
  }, [employees, last4Weeks, chartShiftFilter]);

  // Conflict detection on active reference schedule vs current constraints, or team readiness
  const activeConflicts = referenceSchedule
    ? validateScheduleEntries(
        referenceSchedule.entries,
        constraints,
        schedules.filter((s) => s.id !== referenceSchedule.id),
        referenceSchedule.weekStart,
        settings
      )
    : null;

  const conflictAlertsCount = activeConflicts
    ? activeConflicts.errors.length + activeConflicts.warnings.length
    : 0;

  // Mon-Sat distribution counts for the reference schedule
  const distributionByDay: Record<WeekdayKey, { total: number; t01: number; t02: number; names: string[] }> = {
    seg: { total: 0, t01: 0, t02: 0, names: [] },
    ter: { total: 0, t01: 0, t02: 0, names: [] },
    qua: { total: 0, t01: 0, t02: 0, names: [] },
    qui: { total: 0, t01: 0, t02: 0, names: [] },
    sex: { total: 0, t01: 0, t02: 0, names: [] },
    sab: { total: 0, t01: 0, t02: 0, names: [] },
  };

  if (referenceSchedule) {
    for (const entry of referenceSchedule.entries) {
      if (WORKDAYS_MON_SAT.includes(entry.offDay)) {
        distributionByDay[entry.offDay].total += 1;
        if (entry.shift === '01') distributionByDay[entry.offDay].t01 += 1;
        else distributionByDay[entry.offDay].t02 += 1;
        distributionByDay[entry.offDay].names.push(entry.employeeName);
      }
    }
  }

  const maxDayOffCount = Math.max(
    1,
    ...WORKDAYS_MON_SAT.map((d) => distributionByDay[d].total)
  );

  // Upcoming days off in the reference schedule
  const referenceDates = getWeekDayDates(referenceSchedule?.weekStart ?? currentWeekStart);
  const upcomingOffItems = referenceSchedule
    ? WORKDAYS_MON_SAT.map((day) => ({
        day,
        dateIso: referenceDates[day].iso,
        dateBR: referenceDates[day].shortBR,
        entries: referenceSchedule.entries.filter((e) => e.offDay === day),
      })).filter((bucket) => bucket.entries.length > 0 && bucket.dateIso >= todayIso)
    : [];

  const fallbackAllWeekOffItems = referenceSchedule
    ? WORKDAYS_MON_SAT.map((day) => ({
        day,
        dateIso: referenceDates[day].iso,
        dateBR: referenceDates[day].shortBR,
        entries: referenceSchedule.entries.filter((e) => e.offDay === day),
      })).filter((bucket) => bucket.entries.length > 0)
    : [];

  const displayUpcoming = upcomingOffItems.length > 0 ? upcomingOffItems : fallbackAllWeekOffItems;

  return (
    <div className="space-y-6">
      {/* Top KPI Grid */}
      <section aria-label="Indicadores principais" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total de funcionários</span>
            <Users className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900 tabular-nums">{employees.length}</p>
          <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
            Turno 01: <span className="font-semibold text-slate-700">{shift01Count}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            Turno 02: <span className="font-semibold text-slate-700">{shift02Count}</span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Escala semanal atual</span>
            <CalendarCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          </div>
          {currentWeekSchedule ? (
            <>
              <p className="mt-2 text-lg font-bold text-emerald-800 tabular-nums">Confirmada</p>
              <p className="mt-1 text-xs text-slate-600 tabular-nums">
                {formatWeekRangeBR(currentWeekSchedule.weekStart, currentWeekSchedule.weekEnd)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-bold text-amber-700">Pendente</p>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                Semana {formatWeekRangeBR(currentWeekStart)}
              </p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Última escala gerada</span>
            <CalendarClock className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          </div>
          {latestGeneratedSchedule ? (
            <>
              <p className="mt-2 text-lg font-bold text-slate-900 tabular-nums">
                {formatDateBR(latestGeneratedSchedule.weekStart)}
              </p>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                Salva em {formatDateTimeBR(latestGeneratedSchedule.confirmedAt)} · v{latestGeneratedSchedule.version}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-bold text-slate-400">Nenhuma</p>
              <p className="mt-1 text-xs text-slate-500">Gere a primeira escala semanal 5x2</p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Alertas de conflitos</span>
            {conflictAlertsCount > 0 ? (
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            )}
          </div>
          <p
            className={`mt-2 text-3xl font-bold tabular-nums ${
              conflictAlertsCount > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {conflictAlertsCount}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            {referenceSchedule
              ? conflictAlertsCount === 0
                ? 'Escala 5x2 em total conformidade'
                : `${activeConflicts?.errors.length ?? 0} erro(s) · ${activeConflicts?.warnings.length ?? 0} aviso(s)`
              : `${constraints.filter((c) => c.active).length} restrição(ões) configurada(s)`}
          </p>
        </div>
      </section>

      {/* Secondary Shift & Quick Action Strip */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Turno 01</h2>
            <span className="text-xs font-mono text-slate-500 tabular-nums">{shift01Count} colaboradores</span>
          </div>
          <div className="mt-3 space-y-1.5 text-xs text-slate-600 tabular-nums">
            <p className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
              <span>
                Seg a Sex: <strong className="text-slate-900">{settings.shifts['01'].weekdayHours.start} – {settings.shifts['01'].weekdayHours.end}</strong>
              </span>
            </p>
            <p className="pl-5.5">
              Sábado: <strong className="text-slate-900">{settings.shifts['01'].saturdayHours.start} – {settings.shifts['01'].saturdayHours.end}</strong>
            </p>
            <p className="pl-5.5 text-slate-500">Domingo: DSR fixo (todos de folga)</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Turno 02</h2>
            <span className="text-xs font-mono text-slate-500 tabular-nums">{shift02Count} colaboradores</span>
          </div>
          <div className="mt-3 space-y-1.5 text-xs text-slate-600 tabular-nums">
            <p className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
              <span>
                Seg a Sex: <strong className="text-slate-900">{settings.shifts['02'].weekdayHours.start} – {settings.shifts['02'].weekdayHours.end}</strong>
              </span>
            </p>
            <p className="pl-5.5">
              Sábado: <strong className="text-slate-900">{settings.shifts['02'].saturdayHours.start} – {settings.shifts['02'].saturdayHours.end}</strong>
            </p>
            <p className="pl-5.5 text-slate-500">Domingo: DSR fixo (todos de folga)</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Ações rápidas</h2>
            <p className="mt-1 text-xs text-slate-500">
              Gerencie sua equipe ou gere a escala automática no padrão 5x2.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('generator')}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 whitespace-nowrap"
            >
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Gerar escala
            </button>
            <button
              type="button"
              onClick={() => onNavigate('employees')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 whitespace-nowrap"
            >
              Funcionários
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {/* Workload Comparison Chart (Last 4 Weeks) */}
      <section aria-label="Carga de trabalho nas últimas 4 semanas" className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-2.5">
            <BarChart3 className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Carga de trabalho nas últimas 4 semanas
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {last4Weeks.length > 0
                  ? `Comparativo de dias trabalhados vs. folgas (rotativa + DSR) em ${last4Weeks.length} semana(s): ${formatDateBR(last4Weeks[last4Weeks.length - 1].weekStart)} a ${formatDateBR(last4Weeks[0].weekEnd)}`
                  : 'Comparativo de dias trabalhados vs. folgas nas últimas 4 semanas confirmadas'}
              </p>
            </div>
          </div>

          <div
            role="group"
            aria-label="Filtrar gráfico por turno"
            className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs"
          >
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: '01', label: 'Turno 01' },
                { id: '02', label: 'Turno 02' },
              ] as const
            ).map((opt) => {
              const active = chartShiftFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setChartShiftFilter(opt.id)}
                  className={`rounded-md px-3 py-1.5 font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {last4Weeks.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-600">
              Nenhuma escala confirmada ainda. Gere e confirme escalas para acompanhar a carga de trabalho nas últimas 4 semanas.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('generator')}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Gerar primeira escala
            </button>
          </div>
        ) : workloadChartData.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            Nenhum funcionário encontrado para o turno selecionado.
          </div>
        ) : (
          <div className="mt-4 w-full min-w-0 overflow-x-auto">
            <div
              className="h-[320px]"
              style={{ minWidth: Math.max(480, workloadChartData.length * 88) }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={workloadChartData}
                  margin={{ top: 12, right: 16, left: -12, bottom: 8 }}
                  barGap={6}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="shortName"
                    tick={{ fontSize: 12, fill: '#475569' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    label={{
                      value: 'Dias',
                      angle: -90,
                      position: 'insideLeft',
                      offset: 20,
                      style: { fontSize: 11, fill: '#64748b' },
                    }}
                  />
                  <Tooltip
                    content={<WorkloadTooltip />}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="square"
                    iconSize={10}
                    wrapperStyle={{ fontSize: '12px', paddingBottom: '12px' }}
                  />
                  <Bar
                    dataKey="trabalhados"
                    name="Dias trabalhados"
                    fill="#15803d"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={38}
                  />
                  <Bar
                    dataKey="folgas"
                    name="Folgas (Rotativa + DSR)"
                    fill="#ea580c"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={38}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      {/* Visual Distribution + Upcoming Days Off */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Mon-Fri Off Distribution Summary */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Distribuição das folgas (Segunda a Sábado)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {referenceSchedule
                  ? `Referência: ${formatWeekRangeBR(referenceSchedule.weekStart, referenceSchedule.weekEnd)}`
                  : 'Nenhuma escala confirmada ainda'}
              </p>
            </div>
            {referenceSchedule && (
              <button
                type="button"
                onClick={() => onNavigate('weekly')}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline whitespace-nowrap"
              >
                Ver tabela completa
              </button>
            )}
          </div>

          {referenceSchedule ? (
            <div className="mt-5 space-y-4">
              {WORKDAYS_MON_SAT.map((day) => {
                const stat = distributionByDay[day];
                const pct = Math.round((stat.total / maxDayOffCount) * 100);
                return (
                  <div key={day} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">
                        {DAY_LABELS[day].full} ({referenceDates[day].shortBR})
                      </span>
                      <span className="text-slate-600 tabular-nums">
                        <strong className="text-slate-900">{stat.total}</strong> folga(s)
                        <span className="mx-1.5 text-slate-300" aria-hidden="true">|</span>
                        T01: {stat.t01} · T02: {stat.t02}
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-600 transition-all duration-200"
                        style={{ width: `${stat.total > 0 ? Math.max(8, pct) : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-600">
                Gere e confirme uma escala semanal para visualizar a distribuição das folgas.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('generator')}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                <CalendarPlus className="h-4 w-4" />
                Gerar primeira escala
              </button>
            </div>
          )}
        </div>

        {/* Upcoming Days Off & Weekly Summary List */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">
              Próximas folgas e equipe da semana
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {referenceSchedule
                ? `${referenceSchedule.entries.length} funcionário(s) com folga na semana`
                : 'Aguardando geração da escala'}
            </p>
          </div>

          {referenceSchedule && displayUpcoming.length > 0 ? (
            <ul className="mt-4 divide-y divide-slate-100">
              {displayUpcoming.map((item) => (
                <li key={item.day} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                    <span>{DAY_LABELS[item.day].full}</span>
                    <span className="font-mono text-slate-500 tabular-nums">{item.dateBR}</span>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {item.entries.map((e) => (
                      <div
                        key={e.employeeId}
                        className="flex items-center justify-between text-xs text-slate-600"
                      >
                        <span className="font-medium text-slate-800 truncate pr-2">
                          {e.employeeName}
                        </span>
                        <span className="text-slate-500 shrink-0 tabular-nums">
                          {e.employeeRole} · T{e.shift}
                        </span>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-10 text-center text-sm text-slate-500">
              Nenhuma folga programada para exibir.
            </div>
          )}
        </div>
      </section>

      {/* Weekly Calendar Summary */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Calendário semanal resumido</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Visão diária de segunda a domingo no regime 5x2 (folga rotativa de seg a sáb · domingo DSR fixo)
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {formatWeekRangeBR(referenceSchedule?.weekStart ?? currentWeekStart)}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {ALL_DAYS.map((day) => {
            const dateInfo = referenceDates[day];
            const isToday = dateInfo.iso === todayIso;
            const isSun = day === 'dom';
            const offPeople =
              referenceSchedule && !isSun
                ? referenceSchedule.entries.filter((e) => e.offDay === day)
                : [];

            return (
              <div
                key={day}
                className={`rounded-lg border p-3 flex flex-col justify-between min-h-[120px] ${
                  isToday
                    ? 'border-emerald-500 bg-emerald-50/40'
                    : isSun
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-slate-200 bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">
                      {DAY_LABELS[day].short}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                      {dateInfo.shortBR}
                    </span>
                  </div>

                  {isSun ? (
                    <p className="mt-3 text-xs font-semibold text-slate-600">
                      DSR fixo — Toda a equipe de folga
                    </p>
                  ) : referenceSchedule ? (
                    offPeople.length > 0 ? (
                      <div className="mt-2.5 space-y-1">
                        <p className="text-[11px] font-semibold text-orange-800">
                          Folga ({offPeople.length}):
                        </p>
                        {offPeople.map((p) => (
                          <p key={p.employeeId} className="text-xs text-slate-700 truncate">
                            {p.employeeName} <span className="text-slate-400">T{p.shift}</span>
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-emerald-700 font-medium">
                        Equipe completa trabalhando
                      </p>
                    )
                  ) : (
                    <p className="mt-3 text-xs text-slate-400">Sem escala</p>
                  )}
                </div>

                {isToday && (
                  <p className="mt-2 text-[11px] font-semibold text-emerald-700">Hoje</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Active Conflict Details if any */}
      {activeConflicts && (activeConflicts.errors.length > 0 || activeConflicts.warnings.length > 0) && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-amber-900">
              Avisos e conflitos detectados na escala atual
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('generator')}
              className="text-xs font-semibold text-emerald-800 hover:underline whitespace-nowrap"
            >
              Revisar no gerador
            </button>
          </div>
          <ul className="mt-3 space-y-1.5 text-xs text-amber-900">
            {activeConflicts.errors.map((err, i) => (
              <li key={`e-${i}`} className="font-semibold text-rose-700">
                • [Erro] {err.message}
              </li>
            ))}
            {activeConflicts.warnings.map((w, i) => (
              <li key={`w-${i}`}>• [Aviso] {w.message}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

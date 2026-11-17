import { useMemo, useState } from 'react';
import { ArrowLeftRight, CalendarDays, Crown, Download, History as HistoryIcon, Users } from 'lucide-react';
import {
  ALL_DAYS,
  DAY_LABELS,
  Employee,
  SystemSettings,
  WeeklySchedule,
} from '../types/domain';
import { formatDateBR, formatDateTimeBR, formatWeekRangeBR, getWeekDayDates } from '../utils/dateUtils';
import { exportWeeklyScheduleToPdf } from '../utils/pdfExport';
import { ScheduleStatusCell } from './ui/ScheduleStatusCell';

type HistoryTab = 'weeks' | 'rotation' | 'compare';

interface HistoryViewProps {
  schedules: WeeklySchedule[];
  employees: Employee[];
  settings: SystemSettings;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, description?: string) => void;
}

export function HistoryView({
  schedules,
  employees,
  settings,
  onNotify,
}: HistoryViewProps) {
  const sortedSchedules = useMemo(
    () =>
      [...schedules].sort((a, b) => {
        const cmp = b.weekStart.localeCompare(a.weekStart);
        return cmp !== 0 ? cmp : b.version - a.version;
      }),
    [schedules]
  );

  const [tab, setTab] = useState<HistoryTab>('weeks');
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>(sortedSchedules[0]?.id ?? '');

  // All employees that appear in current roster OR in historical snapshots
  const historicalEmployeeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const emp of employees) map.set(emp.id, emp.fullName);
    for (const s of schedules) {
      for (const e of s.entries) {
        if (!map.has(e.employeeId)) map.set(e.employeeId, `${e.employeeName} (histórico)`);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [employees, schedules]);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    historicalEmployeeOptions[0]?.id ?? ''
  );

  const [compareWeekAId, setCompareWeekAId] = useState<string>(sortedSchedules[1]?.id ?? sortedSchedules[0]?.id ?? '');
  const [compareWeekBId, setCompareWeekBId] = useState<string>(sortedSchedules[0]?.id ?? '');

  const selectedSchedule =
    sortedSchedules.find((s) => s.id === selectedScheduleId) ?? sortedSchedules[0];

  const employeeRotationRows = useMemo(() => {
    if (!selectedEmployeeId) return [];
    return sortedSchedules
      .map((s) => {
        const entry = s.entries.find((e) => e.employeeId === selectedEmployeeId);
        return entry
          ? {
              scheduleId: s.id,
              weekStart: s.weekStart,
              weekEnd: s.weekEnd,
              version: s.version,
              shift: entry.shift,
              role: entry.employeeRole,
              offDay: entry.offDay,
            }
          : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [sortedSchedules, selectedEmployeeId]);

  const compareResult = useMemo(() => {
    const schA = sortedSchedules.find((s) => s.id === compareWeekAId);
    const schB = sortedSchedules.find((s) => s.id === compareWeekBId);
    if (!schA || !schB) return null;

    const allIds = Array.from(
      new Set([...schA.entries.map((e) => e.employeeId), ...schB.entries.map((e) => e.employeeId)])
    );

    const rows = allIds
      .map((id) => {
        const a = schA.entries.find((e) => e.employeeId === id);
        const b = schB.entries.find((e) => e.employeeId === id);
        const name = b?.employeeName ?? a?.employeeName ?? id;
        const changedOff = a && b ? a.offDay !== b.offDay : false;
        const changedShift = a && b ? a.shift !== b.shift : false;
        return { id, name, a, b, changedOff, changedShift };
      })
      .sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'));

    return { schA, schB, rows };
  }, [sortedSchedules, compareWeekAId, compareWeekBId]);

  if (sortedSchedules.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
        <HistoryIcon className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
        <h2 className="mt-3 text-base font-semibold text-slate-900">
          Histórico de escalas vazio
        </h2>
        <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
          Todas as escalas confirmadas serão armazenadas aqui com preservação imutável, registro de
          alterações e histórico do rodízio das últimas 8 semanas ou mais.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Sub-navigation Tabs */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-lg bg-slate-100 p-1 self-start">
          {(
            [
              { id: 'weeks', label: 'Semanas confirmadas', icon: CalendarDays },
              { id: 'rotation', label: 'Rodízio por funcionário', icon: Users },
              { id: 'compare', label: 'Comparar semanas', icon: ArrowLeftRight },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  tab === item.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-slate-500 tabular-nums">
          Total preservado: <strong className="text-slate-900">{sortedSchedules.length}</strong> escala(s) confirmada(s)
        </p>
      </div>

      {/* TAB 1: Confirmed Weeks List + Detail */}
      {tab === 'weeks' && selectedSchedule && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h2 className="text-xs font-bold text-slate-700">Escalas confirmadas</h2>
            </div>
            <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
              {sortedSchedules.map((s) => {
                const isSelected = s.id === selectedSchedule.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedScheduleId(s.id)}
                    className={`w-full text-left px-4 py-3.5 transition-colors ${
                      isSelected ? 'bg-emerald-50/80' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900 tabular-nums">
                        {formatWeekRangeBR(s.weekStart, s.weekEnd)}
                      </span>
                      <span className="text-[11px] font-mono font-semibold text-emerald-800">
                        v{s.version}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 tabular-nums">
                      Confirmada em {formatDateTimeBR(s.confirmedAt)} · {s.entries.length} colab.
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900 tabular-nums">
                    Semana {formatWeekRangeBR(selectedSchedule.weekStart, selectedSchedule.weekEnd)} (v{selectedSchedule.version})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                    Gerada em {formatDateTimeBR(selectedSchedule.generatedAt)} · Confirmada em{' '}
                    {formatDateTimeBR(selectedSchedule.confirmedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    exportWeeklyScheduleToPdf(selectedSchedule, settings, 'all');
                    onNotify('success', 'PDF exportado', 'Documento histórico gerado em A4.');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap self-start"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Exportar PDF
                </button>
              </div>

              <div className="mt-3 text-xs text-slate-600 flex flex-wrap gap-x-6 gap-y-1">
                <span>
                  Encarregado Turno 01: <strong className="text-slate-900">{selectedSchedule.supervisorShift01}</strong>
                </span>
                <span>
                  Encarregada Turno 02: <strong className="text-slate-900">{selectedSchedule.supervisorShift02}</strong>
                </span>
              </div>

              {selectedSchedule.changesFromPrevious && selectedSchedule.changesFromPrevious.length > 0 && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-800 mb-1.5">
                    Alterações registradas em relação à versão/semana anterior:
                  </p>
                  <ul className="space-y-1 text-xs text-slate-600">
                    {selectedSchedule.changesFromPrevious.map((chg, idx) => (
                      <li key={idx}>
                        <strong className="text-slate-800">{chg.employeeName}:</strong> {chg.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                      <th className="px-3 py-2.5">Funcionário</th>
                      <th className="px-2 py-2.5">Turno</th>
                      {ALL_DAYS.map((d) => (
                        <th key={d} className="px-1.5 py-2.5 text-center">
                          <div>{DAY_LABELS[d].short}</div>
                          <div className="font-mono font-normal text-[10px] text-slate-400 tabular-nums">
                            {getWeekDayDates(selectedSchedule.weekStart)[d].shortBR}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {[...selectedSchedule.entries]
                      .sort((a, b) =>
                        a.shift !== b.shift
                          ? a.shift.localeCompare(b.shift)
                          : a.employeeName.localeCompare(b.employeeName, 'pt-BR')
                      )
                      .map((entry) => (
                        <tr key={entry.employeeId}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-slate-900">{entry.employeeName}</p>
                              {entry.employeeRole.toLowerCase().includes('encarregad') && (
                                <Crown
                                  className="h-4 w-4 text-emerald-600 shrink-0"
                                  aria-label="Encarregado"
                                />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500">{entry.employeeRole}</p>
                          </td>
                          <td className="px-2 py-2 font-mono text-slate-700 tabular-nums">
                            T{entry.shift}
                          </td>
                          {ALL_DAYS.map((d) => (
                            <td key={d} className="px-1 py-1.5">
                              <ScheduleStatusCell status={entry.days[d]} />
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Employee Rotation History */}
      {tab === 'rotation' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Histórico individual de rodízio de folgas
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Consulte a sequência de folgas rotativas (Seg–Sáb) de cada colaborador ao longo das semanas confirmadas.
              </p>
            </div>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              aria-label="Selecionar funcionário para consultar rodízio"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
            >
              {historicalEmployeeOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </div>

          {employeeRotationRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Este funcionário ainda não participou de nenhuma escala confirmada.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-4 py-3">Período da semana</th>
                    <th className="px-4 py-3">Versão</th>
                    <th className="px-4 py-3">Função / Turno</th>
                    <th className="px-4 py-3">Folga rotativa (Seg–Sáb)</th>
                    <th className="px-4 py-3">DSR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employeeRotationRows.map((row) => (
                    <tr key={row.scheduleId}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                        {formatWeekRangeBR(row.weekStart, row.weekEnd)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 tabular-nums">
                        v{row.version}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {row.role} · Turno {row.shift}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-orange-800">
                        {DAY_LABELS[row.offDay].full}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">Domingo (DSR)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Compare Weeks */}
      {tab === 'compare' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
            <div>
              <label htmlFor="cmp-a" className="block text-xs font-semibold text-slate-600 mb-1.5">
                Semana base (A)
              </label>
              <select
                id="cmp-a"
                value={compareWeekAId}
                onChange={(e) => setCompareWeekAId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums"
              >
                {sortedSchedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatDateBR(s.weekStart)} a {formatDateBR(s.weekEnd)} (v{s.version})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cmp-b" className="block text-xs font-semibold text-slate-600 mb-1.5">
                Semana comparada (B)
              </label>
              <select
                id="cmp-b"
                value={compareWeekBId}
                onChange={(e) => setCompareWeekBId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums"
              >
                {sortedSchedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatDateBR(s.weekStart)} a {formatDateBR(s.weekEnd)} (v{s.version})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {compareResult && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                    <th className="px-4 py-3">Funcionário</th>
                    <th className="px-4 py-3">
                      Semana A ({formatDateBR(compareResult.schA.weekStart)})
                    </th>
                    <th className="px-4 py-3">
                      Semana B ({formatDateBR(compareResult.schB.weekStart)})
                    </th>
                    <th className="px-4 py-3">Alteração detectada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {compareResult.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900 text-sm">{row.name}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.a ? `Turno ${row.a.shift} · Folga ${DAY_LABELS[row.a.offDay].full}` : 'Não escalado'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.b ? `Turno ${row.b.shift} · Folga ${DAY_LABELS[row.b.offDay].full}` : 'Não escalado'}
                      </td>
                      <td className="px-4 py-3">
                        {!row.a && row.b ? (
                          <span className="font-semibold text-emerald-700">Novo na escala</span>
                        ) : row.a && !row.b ? (
                          <span className="font-semibold text-rose-700">Ausente na semana B</span>
                        ) : row.changedOff || row.changedShift ? (
                          <span className="font-semibold text-emerald-700">
                            {[
                              row.changedShift ? `Turno ${row.a!.shift} → ${row.b!.shift}` : '',
                              row.changedOff
                                ? `Folga ${DAY_LABELS[row.a!.offDay].short} → ${DAY_LABELS[row.b!.offDay].short}`
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        ) : (
                          <span className="text-slate-400">Sem alteração</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

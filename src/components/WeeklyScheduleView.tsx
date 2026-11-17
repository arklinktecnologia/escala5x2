import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Crown, Download, FileText } from 'lucide-react';
import {
  ALL_DAYS,
  DAY_LABELS,
  DayKey,
  NavigationSection,
  ScheduleEntry,
  ShiftId,
  SystemSettings,
  WeeklySchedule,
} from '../types/domain';
import { formatDateTimeBR, formatWeekRangeBR, getMondayOfWeek, getWeekDayDates } from '../utils/dateUtils';
import { exportWeeklyScheduleToPdf, PdfExportScope } from '../utils/pdfExport';
import { ScheduleStatusCell } from './ui/ScheduleStatusCell';

type WeeklyViewFilter = 'all' | '01' | '02' | 'off' | 'working';

interface WeeklyScheduleViewProps {
  schedules: WeeklySchedule[];
  settings: SystemSettings;
  onNavigate: (section: NavigationSection) => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, description?: string) => void;
}

export function WeeklyScheduleView({
  schedules,
  settings,
  onNavigate,
  onNotify,
}: WeeklyScheduleViewProps) {
  const sortedSchedules = useMemo(
    () => [...schedules].sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
    [schedules]
  );

  const currentWeekStart = getMondayOfWeek(new Date());

  const [selectedScheduleId, setSelectedScheduleId] = useState<string>(() => {
    const current = sortedSchedules.find((s) => s.weekStart === currentWeekStart);
    return current?.id ?? sortedSchedules[0]?.id ?? '';
  });

  useEffect(() => {
    if (!sortedSchedules.some((s) => s.id === selectedScheduleId)) {
      const current = sortedSchedules.find((s) => s.weekStart === currentWeekStart);
      setSelectedScheduleId(current?.id ?? sortedSchedules[0]?.id ?? '');
    }
  }, [sortedSchedules, selectedScheduleId, currentWeekStart]);

  const [filterMode, setFilterMode] = useState<WeeklyViewFilter>('all');
  const [selectedDayFilter, setSelectedDayFilter] = useState<DayKey | 'any'>('any');

  const activeSchedule = sortedSchedules.find((s) => s.id === selectedScheduleId);

  const handleExportPdf = (scope: PdfExportScope) => {
    if (!activeSchedule) return;
    try {
      exportWeeklyScheduleToPdf(activeSchedule, settings, scope);
      onNotify('success', 'PDF exportado com sucesso', 'O arquivo A4 foi gerado e baixado.');
    } catch (err) {
      onNotify(
        'error',
        'Erro ao exportar PDF',
        err instanceof Error ? err.message : 'Falha inesperada na geração do documento.'
      );
    }
  };

  if (!activeSchedule) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
        <FileText className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
        <h2 className="mt-3 text-base font-semibold text-slate-900">
          Nenhuma escala semanal confirmada ainda
        </h2>
        <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
          Acesse a tela de geração para criar, validar e confirmar a primeira escala no regime 5x2.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('generator')}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          Ir para Gerar escala
        </button>
      </div>
    );
  }

  const weekDates = getWeekDayDates(activeSchedule.weekStart);

  const filterEntry = (entry: ScheduleEntry): boolean => {
    if (filterMode === '01' && entry.shift !== '01') return false;
    if (filterMode === '02' && entry.shift !== '02') return false;

    if (filterMode === 'off') {
      if (selectedDayFilter === 'any') {
        // Every employee in 5x2 has 1 weekday off, highlight/show all or match specific day
        return true;
      }
      return entry.days[selectedDayFilter] === 'FOLGA' || entry.days[selectedDayFilter] === 'DSR';
    }

    if (filterMode === 'working') {
      if (selectedDayFilter === 'any') {
        return true;
      }
      return entry.days[selectedDayFilter] === 'TRABALHO';
    }

    return true;
  };

  const shift01Entries = activeSchedule.entries
    .filter((e) => e.shift === '01' && filterEntry(e))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'pt-BR'));

  const shift02Entries = activeSchedule.entries
    .filter((e) => e.shift === '02' && filterEntry(e))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'pt-BR'));

  const shiftsToRender: { id: ShiftId; entries: ScheduleEntry[]; supervisor: string }[] = [];
  if (filterMode !== '02') {
    shiftsToRender.push({
      id: '01',
      entries: shift01Entries,
      supervisor: activeSchedule.supervisorShift01,
    });
  }
  if (filterMode !== '01') {
    shiftsToRender.push({
      id: '02',
      entries: shift02Entries,
      supervisor: activeSchedule.supervisorShift02,
    });
  }

  return (
    <div className="space-y-5">
      {/* Header Controls: Week Selector + PDF Export */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label htmlFor="weekly-select" className="block text-xs font-semibold text-slate-600 mb-1">
                Selecionar escala confirmada
              </label>
              <select
                id="weekly-select"
                value={activeSchedule.id}
                onChange={(e) => setSelectedScheduleId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-emerald-600 focus:outline-none tabular-nums"
              >
                {sortedSchedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatWeekRangeBR(s.weekStart, s.weekEnd)} (v{s.version})
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-4">
              <p className="text-xs text-slate-500 tabular-nums">
                Confirmada em <strong className="text-slate-700">{formatDateTimeBR(activeSchedule.confirmedAt)}</strong>
                <span className="mx-1.5" aria-hidden="true">·</span>
                {activeSchedule.entries.length} colaborador(es)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleExportPdf('all')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Exportar PDF completo
            </button>
            <button
              type="button"
              onClick={() => handleExportPdf('01')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
              PDF Turno 01
            </button>
            <button
              type="button"
              onClick={() => handleExportPdf('02')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
              PDF Turno 02
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: 'all', label: 'Todos os funcionários' },
                { id: '01', label: 'Turno 01' },
                { id: '02', label: 'Turno 02' },
                { id: 'off', label: 'Somente de folga' },
                { id: 'working', label: 'Somente trabalhando' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setFilterMode(tab.id);
                  if ((tab.id === 'off' || tab.id === 'working') && selectedDayFilter === 'any') {
                    setSelectedDayFilter('seg');
                  }
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  filterMode === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {(filterMode === 'off' || filterMode === 'working') && (
            <div className="flex items-center gap-2">
              <label htmlFor="day-filter-select" className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                Filtrar dia:
              </label>
              <select
                id="day-filter-select"
                value={selectedDayFilter}
                onChange={(e) => setSelectedDayFilter(e.target.value as DayKey | 'any')}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900"
              >
                <option value="any">Toda a semana</option>
                {ALL_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {DAY_LABELS[d].full} ({weekDates[d].shortBR})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Visually Separated Shift Tables */}
      {shiftsToRender.map((section) => {
        const sConfig = settings.shifts[section.id];
        return (
          <section
            key={section.id}
            className="rounded-xl border border-slate-200 bg-white overflow-hidden"
          >
            <div className="border-b border-slate-200 bg-slate-50/90 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Turno {section.id} — Encarregado(a): {section.supervisor || 'Não definido'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  Seg a Sex: {sConfig.weekdayHours.start} às {sConfig.weekdayHours.end}
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  Sábado: {sConfig.saturdayHours.start} às {sConfig.saturdayHours.end}
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  Domingo: DSR fixo
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-emerald-800 tabular-nums">
                {section.entries.length} exibido(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[840px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-xs font-semibold text-slate-600">
                    <th className="px-4 py-3">Funcionário</th>
                    <th className="px-3 py-3">Função</th>
                    <th className="px-3 py-3">Horários</th>
                    {ALL_DAYS.map((day) => (
                      <th
                        key={day}
                        className={`px-2 py-3 text-center w-[94px] ${
                          selectedDayFilter === day ? 'bg-emerald-50/70 text-emerald-900' : ''
                        }`}
                      >
                        <div>{DAY_LABELS[day].short}</div>
                        <div className="text-[10px] font-mono font-normal text-slate-400 tabular-nums">
                          {weekDates[day].shortBR}
                        </div>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center">Dias de folga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {section.entries.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                        Nenhum funcionário deste turno corresponde ao filtro selecionado.
                      </td>
                    </tr>
                  ) : (
                    section.entries.map((entry) => (
                      <tr key={entry.employeeId} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5 font-semibold text-slate-900 text-sm">
                          <div className="flex items-center gap-1.5">
                            <span>{entry.employeeName}</span>
                            {entry.employeeRole.toLowerCase().includes('encarregad') && (
                              <Crown
                                className="h-4 w-4 text-emerald-600 shrink-0"
                                aria-label="Encarregado"
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{entry.employeeRole}</td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
                          <div>
                            Seg–Sex: {entry.weekdayHours.start}–{entry.weekdayHours.end}
                          </div>
                          <div>
                            Sáb: {entry.saturdayHours.start}–{entry.saturdayHours.end}
                          </div>
                        </td>
                        {ALL_DAYS.map((day) => (
                          <td
                            key={day}
                            className={`px-1.5 py-2 ${
                              selectedDayFilter === day ? 'bg-emerald-50/40' : ''
                            }`}
                          >
                            <ScheduleStatusCell status={entry.days[day]} />
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-center font-semibold text-orange-800 whitespace-nowrap">
                          {DAY_LABELS[entry.offDay].short} e Dom
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

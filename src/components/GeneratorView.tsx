import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crown,
  Info,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  ALL_DAYS,
  DAY_LABELS,
  DraftSchedule,
  Employee,
  OperationalConstraint,
  ScheduleEntry,
  ShiftId,
  SystemSettings,
  ValidationResult,
  WORKDAYS_MON_SAT,
  WeekdayKey,
  WeeklySchedule,
} from '../types/domain';
import {
  addDaysIso,
  formatDateBR,
  formatDateTimeBR,
  formatWeekRangeBR,
  getMondayOfWeek,
  getSundayOfWeek,
  getWeekDayDates,
} from '../utils/dateUtils';
import {
  build5x2DaysMap,
  computeDistributionSignature,
  generateIntelligentSchedule,
  validateScheduleEntries,
} from '../engine/scheduler';
import { ScheduleStatusCell } from './ui/ScheduleStatusCell';
import { ConfirmModal } from './ui/ConfirmModal';

interface GeneratorViewProps {
  employees: Employee[];
  constraints: OperationalConstraint[];
  schedules: WeeklySchedule[];
  settings: SystemSettings;
  onConfirmSchedule: (draft: DraftSchedule) => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, description?: string) => void;
}

export function GeneratorView({
  employees,
  constraints,
  schedules,
  settings,
  onConfirmSchedule,
  onNotify,
}: GeneratorViewProps) {
  const [weekStart, setWeekStart] = useState<string>(() => getMondayOfWeek(new Date()));
  const [shiftFilter, setShiftFilter] = useState<'all' | ShiftId>('all');
  const [draft, setDraft] = useState<DraftSchedule | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [previousSignatures, setPreviousSignatures] = useState<string[]>([]);
  const [randomSeed, setRandomSeed] = useState(0);
  const [hasValidatedCurrentDraft, setHasValidatedCurrentDraft] = useState(false);
  const [overwriteConfirmOpen, setOverwriteConfirmOpen] = useState(false);

  const existingConfirmedForWeek = useMemo(
    () => schedules.find((s) => s.weekStart === weekStart),
    [schedules, weekStart]
  );

  // Reset draft when changing reference week
  useEffect(() => {
    setDraft(null);
    setValidation(null);
    setPreviousSignatures([]);
    setRandomSeed(0);
    setHasValidatedCurrentDraft(false);
  }, [weekStart]);

  const weekDates = useMemo(() => getWeekDayDates(weekStart), [weekStart]);

  const handleGenerate = (isRandomize: boolean) => {
    if (employees.length === 0) {
      onNotify('error', 'Nenhum funcionário cadastrado', 'Cadastre funcionários antes de gerar a escala.');
      return;
    }

    const nextSeed = isRandomize ? randomSeed + 1 : 0;
    const historyForWeek = schedules.filter((s) => s.weekStart !== weekStart);
    const sigsToAvoid = isRandomize ? previousSignatures : [];

    const outcome = generateIntelligentSchedule({
      weekStart,
      employees,
      constraints,
      history: historyForWeek,
      settings,
      previousSignatures: sigsToAvoid,
      randomSeed: nextSeed,
    });

    setValidation(outcome.validation);

    if (!outcome.success || !outcome.draft) {
      setDraft(null);
      setHasValidatedCurrentDraft(false);
      onNotify(
        'error',
        'Não foi possível gerar a escala',
        outcome.validation.errors[0]?.message || 'Verifique os conflitos de restrições abaixo.'
      );
      return;
    }

    const sig = computeDistributionSignature(outcome.draft.entries);
    setDraft(outcome.draft);
    setRandomSeed(nextSeed);
    setHasValidatedCurrentDraft(true);

    if (isRandomize) {
      setPreviousSignatures((prev) => (prev.includes(sig) ? prev : [...prev, sig]));
      if (outcome.noAlternativeSignature) {
        onNotify(
          'info',
          'Combinações válidas esgotadas',
          'Todas as variações válidas possíveis dentro das restrições já foram exibidas.'
        );
      } else {
        onNotify(
          'success',
          'Nova variação gerada',
          'Distribuição atualizada respeitando o regime 5x2 e todas as restrições.'
        );
      }
    } else {
      setPreviousSignatures([sig]);
      onNotify(
        'success',
        'Escala gerada automaticamente',
        `Rodízio 5x2 calculado para ${outcome.draft.entries.length} funcionário(s).`
      );
    }
  };

  const handleManualOffDayChange = (employeeId: string, newOffDay: WeekdayKey) => {
    if (!draft) return;

    const updatedEntries: ScheduleEntry[] = draft.entries.map((entry) => {
      if (entry.employeeId !== employeeId) return entry;
      return {
        ...entry,
        offDay: newOffDay,
        days: build5x2DaysMap(newOffDay),
      };
    });

    const historyForWeek = schedules.filter((s) => s.weekStart !== weekStart);
    const liveValidation = validateScheduleEntries(updatedEntries, constraints, historyForWeek, weekStart, settings);

    setDraft({
      ...draft,
      entries: updatedEntries,
      warnings: liveValidation.warnings.map((w) => w.message),
    });
    setValidation(liveValidation);
    setHasValidatedCurrentDraft(false); // Require explicit validation click after manual edit
  };

  const handleExplicitValidate = () => {
    if (!draft) return;
    const historyForWeek = schedules.filter((s) => s.weekStart !== weekStart);
    const res = validateScheduleEntries(draft.entries, constraints, historyForWeek, weekStart, settings);
    setValidation(res);
    setHasValidatedCurrentDraft(true);

    if (res.valid) {
      onNotify(
        'success',
        'Escala validada com sucesso',
        res.warnings.length > 0
          ? `Regra 5x2 e restrições obrigatórias atendidas (${res.warnings.length} aviso(s) informativo(s)).`
          : 'Todas as regras 5x2 e restrições operacionais foram atendidas.'
      );
    } else {
      onNotify(
        'error',
        'Escala com conflitos impeditivos',
        `${res.errors.length} erro(s) encontrado(s). Corrija antes de confirmar.`
      );
    }
  };

  const handleRequestConfirm = () => {
    if (!draft) return;
    const historyForWeek = schedules.filter((s) => s.weekStart !== weekStart);
    const res = validateScheduleEntries(draft.entries, constraints, historyForWeek, weekStart, settings);
    setValidation(res);
    setHasValidatedCurrentDraft(true);

    if (!res.valid) {
      onNotify('error', 'Não é possível confirmar', 'Corrija os erros de validação antes de salvar.');
      return;
    }

    if (existingConfirmedForWeek) {
      setOverwriteConfirmOpen(true);
      return;
    }

    onConfirmSchedule(draft);
  };

  const visibleEntries = useMemo(() => {
    if (!draft) return [];
    return draft.entries
      .filter((e) => (shiftFilter === 'all' ? true : e.shift === shiftFilter))
      .sort((a, b) => {
        if (a.shift !== b.shift) return a.shift.localeCompare(b.shift);
        return a.employeeName.localeCompare(b.employeeName, 'pt-BR');
      });
  }, [draft, shiftFilter]);

  const distributionSummary = useMemo(() => {
    const base: Record<WeekdayKey, { t01Off: number; t02Off: number; t01Work: number; t02Work: number }> = {
      seg: { t01Off: 0, t02Off: 0, t01Work: 0, t02Work: 0 },
      ter: { t01Off: 0, t02Off: 0, t01Work: 0, t02Work: 0 },
      qua: { t01Off: 0, t02Off: 0, t01Work: 0, t02Work: 0 },
      qui: { t01Off: 0, t02Off: 0, t01Work: 0, t02Work: 0 },
      sex: { t01Off: 0, t02Off: 0, t01Work: 0, t02Work: 0 },
      sab: { t01Off: 0, t02Off: 0, t01Work: 0, t02Work: 0 },
    };
    if (!draft) return base;
    for (const day of WORKDAYS_MON_SAT) {
      for (const entry of draft.entries) {
        if (entry.shift === '01') {
          if (entry.offDay === day) base[day].t01Off += 1;
          else base[day].t01Work += 1;
        } else {
          if (entry.offDay === day) base[day].t02Off += 1;
          else base[day].t02Work += 1;
        }
      }
    }
    return base;
  }, [draft]);

  const canConfirm = Boolean(draft && validation?.valid && hasValidatedCurrentDraft);

  return (
    <div className="space-y-5">
      {/* Week Selection & Main Actions Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label htmlFor="week-ref-date" className="block text-xs font-semibold text-slate-600 mb-1">
                Semana de referência (Segunda a Domingo)
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setWeekStart(addDaysIso(weekStart, -7))}
                  aria-label="Semana anterior"
                  className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <input
                  id="week-ref-date"
                  type="date"
                  value={weekStart}
                  onChange={(e) => {
                    if (e.target.value) setWeekStart(getMondayOfWeek(e.target.value));
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono text-slate-900 tabular-nums focus:border-emerald-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setWeekStart(addDaysIso(weekStart, 7))}
                  aria-label="Próxima semana"
                  className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="pt-4 sm:pt-5">
              <p className="text-sm font-semibold text-slate-900 tabular-nums">
                {formatWeekRangeBR(weekStart, getSundayOfWeek(weekStart))}
              </p>
              <p className="text-xs text-slate-500">
                {existingConfirmedForWeek
                  ? `Já existe escala confirmada (v${existingConfirmedForWeek.version}) para esta semana.`
                  : 'Nenhuma escala confirmada ainda para esta semana.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleGenerate(false)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Gerar escala automaticamente
            </button>

            <button
              type="button"
              disabled={!draft}
              onClick={() => handleGenerate(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
            >
              <RefreshCw className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              Randomizar novamente
            </button>

            <button
              type="button"
              disabled={!draft}
              onClick={handleExplicitValidate}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Validar escala
            </button>

            <button
              type="button"
              disabled={!canConfirm}
              onClick={handleRequestConfirm}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Confirmar e salvar
            </button>
          </div>
        </div>

        {/* Shift Filter & Rule Reminder */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex items-center rounded-lg bg-slate-100 p-1 self-start">
            {(
              [
                { id: 'all', label: `Todos os turnos (${employees.length})` },
                { id: '01', label: `Turno 01 (${employees.filter((e) => e.shift === '01').length})` },
                { id: '02', label: `Turno 02 (${employees.filter((e) => e.shift === '02').length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setShiftFilter(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap tabular-nums ${
                  shiftFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>
              Clique em qualquer dia de <strong>Seg a Sáb</strong> na tabela abaixo para alterar manualmente a folga de um funcionário.
            </span>
          </p>
        </div>
      </div>

      {/* Validation & Conflicts Panel */}
      {validation && (
        <div
          className={`rounded-xl border p-4 ${
            !validation.valid
              ? 'border-rose-200 bg-rose-50/70'
              : validation.warnings.length > 0
                ? 'border-amber-200 bg-amber-50/70'
                : 'border-emerald-200 bg-emerald-50/70'
          }`}
        >
          <div className="flex items-start gap-3">
            {!validation.valid ? (
              <XCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : validation.warnings.length > 0 ? (
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
            )}

            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {!validation.valid
                    ? `Conflitos detectados (${validation.errors.length} impedimento(s))`
                    : hasValidatedCurrentDraft
                      ? 'Escala validada e pronta para confirmação'
                      : 'Escala editada manualmente — clique em "Validar escala" antes de confirmar'}
                </p>
                {draft && validation.valid && !hasValidatedCurrentDraft && (
                  <button
                    type="button"
                    onClick={handleExplicitValidate}
                    className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-800"
                  >
                    Validar agora
                  </button>
                )}
              </div>

              {validation.errors.length > 0 && (
                <ul className="space-y-1.5 text-xs text-rose-900">
                  {validation.errors.map((err, idx) => (
                    <li key={idx}>
                      <span className="font-semibold">{err.message}</span>
                      {err.suggestion && (
                        <span className="block text-rose-700 mt-0.5">
                          Sugestão: {err.suggestion}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {validation.warnings.length > 0 && (
                <ul className="space-y-1 text-xs text-amber-900">
                  {validation.warnings.map((w, idx) => (
                    <li key={idx}>• {w.message}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Distribution Summary Strip when Draft exists */}
      {draft && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-xs font-semibold text-slate-700 mb-3">
            Resumo de distribuição de folgas e cobertura operacional (Segunda a Sábado)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {WORKDAYS_MON_SAT.map((day) => {
              const info = distributionSummary[day];
              return (
                <div key={day} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-900">
                    <span>{DAY_LABELS[day].short}</span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {weekDates[day].shortBR}
                    </span>
                  </div>
                  <div className="mt-2 space-y-0.5 text-[11px] text-slate-600 tabular-nums">
                    <p>
                      Turno 01: <strong className="text-orange-800">{info.t01Off} folga(s)</strong> · {info.t01Work} trab.
                    </p>
                    <p>
                      Turno 02: <strong className="text-orange-800">{info.t02Off} folga(s)</strong> · {info.t02Work} trab.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Draft Interactive Schedule Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {!draft ? (
          <div className="px-6 py-14 text-center">
            <Sparkles className="mx-auto h-9 w-9 text-emerald-600/70" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold text-slate-900">
              Pronto para gerar a escala 5x2
            </h2>
            <p className="mt-1 text-xs text-slate-500 max-w-lg mx-auto">
              Selecione a semana desejada e clique em <strong>Gerar escala automaticamente</strong>.
              O algoritmo analisará as últimas 8 semanas e aplicará o rodízio equilibrado de segunda a sábado
              (incluindo o sábado no rodízio), mantendo domingo como DSR fixo.
            </p>
            <button
              type="button"
              onClick={() => handleGenerate(false)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Gerar escala para {formatDateBR(weekStart)}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[820px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Funcionário</th>
                  <th className="px-3 py-3">Turno / Horário</th>
                  {ALL_DAYS.map((day) => (
                    <th key={day} className="px-2 py-3 text-center w-[98px]">
                      <div>{DAY_LABELS[day].short}</div>
                      <div className="text-[10px] font-mono font-normal text-slate-400 tabular-nums">
                        {weekDates[day].shortBR}
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center">Folga rotativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {visibleEntries.map((entry) => (
                  <tr key={entry.employeeId} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-slate-900 text-sm">{entry.employeeName}</p>
                        {entry.employeeRole.toLowerCase().includes('encarregad') && (
                          <Crown
                            className="h-4 w-4 text-emerald-600 shrink-0"
                            aria-label="Encarregado"
                          />
                        )}
                      </div>
                      <p className="text-slate-500">{entry.employeeRole}</p>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      <div className="font-semibold text-slate-900">Turno {entry.shift}</div>
                      <div className="text-[11px] text-slate-500">
                        {entry.weekdayHours.start}–{entry.weekdayHours.end}
                      </div>
                    </td>
                    {ALL_DAYS.map((day) => {
                      const status = entry.days[day];
                      const isEditableWorkday = day !== 'dom';
                      return (
                        <td key={day} className="px-1.5 py-2">
                          <ScheduleStatusCell
                            status={status}
                            interactive={isEditableWorkday}
                            onClick={
                              isEditableWorkday
                                ? () => handleManualOffDayChange(entry.employeeId, day as WeekdayKey)
                                : () =>
                                    onNotify(
                                      'warning',
                                      'Domingo é DSR fixo',
                                      'No regime 5x2, a folga rotativa só pode ser atribuída entre segunda e sábado.'
                                    )
                            }
                            title={
                              isEditableWorkday
                                ? `Clique para mover a folga de ${entry.employeeName} para ${DAY_LABELS[day].full}`
                                : 'Domingo: DSR fixo obrigatório'
                            }
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-center font-semibold text-orange-800 whitespace-nowrap">
                      {DAY_LABELS[entry.offDay].short} + Dom
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {draft && (
        <p className="text-xs text-slate-500 tabular-nums">
          Rascunho gerado em {formatDateTimeBR(draft.generatedAt)} · Regra aplicada: 5 dias de trabalho + 1 folga rotativa (Seg–Sáb) + 1 DSR fixo (Domingo).
        </p>
      )}

      <ConfirmModal
        open={overwriteConfirmOpen}
        title="Atualizar escala já confirmada"
        description={
          existingConfirmedForWeek
            ? `Já existe uma escala confirmada (Versão #${existingConfirmedForWeek.version}) para a semana ${formatWeekRangeBR(
                weekStart
              )}. Deseja salvar esta nova versão (#${existingConfirmedForWeek.version + 1}) mantendo o registro das alterações?`
            : ''
        }
        confirmLabel="Salvar nova versão"
        onCancel={() => setOverwriteConfirmOpen(false)}
        onConfirm={() => {
          if (draft) {
            onConfirmSchedule(draft);
            setOverwriteConfirmOpen(false);
          }
        }}
      />
    </div>
  );
}

import React, { useState } from 'react';
import { Pencil, Plus, ShieldAlert, Trash2, X } from 'lucide-react';
import {
  ConstraintType,
  DAY_LABELS,
  Employee,
  OperationalConstraint,
  ShiftId,
  WORKDAYS_MON_SAT,
  WeekdayKey,
} from '../types/domain';
import { generateUniqueId } from '../utils/dateUtils';
import { ConfirmModal } from './ui/ConfirmModal';

interface ConstraintsViewProps {
  constraints: OperationalConstraint[];
  employees: Employee[];
  onAddConstraint: (constraint: OperationalConstraint) => void;
  onUpdateConstraint: (constraint: OperationalConstraint) => void;
  onDeleteConstraint: (constraintId: string) => void;
}

const CONSTRAINT_TYPE_LABELS: Record<ConstraintType, string> = {
  coverage: 'Cobertura mínima / máxima por dia e turno',
  cannot_off_together: 'Não podem folgar juntos',
  must_off_together: 'Precisam folgar juntos',
  individual_forbidden_day: 'Restrição individual (proibido folgar)',
  individual_priority_day: 'Prioridade de folga para funcionário',
};

export function ConstraintsView({
  constraints,
  employees,
  onAddConstraint,
  onUpdateConstraint,
  onDeleteConstraint,
}: ConstraintsViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OperationalConstraint | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OperationalConstraint | null>(null);

  // Form fields
  const [type, setType] = useState<ConstraintType>('coverage');
  const [active, setActive] = useState(true);
  const [description, setDescription] = useState('');

  // Coverage fields
  const [shift, setShift] = useState<ShiftId>('01');
  const [coverageDay, setCoverageDay] = useState<WeekdayKey | 'all_weekdays'>('all_weekdays');
  const [minWorking, setMinWorking] = useState<string>('1');
  const [maxOff, setMaxOff] = useState<string>('');

  // Pair/group fields
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);

  // Individual day fields
  const [individualEmployeeId, setIndividualEmployeeId] = useState<string>('');
  const [individualDay, setIndividualDay] = useState<WeekdayKey>('seg');
  const [strictPriority, setStrictPriority] = useState(false);

  const [formError, setFormError] = useState('');

  const sortedEmployees = [...employees].sort((a, b) =>
    a.fullName.localeCompare(b.fullName, 'pt-BR')
  );

  const empNameById = new Map(employees.map((e) => [e.id, e.fullName]));

  const openCreateModal = () => {
    setEditing(null);
    setType('coverage');
    setActive(true);
    setDescription('');
    setShift('01');
    setCoverageDay('all_weekdays');
    setMinWorking('1');
    setMaxOff('');
    setSelectedEmployeeIds([]);
    setIndividualEmployeeId(sortedEmployees[0]?.id ?? '');
    setIndividualDay('seg');
    setStrictPriority(false);
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (c: OperationalConstraint) => {
    setEditing(c);
    setType(c.type);
    setActive(c.active);
    setDescription(c.description ?? '');
    setFormError('');

    if (c.type === 'coverage') {
      setShift(c.shift);
      setCoverageDay(c.day);
      setMinWorking(typeof c.minWorking === 'number' ? String(c.minWorking) : '');
      setMaxOff(typeof c.maxOff === 'number' ? String(c.maxOff) : '');
    } else if (c.type === 'cannot_off_together' || c.type === 'must_off_together') {
      setSelectedEmployeeIds(c.employeeIds);
    } else if (c.type === 'individual_forbidden_day' || c.type === 'individual_priority_day') {
      setIndividualEmployeeId(c.employeeId);
      setIndividualDay(c.day);
      setStrictPriority(Boolean(c.strict));
    }

    setModalOpen(true);
  };

  const toggleGroupEmployee = (empId: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const id = editing?.id ?? generateUniqueId('const');
    const createdAt = editing?.createdAt ?? new Date().toISOString();
    const cleanDesc = description.trim() || undefined;

    if (type === 'coverage') {
      const parsedMin = minWorking.trim() !== '' ? Number(minWorking) : undefined;
      const parsedMax = maxOff.trim() !== '' ? Number(maxOff) : undefined;
      if (parsedMin === undefined && parsedMax === undefined) {
        setFormError('Informe ao menos o mínimo trabalhando ou o máximo de folgas.');
        return;
      }
      if ((parsedMin !== undefined && parsedMin < 0) || (parsedMax !== undefined && parsedMax < 0)) {
        setFormError('Os valores de cobertura não podem ser negativos.');
        return;
      }

      const item: OperationalConstraint = {
        id,
        type: 'coverage',
        active,
        description: cleanDesc,
        createdAt,
        shift,
        day: coverageDay,
        minWorking: parsedMin,
        maxOff: parsedMax,
      };
      if (editing) onUpdateConstraint(item);
      else onAddConstraint(item);
      setModalOpen(false);
      return;
    }

    if (type === 'cannot_off_together' || type === 'must_off_together') {
      if (selectedEmployeeIds.length < 2) {
        setFormError('Selecione pelo menos 2 funcionários para esta regra.');
        return;
      }
      const item: OperationalConstraint = {
        id,
        type,
        active,
        description: cleanDesc,
        createdAt,
        employeeIds: selectedEmployeeIds,
      };
      if (editing) onUpdateConstraint(item);
      else onAddConstraint(item);
      setModalOpen(false);
      return;
    }

    if (!individualEmployeeId) {
      setFormError('Selecione um funcionário.');
      return;
    }

    const item: OperationalConstraint = {
      id,
      type,
      active,
      description: cleanDesc,
      createdAt,
      employeeId: individualEmployeeId,
      day: individualDay,
      strict: type === 'individual_priority_day' ? strictPriority : undefined,
    };

    if (editing) onUpdateConstraint(item);
    else onAddConstraint(item);
    setModalOpen(false);
  };

  const formatConstraintSummary = (c: OperationalConstraint): string => {
    if (c.type === 'coverage') {
      const dayText = c.day === 'all_weekdays' ? 'Segunda a Sábado' : DAY_LABELS[c.day].full;
      const parts: string[] = [];
      if (typeof c.minWorking === 'number') parts.push(`Mínimo ${c.minWorking} trabalhando`);
      if (typeof c.maxOff === 'number') parts.push(`Máximo ${c.maxOff} de folga`);
      return `Turno ${c.shift} · ${dayText} · ${parts.join(' e ')}`;
    }
    if (c.type === 'cannot_off_together' || c.type === 'must_off_together') {
      const names = c.employeeIds.map((id) => empNameById.get(id) ?? 'Funcionário removido');
      return names.join(', ');
    }
    if (c.type === 'individual_forbidden_day' || c.type === 'individual_priority_day') {
      const empName = empNameById.get(c.employeeId) ?? 'Funcionário removido';
      if (c.type === 'individual_forbidden_day') {
        return `${empName} não pode folgar na ${DAY_LABELS[c.day].full}`;
      }
      return `${empName} tem prioridade na ${DAY_LABELS[c.day].full} (${
        c.strict ? 'Obrigatória' : 'Preferencial'
      })`;
    }
    return '';
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Restrições operacionais da escala</h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure limites mínimos de equipe por turno, combinações de funcionários e prioridades individuais.
            O gerador 5x2 respeita todas as restrições ativas antes de validar a escala.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nova restrição
        </button>
      </div>

      {/* Constraints List */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {constraints.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              Nenhuma restrição operacional cadastrada
            </p>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Mesmo sem restrições adicionais, o algoritmo sempre aplica a regra obrigatória 5x2
              (domingo DSR fixo e 1 folga rotativa de segunda a sábado).
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {constraints.map((c) => (
              <div
                key={c.id}
                className={`p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  !c.active ? 'bg-slate-50/70 opacity-75' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-emerald-800">
                      {CONSTRAINT_TYPE_LABELS[c.type]}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className={c.active ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                      {c.active ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {formatConstraintSummary(c)}
                  </p>
                  {c.description && (
                    <p className="mt-0.5 text-xs text-slate-500">{c.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onUpdateConstraint({ ...c, active: !c.active })}
                    className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      c.active
                        ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    {c.active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(c)}
                    aria-label="Editar restrição"
                    className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(c)}
                    aria-label="Excluir restrição"
                    className="rounded-md border border-slate-200 bg-white p-1.5 text-rose-600 hover:bg-rose-50 hover:border-rose-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="constraint-modal-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 id="constraint-modal-title" className="text-base font-semibold text-slate-900">
                {editing ? 'Editar restrição' : 'Nova restrição operacional'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Fechar"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto">
              {formError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {formError}
                </p>
              )}

              <div>
                <label htmlFor="c-type" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Tipo de restrição
                </label>
                <select
                  id="c-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as ConstraintType)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                >
                  {Object.entries(CONSTRAINT_TYPE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {type === 'coverage' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="c-shift" className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Turno
                      </label>
                      <select
                        id="c-shift"
                        value={shift}
                        onChange={(e) => setShift(e.target.value as ShiftId)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="01">Turno 01</option>
                        <option value="02">Turno 02</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="c-cov-day" className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Dia útil aplicado
                      </label>
                      <select
                        id="c-cov-day"
                        value={coverageDay}
                        onChange={(e) => setCoverageDay(e.target.value as WeekdayKey | 'all_weekdays')}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="all_weekdays">Todos os dias do rodízio (Seg a Sáb)</option>
                        {WORKDAYS_MON_SAT.map((d) => (
                          <option key={d} value={d}>
                            {DAY_LABELS[d].full}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="c-min-work" className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Mínimo trabalhando
                      </label>
                      <input
                        id="c-min-work"
                        type="number"
                        min={0}
                        value={minWorking}
                        onChange={(e) => setMinWorking(e.target.value)}
                        placeholder="Ex.: 3"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                      />
                    </div>
                    <div>
                      <label htmlFor="c-max-off" className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Máximo de folgas
                      </label>
                      <input
                        id="c-max-off"
                        type="number"
                        min={0}
                        value={maxOff}
                        onChange={(e) => setMaxOff(e.target.value)}
                        placeholder="Ex.: 1"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              )}

              {(type === 'cannot_off_together' || type === 'must_off_together') && (
                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-2">
                    Selecione os funcionários ({selectedEmployeeIds.length} selecionado(s))
                  </span>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                    {sortedEmployees.map((emp) => {
                      const checked = selectedEmployeeIds.includes(emp.id);
                      return (
                        <label
                          key={emp.id}
                          className="flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleGroupEmployee(emp.id)}
                              className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                            />
                            <span className="truncate font-medium text-slate-800">{emp.fullName}</span>
                          </div>
                          <span className="text-xs text-slate-500 shrink-0 ml-2">
                            {emp.role} · T{emp.shift}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {(type === 'individual_forbidden_day' || type === 'individual_priority_day') && (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="c-emp" className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Funcionário
                    </label>
                    <select
                      id="c-emp"
                      value={individualEmployeeId}
                      onChange={(e) => setIndividualEmployeeId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      {sortedEmployees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.fullName} ({emp.role} · Turno {emp.shift})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="c-ind-day" className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Dia da semana (Segunda a Sábado)
                    </label>
                    <select
                      id="c-ind-day"
                      value={individualDay}
                      onChange={(e) => setIndividualDay(e.target.value as WeekdayKey)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      {WORKDAYS_MON_SAT.map((d) => (
                        <option key={d} value={d}>
                          {DAY_LABELS[d].full}
                        </option>
                      ))}
                    </select>
                  </div>

                  {type === 'individual_priority_day' && (
                    <label className="flex items-center gap-2.5 text-xs text-slate-700 pt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={strictPriority}
                        onChange={(e) => setStrictPriority(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                      />
                      <span>
                        Prioridade obrigatória (se desmarcado, funciona como preferência prioritária)
                      </span>
                    </label>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="c-desc" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Observação (opcional)
                </label>
                <input
                  id="c-desc"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex.: Dia de entrega de hortifruti ou pico de movimento"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                />
                Restrição ativa
              </label>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                >
                  Salvar restrição
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        variant="danger"
        title="Excluir restrição"
        description="Tem certeza que deseja remover esta restrição operacional? As próximas escalas geradas não considerarão mais esta regra."
        confirmLabel="Excluir"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteConstraint(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}

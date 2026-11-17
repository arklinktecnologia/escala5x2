import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Crown,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Employee, ShiftId } from '../types/domain';
import { ConfirmModal } from './ui/ConfirmModal';
import { generateUniqueId } from '../utils/dateUtils';

const PAGE_SIZE = 15;
const ALLOWED_ROLES = ['Fiscal de Caixa', 'Operador de Caixa', 'Empacotador', 'Recepção'] as const;

interface EmployeesViewProps {
  employees: Employee[];
  availableRoles: string[];
  onAddEmployee: (employee: Employee) => void;
  onUpdateEmployee: (employee: Employee) => void;
  onDeleteEmployee: (employeeId: string) => void;
  onTransferShift: (employeeId: string, targetShift: ShiftId) => void;
}

export function EmployeesView({
  employees,
  availableRoles,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onTransferShift,
}: EmployeesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [shiftFilter, setShiftFilter] = useState<'all' | ShiftId>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [shift, setShift] = useState<ShiftId>('01');
  const [formError, setFormError] = useState('');

  const roleOptions = useMemo(() => {
    const base: string[] = [...ALLOWED_ROLES];
    if (editingEmployee && !base.includes(editingEmployee.role)) {
      return [editingEmployee.role, ...base];
    }
    return base;
  }, [editingEmployee]);

  // Confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [transferTarget, setTransferTarget] = useState<Employee | null>(null);

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...employees]
      .filter((emp) => {
        if (shiftFilter !== 'all' && emp.shift !== shiftFilter) return false;
        if (q && !emp.fullName.toLowerCase().includes(q) && !emp.role.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));
  }, [employees, searchQuery, shiftFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedEmployees = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredAndSorted.slice(start, start + PAGE_SIZE);
  }, [filteredAndSorted, safePage]);

  const openCreateModal = () => {
    setEditingEmployee(null);
    setFullName('');
    setRole('Operador de Caixa');
    setShift('01');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setFullName(emp.fullName);
    setRole(emp.role);
    setShift(emp.shift);
    setFormError('');
    setModalOpen(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = fullName.trim();
    const cleanRole = role.trim();

    if (!cleanName) {
      setFormError('Informe o nome completo do funcionário.');
      return;
    }
    if (!cleanRole) {
      setFormError('Informe a função do funcionário.');
      return;
    }

    const now = new Date().toISOString();
    if (editingEmployee) {
      onUpdateEmployee({
        ...editingEmployee,
        fullName: cleanName,
        role: cleanRole,
        shift,
        updatedAt: now,
      });
    } else {
      onAddEmployee({
        id: generateUniqueId('emp'),
        fullName: cleanName,
        role: cleanRole,
        shift,
        createdAt: now,
        updatedAt: now,
      });
    }

    setModalOpen(false);
  };

  const shift01Count = employees.filter((e) => e.shift === '01').length;
  const shift02Count = employees.filter((e) => e.shift === '02').length;

  return (
    <div className="space-y-5">
      {/* Toolbar & Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Pesquisar funcionário por nome..."
                aria-label="Pesquisar funcionário por nome"
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            {/* Segmented Filter */}
            <div className="inline-flex items-center rounded-lg bg-slate-100 p-1 self-start">
              {(
                [
                  { id: 'all', label: `Todos (${employees.length})` },
                  { id: '01', label: `Turno 01 (${shift01Count})` },
                  { id: '02', label: `Turno 02 (${shift02Count})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setShiftFilter(tab.id);
                    setCurrentPage(1);
                  }}
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
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Adicionar funcionário
          </button>
        </div>
      </div>

      {/* Employee Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3">Nome completo</th>
                <th className="px-4 py-3">Função</th>
                <th className="px-4 py-3">Turno</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {paginatedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    Nenhum funcionário encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                paginatedEmployees.map((emp) => {
                  const targetShift: ShiftId = emp.shift === '01' ? '02' : '01';
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{emp.fullName}</span>
                          {emp.role.toLowerCase().includes('encarregad') && (
                            <Crown
                              className="h-4 w-4 text-emerald-600 shrink-0"
                              aria-label="Encarregado"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{emp.role}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800 tabular-nums">
                        Turno {emp.shift}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setTransferTarget(emp)}
                            title={`Transferir para Turno ${targetShift}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 whitespace-nowrap"
                          >
                            <ArrowLeftRight className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                            <span className="hidden sm:inline">Turno {targetShift}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(emp)}
                            aria-label={`Editar ${emp.fullName}`}
                            title="Editar funcionário"
                            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(emp)}
                            aria-label={`Excluir ${emp.fullName}`}
                            title="Excluir funcionário"
                            className="rounded-md border border-slate-200 bg-white p-1.5 text-rose-600 hover:bg-rose-50 hover:border-rose-200"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar (15 per page) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-600">
          <p className="tabular-nums">
            Exibindo{' '}
            <strong className="text-slate-900">
              {filteredAndSorted.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}
            </strong>
            –
            <strong className="text-slate-900">
              {Math.min(safePage * PAGE_SIZE, filteredAndSorted.length)}
            </strong>{' '}
            de <strong className="text-slate-900">{filteredAndSorted.length}</strong> funcionário(s)
            (ordem alfabética · até 15 por página)
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Anterior
            </button>
            <span className="font-mono tabular-nums px-2">
              Página {safePage} de {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none"
            >
              Próxima
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Add/Edit Employee Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="emp-modal-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 id="emp-modal-title" className="text-base font-semibold text-slate-900">
                {editingEmployee ? 'Editar funcionário' : 'Cadastrar funcionário'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Fechar modal"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-5 space-y-4">
              {formError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {formError}
                </p>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="emp-fullname" className="block text-xs font-semibold text-slate-700">
                    Nome completo *
                  </label>
                  {role.toLowerCase().includes('encarregad') && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <Crown className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
                      <span>{role}</span>
                    </span>
                  )}
                </div>
                <div className="relative flex items-center">
                  <input
                    id="emp-fullname"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ex.: Maria Clara Oliveira"
                    className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 ${
                      role.toLowerCase().includes('encarregad') ? 'pr-9' : ''
                    }`}
                  />
                  {role.toLowerCase().includes('encarregad') && (
                    <Crown
                      className="h-4 w-4 text-emerald-600 shrink-0 absolute right-3 pointer-events-none"
                      aria-label="Encarregado"
                    />
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="emp-role" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Função *
                </label>
                <select
                  id="emp-role"
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                >
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="emp-shift" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Turno *
                </label>
                <select
                  id="emp-shift"
                  required
                  value={shift}
                  onChange={(e) => setShift(e.target.value as ShiftId)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                >
                  <option value="01">Turno 01 (Manhã/Tarde)</option>
                  <option value="02">Turno 02 (Tarde/Noite)</option>
                </select>
              </div>

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
                  {editingEmployee ? 'Salvar alterações' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        variant="danger"
        title="Excluir funcionário"
        description={
          deleteTarget
            ? `Tem certeza que deseja excluir ${deleteTarget.fullName} (${deleteTarget.role}, Turno ${deleteTarget.shift})? As escalas históricas já confirmadas permanecerão preservadas.`
            : ''
        }
        confirmLabel="Excluir funcionário"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteEmployee(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />

      {/* Shift Transfer Confirmation Modal */}
      <ConfirmModal
        open={Boolean(transferTarget)}
        title="Transferir funcionário de turno"
        description={
          transferTarget
            ? `Deseja transferir ${transferTarget.fullName} do Turno ${transferTarget.shift} para o Turno ${
                transferTarget.shift === '01' ? '02' : '01'
              }? A alteração será aplicada automaticamente nas próximas escalas sem modificar escalas já confirmadas.`
            : ''
        }
        confirmLabel="Confirmar transferência"
        onCancel={() => setTransferTarget(null)}
        onConfirm={() => {
          if (transferTarget) {
            const nextShift: ShiftId = transferTarget.shift === '01' ? '02' : '01';
            onTransferShift(transferTarget.id, nextShift);
            setTransferTarget(null);
          }
        }}
      />
    </div>
  );
}

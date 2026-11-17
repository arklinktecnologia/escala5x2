import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import {
  AppDatabase,
  DraftSchedule,
  Employee,
  NavigationSection,
  OperationalConstraint,
  ShiftId,
  SystemSettings,
  ToastMessage,
  WeeklySchedule,
} from './types/domain';
import { defaultRepository } from './storage/repository';
import { createInitialDatabase } from './storage/seed';
import { computeScheduleChanges } from './engine/scheduler';
import { formatWeekRangeBR, generateUniqueId } from './utils/dateUtils';
import { LayoutShell } from './components/LayoutShell';
import { ToastContainer } from './components/ui/ToastContainer';
import { DashboardView } from './components/DashboardView';
import { EmployeesView } from './components/EmployeesView';
import { GeneratorView } from './components/GeneratorView';
import { WeeklyScheduleView } from './components/WeeklyScheduleView';
import { HistoryView } from './components/HistoryView';
import { ConstraintsView } from './components/ConstraintsView';
import { SettingsView } from './components/SettingsView';
import { BackupView } from './components/BackupView';

export default function App() {
  const [database, setDatabase] = useState<AppDatabase>(() => {
    const result = defaultRepository.load();
    return result.data ?? createInitialDatabase();
  });

  const [activeSection, setActiveSection] = useState<NavigationSection>('dashboard');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (type: ToastMessage['type'], title: string, description?: string) => {
      const id = generateUniqueId('toast');
      setToasts((prev) => [...prev.slice(-3), { id, type, title, description }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  // Surface any storage recovery issue once on mount
  useEffect(() => {
    const initialLoad = defaultRepository.load();
    if (!initialLoad.ok && initialLoad.error) {
      notify('warning', 'Recuperação automática do armazenamento', initialLoad.error);
    }
  }, [notify]);

  const persistDatabase = useCallback(
    (updater: (prev: AppDatabase) => AppDatabase, successToast?: { title: string; description?: string }) => {
      setDatabase((prev) => {
        const next = updater(prev);
        const saveRes = defaultRepository.save(next);
        if (!saveRes.ok) {
          notify('error', 'Erro ao salvar dados', saveRes.error);
          return prev;
        }
        if (successToast) {
          notify('success', successToast.title, successToast.description);
        }
        return saveRes.data ?? next;
      });
    },
    [notify]
  );

  // Employee handlers
  const handleAddEmployee = (emp: Employee) => {
    persistDatabase(
      (prev) => ({
        ...prev,
        employees: [...prev.employees, emp],
      }),
      {
        title: 'Funcionário cadastrado',
        description: `${emp.fullName} adicionado(a) ao Turno ${emp.shift}.`,
      }
    );
  };

  const handleUpdateEmployee = (updated: Employee) => {
    persistDatabase(
      (prev) => ({
        ...prev,
        employees: prev.employees.map((e) => (e.id === updated.id ? updated : e)),
      }),
      {
        title: 'Cadastro atualizado',
        description: `Dados de ${updated.fullName} atualizados para as próximas escalas.`,
      }
    );
  };

  const handleDeleteEmployee = (employeeId: string) => {
    const target = database.employees.find((e) => e.id === employeeId);
    persistDatabase(
      (prev) => ({
        ...prev,
        employees: prev.employees.filter((e) => e.id !== employeeId),
      }),
      {
        title: 'Funcionário excluído',
        description: target
          ? `${target.fullName} removido(a). Histórico confirmado permanece preservado.`
          : undefined,
      }
    );
  };

  const handleTransferShift = (employeeId: string, targetShift: ShiftId) => {
    const target = database.employees.find((e) => e.id === employeeId);
    if (!target) return;
    persistDatabase(
      (prev) => ({
        ...prev,
        employees: prev.employees.map((e) =>
          e.id === employeeId
            ? { ...e, shift: targetShift, updatedAt: new Date().toISOString() }
            : e
        ),
      }),
      {
        title: 'Transferência realizada',
        description: `${target.fullName} transferido(a) para o Turno ${targetShift} nas próximas escalas.`,
      }
    );
  };

  // Constraint handlers
  const handleAddConstraint = (constraint: OperationalConstraint) => {
    persistDatabase(
      (prev) => ({
        ...prev,
        constraints: [...prev.constraints, constraint],
      }),
      {
        title: 'Restrição adicionada',
        description: 'A regra será aplicada nas próximas gerações e validações.',
      }
    );
  };

  const handleUpdateConstraint = (updated: OperationalConstraint) => {
    persistDatabase(
      (prev) => ({
        ...prev,
        constraints: prev.constraints.map((c) => (c.id === updated.id ? updated : c)),
      }),
      {
        title: 'Restrição atualizada',
      }
    );
  };

  const handleDeleteConstraint = (constraintId: string) => {
    persistDatabase(
      (prev) => ({
        ...prev,
        constraints: prev.constraints.filter((c) => c.id !== constraintId),
      }),
      {
        title: 'Restrição removida',
      }
    );
  };

  // Schedule Confirmation Handler
  const handleConfirmSchedule = (draft: DraftSchedule) => {
    const existingForWeek = database.schedules
      .filter((s) => s.weekStart === draft.weekStart)
      .sort((a, b) => b.version - a.version)[0];

    const previousWeek = [...database.schedules]
      .filter((s) => s.weekStart < draft.weekStart)
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];

    const comparisonBase = existingForWeek ?? previousWeek;
    const changes = computeScheduleChanges(draft.entries, comparisonBase);

    const supervisorShift01 =
      database.employees.find(
        (e) => e.shift === '01' && e.role.toLowerCase().includes('encarregad')
      )?.fullName ??
      database.employees.find((e) => e.shift === '01')?.fullName ??
      'Kaleby Fabrete';

    const supervisorShift02 =
      database.employees.find(
        (e) => e.shift === '02' && e.role.toLowerCase().includes('encarregad')
      )?.fullName ??
      database.employees.find((e) => e.shift === '02')?.fullName ??
      'Eduarda Pancieri';

    const nextVersion = existingForWeek ? existingForWeek.version + 1 : 1;

    const confirmed: WeeklySchedule = {
      id: generateUniqueId('sch'),
      weekStart: draft.weekStart,
      weekEnd: draft.weekEnd,
      version: nextVersion,
      generatedAt: draft.generatedAt,
      confirmedAt: new Date().toISOString(),
      status: 'confirmed',
      entries: JSON.parse(JSON.stringify(draft.entries)),
      supervisorShift01,
      supervisorShift02,
      changesFromPrevious: changes,
    };

    persistDatabase(
      (prev) => {
        // Keep all previous historical weeks intact; if replacing current week's active pointer, keep previous versions or replace same weekStart?
        // Prompt says: "Ao confirmar, salvar a versão da escala e registrar a data de geração. Não alterar automaticamente escalas já confirmadas..."
        // Keeping older versions OR storing all versions: let's keep prior versions in history if desired, OR replace only if same week?
        // Actually keeping all confirmed versions (or replacing while preserving older versions) — wait: in WeeklyScheduleView & Dashboard, having 1 active latest version per weekStart or showing version number is super clean! Let's replace same-week only? Wait: "Armazenar todas as escalas confirmadas... Identificar alterações". Keeping previous versions too or keeping latest per week + history?
        // Wait: if we keep all confirmed records and Dashboard/Weekly uses the latest version for a given weekStart, while History shows all confirmed versions, nothing is ever lost! Let's check: in Dashboard/Weekly/Scheduler, if we keep only the latest version per weekStart OR keep all versions and deduplicate by latest version in rotation analysis:
        // Deduplicating by latest version per weekStart in scheduler/weekly while preserving every confirmed record in History is the cleanest and safest design!
        const retained = [...prev.schedules, confirmed];
        return {
          ...prev,
          schedules: retained,
        };
      },
      {
        title: `Escala confirmada (v${nextVersion})`,
        description: `Semana ${formatWeekRangeBR(draft.weekStart, draft.weekEnd)} salva no histórico.`,
      }
    );

    setActiveSection('weekly');
  };

  // Settings handler
  const handleSaveSettings = (nextSettings: SystemSettings) => {
    persistDatabase(
      (prev) => ({
        ...prev,
        settings: nextSettings,
      }),
      {
        title: 'Configurações salvas',
        description: 'Horários dos turnos e parâmetros atualizados para as próximas escalas.',
      }
    );
  };

  // Backup / Reset handlers
  const handleRestoreDatabase = (restoredDb: AppDatabase) => {
    const saveRes = defaultRepository.save(restoredDb);
    if (!saveRes.ok) {
      notify('error', 'Falha ao restaurar backup', saveRes.error);
      return;
    }
    setDatabase(saveRes.data ?? restoredDb);
    notify('success', 'Backup restaurado', 'Todos os dados do arquivo JSON foram carregados.');
  };

  const handleResetFactory = () => {
    const res = defaultRepository.resetToInitial();
    if (!res.ok || !res.data) {
      notify('error', 'Erro ao reiniciar', res.error);
      return;
    }
    setDatabase(res.data);
    notify(
      'info',
      'Sistema reiniciado',
      'Dados iniciais restaurados (Kaleby Fabrete — Turno 01 e Eduarda Pancieri — Turno 02).'
    );
  };

  // Latest confirmed schedule per weekStart for Dashboard / Weekly view / 8-week analyzer
  const latestSchedulesByWeek = Object.values(
    database.schedules.reduce<Record<string, WeeklySchedule>>((acc, s) => {
      const existing = acc[s.weekStart];
      if (!existing || s.version > existing.version) {
        acc[s.weekStart] = s;
      }
      return acc;
    }, {})
  );

  const headerAction =
    activeSection !== 'generator' ? (
      <button
        type="button"
        onClick={() => setActiveSection('generator')}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap"
      >
        <CalendarPlus className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Gerar escala 5x2</span>
        <span className="sm:hidden">Gerar</span>
      </button>
    ) : undefined;

  return (
    <>
      <LayoutShell
        activeSection={activeSection}
        onNavigate={setActiveSection}
        companyName={database.settings.companyName}
        headerAction={headerAction}
      >
        {activeSection === 'dashboard' && (
          <DashboardView
            employees={database.employees}
            schedules={latestSchedulesByWeek}
            constraints={database.constraints}
            settings={database.settings}
            onNavigate={setActiveSection}
          />
        )}

        {activeSection === 'employees' && (
          <EmployeesView
            employees={database.employees}
            availableRoles={database.settings.roles}
            onAddEmployee={handleAddEmployee}
            onUpdateEmployee={handleUpdateEmployee}
            onDeleteEmployee={handleDeleteEmployee}
            onTransferShift={handleTransferShift}
          />
        )}

        {activeSection === 'generator' && (
          <GeneratorView
            employees={database.employees}
            constraints={database.constraints}
            schedules={latestSchedulesByWeek}
            settings={database.settings}
            onConfirmSchedule={handleConfirmSchedule}
            onNotify={notify}
          />
        )}

        {activeSection === 'weekly' && (
          <WeeklyScheduleView
            schedules={latestSchedulesByWeek}
            settings={database.settings}
            onNavigate={setActiveSection}
            onNotify={notify}
          />
        )}

        {activeSection === 'history' && (
          <HistoryView
            schedules={database.schedules}
            employees={database.employees}
            settings={database.settings}
            onNotify={notify}
          />
        )}

        {activeSection === 'constraints' && (
          <ConstraintsView
            constraints={database.constraints}
            employees={database.employees}
            onAddConstraint={handleAddConstraint}
            onUpdateConstraint={handleUpdateConstraint}
            onDeleteConstraint={handleDeleteConstraint}
          />
        )}

        {activeSection === 'settings' && (
          <SettingsView
            settings={database.settings}
            onSaveSettings={handleSaveSettings}
            onNotify={notify}
          />
        )}

        {activeSection === 'backup' && (
          <BackupView
            database={database}
            onRestoreDatabase={handleRestoreDatabase}
            onResetFactory={handleResetFactory}
            onNotify={notify}
          />
        )}
      </LayoutShell>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

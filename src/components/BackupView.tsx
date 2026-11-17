import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, RotateCcw, Upload } from 'lucide-react';
import { AppDatabase } from '../types/domain';
import { defaultRepository } from '../storage/repository';
import { formatDateTimeBR, toIsoDate } from '../utils/dateUtils';
import { ConfirmModal } from './ui/ConfirmModal';

interface BackupViewProps {
  database: AppDatabase;
  onRestoreDatabase: (nextDb: AppDatabase) => void;
  onResetFactory: () => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, description?: string) => void;
}

interface PendingImportPreview {
  database: AppDatabase;
  exportedAt?: string;
  fileName: string;
}

export function BackupView({
  database,
  onRestoreDatabase,
  onResetFactory,
  onNotify,
}: BackupViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImportPreview | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const handleExportJson = () => {
    try {
      const jsonContent = defaultRepository.exportBackupJson(database);
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `casagrande-escalas-backup-${toIsoDate(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onNotify('success', 'Backup exportado', 'Arquivo JSON salvo com todos os dados do sistema.');
    } catch (err) {
      onNotify(
        'error',
        'Erro ao exportar backup',
        err instanceof Error ? err.message : 'Falha desconhecida.'
      );
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = defaultRepository.parseBackupJson(text);
      if (!parsed.valid || !parsed.database) {
        onNotify('error', 'Arquivo de backup inválido', parsed.error || 'Estrutura incompatível.');
        return;
      }

      setPendingImport({
        database: parsed.database,
        exportedAt: parsed.exportedAt,
        fileName: file.name,
      });
    } catch {
      onNotify('error', 'Erro na leitura do arquivo', 'Não foi possível ler o arquivo selecionado.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Storage Summary */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="pb-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            Resumo dos dados armazenados localmente
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            Última gravação: {formatDateTimeBR(database.updatedAt)} · Versão da estrutura: v{database.schemaVersion}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-medium text-slate-500">Funcionários ativos</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {database.employees.length}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-medium text-slate-500">Escalas confirmadas no histórico</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {database.schedules.length}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-medium text-slate-500">Restrições operacionais</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {database.constraints.length}
            </p>
          </div>
        </div>
      </section>

      {/* Export and Import Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Exportar backup (JSON)</h2>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Gera um arquivo JSON completo contendo todos os funcionários, turnos, horários,
              restrições, configurações e o histórico de escalas confirmadas. Recomendado realizar
              antes de limpar dados do navegador ou migrar de computador.
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Baixar backup em JSON
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Restaurar backup (JSON)</h2>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Selecione um arquivo JSON exportado anteriormente pelo sistema. Os dados serão
              validados antes da substituição para evitar corrupção do armazenamento.
            </p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
              id="backup-file-input"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              Selecionar arquivo JSON
            </button>
          </div>
        </section>
      </div>

      {/* Preview Pending Import */}
      {pendingImport && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-900">
                Backup validado: {pendingImport.fileName}
              </h3>
              <p className="mt-1 text-xs text-slate-700 tabular-nums">
                {pendingImport.exportedAt
                  ? `Exportado em ${formatDateTimeBR(pendingImport.exportedAt)} · `
                  : ''}
                {pendingImport.database.employees.length} funcionário(s) ·{' '}
                {pendingImport.database.schedules.length} escala(s) no histórico ·{' '}
                {pendingImport.database.constraints.length} restrição(ões)
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onRestoreDatabase(pendingImport.database);
                    setPendingImport(null);
                  }}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  Confirmar restauração
                </button>
                <button
                  type="button"
                  onClick={() => setPendingImport(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Factory Reset Zone */}
      <section className="rounded-xl border border-rose-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Restaurar estado inicial do sistema
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Remove escalas, restrições e cadastros manuais, mantendo apenas os responsáveis iniciais
              (Kaleby Fabrete — Turno 01 e Eduarda Pancieri — Turno 02).
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setResetModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 whitespace-nowrap shrink-0 self-start sm:self-center"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reiniciar dados iniciais
        </button>
      </section>

      <ConfirmModal
        open={resetModalOpen}
        variant="danger"
        title="Reiniciar todos os dados?"
        description="Esta ação apagará permanentemente todas as escalas confirmadas, restrições e funcionários cadastrados manualmente neste navegador, retornando apenas aos responsáveis iniciais."
        confirmLabel="Sim, reiniciar dados"
        onCancel={() => setResetModalOpen(false)}
        onConfirm={() => {
          onResetFactory();
          setResetModalOpen(false);
        }}
      />
    </div>
  );
}

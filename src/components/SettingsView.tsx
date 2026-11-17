import React, { useState } from 'react';
import { CheckCircle2, Play, RotateCcw, Save, XCircle } from 'lucide-react';
import { SystemSettings } from '../types/domain';
import { DEFAULT_SETTINGS } from '../storage/seed';
import { runAllSchedulingTests, SelfTestResult } from '../engine/selfTests';

interface SettingsViewProps {
  settings: SystemSettings;
  onSaveSettings: (nextSettings: SystemSettings) => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, description?: string) => void;
}

export function SettingsView({ settings, onSaveSettings, onNotify }: SettingsViewProps) {
  const [formState, setFormState] = useState<SystemSettings>(() =>
    JSON.parse(JSON.stringify(settings)) as SystemSettings
  );
  const [testResults, setTestResults] = useState<SelfTestResult[] | null>(null);

  const updateShiftTime = (
    shiftId: '01' | '02',
    period: 'weekdayHours' | 'saturdayHours',
    field: 'start' | 'end',
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      shifts: {
        ...prev.shifts,
        [shiftId]: {
          ...prev.shifts[shiftId],
          [period]: {
            ...prev.shifts[shiftId][period],
            [field]: value,
          },
        },
      },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formState);
  };

  const handleRestoreDefaultHours = () => {
    setFormState((prev) => ({
      ...prev,
      shifts: JSON.parse(JSON.stringify(DEFAULT_SETTINGS.shifts)),
    }));
    onNotify(
      'info',
      'Horários padrão carregados',
      'Clique em "Salvar configurações" para confirmar os horários originais.'
    );
  };

  const handleRunSelfTests = () => {
    const results = runAllSchedulingTests();
    setTestResults(results);
    const passedCount = results.filter((r) => r.passed).length;
    if (passedCount === results.length) {
      onNotify(
        'success',
        'Todos os testes passaram',
        `${passedCount} de ${results.length} verificações do regime 5x2 aprovadas.`
      );
    } else {
      onNotify(
        'error',
        'Falha em verificação',
        `${passedCount} de ${results.length} testes passaram.`
      );
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Shift Times Configuration */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Configuração dos turnos e horários (24h)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Domingo permanece permanentemente configurado como DSR fixo para toda a equipe.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRestoreDefaultHours}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 self-start"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Restaurar horários padrão
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {(['01', '02'] as const).map((shiftId) => {
              const s = formState.shifts[shiftId];
              return (
                <div key={shiftId} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900">Turno {shiftId}</h3>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-2">
                        Segunda a Sexta-feira
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">Entrada</label>
                          <input
                            type="time"
                            required
                            value={s.weekdayHours.start}
                            onChange={(e) =>
                              updateShiftTime(shiftId, 'weekdayHours', 'start', e.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">Saída</label>
                          <input
                            type="time"
                            required
                            value={s.weekdayHours.end}
                            onChange={(e) =>
                              updateShiftTime(shiftId, 'weekdayHours', 'end', e.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono tabular-nums"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-2">Sábado</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">Entrada</label>
                          <input
                            type="time"
                            required
                            value={s.saturdayHours.start}
                            onChange={(e) =>
                              updateShiftTime(shiftId, 'saturdayHours', 'start', e.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">Saída</label>
                          <input
                            type="time"
                            required
                            value={s.saturdayHours.end}
                            onChange={(e) =>
                              updateShiftTime(shiftId, 'saturdayHours', 'end', e.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono tabular-nums"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor={`cfg-min-work-${shiftId}`}
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Cobertura mínima operacional (mín. trabalhando/dia)
                      </label>
                      <input
                        id={`cfg-min-work-${shiftId}`}
                        type="number"
                        min={0}
                        value={s.minWorking ?? 0}
                        onChange={(e) => {
                          const val = Math.max(0, Math.floor(Number(e.target.value) || 0));
                          setFormState((prev) => ({
                            ...prev,
                            shifts: {
                              ...prev.shifts,
                              [shiftId]: {
                                ...prev.shifts[shiftId],
                                minWorking: val,
                              },
                            },
                          }));
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono tabular-nums"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Use 0 para não impor mínimo fixo (ou defina o mínimo de colaboradores presentes de Seg a Sáb).
                      </p>
                    </div>

                    <p className="text-xs text-slate-500 pt-1">
                      Domingo: <strong>DSR fixo obrigatório</strong> (não editável no regime 5x2).
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Roles & General Settings */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">
              Funções cadastradas e parâmetros gerais
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sugestões de funções exibidas no cadastro de funcionários e identificação da unidade.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cfg-company" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nome do estabelecimento
              </label>
              <input
                id="cfg-company"
                type="text"
                required
                value={formState.companyName}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, companyName: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="cfg-retention" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Retenção mínima de histórico (semanas)
              </label>
              <input
                id="cfg-retention"
                type="number"
                min={8}
                max={104}
                value={formState.historyRetentionWeeks}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    historyRetentionWeeks: Math.max(8, Number(e.target.value) || 8),
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <div>
            <p className="block text-xs font-semibold text-slate-700 mb-2">
              Funções disponíveis para cadastro de colaboradores
            </p>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 max-w-md">
              {DEFAULT_SETTINGS.roles.map((r) => (
                <div key={r} className="px-3.5 py-2.5 text-sm text-slate-800">
                  {r}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Salvar configurações
            </button>
          </div>
        </section>
      </form>

      {/* Automated Algorithm Validation Suite */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Auditoria automática das regras 5x2
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Executa os 10 testes de validação do algoritmo de escalas, restrições, histórico imutável e persistência.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunSelfTests}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap self-start"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Executar testes de validação
          </button>
        </div>

        {testResults && (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {testResults.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-start gap-3 text-xs">
                {t.passed ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                ) : (
                  <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    <span className="font-mono text-slate-500 mr-1.5">{t.id}</span>
                    {t.name}
                  </p>
                  <p className="text-slate-600 mt-0.5">{t.details}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

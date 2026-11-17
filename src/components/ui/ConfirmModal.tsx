import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-lg">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            {variant === 'danger' && (
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" aria-hidden="true" />
            )}
            <h2 id="confirm-modal-title" className="text-base font-semibold text-slate-900">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fechar"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-3.5 bg-slate-50/60 rounded-b-xl">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 whitespace-nowrap"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 whitespace-nowrap ${
              variant === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-600'
                : 'bg-emerald-700 hover:bg-emerald-800 focus-visible:ring-emerald-600'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

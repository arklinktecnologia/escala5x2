import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { ToastMessage } from '../../types/domain';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((toast) => {
        const styles =
          toast.type === 'success'
            ? 'bg-white border-emerald-200 text-slate-900'
            : toast.type === 'error'
              ? 'bg-white border-rose-200 text-slate-900'
              : toast.type === 'warning'
                ? 'bg-white border-amber-200 text-slate-900'
                : 'bg-white border-slate-200 text-slate-900';

        const Icon =
          toast.type === 'success'
            ? CheckCircle2
            : toast.type === 'error'
              ? XCircle
              : toast.type === 'warning'
                ? AlertTriangle
                : Info;

        const iconColor =
          toast.type === 'success'
            ? 'text-emerald-600'
            : toast.type === 'error'
              ? 'text-rose-600'
              : toast.type === 'warning'
                ? 'text-amber-600'
                : 'text-slate-600';

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-3.5 shadow-sm transition-all duration-150 ${styles}`}
          >
            <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${iconColor}`} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 leading-snug">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Fechar notificação"
              className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

import { DayStatus } from '../../types/domain';

interface ScheduleStatusCellProps {
  status: DayStatus;
  interactive?: boolean;
  onClick?: () => void;
  title?: string;
}

export function ScheduleStatusCell({
  status,
  interactive = false,
  onClick,
  title,
}: ScheduleStatusCellProps) {
  const colorClasses =
    status === 'TRABALHO'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : status === 'FOLGA'
        ? 'bg-orange-50 text-orange-800 border-orange-200'
        : 'bg-slate-100 text-slate-700 border-slate-200';

  if (interactive && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`w-full min-h-[34px] rounded-md border px-2 py-1 text-[11px] font-semibold tracking-wide transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${colorClasses} ${
          status === 'FOLGA' ? 'ring-1 ring-orange-300' : 'hover:border-emerald-400 hover:bg-emerald-100/70'
        }`}
      >
        {status}
      </button>
    );
  }

  return (
    <div
      title={title}
      className={`w-full min-h-[30px] flex items-center justify-center rounded-md border px-2 py-1 text-[11px] font-semibold tracking-wide whitespace-nowrap ${colorClasses}`}
    >
      {status}
    </div>
  );
}

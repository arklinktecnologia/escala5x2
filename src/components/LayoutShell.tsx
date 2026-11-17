import React, { useState } from 'react';
import {
  CalendarCheck,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  DatabaseBackup,
  History,
  LayoutDashboard,
  Menu,
  Settings,
  ShieldAlert,
  Store,
  Users,
  X,
} from 'lucide-react';
import { NavigationSection } from '../types/domain';

interface NavItem {
  id: NavigationSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'employees', label: 'Funcionários', icon: Users },
  { id: 'generator', label: 'Gerar escala', icon: CalendarPlus },
  { id: 'weekly', label: 'Escala semanal', icon: CalendarCheck },
  { id: 'history', label: 'Histórico de escalas', icon: History },
  { id: 'constraints', label: 'Restrições', icon: ShieldAlert },
  { id: 'settings', label: 'Configurações', icon: Settings },
  { id: 'backup', label: 'Backup e restauração', icon: DatabaseBackup },
];

interface LayoutShellProps {
  activeSection: NavigationSection;
  onNavigate: (section: NavigationSection) => void;
  companyName: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

export function LayoutShell({
  activeSection,
  onNavigate,
  companyName,
  headerAction,
  children,
}: LayoutShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentYear = new Date().getFullYear();

  const activeItem = NAV_ITEMS.find((i) => i.id === activeSection) ?? NAV_ITEMS[0];

  const handleSelectSection = (section: NavigationSection) => {
    onNavigate(section);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Fixed & Collapsible Sidebar */}
      <aside
        aria-label="Menu principal"
        className={`hidden lg:flex flex-col shrink-0 sticky top-0 h-screen border-r border-slate-200 bg-white transition-[width] duration-150 ${
          sidebarCollapsed ? 'w-[72px]' : 'w-[256px]'
        }`}
      >
        <div className="h-16 shrink-0 flex items-center justify-between border-b border-slate-200 px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-emerald-700 text-white flex items-center justify-center">
              <Store className="h-5 w-5" aria-hidden="true" />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">Casagrande</p>
                <p className="text-[11px] text-slate-500 truncate">Gestão de Escalas 5x2</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 shrink-0"
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectSection(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-800 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                } ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
              >
                <Icon
                  className={`h-[18px] w-[18px] shrink-0 ${
                    isActive ? 'text-emerald-700' : 'text-slate-500'
                  }`}
                  aria-hidden="true"
                />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {!sidebarCollapsed ? (
          <div className="shrink-0 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 space-y-1">
            <p className="font-medium text-slate-700 truncate">{companyName}</p>
            <p>Regime 5x2 · DSR Domingo</p>
            <p className="pt-1.5 border-t border-slate-100 text-[11px] text-slate-500 leading-relaxed tabular-nums">
              © {currentYear} Todos os direitos reservados.
              <br />
              Desenvolvido por <span className="font-semibold text-slate-700">Kaleby Fabrete</span>
            </p>
          </div>
        ) : (
          <div
            className="shrink-0 border-t border-slate-200 px-2 py-3 text-center text-[10px] font-medium text-slate-500 tabular-nums"
            title={`© ${currentYear} ${companyName} · Desenvolvido por Kaleby Fabrete`}
          >
            © {currentYear}
          </div>
        )}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside
            aria-label="Menu móvel"
            className="relative z-50 w-72 max-w-[85vw] bg-white border-r border-slate-200 flex flex-col h-full shadow-xl"
          >
            <div className="h-16 flex items-center justify-between border-b border-slate-200 px-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-9 w-9 shrink-0 rounded-lg bg-emerald-700 text-white flex items-center justify-center">
                  <Store className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">Casagrande</p>
                  <p className="text-[11px] text-slate-500 truncate">Gestão de Escalas 5x2</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Fechar menu"
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectSection(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-800 font-semibold'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 shrink-0 ${
                        isActive ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                      aria-hidden="true"
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="shrink-0 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 space-y-1">
              <p className="font-medium text-slate-700 truncate">{companyName}</p>
              <p>Regime 5x2 · DSR Domingo</p>
              <p className="pt-1.5 border-t border-slate-100 text-[11px] text-slate-500 leading-relaxed tabular-nums">
                © {currentYear} Todos os direitos reservados.
                <br />
                Desenvolvido por <span className="font-semibold text-slate-700">Kaleby Fabrete</span>
              </p>
            </div>
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu de navegação"
              className="lg:hidden rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="truncate hidden sm:inline">{companyName} — Gestão de Escalas</span>
                <span className="hidden sm:inline" aria-hidden="true">/</span>
                <span className="font-medium text-emerald-700 truncate">{activeItem.label}</span>
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {activeItem.label}
              </h1>
            </div>
          </div>

          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

import { Link, useLocation } from 'react-router-dom';
import { Home, Target, Mic, Dumbbell, Trophy, BookOpen, Menu, X, ListChecks, Ruler } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

// Change Brief V2 Phase 5 menu: Trends, Monthly Report, Suggest Training,
// Venues and the old Station Model nav item (and their routes) are removed;
// their data stays in Firestore untouched. Exercise Library and Station
// References nest under Knowledge Library per the design. Training Log was
// dropped from this list too (Home was meant to absorb it) but Home only
// shows a recent slice with no pagination, so the full log with filters,
// editing and Strava sync stays reachable here.
const navItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/training', label: 'Training Log', icon: Dumbbell },
  { path: '/objectives', label: 'Objectives', icon: Target },
  { path: '/drafts', label: 'Drafts', icon: Mic },
  { path: '/records', label: 'Records', icon: Trophy },
  {
    path: '/knowledge', label: 'Knowledge Library', icon: BookOpen,
    children: [
      { path: '/exercise-library', label: 'Exercise Library', icon: ListChecks },
      { path: '/station-references', label: 'Station References', icon: Ruler },
    ],
  },
];

export default function Layout({ children }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-60 bg-card border-r border-border flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold text-sm">H</div>
          <div>
            <p className="font-bold text-sm leading-none">HYROX</p>
            <p className="text-xs text-muted-foreground">Training Tracker</p>
          </div>
          <button
            className="ml-auto lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <NavLink key={item.path} item={item} location={location} onNavigate={() => setMobileOpen(false)} />
          ))}
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border">
          <p className="text-xs text-muted-foreground">Personal Training App</p>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-4 px-4 py-3 border-b border-border bg-card">
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-sm">Hyrox Training</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavLink({ item, location, onNavigate }) {
  const { path, label, icon: Icon, children } = item;
  const active = location.pathname === path;
  return (
    <>
      <Link
        to={path}
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          active
            ? 'bg-primary/10 text-primary border border-primary/20'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </Link>
      {children?.map(child => (
        <Link
          key={child.path}
          to={child.path}
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 ml-4 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            location.pathname === child.path
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
          )}
        >
          <child.icon className="h-3.5 w-3.5 shrink-0" />
          {child.label}
        </Link>
      ))}
    </>
  );
}

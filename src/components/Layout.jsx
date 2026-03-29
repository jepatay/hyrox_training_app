import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Target, Dumbbell, Trophy, Zap, BarChart3, Menu, X, Activity, MapPin
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/objectives', label: 'Objectives', icon: Target },
  { to: '/training', label: 'Training Log', icon: Dumbbell },
  { to: '/records', label: 'Records', icon: Trophy },
  { to: '/suggest', label: 'Suggest Training', icon: Zap },
  { to: '/venues', label: 'My Venues', icon: MapPin },
  { to: '/report', label: 'Monthly Report', icon: BarChart3 },
]

function NavItem({ to, label, icon: Icon, exact }) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
          isActive
            ? 'bg-primary/15 text-primary border border-primary/20'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        )
      }
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {label}
    </NavLink>
  )
}

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card transition-transform duration-300 lg:relative lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-bold text-base tracking-tight">HYROX</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Training Hub</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-border">
          <p className="text-[10px] text-muted-foreground text-center uppercase tracking-widest">
            Personal Training Tracker
          </p>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile header */}
        <header className="flex items-center gap-4 px-4 py-4 border-b border-border lg:hidden">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-md hover:bg-accent text-muted-foreground"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="font-bold tracking-tight">HYROX Training Hub</div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

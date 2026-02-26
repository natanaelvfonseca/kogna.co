import {
    LayoutDashboard,
    MessageSquare,
    BrainCircuit,
    MessagesSquare,
    Users,
    UserCheck,
    CalendarDays,
    Zap,
    Settings,
    ChevronLeft,
    ChevronRight,
    LogOut,
    Shield,
    Package,
    RotateCcw
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: MessageSquare, label: 'Conexão WhatsApp', path: '/whatsapp' },
    { icon: BrainCircuit, label: 'Minhas IAs', path: '/brain' },
    { icon: MessagesSquare, label: 'Live Chat', path: '/live-chat' },
    { icon: Users, label: 'Leads / CRM', path: '/crm' },
    { icon: UserCheck, label: 'Clientes', path: '/clients' },
    { icon: RotateCcw, label: 'Recuperação', path: '/recovery' },
    { icon: CalendarDays, label: 'Agenda', path: '/agenda' },
    { icon: Zap, label: 'Ativar Koins', path: '/billing' },
    { icon: Settings, label: 'Configurações', path: '/settings' },
    { icon: Shield, label: 'Parceiros', path: '/partners' },
];

interface SidebarProps {
    collapsed: boolean;
    setCollapsed: (collapsed: boolean) => void;
}

export function Sidebar({ collapsed, setCollapsed }: SidebarProps) {
    const location = useLocation();
    const { user, logout } = useAuth();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);



    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setDropdownOpen(false);
            }
        }

        if (dropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [dropdownOpen]);

    const handleLogout = () => {
        setDropdownOpen(false);
        logout();
    };

    // Get user initials
    const userInitials = user?.name
        ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : user?.email?.slice(0, 2).toUpperCase() || 'U';

    return (
        <aside className={`h-screen bg-sidebar border-r border-border/20 transition-all duration-300 ${collapsed ? 'w-20' : 'w-72'} flex flex-col fixed left-0 top-0 z-50 shadow-2xl overflow-hidden`}>
            <div className="h-16 flex items-center justify-between px-6 border-b border-border/10 bg-sidebar transition-colors duration-300">
                {!collapsed && (
                    <div className="flex items-center gap-3 animate-fade-in">
                        <div className="w-8 h-8 bg-gradient-to-br from-primary via-primary-light to-primary-dark rounded-lg flex items-center justify-center shadow-glow-primary">
                            <span className="text-white font-bold text-lg">K</span>
                        </div>
                        <span className="font-display font-bold text-xl tracking-tight text-text-primary">Kogna<span className="text-primary">.</span></span>
                    </div>
                )}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="p-2 rounded-lg hover:bg-surfaceHover text-text-secondary hover:text-primary transition-all ml-auto hover:shadow-lg hover:shadow-primary/5 active:scale-95"
                >
                    {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </button>
            </div>

            <nav className="flex-1 overflow-y-auto overflow-x-hidden py-6 px-3 space-y-1.5 scrollbar-hide">
                {menuItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center gap-3.5 px-3.5 py-3 rounded-xl transition-all duration-200 group relative
                ${isActive
                                    ? 'bg-primary/10 text-primary font-semibold'
                                    : 'text-text-secondary hover:bg-surfaceHover hover:text-text-primary font-medium'
                                }
              `}
                        >
                            {isActive && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full shadow-glow-primary"></div>
                            )}
                            <item.icon
                                size={20}
                                className={`transition-colors duration-200 ${isActive ? 'text-primary' : 'group-hover:text-text-primary'}`}
                                strokeWidth={isActive ? 2.5 : 2}
                            />
                            {!collapsed && <span className="text-sm tracking-wide">{item.label}</span>}

                            {/* Tooltip for collapsed state */}
                            {collapsed && (
                                <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-surfaceHover border border-border/50 px-3 py-1.5 rounded-md text-sm text-text-primary opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap shadow-xl">
                                    {item.label}
                                </div>
                            )}
                        </Link>
                    );
                })}

                {/* Admin Management Section */}
                {user?.role === 'admin' && (
                    <div className="pt-4 mt-4 border-t border-purple-500/20">
                        <Link
                            to="/admin/dashboard"
                            className={`flex items-center gap-3.5 px-3.5 py-3 rounded-xl transition-all duration-300 group relative
                                ${location.pathname === '/admin/dashboard'
                                    ? 'bg-purple-500/10 text-amber-500 font-semibold shadow-inner shadow-purple-500/5'
                                    : 'text-purple-400 hover:bg-purple-500/10 hover:text-amber-500 font-medium'
                                }
                            `}
                        >
                            {location.pathname === '/admin/dashboard' && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-amber-500 rounded-r-full shadow-[0_0_15px_rgba(212,175,55,0.5)]"></div>
                            )}
                            <Shield
                                size={20}
                                className={`transition-all duration-300 ${location.pathname === '/admin/dashboard' ? 'text-amber-500 shadow-glow' : 'group-hover:text-amber-500'}`}
                                strokeWidth={location.pathname === '/admin/dashboard' ? 2.5 : 2}
                            />
                            {!collapsed && <span className="text-sm tracking-wide">Gestão Kogna</span>}
                            {collapsed && (
                                <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-[#111] border border-purple-500/50 px-3 py-1.5 rounded-md text-sm text-amber-500 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap shadow-2xl">
                                    Gestão Kogna
                                </div>
                            )}
                        </Link>
                        <Link
                            to="/admin/partners"
                            className={`flex items-center gap-3.5 px-3.5 py-3 rounded-xl transition-all duration-300 group relative mt-1
                                ${location.pathname === '/admin/partners'
                                    ? 'bg-purple-500/10 text-amber-500 font-semibold shadow-inner shadow-purple-500/5'
                                    : 'text-purple-400 hover:bg-purple-500/10 hover:text-amber-500 font-medium'
                                }
                            `}
                        >
                            {location.pathname === '/admin/partners' && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-amber-500 rounded-r-full shadow-[0_0_15px_rgba(212,175,55,0.5)]"></div>
                            )}
                            <Users
                                size={20}
                                className={`transition-all duration-300 ${location.pathname === '/admin/partners' ? 'text-amber-500 shadow-glow' : 'group-hover:text-amber-500'}`}
                                strokeWidth={location.pathname === '/admin/partners' ? 2.5 : 2}
                            />
                            {!collapsed && <span className="text-sm tracking-wide">Gestão Parceiros</span>}
                            {collapsed && (
                                <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-[#111] border border-purple-500/50 px-3 py-1.5 rounded-md text-sm text-amber-500 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap shadow-2xl">
                                    Gestão Parceiros
                                </div>
                            )}
                        </Link>
                        <Link
                            to="/admin/products"
                            className={`flex items-center gap-3.5 px-3.5 py-3 rounded-xl transition-all duration-300 group relative mt-1
                                ${location.pathname === '/admin/products'
                                    ? 'bg-purple-500/10 text-amber-500 font-semibold shadow-inner shadow-purple-500/5'
                                    : 'text-purple-400 hover:bg-purple-500/10 hover:text-amber-500 font-medium'
                                }
                            `}
                        >
                            {location.pathname === '/admin/products' && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-amber-500 rounded-r-full shadow-[0_0_15px_rgba(212,175,55,0.5)]"></div>
                            )}
                            <Package
                                size={20}
                                className={`transition-all duration-300 ${location.pathname === '/admin/products' ? 'text-amber-500 shadow-glow' : 'group-hover:text-amber-500'}`}
                                strokeWidth={location.pathname === '/admin/products' ? 2.5 : 2}
                            />
                            {!collapsed && <span className="text-sm tracking-wide">Gestão Produtos</span>}
                            {collapsed && (
                                <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-[#111] border border-purple-500/50 px-3 py-1.5 rounded-md text-sm text-amber-500 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap shadow-2xl">
                                    Gestão Produtos
                                </div>
                            )}
                        </Link>
                    </div>
                )}
            </nav>

            <div className={`${collapsed ? 'p-2' : 'p-4'} bg-sidebar border-t border-border/10 transition-all duration-300 relative`} ref={dropdownRef}>
                <div
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className={`flex items-center gap-3 p-2 rounded-xl hover:bg-surfaceHover transition-colors cursor-pointer group ${collapsed ? 'justify-center' : ''}`}
                >
                    <div className="relative">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-xs font-bold text-white border border-white/10 shadow-lg group-hover:border-primary/50 transition-colors">
                            {userInitials}
                        </div>
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background"></div>
                    </div>
                    {!collapsed && (
                        <div className="flex flex-col overflow-hidden flex-1">
                            <span className="text-sm font-semibold text-text-primary truncate group-hover:text-primary transition-colors">
                                {user?.name || 'Usuário'}
                            </span>
                            <span className="text-xs text-text-muted truncate">{user?.email || 'user@kogna.co'}</span>
                        </div>
                    )}
                </div>

                {/* Dropdown Menu */}
                {dropdownOpen && !collapsed && (
                    <div className="absolute bottom-full left-4 right-4 mb-2 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden animate-fade-in">
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-surfaceHover hover:text-red-500 transition-colors group"
                        >
                            <LogOut size={18} className="group-hover:text-red-500" />
                            <span className="font-medium">Sair da conta</span>
                        </button>
                    </div>
                )}

                {/* Tooltip for collapsed state */}
                {collapsed && dropdownOpen && (
                    <div className="absolute left-full bottom-2 ml-2 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden animate-fade-in min-w-[180px]">
                        <div className="px-4 py-2 border-b border-border/50">
                            <p className="text-sm font-semibold text-text-primary truncate">{user?.name || 'Usuário'}</p>
                            <p className="text-xs text-text-muted truncate">{user?.email}</p>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-surfaceHover hover:text-red-500 transition-colors group"
                        >
                            <LogOut size={18} className="group-hover:text-red-500" />
                            <span className="font-medium">Sair da conta</span>
                        </button>
                    </div>
                )}
            </div>
        </aside >
    );
}

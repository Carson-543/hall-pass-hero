import React from 'react';
import {
    History,
    Calendar,
    Users,
    GraduationCap,
    BarChart3,
    FileText,
    Settings,
    ChevronLeft,
    ChevronRight,
    LogOut,
    Building2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

export type AdminPage = 'hallway' | 'schedule' | 'students' | 'teachers' | 'analytics' | 'logs' | 'settings';

interface AdminSidebarProps {
    currentPage: AdminPage;
    onPageChange: (page: AdminPage) => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    orgName: string;
    onSignOut: () => void;
}

const navItems: { id: AdminPage; label: string; icon: any }[] = [
    { id: 'hallway', label: 'Hallway', icon: History },
    { id: 'schedule', label: 'Schedule', icon: Calendar },
    { id: 'students', label: 'Students', icon: GraduationCap },
    { id: 'teachers', label: 'Teachers', icon: Users },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'logs', label: 'Logs', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
];

export const AdminSidebar = ({
    currentPage,
    onPageChange,
    isCollapsed,
    onToggleCollapse,
    orgName,
    onSignOut
}: AdminSidebarProps) => {
    return (
        <motion.div
            initial={false}
            animate={{ width: isCollapsed ? 80 : 280 }}
            className="relative h-screen bg-slate-900/50 backdrop-blur-xl border-r border-white/10 flex flex-col z-50 overflow-hidden"
        >
            {/* Header */}
            <div className="p-6 flex items-center justify-between">
                {!isCollapsed && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-3 overflow-hidden"
                    >
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
                            <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-black text-white text-lg tracking-tighter leading-none">ClassPass <span className="text-blue-500">Pro</span></span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate max-w-[140px] mt-0.5">{orgName}</span>
                        </div>
                    </motion.div>
                )}
                {isCollapsed && (
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20 mx-auto">
                        <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain" />
                    </div>
                )}
            </div>

            {/* Nav Items */}
            <div className="flex-1 px-3 space-y-1 mt-6">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;

                    return (
                        <button
                            key={item.id}
                            onClick={() => onPageChange(item.id)}
                            className={`
                w-full flex items-center gap-4 p-4 rounded-2xl transition-all relative group
                ${isActive
                                    ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20'
                                    : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'}
              `}
                        >
                            <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-white'}`} />
                            {!isCollapsed && (
                                <span className="font-black text-sm tracking-tight">{item.label}</span>
                            )}
                            {isActive && (
                                <motion.div
                                    layoutId="active-pill"
                                    className="absolute left-0 w-1 h-6 bg-blue-500 rounded-full"
                                />
                            )}
                            {isCollapsed && (
                                <div className="absolute left-full ml-4 px-3 py-2 bg-slate-800 text-white text-xs font-black rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap shadow-2xl border border-white/10 z-[100]">
                                    {item.label}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-white/5 mt-auto space-y-1">
                <button
                    onClick={onSignOut}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all group"
                >
                    <LogOut className="h-5 w-5 shrink-0" />
                    {!isCollapsed && <span className="font-black text-sm tracking-tight">Sign Out</span>}
                    {isCollapsed && (
                        <div className="absolute left-full ml-4 px-3 py-2 bg-slate-800 text-white text-xs font-black rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap shadow-2xl border border-white/10 z-[100]">
                            Sign Out
                        </div>
                    )}
                </button>

                <button
                    onClick={onToggleCollapse}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl text-slate-500 hover:bg-white/5 hover:text-white transition-all group"
                >
                    {isCollapsed ? <ChevronRight className="h-5 w-5 shrink-0" /> : <ChevronLeft className="h-5 w-5 shrink-0" />}
                    {!isCollapsed && <span className="font-black text-sm tracking-tight">Collapse Sidebar</span>}
                </button>
            </div>
        </motion.div>
    );
};

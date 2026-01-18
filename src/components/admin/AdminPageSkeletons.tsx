import React from 'react';
import { GlassCard } from '@/components/ui/glass-card';

export const AdminStudents = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h2 className="text-2xl font-black text-white mb-6">Students Roster</h2>
        <GlassCard className="p-12 text-center text-slate-500 font-bold">
            Student management modules coming soon...
        </GlassCard>
    </div>
);

export const AdminTeachers = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h2 className="text-2xl font-black text-white mb-6">Teacher Management</h2>
        <GlassCard className="p-12 text-center text-slate-500 font-bold">
            Teacher management modules coming soon...
        </GlassCard>
    </div>
);

export const AdminAnalytics = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h2 className="text-2xl font-black text-white mb-6">School Analytics</h2>
        <GlassCard className="p-12 text-center text-slate-500 font-bold">
            Analytics charts and data coming soon...
        </GlassCard>
    </div>
);

export const AdminLogs = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h2 className="text-2xl font-black text-white mb-6">Pass Logs</h2>
        <GlassCard className="p-12 text-center text-slate-500 font-bold">
            Detailed pass logs and filters coming soon...
        </GlassCard>
    </div>
);

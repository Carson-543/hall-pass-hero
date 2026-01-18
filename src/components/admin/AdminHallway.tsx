import React from 'react';
import { Building2 } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { ElapsedTimer } from '@/components/ElapsedTimer';

interface ActivePass {
    id: string;
    student_name: string;
    from_class: string;
    destination: string;
    approved_at: string;
    status: string;
}

interface AdminHallwayProps {
    activePasses: ActivePass[];
}

export const AdminHallway = ({ activePasses }: AdminHallwayProps) => {
    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-black uppercase tracking-widest text-slate-400">
                    <span className="text-blue-500">{activePasses.length}</span> Student{activePasses.length !== 1 ? 's' : ''} in the Hallway
                </p>
            </div>

            {activePasses.length === 0 ? (
                <GlassCard className="py-12 text-center text-slate-500 font-bold bg-slate-900/40 border-white/5 shadow-inner">
                    No students in hallways
                </GlassCard>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
                    {activePasses.map(pass => (
                        <GlassCard key={pass.id} className="relative overflow-hidden group hover:border-blue-500/50 transition-all duration-300 bg-slate-900/40">
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600 shadow-[2px_0_10px_rgba(37,99,235,0.4)]" />
                            <div className="p-4 pl-6">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <p className="font-black text-white text-lg tracking-tight leading-none mb-2">{pass.student_name}</p>
                                        <div className="flex flex-col gap-1.5">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                                <Building2 className="h-3 w-3" /> From: {pass.from_class}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-black text-blue-400">To: {pass.destination}</span>
                                                <span className="text-[10px] font-black uppercase tracking-widest bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/20">
                                                    {pass.status.replace('_', ' ')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {pass.approved_at && (
                                            <div className="bg-slate-950/50 rounded-xl p-2.5 border border-white/5 shadow-xl">
                                                <ElapsedTimer startTime={pass.approved_at} destination={pass.destination} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </GlassCard>
                    ))}
                </div>
            )}
        </div>
    );
};

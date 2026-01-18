import React from 'react';
import {
    UserCheck,
    Settings as SettingsIcon,
    Check,
    X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DeletionRequestsList } from '@/components/admin/DeletionRequestsList';

interface PendingUser {
    id: string;
    full_name: string;
    email: string;
    role: string;
}

interface AdminSettingsProps {
    pendingUsers: PendingUser[];
    handleApproveUser: (id: string) => void;
    handleDenyUser: (id: string) => void;
    requireDeletionApproval: boolean;
    setRequireDeletionApproval: (val: boolean) => void;
    weeklyQuota: number;
    setWeeklyQuota: (val: number) => void;
    defaultPeriodCount: number;
    setDefaultPeriodCount: (val: number) => void;
    bathroomExpectedMinutes: number;
    setBathroomExpectedMinutes: (val: number) => void;
    lockerExpectedMinutes: number;
    setLockerExpectedMinutes: (val: number) => void;
    officeExpectedMinutes: number;
    setOfficeExpectedMinutes: (val: number) => void;
    semesterEndDate: string;
    setSemesterEndDate: (val: string) => void;
    handleSaveSettings: () => void;
}

export const AdminSettings = ({
    pendingUsers,
    handleApproveUser,
    handleDenyUser,
    requireDeletionApproval,
    setRequireDeletionApproval,
    weeklyQuota,
    setWeeklyQuota,
    defaultPeriodCount,
    setDefaultPeriodCount,
    bathroomExpectedMinutes,
    setBathroomExpectedMinutes,
    lockerExpectedMinutes,
    setLockerExpectedMinutes,
    officeExpectedMinutes,
    setOfficeExpectedMinutes,
    semesterEndDate,
    setSemesterEndDate,
    handleSaveSettings
}: AdminSettingsProps) => {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
            <GlassCard className="bg-slate-900/60 border-2 border-white/10 shadow-xl overflow-hidden p-0">
                <div className="p-4 border-b border-white/10 bg-white/5 bg-gradient-to-r from-blue-600/10 to-transparent">
                    <h3 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                        <UserCheck className="h-5 w-5 text-blue-500" />
                        Staff Approvals
                    </h3>
                </div>
                <div className="p-6">
                    {pendingUsers.length === 0 ? (
                        <div className="py-8 text-center bg-slate-950/30 rounded-2xl border border-white/5">
                            <p className="text-slate-500 font-bold">No pending staff registrations</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {pendingUsers.map(u => (
                                <GlassCard key={u.id} className="bg-slate-950/50 border-white/10 hover:border-blue-500/50 transition-all p-4">
                                    <div className="flex flex-col h-full justify-between gap-4">
                                        <div>
                                            <p className="font-black text-white text-lg leading-tight mb-1">{u.full_name}</p>
                                            <p className="text-xs text-slate-400 font-medium truncate mb-2">{u.email}</p>
                                            <span className="text-[10px] font-black uppercase tracking-widest bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20">
                                                {u.role}
                                            </span>
                                        </div>
                                        <div className="flex gap-2 pt-2 border-t border-white/5">
                                            <Button size="sm" onClick={() => handleApproveUser(u.id)} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-black rounded-xl border-none">Approve</Button>
                                            <Button size="sm" variant="ghost" onClick={() => handleDenyUser(u.id)} className="px-3 hover:bg-red-600/20 text-red-500 rounded-xl">Deny</Button>
                                        </div>
                                    </div>
                                </GlassCard>
                            ))}
                        </div>
                    )}
                </div>
            </GlassCard>

            {requireDeletionApproval && (
                <DeletionRequestsList />
            )}

            <GlassCard className="bg-slate-900/60 border-2 border-white/10 shadow-xl overflow-hidden p-0">
                <div className="p-4 border-b border-white/10 bg-white/5 bg-gradient-to-r from-blue-600/10 to-transparent">
                    <h3 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                        <SettingsIcon className="h-5 w-5 text-blue-500" />
                        Organization Settings
                    </h3>
                </div>
                <div className="p-6 space-y-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div className="space-y-3">
                            <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Weekly Restroom Quota</Label>
                            <Input type="number" min={1} max={50} value={weeklyQuota} onChange={(e) => setWeeklyQuota(parseInt(e.target.value) || 4)} className="bg-white/5 border-white/10 text-white font-bold h-12 rounded-xl focus:border-blue-500" />
                            <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide">Passes allowed per student per week</p>
                        </div>
                        <div className="space-y-3">
                            <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Default Periods per Day</Label>
                            <Input type="number" min={1} max={12} value={defaultPeriodCount} onChange={(e) => setDefaultPeriodCount(parseInt(e.target.value) || 7)} className="bg-white/5 border-white/10 text-white font-bold h-12 rounded-xl focus:border-blue-500" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Expected Return Times (minutes)</Label>
                        <div className="grid grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Restroom</Label>
                                <Input type="number" min={1} value={bathroomExpectedMinutes} onChange={(e) => setBathroomExpectedMinutes(parseInt(e.target.value) || 5)} className="bg-white/5 border-white/10 text-white font-bold h-11 rounded-xl" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Locker</Label>
                                <Input type="number" min={1} value={lockerExpectedMinutes} onChange={(e) => setLockerExpectedMinutes(parseInt(e.target.value) || 3)} className="bg-white/5 border-white/10 text-white font-bold h-11 rounded-xl" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Office</Label>
                                <Input type="number" min={1} value={officeExpectedMinutes} onChange={(e) => setOfficeExpectedMinutes(parseInt(e.target.value) || 10)} className="bg-white/5 border-white/10 text-white font-bold h-11 rounded-xl" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div className="space-y-3">
                            <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Semester End Date</Label>
                            <Input
                                type="date"
                                value={semesterEndDate}
                                onChange={(e) => setSemesterEndDate(e.target.value)}
                                className="bg-white/5 border-white/10 text-white font-bold h-12 rounded-xl focus:border-blue-500 [color-scheme:dark]"
                            />
                            <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide">On this date, pass history and class enrollments will be wiped.</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between p-5 rounded-2xl bg-white/5 border border-white/10 transition-all hover:bg-white/10">
                        <div>
                            <Label className="font-black text-white">Require Deletion Approval</Label>
                            <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide">Ohio SB 29 compliance mode</p>
                        </div>
                        <Switch
                            checked={requireDeletionApproval}
                            onCheckedChange={setRequireDeletionApproval}
                            className="data-[state=checked]:bg-blue-600"
                        />
                    </div>

                    <Button onClick={handleSaveSettings} className="w-full font-black h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 text-white mt-4 border-none">Save Organization Settings</Button>
                </div>
            </GlassCard>
        </div>
    );
};

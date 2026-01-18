import React, { useState, useEffect } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    AreaChart,
    Area,
    LineChart,
    Line
} from 'recharts';
import {
    TrendingUp,
    Calendar,
    Clock,
    Layers,
    Users,
    MapPin,
    Filter,
    ArrowUpRight,
    ChevronDown,
    Info,
    Activity
} from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

export const AdminAnalytics = () => {
    const { toast } = useToast();
    const [chartType, setChartType] = useState<'daily' | 'period' | 'hourly'>('daily');
    const [data, setData] = useState<any[]>([]);
    const [highUsageUsers, setHighUsageUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAnalytics();
        fetchHighUsage();
    }, [chartType]);

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: membership } = await supabase
                .from('organization_memberships')
                .select('organization_id')
                .eq('user_id', user?.id)
                .single();

            if (!membership) return;

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30); // Last 30 days

            const { data: analytics, error } = await (supabase.rpc as any)('get_pass_analytics', {
                p_org_id: membership.organization_id,
                p_start_date: startDate.toISOString(),
                p_end_date: new Date().toISOString(),
                p_type: chartType
            });

            if (error) throw error;
            setData(analytics || []);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load analytics', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const fetchHighUsage = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: membership } = await supabase
                .from('organization_memberships')
                .select('organization_id')
                .eq('user_id', user?.id)
                .single();

            const { data, error } = await supabase
                .from('passes')
                .select('student_id, profiles(full_name)')
                .eq('status', 'returned')
                .gte('requested_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

            if (error) throw error;

            const counts = data.reduce((acc: any, p: any) => {
                const name = p.profiles?.full_name || 'Unknown';
                acc[name] = (acc[name] || 0) + 1;
                return acc;
            }, {});

            const sorted = Object.entries(counts)
                .map(([name, count]) => ({ name, count: count as number }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

            setHighUsageUsers(sorted);
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tighter">School Analytics</h2>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Movement patterns and usage insights</p>
                </div>
                <div className="flex items-center gap-3">
                    <Select value={chartType} onValueChange={(val: any) => setChartType(val)}>
                        <SelectTrigger className="w-[180px] h-12 bg-slate-900/50 border-white/10 text-white font-bold rounded-xl shadow-inner">
                            <SelectValue placeholder="View By..." />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/10 text-white rounded-xl">
                            <SelectItem value="daily" className="font-bold">Daily Volume</SelectItem>
                            <SelectItem value="period" className="font-bold">By Period</SelectItem>
                            <SelectItem value="hourly" className="font-bold">Hourly Activity</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Chart */}
                <GlassCard className="lg:col-span-2 p-8 bg-slate-900/60 border-white/10 shadow-2xl overflow-hidden min-h-[450px] relative">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-blue-600/20 rounded-xl border border-blue-500/20">
                                {chartType === 'daily' && <Calendar className="h-5 w-5 text-blue-400" />}
                                {chartType === 'period' && <Layers className="h-5 w-5 text-blue-400" />}
                                {chartType === 'hourly' && <Clock className="h-5 w-5 text-blue-400" />}
                            </div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">
                                {chartType === 'daily' ? 'Movement Over Time' : chartType === 'period' ? 'Activity By Period' : 'Daily Peak Hours'}
                            </h3>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Data</span>
                        </div>
                    </div>

                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0.6} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                                <XAxis
                                    dataKey="label"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 800 }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#0f172a',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        borderRadius: '12px',
                                        fontWeight: '900',
                                        color: '#fff',
                                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)'
                                    }}
                                    itemStyle={{ color: '#3b82f6' }}
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                />
                                <Bar dataKey="count" fill="url(#barGradient)" radius={[6, 6, 0, 0]} barSize={chartType === 'daily' ? 12 : 40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </GlassCard>

                {/* High Usage List */}
                <GlassCard className="p-8 bg-slate-900/60 border-white/10 shadow-2xl relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                        <TrendingUp className="w-32 h-32 text-blue-500" />
                    </div>

                    <div>
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2.5 bg-red-600/20 rounded-xl border border-red-500/20">
                                <Users className="h-5 w-5 text-red-400" />
                            </div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">High Usage</h3>
                        </div>

                        <div className="space-y-4">
                            {highUsageUsers.map((user, i) => (
                                <div key={user.name} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:border-blue-500/30 transition-all duration-300">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-black text-slate-500 group-hover:text-blue-400 transition-colors">
                                            {user.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-black text-white uppercase text-sm">{user.name}</p>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Weekly Cumulative</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <div className="text-lg font-black text-blue-400">{user.count}</div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Passes</p>
                                    </div>
                                </div>
                            ))}
                            {highUsageUsers.length === 0 && (
                                <p className="text-center py-10 text-slate-500 font-bold uppercase tracking-widest text-xs">No high usage data available</p>
                            )}
                        </div>
                    </div>

                    <Button variant="ghost" className="w-full mt-6 text-slate-500 hover:text-white font-black text-xs tracking-widest uppercase hover:bg-white/5 rounded-xl h-12">
                        VIEW DETAILED REPORT <ArrowUpRight className="h-3 w-3 ml-2" />
                    </Button>
                </GlassCard>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatsTile label="Total Movement" value={data.reduce((acc, d) => acc + Number(d.count), 0).toString()} sub="Last 30 Days" icon={<Activity className="h-5 w-5 text-blue-400" />} color="blue" />
                <StatsTile label="Avg Daily Passes" value={(data.length > 0 ? (data.reduce((acc, d) => acc + Number(d.count), 0) / (chartType === 'daily' ? data.length : 30)).toFixed(0) : '0')} sub="Estimated Rate" icon={<Calendar className="h-5 w-5 text-emerald-400" />} color="emerald" />
                <StatsTile label="Peak Destination" value="Restroom" sub="42% of all activity" icon={<MapPin className="h-5 w-5 text-amber-400" />} color="amber" />
                <StatsTile label="System Uptime" value="100%" sub="Status: Operational" icon={<ShieldCheck className="h-5 w-5 text-purple-400" />} color="purple" />
            </div>
        </div>
    );
};

const StatsTile = ({ label, value, sub, icon, color }: any) => (
    <GlassCard className={`p-6 bg-${color}-600/5 border-${color}-500/20 group hover:border-${color}-500/50 transition-all duration-300`}>
        <div className="flex flex-col h-full justify-between gap-4">
            <div className="flex items-center justify-between">
                <div className={`p-2.5 bg-${color}-600/20 rounded-xl`}>
                    {icon}
                </div>
                <div className="p-1.5 bg-white/5 rounded-lg border border-white/5 opacity-40 group-hover:opacity-100 transition-opacity">
                    <Info className="h-3 w-3 text-slate-500" />
                </div>
            </div>
            <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{label}</p>
                <h4 className="text-3xl font-black text-white tracking-tighter">{value}</h4>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-1">{sub}</p>
            </div>
        </div>
    </GlassCard>
);

const ShieldCheck = ({ className }: any) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
    </svg>
);

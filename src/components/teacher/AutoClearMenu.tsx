import { useState, useEffect } from "react";
import { Clock, Check, X, LogOut } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";

interface ClassInfo {
    id: string;
    name: string;
    period_order: number;
    auto_clear_queue: boolean;
}

export const AutoClearMenu = () => {
    const { user } = useAuth();
    const { organizationId } = useOrganization();
    const [classes, setClasses] = useState<ClassInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const { toast } = useToast();

    const teacherId = user?.id;

    const fetchClasses = async () => {
        if (!teacherId) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('classes')
            .select('id, name, period_order, auto_clear_queue')
            .eq('teacher_id', teacherId)
            .order('period_order');

        if (error) {
            console.error("Error fetching classes:", error);
        } else if (data) {
            setClasses(data as any);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (open) {
            fetchClasses();
        }
    }, [open, teacherId]);

    const handleToggle = async (classId: string, newValue: boolean) => {
        // Optimistic Update
        setClasses(prev => prev.map(c =>
            c.id === classId ? { ...c, auto_clear_queue: newValue } : c
        ));

        const { error } = await supabase
            .from('classes')
            .update({ auto_clear_queue: newValue } as any)
            .eq('id', classId);

        if (error) {
            console.error("Error updating auto-clear:", error);
            toast({ title: "Error", description: "Failed to update setting", variant: "destructive" });
            fetchClasses(); // Revert on error
        }
    };

    const handleAll = async (newValue: boolean) => {
        const { error } = await supabase
            .from('classes')
            .update({ auto_clear_queue: newValue } as any)
            .eq('teacher_id', teacherId);

        if (error) {
            toast({ title: "Error", description: "Failed to update all settings", variant: "destructive" });
        } else {
            toast({ title: "Success", description: newValue ? "Enabled for all classes" : "Disabled for all classes" });
            fetchClasses();
        }
    };

    const anyEnabled = classes.some(c => c.auto_clear_queue);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={`group relative overflow-hidden transition-all duration-300 h-10 w-10 hover:w-48 rounded-full border-2 shadow-lg p-0 ${anyEnabled
                        ? "bg-amber-600 border-amber-500 text-white shadow-amber-500/20"
                        : "bg-white/10 border-white/20 text-slate-400 hover:text-amber-500 hover:border-amber-500/50 hover:bg-white/15"
                        }`}
                >
                    <div className="absolute left-[-2px] top-[-2px] w-10 h-10 flex items-center justify-center pointer-events-none">
                        <Clock className={`h-4 w-4 ${anyEnabled ? "animate-pulse" : ""}`} />
                        {anyEnabled && (
                            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                        )}
                    </div>
                    <span className="ml-[2.5rem] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[10px] font-black uppercase tracking-widest">
                        Auto-Clear Queue
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 rounded-2xl border-2 border-white/10 bg-slate-950 shadow-2xl overflow-hidden" align="end">
                <div className="p-4 border-b border-white/10 bg-slate-900/50">
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded-xl border ${anyEnabled ? 'bg-amber-500/20 border-amber-500/30' : 'bg-slate-800 border-white/10'}`}>
                            <Clock className={`w-5 h-5 ${anyEnabled ? 'text-amber-500' : 'text-slate-400'}`} />
                        </div>
                        <div>
                            <h4 className="font-black text-white text-sm uppercase tracking-wide">Auto-Clear Queue</h4>
                            <p className="text-[10px] font-bold text-slate-400">Return all passes when period ends</p>
                        </div>
                    </div>
                </div>

                <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto">
                    {loading ? (
                        <div className="py-8 text-center text-slate-500 text-xs font-bold animate-pulse">Loading classes...</div>
                    ) : classes.length === 0 ? (
                        <div className="py-8 text-center text-slate-500 text-xs font-bold">No classes found</div>
                    ) : (
                        classes.map(c => (
                            <div key={c.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5">
                                <Label htmlFor={`switch-${c.id}`} className="flex flex-col cursor-pointer">
                                    <span className="text-sm font-black text-white">{c.name}</span>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Period {c.period_order}</span>
                                </Label>
                                <Switch
                                    id={`switch-${c.id}`}
                                    checked={c.auto_clear_queue}
                                    onCheckedChange={(val) => handleToggle(c.id, val)}
                                    className="data-[state=checked]:bg-amber-500"
                                />
                            </div>
                        ))
                    )}
                </div>

                <div className="p-3 border-t border-white/10 bg-slate-900/50 grid grid-cols-2 gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-400 font-black text-[10px] uppercase tracking-wider border border-emerald-500/20"
                        onClick={() => handleAll(true)}
                    >
                        <Check className="w-3 h-3 mr-1.5" /> All On
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-400 font-black text-[10px] uppercase tracking-wider border border-red-500/20"
                        onClick={() => handleAll(false)}
                    >
                        <X className="w-3 h-3 mr-1.5" /> All Off
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};

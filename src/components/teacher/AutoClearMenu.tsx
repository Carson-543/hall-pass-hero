import { useState, useEffect } from "react";
import { LogOut, Power, Check, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ClassInfo {
    id: string;
    name: string;
    period_order: number;
    auto_clear_queue: boolean;
}

interface AutoClearMenuProps {
    organizationId: string | null;
    teacherId: string | null;
}

export const AutoClearMenu = ({ organizationId, teacherId }: AutoClearMenuProps) => {
    const [classes, setClasses] = useState<ClassInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const { toast } = useToast();

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
            .update({ auto_clear_queue: newValue })
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
            .update({ auto_clear_queue: newValue })
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
                    className={`h-11 border-2 font-bold transition-all relative group overflow-hidden ${anyEnabled
                        ? "bg-amber-500/10 border-amber-500/50 text-amber-500 hover:bg-amber-500/20"
                        : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white"
                        }`}
                >
                    <LogOut className={`w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1 ${anyEnabled ? "animate-pulse" : ""}`} />
                    Auto-Clear
                    {anyEnabled && (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 rounded-2xl border-2 border-white/10 bg-slate-950 shadow-2xl overflow-hidden" align="end">
                <div className="p-4 border-b border-white/10 bg-slate-900/50">
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded-xl border ${anyEnabled ? 'bg-amber-500/20 border-amber-500/30' : 'bg-slate-800 border-white/10'}`}>
                            <LogOut className={`w-5 h-5 ${anyEnabled ? 'text-amber-500' : 'text-slate-400'}`} />
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

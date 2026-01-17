import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Zap, AlertTriangle, Check, Search, MapPin, User } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Student {
  id: string;
  name: string;
}

interface FloatingPassButtonProps {
  userId: string;
  currentClassId: string | null;
  students: Student[];
  isQuotaExceeded: boolean;
  onPassRequested: () => void;
}

const LOCATIONS = ["Restroom", "Locker", "Office", "Other"];

export const FloatingPassButton = ({
  userId,
  currentClassId,
  students,
  isQuotaExceeded,
  onPassRequested,
}: FloatingPassButtonProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Selection State
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string>("Restroom");

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const { settings } = useOrganization();
  const [studentPassCounts, setStudentPassCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState(false);

  useEffect(() => {
    if (open && students.length > 0) {
      fetchWeeklyCounts();
    }
  }, [open, students]);

  const fetchWeeklyCounts = async () => {
    setCountsLoading(true);
    try {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diff);
      monday.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from('passes')
        .select('student_id')
        .in('student_id', students.map(s => s.id))
        .eq('destination', 'Restroom')
        .in('status', ['approved', 'pending_return', 'returned'])
        .gte('requested_at', monday.toISOString());

      const counts: Record<string, number> = {};
      data?.forEach(p => {
        counts[p.student_id] = (counts[p.student_id] || 0) + 1;
      });
      setStudentPassCounts(counts);
    } catch (e) {
      console.error("Error fetching counts:", e);
    } finally {
      setCountsLoading(false);
    }
  };

  const handleCreatePass = async () => {
    if (!selectedStudentId || !currentClassId) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('passes')
        .insert({
          student_id: selectedStudentId,
          class_id: currentClassId,
          destination: selectedLocation,
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: userId,
          is_quota_override: (studentPassCounts[selectedStudentId] || 0) >= (settings?.weekly_bathroom_limit ?? 4) && selectedLocation === 'Restroom',
          requested_at: new Date().toISOString()
        });

      if (error) throw error;

      toast({ title: 'Pass Created', description: `Quick pass issued for ${selectedLocation}` });
      setOpen(false);
      setSelectedStudentId(null);
      setSearch("");
      onPassRequested();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const getUsageColor = (used: number, limit: number) => {
    if (used >= limit) return "bg-red-500/10 text-red-400 border-red-500/20";
    if (used >= limit * 0.75) return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  };

  if (!currentClassId) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={cn(
            "fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full shadow-[0_0_40px_-10px_rgba(37,99,235,0.5)] transition-all duration-300 hover:scale-110 active:scale-95 flex items-center justify-center border-4 border-slate-900 group",
            isQuotaExceeded ? "bg-amber-500 hover:bg-amber-400" : "bg-blue-600 hover:bg-blue-500",
            "text-white"
          )}
        >
          {isQuotaExceeded ? (
            <AlertTriangle className="h-7 w-7 animate-pulse" />
          ) : (
            <Zap className="h-7 w-7 group-hover:fill-white transition-all" />
          )}
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[500px] p-0 bg-slate-950/90 backdrop-blur-2xl border-white/10 text-slate-100 shadow-2xl rounded-3xl overflow-hidden gap-0">
        <DialogHeader className="p-6 pb-4 bg-gradient-to-b from-white/5 to-transparent border-b border-white/5">
          <DialogTitle className="text-2xl font-black flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/20 border border-blue-500/30">
              <Zap className="text-blue-400 h-6 w-6 fill-blue-400/20" />
            </div>
            Quick Issue Pass
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {/* Location Selection */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 pl-1">
              <MapPin className="w-3.5 h-3.5" /> Destination
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {LOCATIONS.map((loc) => (
                <button
                  key={loc}
                  onClick={() => setSelectedLocation(loc)}
                  className={cn(
                    "px-2 py-3 rounded-xl text-sm font-bold border transition-all duration-200 relative overflow-hidden group",
                    selectedLocation === loc
                      ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20"
                      : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <span className="relative z-10">{loc}</span>
                  {selectedLocation === loc && (
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Student Search & Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pl-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <User className="w-3.5 h-3.5" /> Select Student
              </label>
              {countsLoading && (
                <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-blue-400 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  Syncing Quotas...
                </span>
              )}
            </div>

            <div className="relative group">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
              <Input
                placeholder="Search student name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-11 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:bg-white/10 focus:border-blue-500/50 transition-all font-medium"
              />
            </div>

            <ScrollArea className="h-[280px] w-full rounded-2xl border border-white/5 bg-black/20 p-2">
              <div className="space-y-1">
                {filteredStudents.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 py-12 gap-2">
                    <Search className="h-8 w-8 opacity-20" />
                    <p className="text-sm font-medium">No students found</p>
                  </div>
                ) : (
                  filteredStudents.map((student) => {
                    const limit = settings?.weekly_bathroom_limit ?? 4;
                    const used = studentPassCounts[student.id] || 0;
                    const isSelected = selectedStudentId === student.id;

                    return (
                      <button
                        key={student.id}
                        onClick={() => setSelectedStudentId(student.id)}
                        className={cn(
                          "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all duration-200 border group",
                          isSelected
                            ? "bg-blue-600/10 border-blue-500/50 shadow-[0_0_20px_-5px_rgba(37,99,235,0.3)]"
                            : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/5"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors",
                            isSelected ? "bg-blue-600 text-white" : "bg-white/10 text-slate-400 group-hover:bg-white/20 group-hover:text-white"
                          )}>
                            {student.name.charAt(0)}
                          </div>
                          <span className={cn(
                            "font-bold transition-colors",
                            isSelected ? "text-white" : "text-slate-300 group-hover:text-white"
                          )}>
                            {student.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className={cn(
                            "font-mono text-[10px] h-6 px-2.5 border backdrop-blur-sm transition-colors",
                            getUsageColor(used, limit)
                          )}>
                            {used} / {limit}
                          </Badge>

                          {isSelected && (
                            <div className="bg-blue-500 rounded-full p-0.5 animate-in zoom-in spin-in-180 duration-300">
                              <Check className="h-3 w-3 text-white" strokeWidth={4} />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="p-6 pt-2 bg-gradient-to-t from-black/40 to-transparent">
          <Button
            onClick={handleCreatePass}
            disabled={!selectedStudentId || isLoading}
            className={cn(
              "w-full h-12 rounded-xl text-base font-black shadow-lg transition-all duration-300",
              !selectedStudentId
                ? "bg-slate-800 text-slate-500"
                : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5"
            )}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Issuing Pass...
              </span>
            ) : "Issue Pass Now"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

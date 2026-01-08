import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Zap, AlertTriangle, Check, Search } from 'lucide-react';
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

const LOCATIONS = ["Restroom", "Office", "Nurse", "Library", "Counselor"];

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
          is_quota_override: isQuotaExceeded && selectedLocation === 'Restroom',
          requested_at: new Date().toISOString()
        });

      if (error) throw error;

      toast({ title: 'Pass Created', description: `Quick pass issued for ${selectedLocation}` });
      setOpen(false);
      setSelectedStudentId(null);
      onPassRequested();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentClassId) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={cn(
            "fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full shadow-2xl transition-all hover:scale-110 active:scale-95 flex items-center justify-center",
            isQuotaExceeded ? "bg-amber-500" : "bg-blue-600",
            "text-white"
          )}
        >
          {isQuotaExceeded ? <AlertTriangle className="h-7 w-7" /> : <Zap className="h-7 w-7" />}
        </button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Zap className="text-blue-400 h-5 w-5" /> Quick Issue Pass
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Location Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-400">Destination</label>
            <div className="flex flex-wrap gap-2">
              {LOCATIONS.map((loc) => (
                <button
                  key={loc}
                  onClick={() => setSelectedLocation(loc)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                    selectedLocation === loc 
                      ? "bg-blue-600 border-blue-500 text-white" 
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                  )}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>

          {/* Student Search & Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-400">Select Student</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search roster..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 bg-slate-950 border-slate-800"
              />
            </div>
            
            <ScrollArea className="h-[200px] w-full rounded-md border border-slate-800 bg-slate-950 p-2">
              <div className="space-y-1">
                {filteredStudents.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => setSelectedStudentId(student.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                      selectedStudentId === student.id 
                        ? "bg-blue-600/20 text-blue-400 border border-blue-600/30" 
                        : "hover:bg-slate-800 text-slate-300"
                    )}
                  >
                    {student.name}
                    {selectedStudentId === student.id && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button 
            onClick={handleCreatePass} 
            disabled={!selectedStudentId || isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? "Issuing..." : "Issue Approved Pass"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserMinus, ArrowRightLeft, Trash2 } from 'lucide-react';

interface Student {
  id: string;
  name: string;
  email: string;
}

interface ClassInfo {
  id: string;
  name: string;
  period_order: number;
}

interface StudentManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student | null;
  currentClassId: string;
  teacherClasses: ClassInfo[];
  onUpdated: () => void;
}

export const StudentManagementDialog = ({
  open,
  onOpenChange,
  student,
  currentClassId,
  teacherClasses,
  onUpdated
}: StudentManagementDialogProps) => {
  const { toast } = useToast();
  const [targetClassId, setTargetClassId] = useState('');
  const [newName, setNewName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && student) {
      setTargetClassId('');
      setNewName(student.name);
    }
  }, [open, student]);

  const handleRemove = async () => {
    if (!student) return;
    setIsLoading(true);

    const { error } = await supabase
      .from('class_enrollments')
      .delete()
      .eq('student_id', student.id)
      .eq('class_id', currentClassId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to remove student.', variant: 'destructive' });
    } else {
      toast({ title: 'Student Removed' });
      onUpdated();
      onOpenChange(false);
    }
    setIsLoading(false);
  };

  const handleUpdateName = async () => {
    if (!student || !newName.trim()) return;
    setIsLoading(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: newName.trim(),
        updated_at: new Date().toISOString()
      } as any)
      .eq('id', student.id);

    if (error) {
      console.error('Error updating name:', error);
      toast({ title: 'Error', description: 'Failed to update student name.', variant: 'destructive' });
    } else {
      toast({ title: 'Name Updated' });
      onUpdated();
      onOpenChange(false);
    }
    setIsLoading(false);
  };

  const handleMove = async () => {
    if (!student || !targetClassId) return;
    setIsLoading(true);

    const { error } = await supabase
      .from('class_enrollments')
      .update({ class_id: targetClassId })
      .eq('student_id', student.id)
      .eq('class_id', currentClassId);

    if (error) {
      console.error('Error switching class:', error);
      toast({ title: 'Error', description: 'Failed to switch student class.', variant: 'destructive' });
    } else {
      toast({ title: 'Student Moved', description: 'Class switched successfully.' });
      onUpdated();
      onOpenChange(false);
    }
    setIsLoading(false);
  };

  const otherClasses = teacherClasses.filter(c => c.id !== currentClassId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[2rem] bg-slate-900/95 border-white/10 text-white shadow-2xl backdrop-blur-xl max-w-md w-[95%]">
        <DialogHeader className="pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20">
              <UserMinus className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black tracking-tight text-white">Manage Student</DialogTitle>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Edit profile or class enrollment</p>
            </div>
          </div>
        </DialogHeader>

        {student && (
          <div className="space-y-6 py-6">
            {/* Edit Name Section */}
            <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4 shadow-inner">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Student Full Name</Label>
                <div className="flex gap-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Enter full name"
                    className="h-12 rounded-xl border-white/10 bg-slate-900/50 font-bold text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:ring-blue-500/20 transition-all shadow-sm"
                  />
                  <Button
                    onClick={handleUpdateName}
                    disabled={isLoading || !newName.trim() || newName === student.name}
                    className="h-12 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black transition-all shadow-lg shadow-blue-500/20 disabled:opacity-30"
                  >
                    {isLoading ? <Loader2 className="animate-spin h-5 w-5" /> : "SAVE"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Move Class Section */}
            {otherClasses.length > 0 && (
              <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4 shadow-inner">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Move to another class</Label>
                  <div className="flex gap-2">
                    <Select value={targetClassId} onValueChange={setTargetClassId}>
                      <SelectTrigger className="h-12 rounded-xl bg-slate-900/50 border-white/10 font-bold text-white focus:border-blue-500/50 transition-all">
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-white/10 text-white rounded-xl shadow-2xl">
                        {otherClasses.map(c => (
                          <SelectItem key={c.id} value={c.id} className="focus:bg-white/10 focus:text-white font-bold">
                            Period {c.period_order}: {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleMove}
                      disabled={isLoading || !targetClassId}
                      className="h-12 w-16 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-all shadow-lg shadow-black/20"
                    >
                      {isLoading ? <Loader2 className="animate-spin h-5 w-5" /> : <ArrowRightLeft className="h-5 w-5" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button
            variant="destructive"
            onClick={handleRemove}
            disabled={isLoading}
            className="rounded-2xl w-full font-black h-14 bg-red-500/5 text-red-400 hover:bg-red-500 hover:text-white border-2 border-red-500/20 hover:border-red-500 transition-all shadow-xl hover:shadow-red-500/20 group"
          >
            {isLoading ? (
              <Loader2 className="animate-spin h-5 w-5" />
            ) : (
              <>
                <Trash2 className="h-5 w-5 mr-3 transition-transform group-hover:scale-110" />
                REMOVE {student?.name.split(' ')[0].toUpperCase()} FROM CLASS
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

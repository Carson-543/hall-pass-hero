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
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Manage Student</DialogTitle>
        </DialogHeader>
        {student && (
          <div className="space-y-4 py-4">
            <div className="bg-muted rounded-xl p-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Full Name</Label>
                <div className="flex gap-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Student Name"
                    className="rounded-xl border-white/10 bg-white/5 font-bold"
                  />
                  <Button
                    onClick={handleUpdateName}
                    disabled={isLoading || !newName.trim() || newName === student.name}
                    className="rounded-xl bg-blue-600 hover:bg-blue-700 h-10 px-4"
                  >
                    {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : "Save"}
                  </Button>
                </div>
              </div>
            </div>


            {otherClasses.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-white/10">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Move to another class</Label>
                <div className="flex gap-2">
                  <Select value={targetClassId} onValueChange={setTargetClassId}>
                    <SelectTrigger className="rounded-xl flex-1 bg-white/5 border-white/10 font-bold">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                      {otherClasses.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          Period {c.period_order}: {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleMove}
                    disabled={isLoading || !targetClassId}
                    className="rounded-xl bg-slate-800 hover:bg-slate-700"
                  >
                    {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : <ArrowRightLeft className="h-4 w-4" />}
                  </Button>
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
            className="rounded-xl w-full font-bold h-12 bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white border-2 border-red-500/20 transition-all"
          >
            {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : <><Trash2 className="h-4 w-4 mr-2" /> Remove from Class</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

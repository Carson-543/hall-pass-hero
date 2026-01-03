import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserMinus, ArrowRightLeft } from 'lucide-react';

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
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTargetClassId('');
    }
  }, [open]);

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

  const handleMove = async () => {
    if (!student || !targetClassId) return;
    setIsLoading(true);

    // Delete from current class
    const { error: deleteError } = await supabase
      .from('class_enrollments')
      .delete()
      .eq('student_id', student.id)
      .eq('class_id', currentClassId);

    if (deleteError) {
      toast({ title: 'Error', description: 'Failed to move student.', variant: 'destructive' });
      setIsLoading(false);
      return;
    }

    // Add to new class
    const { error: insertError } = await supabase
      .from('class_enrollments')
      .insert({ student_id: student.id, class_id: targetClassId });

    if (insertError) {
      toast({ title: 'Error', description: 'Failed to add student to new class.', variant: 'destructive' });
    } else {
      toast({ title: 'Student Moved' });
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
            <div className="bg-muted rounded-xl p-4">
              <p className="font-bold text-lg">{student.name}</p>
              {/* Email hidden for privacy */}
            </div>


            {otherClasses.length > 0 && (
              <div className="space-y-2">
                <Label>Move to another class</Label>
                <div className="flex gap-2">
                  <Select value={targetClassId} onValueChange={setTargetClassId}>
                    <SelectTrigger className="rounded-xl flex-1">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
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
                    className="rounded-xl"
                  >
                    {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : <ArrowRightLeft className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={handleRemove}
            disabled={isLoading}
            className="rounded-xl w-full"
          >
            {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : <><UserMinus className="h-4 w-4 mr-2" /> Remove from Class</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

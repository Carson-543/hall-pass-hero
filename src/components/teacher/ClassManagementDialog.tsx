import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useCurrentPeriod } from '@/hooks/useCurrentPeriod';
import { Loader2 } from 'lucide-react';

interface ClassInfo {
  id: string;
  name: string;
  period_order: number;
  join_code: string;
  max_concurrent_bathroom?: number;
}


interface ClassManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingClass: ClassInfo | null;
  userId: string;
  onSaved: () => void;
}

export const ClassManagementDialog = ({
  open,
  onOpenChange,
  editingClass,
  userId,
  onSaved
}: ClassManagementDialogProps) => {
  const { toast } = useToast();
  const [className, setClassName] = useState('');
  const [periodOrder, setPeriodOrder] = useState('1');

  const [defaultPeriodCount, setDefaultPeriodCount] = useState(7);

  const [isLoading, setIsLoading] = useState(false);
  const { currentPeriod } = useCurrentPeriod();

  useEffect(() => {
    if (editingClass) {
      setClassName(editingClass.name);
      setPeriodOrder(editingClass.period_order.toString());
    } else {
      setClassName('');
      setPeriodOrder(currentPeriod?.period_order.toString() || '1');
    }
  }, [editingClass, open, currentPeriod]);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from('weekly_quota_settings')
        .select('default_period_count')
        .single();
      if (data?.default_period_count) {
        setDefaultPeriodCount(data.default_period_count);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!className.trim()) return;
    setIsLoading(true);

    if (editingClass) {
      const { error } = await supabase
        .from('classes')
        .update({ name: className, period_order: parseInt(periodOrder) })
        .eq('id', editingClass.id);

      if (error) {
        toast({ title: 'Error', description: 'Failed to update class.', variant: 'destructive' });
      } else {
        toast({ title: 'Class Updated' });
        onSaved();
        onOpenChange(false);
      }
    } else {
      const { data: joinCode } = await supabase.rpc('generate_join_code');
      const { error } = await supabase
        .from('classes')
        .insert({
          name: className,
          period_order: parseInt(periodOrder),
          teacher_id: userId,
          join_code: joinCode || Math.random().toString(36).substring(2, 8).toUpperCase()
        });


      if (error) {
        toast({ title: 'Error', description: 'Failed to create class.', variant: 'destructive' });
      } else {
        toast({ title: 'Class Created' });
        onSaved();
        onOpenChange(false);
      }
    }
    setIsLoading(false);
  };

  const handleDelete = async () => {
    if (!editingClass) return;
    setIsLoading(true);

    const { error } = await supabase
      .from('classes')
      .delete()
      .eq('id', editingClass.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to delete class. Remove all students first.', variant: 'destructive' });
    } else {
      toast({ title: 'Class Deleted' });
      onSaved();
      onOpenChange(false);
    }
    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {editingClass ? 'Edit Class' : 'Create Class'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Class Name</Label>
            <Input
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="e.g., English 101"
              className="rounded-xl h-12"
            />
          </div>
          <div className="space-y-2">
            <Label>Period</Label>
            <Select value={periodOrder} onValueChange={setPeriodOrder}>
              <SelectTrigger className="rounded-xl h-12">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: defaultPeriodCount }, (_, i) => i + 1).map(num => (
                  <SelectItem key={num} value={num.toString()}>
                    {num === 1 ? '1st' : num === 2 ? '2nd' : num === 3 ? '3rd' : `${num}th`} Period
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>


        </div>
        <DialogFooter className="flex gap-2">
          {editingClass && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isLoading}
              className="rounded-xl"
            >
              Delete
            </Button>
          )}
          <Button onClick={handleSave} disabled={isLoading} className="rounded-xl flex-1">
            {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : editingClass ? 'Save Changes' : 'Create Class'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useCurrentPeriod } from '@/hooks/useCurrentPeriod';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { GlowButton } from '@/components/ui/glow-button';
import { GlassCard } from '@/components/ui/glass-card';
import { motion, AnimatePresence } from 'framer-motion';

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
  organizationId: string | null;
  onSaved: () => void;
}

export const ClassManagementDialog = ({
  open,
  onOpenChange,
  editingClass,
  userId,
  organizationId,
  onSaved
}: ClassManagementDialogProps) => {
  const { toast } = useToast();
  const [className, setClassName] = useState('');
  const [periodOrder, setPeriodOrder] = useState('1');

  const [defaultPeriodCount, setDefaultPeriodCount] = useState(7);

  const [isLoading, setIsLoading] = useState(false);
  const { currentPeriod } = useCurrentPeriod();

  useEffect(() => {
    if (open) {
      if (editingClass) {
        setClassName(editingClass.name);
        setPeriodOrder(editingClass.period_order.toString());
      } else {
        setClassName('');
        // Only set default period from currentPeriod ONCE when opening
        setPeriodOrder(currentPeriod?.period_order.toString() || '1');
      }
    }
  }, [editingClass, open]); // Removed currentPeriod from dependencies to prevent resets

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
          organization_id: organizationId,
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
      <DialogContent className="max-w-md rounded-[2.5rem] border-white/10 bg-slate-950/90 backdrop-blur-3xl p-8 shadow-2xl overflow-hidden">
        {/* Background Glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 blur-[80px] pointer-events-none" />

        <DialogHeader className="relative z-10">
          <DialogTitle className="text-3xl font-black tracking-tight text-white mb-1">
            {editingClass ? 'Edit Class' : 'Create Class'}
          </DialogTitle>
          <p className="text-slate-300 font-medium">
            {editingClass ? 'Update your class details' : 'Add a new class to your roster'}
          </p>
        </DialogHeader>

        <div className="space-y-6 py-8 relative z-10">
          <div className="space-y-3">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">
              Class Name
            </Label>
            <Input
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="e.g., English 101"
              className="h-14 rounded-2xl bg-white/5 border-white/10 px-6 text-base font-medium text-white placeholder:text-slate-500 focus:ring-primary/20 transition-all border-2 focus:border-primary/50"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">
              Schedule Period
            </Label>
            <Select value={periodOrder} onValueChange={setPeriodOrder}>
              <SelectTrigger className="h-14 rounded-2xl bg-white/5 border-white/10 px-6 text-base font-medium text-white transition-all border-2 focus:border-primary/50">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-white/10 bg-slate-900/95 backdrop-blur-xl">
                {Array.from({ length: defaultPeriodCount }, (_, i) => i + 1).map(num => (
                  <SelectItem key={num} value={num.toString()} className="h-12 rounded-xl text-slate-200 focus:bg-primary/20 focus:text-white transition-colors">
                    {num === 1 ? '1st' : num === 2 ? '2nd' : num === 3 ? '3rd' : `${num}th`} Period
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-3 relative z-10">
          {editingClass && (
            <Button
              variant="ghost"
              onClick={handleDelete}
              disabled={isLoading}
              className="h-14 rounded-2xl px-6 font-bold text-destructive hover:bg-destructive/10 hover:text-destructive transition-all border-2 border-transparent hover:border-destructive/20"
            >
              <Trash2 className="w-5 h-5 mr-2" />
              Delete
            </Button>
          )}
          <GlowButton
            onClick={handleSave}
            disabled={isLoading || !className.trim()}
            className="flex-1 h-14 rounded-2xl text-lg text-white/1.5"
            variant={editingClass ? 'primary' : 'success'}
            loading={isLoading}
          >
            {editingClass ? (
              <><Save className="w-5 h-5 mr-2" /> Save Changes</>
            ) : (
              <><Plus className="w-5 h-5 mr-2" /> Create Class</>
            )}
          </GlowButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

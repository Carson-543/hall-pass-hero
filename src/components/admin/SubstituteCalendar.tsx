import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Calendar, ChevronLeft, ChevronRight, Plus, Trash2, UserCheck } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameDay } from 'date-fns';

interface Teacher {
  id: string;
  name: string;
}

interface ClassInfo {
  id: string;
  name: string;
  period_order: number;
}

interface SubAssignment {
  id: string;
  date: string;
  original_teacher_id: string;
  substitute_teacher_id: string;
  class_id: string;
  original_teacher_name?: string;
  substitute_teacher_name?: string;
  class_name?: string;
}

export const SubstituteCalendar = () => {
  const { toast } = useToast();
  const { organizationId } = useOrganization();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<SubAssignment[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Form state
  const [originalTeacherId, setOriginalTeacherId] = useState<string>('');
  const [substituteTeacherId, setSubstituteTeacherId] = useState<string>('');
  const [teacherClasses, setTeacherClasses] = useState<ClassInfo[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTeachers();
  }, [organizationId]);

  useEffect(() => {
    fetchAssignments();
  }, [currentMonth, organizationId]);

  useEffect(() => {
    if (originalTeacherId) {
      fetchTeacherClasses(originalTeacherId);
    } else {
      setTeacherClasses([]);
    }
  }, [originalTeacherId]);

  const fetchTeachers = async () => {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'teacher');

    if (!roles || roles.length === 0) return;

    const userIds = roles.map(r => r.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);

    if (profiles) {
      setTeachers(profiles.map(p => ({ id: p.id, name: p.full_name })));
    }
  };

  const fetchTeacherClasses = async (teacherId: string) => {
    const { data } = await supabase
      .from('classes')
      .select('id, name, period_order')
      .eq('teacher_id', teacherId)
      .order('period_order');

    if (data) {
      setTeacherClasses(data);
    }
  };

  const fetchAssignments = async () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    const { data } = await supabase
      .from('substitute_assignments')
      .select('*')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'));

    if (data && data.length > 0) {
      // Get names
      const teacherIds = [...new Set([
        ...data.map(a => a.original_teacher_id),
        ...data.map(a => a.substitute_teacher_id)
      ])];
      const classIds = [...new Set(data.map(a => a.class_id))];

      const [profilesRes, classesRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name').in('id', teacherIds),
        supabase.from('classes').select('id, name').in('id', classIds)
      ]);

      const profileMap = new Map(profilesRes.data?.map(p => [p.id, p.full_name]));
      const classMap = new Map(classesRes.data?.map(c => [c.id, c.name]));

      setAssignments(data.map(a => ({
        ...a,
        original_teacher_name: profileMap.get(a.original_teacher_id),
        substitute_teacher_name: profileMap.get(a.substitute_teacher_id),
        class_name: classMap.get(a.class_id)
      })));
    } else {
      setAssignments([]);
    }
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setDialogOpen(true);
    setOriginalTeacherId('');
    setSubstituteTeacherId('');
    setSelectedClassIds([]);
  };

  const handleSaveAssignment = async () => {
    if (!selectedDate || !originalTeacherId || !substituteTeacherId || selectedClassIds.length === 0) {
      toast({ title: 'Please fill all fields', variant: 'destructive' });
      return;
    }

    if (originalTeacherId === substituteTeacherId) {
      toast({ title: 'Original and substitute teacher cannot be the same', variant: 'destructive' });
      return;
    }

    setLoading(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    for (const classId of selectedClassIds) {
      await supabase
        .from('substitute_assignments')
        .upsert({
          organization_id: organizationId,
          date: dateStr,
          original_teacher_id: originalTeacherId,
          substitute_teacher_id: substituteTeacherId,
          class_id: classId,
        }, { onConflict: 'class_id,date' });
    }

    toast({ title: 'Substitute assignments saved' });
    setDialogOpen(false);
    fetchAssignments();
    setLoading(false);
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    await supabase.from('substitute_assignments').delete().eq('id', assignmentId);
    fetchAssignments();
    toast({ title: 'Assignment removed' });
  };

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  });

  const getAssignmentsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return assignments.filter(a => a.date === dateStr);
  };

  const toggleClass = (classId: string) => {
    setSelectedClassIds(prev =>
      prev.includes(classId)
        ? prev.filter(id => id !== classId)
        : [...prev, classId]
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Substitute Assignments
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium min-w-32 text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
              {day}
            </div>
          ))}
          {days.map(day => {
            const dayAssignments = getAssignmentsForDate(day);
            const isToday = isSameDay(day, new Date());
            
            return (
              <div
                key={day.toISOString()}
                className={`min-h-24 p-1 border rounded cursor-pointer hover:bg-accent/50 transition-colors ${
                  isToday ? 'border-primary bg-primary/5' : ''
                }`}
                onClick={() => handleDateClick(day)}
              >
                <div className={`text-xs font-medium mb-1 ${isToday ? 'text-primary' : ''}`}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-1">
                  {dayAssignments.slice(0, 2).map(a => (
                    <div
                      key={a.id}
                      className="text-xs bg-primary/10 text-primary rounded px-1 py-0.5 truncate"
                      title={`${a.substitute_teacher_name} → ${a.class_name}`}
                    >
                      {a.substitute_teacher_name?.split(' ')[0]}
                    </div>
                  ))}
                  {dayAssignments.length > 2 && (
                    <div className="text-xs text-muted-foreground">
                      +{dayAssignments.length - 2} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {selectedDate && format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Existing assignments for this date */}
              {selectedDate && getAssignmentsForDate(selectedDate).length > 0 && (
                <div className="space-y-2">
                  <Label>Current Assignments</Label>
                  {getAssignmentsForDate(selectedDate).map(a => (
                    <div key={a.id} className="flex items-center justify-between p-2 bg-muted rounded">
                      <div className="text-sm">
                        <span className="font-medium">{a.substitute_teacher_name}</span>
                        <span className="text-muted-foreground"> → </span>
                        <span>{a.class_name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAssignment(a.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <Label>Original Teacher (being subbed for)</Label>
                <Select value={originalTeacherId} onValueChange={setOriginalTeacherId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Substitute Teacher</Label>
                <Select value={substituteTeacherId} onValueChange={setSubstituteTeacherId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select substitute" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.filter(t => t.id !== originalTeacherId).map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {teacherClasses.length > 0 && (
                <div className="space-y-2">
                  <Label>Classes to Cover</Label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {teacherClasses.map(c => (
                      <div key={c.id} className="flex items-center gap-2">
                        <Checkbox
                          id={c.id}
                          checked={selectedClassIds.includes(c.id)}
                          onCheckedChange={() => toggleClass(c.id)}
                        />
                        <label htmlFor={c.id} className="text-sm cursor-pointer">
                          Period {c.period_order}: {c.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveAssignment} disabled={loading}>
                {loading ? 'Saving...' : 'Save Assignment'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

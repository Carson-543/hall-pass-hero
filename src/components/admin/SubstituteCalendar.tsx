import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/contexts/OrganizationContext';
import { ChevronLeft, ChevronRight, Trash2, UserCheck, Users } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameDay } from 'date-fns';

interface Teacher {
  id: string;
  name: string;
  lastName: string;
}

interface ClassInfo {
  id: string;
  name: string;
  period_order: number;
  teacher_last_name?: string;
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
  period_order?: number;
}

// Group assignments by substitute teacher
interface GroupedAssignment {
  substitute_teacher_id: string;
  substitute_teacher_name: string;
  classes: { id: string; class_name: string; period_order: number; assignment_id: string }[];
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
    if (organizationId) fetchTeachers();
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) fetchAssignments();
  }, [currentMonth, organizationId]);

  useEffect(() => {
    if (originalTeacherId) {
      fetchTeacherClasses(originalTeacherId);
    } else {
      setTeacherClasses([]);
      setSelectedClassIds([]);
    }
  }, [originalTeacherId]);

  const getLastName = (fullName: string) => {
    const parts = fullName.trim().split(' ');
    return parts[parts.length - 1];
  };

  const fetchTeachers = async () => {
    if (!organizationId) return;
    
    try {
      // Get teachers in this organization
      const { data: memberships, error: memberError } = await supabase
        .from('organization_memberships')
        .select('user_id')
        .eq('organization_id', organizationId);
      
      if (memberError) {
        console.error("Error fetching memberships:", memberError);
        return;
      }
      if (!memberships || memberships.length === 0) {
        console.log("No memberships found for organization");
        setTeachers([]);
        return;
      }
      
      const memberIds = memberships.map(m => m.user_id);

      const { data: roles, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'teacher')
        .in('user_id', memberIds);

      if (roleError) {
        console.error("Error fetching roles:", roleError);
        return;
      }
      if (!roles || roles.length === 0) {
        console.log("No teachers found in organization");
        setTeachers([]);
        return;
      }

      const userIds = roles.map(r => r.user_id);
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      if (profileError) {
        console.error("Error fetching profiles:", profileError);
        return;
      }

      if (profiles) {
        setTeachers(profiles.map(p => ({ 
          id: p.id, 
          name: p.full_name,
          lastName: getLastName(p.full_name)
        })));
      }
    } catch (error) {
      console.error("Error in fetchTeachers:", error);
    }
  };

  const fetchTeacherClasses = async (teacherId: string) => {
    const { data } = await supabase
      .from('classes')
      .select('id, name, period_order')
      .eq('teacher_id', teacherId)
      .order('period_order');

    if (data) {
      const teacher = teachers.find(t => t.id === teacherId);
      setTeacherClasses(data.map(c => ({
        ...c,
        teacher_last_name: teacher?.lastName
      })));
    }
  };

  const fetchAssignments = async () => {
    if (!organizationId) return;
    
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    const { data } = await supabase
      .from('substitute_assignments')
      .select('id, date, original_teacher_id, substitute_teacher_id, class_id')
      .eq('organization_id', organizationId)
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'));

    if (data && data.length > 0) {
      const teacherIds = [...new Set([
        ...data.map(a => a.original_teacher_id),
        ...data.map(a => a.substitute_teacher_id)
      ])];
      const classIds = [...new Set(data.map(a => a.class_id))];

      const [profilesRes, classesRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name').in('id', teacherIds),
        supabase.from('classes').select('id, name, period_order').in('id', classIds)
      ]);

      const profileMap = new Map(profilesRes.data?.map(p => [p.id, p.full_name]));
      const classMap = new Map(classesRes.data?.map(c => [c.id, { name: c.name, period_order: c.period_order }]));

      setAssignments(data.map(a => ({
        ...a,
        original_teacher_name: profileMap.get(a.original_teacher_id),
        substitute_teacher_name: profileMap.get(a.substitute_teacher_id),
        class_name: classMap.get(a.class_id)?.name,
        period_order: classMap.get(a.class_id)?.period_order
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

  const handleSelectAll = () => {
    if (selectedClassIds.length === teacherClasses.length) {
      setSelectedClassIds([]);
    } else {
      setSelectedClassIds(teacherClasses.map(c => c.id));
    }
  };

  const handleSaveAssignment = async () => {
    if (!selectedDate || !originalTeacherId || !substituteTeacherId || selectedClassIds.length === 0 || !organizationId) {
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

  // Group assignments by substitute teacher for display
  const getGroupedAssignments = (date: Date): GroupedAssignment[] => {
    const dateAssignments = getAssignmentsForDate(date);
    const grouped = new Map<string, GroupedAssignment>();

    dateAssignments.forEach(a => {
      if (!grouped.has(a.substitute_teacher_id)) {
        grouped.set(a.substitute_teacher_id, {
          substitute_teacher_id: a.substitute_teacher_id,
          substitute_teacher_name: a.substitute_teacher_name || 'Unknown',
          classes: []
        });
      }
      grouped.get(a.substitute_teacher_id)!.classes.push({
        id: a.class_id,
        class_name: a.class_name || 'Unknown',
        period_order: a.period_order || 0,
        assignment_id: a.id
      });
    });

    // Sort classes by period order within each group
    grouped.forEach(g => {
      g.classes.sort((a, b) => a.period_order - b.period_order);
    });

    return Array.from(grouped.values());
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
            const grouped = getGroupedAssignments(day);
            const isToday = isSameDay(day, new Date());
            
            return (
              <div
                key={day.toISOString()}
                className={`min-h-24 p-1 border rounded cursor-pointer hover:bg-accent/50 transition-colors ${
                  isToday ? 'border-primary bg-primary/5' : ''
                }`}
                onClick={() => handleDateClick(day)}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${isToday ? 'text-primary' : ''}`}>
                    {format(day, 'd')}
                  </span>
                  {dayAssignments.length > 0 && (
                    <Users className="h-3 w-3 text-primary" />
                  )}
                </div>
                <div className="space-y-0.5 mt-1">
                  {grouped.slice(0, 2).map(g => (
                    <div
                      key={g.substitute_teacher_id}
                      className="text-[10px] bg-primary/10 text-primary rounded px-1 py-0.5 truncate"
                      title={`${g.substitute_teacher_name}: P${g.classes.map(c => c.period_order).join(', P')}`}
                    >
                      {getLastName(g.substitute_teacher_name)}: P{g.classes.map(c => c.period_order).join(', ')}
                    </div>
                  ))}
                  {grouped.length > 2 && (
                    <div className="text-[10px] text-muted-foreground">
                      +{grouped.length - 2} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedDate && format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Current Assignments - Grouped by substitute */}
              {selectedDate && getGroupedAssignments(selectedDate).length > 0 && (
                <div className="space-y-2">
                  <Label className="font-bold">Current Assignments</Label>
                  {getGroupedAssignments(selectedDate).map(group => (
                    <div key={group.substitute_teacher_id} className="p-3 bg-muted rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{group.substitute_teacher_name}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {group.classes.map(c => (
                          <div key={c.id} className="flex items-center gap-1 bg-background px-2 py-1 rounded text-xs">
                            <span>P{c.period_order}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAssignment(c.assignment_id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <Label>Teacher Being Covered</Label>
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
                  <div className="flex items-center justify-between">
                    <Label>Classes to Cover</Label>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleSelectAll}
                      className="text-xs h-7"
                    >
                      {selectedClassIds.length === teacherClasses.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                    {teacherClasses.map(c => (
                      <div key={c.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded">
                        <Checkbox
                          id={c.id}
                          checked={selectedClassIds.includes(c.id)}
                          onCheckedChange={() => toggleClass(c.id)}
                        />
                        <label htmlFor={c.id} className="text-sm cursor-pointer flex-1">
                          Period {c.period_order}: {c.name}
                          {c.teacher_last_name && (
                            <span className="text-muted-foreground ml-1">({c.teacher_last_name})</span>
                          )}
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
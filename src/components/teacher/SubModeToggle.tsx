import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { UserCheck, X } from 'lucide-react';

interface SubModeToggleProps {
  userId: string;
  onSubModeChange: (enabled: boolean, teacherId: string | null, classes: any[]) => void;
}

interface SubAssignment {
  class_id: string;
  original_teacher_id: string;
  class_name: string;
  period_order: number;
  teacher_name: string;
}

export const SubModeToggle = ({ userId, onSubModeChange }: SubModeToggleProps) => {
  const [subAssignments, setSubAssignments] = useState<SubAssignment[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [isSubMode, setIsSubMode] = useState(false);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetchSubAssignments();
  }, [userId]);

  const fetchSubAssignments = async () => {
    const today = new Date().toISOString().split('T')[0];

    const { data: assignments } = await supabase
      .from('substitute_assignments')
      .select('class_id, original_teacher_id')
      .eq('substitute_teacher_id', userId)
      .eq('date', today);

    if (!assignments || assignments.length === 0) {
      setSubAssignments([]);
      return;
    }

    // Get class and teacher details
    const classIds = assignments.map(a => a.class_id);
    const teacherIds = [...new Set(assignments.map(a => a.original_teacher_id))];

    const [classesRes, profilesRes] = await Promise.all([
      supabase.from('classes').select('id, name, period_order').in('id', classIds),
      supabase.from('profiles').select('id, full_name').in('id', teacherIds)
    ]);

    const classMap = new Map(classesRes.data?.map(c => [c.id, c]));
    const profileMap = new Map(profilesRes.data?.map(p => [p.id, p.full_name]));

    const mapped = assignments.map(a => {
      const cls = classMap.get(a.class_id);
      return {
        class_id: a.class_id,
        original_teacher_id: a.original_teacher_id,
        class_name: cls?.name || 'Unknown',
        period_order: cls?.period_order || 0,
        teacher_name: profileMap.get(a.original_teacher_id) || 'Unknown'
      };
    });

    setSubAssignments(mapped);

    // Group by teacher
    const uniqueTeachers = [...new Set(mapped.map(a => a.original_teacher_id))].map(id => ({
      id,
      name: profileMap.get(id) || 'Unknown'
    }));
    setTeachers(uniqueTeachers);
  };

  const handleEnterSubMode = async () => {
    if (!selectedTeacherId) return;

    const teacherClasses = subAssignments
      .filter(a => a.original_teacher_id === selectedTeacherId)
      .map(a => ({
        id: a.class_id,
        name: a.class_name,
        period_order: a.period_order
      }));

    setIsSubMode(true);
    onSubModeChange(true, selectedTeacherId, teacherClasses);
  };

  const handleExitSubMode = () => {
    setIsSubMode(false);
    setSelectedTeacherId('');
    onSubModeChange(false, null, []);
  };

  if (subAssignments.length === 0) {
    return null;
  }

  if (isSubMode) {
    const teacherName = teachers.find(t => t.id === selectedTeacherId)?.name;
    return (
      <Card className="rounded-2xl transition-all duration-300 backdrop-blur-xl border p-6 bg-slate-900/60 border-white/10">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/20">
                <UserCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-white">Substitute Mode Active</p>
                <p className="text-sm text-white/10">
                  Managing classes for {teacherName}
                </p>
              </div>
            </div>
            <Button class='flex w-full items-center justify-between py-2 ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 h-14 rounded-2xl bg-white/10 border-2 border-white/20 shadow-xl text-lg font-bold px-6 flex-1 text-white hover:bg-white/15 transition-all' onClick={handleExitSubMode}>
              <X className="h-4 w-4 mr-1" />
              Exit Sub Mode
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <UserCheck className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="font-medium">You have substitute assignments today</p>
            <p className="text-sm text-muted-foreground">
              Select a teacher to manage their classes
            </p>
          </div>
          <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select teacher" />
            </SelectTrigger>
            <SelectContent>
              {teachers.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleEnterSubMode} disabled={!selectedTeacherId}>
            Enter Sub Mode
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

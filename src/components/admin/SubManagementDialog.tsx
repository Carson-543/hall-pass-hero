import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Trash2 } from 'lucide-react';
import { format } from 'date-fns';

interface Teacher {
    id: string;
    name: string;
    lastName: string;
    role?: string;
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

interface GroupedAssignment {
    substitute_teacher_id: string;
    substitute_teacher_name: string;
    classes: { id: string; class_name: string; period_order: number; assignment_id: string }[];
}

interface SubManagementDialogProps {
    date: Date | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organizationId: string | null;
}

export const SubManagementDialog = ({ date, open, onOpenChange, organizationId }: SubManagementDialogProps) => {
    const { toast } = useToast();
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [assignments, setAssignments] = useState<SubAssignment[]>([]);

    // Form state
    const [originalTeacherId, setOriginalTeacherId] = useState<string>('');
    const [substituteTeacherId, setSubstituteTeacherId] = useState<string>('');
    const [teacherClasses, setTeacherClasses] = useState<ClassInfo[]>([]);
    const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (organizationId && open) {
            fetchTeachers();
        }
    }, [organizationId, open]);

    useEffect(() => {
        if (organizationId && date && open) {
            fetchAssignments();
        }
    }, [organizationId, date, open]);

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

        const { data: memberships } = await supabase
            .from('organization_memberships')
            .select('user_id')
            .eq('organization_id', organizationId);

        console.log(`🔍 Fetching teachers. Memberships found: ${memberships?.length}`);
        if (memberships) console.log("Ids:", memberships.map(m => m.user_id));

        if (!memberships) return;
        const memberIds = memberships.map(m => m.user_id);

        const { data: roles } = await supabase
            .from('user_roles')
            .select('user_id, role')
            .in('role', ['teacher', 'admin'])
            .in('user_id', memberIds);

        console.log(`🔍 Roles found (teacher/admin): ${roles?.length}`, roles);

        if (!roles || roles.length === 0) return;

        const roleMap = new Map(roles.map(r => [r.user_id, r.role]));
        const userIds = roles.map(r => r.user_id);

        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);

        if (profiles) {
            const sortedTeachers = profiles.map(p => ({
                id: p.id,
                name: p.full_name,
                lastName: getLastName(p.full_name),
                role: roleMap.get(p.id)
            })).sort((a, b) => a.lastName.localeCompare(b.lastName));

            setTeachers(sortedTeachers);
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
        if (!organizationId || !date) return;

        const dateStr = format(date, 'yyyy-MM-dd');

        const { data } = await supabase
            .from('substitute_assignments')
            .select('id, date, original_teacher_id, substitute_teacher_id, class_id')
            .eq('organization_id', organizationId)
            .eq('date', dateStr);

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

    const handleSelectAll = () => {
        if (selectedClassIds.length === teacherClasses.length) {
            setSelectedClassIds([]);
        } else {
            setSelectedClassIds(teacherClasses.map(c => c.id));
        }
    };

    const toggleClass = (classId: string) => {
        setSelectedClassIds(prev =>
            prev.includes(classId)
                ? prev.filter(id => id !== classId)
                : [...prev, classId]
        );
    };

    const handleSaveAssignment = async () => {
        if (!date || !originalTeacherId || !substituteTeacherId || selectedClassIds.length === 0 || !organizationId) {
            toast({ title: 'Please fill all fields', variant: 'destructive' });
            return;
        }

        if (originalTeacherId === substituteTeacherId) {
            toast({ title: 'Original and substitute teacher cannot be the same', variant: 'destructive' });
            return;
        }

        setLoading(true);
        const dateStr = format(date, 'yyyy-MM-dd');

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
        fetchAssignments();
        setLoading(false);
        // Do not close dialog automatically, allowing multiple assignments
    };

    const handleDeleteAssignment = async (assignmentId: string) => {
        await supabase.from('substitute_assignments').delete().eq('id', assignmentId);
        fetchAssignments();
        toast({ title: 'Assignment removed' });
    };

    const getGroupedAssignments = (): GroupedAssignment[] => {
        const grouped = new Map<string, GroupedAssignment>();

        assignments.forEach(a => {
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

        grouped.forEach(g => {
            g.classes.sort((a, b) => a.period_order - b.period_order);
        });

        return Array.from(grouped.values());
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        Manage Substitutes - {date && format(date, 'EEEE, MMMM d, yyyy')}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-2">
                    {/* Current Assignments */}
                    {assignments.length > 0 && (
                        <div className="space-y-3">
                            <Label className="font-bold text-base">Current Assignments</Label>
                            {getGroupedAssignments().map(group => (
                                <div key={group.substitute_teacher_id} className="p-4 bg-muted/40 rounded-xl space-y-2 border">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-lg">{group.substitute_teacher_name}</span>
                                        <span className="text-xs font-medium text-muted-foreground uppercase">Substitute</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {group.classes.map(c => (
                                            <div key={c.id} className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-lg border shadow-sm text-sm">
                                                <span><span className="font-bold text-muted-foreground mr-1">P{c.period_order}</span> {c.class_name}</span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5 text-destructive hover:text-destructive hover:bg-destructive/10 -mr-1"
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

                    <div className="space-y-4 rounded-xl border p-4 bg-muted/10">
                        <h3 className="font-semibold">New Assignment</h3>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Original Teacher</Label>
                                <Select value={originalTeacherId} onValueChange={setOriginalTeacherId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select teacher" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {teachers.map(t => (
                                            <SelectItem key={t.id} value={t.id}>
                                                {t.name} {t.role === 'admin' ? '(Admin)' : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Substitute</Label>
                                <Select value={substituteTeacherId} onValueChange={setSubstituteTeacherId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select substitute" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {teachers.filter(t => t.id !== originalTeacherId).map(t => (
                                            <SelectItem key={t.id} value={t.id}>
                                                {t.name} {t.role === 'admin' ? '(Admin)' : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
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
                                {/* Optimized max-height for scrolling list */}
                                <div className="space-y-1 max-h-60 overflow-y-auto border rounded-lg p-2 bg-background">
                                    {teacherClasses.map(c => (
                                        <div key={c.id} className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer" onClick={() => toggleClass(c.id)}>
                                            <Checkbox
                                                id={c.id}
                                                checked={selectedClassIds.includes(c.id)}
                                                onCheckedChange={() => toggleClass(c.id)}
                                            />
                                            <label htmlFor={c.id} className="text-sm cursor-pointer flex-1 font-medium">
                                                Period {c.period_order}: {c.name}
                                                {c.teacher_last_name && (
                                                    <span className="text-muted-foreground ml-1.5 text-xs">({c.teacher_last_name})</span>
                                                )}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <Button onClick={handleSaveAssignment} disabled={loading || !substituteTeacherId || selectedClassIds.length === 0} className="w-full">
                            {loading ? 'Saving...' : 'Assign Substitute'}
                        </Button>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

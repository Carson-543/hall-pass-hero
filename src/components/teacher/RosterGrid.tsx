import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Copy, History, UserMinus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Student {
    id: string;
    name: string;
    email: string;
}

interface RosterGridProps {
    students: Student[];
    currentClass: { join_code: string } | undefined;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    onViewHistory: (student: Student) => void;
    onRemoveStudent: (student: Student) => void;
}

export const RosterGrid = ({
    students,
    currentClass,
    searchQuery,
    setSearchQuery,
    onViewHistory,
    onRemoveStudent
}: RosterGridProps) => {
    const { toast } = useToast();
    const filteredStudents = students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="space-y-4 pt-12 border-t mt-12">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative w-full sm:max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        placeholder="Search class roster..."
                        className="h-14 pl-12 rounded-2xl border-none shadow-inner bg-muted/40 font-medium"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                {currentClass && (
                    <div className="flex items-center gap-4 bg-primary/5 border-2 border-primary/20 p-2 pl-6 rounded-2xl group w-full sm:w-auto justify-between h-14">
                        <div>
                            <p className="text-[10px] font-black text-primary/60 uppercase leading-none mb-1">Join Code</p>
                            <span className="text-2xl font-black tracking-[0.15em] text-primary">{currentClass.join_code}</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 rounded-xl bg-white shadow-sm hover:bg-primary hover:text-white transition-colors"
                            onClick={() => {
                                navigator.clipboard.writeText(currentClass.join_code);
                                toast({ title: "Code Copied", description: "Copied to clipboard" });
                            }}
                        >
                            <Copy className="h-5 w-5" />
                        </Button>
                    </div>
                )}
            </div>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredStudents.map(student => (
                    <div key={student.id} className="bg-card p-4 rounded-2xl shadow-sm border flex items-center justify-between group hover:border-primary/50 transition-colors">
                        <p className="font-bold text-lg">{student.name}</p>
                        <div className="flex gap-2">
                            <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl bg-muted/50 opacity-50 group-hover:opacity-100" onClick={() => onViewHistory(student)}>
                                <History className="h-5 w-5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl bg-muted/50 opacity-50 group-hover:opacity-100" onClick={() => onRemoveStudent(student)}>
                                <UserMinus className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

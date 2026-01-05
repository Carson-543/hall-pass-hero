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
        <div className="space-y-6 pt-12 border-t border-white/10 mt-12">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="relative w-full sm:max-w-md">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                    <Input
                        placeholder="Search class roster..."
                        className="h-14 pl-14 rounded-2xl border-2 border-white/10 shadow-inner bg-white/5 font-extrabold text-white placeholder:text-slate-600 focus:border-blue-500/50 transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                {currentClass && (
                    <div className="flex items-center gap-5 bg-blue-600/10 border-2 border-blue-500/20 p-2 pl-6 rounded-2xl group w-full sm:w-auto justify-between h-14 shadow-xl shadow-blue-500/5">
                        <div className="flex flex-col">
                            <p className="text-[10px] font-black text-blue-400 uppercase leading-none mb-1.5 tracking-widest">Join Code</p>
                            <span className="text-2xl font-black tracking-[0.2em] text-white leading-none">{currentClass.join_code}</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 rounded-xl bg-white/10 shadow-sm hover:bg-blue-600 hover:text-white transition-all text-white border border-white/10"
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
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredStudents.map(student => (
                    <div key={student.id} className="bg-white/5 p-5 rounded-[1.5rem] shadow-xl border-2 border-white/5 flex items-center justify-between group hover:border-blue-500/30 transition-all duration-300">
                        <p className="font-black text-xl text-white tracking-tight">{student.name}</p>
                        <div className="flex gap-2">
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-10 w-10 rounded-xl bg-white/5 text-slate-400 hover:bg-blue-600/20 hover:text-blue-400 border border-white/5 hover:border-blue-500/30 transition-all"
                                onClick={() => onViewHistory(student)}
                            >
                                <History className="h-5 w-5" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-10 w-10 rounded-xl bg-white/5 text-slate-400 hover:bg-red-600/20 hover:text-red-500 border border-white/5 hover:border-red-500/30 transition-all"
                                onClick={() => onRemoveStudent(student)}
                            >
                                <UserMinus className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

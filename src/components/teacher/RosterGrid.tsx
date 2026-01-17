import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Copy, History, Pencil, Trash2 } from 'lucide-react';
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
    onManageStudent: (student: Student) => void;
}

export const RosterGrid = ({
    students,
    currentClass,
    searchQuery,
    setSearchQuery,
    onViewHistory,
    onManageStudent
}: RosterGridProps) => {
    const { toast } = useToast();
    const filteredStudents = students.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-1 mb-4">
                <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
                    Class Roster
                </h2>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-3.5">
                    Manage students and view history
                </p>
            </div>
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
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-9 px-3 rounded-xl bg-white/5 text-slate-400 hover:bg-blue-600/20 hover:text-blue-400 border border-white/5 hover:border-blue-500/30 transition-all flex items-center gap-2"
                                onClick={() => onViewHistory(student)}
                            >
                                <History className="h-4 w-4" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">History</span>
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-9 px-3 rounded-xl bg-white/5 text-slate-400 hover:bg-emerald-600/20 hover:text-emerald-400 border border-white/5 hover:border-emerald-500/30 transition-all flex items-center gap-2"
                                onClick={() => onManageStudent(student)}
                            >
                                <Pencil className="h-3.5 w-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Edit</span>
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-9 px-3 rounded-xl bg-white/5 text-slate-400 hover:bg-red-600/20 hover:text-red-500 border border-white/5 hover:border-red-500/30 transition-all flex items-center gap-2"
                                onClick={() => onManageStudent(student)}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Remove</span>
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

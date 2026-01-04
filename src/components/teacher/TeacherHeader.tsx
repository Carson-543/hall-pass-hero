import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

interface TeacherHeaderProps {
    signOut: () => void;
}

export const TeacherHeader = ({ signOut }: TeacherHeaderProps) => {
    return (
        <header className="flex items-center justify-between mb-6 pt-4">
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                    <span className="text-primary-foreground font-bold text-xl">T</span>
                </div>
                <h1 className="text-xl font-bold">Teacher Dashboard</h1>
            </div>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut()}
                className="text-muted-foreground hover:text-destructive"
            >
                <LogOut className="h-4 w-4 mr-2" /> Sign Out
            </Button>
        </header>
    );
};

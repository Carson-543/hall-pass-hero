import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, KeyRound } from 'lucide-react';
import { GlowButton } from '@/components/ui/glow-button';

interface JoinClassDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onJoined: () => void;
}

export const JoinClassDialog = ({
    open,
    onOpenChange,
    onJoined
}: JoinClassDialogProps) => {
    const { toast } = useToast();
    const [joinCode, setJoinCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleJoin = async () => {
        const code = joinCode.trim().toUpperCase();
        
        // Basic client-side validation
        if (code.length < 4) {
            toast({
                title: 'Invalid Code',
                description: 'Please enter a valid join code.',
                variant: 'destructive'
            });
            return;
        }

        setIsLoading(true);

        try {
            // First lookup the class by join code
            const { data: classData, error: lookupError } = await supabase.rpc('lookup_class_by_join_code', {
                _join_code: code
            });

            if (lookupError) throw lookupError;

            if (!classData || classData.length === 0) {
                toast({
                    title: 'Class Not Found',
                    description: 'No class found with that join code. Please check and try again.',
                    variant: 'destructive'
                });
                return;
            }

            const classInfo = classData[0];

            // Try to enroll in the class
            const { error: enrollError } = await supabase
                .from('class_enrollments')
                .insert({ class_id: classInfo.id, student_id: (await supabase.auth.getUser()).data.user?.id });

            if (enrollError) {
                // Check if already enrolled (duplicate key)
                if (enrollError.code === '23505') {
                    toast({
                        title: 'Welcome Back!',
                        description: `You are already enrolled in ${classInfo.name}.`,
                    });
                } else {
                    throw enrollError;
                }
            } else {
                toast({
                    title: 'Joined Class!',
                    description: `You are now a member of ${classInfo.name}.`,
                });
            }

            setJoinCode('');
            onJoined(); // Refresh the parent list
            onOpenChange(false); // Close dialog

        } catch (error: any) {
            console.error('Join Error:', error);
            toast({
                title: 'Error',
                description: 'An unexpected error occurred. Please try again.',
                variant: 'destructive'
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md rounded-[2.5rem] border-white/10 bg-slate-950/90 backdrop-blur-3xl p-8 shadow-2xl overflow-hidden">
                {/* Visual Background Glow */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-600/20 blur-[80px] pointer-events-none" />

                <DialogHeader className="relative z-10">
                    <div className="w-16 h-16 rounded-[1.5rem] bg-blue-600/20 flex items-center justify-center mb-6 border border-blue-500/30">
                        <KeyRound className="w-8 h-8 text-blue-400" />
                    </div>
                    <DialogTitle className="text-3xl font-black tracking-tight text-white mb-1">
                        Join a Class
                    </DialogTitle>
                    <p className="text-slate-300 font-medium">
                        Enter the code provided by your teacher.
                    </p>
                </DialogHeader>

                <div className="space-y-6 py-8 relative z-10">
                    <div className="space-y-3">
                        <Label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">
                            Join Code
                        </Label>
                        <Input
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isLoading) handleJoin();
                            }}
                            placeholder="ABCXYZ"
                            maxLength={8}
                            className="h-16 rounded-2xl bg-white/5 border-white/10 px-6 text-2xl font-mono font-black text-center text-white placeholder:text-slate-700 focus:ring-blue-500/20 transition-all border-2 focus:border-blue-500/50 uppercase tracking-widest"
                            autoFocus
                        />
                    </div>
                </div>

                <DialogFooter className="relative z-10">
                    <GlowButton
                        onClick={handleJoin}
                        disabled={isLoading || joinCode.trim().length < 4}
                        className="w-full h-16 rounded-2xl text-lg font-black"
                        variant="primary"
                        loading={isLoading}
                    >
                        {!isLoading && <Plus className="w-5 h-5 mr-2" />} 
                        {isLoading ? 'Joining...' : 'Join Class'}
                    </GlowButton>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

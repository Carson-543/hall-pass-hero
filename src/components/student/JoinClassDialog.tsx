import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, KeyRound } from 'lucide-react';
import { GlowButton } from '@/components/ui/glow-button';

interface JoinClassDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
    onJoined: () => void;
}

export const JoinClassDialog = ({
    open,
    onOpenChange,
    userId,
    onJoined
}: JoinClassDialogProps) => {
    const { toast } = useToast();
    const [joinCode, setJoinCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleJoin = async () => {
        const code = joinCode.trim().toUpperCase();
        if (!code) return;

        setIsLoading(true);

        try {
            // 1. Find the class by join code
            const { data: classData, error: classError } = await supabase
                .from('classes')
                .select('id, name')
                .eq('join_code', code)
                .maybeSingle();

            if (classError) throw classError;
            if (!classData) {
                toast({
                    title: 'Invalid Code',
                    description: 'We couldn\'t find a class with that code.',
                    variant: 'destructive'
                });
                setIsLoading(false);
                return;
            }

            // 2. Check if already enrolled
            const { data: existingEnrollment } = await supabase
                .from('class_enrollments')
                .select('id')
                .eq('class_id', classData.id)
                .eq('student_id', userId)
                .maybeSingle();

            if (existingEnrollment) {
                toast({
                    title: 'Already Enrolled',
                    description: `You are already a member of ${classData.name}.`,
                    variant: 'destructive'
                });
                setIsLoading(false);
                onOpenChange(false);
                return;
            }

            // 3. Enroll the student
            const { error: enrollError } = await supabase
                .from('class_enrollments')
                .insert({
                    class_id: classData.id,
                    student_id: userId
                });

            if (enrollError) throw enrollError;

            toast({
                title: 'Joined Class!',
                description: `You've successfully joined ${classData.name}.`
            });

            setJoinCode('');
            onJoined();
            onOpenChange(false);
        } catch (error: any) {
            console.error('Error joining class:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to join class.',
                variant: 'destructive'
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md rounded-[2.5rem] border-white/10 bg-slate-950/90 backdrop-blur-3xl p-8 shadow-2xl overflow-hidden">
                {/* Background Glow */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-600/20 blur-[80px] pointer-events-none" />

                <DialogHeader className="relative z-10">
                    <div className="w-16 h-16 rounded-[1.5rem] bg-blue-600/20 flex items-center justify-center mb-6 border border-blue-500/30">
                        <KeyRound className="w-8 h-8 text-blue-400" />
                    </div>
                    <DialogTitle className="text-3xl font-black tracking-tight text-white mb-1">
                        Join a Class
                    </DialogTitle>
                    <p className="text-slate-300 font-medium">
                        Enter the 6-character code from your teacher.
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
                            placeholder="E.G., ABCXYZ"
                            maxLength={6}
                            className="h-16 rounded-2xl bg-white/5 border-white/10 px-6 text-2xl font-black text-center text-white placeholder:text-slate-700 focus:ring-blue-500/20 transition-all border-2 focus:border-blue-500/50 uppercase tracking-widest"
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
                        <Plus className="w-5 h-5 mr-2" /> Join Class
                    </GlowButton>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

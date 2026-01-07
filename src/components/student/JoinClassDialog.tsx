import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, KeyRound, Loader2 } from 'lucide-react';
import { GlowButton } from '@/components/ui/glow-button';

export const JoinClassDialog = ({ open, onOpenChange, onJoined }: { open: boolean, onOpenChange: (o: boolean) => void, onJoined: () => void }) => {
    const { toast } = useToast();
    const [joinCode, setJoinCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleJoin = async () => {
        const code = joinCode.trim(); // Send exactly what the computer generated
        if (!code) return;

        setIsLoading(true);

        try {
            // Log for your eyes in F12 console to see exactly what is sent
            console.log("Sending to DB:", code);

            const { data, error } = await supabase.rpc('join_class_by_code', {
                p_join_code: code
            });

            if (error) throw error;

            if (!data.success) {
                toast({
                    title: 'Join Error',
                    description: data.message, // This will now show the 'Deep Debug' messages
                    variant: 'destructive'
                });
                return;
            }

            toast({ title: 'Success!', description: `Joined ${data.class_name}` });
            setJoinCode('');
            onJoined();
            onOpenChange(false);

        } catch (error: any) {
            console.error("Critical Failure:", error);
            toast({
                title: 'System Error',
                description: error.message || 'Failed to connect to database.',
                variant: 'destructive'
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md rounded-[2.5rem] bg-slate-950 p-8 border-white/10 shadow-2xl">
                <DialogHeader>
                    <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-4">
                        <KeyRound className="text-blue-400" />
                    </div>
                    <DialogTitle className="text-2xl font-bold text-white">Enter Class Code</DialogTitle>
                </DialogHeader>

                <div className="py-6">
                    <Label className="text-slate-400 text-xs uppercase tracking-widest font-bold">Class Code</Label>
                    <Input
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value)}
                        placeholder="ABC-123"
                        className="mt-2 h-14 bg-white/5 border-white/10 text-xl text-center font-mono text-white"
                        autoFocus
                    />
                </div>

                <DialogFooter>
                    <GlowButton onClick={handleJoin} disabled={isLoading} className="w-full h-14">
                        {isLoading ? <Loader2 className="animate-spin" /> : "Join Class"}
                    </GlowButton>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

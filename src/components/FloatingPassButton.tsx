import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Zap, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloatingPassButtonProps {
  userId: string;
  currentClassId: string | null;
  hasActivePass: boolean;
  isQuotaExceeded: boolean;
  isSchoolDay: boolean;
  onPassRequested: () => void;
}

export const FloatingPassButton = ({
  userId,
  currentClassId,
  hasActivePass,
  isQuotaExceeded,
  isSchoolDay,
  onPassRequested,
}: FloatingPassButtonProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  if (!isSchoolDay || hasActivePass || !currentClassId) {
    return null;
  }

  const handleQuickPass = async () => {
  setIsLoading(true);
  setIsPressed(true);

  try {
    const { error } = await supabase
      .from('passes')
      .insert({
        student_id: userId,          // The teacher's ID (since they are acting as the "student" for this quick pass)
        class_id: currentClassId,
        destination: 'Restroom',
        status: 'approved', 
        approved_at: new Date().toISOString(),
        approved_by: userId,         // ADD THIS LINE: Pass the teacher's ID here
        is_over_limit: isQuotaExceeded,
        returned_at: null,
        confirmed_by: null
      });

    if (error) {
      console.error('Supabase Error:', error.message); // Log the exact error to console
      toast({
        title: 'Error',
        description: `Failed to start pass: ${error.message}`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Quick Pass Started',
        description: 'The pass is now active in the hallway.',
      });
      onPassRequested();
    }
  } catch (err) {
    console.error(err);
  } finally {
    setIsLoading(false);
    setTimeout(() => setIsPressed(false), 200);
  }
};
  
  return (
    <button
      onClick={handleQuickPass}
      disabled={isLoading}
      className={cn(
        "fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full shadow-lg",
        isQuotaExceeded ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground",
        "flex items-center justify-center transition-all duration-200 ease-out hover:scale-110 active:scale-95 disabled:opacity-50",
        isPressed && "scale-95",
        isLoading && "animate-pulse"
      )}
    >
      {isQuotaExceeded ? <AlertTriangle className="h-7 w-7" /> : <Zap className="h-7 w-7" />}
    </button>
  );
};

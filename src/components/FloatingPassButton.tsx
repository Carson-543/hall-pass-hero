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

  // Show the button if it's a school day, they don't have a pass, and they are in a class.
  // We NO LONGER return null if isQuotaExceeded is true.
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
          student_id: userId,
          class_id: currentClassId,
          destination: 'Restroom',
          status: 'approved', // Automatically set to approved
          approved_at: new Date().toISOString(), // Start the timer immediately
          is_over_limit: isQuotaExceeded, // Inform the teacher if they are over limit
        });

      if (error) {
        toast({
          title: 'Error',
          description: 'Failed to start pass.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: isQuotaExceeded ? 'Over-limit Pass Started' : 'Quick Pass Started',
          description: isQuotaExceeded 
            ? 'Pass approved, but teacher has been notified you are over your weekly limit.' 
            : 'Your restroom pass is now active.',
          variant: isQuotaExceeded ? 'default' : 'default',
        });
        onPassRequested();
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Something went wrong.',
        variant: 'destructive',
      });
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
        // Change color to amber/orange if they are over the limit to warn the student
        isQuotaExceeded ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground",
        "flex items-center justify-center",
        "transition-all duration-200 ease-out",
        "hover:scale-110 hover:shadow-xl",
        "active:scale-95",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        isPressed && "scale-95",
        isLoading && "animate-pulse"
      )}
      aria-label="Quick restroom pass"
    >
      {isQuotaExceeded ? (
        <AlertTriangle className={cn("h-7 w-7", isLoading && "animate-spin")} />
      ) : (
        <Zap className={cn("h-7 w-7", isLoading && "animate-spin")} />
      )}
      
      {/* Small badge to indicate over-limit status visually on the button */}
      {isQuotaExceeded && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white border-2 border-background">
          !
        </span>
      )}
    </button>
  );
};

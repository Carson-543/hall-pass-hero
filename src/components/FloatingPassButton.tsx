import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Zap } from 'lucide-react';
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

  // Don't show if conditions aren't met
  if (!isSchoolDay || hasActivePass || !currentClassId || isQuotaExceeded) {
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
        });

      if (error) {
        toast({
          title: 'Error',
          description: 'Failed to request pass.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Quick Pass Requested',
          description: 'Waiting for teacher approval.',
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
        "bg-primary text-primary-foreground",
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
      <Zap className={cn("h-7 w-7", isLoading && "animate-spin")} />
    </button>
  );
};

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface ShimmerProps {
  children: ReactNode;
  className?: string;
  active?: boolean;
}

export const Shimmer = ({ children, className, active = true }: ShimmerProps) => {
  if (!active) return <>{children}</>;
  
  return (
    <div className={cn('relative overflow-hidden', className)}>
      {children}
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
};

export default Shimmer;

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'pending' | 'approved' | 'active' | 'returned' | 'denied' | 'frozen';
  className?: string;
  pulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig = {
  pending: {
    bg: 'bg-warning/20',
    text: 'text-warning',
    border: 'border-warning/30',
    label: 'Pending',
  },
  approved: {
    bg: 'bg-success/20',
    text: 'text-success',
    border: 'border-success/30',
    label: 'Approved',
  },
  active: {
    bg: 'bg-primary/20',
    text: 'text-primary',
    border: 'border-primary/30',
    label: 'Active',
  },
  returned: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    border: 'border-border',
    label: 'Returned',
  },
  denied: {
    bg: 'bg-destructive/20',
    text: 'text-destructive',
    border: 'border-destructive/30',
    label: 'Denied',
  },
  frozen: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-500',
    border: 'border-blue-500/30',
    label: 'Frozen',
  },
};

const sizes = {
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-xs px-3 py-1',
  lg: 'text-sm px-4 py-1.5',
};

export const StatusBadge = ({ status, className, pulse = false, size = 'md' }: StatusBadgeProps) => {
  const config = statusConfig[status];

  return (
    <motion.span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-bold uppercase tracking-wider',
        config.bg,
        config.text,
        config.border,
        sizes[size],
        className
      )}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
    >
      {pulse && (
        <motion.span
          className={cn('w-1.5 h-1.5 rounded-full', config.text.replace('text-', 'bg-'))}
          animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
      {config.label}
    </motion.span>
  );
};

export default StatusBadge;

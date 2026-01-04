import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface GlowButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'destructive' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  glow?: boolean;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}

const variants = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  success: 'bg-success text-success-foreground hover:bg-success/90',
  warning: 'bg-warning text-warning-foreground hover:bg-warning/90',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  ghost: 'bg-transparent hover:bg-muted text-foreground',
};

const sizes = {
  sm: 'h-9 px-4 text-sm rounded-xl',
  md: 'h-11 px-6 text-base rounded-2xl',
  lg: 'h-14 px-8 text-lg rounded-2xl',
  xl: 'h-16 px-10 text-xl rounded-3xl',
};

const glowVariants = {
  primary: 'shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:shadow-[0_0_30px_rgba(220,38,38,0.6)]',
  success: 'shadow-[0_0_20px_rgba(34,197,94,0.4)] hover:shadow-[0_0_30px_rgba(34,197,94,0.6)]',
  warning: 'shadow-[0_0_20px_rgba(234,179,8,0.4)] hover:shadow-[0_0_30px_rgba(234,179,8,0.6)]',
  destructive: 'shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:shadow-[0_0_30px_rgba(239,68,68,0.6)]',
  ghost: '',
};

export const GlowButton = ({
  children,
  variant = 'primary',
  size = 'md',
  glow = true,
  loading = false,
  className,
  disabled,
  onClick,
  type = 'button',
}: GlowButtonProps) => {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      className={cn(
        'relative font-bold transition-all duration-300 flex items-center justify-center gap-2',
        variants[variant],
        sizes[size],
        glow && glowVariants[variant],
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      disabled={disabled || loading}
    >
      {loading ? (
        <motion.div
          className="w-5 h-5 border-2 border-current border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      ) : (
        children
      )}
    </motion.button>
  );
};

export default GlowButton;

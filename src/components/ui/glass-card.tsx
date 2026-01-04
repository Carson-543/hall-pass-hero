import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface GlassCardProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  glowColor?: 'primary' | 'success' | 'warning' | 'destructive';
  hover3D?: boolean;
  variant?: 'default' | 'frosted' | 'solid';
}

const glowColors = {
  primary: 'shadow-[0_0_30px_rgba(220,38,38,0.3)]',
  success: 'shadow-[0_0_30px_rgba(34,197,94,0.3)]',
  warning: 'shadow-[0_0_30px_rgba(234,179,8,0.3)]',
  destructive: 'shadow-[0_0_30px_rgba(239,68,68,0.3)]',
};

export const GlassCard = ({
  children,
  className,
  glow = false,
  glowColor = 'primary',
  hover3D = false,
  variant = 'default',
  ...props
}: GlassCardProps) => {
  const variants = {
    default: 'bg-card/80 backdrop-blur-xl border border-border/50',
    frosted: 'bg-card/40 backdrop-blur-2xl border border-border/30',
    solid: 'bg-card border border-border',
  };

  return (
    <motion.div
      className={cn(
        'rounded-2xl p-6 transition-all duration-300',
        variants[variant],
        glow && glowColors[glowColor],
        hover3D && 'transform-gpu',
        className
      )}
      whileHover={hover3D ? {
        scale: 1.02,
        rotateX: 2,
        rotateY: 2,
        transition: { duration: 0.2 }
      } : undefined}
      style={hover3D ? { transformStyle: 'preserve-3d' } : undefined}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default GlassCard;

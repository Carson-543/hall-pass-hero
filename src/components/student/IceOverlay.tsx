import { motion } from 'framer-motion';
import { Snowflake } from 'lucide-react';

interface IceOverlayProps {
  active: boolean;
  freezeType?: string;
  endsAt?: string | null;
}

const Snowflakes = () => {
  const snowflakes = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 5,
    duration: 5 + Math.random() * 5,
    size: 8 + Math.random() * 16,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {snowflakes.map((flake) => (
        <motion.div
          key={flake.id}
          className="absolute text-blue-300/40"
          style={{ left: `${flake.x}%`, top: -30 }}
          animate={{
            y: ['0vh', '100vh'],
            rotate: [0, 360],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: flake.duration,
            repeat: Infinity,
            delay: flake.delay,
            ease: 'linear',
          }}
        >
          <Snowflake size={flake.size} />
        </motion.div>
      ))}
    </div>
  );
};

export const IceOverlay = ({ active, freezeType, endsAt }: IceOverlayProps) => {
  if (!active) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Frosted glass overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-500/10 via-blue-400/5 to-cyan-500/10 backdrop-blur-[2px]" />
      
      {/* Ice crystals on edges */}
      <div className="absolute inset-0 border-[3px] border-blue-300/30 rounded-none" />
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-300/50 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-300/50 to-transparent" />
      
      {/* Snowflakes */}
      <Snowflakes />
      
      {/* Frozen badge - centered at top */}
      <motion.div
        className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
      >
        <div className="flex items-center gap-3 px-6 py-3 rounded-full bg-blue-500/90 backdrop-blur-xl border border-blue-300/50 shadow-[0_0_40px_rgba(59,130,246,0.5)]">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          >
            <Snowflake className="w-5 h-5 text-blue-100" />
          </motion.div>
          <span className="text-sm font-bold text-blue-50 uppercase tracking-wider">
            {freezeType === 'all' ? 'All Passes' : 'Restroom'} Frozen
          </span>
          <motion.div
            animate={{ rotate: [0, -360] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          >
            <Snowflake className="w-5 h-5 text-blue-100" />
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default IceOverlay;

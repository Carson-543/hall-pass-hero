import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, ArrowLeft, Clock } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';

interface ActivePass {
  id: string;
  student_name: string;
  destination: string;
  approved_at?: string;
}

interface ActivePassListProps {
  activePasses: ActivePass[];
  onCheckIn: (id: string) => void;
}

const getDestinationStyle = (dest: string) => {
  switch (dest.toLowerCase()) {
    case 'restroom':
      return { bg: 'bg-blue-600/10', text: 'text-blue-400', border: 'border-blue-500/20', glow: 'shadow-blue-500/10' };
    case 'library':
      return { bg: 'bg-purple-600/10', text: 'text-purple-400', border: 'border-purple-500/20', glow: 'shadow-purple-500/10' };
    case 'nurse':
      return { bg: 'bg-red-600/10', text: 'text-red-400', border: 'border-red-500/20', glow: 'shadow-red-500/10' };
    case 'office':
      return { bg: 'bg-amber-600/10', text: 'text-amber-400', border: 'border-amber-500/20', glow: 'shadow-amber-500/10' };
    default:
      return { bg: 'bg-slate-600/10', text: 'text-slate-400', border: 'border-slate-500/20', glow: '' };
  }
};

const ElapsedTimer = ({ startTime, destination }: { startTime: string; destination: string }) => {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = Math.floor((new Date().getTime() - new Date(startTime).getTime()) / 1000);
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      setElapsed(`${m}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <span className="font-mono">{elapsed}</span>;
};

export const ActivePassList = ({ activePasses, onCheckIn }: ActivePassListProps) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shadow-lg shadow-blue-500/50" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 italic">
            Currently Out
          </h2>
          <motion.span
            className="px-2.5 py-0.5 rounded-full bg-white/10 text-white text-xs font-black border border-white/10"
            key={activePasses.length}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
          >
            {activePasses.length}
          </motion.span>
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        {activePasses.length === 0 ? (
          <motion.div
            className="py-16 text-center rounded-[2rem] border-2 border-dashed border-white/5 bg-white/[0.02]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Users className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm font-extrabold text-slate-500 uppercase tracking-widest">Hallway is clear</p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {activePasses.map((pass, index) => {
              const style = getDestinationStyle(pass.destination);

              return (
                <motion.div
                  key={pass.id}
                  layout
                  initial={{ opacity: 0, x: 30, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -30, scale: 0.95 }}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 30,
                    delay: index * 0.05
                  }}
                >
                  <GlassCard
                    className={`p-5 bg-white/5 border-2 border-white/10 hover:border-blue-500/30 shadow-xl ${style.glow}`}
                    hover3D
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-black text-white tracking-tight truncate mb-2">{pass.student_name}</h3>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full border-2 ${style.bg} ${style.text} ${style.border}`}>
                            {pass.destination}
                          </span>
                          {pass.approved_at && (
                            <div className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-mono font-black border border-blue-500/20">
                              <ElapsedTimer startTime={pass.approved_at} destination={pass.destination} />
                            </div>
                          )}
                        </div>
                      </div>

                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onCheckIn(pass.id)}
                        className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 text-white font-black text-sm shadow-xl shadow-blue-600/30 border-t border-white/20 whitespace-nowrap"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        Return
                      </motion.button>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

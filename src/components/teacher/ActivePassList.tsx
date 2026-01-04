import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { ElapsedTimer } from '@/components/ElapsedTimer';
import { ArrowLeft, Users } from 'lucide-react';

interface ActivePass {
  id: string;
  student_name: string;
  destination: string;
  from_class_name?: string;
  approved_at?: string;
}

interface ActivePassListProps {
  activePasses: ActivePass[];
  onCheckIn: (id: string) => void;
}

const getDestinationStyle = (destination: string) => {
  switch (destination?.toLowerCase()) {
    case 'restroom': return { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/30', glow: 'shadow-emerald-500/20' };
    case 'locker': return { bg: 'bg-blue-500/10', text: 'text-blue-600', border: 'border-blue-500/30', glow: 'shadow-blue-500/20' };
    case 'office': return { bg: 'bg-violet-500/10', text: 'text-violet-600', border: 'border-violet-500/30', glow: 'shadow-violet-500/20' };
    default: return { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border', glow: '' };
  }
};

export const ActivePassList = ({ activePasses, onCheckIn }: ActivePassListProps) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-success">
            Active
          </h2>
          <motion.span 
            className="px-2 py-0.5 rounded-full bg-success/10 text-success text-xs font-bold"
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
            className="py-12 text-center rounded-2xl border-2 border-dashed border-border/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Users className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm font-medium text-muted-foreground">No one in the hallway</p>
          </motion.div>
        ) : (
          <div className="space-y-3">
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
                    variant="frosted"
                    className={`p-4 border-l-4 border-l-success shadow-lg ${style.glow}`}
                    hover3D
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold truncate">{pass.student_name}</h3>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`inline-flex items-center px-3 py-1 text-xs font-bold rounded-full border ${style.bg} ${style.text} ${style.border}`}>
                            {pass.destination}
                          </span>
                          {pass.approved_at && (
                            <div className="px-3 py-1 rounded-full bg-success/10 text-success text-xs font-mono font-bold">
                              <ElapsedTimer startTime={pass.approved_at} destination={pass.destination} />
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onCheckIn(pass.id)}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-success text-success-foreground font-bold shadow-lg shadow-success/30"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        Check In
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

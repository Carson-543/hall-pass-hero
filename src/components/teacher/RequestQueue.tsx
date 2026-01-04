import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/glass-card';
import { GlowButton } from '@/components/ui/glow-button';
import { AlertTriangle, Check, X, Clock } from 'lucide-react';

interface PendingPass {
  id: string;
  student_name: string;
  destination: string;
  is_quota_exceeded?: boolean;
  requested_at?: string;
}

interface RequestQueueProps {
  pendingPasses: PendingPass[];
  onApprove: (id: string, override: boolean) => void;
  onDeny: (id: string) => void;
  isLoading?: boolean;
}

const getDestinationStyle = (destination: string) => {
  switch (destination?.toLowerCase()) {
    case 'restroom': return { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/30' };
    case 'locker': return { bg: 'bg-blue-500/10', text: 'text-blue-600', border: 'border-blue-500/30' };
    case 'office': return { bg: 'bg-violet-500/10', text: 'text-violet-600', border: 'border-violet-500/30' };
    default: return { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' };
  }
};

export const RequestQueue = ({ pendingPasses, onApprove, onDeny }: RequestQueueProps) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-warning">
            Requests
          </h2>
          <motion.span 
            className="px-2 py-0.5 rounded-full bg-warning/10 text-warning text-xs font-bold"
            key={pendingPasses.length}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
          >
            {pendingPasses.length}
          </motion.span>
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        {pendingPasses.length === 0 ? (
          <motion.div 
            className="py-12 text-center rounded-2xl border-2 border-dashed border-border/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Clock className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm font-medium text-muted-foreground">No pending requests</p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {pendingPasses.map((pass, index) => {
              const style = getDestinationStyle(pass.destination);
              
              return (
                <motion.div
                  key={pass.id}
                  layout
                  initial={{ opacity: 0, x: -30, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 30, scale: 0.95 }}
                  transition={{ 
                    type: 'spring', 
                    stiffness: 500, 
                    damping: 30,
                    delay: index * 0.05 
                  }}
                >
                  <GlassCard 
                    variant="frosted"
                    className={`p-4 border-l-4 ${pass.is_quota_exceeded ? 'border-l-destructive' : 'border-l-warning'}`}
                    hover3D
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-bold truncate">{pass.student_name}</h3>
                          {pass.is_quota_exceeded && (
                            <motion.span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[10px] font-black"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', stiffness: 500 }}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              LIMIT
                            </motion.span>
                          )}
                        </div>
                        <span className={`inline-flex items-center mt-2 px-3 py-1 text-xs font-bold rounded-full border ${style.bg} ${style.text} ${style.border}`}>
                          {pass.destination}
                        </span>
                      </div>
                      
                      <div className="flex gap-2 shrink-0">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => onDeny(pass.id)}
                          className="w-12 h-12 rounded-xl bg-muted hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => onApprove(pass.id, pass.is_quota_exceeded || false)}
                          className="w-12 h-12 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center"
                        >
                          <Check className="w-5 h-5" />
                        </motion.button>
                      </div>
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

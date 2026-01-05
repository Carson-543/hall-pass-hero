import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Check, X, AlertTriangle } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';

interface PendingPass {
  id: string;
  student_name: string;
  destination: string;
  is_quota_exceeded?: boolean;
}

interface RequestQueueProps {
  pendingPasses: PendingPass[];
  onApprove: (id: string, quotaExceeded: boolean) => void;
  onDeny: (id: string) => void;
}

const getDestinationStyle = (dest: string) => {
  switch (dest.toLowerCase()) {
    case 'restroom':
      return { bg: 'bg-blue-600/10', text: 'text-blue-400', border: 'border-blue-500/20' };
    case 'library':
      return { bg: 'bg-purple-600/10', text: 'text-purple-400', border: 'border-purple-500/20' };
    case 'nurse':
      return { bg: 'bg-red-600/10', text: 'text-red-400', border: 'border-red-500/20' };
    case 'office':
      return { bg: 'bg-amber-600/10', text: 'text-amber-400', border: 'border-amber-500/20' };
    default:
      return { bg: 'bg-slate-600/10', text: 'text-slate-400', border: 'border-slate-500/20' };
  }
};

export const RequestQueue = ({ pendingPasses, onApprove, onDeny }: RequestQueueProps) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shadow-lg shadow-amber-500/50" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500/90 italic">
            Pending Approval
          </h2>
          <motion.span
            className="px-2.5 py-0.5 rounded-full bg-white/10 text-white text-xs font-black border border-white/10"
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
            className="py-16 text-center rounded-[2rem] border-2 border-dashed border-white/5 bg-white/[0.02]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Clock className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm font-extrabold text-slate-500 uppercase tracking-widest">Quiet for now</p>
          </motion.div>
        ) : (
          <div className="space-y-4">
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
                    className={`p-5 bg-white/5 border-2 ${pass.is_quota_exceeded ? 'border-red-500/50 bg-red-500/5' : 'border-white/10 hover:border-blue-500/30'}`}
                    hover3D
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <h3 className="text-xl font-black text-white tracking-tight truncate">{pass.student_name}</h3>
                          {pass.is_quota_exceeded && (
                            <motion.span
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-600 text-white text-[10px] font-black shadow-lg shadow-red-600/20"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', stiffness: 500 }}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              CAPACITY FULL
                            </motion.span>
                          )}
                        </div>
                        <span className={`inline-flex items-center px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full border-2 ${style.bg} ${style.text} ${style.border}`}>
                          {pass.destination}
                        </span>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => onDeny(pass.id)}
                          className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 hover:bg-red-600/20 hover:text-red-500 hover:border-red-500/30 flex items-center justify-center transition-all text-slate-400"
                        >
                          <X className="w-6 h-6" />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => onApprove(pass.id, pass.is_quota_exceeded || false)}
                          className="w-12 h-12 rounded-2xl bg-blue-600 text-white shadow-xl shadow-blue-600/30 flex items-center justify-center border-t border-white/20"
                        >
                          <Check className="w-6 h-6 font-black" />
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

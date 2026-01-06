import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { LogOut, School } from 'lucide-react';

interface TeacherHeaderProps {
  signOut: () => void;
}

export const TeacherHeader = ({ signOut }: TeacherHeaderProps) => {
  return (
    <motion.header
      className="flex items-center justify-between mb-8 pt-4 relative z-10"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-center gap-5">
        <motion.div
          className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-2xl shadow-blue-500/40 border-2 border-white/20"
          whileHover={{ scale: 1.05, rotate: 5 }}
          whileTap={{ scale: 0.95 }}
        >
          <School className="w-7 h-7 text-white" />
        </motion.div>
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-white leading-none mb-1">ClassPass <span className="text-blue-500">Pro</span></h1>
          <p className="text-sm text-slate-300 font-extrabold tracking-wide uppercase">Manage passes & students</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={signOut}
        className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/15 text-white shadow-sm"
      >
        <LogOut className="h-5 w-5" />
      </Button>
    </motion.header>
  );
};

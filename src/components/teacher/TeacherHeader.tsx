import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export const TeacherHeader = ({ signOut }: TeacherHeaderProps) => {
   const { user, role, signOut, loading: authLoading } = useAuth();
  return (
    <motion.header
      className="flex items-center justify-between mb-8 pt-4 relative z-10"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-center gap-5">
        <motion.div
          className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-2xl shadow-blue-500/40 border-2 border-white/20 overflow-hidden p-2"
          whileHover={{ scale: 1.05, rotate: 5 }}
          whileTap={{ scale: 0.95 }}
        >
          <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain drop-shadow-md" />
        </motion.div>
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-white leading-none mb-1">ClassPass <span className="text-blue-500">Pro</span></h1>
          <p className="text-sm text-slate-300 font-extrabold tracking-wide uppercase">Manage passes & students</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
            console.log("🚪 Teacher signing out...");
            signOut();
        }}
        className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/15 text-white shadow-sm"
      >
        <LogOut className="h-5 w-5" />
      </Button>
    </motion.header>
  );
};

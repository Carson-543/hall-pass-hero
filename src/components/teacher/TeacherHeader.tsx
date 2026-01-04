import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { LogOut, Sparkles } from 'lucide-react';

interface TeacherHeaderProps {
  signOut: () => void;
}

export const TeacherHeader = ({ signOut }: TeacherHeaderProps) => {
  return (
    <motion.header 
      className="flex items-center justify-between mb-8 pt-4"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-center gap-4">
        <motion.div 
          className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/30"
          whileHover={{ scale: 1.05, rotate: 5 }}
          whileTap={{ scale: 0.95 }}
        >
          <Sparkles className="w-7 h-7 text-primary-foreground" />
        </motion.div>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Teacher Dashboard</h1>
          <p className="text-sm text-muted-foreground font-medium">Manage passes & students</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={signOut}
        className="text-muted-foreground hover:text-destructive rounded-xl"
      >
        <LogOut className="h-4 w-4 mr-2" /> Sign Out
      </Button>
    </motion.header>
  );
};

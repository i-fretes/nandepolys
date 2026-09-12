import { AnimatePresence, motion } from 'framer-motion';

export default function Modal({ open, onClose, children, width = 'max-w-lg' }: { open: boolean; onClose?: () => void; children?: React.ReactNode; width?: string }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }}
          onClick={onClose}
        >
          <motion.div
            className={`card w-full ${width} max-h-[92vh] overflow-y-auto p-5`}
            initial={{ y: 40, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 40, scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={e => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

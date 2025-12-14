/**
 * ASCII Progress Bar Component
 * Displays a progress bar using ASCII characters with animations
 */

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AsciiProgressBarProps {
  progress: number;
  className?: string;
}

const PROGRESS_BAR_LENGTH = 40;
const FILLED_CHAR = "▓";
const EMPTY_CHAR = "░";

const AsciiProgressBar: React.FC<AsciiProgressBarProps> = ({ progress, className = "" }) => {
  const filledCount = Math.round((progress / 100) * PROGRESS_BAR_LENGTH);
  const emptyCount = PROGRESS_BAR_LENGTH - filledCount;

  return (
    <div className={cn("font-mono text-sm leading-relaxed", className)}>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-muted-foreground">Progress:</span>
        <span className="text-foreground font-semibold">{progress.toFixed(1)}%</span>
      </div>
      
      <div className="flex">
        {Array.from({ length: filledCount }).map((_, i) => (
          <motion.span
            key={`filled-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.01 }}
            className="text-lime-400"
          >
            {FILLED_CHAR}
          </motion.span>
        ))}
        {Array.from({ length: emptyCount }).map((_, i) => (
          <span key={`empty-${i}`} className="text-muted-foreground/30">
            {EMPTY_CHAR}
          </span>
        ))}
      </div>
    </div>
  );
};

export default AsciiProgressBar;

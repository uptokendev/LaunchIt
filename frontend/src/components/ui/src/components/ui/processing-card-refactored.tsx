/**
 * Processing Card Component
 * Displays token creation progress with glitch effects and animations
 */

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import LetterGlitch from "@/components/ui/effects/letter-glitch";
import CustomLoader from "@/components/ui/loaders/custom-loader";
import AsciiProgressBar from "@/components/ui/progress/ascii-progress-bar";
import { PROCESSING_STAGES } from "@/constants/processingStages";
import { ProcessingStatus } from "@/types/token";

interface ProcessingCardProps {
  name?: string;
  className?: string;
  status?: ProcessingStatus;
  progress?: number;
}

const ProcessingCard: React.FC<ProcessingCardProps> = ({
  name = "Token",
  className = "",
  status = "queued",
  progress = 0,
}) => {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState(PROCESSING_STAGES[0].label);

  // Update displayed progress with smoothing
  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayProgress((prev) => {
        const diff = progress - prev;
        if (Math.abs(diff) < 0.1) return progress;
        return prev + diff * 0.1;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [progress]);

  // Update current stage based on progress
  useEffect(() => {
    const stage = PROCESSING_STAGES.find(
      (s) => displayProgress >= s.minProgress && displayProgress < s.maxProgress
    );
    if (stage) {
      setCurrentStage(stage.label);
    }
  }, [displayProgress]);

  const getStatusIcon = () => {
    switch (status) {
      case "succeeded":
        return <CheckCircle2 className="h-12 w-12 text-lime-400" />;
      case "failed":
        return <XCircle className="h-12 w-12 text-red-500" />;
      case "queued":
        return <Clock className="h-12 w-12 text-muted-foreground" />;
      default:
        return <CustomLoader size="lg" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "succeeded":
        return "Token Created Successfully!";
      case "failed":
        return "Token Creation Failed";
      case "queued":
        return "Queued for Processing...";
      default:
        return currentStage;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative p-8 bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl",
        className
      )}
    >
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-retro text-foreground mb-2">Creating {name}</h2>
        <p className="text-sm text-muted-foreground">Please wait while we process your token</p>
      </div>

      {/* Glitch Effect Title */}
      {status === "running" && (
        <div className="flex justify-center mb-6">
          <LetterGlitch
            text="PROCESSING"
            glitchColors={["#a3e635", "#bef264", "#84cc16"]}
            glitchSpeed={50}
            fontSize={48}
          />
        </div>
      )}

      {/* Status Icon */}
      <div className="flex justify-center mb-6">
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          {getStatusIcon()}
        </motion.div>
      </div>

      {/* Status Text */}
      <div className="text-center mb-8">
        <p className="text-lg font-retro text-foreground">{getStatusText()}</p>
      </div>

      {/* Progress Bar */}
      {(status === "running" || status === "queued") && (
        <div className="mt-8">
          <AsciiProgressBar progress={displayProgress} />
        </div>
      )}

      {/* Success/Failure Message */}
      {status === "succeeded" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mt-6 text-sm text-muted-foreground"
        >
          Redirecting to token page...
        </motion.div>
      )}

      {status === "failed" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mt-6 text-sm text-red-500"
        >
          Please try again or contact support
        </motion.div>
      )}
    </motion.div>
  );
};

export default ProcessingCard;

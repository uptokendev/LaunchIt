/**
 * Custom hook for managing token creation processing state
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ProcessingStatus } from "@/types/token";
import { PROCESSING_TIMING } from "@/constants/processingStages";

export const useTokenProcessing = (ticker: string) => {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>("queued");
  const [processingProgress, setProcessingProgress] = useState(0);

  useEffect(() => {
    if (!isProcessing) return;

    // Change status from queued to running
    const statusTimer = setTimeout(() => {
      setProcessingStatus("running");
    }, PROCESSING_TIMING.QUEUED_TO_RUNNING_DELAY);

    // Gradually increase progress
    const progressInterval = setInterval(() => {
      setProcessingProgress((prev) => {
        if (prev >= PROCESSING_TIMING.MAX_PROGRESS_THRESHOLD) return prev;
        return prev + Math.random() * PROCESSING_TIMING.MAX_PROGRESS_INCREMENT + PROCESSING_TIMING.MIN_PROGRESS_INCREMENT;
      });
    }, PROCESSING_TIMING.PROGRESS_UPDATE_INTERVAL);

    // Complete the process
    const completeTimer = setTimeout(() => {
      setProcessingProgress(100);
      setProcessingStatus("succeeded");
      clearInterval(progressInterval);

      // Navigate after showing success
      setTimeout(() => {
        toast.success("Token created successfully!");
        const tokenSlug = ticker.toLowerCase() || "1";
        navigate(`/token/${tokenSlug}`);
      }, PROCESSING_TIMING.SUCCESS_NAVIGATION_DELAY);
    }, PROCESSING_TIMING.TOTAL_PROCESS_DURATION);

    return () => {
      clearTimeout(statusTimer);
      clearTimeout(completeTimer);
      clearInterval(progressInterval);
    };
  }, [isProcessing, navigate, ticker]);

  const startProcessing = () => {
    setIsProcessing(true);
    setProcessingStatus("queued");
    setProcessingProgress(0);
  };

  return {
    isProcessing,
    processingStatus,
    processingProgress,
    startProcessing,
  };
};

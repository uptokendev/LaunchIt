/**
 * Token creation processing stages configuration
 */

export interface ProcessingStage {
  minProgress: number;
  maxProgress: number;
  label: string;
}

export const PROCESSING_STAGES: ProcessingStage[] = [
  { minProgress: 0, maxProgress: 25, label: "Initializing token creation..." },
  { minProgress: 25, maxProgress: 50, label: "Preparing blockchain deployment..." },
  { minProgress: 50, maxProgress: 75, label: "Deploying smart contract..." },
  { minProgress: 75, maxProgress: 90, label: "Verifying token on network..." },
  { minProgress: 90, maxProgress: 100, label: "Finalizing token setup..." },
];

export const PROCESSING_TIMING = {
  QUEUED_TO_RUNNING_DELAY: 800,
  PROGRESS_UPDATE_INTERVAL: 500,
  MIN_PROGRESS_INCREMENT: 5,
  MAX_PROGRESS_INCREMENT: 15,
  MAX_PROGRESS_THRESHOLD: 95,
  TOTAL_PROCESS_DURATION: 6000,
  SUCCESS_NAVIGATION_DELAY: 1000,
} as const;

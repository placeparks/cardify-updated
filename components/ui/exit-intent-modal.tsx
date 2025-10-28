"use client";

import { useEffect } from "react";

interface ExitIntentModalProps {
  isGenerating: boolean;
  hasGeneratedCard: boolean;
  hasDownloaded: boolean;
  onDownload: () => void;
  onStay: () => void;
}

export function ExitIntentModal({
  isGenerating,
  hasGeneratedCard,
  hasDownloaded,
}: ExitIntentModalProps) {
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Show browser's native warning if generating or has undownloaded card
      if ((isGenerating || (hasGeneratedCard && !hasDownloaded))) {
        e.preventDefault();
        // Modern browsers will show their own generic message
        e.returnValue = "You have an unsaved card! Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isGenerating, hasGeneratedCard, hasDownloaded]);

  // Return null since we're only using the browser's native warning
  return null;
}
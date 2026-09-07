"use client";

import { motion } from "framer-motion";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";

// no downloaded items to list yet - this is just the empty state until the actual
// download-and-store-offline feature lands
export function DownloadsPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <motion.div
        key="downloads-empty"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
          <Download className="w-10 h-10 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {t("downloadsPage.empty")}
        </h2>
        <p className="text-muted-foreground max-w-sm">
          {t("downloadsPage.addContent")}
        </p>
      </motion.div>
    </div>
  );
}

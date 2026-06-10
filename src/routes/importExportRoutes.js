// routes/importExportRoutes.js
import express from "express";
import multer from "multer";
import { protect } from "../middleware/authMiddleware.js";
import { importHoldings, exportHoldings } from "../controllers/importExportController.js";

const router = express.Router();

// Store CSV in memory (max 5 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are accepted."), false);
    }
  },
});

router.use(protect);

// Accept primary file + optional WACC report (Meroshare two-file import)
router.post("/import",
  upload.fields([
    { name: "file",     maxCount: 1 },
    { name: "fileWacc", maxCount: 1 },
  ]),
  importHoldings,
);
router.get("/export",                          exportHoldings);

export default router;

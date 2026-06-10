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

router.post("/import",  upload.single("file"), importHoldings);
router.get("/export",                          exportHoldings);

export default router;

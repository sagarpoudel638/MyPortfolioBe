// controllers/snapshotController.js
import Snapshot from "../models/Snapshot.js";
import { takeSnapshotForUser } from "../services/snapshotService.js";

// GET /api/snapshots — last 90 days
export const getSnapshots = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - days);
    from.setUTCHours(0, 0, 0, 0);

    const snapshots = await Snapshot.find({
      userId: req.user._id,
      date: { $gte: from },
    }).sort({ date: 1 });

    res.json(snapshots);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/snapshots/trigger — manual trigger for testing
export const triggerSnapshot = async (req, res) => {
  try {
    const snapshot = await takeSnapshotForUser(req.user._id);
    res.json({ message: "Snapshot taken", snapshot });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
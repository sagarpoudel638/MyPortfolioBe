// middleware/validateObjectId.js
// Rejects requests where :id is not a valid MongoDB ObjectId,
// preventing Mongoose CastError 500s on all /:id routes.

import mongoose from "mongoose";

export const validateObjectId = (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "Invalid ID format." });
  }
  next();
};

// controllers/fxController.js
import { getFxRates } from "../services/fxService.js";

export const getFx = async (req, res) => {
  try {
    const rates = await getFxRates("AUD");
    res.json({
      audNpr: parseFloat(rates["NPR"].toFixed(2)),
      audUsd: parseFloat(rates["USD"].toFixed(4)),
      usdNpr: parseFloat((rates["NPR"] / rates["USD"]).toFixed(2)),
      cachedAt: new Date(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
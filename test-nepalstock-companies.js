// test-nepse-single.js
import axios from "axios";
import * as cheerio from "cheerio";
import https from "https";

const agent = new https.Agent({ rejectUnauthorized: false });

const ticker = "NABIL";
const url = `https://merolagani.com/CompanyDetail.aspx?symbol=${ticker}`;

try {
  const { data } = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
    timeout: 10000,
  });

  const $ = cheerio.load(data);

  const getTdByTh = (thText) => {
    let value = null;
    $("tr").each((i, row) => {
      const th = $(row).find("th").first().text().trim();
      if (th === thText) {
        value = $(row).find("td").first().text().trim();
        return false;
      }
    });
    return value;
  };

  console.log("Price:",   getTdByTh("Market Price"));
  console.log("Sector:",  getTdByTh("Sector"));
  console.log("52W:",     getTdByTh("52 Weeks High - Low"));
  console.log("Day%:",    getTdByTh("% Change"));

} catch (err) {
  console.error("Fetch failed:", err.message);
}
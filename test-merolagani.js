// test-merolagani-52.js
import axios from "axios";
import * as cheerio from "cheerio";

const { data } = await axios.get(
  "https://merolagani.com/CompanyDetail.aspx?symbol=NABIL",
  {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
  }
);

const $ = cheerio.load(data);

// Find all table rows and print th/td pairs
$("tr").each((i, row) => {
  const th = $(row).find("th").text().trim();
  const td = $(row).find("td").text().trim();
  if (th && td) {
    console.log(`TH: "${th}" → TD: "${td}"`);
  }
});
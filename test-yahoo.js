// test-yahoo.js
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();

try {
  const quote = await yahooFinance.quote("CBA.AX");
  console.log("Price:", quote.regularMarketPrice);
} catch (error) {
  console.error("Error:", error.message);
}
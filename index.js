import dotenv from "dotenv";
import puppeteer from "puppeteer";
import fs from "fs";

dotenv.config();

// Helper function to scroll the page to the bottom
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 200; // Scroll step in pixels
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100); // Delay between scrolls in milliseconds
    });
  });
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: false,
    userDataDir: "./tmp",
  });

  const page = await browser.newPage();

  try {
    // Prepare CSV file with headers
    fs.writeFileSync("results.csv", "Title,Price,Image\n");

    // Navigate to the URL
    await page.goto(process.env.SCRAPING_URL, { waitUntil: "load" });

    let isBtnDisabled = false;

    // Loop until pagination is complete
    while (!isBtnDisabled) {
      // Scroll to the bottom to ensure all elements load
      await autoScroll(page);

      // Get all product containers
      const productsHandles = await page.$$(process.env.CONTAINER_CLASS);

      // Process each product
      for (const productHandle of productsHandles) {
        let image = null;
        let title = null;
        let price = null;

        try {
          // Extract product image
          image = await page.evaluate(
            (el) => el.querySelector(".product-img")?.getAttribute("src"),
            productHandle
          );
        } catch (error) {
          console.error("Error fetching image:", error);
        }

        try {
          // Extract product title
          title = await page.evaluate(
            (el) => el.querySelector("h3")?.textContent.trim(),
            productHandle
          );
        } catch (error) {
          console.error("Error fetching title:", error);
        }

        try {
          // Extract product price
          price = await page.evaluate(
            (el) =>
              el
                .querySelector(".multi--price--1okBCly > div")
                ?.textContent.trim(),
            productHandle
          );
        } catch (error) {
          console.error("Error fetching price:", error);
        }

        // Format price and image URL
        const curPrice = price
          ? price.replace(/,/g, "").split("RSD")[1]
          : "N/A";
        const prodImage = image ? "http:" + image : "N/A";
        const safeTitle = title ? title.replace(/,/g, ";") : "N/A";

        // Save to CSV file
        try {
          fs.appendFileSync(
            "results.csv",
            `${safeTitle},${curPrice},${prodImage}\n`
          );
          console.log("Saved:", safeTitle);
        } catch (err) {
          console.error("Error saving to CSV:", err);
        }
      }

      // Check if the next button is disabled
      isBtnDisabled = await page.evaluate(() => {
        const nextButton = document.querySelector(
          "ul.comet-pagination > li.comet-pagination-next > button"
        );
        return nextButton?.disabled || false;
      });

      // Click the next button if not disabled
      if (!isBtnDisabled) {
        try {
          await Promise.all([
            page.waitForNavigation({ waitUntil: "networkidle2" }),
            page.click(
              "ul.comet-pagination > li.comet-pagination-next > button"
            ),
          ]);
        } catch (error) {
          console.error("Error during pagination:", error);
          isBtnDisabled = true; // Exit loop if navigation fails
        }
      }
    }

    console.log("Scraping completed!");
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    // Close the browser
    // await browser.close();
  }
})();

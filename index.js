// Setup Libraries
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import * as dotenv from "dotenv";
import fs from "fs";
import { setTimeout } from "timers/promises";
import { google } from "googleapis";

// Use StealthPlugin
puppeteer.use(StealthPlugin());

// Grabbing .env variable
dotenv.config();

// Define variabel login
const email = process.env.EMAIL;
const password = process.env.PASSWORD;

// Load All the Credentials
const credential_path = "./credential.json";
const spreadSheet_ID = process.env.SPREADSHEET_ID;
const range_column = "Sheet1!A:B";

// Function Authorize Google
async function authorize() {
  const content = fs.readFileSync(credential_path);
  const credentials = JSON.parse(content);

  const authClient = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return authClient.getClient();
}

// Function Read SpreadSheet
async function readSpreadsheet(auth) {
  const sheets = google.sheets({
    version: "v4",
    auth,
  });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadSheet_ID,
    range: range_column,
  });

  const rows = response.data.values;
  if (rows.length) {
    return rows.slice(1).map((row) => ({
      code: row[0],
      amount: row[1],
    }));
  } else {
    throw new Error("No data found.");
  }
}

// Function Check Product available
async function avail_products_qty(page) {
  const quantityProduct = await page.evaluate(() => {
    const productQty = document.querySelector(
      'input[name="avail_products_qty"]'
    );
    return productQty ? productQty.value : null;
  });

  return quantityProduct;
}

// Function for authenticating
async function authenticateWebsite(page, email, password, browser) {
  // Define the url-login
  const loginUrl = "https://www.satnam.de/en/";

  // going to login page
  await page.goto(loginUrl, {
    waitUntil: "domcontentloaded",
  });

  // Click cookies accept
  await page.click('input[type="submit"]');

  // Click icon login
  await page.click("#icon-navigation > ul > li:nth-child(3) > a");

  // Typing the credentials
  // Email
  await page.type(
    "#register-box > div:nth-child(1) > form > input[type=text]:nth-child(2)",
    email,
    { delay: 200 }
  );

  // Password
  await page.type(
    "#register-box > div:nth-child(1) > form > input[type=password]:nth-child(4)",
    password,
    { delay: 200 }
  );

  // Click submit
  await page.click("#register-box > div:nth-child(1) > form > button");

  // Wait for 2s checking the condition
  await setTimeout(1000);

  // Condition if login is failed
  if (page.url() === "https://www.satnam.de/en/login.php") {
    // Log the error
    console.log("Credentials are wrong, Login failed.");

    // Close the browser
    await browser.close();
    return false;
  }

  // Logging log when authentication
  console.log("login successfully ...");

  return true;
}

// Function add to chart
async function addToChart(page, amountItem) {
  // Select total items to the chart
  const selectSelector = 'select[name="cart_quantity"]';
  await page.waitForSelector(selectSelector);
  await page.select(selectSelector, amountItem);

  // Wait for 1s
  await setTimeout(1000);

  // Add to chart button
  const chartSelector = "form > div > button";
  await page.waitForSelector(chartSelector);
  await page.click(chartSelector);

  // Close box selector
  const closeBoxSelector = "div.containerMessageBoxes a.closePopup";
  await page.waitForSelector(closeBoxSelector);
  await page.click(closeBoxSelector);

  // logging if the closePopup clicked
  // console.log(`closeBoxPopup clicked ...`)
}

// Function getFirst Link Product
async function getAllLinksProduct(page) {
  const pageLinkProduct = await page.evaluate(() => {
    const elements = document.querySelectorAll("h2.product-listing-name a");
    // return element ? element.getAttribute("href") : null;
    return Array.from(elements).map((e) => e.getAttribute("href"));
  });

  return pageLinkProduct;
}

// Function check code isMatch or Not
async function isMatch(page) {
  const codeProd = "span.defaultcolor-text";

  const code = await page.evaluate((codeProd) => {
    const element = document.querySelector(codeProd);
    return element ? element.innerText.replace("Item No: ", "") : null;
  }, codeProd);

  return code;
}

// Run Puppeteer Function
(async () => {
  try {
    // Integrating GoogleSheet API
    const auth = await authorize();
    const items = await readSpreadsheet(auth);

    // Getting each code and amount of spreadsheet
    const codes = items.map((item) => item.code);
    const amounts = items.map((item) => item.amount);

    // Puppeteer Setup
    const browser = await puppeteer.launch({
      headless: false,
      args: [`--no-sandbox`],
    });

    // Opening newPage
    const page = await browser.newPage();

    // Logging log when authentication
    console.log("logging in ...");

    // Redirect to Login Page
    // Minimize the viewport for easy authentication input
    await page.setViewport({
      width: 500,
      height: 768,
    });

    // Implement Function Authenticate / Login
    const loginSuccesfully = await authenticateWebsite(
      page,
      email,
      password,
      browser
    );

    // Handling the authenticate
    if (!loginSuccesfully) {
      await browser.close();
      return;
    }

    // Logging gap symbols
    console.log("===============================================");

    // await page.goto("https://www.satnam.de/en/");

    // Loop based on the code and amount
    for (let i = 0; i < codes.length; i++) {
      // Handling Errors if exist
      try {
        // Define loop variable code and amount
        const codeItem = codes[i];
        const amountItem = amounts[i];

        // Set Viewport to default
        await page.setViewport({
          width: 1024,
          height: 768,
        });

        // Define home Url
        const homeUrl = `https://www.satnam.de/en/search.php?keywords=${codeItem}`;
        await page.goto(homeUrl, {
          waitUntil: "domcontentloaded",
        });

        // Wait for 3s
        await setTimeout(3000);

        // Implement Function get first product
        const pageLinkProducts = await getAllLinksProduct(page);

        // If product there 
        if (pageLinkProducts && pageLinkProducts.length > 0) {

          //condition is match 
          let productMatched = false;

          // Condition if pageLinksProduct is exist
          for (let pageLinkProduct of pageLinkProducts) {
            // Handling errors
            try {
              // Go to link parsed
              await page.goto(pageLinkProduct, {
                waitUntil: "domcontentloaded",
              });

              // Wait for 2s
              await setTimeout(2000);

              // Check is Match with code
              if ((await isMatch(page)) === codeItem) {
                // Implement Function add to page
                await addToChart(page, amountItem);

                // Wait for 1s
                await setTimeout(1000);

                // Information about the quantity products - function
                const quantityProduct = await avail_products_qty(page);

                // Logging successfully product added to chart
                console.log(
                  `Successfully added item ${codeItem} (amount: ${amountItem}) to the basket.`
                );

                // Logging the quantity product
                console.log(
                  `The available product quantity is : ${quantityProduct}`
                );

                console.log("===============================================");

                // Break the loop as the product has been added
                productMatched = true;
                break;
                
              }
            } catch (error) {
              console.error(
                `Failed to add item ${codeItem} (amount: ${amountItem}) to the basket:`,
                error
              );

              console.log("===============================================");
            }
          }

          // If no product was matched
          if (!productMatched) {
            console.log(`No products matched with code ${codeItem}`);
            console.log("===============================================");
          }

        } else {
          // Logging console if the product is not there
          console.log(`No products detail found for code ${codeItem}`);
          console.log("===============================================");
        }

        // Set timeout 2s
        await setTimeout(2000);
      } catch (error) {
        console.log(error);
      }
    }

    console.log(`All product successfully loaded ......`);

    // Close Browser
    await browser.close();
  } catch (error) {
    console.log(error);
  }
})();

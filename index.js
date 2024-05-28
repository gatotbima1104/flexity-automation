// Setup Libraries
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { google } from "googleapis";
import { setTimeout } from "timers/promises";

import * as dotenv from "dotenv";
import fs from "fs";


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

// Save Cookies
async function saveCookies(cookie, outputFile) {
  fs.writeFileSync(outputFile, JSON.stringify(cookie));
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

    // Read cookiesExist
    const cookiesExist = fs.existsSync("cookies.json")

    // Condition if Cookies exist
    if(!cookiesExist){

        // Logging log when authentication
        console.log("logging in ...")

        // Redirect to Login Page
        // Minimize the viewport for easy authentication input
        await page.setViewport({
          width: 500,
          height: 768,
        });
        
        // Define the url-login
        const loginUrl = "https://www.satnam.de/en/";

        // going to login page
        await page.goto(loginUrl, {
          waitUntil: "domcontentloaded",
        });
    
        // Click icon login
        await page.click("#icon-navigation > ul > li:nth-child(3) > a");
    
        // Typing the credentials
        // Email
        await page.type(
          "#register-box > div:nth-child(1) > form > input[type=text]:nth-child(2)",
          email,
          { delay: 300 }
        );

        // Password
        await page.type(
          "#register-box > div:nth-child(1) > form > input[type=password]:nth-child(4)",
          password,
          { delay: 300 }
        );
    
        // Click submit
        await page.click("#register-box > div:nth-child(1) > form > button");
    
        // Saving cookies
        const cookies = await page.cookies();
        await saveCookies(cookies, "cookies.json", "utf8");

        // Logging log when authentication
        console.log('logged in ...')
    }else{
        
        // Read and SetCookies
        const cookies = JSON.parse(fs.readFileSync('./cookies.json'))
        await page.setCookie(...cookies)  

        console.log('Cookie setted, logged in ...')
    }

    // Set Viewport to default
    await page.setViewport({
        width: 1024,
        height: 768
    })

    // Define home Url
    const homeUrl = "https://www.satnam.de/en/"
    await page.goto(homeUrl, {
        waitUntil: 'domcontentloaded'
    })

    // Click cookies accept
    await page.click('input[type="submit"]')
    
    // Wait for 3s
    await setTimeout(3000);

    // Define search logic
    const searchSelector = 'input[name="keywords"]'
    await page.waitForSelector(searchSelector)

    // Loop based on the code and amount
    for(let i = 0; i < codes.length; i++){

        // Handling Errors if exist
        try {
            // Define loop variable code and amount
            const codeItem = codes[i]
            const amountItem = amounts[i]

            // Clear input form
            await page.evaluate((selector)=> {
                document.querySelector(selector).value = ''
            }, searchSelector)

            // Type search input
            await page.type(searchSelector, codeItem, {
                delay: 500
            })
            
            // Click button search 
            const btnSearch = 'button[title="Search"]'
            await page.waitForSelector(btnSearch)
            await page.click(btnSearch)

            // Set timeout 3s 
            await setTimeout(3000)

            // Evaluate products if the product more than one
            // const pageLinkProduct = await page.$$eval('div.product-listing-element a',
            //     elements => elements.map(el => el.getAttribute('href'))
            // )

            // Evaluate product get first product
            const pageLinkProduct = await page.evaluate(() => {
                const element = document.querySelector('h2.product-listing-name a');
                return element ? element.getAttribute('href') : null;
            });

            // Condition if pageLinksProduct is exist
            if(pageLinkProduct){

                // Handling errors
                try {

                    // Go to link parsed
                    await page.goto(pageLinkProduct, {
                        waitUntil: 'domcontentloaded'
                    })

                    // Wait for 3s
                    await setTimeout(3000)
                    
                    // Select total items to the chart
                    const selectSelector = 'select[name="cart_quantity"]'
                    await page.waitForSelector(selectSelector)
                    await page.select(selectSelector, amountItem)

                    // Wait for 1s
                    await setTimeout(1000)
    
                    // Add to chart button
                    const chartSelector = 'form > div > button'
                    await page.waitForSelector(chartSelector)
                    await page.click(chartSelector)

                    // Wait for 2s
                    await setTimeout(5000)
    
                    // Information about the quantity products - function 
                    const quantityProduct = await page.evaluate(()=> {
                        const productQty = document.querySelector('input[name="avail_products_qty"]')
                        return productQty ? productQty.value : null
                    })

                    // Logging successfully product added to chart
                    console.log(`Successfully added item ${codeItem} (amount: ${amountItem}) to the basket.`);

                    // Logging the quantity product
                    console.log(`The available product quantity is : ${quantityProduct}`)

                    console.log('===============================================')
    
                    // // Loop if the product more than one (OPTIONAL)
                    // for(let link of pageLinkProduct){   
                    //     await page.goto(link, {
                    //         waitUntil: 'domcontentloaded'
                    //     })
                        
                    //     // Select total items
                    //     const selectSelector = 'select[name="cart_quantity"]'
                    //     await page.waitForSelector(selectSelector)
                    //     await page.select(searchSelector, amountItem)
    
                    //     // Wait for 2s
                    //     await setTimeout(2000)
    
                    //     // Add to chart button
                    //     const chartSelector = 'button.icon-button'
                    //     await page.waitForSelector(chartSelector)
                    //     await page.click(chartSelector)
                    // }
                } catch (error) {
                    console.error(`Failed to add item ${codeItem} (amount: ${amountItem}) to the basket:`, error);
                }
            }else{
                
                // Logging console if the product is not there
                console.log(`No products detail found for code ${codeItem}`)
            }

            // Set timeout 2s 
            await setTimeout(2000)
                
            } catch (error) {
                console.log(error)
            }        
    }

    console.log(`All product successfully loaded ......`)
    // Close Browser
    await browser.close();
  } catch (error) {
    console.log(error);
  }
})();

// Import relevant modules --Start 
const { chromium } = require('playwright');
//const puppeteer = require("puppeteer");
const xlsx = require('xlsx');
var inquirer = require('inquirer');
const nodeCron = require("node-cron");
const express = require('express');
const app = express();
app.use(express.static('public'));
app.use(express.json({limit: '1mb'}));


const {google} = require('googleapis');
// Import relevant modules --End

const spreadsheet_id = require('./env.js');

// Browser Config -- Start 
const chromeOptions = {
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    slowMo: 20,
    defaultViewport: null
};
// Browser Config -- End


// Defining Variables --- Start
const handelregisterSucheURL = 'https://www.handelsregisterbekanntmachungen.de/?aktion=suche';
const dropDownSelectorLand = 'select[name="land"]';
const dropDownSelectorGegenstand = 'select[name="gegenstand"]';
const firmaInputField = 'input[name="fname"]';

const objectListOfBundeslander = {
    objectlistname: 'bundesländer',
    bunderlander:[
        {
            name:'Baden-Wuerttemberg',
            value: 'bw'
        },
        {
            name:'Bayern',
            value: 'by'
        },
        {
            name:'Berlin',
            value: 'be'
        },
        {
            name:'Brandenburg',
            value: 'br'
        },
        {
            name:'Bremen',
            value: 'hb'
        },
        {
            name:'Hamburg',
            value: 'hh'
        },
        {
            name:'Hessen',
            value: 'he'
        },
        {
            name:'Mecklenburg-Vorpommern',
            value: 'mv'
        },
        {
            name:'Niedersachsen',
            value: 'ni'
        },
        {
            name:'Nordrhein-Westfalen',
            value: 'nw'
        },
        {
            name:'Rheinland-Pfalz',
            value: 'rp'
        },
        {
            name:'Saarland',
            value: 'sl'
        },
        {
            name:'Sachsen',
            value: 'sn'
        },
        {
            name:'Sachsen-Anhalt',
            value: 'st'
        },
        {
            name:'Schleswig-Holstein',
            value: 'sh'
        },
        {
            name:'Thüringen',
            value: 'th'
        },
    ]
}

const searchTerms = [
    'gastro', 
    'gastronomie', 
    'restaurant',
    'food',
    'bar',
    'cafe',
    'diner',
    'pizza',
    'pizzaria',
    'wirtshaus',
    'gasthaus',
    'coffee',
    'kaffee',
    'brunch',
    'catering'
];
const sucheStartenCTA = 'input[type="submit"]'
var profileLinkIDs = [];
var bundeslanderVisted = [];
var profileLinks = [];
var searchTermsUsed = [];
// Defining Variables --- End



// Function to get all links to Profile Pages --Start
async function getLinks(){

    // -- Chromium Setup -- START
    const browser = await chromium.launch({
        headless:true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      });
    const page = await browser.newPage();
    // -- Chromium Setup -- END
    
    // loop over Suchbegriffe 
    for(j=0; j < searchTerms.length; j++){

        // loop over Bunderländer
        for(k=0; k < objectListOfBundeslander.bunderlander.length; k++){

            const currentSearchTerm = searchTerms[j];

            // open handelsregister page
            await page.goto(handelregisterSucheURL);

            // select bundesländer dropdown element
            const dropdownLand = await page.$(dropDownSelectorLand);
            await dropdownLand.selectOption({value: objectListOfBundeslander.bunderlander[k].value});

            // select Gegenstand dropdown element
            const dropdownGegenstand = await page.$(dropDownSelectorGegenstand);
            await dropdownGegenstand.selectOption({value: "1"});

            // type in searchterm
            await page.type(firmaInputField, currentSearchTerm);
            await page.click(sucheStartenCTA);

            // fetch profileURLs 
            var handelregisterEntriesURLs = await page.$$eval('#inhalt > b > li > a', allAs => allAs.map(a => a.href));
        
            // loop over array of dirty profileURLs data and clean up not needed string values
            for (i=0; i < handelregisterEntriesURLs.length; i ++){
                var currentValue = handelregisterEntriesURLs[i];
                var newValuePartOne = currentValue.replaceAll("javascript:NeuFenster('", "");
                var newValuePartTwo = newValuePartOne.replaceAll("')", "");
                var stringValue = newValuePartTwo.toString();
                var profileURL = 'https://www.handelsregisterbekanntmachungen.de/skripte/hrb.php?'+stringValue;
                searchTermsUsed.push(currentSearchTerm);
                profileLinks.push(profileURL);
                profileLinkIDs.push(stringValue);
                bundeslanderVisted.push(objectListOfBundeslander.bunderlander[k].name);
            }

        // wait for random seconds between 1 - 4 seconds
        await page.waitForTimeout(randomNumber(1000, 4000));
        }
    }
    // close Browser
    await browser.close(); 
    

    return {
        searchTermsUsed: searchTermsUsed,
        profileLinks: profileLinks,
        profileLinkIDs: profileLinkIDs,
        bundeslanderVisted: bundeslanderVisted
    }
    
}
// Function to get all links to Profile Pages --End


// Main Function starting Scraping Process --Start
async function scrapeDataFromHandelsregister(){
    try{
        var startingTimeUnix = new Date().getTime();
        //var startingTime = convertUnixTimeStamp(startingTimeUnix);

        // fetch information from getLinks() function
        const objectWithUrlLinks = await getLinks();

        const profileLinks = objectWithUrlLinks.profileLinks
        const profileLinkIDs = objectWithUrlLinks.profileLinkIDs
        const bundeslanderVisted = objectWithUrlLinks.bundeslanderVisted
        const searchTermsUsed = objectWithUrlLinks.searchTermsUsed

        // Authenticate with GoogleSpreadsheet
        const auth = new google.auth.GoogleAuth({
            keyFile: "credentials.json",
            scopes: "https://www.googleapis.com/auth/spreadsheets",

        });

        // Create Client for instance for auth 
        const client = await auth.getClient();

        // Instance of Google Sheets API
        const googleSheets = await google.sheets({version:"v4", auth: client});
        const spreadsheetId = "1j5fo3ttGZCdmJQgR6TKAb4bFwajhOK8zMYEalNiJh2M";

        // Get metadata about spreadsheet
        const metaData = await googleSheets.spreadsheets.get({
          auth,
          spreadsheetId,
        });

        // Read rows from spreadsheet
        const getRows = await googleSheets.spreadsheets.values.get({
          auth,
          spreadsheetId,
          range: "handelregisterDaten!B:B",
        });

        var arrayOfamtsgerichtInfoFromGoogleSpreadsheet = getRows.data.values
        var arrayOfGoogleTestingIDs = arrayOfamtsgerichtInfoFromGoogleSpreadsheet.flat();

        console.log('arrayOfGoogleTestingIDs: '+ arrayOfGoogleTestingIDs);
        console.log('profileLinkIDs: '+ profileLinkIDs);

        var stopEntryAction = false;

        // loop over array of newProfileIDs
        for(n=0; n< profileLinkIDs.length; n++){
            var currentProfileID = profileLinkIDs[n];

            if (arrayOfGoogleTestingIDs.includes(currentProfileID)){
                console.log('comparision true');

            } else {
                console.log('not true');
                var scrapedData = [];
                for (p=0; p < profileLinkIDs.length; p++){
                    var searchTermUsed = searchTermsUsed[p];
                    var profileLinkID = profileLinkIDs[p];
                    var profileLink = profileLinks[p];
                    var bundeslandVisted = bundeslanderVisted[p];
                    const fetchedData = await fetchProfileData(searchTermUsed, profileLinkID, profileLink, bundeslandVisted, p);

                    // Write row(s) to spreadsheet
                    await googleSheets.spreadsheets.values.append({
                        auth,
                        spreadsheetId,
                        range: "handelregisterDaten",
                        valueInputOption: "USER_ENTERED",
                        resource: {
                          values: [fetchedData],
                        },
                    }); 

                    //console.log('TESTING fetchedData: '+ fetchedData.Amtsgericht_Info)
                    scrapedData.push(fetchedData);
                }

            }

        }


        //var ExcelName = "handelregister_"+startingTime+".xlsx"
        //await exportExcel(ExcelName,scrapedData);    
        var endingTimeUnix = new Date().getTime();
        var timeDuration = endingTimeUnix - startingTimeUnix;
        console.log("Scraping Handelsegister took " + millisToMinutesAndSeconds(timeDuration) + " minutes.")
    } catch(err){
        console.log('Error logged: '+ err);
    }
}

async function fetchProfileData(searchTermUsed, IDToProfile, profileLink , bundeslandVisted,  roundOfIterations){

    // -- Chromium Setup -- START
    const browser = await chromium.launch({
        headless:true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      });
    const page = await browser.newPage();
    // -- Chromium Setup -- END
    
    await page.goto('https://www.handelsregisterbekanntmachungen.de/skripte/hrb.php?'+IDToProfile);
    const amtsgerichtInfo = await page.$eval('body > p > font > table > tbody > tr:nth-child(1) > td:nth-child(1) > nobr', u => u.textContent);
    const bekanntGemachtInfo = await page.$eval('body > p > font > table > tbody > tr:nth-child(1) > td:nth-child(2)', nobr => nobr.textContent);
    const dateOfEintragung = await page.$eval('body > p > font > table > tbody > tr:nth-child(4)', td => td.textContent);
    const detailsOfEintragung = await page.$eval('body > p > font > table > tbody > tr:nth-child(6)', td => td.textContent);
    
    console.log('amtsgerichtInfo: '+ amtsgerichtInfo);
    console.log('bekanntGemachtInfo: '+ bekanntGemachtInfo);
    console.log('dateOfEintragung: '+ dateOfEintragung); 
    console.log('detailsOfEintragung: '+ detailsOfEintragung); 

    var arrayOfNewEntry = [searchTermUsed, IDToProfile, profileLink, bundeslandVisted, amtsgerichtInfo, bekanntGemachtInfo, dateOfEintragung, detailsOfEintragung];
    
    await browser.close();

    return arrayOfNewEntry
    
}

// Run CronJob every hour “At minute 23.” -- START 
//const job = nodeCron.schedule("24 * * * *", function startCronjob() {
//    scrapeDataFromHandelsregister();
//    console.log('CronJob started at '+new Date().toLocaleString());
//});

// express Settings
app.get('/', function (req, res) {
    res.send('Hello World!')
    scrapeDataFromHandelsregister();
})

app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
    console.log("Server is running.");
})

// Run CronJob every hour “At minute 23.” -- END

// Main Function starting Scraping Process --End


// --- Collections of Sub-Functions ---

// Export Excel File function --Start
async function exportExcel(fileName, dataContainer){
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(dataContainer);
    xlsx.utils.book_append_sheet(wb,ws);
    xlsx.writeFile(wb,fileName);
    console.log("Export done");
}
// Export Excel File function --End

// Get random Number function --Start  
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}
// Get random Number function --End

// Convert Seconds to Minutes + Seconds function --Start
function millisToMinutesAndSeconds(timeVarForFunction) {
    var minutes = Math.floor(timeVarForFunction / 60000);
    var seconds = ((timeVarForFunction % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
}
// Convert Seconds to Minutes + Seconds function --End

// Convert unixTimeStamp --Start
function convertUnixTimeStamp(unix_timestamp){

    
    const dateObject = new Date(unix_timestamp)
    
    const humanDateFormat = dateObject.toLocaleString() //2019-12-9 10:30:15

    var day = dateObject.toLocaleString("en-US", {day: "numeric"}) // 9
    var month = dateObject.toLocaleString("en-US", {month: "numeric"}) // 12
    var year = dateObject.toLocaleString("en-US", {year: "numeric"}) // 2019
    var hourInclUhr = dateObject.toLocaleString("de-DE", {hour: "2-digit"}) // 10 AM
    var hour = hourInclUhr.toString().replaceAll(" Uhr", "");
    var minute = dateObject.toLocaleString("en-US", {minute: "numeric"}) // 30
    var second = dateObject.toLocaleString("en-US", {second: "numeric"}) // 15
    
    formattedTime = year + '_' + month + '_' + day + '_' + hour + '_' + minute + '_' + second


    return formattedTime
}
// Convert unixTimeStamp --End


// function to wait for random amount of seconds --START
function randomNumber(min, max){
    min = Math.ceil(min);
    max = Math.floor(max);
    const randomAmountOfSeconds = Math.floor(Math.random() * (max - min)) + min;
    console.log('Random seconds waiting: '+randomAmountOfSeconds);
    return randomAmountOfSeconds;
}
// function to wait for random amount of seconds --END



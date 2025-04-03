require("dotenv").config(); // Load environment variables from .env file
// const { chromium } = require("playwright"); // Import Playwright's Chromium browser
const nodemailer = require("nodemailer"); // Import Nodemailer for sending emails
const cron = require("node-cron"); // Import node-cron for scheduling tasks

const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth");

// Use stealth plugin.
chromium.use(stealth());

const queryData =
  "Find PhD research job openings in Europe that require an MSc in Animal Science, Health, Production, or Agricultural Science. Prioritize opportunities that match my skills in statistical analysis (Excel, R, SQL) and laboratory expertise (PCR, biochemical analysis). Extract detailed information, including job description, requirements, application links, location, and contact details of the poster.";

const scrapeJobs = async () => {
  // Launch a Playwright Chromium browser instance
  const browser = await chromium.launch({ headless: false });

  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.134 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.5672.126 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.5615.121 Safari/537.36",
  ];

  const context = await browser.newContext({
    userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
  });

  // const context = await browser.newContext(); // Create a new browser context
  const page = await context.newPage(); // Open a new page

  console.log("🔍 Searching for jobs...");

  // Go to Google Jobs Search
  await page.goto(
    `https://www.google.com/search?q=${encodeURIComponent(
      queryData +
        " site:linkedin.com OR site:indeed.com OR site:researchgate.net OR site:glassdoor.com OR site:academia.edu OR site:x.com OR site:google.com"
    )}`,
    { waitUntil: "networkidle" } // Wait until network requests are idle
  );

  await page.mouse.move(100, 100);
  // Wait for search results to load
  await page.waitForSelector("h3");
  //  mouse delay
  await page.mouse.move(200, 300);

  // Extract job post links and titles
  const jobs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("h3"))
      .map((el) => {
        const link = el.closest("a")?.href; // Get job post URL
        return { title: el.innerText, link };
      })
      .filter((job) => job.link); // Ensure links are present
  });

  console.log("✅ Found Jobs:", jobs);

  let jobDetails = [];

  for (let job of jobs) {
    const jobPage = await context.newPage(); // Open a new page for each job
    try {
      console.log(`🔎 Scraping job: ${job.title}`);

      await jobPage.goto(job.link, { waitUntil: "domcontentloaded" });

      // Extract job description and requirements
      const jobData = await jobPage.evaluate(() => {
        let description =
          document.querySelector(
            "p, .description, .job-desc, .jobDescriptionContent"
          )?.innerText || "No description available";
        let requirements =
          document.querySelector(".qualifications, .requirements, .req-list")
            ?.innerText || "No requirements listed";
        return { description, requirements };
      });

      jobDetails.push({
        title: job.title,
        link: job.link,
        description: jobData.description,
        requirements: jobData.requirements,
      });

      await jobPage.close(); // Close the job detail page
    } catch (error) {
      console.log(`⚠️ Error scraping ${job.title}:`, error.message);
    }
  }

  console.log("📌 Final Job Listings:", jobDetails);
  await browser.close(); // Close the browser instance

  return jobDetails; // ✅ Return the job details
};

// Function to remove duplicate job posts
const filterUniqueJobs = (jobs) => {
  const seen = new Set();
  return jobs.filter((job) => {
    const jobKey = `${job.title}-${job.link}`;
    if (seen.has(jobKey)) {
      return false;
    }
    seen.add(jobKey);
    return true;
  });
};

// Function to format the job listings into email content
const formatEmailContent = (jobs) => {
  let emailBody = `<h1>📢 PhD Research Openings in Europe</h1><ul>`;
  jobs.forEach((job, index) => {
    emailBody += `
      <li style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
        <h3><a href="${job.link}">${index + 1} ${job.title}</a></h3>
        ${
          job.description
            ? `<p><strong>📄 Description:</strong> ${job.description}</p>`
            : ""
        }
        ${
          job.requirements
            ? `<p><strong>📋 Requirements:</strong> ${job.requirements}</p>`
            : ""
        }
        <p><a href="${
          job.link
        }" style="color: #1a73e8; text-decoration: none;">🔗 Apply Here</a></p>
      </li>`;
  });
  emailBody += `</ul>`;
  return emailBody;
};

// Function to send email using Nodemailer
const sendTestEmail = async (jobArray) => {
  const refinedJobs = filterUniqueJobs(jobArray);
  const emailContent = formatEmailContent(refinedJobs);

  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  let mailOptions = {
    from: process.env.SMTP_USER,
    to: process.env.SMTP_USER, // Send to yourself for testing
    subject: "PhD Research Openings in Europe",
    text: emailContent, // Plain text format
    html: emailContent, // HTML format
  };

  try {
    let info = await transporter.sendMail(mailOptions);
    console.log("✅ Email Sent: " + info.response);
  } catch (error) {
    console.error("❌ Error sending email:", error);
  }
};

// Run the script and send the email with the scraped data
(async () => {
  const jobDetails = await scrapeJobs(); // ✅ Fetch job details
  await sendTestEmail(jobDetails); // ✅ Pass the data correctly
})();

// Schedule the job to run every 20 minutes
cron.schedule("*/20 * * * *", () => {
  console.log("⏳ Running scheduled job scraping...");
  scrapeJobs();
});

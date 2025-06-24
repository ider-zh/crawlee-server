import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import express from 'express';
import { PlaywrightCrawler, Configuration, log } from 'crawlee';
import { requestHandler, } from './routes.js';

// Set memory limit from environment
process.env.CRAWLEE_MEMORY_MBYTES = process.env.CRAWLEE_MEMORY_MBYTES || '2048';

// Configure storage to use memory
Configuration.getGlobalConfig().set('storageClientOptions', {
    persistStorage: false, // This will use memory storage
});

// We will bind an HTTP response that we want to send to the Request.uniqueKey
const requestsToResponses = new Map();

// Initialize the crawler
const crawler = new PlaywrightCrawler({
    keepAlive: true,
    launchContext: {
        launchOptions: {
            headless: true,
            args: [
                '--disk-cache-dir=/tmp',  // Use the RAM-mounted /tmp
                '--disk-cache-size=0',    // Disable disk cache (optional)
                '--disable-dev-shm-usage',
                '--no-sandbox',
            ],
        },
    },
    maxConcurrency: parseInt(process.env.maxConcurrency) || 3,
    requestHandler: async (context) => {
        context.requestsToResponses = requestsToResponses
        return requestHandler(context);
    },
    failedRequestHandler: async ({ request }) => {
        log.error(`Request ${request.url} failed:`, request.errorMessages);
        const httpResponse = requestsToResponses.get(request.uniqueKey);
        httpResponse.status(500).json({
            success: false,
            message: 'Crawler failed. Check the server logs for details.',
            error: request.errorMessages,
        });
        requestsToResponses.delete(request.uniqueKey);
    },
});

// Initialize the Express app
const app = express();
const port = process.env.PORT || 3001;

// Define the /start-crawl endpoint
app.get('/start-crawl', async (req, res) => {
    const urlToCrawl = req.query.url;

    if (!urlToCrawl) {
        return res.status(400).send('Please provide a URL to crawl using the "url" query parameter.');
    }
    log.info(`Starting crawl for URL: ${urlToCrawl}`);

    try {
        log.info('Starting the crawler...');
        const crawleeRequest = { url: urlToCrawl, uniqueKey: randomUUID() };
        requestsToResponses.set(crawleeRequest.uniqueKey, res);
        await crawler.addRequests([crawleeRequest]);
        log.info('Crawler finished successfully.');

    } catch (error) {
        log.error('Crawler failed:', error);
        res.status(500).json({
            success: false,
            message: 'Crawler failed. Check the server logs for details.',
            error: error.message,
        });
    }
});

// Start the server
app.listen(port, '0.0.0.0', () => {
    log.info(`Server running at http://0.0.0.0:${port}`);
});
await crawler.run();
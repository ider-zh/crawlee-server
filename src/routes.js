import process from 'process';

let totalPagesScraped = 0;
let totalFailures = 0;
let startTime = null;
let sitehomepage = null; // Variable to store the base URL
import { log } from 'crawlee';

export const requestHandler = async ({ request, page, requestsToResponses }) => {
    if (!startTime) {
        startTime = Date.now(); // Record the start time of the crawl
    }

    const httpResponse = requestsToResponses.get(request.uniqueKey);
    // Set the base URL (sitehomepage) if it's not already set
    if (!sitehomepage) {
        sitehomepage = new URL(request.loadedUrl).origin; // Extract the base URL (e.g., https://example.com)
        log.info(`Base URL set to: ${sitehomepage}`);
    }

    log.info(`Processing: ${request.url}`);

    try {
        await page.waitForLoadState('networkidle', { timeout: 15000 }); // Added 15 second timeout

        const title = await page.title();
        log.info(`Title: ${title}`);

        // Scroll the page
        await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight);
        });

        // Extract body text
        // const bodyText = await page.evaluate(() => {
        //     const clone = (document.querySelector('article') || document.body).cloneNode(true);
        //     // Remove unwanted elements
        //     clone.querySelectorAll('img, figure, script, style, .ad, .caption').forEach(el => el.remove());
        //     // Get clean text
        //     return clone.textContent
        //         .replace(/\s+/g, ' ')
        //         .replace(/\b(Figure|Image)\s*\d*:?/gi, '')
        //         .trim();
        // });

        // Extract body text
        const bodyHtml = await page.evaluate(() => {
            const clone = document.body.cloneNode(true);
            // Remove unwanted elements
            clone.querySelectorAll('script, style, .ad').forEach(el => el.remove());
            // Return the HTML string of the cleaned clone
            return clone.outerHTML;
        });


        // Extract and standardize date published to ISO UTC
        const datePublished = await page.evaluate(() => {
            // Helper function to convert date to ISO UTC
            const toISOUTC = (date) => {
                if (!date) return null;
                try {
                    const parsedDate = new Date(date);
                    if (isNaN(parsedDate.getTime())) return null;
                    return parsedDate.toISOString();
                } catch (e) {
                    return null;
                }
            };

            // Try different date sources in order of preference
            const timeElement = document.querySelector('time[datetime]');
            if (timeElement) return toISOUTC(timeElement.getAttribute('datetime'));

            const metaDate = document.querySelector('meta[property="article:published_time"]');
            if (metaDate) return toISOUTC(metaDate.getAttribute('content'));

            const spanDate = document.querySelector('span.published-date');
            if (spanDate) return toISOUTC(spanDate.textContent.trim());

            return null;
        });

        // Extract categories
        const articlecategories = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.categories a, .category a')).map(el => el.textContent.trim());
        });

        // Extract tags
        const tags = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.tags a, .tag a')).map(el => el.textContent.trim());
        });

        // Extract keywords
        const keywords = await page.evaluate(() => {
            const metaKeywords = document.querySelector('meta[name="keywords"]');
            return metaKeywords ? metaKeywords.content.split(',').map(k => k.trim()) : [];
        });

        // Extract author
        const author = await page.evaluate(() => {
            return document.querySelector('meta[name="author"]')?.content ||
                document.querySelector('.author-name, .author a')?.textContent.trim();
        });

        // Extract featured image
        const featuredImage = await page.evaluate(() => {
            return document.querySelector('meta[property="og:image"]')?.content ||
                document.querySelector('.featured-image img, .post-thumbnail img')?.src;
        });

        // Extract comments
        const comments = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.comment-text, .comment-content')).map(el => el.textContent.trim());
        });


        const data = {
            sitehomepage, // sitehomepage (base URL of the website)
            url: request.loadedUrl, // article_url (URL of the article)
            title, // title (title of the article)
            bodyHtml, // bodyText (body text of the article)
            datePublished, // Convert empty/falsy values to NULL
            articlecategories, // articlecategories (categories of the article)
            tags, // tags (tags associated with the article)
            keywords, // keywords (keywords associated with the article)
            author, // author (author of the article)
            featuredImage, // featuredImage (URL of the featured image)
            comments: JSON.stringify(comments), // comments (comments on the article)
        }

        // Get the metrics
        const metrics = getMetrics();
        // Send the metrics as JSON response
        httpResponse.json({
            success: true,
            message: 'Crawl completed successfully.',
            data,
            metrics,
        });
        // Increment the number of pages scraped
        totalPagesScraped++;


    } catch (error) {
        log.error(`Error processing ${request.url}:`, error);
        httpResponse.status(500).json({
            success: false,
            message: 'Crawler failed. Check the server logs for details.',
            error: error.message,
        });
        // Increment the number of failures
        totalFailures++;
    } finally {
        requestsToResponses.delete(request.uniqueKey);
    }
};


// Function to calculate average speed (pages per second)
const calculateAverageSpeed = () => {
    const endTime = Date.now();
    const totalTimeInSeconds = (endTime - startTime) / 1000;
    return totalPagesScraped / totalTimeInSeconds;
};

// Function to get metrics
export const getMetrics = () => {
    return {
        totalPagesScraped,
        totalFailures,
        averageSpeed: calculateAverageSpeed(),
    };
};

export const clearMetrics = () => {
    totalPagesScraped = 0;
    totalFailures = 0;
    startTime = null;
    sitehomepage = null; // Reset the base URL when clearing metrics
};

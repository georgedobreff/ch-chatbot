import * as cheerio from 'cheerio';
import * as fs from 'fs/promises';
import * as path from 'path';

const DOCUMENTS_DIR = path.join(process.cwd(), 'documents');

async function scrapeUrlToMarkdown(url: string, title: string): Promise<string> {
    console.log(`  -> Extracting content from: ${url}`);

    try {
        const headers = { 'User-Agent': 'Mozilla/5.0 Companies House Scraper' };
        const response = await fetch(url, { headers });

        if (!response.ok) {
            console.warn(`  -> Failed to fetch. Status: ${response.status}`);
            return "";
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Convert HTML links into Markdown format
        $('a').each((_, aEl) => {
            const $a = $(aEl);
            let href = $a.attr('href');
            let text = $a.text().trim();
            if (href && text && !href.startsWith('#')) {
                if (href.startsWith('/')) href = `https://www.gov.uk${href}`;
                $a.replaceWith(`[${text}](${href})`);
            }
        });

        let markdown = `# ${title}\n\n`;
        markdown += `*Source: ${url}*\n\n`;

        const contentBlocks = $('.govspeak p, .govspeak li, .govspeak h2, .govspeak h3, .govspeak h4');

        if (contentBlocks.length === 0) {
            $('main p, main li').each((_, el) => {
                const text = $(el).text().trim();
                if (text && text.length > 20) {
                    markdown += `${text}\n\n`;
                }
            });
        } else {
            contentBlocks.each((_, el) => {
                const text = $(el).text().trim();
                if (text) {
                    if (el.tagName === 'h2') markdown += `## ${text}\n\n`;
                    else if (el.tagName === 'h3') markdown += `### ${text}\n\n`;
                    else if (el.tagName === 'h4') markdown += `#### ${text}\n\n`;
                    else if (el.tagName === 'li') markdown += `- ${text}\n`;
                    else markdown += `${text}\n\n`;
                }
            });
        }

        return markdown;
    } catch (e: any) {
        console.error(`  -> Network error scraping ${url}: ${e.message}`);
        return "";
    }
}

async function runIdVerificationScraper() {
    const BASE_URL = 'https://www.gov.uk/guidance/verifying-your-identity-for-companies-house';
    console.log("Starting Identity Verification Scraper...");

    try {
        await fs.access(DOCUMENTS_DIR);
    } catch {
        await fs.mkdir(DOCUMENTS_DIR, { recursive: true });
    }

    const pagesToScrape: { url: string, title: string }[] = [
        { url: BASE_URL, title: 'Verify your identity for Companies House' }
    ];

    // Crawl to find related subpages
    console.log("Fetching main guidance page to discover subpages...");
    const response = await fetch(BASE_URL);
    const $ = cheerio.load(await response.text());

    // Look for links that point to other related guidance
    $('main a').each((_, el) => {
        let href = $(el).attr('href');
        const title = $(el).text().trim();

        if (href && (href.startsWith('/guidance/') || href.includes('/verifying-your-identity'))) {
            if (href.startsWith('/')) href = `https://www.gov.uk${href}`;

            // Strip any anchor fragments and prevent duplicates
            const cleanUrl = href.split('#')[0];

            if (cleanUrl !== BASE_URL && !pagesToScrape.find(p => p.url === cleanUrl)) {
                pagesToScrape.push({ url: cleanUrl, title });
            }
        }
    });

    console.log(`Found ${pagesToScrape.length} pages to scrape in this cluster.`);

    let successCount = 0;
    for (const page of pagesToScrape) {
        const markdownContent = await scrapeUrlToMarkdown(page.url, page.title);

        if (markdownContent.length > 50) {
            const urlParts = page.url.split('?')[0].split('/').filter(Boolean);
            const safeFilename = urlParts[urlParts.length - 1].replace(/[^a-z0-9]/gi, '_').toLowerCase();

            const filePath = path.join(DOCUMENTS_DIR, `${safeFilename}.md`);
            await fs.writeFile(filePath, markdownContent, 'utf-8');
            console.log(`  -> SAVED: ${filePath}`);
            successCount++;
        }
    }

    console.log(`\nWeb Scraper complete! Saved ${successCount} detailed Identity Verification guidance documents.`);
}

runIdVerificationScraper();

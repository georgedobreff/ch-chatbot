import * as cheerio from 'cheerio';
import * as fs from 'fs/promises';
import * as path from 'path';
import pdfParse from 'pdf-parse';

const BASE_URL = 'https://www.gov.uk/government/collections/companies-house-guidance-for-limited-companies-partnerships-and-other-company-types';
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

        if (url.toLowerCase().endsWith('.pdf') || response.headers.get('content-type')?.includes('application/pdf')) {
            const buffer = await response.arrayBuffer();
            const pdfData = await pdfParse(Buffer.from(buffer));

            let markdown = `# ${title} (PDF Document)\n\n`;
            markdown += `*Source: ${url}*\n\n`;

            markdown += pdfData.text.replace(/\n\s*\n/g, '\n\n');
            return markdown;
        }
        if (url.match(/\.(csv|txt)$/i) || response.headers.get('content-type')?.includes('text/csv')) {
            const textData = await response.text();
            let markdown = `# ${title} (Data File)\n\n`;
            markdown += `*Source: ${url}*\n\n`;
            markdown += `\`\`\`\n${textData}\n\`\`\``;
            return markdown;
        }
        if (url.match(/\.(doc|docx|xls|xlsx|odt|zip)$/i)) {
            let markdown = `# ${title} (Downloadable Document)\n\n`;
            markdown += `*Source: ${url}*\n\n`;
            markdown += `[Download/View Document](${url})\n\n`;
            markdown += `(This is a binary document file. Provide the user with the direct link above to download and view the contents.)`;
            return markdown;
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html')) {
            console.warn(`  -> Ignoring unknown format.`);
            return "";
        }

        const html = await response.text();
        const $ = cheerio.load(html);

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

        const contentBlocks = $('.govspeak p, .govspeak li, .govspeak h2, .govspeak h3');

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

async function runScraper() {
    console.log("Starting Deep Web Scraper...");

    try {
        await fs.access(DOCUMENTS_DIR);
    } catch {
        await fs.mkdir(DOCUMENTS_DIR, { recursive: true });
    }

    console.log("Fetching directory collection...");
    const response = await fetch(BASE_URL);
    const $ = cheerio.load(await response.text());

    const landingPages: { url: string, title: string }[] = [];

    // Find all landing pages from the directory
    $('a').each((_, el) => {
        let href = $(el).attr('href');
        const title = $(el).text().trim() || "Guidance Document";

        if (href && href.includes('/government/publications/')) {
            if (href.startsWith('/')) href = `https://www.gov.uk${href}`;

            if (!landingPages.find(p => p.url === href)) {
                landingPages.push({ url: href, title });
            }
        }
    });

    console.log(`Found ${landingPages.length} landing pages. Crawling for actual document attachments...`);

    let documentCount = 1;

    // For each landing page find HTML attachments
    for (const landingPage of landingPages) {
        console.log(`\nInspecting landing page: ${landingPage.title}`);

        try {
            const lpResponse = await fetch(landingPage.url);
            const lpText = await lpResponse.text();
            const lp$ = cheerio.load(lpText);

            const urlObj = new URL(landingPage.url);
            const basePath = urlObj.pathname;

            const actualDocs: { url: string, title: string }[] = [];

            // Look for child attachments
            lp$('a').each((_, el) => {
                let docHref = lp$(el).attr('href');
                if (!docHref) return;

                const isHtmlAttachment = docHref.startsWith(basePath + '/');
                const isAsset = docHref.includes('assets.publishing.service.gov.uk') || docHref.includes('/uploads/');
                const hasFileExtension = docHref.match(/\.(pdf|doc|docx|csv|xls|xlsx|odt|rtf|txt)$/i);

                if (isHtmlAttachment || isAsset || hasFileExtension) {
                    let fullUrl = docHref.startsWith('http') ? docHref : `https://www.gov.uk${docHref}`;
                    if (fullUrl.startsWith('//')) fullUrl = `https:${fullUrl}`;

                    let docTitle = lp$(el).text().trim() || landingPage.title;
                    if (docTitle.toLowerCase() === 'html' || docTitle.toLowerCase() === 'view online' || docTitle === '') {
                        docTitle = landingPage.title;
                    }

                    if (!actualDocs.find(d => d.url === fullUrl)) {
                        actualDocs.push({ url: fullUrl, title: docTitle });
                    }
                }
            });

            // If no links/attachments are found the page must be the document
            if (actualDocs.length === 0) {
                actualDocs.push(landingPage);
            }

            // Scrape
            for (const doc of actualDocs) {
                const markdownContent = await scrapeUrlToMarkdown(doc.url, doc.title);

                // Validate content
                if (markdownContent.length > 50) {
                    const urlParts = doc.url.split('/');
                    let safeFilename = urlParts[urlParts.length - 1].replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    if (!safeFilename || safeFilename.length < 5) safeFilename = `document_${documentCount}`;

                    const filePath = path.join(DOCUMENTS_DIR, `${safeFilename}.md`);
                    await fs.writeFile(filePath, markdownContent, 'utf-8');
                    console.log(`  -> SAVED: ${filePath}`);
                    documentCount++;
                } else {
                    console.log(`  -> Ignored (Too short or empty): ${doc.url}`);
                }
            }

        } catch (err: any) {
            console.error(`Failed to process landing page ${landingPage.url}:`, err.message);
        }
    }

    console.log(`\nWeb Scraper complete! Saved ${documentCount - 1} detailed Markdown guidance documents.`);
}

runScraper();

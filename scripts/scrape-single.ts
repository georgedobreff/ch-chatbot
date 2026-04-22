import * as cheerio from 'cheerio';
import * as fs from 'fs/promises';
import * as path from 'path';
import pdfParse from 'pdf-parse';

const DOCUMENTS_DIR = path.join(process.cwd(), 'documents');

async function scrapeUrlToMarkdown(url: string, title?: string): Promise<string> {
    console.log(`  -> Extracting content from: ${url}`);

    try {
        const headers = { 'User-Agent': 'Mozilla/5.0 Companies House Scraper' };
        const response = await fetch(url, { headers });

        if (!response.ok) {
            console.warn(`  -> Failed to fetch. Status: ${response.status}`);
            return "";
        }

        // Handle PDFs directly by downloading the buffer and extracting literal text
        if (url.toLowerCase().endsWith('.pdf') || response.headers.get('content-type')?.includes('application/pdf')) {
            const buffer = await response.arrayBuffer();
            const pdfData = await pdfParse(Buffer.from(buffer));

            let markdown = `# ${title || 'PDF Document'} (PDF Document)\n\n`;
            markdown += `*Source: ${url}*\n\n`;

            // Strip arbitrary multiple newlines from raw PDF parsing format
            markdown += pdfData.text.replace(/\n\s*\n/g, '\n\n');
            return markdown;
        }

        // Handle raw text formats like CSV or TXT
        if (url.match(/\.(csv|txt)$/i) || response.headers.get('content-type')?.includes('text/csv')) {
            const textData = await response.text();
            let markdown = `# ${title || 'Data File'} (Data File)\n\n`;
            markdown += `*Source: ${url}*\n\n`;
            markdown += `\`\`\`\n${textData}\n\`\`\``;
            return markdown;
        }

        // If it's a proprietary binary blob (doc, xls), save the link and title for context
        if (url.match(/\.(doc|docx|xls|xlsx|odt|zip)$/i)) {
            let markdown = `# ${title || 'Downloadable Document'} (Downloadable Document)\n\n`;
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

        const docTitle = title || $('h1').first().text().trim() || 'Guidance Document';

        // Convert HTML links into Markdown before extracting
        // This ensures the RAG contains the URLs to actual forms and documents
        $('a').each((_, aEl) => {
            const $a = $(aEl);
            let href = $a.attr('href');
            let text = $a.text().trim();
            if (href && text && !href.startsWith('#')) {
                if (href.startsWith('/')) href = `https://www.gov.uk${href}`;
                $a.replaceWith(`[${text}](${href})`);
            }
        });

        let markdown = `# ${docTitle}\n\n`;
        markdown += `*Source: ${url}*\n\n`;

        const contentBlocks = $('.govspeak p, .govspeak li, .govspeak h2, .govspeak h3, .govspeak table');

        if (contentBlocks.length === 0) {
            $('main p, main li, main h2, main h3').each((_, el) => {
                const text = $(el).text().trim();
                const tagName = el.tagName.toLowerCase();

                if (text) {
                    if (tagName === 'h2') markdown += `## ${text}\n\n`;
                    else if (tagName === 'h3') markdown += `### ${text}\n\n`;
                    else if (tagName === 'li') markdown += `- ${text}\n`;
                    else if (text.length > 20) markdown += `${text}\n\n`;
                }
            });
        } else {
            contentBlocks.each((_, el) => {
                const text = $(el).text().trim();
                const tagName = el.tagName.toLowerCase();

                if (text || tagName === 'table') {
                    // Add markdown so the vectorizer keeps context
                    if (tagName === 'h2') markdown += `## ${text}\n\n`;
                    else if (tagName === 'h3') markdown += `### ${text}\n\n`;
                    else if (tagName === 'li') markdown += `- ${text}\n`;
                    else if (tagName === 'table') {
                        // basic table extraction fallback
                        $(el).find('tr').each((_, tr) => {
                            let row = '| ';
                            $(tr).find('td, th').each((_, cell) => {
                                row += $(cell).text().trim() + ' | ';
                            });
                            markdown += row + '\n';
                        });
                        markdown += '\n';
                    }
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

async function runSingleScraper() {
    const targetUrl = process.argv[2];

    if (!targetUrl) {
        console.error("Please provide a URL to scrape. Example: npx tsx scripts/scrape-single.ts <URL>");
        process.exit(1);
    }

    console.log(`Starting to scrape single URL: ${targetUrl}`);

    try {
        await fs.access(DOCUMENTS_DIR);
    } catch {
        await fs.mkdir(DOCUMENTS_DIR, { recursive: true });
    }

    try {
        const markdownContent = await scrapeUrlToMarkdown(targetUrl);

        // Validate content
        if (markdownContent.length > 50) {
            const urlParts = targetUrl.split('/').filter(Boolean); // filter out empty strings
            let safeFilename = urlParts[urlParts.length - 1].replace(/[^a-z0-9]/gi, '_').toLowerCase();

            if (safeFilename.length < 5 && urlParts.length > 2) {
                safeFilename = `${urlParts[urlParts.length - 2].replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${safeFilename}`;
            }

            const filePath = path.join(DOCUMENTS_DIR, `${safeFilename}.md`);
            await fs.writeFile(filePath, markdownContent, 'utf-8');
            console.log(`  -> SAVED: ${filePath}`);
            console.log(`\nSuccessfully scraped and saved to ${filePath}`);
        } else {
            console.log(`  -> Failed: Document was too short or empty.`);
        }

    } catch (err: any) {
        console.error(`Failed to process URL ${targetUrl}:`, err.message);
    }
}

runSingleScraper();

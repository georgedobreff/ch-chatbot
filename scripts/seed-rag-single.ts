import * as fs from 'fs/promises';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.GEMINI_API_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing necessary environment variables. Check .env setup.");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);


async function runSingleIngestionPipeline() {
    const targetFile = process.argv[2];

    if (!targetFile) {
        console.error("Please provide a file path to ingest. Example: npx tsx scripts/seed-rag-single.ts documents/companies_house_fees.md");
        process.exit(1);
    }

    console.log(`Starting RAG ingestion pipeline for local file: ${targetFile}...`);

    try {
        const filePath = path.resolve(process.cwd(), targetFile);

        if (!filePath.endsWith('.md')) {
            console.error(`Error: Only .md files are supported for ingestion. Attempted to parse: ${filePath}`);
            process.exit(1);
        }

        console.log(`Processing ${path.basename(filePath)}...`);
        const content = await fs.readFile(filePath, 'utf-8');

        const lines = content.split('\n');
        const filename = path.basename(filePath);
        const title = lines[0]?.replace('# ', '').trim() || filename;
        let sourceUrl = "Local File";

        if (lines[2]?.startsWith('*Source:')) {
            sourceUrl = lines[2].replace('*Source: ', '').replace('*', '').trim();
        }

        const bodyText = lines.slice(4).join('\n');
        const paragraphs = bodyText.split('\n\n').filter(p => p.trim().length > 20);

        const chunks: string[] = [];
        let currentChunk = "";

        for (const p of paragraphs) {
            if (currentChunk.length + p.length > 500) {
                chunks.push(currentChunk.trim());
                currentChunk = p;
            } else {
                currentChunk += ` ${p}`;
            }
        }
        if (currentChunk) chunks.push(currentChunk.trim());

        console.log(`  -> Split into ${chunks.length} chunks.`);


        for (let i = 0; i < chunks.length; i++) {
            const chunkText = chunks[i];

            if (!chunkText || !chunkText.trim()) continue;


            const { data: existingRecords } = await supabase
                .from('ch_guidance_documents')
                .select('id')
                .eq('url', sourceUrl)
                .eq('content', chunkText);

            if (existingRecords && existingRecords.length > 0) {
                console.log(`  -> Chunk ${i} already exists in DB. Skipping.`);
                continue;
            }

            const embedResponse = await ai.models.embedContent({
                model: "gemini-embedding-001",
                contents: chunkText,
                config: { outputDimensionality: 768 }
            });

            const embedding = embedResponse.embeddings?.[0]?.values;

            if (!embedding) {
                console.log(`  -> Failed to generate embedding for chunk ${i}. Skipping.`);
                continue;
            }

            const { error: insError } = await supabase
                .from('ch_guidance_documents')
                .insert([{
                    url: sourceUrl,
                    title: title,
                    content: chunkText,
                    embedding: embedding
                }]);

            if (insError) {
                console.error(`  -> Insertion Error on chunk ${i}:`, insError);
            } else {
                console.log(`  -> Inserted chunk ${i} successfully.`);
            }
        }

        console.log(`RAG ingestion pipeline complete for ${path.basename(filePath)}!`);

    } catch (err: any) {
        if (err.code === 'ENOENT') {
            console.error(`Error: Could not find file strictly at '${targetFile}'.`);
        } else {
            console.error("Critical Ingestion Pipeline Error:", err);
        }
    }
}

runSingleIngestionPipeline();

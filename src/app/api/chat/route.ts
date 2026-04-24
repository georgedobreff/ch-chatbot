import { NextResponse } from 'next/server';
import { ai, systemPrompts } from '@/lib/ai';
import { supabase } from '@/lib/supabase';
import { Type } from '@google/genai';
import { searchCompanies, getCompanyProfile, getCompanyFilingHistory, getCompanyOfficers } from '@/lib/companiesHouse';
import fs from 'fs';
import path from 'path';

export const maxDuration = 60;

// Helper function to tag dates as PAST or FUTURE
function annotateDates(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
        if (typeof obj === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj)) {
            const targetDate = new Date(obj);
            if (!isNaN(targetDate.getTime())) {
                const currentDate = new Date();
                currentDate.setHours(0, 0, 0, 0);
                targetDate.setHours(0, 0, 0, 0);

                const [year, month, day] = obj.split('-');
                const formattedDate = `${day}/${month}/${year}`;

                if (targetDate < currentDate) return `${formattedDate} (PAST/OVERDUE)`;
                if (targetDate > currentDate) return `${formattedDate} (FUTURE/UPCOMING)`;
                return `${formattedDate} (TODAY)`;
            }
        }
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(annotateDates);
    }

    const annotated: any = {};
    for (const key in obj) {
        annotated[key] = annotateDates(obj[key]);
    }
    return annotated;
}

export async function POST(req: Request) {
    let messages;
    try {
        const json = await req.json();
        messages = json.messages;
    } catch (e) {
        return NextResponse.json({ error: "Invalid JSON request" }, { status: 400 });
    }

    if (!messages || !Array.isArray(messages)) {
        return NextResponse.json({ error: "Invalid messages array" }, { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || lastMessage.role !== "user") {
        return NextResponse.json({ error: "Last message must be from user" }, { status: 400 });
    }

    const MAX_RETRIES = 5;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {

            // This ensures follow-up questions retain context
            const searchContext = messages.map((m: any) => `[${m.role.toUpperCase()}]: ${m.content}`).join("\n");
            const embedResponse = await ai.models.embedContent({
                model: "gemini-embedding-001",
                contents: searchContext,
                config: { outputDimensionality: 768 }
            });

            const queryEmbedding = embedResponse.embeddings?.[0]?.values;

            let contextText = "No specific internal guidance found in RAG database.";
            if (queryEmbedding) {
                // Query database for relevant guidance context
                const { data: documents, error: dbError } = await supabase.rpc("match_guidance", {
                    query_embedding: queryEmbedding,
                    match_count: 20,
                });

                if (dbError) {
                    console.error("Supabase match_guidance error:", dbError);
                } else if (documents && documents.length > 0) {
                    contextText = documents
                        .map((doc: any) => `[Title: ${doc.title} | Source: ${doc.url}]\n${doc.content}`)
                        .join("\n\n---\n\n");
                }
            }

            const systemInstruction = systemPrompts.chatBot(contextText);

            const geminiMessages = messages.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));

            // Tools for the model
            const tools: any[] = [{
                functionDeclarations: [
                    {
                        name: "search_companies_register",
                        description: "Search the official UK Companies House public register for a company by keyword or company name. Returns a list of matches.",
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                query: { type: Type.STRING, description: "The company name or keyword to search for" }
                            },
                            required: ["query"]
                        }
                    },
                    {
                        name: "get_company_profile",
                        description: "Retrieve detailed profile information, incorporation dates, type, and registered office address for a SPECIFIC company using its exact company number.",
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                companyNumber: { type: Type.STRING, description: "The exact 8-character Companies House reference number (CRN)." }
                            },
                            required: ["companyNumber"]
                        }
                    },
                    {
                        name: "get_company_filings",
                        description: "Retrieves the recent filing history and documents (like annual returns, accounts) registered for a specific company by its exact company number.",
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                companyNumber: { type: Type.STRING, description: "The exact 8-character Companies House reference number (CRN)." }
                            },
                            required: ["companyNumber"]
                        }
                    },
                    {
                        name: "get_company_officers",
                        description: "Retrieves the officers (e.g., directors, secretaries) for a specific company by its exact company number. Includes identity verification deadlines.",
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                companyNumber: { type: Type.STRING, description: "The exact 8-character Companies House reference number (CRN)." }
                            },
                            required: ["companyNumber"]
                        }
                    },
                    {
                        name: "escalate_to_live_agent",
                        description: "Trigger this tool if the user explicitly demands to speak to a human, or if you cannot solve their Companies House query and must hand over to the official Companies House Webchat system.",
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                summary: { type: Type.STRING, description: "A summary of why the user needs to speak to a human agent, to pass to the orchestrator." }
                            },
                            required: ["summary"]
                        }
                    },
                    {
                        name: "check_companies_house_fee",
                        description: "Check the exact statutory filing fee for a specific Companies House form, registration, or service.",
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                filing_type: { type: Type.STRING, description: "The type of filing or service you need the fee for (e.g., 'confirmation statement', 'incorporation', 'change of name')." }
                            },
                            required: ["filing_type"]
                        }
                    }
                ]
            }];

            // Initial llm call
            let currentMessages: any[] = [...geminiMessages];
            let chat = await ai.models.generateContent({
                model: "gemini-2.5-pro",
                contents: currentMessages,
                config: {
                    systemInstruction: systemInstruction,
                    tools: tools,
                    temperature: 0.2,
                }
            });

            // Tool evaluation up to 4 consecutive tool hops
            let turnCount = 0;
            while (chat.functionCalls && chat.functionCalls.length > 0 && turnCount < 4) {
                const call = chat.functionCalls[0];
                const args = call.args as any;

                let toolResultObj: any = {};

                try {
                    if (call.name === 'search_companies_register') {
                        toolResultObj = await searchCompanies(args.query);
                    } else if (call.name === 'get_company_profile') {
                        toolResultObj = await getCompanyProfile(args.companyNumber);
                    } else if (call.name === 'get_company_filings') {
                        toolResultObj = await getCompanyFilingHistory(args.companyNumber);
                    } else if (call.name === 'get_company_officers') {
                        toolResultObj = await getCompanyOfficers(args.companyNumber);
                    } else if (call.name === 'check_companies_house_fee') {
                        const feesDocPath = path.join(process.cwd(), 'documents', 'companies_house_fees.md');
                        const feesContext = fs.readFileSync(feesDocPath, 'utf8');
                        toolResultObj = { status: "success", data: feesContext };
                    } else if (call.name === 'escalate_to_live_agent') {
                        return NextResponse.json({
                            role: "assistant",
                            content: `I can help you speak to a Companies House agent.\n\nPlease click the link below to open the official Companies House Webchat. When connected, you can copy and paste the summary below to explain your issue quickly to the agent:\n\n**Copy this summary for the agent:**\n> ${args.summary}\n\n[**Click here to open Companies House Webchat**](https://web-chat.companieshouse.gov.uk/f52bcae8-695e-4368-b33c-7070e194d571)`,
                            action: "ESC_TRIGGERED"
                        });
                    }
                } catch (err: any) {
                    toolResultObj = { error: err.message || "Unknown error occurred" };
                }

                // Avoid 400 error
                if (!toolResultObj || Object.keys(toolResultObj).length === 0) {
                    toolResultObj = { status: "success", data: "No specific data returned from tool." };
                } else {
                    // Date annotations
                    toolResultObj = annotateDates(toolResultObj);
                }

                // Append the function call to the history
                currentMessages.push({
                    role: "model",
                    parts: [{ functionCall: { name: call.name, args: args } }]
                });

                // Append the tool's returning data
                currentMessages.push({
                    role: "user",
                    parts: [{ functionResponse: { name: call.name, response: toolResultObj } }]
                });

                // Re-prompt LLM with new data
                chat = await ai.models.generateContent({
                    model: "gemini-2.5-pro",
                    contents: currentMessages,
                    config: {
                        systemInstruction: systemInstruction,
                        tools: tools,
                        temperature: 0.2,
                    }
                });

                turnCount++;
            }

            const finalOutputText = chat.text || "I didn't catch that. Please try rephrasing.";

            return NextResponse.json({
                role: "assistant",
                content: finalOutputText
            });

        } catch (error: any) {
            console.error(`Chat API Error (Attempt ${attempt}/${MAX_RETRIES}):`, error);
        }
    }

    return NextResponse.json({
        role: "assistant",
        content: "I didn't catch that. Can you please try again?"
    });
}

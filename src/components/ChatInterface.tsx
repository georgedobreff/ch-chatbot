'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Building2, UserCircle2, Loader2, Info } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import ReactMarkdown from 'react-markdown';
import rehypeExternalLinks from 'rehype-external-links';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    isNew?: boolean;
}

const AnimatedMessage = ({ content }: { content: string }) => {
    const [displayedContent, setDisplayedContent] = useState("");
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        let currentIndex = 0;
        const chunkSize = 3; // characters to reveal per tick

        const interval = setInterval(() => {
            if (currentIndex < content.length) {
                const nextContent = content.slice(0, currentIndex + chunkSize);
                setDisplayedContent(nextContent);
                currentIndex += chunkSize;
            } else {
                setDisplayedContent(content);
                setIsComplete(true);
                clearInterval(interval);
            }
        }, 30); // Typing speed

        return () => clearInterval(interval);
    }, [content]);

    return (
        <div className="prose prose-p:leading-relaxed prose-sm max-w-none [&_a]:text-[#1d70b8] [&_a]:underline hover:[&_a]:text-[#003078] [&_a]:font-bold [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown
                rehypePlugins={[[rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]] as any}
            >
                {displayedContent}
            </ReactMarkdown>
            {!isComplete && <span className="inline-block w-2.5 h-4 ml-1 bg-[#1d70b8] animate-pulse align-middle" />}
        </div>
    );
};

export default function ChatInterface() {
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            content: "Hello! How can I help you today?"
        }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg: Message = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [...messages, userMsg] }),
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const data = await response.json();

            setMessages(prev => [...prev, {
                role: data.role,
                content: data.content,
                isNew: true
            }]);

        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, {
                role: 'system',
                content: "We encountered an error contacting the Companies House servers. Please try again later."
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col w-full h-full max-w-4xl bg-white border-x border-[#b1b4b6] sm:border sm:shadow-lg overflow-hidden">
            {/* Embedded Chat Container */}
            <div className="flex flex-col flex-1 bg-white overflow-hidden w-full h-full">
                {/* Messages Area */}
                <div className="flex-1 w-full overflow-y-auto p-4 md:p-6 space-y-6 scroll-smooth bg-white">
                    <AnimatePresence initial={false}>
                        {messages.map((m, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className={cn(
                                    "flex gap-4 max-w-[85%]",
                                    m.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                                )}
                            >
                                <div className="flex-shrink-0 mt-1">
                                    {m.role === 'user' ? (
                                        <div className="w-8 h-8 bg-[#f3f2f1] border border-[#b1b4b6] flex items-center justify-center">
                                            <UserCircle2 className="w-5 h-5 text-[#505a5f]" />
                                        </div>
                                    ) : m.role === 'assistant' ? (
                                        <div className="w-8 h-8 bg-[#0b0c0c] flex items-center justify-center">
                                            <Building2 className="w-4 h-4 text-white" />
                                        </div>
                                    ) : (
                                        <div className="w-8 h-8 bg-[#f47738] flex items-center justify-center">
                                            <Info className="w-4 h-4 text-white" />
                                        </div>
                                    )}
                                </div>

                                <div className={cn(
                                    "p-4 whitespace-pre-wrap text-[19px] leading-relaxed",
                                    m.role === 'user'
                                        ? "bg-[#1d70b8] text-white border-2 border-[#1d70b8]"
                                        : m.role === 'system'
                                            ? "bg-[#f47738] text-white border-[3px] border-[#f47738] text-center mx-auto"
                                            : "bg-[#f3f2f1] text-[#0b0c0c] border-l-4 border-[#b1b4b6]"
                                )}>
                                    {m.role === 'user' ? (
                                        m.content
                                    ) : m.isNew ? (
                                        <AnimatedMessage content={m.content} />
                                    ) : (
                                        <div className="prose prose-p:leading-relaxed prose-sm max-w-none [&_a]:text-[#1d70b8] [&_a]:underline hover:[&_a]:text-[#003078] [&_a]:font-bold [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                                            <ReactMarkdown
                                                rehypePlugins={[[rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]] as any}
                                            >
                                                {m.content}
                                            </ReactMarkdown>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}

                        {isLoading && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex gap-4 max-w-[85%] mr-auto"
                            >
                                <div className="flex-shrink-0 mt-1">
                                    <div className="w-8 h-8 bg-[#0b0c0c] flex items-center justify-center">
                                        <Building2 className="w-4 h-4 text-white" />
                                    </div>
                                </div>
                                <div className="bg-[#f3f2f1] border-l-4 border-[#1d70b8] px-5 py-3.5 flex items-center gap-3 text-[#0b0c0c]">
                                    <Loader2 className="w-5 h-5 animate-spin text-[#1d70b8]" />
                                    <span className="text-[19px]">Searching GOV.UK...</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-[#f3f2f1] border-t-[5px] border-[#1d70b8] pb-12 sm:pb-4 flex-shrink-0 w-full">
                    <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Type your message..."
                            className="w-full border-2 border-[#0b0c0c] rounded-none px-4 py-3 text-[19px] focus:outline-none focus:ring-4 focus:ring-[#ffdd00] focus:border-[#0b0c0c] transition-none bg-white font-sans"
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="px-5 py-3 bg-[#00703c] hover:bg-[#005a30] disabled:opacity-50 disabled:hover:bg-[#00703c] text-white font-bold text-[19px] transition-none flex items-center gap-2 whitespace-nowrap"
                        >
                            <span>Send</span>
                            <Send className="w-4 h-4 ml-1" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

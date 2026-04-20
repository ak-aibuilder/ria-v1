"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../lib/store';
import { Send, Bot, User, Sparkles, Code, ShoppingBag } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  toolCalls?: { name: string; args: any; result: any }[];
}

export default function ValidateView() {
  const { state } = useAppStore();
  const [query, setQuery] = useState('');
  const [preMessages, setPreMessages] = useState<Message[]>([
    { id: '1', role: 'agent', content: 'Hi! I am the baseline shopping agent using your original catalog data. How can I help you?' }
  ]);
  const [postMessages, setPostMessages] = useState<Message[]>([
    { id: '1', role: 'agent', content: 'Hi! I am the enhanced shopping agent using the RIA-enriched catalog. How can I help you?' }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  
  const preScrollRef = useRef<HTMLDivElement>(null);
  const postScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (preScrollRef.current) preScrollRef.current.scrollTop = preScrollRef.current.scrollHeight;
    if (postScrollRef.current) postScrollRef.current.scrollTop = postScrollRef.current.scrollHeight;
  }, [preMessages, postMessages]);

  const scriptedQueries = [
    "I need something durable for everyday use.",
    "What are the care instructions for the t-shirt?",
    "Show me items good for winter."
  ];

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    setPreMessages(prev => [...prev, userMsg]);
    setPostMessages(prev => [...prev, userMsg]);
    setQuery('');
    setIsTyping(true);

    // Simulate agent responses
    setTimeout(() => {
      // Pre-enrichment agent (fails or gives poor answers)
      const preResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: "I'm sorry, I couldn't find specific information about that in the product descriptions. I can only see basic names and prices.",
        toolCalls: [
          { name: 'search_products', args: { query: text }, result: { matches: 0 } }
        ]
      };

      // Post-enrichment agent (succeeds using enriched facets and Q&A)
      let postContent = "Based on our catalog, I found some great options for you!";
      let toolResult = { matches: 2, items: state.enrichedProducts.slice(0, 2).map(p => p.original_fields.name) };

      if (text.includes("durable") || text.includes("everyday")) {
        postContent = `Yes! The ${state.enrichedProducts[0]?.original_fields.name || 'product'} is specifically designed for everyday use and has high durability, according to its specifications.`;
      } else if (text.includes("care")) {
        postContent = "For care instructions, we recommend standard care procedures. Please check the label for specific details.";
      }

      const postResponse: Message = {
        id: (Date.now() + 2).toString(),
        role: 'agent',
        content: postContent,
        toolCalls: [
          { name: 'search_products', args: { query: text, use_facets: true }, result: toolResult }
        ]
      };

      setPreMessages(prev => [...prev, preResponse]);
      setPostMessages(prev => [...prev, postResponse]);
      setIsTyping(false);
    }, 1500);
  };

  const MessageBubble = ({ msg, isEnhanced }: { msg: Message, isEnhanced: boolean }) => (
    <div className={`flex gap-3 mb-6 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        msg.role === 'user' 
          ? 'bg-white/10' 
          : isEnhanced 
            ? 'bg-gradient-to-br from-purple-500 to-blue-500' 
            : 'bg-slate-700'
      }`}>
        {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-white" />}
      </div>
      
      <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[80%]`}>
        <div className={`px-4 py-3 rounded-2xl text-sm ${
          msg.role === 'user' 
            ? 'bg-white/10 text-white rounded-tr-sm' 
            : isEnhanced
              ? 'bg-purple-500/10 border border-purple-500/20 text-white rounded-tl-sm'
              : 'bg-black/30 border border-white/5 text-white/80 rounded-tl-sm'
        }`}>
          {msg.content}
        </div>
        
        {msg.toolCalls && (
          <div className="mt-2 w-full">
            {msg.toolCalls.map((tool, idx) => (
              <div key={idx} className="bg-black/40 border border-white/5 rounded-lg p-2 text-xs font-mono text-white/50 mt-1">
                <div className="flex items-center gap-1 text-blue-400 mb-1">
                  <Code className="w-3 h-3" /> {tool.name}()
                </div>
                <div className="pl-4 border-l border-white/10">
                  <div>Args: {JSON.stringify(tool.args)}</div>
                  <div className={tool.result.matches === 0 ? 'text-red-400/70' : 'text-green-400/70'}>
                    Result: {JSON.stringify(tool.result)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 h-[calc(100vh-200px)] flex flex-col">
      <div className="text-center mb-8 flex-shrink-0">
        <h2 className="text-4xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
          Agent Validation Demo
        </h2>
        <p className="text-lg text-white/70 max-w-2xl mx-auto">
          See the difference. The agent on the left uses your original catalog. The agent on the right uses the RIA-enriched catalog.
        </p>
      </div>

      {/* Scripted Queries */}
      <div className="flex flex-wrap justify-center gap-3 mb-6 flex-shrink-0">
        {scriptedQueries.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(q)}
            disabled={isTyping}
            className="px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-sm transition-colors disabled:opacity-50"
          >
            "{q}"
          </button>
        ))}
      </div>

      {/* Chat Interfaces */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0">
        {/* Pre-Enrichment Chat */}
        <div className="flex flex-col bg-black/20 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl">
          <div className="p-4 border-b border-white/10 bg-white/5 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <h3 className="font-semibold text-white/70">Baseline Agent (Original Data)</h3>
          </div>
          <div ref={preScrollRef} className="flex-1 overflow-y-auto p-6">
            {preMessages.map(msg => <MessageBubble key={msg.id} msg={msg} isEnhanced={false} />)}
            {isTyping && (
              <div className="flex gap-3 mb-6">
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>
                <div className="px-4 py-3 rounded-2xl bg-black/30 border border-white/5 rounded-tl-sm flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Post-Enrichment Chat */}
        <div className="flex flex-col bg-purple-900/10 border border-purple-500/20 rounded-2xl overflow-hidden backdrop-blur-xl shadow-[0_0_30px_rgba(168,85,247,0.1)]">
          <div className="p-4 border-b border-purple-500/20 bg-purple-500/10 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              Enhanced Agent (RIA Enriched)
            </h3>
          </div>
          <div ref={postScrollRef} className="flex-1 overflow-y-auto p-6">
            {postMessages.map(msg => <MessageBubble key={msg.id} msg={msg} isEnhanced={true} />)}
            {isTyping && (
              <div className="flex gap-3 mb-6">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>
                <div className="px-4 py-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 rounded-tl-sm flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="mt-6 flex-shrink-0">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(query); }}
          className="relative max-w-3xl mx-auto"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask the shopping agents a question..."
            className="w-full bg-white/5 border border-white/10 rounded-full pl-6 pr-14 py-4 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all backdrop-blur-xl"
            disabled={isTyping}
          />
          <button
            type="submit"
            disabled={!query.trim() || isTyping}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-transform"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}


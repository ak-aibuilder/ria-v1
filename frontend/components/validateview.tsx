"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../lib/store';
import { validateQuery, AgentTranscript, ToolCall } from '../lib/api';
import { Send, Bot, User, Sparkles, Code, ShoppingBag, AlertTriangle, Receipt } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  toolCalls?: ToolCall[];
  cartPreview?: any[];
  checkoutIntent?: any | null;
  meta?: { turns: number; terminator: string };
}

const SCRIPTED_QUERIES = [
  "I need a jacket for a rainy day in size M under $200.",
  "What would you pair with the Floral White Top for a summer wedding?",
  "Does the Classic Varsity Top come in Medium and is it good for athletic use?",
];

export default function ValidateView() {
  const { state } = useAppStore();
  const [query, setQuery] = useState('');
  const [preMessages, setPreMessages] = useState<Message[]>([
    { id: 'p1', role: 'agent', content: 'Hi! I am the baseline shopping agent using the original (un-enriched) catalog. Ask me anything.' }
  ]);
  const [postMessages, setPostMessages] = useState<Message[]>([
    { id: 'q1', role: 'agent', content: 'Hi! I am the enhanced shopping agent using the RIA-enriched catalog. Ask me anything.' }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preScrollRef = useRef<HTMLDivElement>(null);
  const postScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (preScrollRef.current) preScrollRef.current.scrollTop = preScrollRef.current.scrollHeight;
    if (postScrollRef.current) postScrollRef.current.scrollTop = postScrollRef.current.scrollHeight;
  }, [preMessages, postMessages]);

  const enrichedReady = state.enrichedProducts.length > 0;

  const handleSend = async (text: string) => {
    if (!text.trim() || isTyping) return;
    if (text.trim().length < 10) {
      setError("Query must be at least 10 characters.");
      return;
    }
    setError(null);

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    setPreMessages(prev => [...prev, userMsg]);
    setPostMessages(prev => [...prev, userMsg]);
    setQuery('');
    setIsTyping(true);

    try {
      const res = await validateQuery(text);
      const toMsg = (t: AgentTranscript, suffix: string): Message => ({
        id: `${suffix}-${Date.now()}`,
        role: 'agent',
        content: t.agent_response,
        toolCalls: t.tool_calls,
        cartPreview: t.cart_preview,
        checkoutIntent: t.checkout_intent,
        meta: { turns: t.turns_used, terminator: t.terminator },
      });
      setPreMessages(prev => [...prev, toMsg(res.pre, 'pre')]);
      setPostMessages(prev => [...prev, toMsg(res.post, 'post')]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent run failed");
    } finally {
      setIsTyping(false);
    }
  };

  const MessageBubble = ({ msg, isEnhanced }: { msg: Message; isEnhanced: boolean }) => (
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

      <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[85%] w-full`}>
        <div className={`px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
          msg.role === 'user'
            ? 'bg-white/10 text-white rounded-tr-sm'
            : isEnhanced
              ? 'bg-purple-500/10 border border-purple-500/20 text-white rounded-tl-sm'
              : 'bg-black/30 border border-white/5 text-white/80 rounded-tl-sm'
        }`}>
          {msg.content}
        </div>

        {msg.meta && (
          <div className="mt-1 text-[10px] font-mono text-white/40">
            {msg.meta.turns} turn{msg.meta.turns === 1 ? '' : 's'} · {msg.meta.terminator}
          </div>
        )}

        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="mt-2 w-full space-y-1">
            {msg.toolCalls.map((tool, idx) => {
              const result = tool.result || {};
              const failure = result.error || result.status === 'sku_not_found' || result.status === 'invalid_variant' || (typeof result.result_count === 'number' && result.result_count === 0);
              return (
                <div key={idx} className="bg-black/40 border border-white/5 rounded-lg p-2 text-xs font-mono text-white/50">
                  <div className="flex items-center gap-1 text-blue-400 mb-1">
                    <Code className="w-3 h-3" /> {tool.name}()
                  </div>
                  <div className="pl-4 border-l border-white/10 break-words">
                    <div className="text-white/40">args: {JSON.stringify(tool.args)}</div>
                    <div className={failure ? 'text-red-400/70' : 'text-green-400/70'}>
                      result: {summarizeResult(tool.name, result)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {msg.cartPreview && msg.cartPreview.length > 0 && (
          <div className="mt-2 w-full p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs">
            <div className="flex items-center gap-1 mb-1 font-semibold"><ShoppingBag className="w-3 h-3" /> Cart</div>
            {msg.cartPreview.map((c: any) => (
              <div key={c.cart_item_id} className="font-mono">
                {c.quantity}× {c.sku} {c.variant?.size ? `(size ${c.variant.size})` : ''} — ${c.unit_price}
              </div>
            ))}
          </div>
        )}

        {msg.checkoutIntent && (
          <details className="mt-2 w-full p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-100 text-xs">
            <summary className="flex items-center gap-1 cursor-pointer font-semibold">
              <Receipt className="w-3 h-3" /> CheckoutIntent (acp/0.1)
            </summary>
            <pre className="mt-2 overflow-x-auto text-[10px] leading-relaxed">{JSON.stringify(msg.checkoutIntent, null, 2)}</pre>
          </details>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[600px] md:h-[calc(100vh-200px)] flex flex-col">
      <div className="text-center mb-6 flex-shrink-0">
        <h2 className="text-2xl md:text-4xl font-bold mb-3 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
          Agent Validation Demo
        </h2>
        <p className="text-lg text-white/70 max-w-2xl mx-auto">
          Same Claude tool-use agent on both sides. Left runs against the un-enriched catalog; right runs against the RIA-enriched catalog.
        </p>
      </div>

      {!enrichedReady && (
        <div className="max-w-md mx-auto mb-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Run enrichment first — the agent compares pre vs post enrichment side-by-side.
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3 mb-4 flex-shrink-0">
        {SCRIPTED_QUERIES.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(q)}
            disabled={isTyping || !enrichedReady}
            className="px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-sm transition-colors disabled:opacity-50"
          >
            “{q}”
          </button>
        ))}
      </div>

      {error && (
        <div className="max-w-md mx-auto mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0">
        <div className="flex flex-col bg-black/20 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl">
          <div className="p-4 border-b border-white/10 bg-white/5 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <h3 className="font-semibold text-white/70">Baseline Agent (Original Data)</h3>
          </div>
          <div ref={preScrollRef} className="flex-1 overflow-y-auto p-6">
            {preMessages.map(msg => <MessageBubble key={msg.id} msg={msg} isEnhanced={false} />)}
            {isTyping && <Typing isEnhanced={false} />}
          </div>
        </div>

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
            {isTyping && <Typing isEnhanced={true} />}
          </div>
        </div>
      </div>

      <div className="mt-4 flex-shrink-0">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(query); }} className="relative max-w-3xl mx-auto">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask the shopping agents a question (≥10 chars)…"
            className="w-full bg-white/5 border border-white/10 rounded-full pl-6 pr-14 py-4 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all backdrop-blur-xl"
            disabled={isTyping || !enrichedReady}
          />
          <button
            type="submit"
            disabled={!query.trim() || isTyping || !enrichedReady}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-transform"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}

function Typing({ isEnhanced }: { isEnhanced: boolean }) {
  return (
    <div className="flex gap-3 mb-6">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isEnhanced ? 'bg-gradient-to-br from-purple-500 to-blue-500' : 'bg-slate-700'}`}>
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className={`px-4 py-3 rounded-2xl flex items-center gap-1 rounded-tl-sm ${isEnhanced ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-black/30 border border-white/5'}`}>
        <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${isEnhanced ? 'bg-purple-400' : 'bg-white/40'}`} />
        <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${isEnhanced ? 'bg-purple-400' : 'bg-white/40'}`} style={{ animationDelay: '0.15s' }} />
        <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${isEnhanced ? 'bg-purple-400' : 'bg-white/40'}`} style={{ animationDelay: '0.3s' }} />
      </div>
    </div>
  );
}

function summarizeResult(toolName: string, result: any): string {
  if (!result || typeof result !== 'object') return JSON.stringify(result);
  if (toolName === 'search_products') {
    const matches = result.matches || [];
    if (!matches.length) return `0 matches`;
    return `${matches.length} match(es): ${matches.slice(0, 3).map((m: any) => m.sku).join(', ')}${matches.length > 3 ? '…' : ''}`;
  }
  if (toolName === 'get_product_details') {
    return result.error ? `error: ${result.error}` : `sku=${result.sku} name=${result.name}`;
  }
  if (toolName === 'add_to_cart') {
    return result.status === 'added'
      ? `added cart_item_id=${result.cart_item_id}`
      : `${result.status}${result.reason ? ` (${result.reason})` : ''}`;
  }
  return JSON.stringify(result).slice(0, 200);
}

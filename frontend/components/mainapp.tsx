"use client";

import React from 'react';
import { useAppStore } from '../lib/store';
import UploadView from './uploadview';
import AuditView from './auditview';
import EnrichView from './enrichview';
import ValidateView from './validateview';
import { LayoutDashboard, Upload, Sparkles, MessageSquare, RefreshCw, Download } from 'lucide-react';

export default function MainApp() {
  const { state, setPhase, resetSession } = useAppStore();

  const phases = [
    { id: 'upload', label: 'Upload', icon: Upload },
    { id: 'audit', label: 'Audit', icon: LayoutDashboard },
    { id: 'enrich', label: 'Enrich', icon: Sparkles },
    { id: 'validate', label: 'Validate', icon: MessageSquare },
  ];

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "ria_session_export.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-purple-500/30">
      {/* Global Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-900/20 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-900/20 blur-[120px]" />
        <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] rounded-full bg-pink-900/10 blur-[100px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/10 bg-slate-950/50 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
              RIA
            </span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/5 ml-2">
              Retail Integration Agent
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={handleExport}
              className="flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white transition-colors px-3 py-1.5 rounded-md hover:bg-white/5"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button 
              onClick={resetSession}
              className="flex items-center gap-2 text-sm font-medium text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded-md hover:bg-red-400/10"
            >
              <RefreshCw className="w-4 h-4" />
              Reset Session
            </button>
          </div>
        </div>
      </header>

      {/* Navigation / Progress */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8 relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-white/5 -z-10 rounded-full" />
          
          {phases.map((p, idx) => {
            const isActive = state.phase === p.id;
            const isPast = phases.findIndex(x => x.id === state.phase) > idx;
            const isAccessible = isPast || isActive || (idx === 1 && state.products.length > 0) || (idx === 2 && state.scoredProducts.length > 0) || (idx === 3 && state.enrichedProducts.length > 0);
            
            return (
              <button
                key={p.id}
                onClick={() => isAccessible && setPhase(p.id as any)}
                disabled={!isAccessible}
                className={`flex flex-col items-center gap-2 relative group ${!isAccessible ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isActive 
                    ? 'bg-gradient-to-r from-purple-500 to-blue-500 shadow-lg shadow-purple-500/30 text-white scale-110' 
                    : isPast 
                      ? 'bg-white/20 text-white border border-white/10' 
                      : 'bg-slate-900 text-white/40 border border-white/5'
                }`}>
                  <p.icon className="w-4 h-4" />
                </div>
                <span className={`text-sm font-medium transition-colors ${isActive ? 'text-white' : isPast ? 'text-white/80' : 'text-white/40'}`}>
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Main Content Area */}
        <main className="relative z-10">
          {state.phase === 'upload' && <UploadView />}
          {state.phase === 'audit' && <AuditView />}
          {state.phase === 'enrich' && <EnrichView />}
          {state.phase === 'validate' && <ValidateView />}
        </main>
      </div>
    </div>
  );
}


"use client";

import React, { useState, useRef } from 'react';
import { useAppStore, Product } from '../lib/store';
import { uploadCatalog } from '../lib/api';
import { UploadCloud, FileText, AlertCircle, AlertTriangle, Merge, Trash2 } from 'lucide-react';

type IngestReport = {
  rows_parsed: number;
  rows_dropped: number;
  duplicate_count: number;
  alias_mapping: Record<string, string>;
  missing_required: string[];
};

type UploadResponse =
  | { needs_dedupe: true; report: IngestReport; preview: Product[] }
  | { needs_dedupe: false; products: Product[]; report: IngestReport };

const SAMPLE_CSV = `sku,name,price,category,brand,description
TSH-001,Basic Cotton T-Shirt,19.99,Apparel,BasicsCo,A comfortable cotton t-shirt.
JNS-002,Slim Fit Jeans,49.99,Apparel,DenimWorks,Classic slim fit blue jeans.
SNE-003,Running Sneakers,89.99,Footwear,RunFast,Lightweight running shoes.
JAC-004,Winter Parka,129.99,Outerwear,WinterGear,Warm winter jacket with hood.
HAT-005,Baseball Cap,14.99,Accessories,HeadWear,Adjustable baseball cap.
TSH-001,Basic Cotton T-Shirt,19.99,Apparel,BasicsCo,Available in multiple colors.
`;

export default function UploadView() {
  const { setProducts, setPhase } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [hasDuplicates, setHasDuplicates] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sendFile = async (file: File, strategy: "detect" | "merge" | "first") => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await uploadCatalog<UploadResponse>(file, strategy);
      if (res.needs_dedupe) {
        setPendingFile(file);
        setDuplicateCount(res.report.duplicate_count);
        setHasDuplicates(true);
      } else {
        // Clean parse — auto-advance to Audit (which kicks off scoring on mount).
        setHasDuplicates(false);
        setPendingFile(null);
        setProducts(res.products);
        setPhase('audit');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a valid CSV file.");
      return;
    }
    sendFile(file, "detect");
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) handleFile(e.dataTransfer.files[0]);
  };

  const handleMergeDuplicates = () => {
    if (pendingFile) sendFile(pendingFile, "merge");
  };

  const handleDeleteDuplicates = () => {
    if (pendingFile) sendFile(pendingFile, "first");
  };

  const cancelDuplicates = () => {
    setHasDuplicates(false);
    setPendingFile(null);
  };

  const loadSampleData = () => {
    const file = new File([SAMPLE_CSV], "sample-catalog.csv", { type: "text/csv" });
    sendFile(file, "detect");
  };

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-10">
        <h2 className="text-4xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
          Upload Product Catalog
        </h2>
        <p className="text-lg text-white/70">
          Upload your CSV catalog to begin the agent-readiness transformation.
        </p>
      </div>

      {hasDuplicates ? (
        <div className="bg-white/5 border border-yellow-500/30 rounded-2xl p-8 backdrop-blur-xl shadow-2xl animate-in zoom-in-95 duration-300">
          <div className="flex items-start gap-4 mb-8">
            <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-yellow-400">Duplicate SKUs Detected</h3>
              <p className="text-white/70 mt-1">
                We found {duplicateCount} SKU(s) with multiple entries in your catalog. How would you like to handle them?
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <button
              onClick={handleMergeDuplicates}
              disabled={submitting}
              className="flex flex-col items-center text-center p-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-purple-500/50 transition-all group disabled:opacity-60"
            >
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Merge className="w-6 h-6 text-purple-400" />
              </div>
              <h4 className="font-semibold mb-2">Merge Duplicates</h4>
              <p className="text-sm text-white/50">Combine data from duplicate rows. Missing fields will be filled, and descriptions will be combined.</p>
            </button>

            <button
              onClick={handleDeleteDuplicates}
              disabled={submitting}
              className="flex flex-col items-center text-center p-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-red-500/50 transition-all group disabled:opacity-60"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <h4 className="font-semibold mb-2">Delete Duplicates</h4>
              <p className="text-sm text-white/50">Keep only the first occurrence of each SKU and discard all subsequent duplicate rows.</p>
            </button>
          </div>

          <div className="text-center">
            <button
              onClick={cancelDuplicates}
              disabled={submitting}
              className="text-sm text-white/50 hover:text-white transition-colors"
            >
              Cancel and upload a different file
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => !submitting && fileInputRef.current?.click()}
            className={`relative overflow-hidden border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 ${
              isDragging
                ? 'border-purple-500 bg-purple-500/10 shadow-[0_0_30px_rgba(168,85,247,0.2)]'
                : 'border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/30'
            } ${submitting ? 'cursor-wait' : ''}`}
          >
            <input
              type="file"
              accept=".csv"
              className="hidden"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files?.length) handleFile(e.target.files[0]);
              }}
            />

            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
              <UploadCloud className={`w-10 h-10 ${isDragging ? 'text-purple-400' : 'text-white/60'} ${submitting ? 'animate-pulse' : ''}`} />
            </div>

            <h3 className="text-xl font-semibold mb-2">
              {submitting ? "Parsing CSV…" : "Drag & Drop your CSV here"}
            </h3>
            <p className="text-white/50 mb-6">
              {submitting ? "Audit will start automatically once parsing finishes." : "or click to browse files"}
            </p>

            <div className="inline-flex items-center gap-2 text-sm text-white/40 bg-black/20 px-4 py-2 rounded-full">
              <FileText className="w-4 h-4" />
              Requires: sku, name, price
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="text-center">
            <button
              onClick={loadSampleData}
              disabled={submitting}
              className="text-sm text-purple-400 hover:text-purple-300 underline underline-offset-4 transition-colors disabled:opacity-60"
            >
              Or use sample catalog data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

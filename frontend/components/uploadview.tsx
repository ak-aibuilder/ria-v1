"use client";

import React, { useState, useRef } from 'react';
import { useAppStore, Product } from '../lib/store';
import { UploadCloud, FileText, AlertCircle, CheckCircle2, ArrowRight, AlertTriangle, Merge, Trash2 } from 'lucide-react';

function parseCSV(str: string) {
  const arr: string[][] = [];
  let quote = false;
  let row = 0, col = 0;
  for (let c = 0; c < str.length; c++) {
    let cc = str[c], nc = str[c+1];
    arr[row] = arr[row] || [];
    arr[row][col] = arr[row][col] || '';
    if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }
    if (cc == '"') { quote = !quote; continue; }
    if (cc == ',' && !quote) { ++col; continue; }
    if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }
    if (cc == '\n' && !quote) { ++row; col = 0; continue; }
    if (cc == '\r' && !quote) { ++row; col = 0; continue; }
    arr[row][col] += cc;
  }
  
  if (arr.length < 2) return [];
  const headers = arr[0].map(h => h.trim().toLowerCase());
  return arr.slice(1).filter(row => row.some(cell => cell.trim() !== '')).map(row => {
    const obj: any = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] || '';
    });
    return obj;
  });
}

export default function UploadView() {
  const { setProducts, setPhase } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<Product[] | null>(null);
  const [rawParsedData, setRawParsedData] = useState<Product[] | null>(null);
  const [hasDuplicates, setHasDuplicates] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processParsedProducts = (products: Product[]) => {
    const skuCounts = products.reduce((acc, p) => {
      acc[p.sku] = (acc[p.sku] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const dups = Object.values(skuCounts).filter(c => c > 1).length;

    if (dups > 0) {
      setRawParsedData(products);
      setDuplicateCount(dups);
      setHasDuplicates(true);
    } else {
      setParsedData(products);
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    
    setError(null);
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a valid CSV file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data = parseCSV(text);
        
        if (data.length === 0) {
          setError('The CSV file appears to be empty or invalid.');
          return;
        }

        // Validate required fields
        const firstRow = data[0];
        if (!firstRow.sku || !firstRow.name || !firstRow.price) {
          setError('CSV must contain "sku", "name", and "price" columns.');
          return;
        }

        const products: Product[] = data.map(row => ({
          sku: row.sku,
          name: row.name,
          price: parseFloat(row.price) || 0,
          category: row.category,
          brand: row.brand,
          description: row.description,
          image_urls: row.image_urls,
        }));

        processParsedProducts(products);
      } catch (err) {
        setError('Failed to parse CSV file.');
      }
    };
    reader.readAsText(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleContinue = () => {
    if (parsedData) {
      setProducts(parsedData);
      setPhase('audit');
    }
  };

  const handleMergeDuplicates = () => {
    if (!rawParsedData) return;
    const merged: Record<string, Product> = {};
    
    rawParsedData.forEach(p => {
      if (!merged[p.sku]) {
        merged[p.sku] = { ...p };
      } else {
        const existing = merged[p.sku];
        existing.name = existing.name || p.name;
        existing.price = existing.price || p.price;
        existing.category = existing.category || p.category;
        existing.brand = existing.brand || p.brand;
        
        // Combine descriptions if they are different
        if (!existing.description && p.description) {
          existing.description = p.description;
        } else if (existing.description && p.description && !existing.description.includes(p.description)) {
          existing.description += " " + p.description;
        }
        
        existing.image_urls = existing.image_urls || p.image_urls;
      }
    });
    
    setParsedData(Object.values(merged));
    setHasDuplicates(false);
  };

  const handleDeleteDuplicates = () => {
    if (!rawParsedData) return;
    const seen = new Set<string>();
    const deduplicated = rawParsedData.filter(p => {
      if (seen.has(p.sku)) return false;
      seen.add(p.sku);
      return true;
    });
    
    setParsedData(deduplicated);
    setHasDuplicates(false);
  };

  const loadSampleData = () => {
    const sampleCSV = `sku,name,price,category,brand,description
TSH-001,Basic Cotton T-Shirt,19.99,Apparel,BasicsCo,A comfortable cotton t-shirt.
JNS-002,Slim Fit Jeans,49.99,Apparel,DenimWorks,Classic slim fit blue jeans.
SNE-003,Running Sneakers,89.99,Footwear,RunFast,Lightweight running shoes.
JAC-004,Winter Parka,129.99,Outerwear,WinterGear,Warm winter jacket with hood.
HAT-005,Baseball Cap,14.99,Accessories,HeadWear,Adjustable baseball cap.
TSH-001,Basic Cotton T-Shirt,19.99,Apparel,BasicsCo,Available in multiple colors.`; // Added a duplicate row for demonstration
    
    const data = parseCSV(sampleCSV);
    const products: Product[] = data.map(row => ({
      sku: row.sku,
      name: row.name,
      price: parseFloat(row.price) || 0,
      category: row.category,
      brand: row.brand,
      description: row.description,
    }));
    
    processParsedProducts(products);
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
              className="flex flex-col items-center text-center p-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-purple-500/50 transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Merge className="w-6 h-6 text-purple-400" />
              </div>
              <h4 className="font-semibold mb-2">Merge Duplicates</h4>
              <p className="text-sm text-white/50">Combine data from duplicate rows. Missing fields will be filled, and descriptions will be combined.</p>
            </button>

            <button 
              onClick={handleDeleteDuplicates}
              className="flex flex-col items-center text-center p-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-red-500/50 transition-all group"
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
              onClick={() => { setHasDuplicates(false); setRawParsedData(null); setParsedData(null); }}
              className="text-sm text-white/50 hover:text-white transition-colors"
            >
              Cancel and upload a different file
            </button>
          </div>
        </div>
      ) : !parsedData ? (
        <div className="space-y-6">
          <div 
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative overflow-hidden border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 ${
              isDragging 
                ? 'border-purple-500 bg-purple-500/10 shadow-[0_0_30px_rgba(168,85,247,0.2)]' 
                : 'border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/30'
            }`}
          >
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFile(e.target.files[0]);
                }
              }}
            />
            
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
              <UploadCloud className={`w-10 h-10 ${isDragging ? 'text-purple-400' : 'text-white/60'}`} />
            </div>
            
            <h3 className="text-xl font-semibold mb-2">Drag & Drop your CSV here</h3>
            <p className="text-white/50 mb-6">or click to browse files</p>
            
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
              className="text-sm text-purple-400 hover:text-purple-300 underline underline-offset-4 transition-colors"
            >
              Or use sample catalog data
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Catalog Parsed Successfully</h3>
                <p className="text-white/60">{parsedData.length} products ready for audit</p>
              </div>
            </div>
            <button 
              onClick={() => setParsedData(null)}
              className="text-sm text-white/50 hover:text-white transition-colors"
            >
              Upload different file
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20 mb-8">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-white/50 uppercase bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 font-medium">SKU</th>
                  <th className="px-6 py-4 font-medium">Name</th>
                  <th className="px-6 py-4 font-medium">Price</th>
                  <th className="px-6 py-4 font-medium">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {parsedData.slice(0, 5).map((product, idx) => (
                  <tr key={idx} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-mono text-white/70">{product.sku}</td>
                    <td className="px-6 py-4 font-medium">{product.name}</td>
                    <td className="px-6 py-4 text-white/70">${product.price}</td>
                    <td className="px-6 py-4 text-white/70">{product.category || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedData.length > 5 && (
              <div className="px-6 py-3 text-center text-xs text-white/40 bg-white/5 border-t border-white/10">
                Showing 5 of {parsedData.length} products
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button 
              onClick={handleContinue}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-8 py-3 rounded-xl font-semibold shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/40 transition-all duration-300 transform hover:-translate-y-0.5"
            >
              Run Readiness Audit
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


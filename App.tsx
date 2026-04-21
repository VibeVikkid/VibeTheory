
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { replaceProductInCreative, adaptCreativeDimensions } from './services/geminiService';
import { ProcessedImage } from './types';
import { UploadIcon, SparklesIcon, DownloadIcon, XCircleIcon, CheckCircleIcon, AlertCircleIcon, LayersIcon, PackageIcon, HistoryIcon, TrashIcon } from './components/Icons';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';

interface BatchHistory {
  id: string;
  timestamp: number;
  mode: 'product' | 'size';
  images: ProcessedImage[];
}

const ProcessingItemComponent: React.FC<{ 
  item: ProcessedImage;
  cancelItem: (id: string) => void;
  regenerateItem: (id: string) => Promise<void> | void;
  downloadImage: (url: string, filename: string) => void;
}> = ({ item, cancelItem, regenerateItem, downloadImage }) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const [fakeProgress, setFakeProgress] = useState(0);

  useEffect(() => {
    let interval: any;
    if (item.status === 'processing') {
      setFakeProgress(0);
      interval = setInterval(() => {
        setFakeProgress(prev => {
          if (prev >= 90) return prev;
          const step = Math.random() * 4 + 1;
          const next = prev + step;
          return next > 90 ? 90 : next;
        });
      }, 500);
    } else if (item.status === 'completed') {
      setFakeProgress(100);
    } else {
      setFakeProgress(0);
    }
    return () => clearInterval(interval);
  }, [item.status]);

  let derivedAspectRatio;
  if (item.targetRatio === "1:1") derivedAspectRatio = "1/1";
  else if (item.targetRatio === "4:3") derivedAspectRatio = "4/3";
  else if (item.targetRatio === "3:4") derivedAspectRatio = "3/4";
  else if (item.targetRatio === "16:9") derivedAspectRatio = "16/9";
  else if (item.targetRatio === "9:16") derivedAspectRatio = "9/16";
  else derivedAspectRatio = item.targetDims ? `${item.targetDims.width}/${item.targetDims.height}` : "1/1";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden flex flex-col relative"
    >
      {/* Progress Bar (at the very top edge) */}
      {(item.status === 'processing' || item.status === 'completed') && (
        <div className="absolute top-0 left-0 w-full h-[3px] bg-transparent z-50 overflow-hidden">
          <div 
            className="h-full bg-indigo-500 transition-all duration-300 ease-out" 
            style={{ width: `${item.status === 'completed' ? 100 : fakeProgress}%` }}
          />
        </div>
      )}

      <div className="p-3 bg-black/20 border-b border-white/5 mt-1">
        <div className="flex items-center gap-2">
          <div className="w-12 h-12 rounded bg-black/40 border border-white/10 overflow-hidden relative group">
            <img src={item.creativeUrl} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[8px] uppercase font-bold">Creative</span>
            </div>
          </div>
          {item.productUrls.length > 0 && (
            <>
              <div className="flex items-center text-gray-600">+</div>
              <div className="flex -space-x-4 overflow-hidden">
                {item.productUrls.slice(0, 3).map((url, idx) => (
                  <div key={idx} className="w-12 h-12 rounded bg-black/40 border border-white/10 overflow-hidden relative group">
                    <img src={url} className="w-full h-full object-cover" />
                  </div>
                ))}
                {item.productUrls.length > 3 && (
                  <div className="w-12 h-12 rounded bg-gray-800 border border-white/10 flex items-center justify-center text-[10px] font-bold">
                    +{item.productUrls.length - 3}
                  </div>
                )}
              </div>
            </>
          )}
          <div className="ml-auto flex items-center">
            {item.status === 'pending' && (
              <div className="flex flex-col items-end gap-1">
                <span className="text-gray-500 text-[10px] font-mono uppercase flex items-center gap-1">
                  Pending
                </span>
              </div>
            )}
            {item.status === 'processing' && (
              <div className="flex flex-col items-end gap-1.5 mt-0.5">
                <div className="flex items-center gap-1.5 text-yellow-500 text-[10px] font-mono uppercase">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                  Processing {Math.round(fakeProgress)}%
                </div>
                <button 
                  onClick={() => cancelItem(item.id)} 
                  className="px-2 py-0.5 rounded bg-red-500/20 text-red-500 hover:bg-red-500/30 text-[9px] uppercase font-bold transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
            {item.status === 'completed' && (
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-1.5 text-green-500 text-[10px] font-mono uppercase">
                  <CheckCircleIcon className="w-3 h-3" />
                  Done
                </div>
                <button
                  onClick={() => setShowOriginal(!showOriginal)}
                  className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold transition-all border ${
                    showOriginal 
                      ? 'bg-purple-500 border-purple-500 text-white' 
                      : 'bg-white/5 border-white/10 text-gray-400'
                  }`}
                >
                  {showOriginal ? 'View Result' : 'Compare Original'}
                </button>
              </div>
            )}
            {(item.status === 'error' || item.status === 'cancelled') && (
              <div className="flex flex-col items-end gap-1.5">
                <span className={`text-[10px] font-mono uppercase flex items-center gap-1 ${item.status === 'error' ? 'text-red-500' : 'text-gray-500'}`}>
                  {item.status === 'error' && <AlertCircleIcon className="w-3 h-3" />}
                  {item.status === 'error' ? 'Error' : 'Cancelled'}
                </span>
                <button 
                  onClick={() => regenerateItem(item.id)} 
                  className="px-2 py-0.5 rounded bg-white/10 text-white hover:bg-white/20 text-[9px] uppercase font-bold transition-colors"
                >
                  Regenerate
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Result Area */}
      <div 
        className="relative bg-black/40 flex items-center justify-center overflow-hidden transition-all duration-500"
        style={{ aspectRatio: derivedAspectRatio }}
      >
        {item.status === 'pending' && (
          <div className="text-gray-600 flex flex-col items-center gap-2">
            <SparklesIcon className="w-8 h-8 opacity-20" />
            <span className="text-xs uppercase tracking-widest font-mono">Waiting</span>
          </div>
        )}
        {item.status === 'processing' && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
            <span className="text-xs uppercase tracking-widest font-mono text-purple-400">AI is Designing...</span>
          </div>
        )}
        {item.status === 'completed' && item.resultUrl && (
          <div className="w-full h-full relative group">
            <AnimatePresence mode="wait">
              {showOriginal ? (
                <motion.img
                  key="original"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  src={item.creativeUrl}
                  className="w-full h-full object-contain"
                />
              ) : (
                <motion.img
                  key="result"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  src={item.resultUrl}
                  className="w-full h-full object-contain"
                />
              )}
            </AnimatePresence>
            <div className="absolute top-2 left-2 pointer-events-none">
                <span className="bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] uppercase font-bold tracking-widest text-white/80 border border-white/10">
                  {showOriginal ? 'Original' : 'Generated'}
                </span>
            </div>
          </div>
        )}
        {item.status === 'error' && (
          <div className="text-red-500/50 flex flex-col items-center gap-2 p-4 text-center">
            <AlertCircleIcon className="w-8 h-8" />
            <span className="text-xs font-mono">{item.error || 'Generation failed'}</span>
          </div>
        )}
        {item.status === 'cancelled' && (
          <div className="text-gray-500 flex flex-col items-center gap-2 p-4 text-center">
            <span className="text-xs font-mono uppercase tracking-widest text-center max-w-[200px] opacity-60">Cancelled by user</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {item.status === 'completed' && item.resultUrl && (
        <div className="p-3 bg-black/20 border-t border-white/5">
          <button
            onClick={() => downloadImage(item.resultUrl!, `creative-${item.id}.png`)}
            className="w-full py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <DownloadIcon className="w-4 h-4" />
            Download Result
          </button>
        </div>
      )}
    </motion.div>
  );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'product' | 'size'>('product');
  const [creatives, setCreatives] = useState<{ file: File; url: string }[]>([]);
  const [products, setProducts] = useState<{ file: File; url: string }[]>([]);
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<"1:1" | "4:3" | "3:4" | "16:9" | "9:16">("1:1");
  const [selectedResolution, setSelectedResolution] = useState<"1k" | "2k" | "4k" | "8k">("2k");
  const [isCustomDimensions, setIsCustomDimensions] = useState(false);
  const [customWidth, setCustomWidth] = useState<number>(2048);
  const [customHeight, setCustomHeight] = useState<number>(2048);
  
  // Resize Mode State
  const [composition, setComposition] = useState<'preserve_original' | 'left_text_right_elements' | 'right_text_left_elements' | 'top_text_bottom_elements' | 'bottom_text_top_elements'>('preserve_original');
  const [textAlignment, setTextAlignment] = useState<'top_left' | 'top_center' | 'top_right' | 'middle_left' | 'middle_center' | 'middle_right' | 'bottom_left' | 'bottom_center' | 'bottom_right'>('middle_center');
  
  const [showOriginals, setShowOriginals] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<BatchHistory[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDraggingCreative, setIsDraggingCreative] = useState(false);
  const [isDraggingProduct, setIsDraggingProduct] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllers = useRef(new Map<string, AbortController>());

  const processItem = async (item: ProcessedImage): Promise<ProcessedImage> => {
    const abortController = new AbortController();
    abortControllers.current.set(item.id, abortController);
    
    setProcessedImages(prev => prev.map(p => p.id === item.id ? { ...p, status: 'processing', error: undefined, progress: 0 } : p));

    try {
      let resultUrl: string;
      if (item.activeTab === 'product') {
        resultUrl = await replaceProductInCreative(item.creativeFile, item.productFiles, item.targetRatio, item.targetDims, abortController.signal);
      } else {
        resultUrl = await adaptCreativeDimensions(item.creativeFile, item.targetRatio, item.targetDims, item.composition, item.textAlignment, abortController.signal);
      }
      
      const updated = { ...item, status: 'completed' as const, resultUrl, progress: 100 };
      setProcessedImages(prev => prev.map(p => p.id === item.id ? updated : p));
      return updated;
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('AbortError') || err.message?.includes('abort')) {
        const updated = { ...item, status: 'cancelled' as const };
        setProcessedImages(prev => prev.map(p => p.id === item.id ? updated : p));
        return updated;
      } else {
        console.error(err);
        const updated = { ...item, status: 'error' as const, error: 'Failed' };
        setProcessedImages(prev => prev.map(p => p.id === item.id ? updated : p));
        return updated;
      }
    } finally {
      abortControllers.current.delete(item.id);
    }
  };

  const cancelItem = (id: string) => {
    const controller = abortControllers.current.get(id);
    if (controller) {
      controller.abort();
    } else {
      setProcessedImages(prev => prev.map(p => p.id === id && p.status === 'pending' ? { ...p, status: 'cancelled' } : p));
    }
  };

  const regenerateItem = async (id: string) => {
    // Note: since we don't have a background queue, regenerate processes immediately in the background
    setProcessedImages(prev => prev.map(p => p.id === id ? { ...p, status: 'pending' } : p));
    
    // Slight delay to allow state update before processing
    setTimeout(async () => {
      let currentImages: ProcessedImage[] = [];
      setProcessedImages(prev => { currentImages = prev; return prev; });
      const itemToProcess = currentImages.find(i => i.id === id);
      if (itemToProcess) {
        await processItem(itemToProcess);
      }
    }, 50);
  };

  // Load history from localStorage on mount (metadata only usually, but let's see)
  useEffect(() => {
    const savedHistory = localStorage.getItem('creative_replacer_history');
    if (savedHistory) {
      try {
        // Note: Blob URLs won't work after refresh, so we'd need base64 for true persistence.
        // For now, we'll keep session-based history and persist metadata.
        const parsed = JSON.parse(savedHistory);
        setHistory(parsed);
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  // Save history to localStorage (only metadata to avoid quota issues)
  useEffect(() => {
    const metadata = history.map(h => ({
      ...h,
      images: h.images.map(img => ({ ...img, resultUrl: img.resultUrl?.startsWith('data:') ? img.resultUrl : undefined }))
    }));
    // Filter out items without results to keep storage clean
    localStorage.setItem('creative_replacer_history', JSON.stringify(metadata.slice(0, 10))); 
  }, [history]);

  const handleCreativeUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newCreatives = Array.from(files).map((file: File) => ({
        file,
        url: URL.createObjectURL(file)
      }));
      setCreatives(prev => [...prev, ...newCreatives]);
    }
  };

  const handleProductUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newProducts = Array.from(files).map((file: File) => ({
        file,
        url: URL.createObjectURL(file)
      }));
      setProducts(prev => [...prev, ...newProducts]);
    }
  };

  const removeCreative = (index: number) => {
    setCreatives(prev => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].url);
      next.splice(index, 1);
      return next;
    });
  };

  const removeProduct = (index: number) => {
    setProducts(prev => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].url);
      next.splice(index, 1);
      return next;
    });
  };

  const pairs = useMemo(() => {
    const result: { creative: typeof creatives[0]; product: typeof products[0] }[] = [];
    if (creatives.length === 0 || products.length === 0) return result;

    // Logic: 
    // If one creative and multiple products -> 1 creative for each product
    // If multiple creatives and one product -> each creative with that product
    // If multiple of both -> pair by index
    
    if (creatives.length === 1) {
      products.forEach(p => result.push({ creative: creatives[0], product: p }));
    } else if (products.length === 1) {
      creatives.forEach(c => result.push({ creative: c, product: products[0] }));
    } else {
      const count = Math.min(creatives.length, products.length);
      for (let i = 0; i < count; i++) {
        result.push({ creative: creatives[i], product: products[i] });
      }
    }
    return result;
  }, [creatives, products]);

  const startBatchProcessing = async () => {
    if (creatives.length === 0) return;
    if (activeTab === 'product' && products.length === 0) return;

    // Determine final aspect ratio and dimensions
    let finalRatio = selectedAspectRatio;
    const resMap = { "1k": 1024, "2k": 2048, "4k": 4096, "8k": 7680 };
    const baseSize = resMap[selectedResolution];
    let dims: { width: number; height: number } = { width: baseSize, height: baseSize };

    if (isCustomDimensions) {
      dims = { width: customWidth, height: customHeight };
      const ratio = customWidth / customHeight;
      if (ratio > 1.5) finalRatio = "16:9";
      else if (ratio > 1.1) finalRatio = "4:3";
      else if (ratio > 0.9) finalRatio = "1:1";
      else if (ratio > 0.6) finalRatio = "3:4";
      else finalRatio = "9:16";
    } else {
      // Calculate resolution-aware presets
      if (selectedAspectRatio === "1:1") dims = { width: baseSize, height: baseSize };
      else if (selectedAspectRatio === "4:3") dims = { width: baseSize, height: Math.round(baseSize * 0.75) };
      else if (selectedAspectRatio === "3:4") dims = { width: Math.round(baseSize * 0.75), height: baseSize };
      else if (selectedAspectRatio === "16:9") dims = { width: baseSize, height: Math.round(baseSize * 0.5625) };
      else if (selectedAspectRatio === "9:16") dims = { width: Math.round(baseSize * 0.5625), height: baseSize };
    }

    // API Key Selection for high-quality models
    const aistudio = (window as any).aistudio;
    if (aistudio && !(await aistudio.hasSelectedApiKey())) {
      await aistudio.openSelectKey();
      // Assume success and proceed as per instructions
    }
    
    setIsProcessing(true);
    setError(null);
    
    const initialProcessed: ProcessedImage[] = creatives.map((creative, idx) => ({
      id: `${Date.now()}-${idx}`,
      creativeFile: creative.file,
      productFiles: activeTab === 'product' ? products.map(p => p.file) : [],
      creativeUrl: creative.url,
      productUrls: activeTab === 'product' ? products.map(p => p.url) : [],
      status: 'pending',
      targetRatio: finalRatio,
      targetDims: dims,
      composition: composition,
      textAlignment: textAlignment,
      activeTab: activeTab
    }));
    
    setProcessedImages(initialProcessed);

    const results: ProcessedImage[] = [];

    for (let i = 0; i < initialProcessed.length; i++) {
      // Check if it was cancelled while waiting in queue
      let currentStatus = 'pending';
      setProcessedImages(prev => {
        const currentItem = prev.find(p => p.id === initialProcessed[i].id);
        if (currentItem) currentStatus = currentItem.status;
        return prev;
      });
      
      if (currentStatus === 'cancelled') {
         results.push({ ...initialProcessed[i], status: 'cancelled' });
         continue;
      }
      
      const result = await processItem(initialProcessed[i]);
      results.push(result);
    }
    
    // Add to history
    setHistory(prev => [{
      id: `batch-${Date.now()}`,
      timestamp: Date.now(),
      mode: activeTab,
      images: results
    }, ...prev]);

    setIsProcessing(false);
  };

  const downloadAllAsZip = async (images: ProcessedImage[]) => {
    const zip = new JSZip();
    const completedImages = images.filter(img => img.status === 'completed' && img.resultUrl);
    
    if (completedImages.length === 0) return;

    for (let i = 0; i < completedImages.length; i++) {
      const img = completedImages[i];
      try {
        const response = await fetch(img.resultUrl!);
        const blob = await response.blob();
        
        // Use original filename with extension
        const originalName = img.creativeFile.name;
        const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.'));
        const ext = originalName.substring(originalName.lastIndexOf('.'));
        zip.file(`${nameWithoutExt}-edited${ext}`, blob);
      } catch (e) {
        console.error("Failed to add file to zip", img.creativeFile.name, e);
      }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `creative-batch-${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('creative_replacer_history');
  };

  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] font-sans selection:bg-purple-500/30">
      {/* Header */}
      <header className="border-b border-white/10 p-6 backdrop-blur-md sticky top-0 z-50 bg-black/50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-2 rounded-lg shadow-lg shadow-purple-500/20">
              <SparklesIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Batch Creative Replacer</h1>
              <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">AI-Powered Product Swap</p>
            </div>
          </div>
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 mx-auto">
            <button
              onClick={() => setActiveTab('product')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'product' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Product Replacer
            </button>
            <button
              onClick={() => setActiveTab('size')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'size' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Size Adaptor
            </button>
          </div>
          <div className="flex items-center gap-4">
             <button
                onClick={() => setIsHistoryOpen(true)}
                className="p-2 text-gray-400 hover:text-white transition-colors relative"
              >
                <HistoryIcon className="w-6 h-6" />
                {history.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {history.length}
                  </span>
                )}
              </button>
             {(activeTab === 'product' ? (creatives.length > 0 && products.length > 0) : creatives.length > 0) && (
                <button
                  onClick={startBatchProcessing}
                  disabled={isProcessing}
                  className="px-6 py-2 bg-white text-black font-bold rounded-full hover:bg-purple-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isProcessing ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {activeTab === 'product' ? 'Replacing...' : 'Adapting...'}
                    </span>
                  ) : (
                    <>Process {creatives.length} {activeTab === 'product' ? 'Replacements' : 'Adaptations'}</>
                  )}
                </button>
             )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-12">
        {/* Upload Section */}
        <section className={`grid grid-cols-1 ${activeTab === 'product' ? 'lg:grid-cols-2' : ''} gap-8`}>
          {/* Creatives Upload */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <LayersIcon className="w-5 h-5 text-purple-400" />
                1. Original Creatives
              </h2>
              <span className="text-xs font-mono text-gray-500">{creatives.length} uploaded</span>
            </div>
            <div className={`relative group transition-all duration-300 ${isDraggingCreative ? 'scale-[1.02]' : ''}`}>
              <div 
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all bg-white/5 ${
                  isDraggingCreative 
                    ? 'border-purple-500 bg-purple-500/10 shadow-2xl shadow-purple-500/20' 
                    : 'border-white/10 hover:border-purple-500/50'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDraggingCreative(true); }}
                onDragLeave={() => setIsDraggingCreative(false)}
                onDrop={(e) => { e.preventDefault(); setIsDraggingCreative(false); }}
              >
                <UploadIcon className={`w-10 h-10 mx-auto mb-4 transition-colors ${
                  isDraggingCreative ? 'text-purple-400' : 'text-gray-600 group-hover:text-purple-400'
                }`} />
                <p className={`text-sm transition-colors ${isDraggingCreative ? 'text-purple-300' : 'text-gray-400'}`}>
                  {isDraggingCreative ? 'Drop to Add Creatives' : 'Drop creative templates here'}
                </p>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleCreativeUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {creatives.map((c, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-white/10 group">
                  <img src={c.url} className="w-full h-full object-cover" />
                  <button 
                    onClick={() => removeCreative(i)}
                    className="absolute top-1 right-1 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <XCircleIcon className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Products Upload */}
          {activeTab === 'product' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <PackageIcon className="w-5 h-5 text-pink-400" />
                  2. New Products
                </h2>
                <span className="text-xs font-mono text-gray-500">{products.length} uploaded</span>
              </div>
              <div className={`relative group transition-all duration-300 ${isDraggingProduct ? 'scale-[1.02]' : ''}`}>
                <div 
                  className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all bg-white/5 ${
                    isDraggingProduct 
                      ? 'border-pink-500 bg-pink-500/10 shadow-2xl shadow-pink-500/20' 
                      : 'border-white/10 hover:border-pink-500/50'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingProduct(true); }}
                  onDragLeave={() => setIsDraggingProduct(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDraggingProduct(false); }}
                >
                  <UploadIcon className={`w-10 h-10 mx-auto mb-4 transition-colors ${
                    isDraggingProduct ? 'text-pink-400' : 'text-gray-600 group-hover:text-pink-400'
                  }`} />
                  <p className={`text-sm transition-colors ${isDraggingProduct ? 'text-pink-300' : 'text-gray-400'}`}>
                    {isDraggingProduct ? 'Drop to Add Products' : 'Drop product images here'}
                  </p>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleProductUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {products.map((p, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-white/10 group">
                    <img src={p.url} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => removeProduct(i)}
                      className="absolute top-1 right-1 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <XCircleIcon className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Adaptation Options */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <SparklesIcon className="w-5 h-5 text-yellow-400" />
              {activeTab === 'product' ? '3. Adapt Dimensions' : '2. Adapt Dimensions'}
            </h2>
          </div>
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex flex-wrap gap-4 flex-1">
              {[
                { id: "1:1", label: "Square (1:1)", icon: "■" },
                { id: "4:3", label: "Classic (4:3)", icon: "▭" },
                { id: "3:4", label: "Portrait (3:4)", icon: "▯" },
                { id: "16:9", label: "Landscape (16:9)", icon: "▬" },
                { id: "9:16", label: "Story (9:16)", icon: "▮" },
              ].map((ratio) => (
                <button
                  key={ratio.id}
                  onClick={() => {
                    setSelectedAspectRatio(ratio.id as any);
                    setIsCustomDimensions(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                    !isCustomDimensions && selectedAspectRatio === ratio.id
                      ? "bg-purple-600/20 border-purple-500 text-purple-400 shadow-lg shadow-purple-500/10"
                      : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
                  }`}
                >
                  <span className="text-lg">{ratio.icon}</span>
                  <span className="text-sm font-medium">{ratio.label}</span>
                </button>
              ))}
              <button
                onClick={() => setIsCustomDimensions(true)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  isCustomDimensions
                    ? "bg-purple-600/20 border-purple-500 text-purple-400 shadow-lg shadow-purple-500/10"
                    : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
                }`}
              >
                <span className="text-lg">⚙</span>
                <span className="text-sm font-medium">Custom Size</span>
              </button>
            </div>

            {/* Resolution Toggle */}
            <div className="bg-white/5 p-1 rounded-xl border border-white/10 flex items-center h-fit">
              {(['1k', '2k', '4k', '8k'] as const).map((res) => (
                <button
                  key={res}
                  onClick={() => setSelectedResolution(res)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all uppercase ${
                    selectedResolution === res 
                      ? 'bg-purple-600 text-white shadow-lg' 
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {res}
                </button>
              ))}
            </div>
          </div>

            {isCustomDimensions && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-end gap-6 bg-white/5 p-6 rounded-2xl border border-white/10 max-w-lg"
              >
                <div className="space-y-2 flex-1">
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider">Width (px)</label>
                  <input 
                    type="number"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(parseInt(e.target.value) || 0)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 focus:border-purple-500 outline-none transition-colors"
                  />
                </div>
                <div className="flex items-center justify-center mb-2 text-gray-600 text-xl font-bold">×</div>
                <div className="space-y-2 flex-1">
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider">Height (px)</label>
                  <input 
                    type="number"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(parseInt(e.target.value) || 0)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 focus:border-purple-500 outline-none transition-colors"
                  />
                </div>
                <div className="ml-4 space-y-2">
                  <label className="text-xs text-gray-500 uppercase font-bold tracking-wider opacity-0">Ratio</label>
                  <div className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-3 py-2 rounded-lg text-xs font-mono">
                    {(customWidth / customHeight).toFixed(2)}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Resize specific controls */}
            {activeTab === 'size' && (
              <div className="flex flex-col gap-8 pt-6 border-t border-white/5">
                <div className="space-y-4">
                  <label className="text-sm font-semibold text-gray-300">Composition Layout</label>
                  <p className="text-xs text-gray-500 italic">Select how text and elements are rearranged.</p>
                  
                  <div className="flex flex-wrap gap-3">
                    {[
                      { id: 'top_text_bottom_elements', label: 'Top text', sub: 'Bottom art' },
                      { id: 'bottom_text_top_elements', label: 'Top art', sub: 'Bottom text' },
                      { id: 'left_text_right_elements', label: 'Left text', sub: 'Right art' },
                      { id: 'right_text_left_elements', label: 'Left art', sub: 'Right text' },
                      { id: 'preserve_original', label: 'Preserve', sub: 'original' },
                    ].map(comp => (
                      <button
                        key={comp.id}
                        onClick={() => {
                          setComposition(comp.id as any);
                          if (comp.id === 'preserve_original') setTextAlignment('middle_center');
                        }}
                        className={`p-3 rounded-2xl flex flex-col items-center justify-center w-[120px] transition-all bg-white border ${
                          composition === comp.id 
                            ? 'border-[2px] border-indigo-500 shadow-md scale-105 z-10' 
                            : 'border-gray-200 hover:border-gray-300 opacity-90'
                        }`}
                      >
                        <div className="mb-3 mt-1 h-12 w-12 flex items-center justify-center">
                          {comp.id === 'top_text_bottom_elements' && (
                            <div className="w-12 h-12 bg-white flex flex-col p-1.5 gap-1 border border-gray-200 rounded">
                              <div className="w-full h-1/3 bg-gray-400 rounded-sm"></div>
                              <div className="w-full flex-1 border border-indigo-200 bg-indigo-50 flex items-center justify-center rounded-sm">
                                <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
                              </div>
                            </div>
                          )}
                          {comp.id === 'bottom_text_top_elements' && (
                            <div className="w-12 h-12 bg-white flex flex-col p-1.5 gap-1 border border-gray-200 rounded">
                              <div className="w-full flex-1 border border-indigo-200 bg-indigo-50 flex items-center justify-center rounded-sm">
                                <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
                              </div>
                              <div className="w-full h-1/3 bg-gray-400 rounded-sm"></div>
                            </div>
                          )}
                          {comp.id === 'left_text_right_elements' && (
                            <div className="w-12 h-12 bg-white flex p-1.5 gap-1 border border-gray-200 rounded">
                              <div className="h-full w-1/3 bg-gray-400 rounded-sm"></div>
                              <div className="h-full flex-1 border border-indigo-200 bg-indigo-50 flex items-center justify-center rounded-sm">
                                <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
                              </div>
                            </div>
                          )}
                          {comp.id === 'right_text_left_elements' && (
                            <div className="w-12 h-12 bg-white flex p-1.5 gap-1 border border-gray-200 rounded">
                              <div className="h-full flex-1 border border-indigo-200 bg-indigo-50 flex items-center justify-center rounded-sm">
                                <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
                              </div>
                              <div className="h-full w-1/3 bg-gray-400 rounded-sm"></div>
                            </div>
                          )}
                          {comp.id === 'preserve_original' && (
                            <div className="w-12 h-12 bg-white flex flex-col p-1.5 gap-1 border border-gray-200 rounded relative">
                              <div className="w-1/2 h-1.5 bg-gray-400 rounded-sm mx-auto mt-1"></div>
                              <div className="w-2/3 flex-1 border border-indigo-200 bg-indigo-50 flex items-center justify-center rounded-sm mx-auto relative relative">
                                <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
                                <HistoryIcon className="w-3 h-3 absolute bottom-0 right-0 text-gray-500 translate-x-1 translate-y-1" />
                              </div>
                            </div>
                          )}
                        </div>
                        <span className="text-[12px] font-bold text-gray-800 text-center leading-tight">{comp.label}</span>
                        <span className="text-[11px] font-medium text-gray-500 text-center leading-tight mt-0.5">{comp.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <label className="text-sm font-semibold text-gray-300">Text Alignment</label>
                      <p className="text-xs text-gray-500 italic mt-0.5">Where text sits within its zone.</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-8 items-start">
                    <div className={`grid grid-cols-3 gap-1 w-fit ${composition === 'preserve_original' ? 'opacity-30 pointer-events-none' : ''}`}>
                      {['top_left', 'top_center', 'top_right', 'middle_left', 'middle_center', 'middle_right', 'bottom_left', 'bottom_center', 'bottom_right'].map(align => (
                        <button
                          key={align}
                          onClick={() => setTextAlignment(align as any)}
                          disabled={composition === 'preserve_original'}
                          className={`w-[34px] h-[34px] rounded-lg border transition-all flex items-center justify-center bg-white hover:border-gray-400 ${
                             textAlignment === align 
                               ? 'border-gray-900 shadow-sm' 
                               : 'border-gray-200'
                          }`}
                        >
                          <div className={`w-[26px] h-[26px] rounded flex items-center justify-center transition-colors ${textAlignment === align ? 'bg-gray-900' : 'bg-transparent'}`}>
                             {textAlignment === align && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                          </div>
                        </button>
                      ))}
                    </div>
                    
                    <div className={`w-[130px] h-[90px] bg-white border border-gray-200 rounded-xl relative overflow-hidden transition-all shadow-sm ${composition === 'preserve_original' ? 'opacity-30' : ''}`}>
                      <div 
                        className={`absolute w-[45px] h-2 bg-gray-500 rounded-sm transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]`}
                        style={{
                          top: textAlignment.includes('top') ? '8px' : textAlignment.includes('bottom') ? 'auto' : '50%',
                          bottom: textAlignment.includes('bottom') ? '8px' : 'auto',
                          left: textAlignment.includes('left') ? '8px' : textAlignment.includes('right') ? 'auto' : '50%',
                          right: textAlignment.includes('right') ? '8px' : 'auto',
                          transform: `translate(${textAlignment.includes('center') ? '-50%' : '0'}, ${textAlignment.includes('middle') ? '-50%' : '0'})`
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
        </section>

        {/* Queue / Results Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <h2 className="text-xl font-bold">Processing Queue & Results</h2>
            <div className="flex items-center gap-4">
              {processedImages.some(img => img.status === 'completed') && (
                <button
                  onClick={() => downloadAllAsZip(processedImages)}
                  className="px-4 py-2 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-600/30 transition-all flex items-center gap-2 text-sm"
                >
                  <DownloadIcon className="w-4 h-4" />
                  Download All (ZIP)
                </button>
              )}
              <div className="flex gap-4 text-xs font-mono">
                <span className="flex items-center gap-1 text-gray-500">
                  <div className="w-2 h-2 rounded-full bg-gray-500" /> Pending
                </span>
                <span className="flex items-center gap-1 text-yellow-500">
                  <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" /> Processing
                </span>
                <span className="flex items-center gap-1 text-green-500">
                  <div className="w-2 h-2 rounded-full bg-green-500" /> Completed
                </span>
              </div>
            </div>
          </div>

          {processedImages.length === 0 && creatives.length > 0 && products.length > 0 && !isProcessing && (
            <div className="bg-white/5 rounded-2xl p-12 text-center border border-white/5">
              <p className="text-gray-400 mb-4">Ready to process {creatives.length} creatives using {products.length} product references.</p>
              <button 
                onClick={startBatchProcessing}
                className="px-8 py-3 bg-purple-600 text-white font-bold rounded-full hover:bg-purple-500 transition-all shadow-xl shadow-purple-500/20"
              >
                Start Batch Process
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {processedImages.map((item) => (
                <ProcessingItemComponent 
                  key={item.id} 
                  item={item} 
                  cancelItem={cancelItem} 
                  regenerateItem={regenerateItem} 
                  downloadImage={downloadImage} 
                />
              ))}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 p-12 mt-12 text-center">
        <p className="text-gray-600 text-sm font-mono uppercase tracking-[0.2em]">
          Powered by Gemini Pro Image
        </p>
      </footer>

      {/* History Sidebar */}
      <AnimatePresence>
        {isHistoryOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#121212] border-l border-white/10 z-[101] shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HistoryIcon className="w-5 h-5 text-purple-400" />
                  <h2 className="text-lg font-bold">Batch History</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={clearHistory}
                    className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                    title="Clear History"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setIsHistoryOpen(false)}
                    className="p-2 text-gray-500 hover:text-white transition-colors"
                  >
                    <XCircleIcon className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {history.length === 0 ? (
                  <div className="text-center py-12">
                    <HistoryIcon className="w-12 h-12 text-gray-800 mx-auto mb-4" />
                    <p className="text-gray-500">No history yet. Process some creatives to see them here.</p>
                  </div>
                ) : (
                  history.map((batch) => (
                    <div key={batch.id} className="bg-white/5 rounded-xl border border-white/5 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-gray-400">
                            {new Date(batch.timestamp).toLocaleString()}
                          </span>
                          <span className={`text-[8px] uppercase px-1.5 py-0.5 rounded border border-white/10 ${batch.mode === 'product' ? 'text-purple-400' : 'text-blue-400'}`}>
                            {batch.mode === 'product' ? 'Swap' : 'Size'}
                          </span>
                        </div>
                        <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-bold">
                          {batch.images.filter(i => i.status === 'completed').length} results
                        </span>
                      </div>
                      <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
                        {batch.images.slice(0, 5).map((img, idx) => (
                          <div key={idx} className="w-12 h-12 bg-black rounded border border-white/10 flex-shrink-0 overflow-hidden">
                            {img.resultUrl ? (
                              <img src={img.resultUrl} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center opacity-50">
                                <SparklesIcon className="w-4 h-4" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => downloadAllAsZip(batch.images)}
                          className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          <DownloadIcon className="w-3 h-3" />
                          Download All
                        </button>
                        <button
                          onClick={() => setProcessedImages(batch.images)}
                          className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                          Restore View
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;

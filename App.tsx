
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { replaceProductInCreative, adaptCreativeDimensions, classifyProductImage, classifyDesignImage } from './services/geminiService';
import { ProcessedImage, ClassifiedDesign, ClassifiedProduct, PrimaryAngle, DetailFeature, ImageTag, SmartMatch, CalloutMatch } from './types';
import { UploadIcon, SparklesIcon, DownloadIcon, XCircleIcon, CheckCircleIcon, AlertCircleIcon, LayersIcon, PackageIcon, HistoryIcon, TrashIcon } from './components/Icons';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { BeforeAfterSlider } from './components/BeforeAfterSlider';

interface BatchHistory {
  id: string;
  timestamp: number;
  mode: 'product' | 'size';
  images: ProcessedImage[];
}

const TAGS: ImageTag[] = [
  'front', 'back', 'three_quarter', 'side', 'top_down', 'bottom',
  'interior', 'zipper', 'strap', 'pattern', 'hardware', 'pocket', 'water_resistance', 'size_reference', 'lifestyle'
];

const TagPill: React.FC<{ 
  tag?: string; 
  isClassifying?: boolean;
  unverified?: boolean;
  isManual?: boolean;
  options: string[];
  onOverride: (tag: string) => void;
  className?: string;
}> = ({ tag, isClassifying, unverified, isManual, options, onOverride, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, [isOpen]);

  if (isClassifying) {
    return (
      <div className={`absolute top-1 left-1 bg-black/60 backdrop-blur-sm border border-white/20 text-white text-[9px] font-mono uppercase px-1.5 py-0.5 rounded flex items-center gap-1 ${className}`}>
        <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse"></span>
        Detecting...
      </div>
    );
  }

  if (!tag) return null;

  return (
    <div className={`absolute top-1 left-1 z-10 ${className}`} ref={containerRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`backdrop-blur-sm border text-[9px] font-mono uppercase px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
          isManual
            ? 'bg-black/60 border-amber-500/50 text-amber-300 hover:bg-amber-500/20'
            : unverified 
              ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/40' 
              : 'bg-black/60 border-white/20 text-white hover:bg-white/20'
        }`}
      >
        {isManual && <span className="text-amber-500 font-bold">•</span>}
        {tag.replace('_', ' ')}
        <span className="opacity-50">▾</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-32 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl overflow-hidden py-1 max-h-48 overflow-y-auto z-50">
          {options.map(t => (
            <button
              key={t}
              onClick={() => { onOverride(t); setIsOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-[10px] font-mono uppercase hover:bg-white/10 transition-colors ${tag === t ? 'text-purple-400 bg-purple-500/10' : 'text-gray-300'}`}
            >
              {t.replace('_', ' ')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const SlotPicker: React.FC<{
  products: ClassifiedProduct[];
  onSelect: (productId: string) => void;
  onClose: () => void;
}> = ({ products, onSelect, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, [onClose]);

  return (
    <div ref={containerRef} className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl p-2 z-50">
      <div className="text-xs font-semibold text-gray-400 mb-2 px-1">Select Product Image</div>
      <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto">
        {products.map(p => (
          <button 
            key={p.id}
            onClick={(e) => { e.stopPropagation(); onSelect(p.id); onClose(); }}
            className="aspect-square rounded overflow-hidden border border-white/10 hover:border-purple-500 hover:scale-105 transition-all"
          >
            <img src={p.url} className="w-full h-full object-cover" />
          </button>
        ))}
        {products.length === 0 && (
          <div className="col-span-4 text-xs text-gray-500 py-4 text-center">No products available</div>
        )}
      </div>
    </div>
  );
};

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

  // If we have a progress inside item, use it. Else use synthetic fakeProgress.
  const displayProgress = item.progress !== undefined ? item.progress : (item.status === 'completed' ? 100 : fakeProgress);

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
        <div className="absolute top-0 left-0 w-full h-[4px] bg-transparent z-50 overflow-hidden">
          <div 
            className="h-full bg-indigo-500 transition-all duration-300 ease-out" 
            style={{ width: `${displayProgress}%` }}
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
                  Processing {Math.round(displayProgress)}%
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
          <div className="w-full h-full relative group p-2">
            <BeforeAfterSlider beforeUrl={item.creativeUrl} afterUrl={item.resultUrl} />
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
        <div className="p-3 bg-black/20 border-t border-white/5 flex gap-2">
          <button
            onClick={() => regenerateItem(item.id)}
            className="flex-1 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <SparklesIcon className="w-4 h-4" />
            Regenerate
          </button>
          <button
            onClick={() => downloadImage(item.resultUrl!, `creative-${item.id}.png`)}
            className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/10 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
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
  const [creatives, setCreatives] = useState<ClassifiedDesign[]>([]);
  const [products, setProducts] = useState<ClassifiedProduct[]>([]);
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
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const abortControllers = useRef(new Map<string, AbortController>());

  // manualOverrides: designId -> { heroSourceId: string, calloutSourceIds: { [feature]: string } }
  const [manualOverrides, setManualOverrides] = useState<Record<string, { heroSourceId?: string, calloutSourceIds?: Record<string, string> }>>({});
  const [pickerState, setPickerState] = useState<{designId: string, featureOrHero: string} | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const processItem = async (item: ProcessedImage): Promise<ProcessedImage> => {
    const abortController = new AbortController();
    abortControllers.current.set(item.id, abortController);
    
    setProcessedImages(prev => prev.map(p => p.id === item.id ? { ...p, status: 'processing', error: undefined, progress: 0 } : p));

    try {
      let resultUrl: string;
      if (item.activeTab === 'product') {
        const calloutFiles = (item.calloutFiles || []).map(cf => ({ feature: cf.feature, file: cf.file }));
        resultUrl = await replaceProductInCreative(item.creativeFile, item.productFiles[0], calloutFiles, abortController.signal);
      } else {
        resultUrl = await adaptCreativeDimensions(item.creativeFile, item.targetRatio, item.targetDims, item.composition, item.textAlignment, abortController.signal);
      }
      
      const updated = { ...item, status: 'completed' as const, resultUrl };
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
    try {
      // Note: since we don't have a background queue, regenerate processes immediately in the background
      setProcessedImages(prev => prev.map(p => p.id === id ? { ...p, status: 'pending' } : p));
      
      // Slight delay to allow state update before processing
      setTimeout(async () => {
        try {
          let currentImages: ProcessedImage[] = [];
          setProcessedImages(prev => { currentImages = prev; return prev; });
          const itemToProcess = currentImages.find(i => i.id === id);
          if (itemToProcess) {
            await processItem(itemToProcess);
          }
        } catch (e) {
          console.error("Regeneration failed:", e);
        }
      }, 50);
    } catch (e) {
      console.error(e);
    }
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

  const handleCreativeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newCreatives = Array.from(files).map((file: File) => ({
        id: `design-${file.name}-${file.lastModified}-${Date.now()}`,
        file,
        url: URL.createObjectURL(file),
        isClassifying: true
      }));
      setCreatives(prev => [...prev, ...newCreatives]);

      await Promise.all(newCreatives.map(async (item) => {
        try {
          const { heroAngle, callouts } = await classifyDesignImage(item.file);
          setCreatives(prev => prev.map(c => c.id === item.id ? { ...c, isClassifying: false, heroAngle: heroAngle as PrimaryAngle, callouts } : c));
        } catch (e) {
          console.error("Design classification failed", e);
          setCreatives(prev => prev.map(c => c.id === item.id ? { ...c, isClassifying: false, heroAngle: 'front', callouts: [], unverified: true } : c));
        }
      }));
    }
  };

  const handleProductUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newProducts = Array.from(files).map((file: File) => ({
        id: `product-${file.name}-${file.lastModified}-${Date.now()}`,
        file,
        url: URL.createObjectURL(file),
        isClassifying: true
      }));
      setProducts(prev => [...prev, ...newProducts]);

      await Promise.all(newProducts.map(async (item) => {
        try {
          const tag = await classifyProductImage(item.file);
          setProducts(prev => prev.map(p => p.id === item.id ? { ...p, isClassifying: false, tag: tag as ImageTag } : p));
        } catch (e) {
          console.error("Product classification failed", e);
          setProducts(prev => prev.map(p => p.id === item.id ? { ...p, isClassifying: false, tag: 'three_quarter', unverified: true } : p));
        }
      }));
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

  const handleSlotDrop = (designId: string, featureOrHero: string, productId: string) => {
    setManualOverrides(prev => {
      const overrides = prev[designId] || {};
      if (featureOrHero === 'hero') {
        return { ...prev, [designId]: { ...overrides, heroSourceId: productId } };
      } else {
        return { 
          ...prev, 
          [designId]: { 
            ...overrides, 
            calloutSourceIds: { ...(overrides.calloutSourceIds || {}), [featureOrHero]: productId } 
          } 
        };
      }
    });
  };

  const resetRow = (designId: string) => {
    setManualOverrides(prev => {
      const next = { ...prev };
      delete next[designId];
      return next;
    });
  };

  const resetAllMatches = () => {
    setManualOverrides({});
  };

  const overrideTag = (id: string, type: 'creative' | 'product', tag: string) => {
    if (type === 'creative') {
      setCreatives(prev => prev.map(p => p.id === id ? { ...p, heroAngle: tag as PrimaryAngle, unverified: false, manualHeroAngle: true } : p));
    } else {
      setProducts(prev => prev.map(p => p.id === id ? { ...p, tag: tag as ImageTag, unverified: false, manualTag: true } : p));
    }
    showToast(`Classification updated — matches recomputed`);
  };

  const reclassifyCreative = async (id: string) => {
    const item = creatives.find(c => c.id === id);
    if (!item) return;

    setCreatives(prev => prev.map(c => c.id === id ? { ...c, isReclassifying: true } : c));
    try {
      const { heroAngle, callouts } = await classifyDesignImage(item.file);
      setCreatives(prev => prev.map(c => c.id === item.id ? { ...c, isReclassifying: false, heroAngle: heroAngle as PrimaryAngle, callouts, unverified: false } : c));
      showToast('Redetected callouts');
    } catch (e) {
      console.error("Design classification failed", e);
      setCreatives(prev => prev.map(c => c.id === item.id ? { ...c, isReclassifying: false, unverified: true } : c));
    }
  };

  const smartMatches = useMemo<SmartMatch[]>(() => {
    return creatives.map(design => {
      let heroSource = null;
      let heroMatchType: 'exact' | 'approximate' | 'missing' | 'custom' = 'missing';

      const override = manualOverrides[design.id];

      // Check overrides first
      if (override?.heroSourceId) {
        heroSource = products.find(p => p.id === override.heroSourceId) || null;
        if (heroSource) heroMatchType = 'custom';
      }

      if (!heroSource && products.length > 0) {
        let match = products.find(p => p.tag === design.heroAngle);
        if (match) {
          heroSource = match;
          heroMatchType = 'exact';
        } else {
          // Fallback logic
          const fallbacks: Record<string, string[]> = {
            'three_quarter': ['front', 'side', 'back'],
            'front': ['three_quarter', 'side'],
            'back': ['three_quarter', 'front'],
            'side': ['three_quarter', 'front'],
            'top_down': ['front', 'three_quarter'],
            'bottom': ['front', 'three_quarter']
          };
          const needed = design.heroAngle || 'front';
          for (const fallback of fallbacks[needed] || []) {
            let m = products.find(p => p.tag === fallback);
            if (m) {
              heroSource = m;
              heroMatchType = 'approximate';
              break;
            }
          }
          if (!heroSource) {
             heroSource = products[0]; // fallback to first image
             heroMatchType = 'approximate';
          }
        }
      }

      // Find callouts
      const calloutSources: CalloutMatch[] = (design.callouts || []).map((co, coIdx) => {
        const overrideKey = `callout_${coIdx}`;
        if (override?.calloutSourceIds?.[overrideKey]) {
          const source = products.find(p => p.id === override.calloutSourceIds![overrideKey]) || null;
          if (source) return { feature: co.feature as DetailFeature, label_visible: co.label_visible, source, matchType: 'custom' };
        }

        let matchType: 'exact' | 'reconstruction' | 'unknown' = 'reconstruction';
        if (co.feature === 'unknown') {
          matchType = 'unknown';
        }

        const source = products.find(p => p.tag === co.feature);
        if (source && co.feature !== 'unknown') {
          return { feature: co.feature as DetailFeature, label_visible: co.label_visible, source, matchType: 'exact' };
        }
        return { feature: co.feature as DetailFeature, label_visible: co.label_visible, source: null, matchType };
      });

      let overallMatchType: 'exact' | 'approximate' | 'mixed' | 'missing' | 'custom' = 'exact';

      const hasApproxCallout = calloutSources.some(c => c.matchType === 'reconstruction' || c.matchType === 'unknown');
      const hasExactCallout = calloutSources.some(c => c.matchType === 'exact');
      
      const allManuallyOrExactOverridden = (heroMatchType === 'exact' || heroMatchType === 'custom') && 
        calloutSources.every(c => c.matchType === 'exact' || c.matchType === 'custom');
      
      const hasCustom = heroMatchType === 'custom' || calloutSources.some(c => c.matchType === 'custom');

      if (heroMatchType === 'missing') {
        overallMatchType = 'missing';
      } else if (hasCustom && allManuallyOrExactOverridden) {
        overallMatchType = 'custom';
      } else if (heroMatchType === 'exact' && !hasApproxCallout && !hasCustom) {
        overallMatchType = 'exact';
      } else if (heroMatchType === 'approximate' && !hasExactCallout && !hasCustom) {
        overallMatchType = 'approximate';
      } else {
        overallMatchType = 'mixed';
      }

      return {
        design,
        heroSource,
        heroMatchType,
        calloutSources,
        overallMatchType
      };
    });
  }, [creatives, products, manualOverrides]);

  const processGroupConc = async (items: ProcessedImage[], concurrency: number) => {
    const results = [...items];
    let index = 0;

    const runWorker = async () => {
      while (index < results.length) {
        const i = index++;
        
        // Before starting this item, check if it was cancelled
        let currentStatus = 'pending';
        setProcessedImages(prev => {
          const currentItem = prev.find(p => p.id === results[i].id);
          if (currentItem) currentStatus = currentItem.status;
          return prev;
        });

        if (currentStatus === 'cancelled') {
          continue;
        }

        results[i] = await processItem(results[i]);
      }
    };

    const workers = [];
    for (let c = 0; c < Math.min(concurrency, items.length); c++) {
      workers.push(runWorker());
    }
    await Promise.all(workers);
    return results;
  };

  const startBatchProcessing = async () => {
    try {
      if (activeTab === 'product' && smartMatches.length === 0) return;
      if (activeTab === 'size' && creatives.length === 0) return;

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
      }
      
      setIsProcessing(true);
      setError(null);
      
      let initialProcessed: ProcessedImage[] = [];

      if (activeTab === 'product') {
        initialProcessed = smartMatches.map((match, idx) => {
          const heroFile = match.heroSource?.file || products[0]?.file;
          const heroUrl = match.heroSource?.url || products[0]?.url;
          
          const validCallouts = match.calloutSources.filter(c => (c.matchType === 'exact' || c.matchType === 'custom') && c.source?.file);
          const calloutFiles = validCallouts.map(c => ({
            feature: c.feature,
            file: c.source!.file,
            url: c.source!.url
          }));

          const allProductFiles = [heroFile, ...validCallouts.map(c => c.source!.file)].filter(Boolean) as File[];
          const allProductUrls = [heroUrl, ...validCallouts.map(c => c.source!.url)].filter(Boolean) as string[];

          return {
            id: `${Date.now()}-${idx}`,
            creativeFile: match.design.file,
            productFiles: allProductFiles,
            creativeUrl: match.design.url,
            productUrls: allProductUrls,
            calloutFiles: calloutFiles,
            status: 'pending',
            targetRatio: finalRatio,
            targetDims: dims,
            composition: composition,
            textAlignment: textAlignment,
            activeTab: activeTab,
            smartMatch: match
          };
        });
      } else {
        initialProcessed = creatives.map((creative, idx) => ({
          id: `${Date.now()}-${idx}`,
          creativeFile: creative.file,
          productFiles: [],
          creativeUrl: creative.url,
          productUrls: [],
          status: 'pending',
          targetRatio: finalRatio,
          targetDims: dims,
          composition: composition,
          textAlignment: textAlignment,
          activeTab: activeTab
        }));
      }
      
      setProcessedImages(initialProcessed);

      const results = await processGroupConc(initialProcessed, 3);
      
      setIsProcessing(false);
      
      setHistory(prev => [{
        id: `batch-${Date.now()}`,
        timestamp: Date.now(),
        mode: activeTab,
        images: results
      }, ...prev]);
    } catch (err: any) {
      console.error("Batch processing error:", err);
      setError(err.message || "An unexpected error occurred during setup.");
      setIsProcessing(false);
    }
  };

  const downloadAllAsZip = async (images: ProcessedImage[]) => {
    try {
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
    } catch (e) {
      console.error("Failed to generate zip", e);
    }
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
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-black/80 backdrop-blur-md border border-white/20 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-2"
          >
            <CheckCircleIcon className="w-4 h-4 text-green-400" />
            <span className="text-sm font-medium">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

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
             {(activeTab === 'product' ? smartMatches.length > 0 : creatives.length > 0) && (
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
                    <>Process {activeTab === 'product' ? smartMatches.length : creatives.length} {activeTab === 'product' ? 'Replacements' : 'Adaptations'}</>
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
                {activeTab === 'product' ? '1. Parent Designs' : '1. Original Creatives'}
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
                  {isDraggingCreative ? 'Drop to Add Creatives' : 'Drop creative images here'}
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
                  <TagPill 
                    tag={c.heroAngle} 
                    isClassifying={c.isClassifying || c.isReclassifying} 
                    unverified={c.unverified}
                    isManual={c.manualHeroAngle}
                    options={TAGS.filter(t => ['front', 'back', 'three_quarter', 'side', 'top_down', 'bottom'].includes(t))}
                    onOverride={(tag) => overrideTag(c.id, 'creative', tag)}
                  />
                  <img src={c.url} className={`w-full h-full object-cover ${(c.isClassifying || c.isReclassifying) ? 'opacity-50 blur-sm' : ''}`} />
                  <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <button 
                      onClick={() => removeCreative(i)}
                      className="p-1 bg-black/50 hover:bg-black/80 rounded-full"
                      title="Remove design"
                    >
                      <XCircleIcon className="w-4 h-4 text-red-400" />
                    </button>
                    {!c.isClassifying && !c.isReclassifying && (
                      <button 
                        onClick={() => reclassifyCreative(c.id)}
                        className="p-1 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center"
                        title="Re-detect callouts"
                      >
                        <HistoryIcon className="w-4 h-4 text-purple-400" />
                      </button>
                    )}
                  </div>
                  {c.callouts !== undefined && !c.isClassifying && !c.isReclassifying && (
                    <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] rounded px-1 z-20 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                      {c.callouts.length} callouts
                    </div>
                  )}
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
                  <div 
                    key={i} 
                    className="relative aspect-square rounded-lg overflow-hidden border border-white/10 group pt-[1px] cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', p.id);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <TagPill 
                      tag={p.tag} 
                      isClassifying={p.isClassifying} 
                      unverified={p.unverified}
                      isManual={p.manualTag}
                      options={TAGS}
                      onOverride={(tag) => overrideTag(p.id, 'product', tag)}
                    />
                    <img src={p.url} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => removeProduct(i)}
                      className="absolute top-1 right-1 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20"
                    >
                      <XCircleIcon className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Smart Matches Table */}
        {activeTab === 'product' && (creatives.length > 0 || products.length > 0) && (
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h2 className="text-lg font-semibold">Smart Matches</h2>
              {Object.keys(manualOverrides).length > 0 && (
                <button 
                  onClick={resetAllMatches}
                  className="text-xs text-amber-400 hover:text-amber-300 transition-colors uppercase font-bold tracking-wider flex items-center gap-1"
                >
                  <XCircleIcon className="w-3 h-3" />
                  Reset All Overrides
                </button>
              )}
            </div>
            
            <div className="flex flex-col gap-2">
              {smartMatches.map((match, idx) => (
                <div key={idx} className="flex flex-col bg-white/5 border border-white/10 rounded-xl overflow-hidden p-3 gap-3 relative group/row">
                  {manualOverrides[match.design.id] && (
                    <button 
                      onClick={() => resetRow(match.design.id)}
                      className="absolute top-2 right-2 p-1 bg-black/40 hover:bg-black/60 rounded text-gray-400 hover:text-amber-400 transition-colors opacity-0 group-hover/row:opacity-100"
                      title="Reset manual overrides for this row"
                    >
                      <XCircleIcon className="w-4 h-4" />
                    </button>
                  )}
                  <div className="flex items-center gap-4">
                    {/* Design side */}
                    <div className="flex items-center gap-3 w-[250px] shrink-0">
                      <div className="w-12 h-12 rounded overflow-hidden relative shrink-0">
                        <img src={match.design.url} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-white truncate max-w-[150px]" title={match.design.file.name}>{match.design.file.name}</span>
                        <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                          Hero: <span className="uppercase text-purple-400">{match.design.heroAngle || 'unknown'}</span>
                        </span>
                      </div>
                    </div>
                    
                    <div className="text-gray-500 font-mono shrink-0 px-2 text-xl">→</div>

                    {/* Matched Products side */}
                    <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-hide flex-1">
                      {/* Hero Image Match */}
                      <div 
                        className="flex flex-col items-center gap-1 w-12 shrink-0 group/slot rounded transition-colors border border-transparent outline-none focus-visible:ring-2 focus-visible:ring-purple-500 relative cursor-pointer"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPickerState({ designId: match.design.id, featureOrHero: 'hero' });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            setPickerState({ designId: match.design.id, featureOrHero: 'hero' });
                          }
                        }}
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-white/10', 'border-white/30'); }}
                        onDragLeave={(e) => { e.currentTarget.classList.remove('bg-white/10', 'border-white/30'); }}
                        onDrop={(e) => {
                            e.preventDefault();
                            e.currentTarget.classList.remove('bg-white/10', 'border-white/30');
                            const productId = e.dataTransfer.getData('text/plain');
                            if (productId) handleSlotDrop(match.design.id, 'hero', productId);
                        }}
                      >
                        {pickerState?.designId === match.design.id && pickerState?.featureOrHero === 'hero' && (
                          <SlotPicker 
                            products={products} 
                            onSelect={(id) => handleSlotDrop(match.design.id, 'hero', id)} 
                            onClose={() => setPickerState(null)} 
                          />
                        )}
                        {match.heroSource ? (
                          <div className={`w-12 h-12 rounded overflow-hidden border relative ${match.heroMatchType === 'custom' ? 'border-amber-500/80 shadow-[0_0_8px_rgba(245,158,11,0.2)]' : match.heroMatchType === 'exact' ? 'border-green-500/50' : 'border-yellow-500/50'}`}>
                            <img src={match.heroSource.url} className="w-full h-full object-cover" />
                            {match.heroMatchType === 'custom' && <div className="absolute top-0 right-0 bg-amber-500/90 backdrop-blur-sm text-black text-[7px] font-bold px-1 rounded-bl">M</div>}
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded border border-dashed border-red-500/30 flex items-center justify-center bg-red-500/5 pointer-events-none">
                            <span className="text-[8px] text-red-400 uppercase">Missing</span>
                          </div>
                        )}
                        <span className="text-[8px] text-gray-400 uppercase w-full text-center truncate">Hero</span>
                      </div>

                      {/* Callout matches */}
                      {match.calloutSources.map((co, coIdx) => {
                        const calloutKey = `callout_${coIdx}`;
                        return (
                        <div 
                          key={coIdx} 
                          className="flex flex-col items-center gap-1 w-12 shrink-0 group/slot rounded transition-colors border border-transparent outline-none focus-visible:ring-2 focus-visible:ring-purple-500 relative cursor-pointer"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPickerState({ designId: match.design.id, featureOrHero: calloutKey });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              setPickerState({ designId: match.design.id, featureOrHero: calloutKey });
                            }
                          }}
                          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-white/10', 'border-white/30'); }}
                          onDragLeave={(e) => { e.currentTarget.classList.remove('bg-white/10', 'border-white/30'); }}
                          onDrop={(e) => {
                              e.preventDefault();
                              e.currentTarget.classList.remove('bg-white/10', 'border-white/30');
                              const productId = e.dataTransfer.getData('text/plain');
                              if (productId) handleSlotDrop(match.design.id, calloutKey, productId);
                          }}
                        >
                          {pickerState?.designId === match.design.id && pickerState?.featureOrHero === calloutKey && (
                            <SlotPicker 
                              products={products} 
                              onSelect={(id) => handleSlotDrop(match.design.id, calloutKey, id)} 
                              onClose={() => setPickerState(null)} 
                            />
                          )}
                          {co.source ? (
                            <div className={`w-12 h-12 rounded overflow-hidden border relative ${co.matchType === 'custom' ? 'border-amber-500/80 shadow-[0_0_8px_rgba(245,158,11,0.2)]' : 'border-green-500/50'}`}>
                              <img src={co.source.url} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                <span className="text-[8px] text-white uppercase text-center break-words">{co.feature.replace('_',' ')}</span>
                              </div>
                              {co.matchType === 'custom' && <div className="absolute top-0 right-0 bg-amber-500/90 backdrop-blur-sm text-black text-[7px] font-bold px-1 rounded-bl z-10">M</div>}
                            </div>
                          ) : (
                            <div className={`w-12 h-12 rounded border border-dashed ${co.matchType === 'unknown' ? 'border-red-500/50 bg-red-500/10' : 'border-yellow-500/50 bg-yellow-500/10'} flex flex-col items-center justify-center p-1 pointer-events-none`} title={co.feature}>
                              {co.matchType === 'unknown' ? (
                                <>
                                  <AlertCircleIcon className="w-3 h-3 text-red-400 mb-1" />
                                  <span className="text-[7px] text-red-400 uppercase text-center leading-tight">Need<br/>Tag</span>
                                </>
                              ) : (
                                <>
                                  <SparklesIcon className="w-3 h-3 text-yellow-400 mb-1" />
                                  <span className="text-[7px] text-yellow-400 uppercase text-center leading-tight">AI<br/>Gen</span>
                                </>
                              )}
                            </div>
                          )}
                          <div className="flex flex-col items-center w-full min-w-0" title={co.label_visible ? `${co.label_visible} (${co.feature})` : co.feature}>
                            {co.label_visible && <span className="text-[8px] text-gray-300 font-medium w-full text-center truncate">{co.label_visible}</span>}
                            <span className="text-[7px] text-gray-500 uppercase w-full text-center truncate">{co.feature.replace('_',' ')}</span>
                          </div>
                        </div>
                        );
                      })}
                    </div>

                    {/* Overall Status Badge */}
                    <div className="shrink-0 flex pr-6">
                       {match.overallMatchType === 'custom' && <span className="text-[10px] uppercase font-bold text-amber-400 border border-amber-500/30 bg-amber-500/10 px-2 py-1 rounded">Custom</span>}
                       {match.overallMatchType === 'exact' && <span className="text-[10px] uppercase font-bold text-green-400 border border-green-500/30 bg-green-500/10 px-2 py-1 rounded">Exact</span>}
                       {match.overallMatchType === 'approximate' && <span className="text-[10px] uppercase font-bold text-yellow-400 border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 rounded flex items-center gap-1"><AlertCircleIcon className="w-3 h-3"/> Approximate</span>}
                       {match.overallMatchType === 'mixed' && <span className="text-[10px] uppercase font-bold text-yellow-400 border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 rounded flex items-center gap-1"><AlertCircleIcon className="w-3 h-3"/> Mixed</span>}
                       {match.overallMatchType === 'missing' && <span className="text-[10px] uppercase font-bold text-red-400 border border-red-500/30 bg-red-500/10 px-2 py-1 rounded flex items-center gap-1"><XCircleIcon className="w-3 h-3"/> Missing</span>}
                    </div>
                  </div>
                </div>
              ))}
              {smartMatches.length === 0 && (
                <div className="text-sm text-gray-500 italic p-4 text-center border border-dashed border-white/10 rounded-xl">Upload both designs and products to compute matches.</div>
              )}
            </div>

            {smartMatches.length > 0 && (
              <div className="flex items-center justify-center mt-2">
                <div className="text-xs text-gray-400 flex items-center gap-2">
                  <span className="font-bold text-white">{smartMatches.length} designs</span>
                  <span>·</span>
                  <span className="text-green-400">{smartMatches.filter(m => m.overallMatchType === 'exact').length} exact</span>
                  <span>·</span>
                  <span className="text-yellow-400">{smartMatches.filter(m => m.overallMatchType === 'approximate').length} approx</span>
                  <span>·</span>
                  <span className="text-yellow-400">{smartMatches.filter(m => m.overallMatchType === 'mixed').length} mixed</span>
                </div>
              </div>
            )}
          </section>
        )}

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

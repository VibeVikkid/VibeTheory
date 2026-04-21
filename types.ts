
export interface DimensionPreset {
  name: string;
  width: number;
  height: number;
}

export interface ProcessedImage {
  id: string;
  creativeFile: File;
  productFiles: File[];
  creativeUrl: string;
  productUrls: string[];
  resultUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
  error?: string;
  progress?: number;
  targetRatio: any;
  targetDims: any;
  composition?: any;
  textAlignment?: any;
  activeTab: 'product' | 'size';
}

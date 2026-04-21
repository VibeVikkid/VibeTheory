
export interface DimensionPreset {
  name: string;
  width: number;
  height: number;
}

export type PrimaryAngle = 'front' | 'back' | 'three_quarter' | 'side' | 'top_down' | 'bottom';
export type DetailFeature = 'interior' | 'zipper' | 'strap' | 'pattern' | 'hardware' | 'pocket' | 'water_resistance' | 'size_reference' | 'lifestyle';
export type ImageTag = PrimaryAngle | DetailFeature;

export interface ClassifiedProduct {
  id: string;
  file: File;
  url: string;
  tag?: ImageTag;
  isClassifying?: boolean;
  unverified?: boolean;
  manualTag?: boolean;
}

export interface CalloutDef {
  index: number;
  feature: DetailFeature | 'unknown';
  label_visible?: string;
}

export interface ClassifiedDesign {
  id: string;
  file: File;
  url: string;
  heroAngle?: PrimaryAngle;
  callouts?: CalloutDef[];
  isClassifying?: boolean;
  isReclassifying?: boolean;
  unverified?: boolean;
  manualHeroAngle?: boolean;
}

export interface CalloutMatch {
  feature: DetailFeature | 'unknown';
  label_visible?: string;
  source: ClassifiedProduct | null;
  matchType: 'exact' | 'reconstruction' | 'custom' | 'unknown';
}

export interface SmartMatch {
  design: ClassifiedDesign;
  heroSource: ClassifiedProduct | null;
  heroMatchType: 'exact' | 'approximate' | 'missing' | 'custom';
  calloutSources: CalloutMatch[];
  overallMatchType: 'exact' | 'approximate' | 'mixed' | 'missing' | 'custom';
}

export interface ProcessedImage {
  id: string;
  creativeFile: File;
  productFiles: File[];
  creativeUrl: string;
  productUrls: string[];
  calloutFiles?: { feature: string; file: File; url: string }[];
  resultUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
  error?: string;
  progress?: number;
  targetRatio: any;
  targetDims: any;
  composition?: any;
  textAlignment?: any;
  activeTab: 'product' | 'size';
  smartMatch?: SmartMatch;
}

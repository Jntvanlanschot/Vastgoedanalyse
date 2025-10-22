export interface SubjectProperty {
  valuationDate: string; // ISO date
  livingAreaM2: number;
  type: 'apartment' | 'house';
  subtype?: string; // e.g. ground-floor, top-floor, maisonette
  wijk?: string; // e.g. Amsterdam/Wijk Oud-West
  buurt?: string; // e.g. Helmersbuurt
  street?: string; // e.g. Jacob van Lennepkade
  lat?: number;
  lng?: number;
}

export interface ValuationRequest {
  csvUrl?: string;
  csvText?: string;
  subject: SubjectProperty;
}

export interface Comparable {
  id: string;
  address: {
    street: string;
    neighbourhood: string;
    wijk: string;
  };
  publishDate: string;
  price: number;
  floorAreaM2: number;
  ppm2Raw: number;
  ppm2Adj: number;
  score: number;
  subscores: {
    size: number;
    time: number;
    wijk: number;
    buurt: number;
    street: number;
    type: number;
    subtype: number;
    locppm2: number;
  };
}

export interface ValuationResult {
  value: number;
  low: number;
  high: number;
  currency: 'EUR';
  subject: SubjectProperty;
  model: {
    method: string;
    selectedCount: number;
    filters: {
      months: number;
      sizeBand: number;
      iqrOutliers: boolean;
    };
    timeIndex: {
      method: string;
      monthsCovered: number;
    };
  };
  comps: Comparable[];
  csvDownload: string;
}

export interface Row {
  [key: string]: string | number | null;
}

export interface ParsedRow {
  id: string;
  price: number;
  area: number;
  ppm2: number;
  date: Date;
  compType: 'apartment' | 'house';
  wijk: string;
  buurt: string;
  street: string;
  originalRow: Row;
}

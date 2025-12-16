'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface AnalysisResult {
  status: string;
  message: string;
  step1_result?: {
    status: string;
    message: string;
    top_5_streets?: Array<{
      street_name: string;
      name: string;
      city: string;
      properties_count: number;
      average_price: number;
    }>;
    total_funda_records: number;
  };
  step2_result?: {
    status: string;
    message: string;
    processed_records: number;
    files_processed: number;
  };
  step3_result?: {
    status: string;
    message: string;
    matched_records: number;
    top_15_count: number;
    top15_file: string;
  };
  step4_result?: {
    status: string;
    message: string;
    pdf_file: string;
    excel_file: string;
  };
  summary?: {
    total_funda_records: number;
    realworks_records: number;
    matched_records: number;
    top_15_matches: number;
    pdf_file?: string | null;
    excel_file?: string | null;
    html_file?: string | null;
    avg_price_per_m2?: number;
  };
  artifacts?: {
    pdf_buffer?: string;
    excel_buffer?: string;
    html_report?: string; // Can be URL or HTML string
  };
}

// Helper function to open HTML report (handles both URL and HTML string)
function openHtmlReport(htmlPath: string) {
  if (htmlPath.startsWith('http')) {
    // It's a URL, open directly
    window.open(htmlPath, '_blank');
  } else {
    // It's an HTML string, create blob URL and open
    const blob = new Blob([htmlPath], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Clean up the blob URL after a delay (browser will keep it while tab is open)
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}

export default function AnalysisResultsPage() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get analysis results from sessionStorage
    const analysisStr = sessionStorage.getItem('analysisResult');
    if (analysisStr) {
      try {
        const analysis = JSON.parse(analysisStr);
        setAnalysisResult(analysis);
        setIsLoading(false);
        
        // Store PDF URL in sessionStorage for the HTML report's download button
        const pdfUrl = analysis?.summary?.pdf_file;
        if (pdfUrl) {
          sessionStorage.setItem('pdfReportUrl', pdfUrl);
        }
        
        // Automatische HTML rapport openen in nieuwe tab
        const htmlPath = analysis?.summary?.html_file || analysis?.artifacts?.html_report;
        if (htmlPath) {
          // Small delay to ensure page is loaded, then open HTML in new tab
          setTimeout(() => {
            openHtmlReport(htmlPath);
          }, 1000);
        }
      } catch (e) {
        console.error('Failed to parse analysis data:', e);
        setIsLoading(false);
      }
    } else {
      // No analysis results found, show loading for a moment then redirect
      setTimeout(() => {
        setIsLoading(false);
        // Could redirect to home page or show error
      }, 1000);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Analyse wordt voltooid...</p>
        </div>
      </div>
    );
  }

  if (!analysisResult) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Geen analyse resultaten gevonden</h2>
          <p className="text-gray-600 mb-6">
            Er zijn geen analyse resultaten beschikbaar. Ga terug naar de vorige pagina en start de analyse opnieuw.
          </p>
          <Link
            href="/"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Nieuwe Analyse Starten
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Analyse Resultaten
          </h1>
          <p className="text-lg text-gray-600">
            Uw vastgoedanalyse is voltooid. Hieronder vindt u de resultaten.
          </p>
        </div>

        {/* Summary Card - Realworks Records */}
        <div className="mb-8">
          <div className="bg-white rounded-lg shadow p-6 max-w-md mx-auto">
            <div className="flex items-center justify-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Realworks Records</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {analysisResult?.step2_result?.processed_records || analysisResult?.summary?.realworks_records || 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex justify-center space-x-4">
          {(() => {
            const htmlPath = analysisResult?.summary?.html_file || analysisResult?.artifacts?.html_report;
            
            return (
              <>
                {htmlPath && (
                  <button
                    onClick={() => {
                      openHtmlReport(htmlPath);
                    }}
                    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Open HTML Rapport
                  </button>
                )}
                <Link
                  href="/"
                  className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Nieuwe Analyse
                </Link>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}


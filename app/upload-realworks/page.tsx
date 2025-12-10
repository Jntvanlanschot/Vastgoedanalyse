'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';

interface UploadedFile {
  file: File;
  id: string;
}

interface TopStreet {
  street_name: string;
  name: string;
  city: string;
  properties_count: number;
  average_price: number;
  is_reference?: boolean;
}

interface AnalysisData {
  top_5_streets?: TopStreet[];
  total_funda_records?: number;
}

export default function UploadRealworksPage() {
  const router = useRouter();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalSizeMb, setTotalSizeMb] = useState<number>(0);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Get street analysis data from sessionStorage (optional - may not exist if skipping scraper)
    const streetAnalysisStr = sessionStorage.getItem('streetAnalysisResult');
    if (streetAnalysisStr) {
      try {
        const streetAnalysis = JSON.parse(streetAnalysisStr);
        
        if (streetAnalysis.top_streets) {
          setAnalysisData({
            top_5_streets: streetAnalysis.top_streets,
            total_funda_records: streetAnalysis.total_funda_records
          });
        }
      } catch (e) {
        console.error('Failed to parse street analysis data:', e);
      }
    }
    // If no street analysis, that's OK - user can still upload Realworks files
  }, []);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    
    const newFiles: UploadedFile[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.toLowerCase().endsWith('.mhtml') || file.name.toLowerCase().endsWith('.mht')) {
        newFiles.push({
          file,
          id: `file-${Date.now()}-${i}`
        });
      }
    }
    
    setUploadedFiles(prev => {
      const updated = [...prev, ...newFiles];
      // Recompute total size
      const totalBytes = updated.reduce((sum, f) => sum + f.file.size, 0);
      setTotalSizeMb(totalBytes / 1024 / 1024);
      return updated.slice(0, 10); // Max 10 files
    });
    
    setError(null);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const handleSubmit = async () => {
    if (uploadedFiles.length === 0) {
      setError('Please upload at least one Realworks MHTML file');
      return;
    }

    // Soft guard: avoid accidentally pushing hundreds of MB in one go
    const softLimitMb = 250;
    if (totalSizeMb > softLimitMb) {
      setError(`Te groot totaal (${totalSizeMb.toFixed(2)} MB). Upload minder bestanden of splits batch.`);
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Load reference and CSV data
      const referenceDataStr = sessionStorage.getItem('referenceData');
      if (!referenceDataStr) {
        throw new Error('Reference data ontbreekt. Ga terug en start de Funda stap opnieuw.');
      }
      const referenceData = JSON.parse(referenceDataStr);

      const csvData =
        sessionStorage.getItem('csvData') || 'address_full,street_name\n';

      // Upload files directly to Vercel Blob using @vercel/blob/client (bypasses API body size limit)
      const uploadedBlobs = await Promise.all(
        uploadedFiles.map(async (uploadedFile) => {
          try {
            // Upload directly to Blob Storage using @vercel/blob/client
            // This bypasses the 6MB API limit by uploading directly from client
            const blob = await upload(uploadedFile.file.name, uploadedFile.file, {
              access: 'public',
              handleUploadUrl: '/api/upload-blob', // Our API route handles the upload token
            });

            return {
              url: blob.url,
              name: uploadedFile.file.name,
              size: uploadedFile.file.size,
              type: uploadedFile.file.type || 'application/octet-stream',
            };
          } catch (error) {
            // Re-throw with more context
            const errorMessage =
              error instanceof Error
                ? error.message
                : `Unknown error uploading ${uploadedFile.file.name}`;
            throw new Error(`Failed to upload ${uploadedFile.file.name}: ${errorMessage}`);
          }
        })
      );

      // Send small JSON payload to API (no big bodies)
      const response = await fetch('/api/upload-realworks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceData,
          csvData,
          blobs: uploadedBlobs,
        }),
      }).catch((err) => {
        console.error('Fetch error:', err);
        throw new Error(
          `Network error: ${err.message}. Please check if the server is running and try again.`
        );
      });

      if (!response.ok) {
        // try json, fall back to text
        let errorMessage = 'Upload failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          const text = await response.text();
          errorMessage = text?.slice(0, 300) || errorMessage;
        }
        throw new Error(errorMessage);
      }

      let result: any = {};
      try {
        result = await response.json();
      } catch (e) {
        const text = await response.text();
        throw new Error(
          text?.slice(0, 300) || 'Invalid JSON response from server'
        );
      }

      // Transform data to match analysis-results page expectations
      const transformedResult = {
        ...result,
        step1_result: {
          ...result.step1_result,
          top_5_streets: result.step2_result?.top_5_streets || [],
          total_funda_records: result.summary?.total_funda_records || 0,
        },
        step2_result: {
          ...result.step2_result,
          processed_records:
            result.step3_result?.processed_records ||
            result.summary?.realworks_records ||
            0,
        },
        step3_result: {
          ...result.step3_result,
          top_15_count:
            result.step4_result?.top_15_count ||
            result.summary?.top_15_matches ||
            0,
        },
      };

      // Store the transformed results in sessionStorage
      sessionStorage.setItem('analysisResult', JSON.stringify(transformedResult));
      console.log('Stored analysis result in sessionStorage:', transformedResult);

      // Redirect to results page or show success
      router.push('/analysis-results');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      console.error('Upload error details:', err);
      console.error('Error message:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearAllFiles = () => {
    setUploadedFiles([]);
    setTotalSizeMb(0);
  };

  return (
    <div className="min-h-screen bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-4">
            Upload Realworks Bestanden
          </h1>
          <p className="text-lg text-gray-300">
            Sleep en zet neer of klik om meerdere MHTML bestanden te selecteren
          </p>
        </div>

        {/* Top 5 Streets Display */}
        {analysisData?.top_5_streets ? (
          <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-white mb-4 text-center">
              Top 10 Straten uit Funda Analyse
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {analysisData.top_5_streets.map((street, index) => (
                <div key={index} className={`rounded-lg p-4 border ${street.is_reference ? 'bg-blue-900/20 border-blue-400' : 'bg-gray-700 border-gray-600'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${street.is_reference ? 'bg-blue-600' : 'bg-gray-600'}`}>
                        <span className={`text-sm font-medium ${street.is_reference ? 'text-blue-100' : 'text-gray-200'}`}>
                          {index + 1}
                        </span>
                      </div>
                      <div>
                        <h3 className={`font-medium ${street.is_reference ? 'text-blue-200' : 'text-white'}`}>
                          {street.street_name}
                          {street.is_reference && <span className="ml-2 text-xs bg-blue-600 text-blue-100 px-2 py-1 rounded">Referentie</span>}
                        </h3>
                        <p className="text-sm text-gray-400">{street.city}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    <p className="text-sm text-gray-300">
                      <span className="font-medium">{street.properties_count}</span> woningen
                    </p>
                    <p className="text-sm text-gray-300">
                      Gemiddeld: <span className="font-medium">€{street.average_price.toLocaleString()}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {analysisData.total_funda_records && (
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-400">
                  Gebaseerd op {analysisData.total_funda_records} Funda records
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-yellow-900/20 border border-yellow-400 rounded-lg p-6 mb-8">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-200">
                  Geen analyse resultaten gevonden
                </h3>
                <div className="mt-2 text-sm text-yellow-300">
                  <p>
                    Er zijn nog geen Funda analyse resultaten beschikbaar. Ga terug naar de vorige pagina 
                    en start eerst de Funda scraper om de top 10 straten te analyseren.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Drag and Drop Zone */}
        <div className="bg-gray-800 rounded-lg shadow-lg p-8 mb-8">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-500/10'
                : uploadedFiles.length > 0
                ? 'border-green-500 bg-green-500/10'
                : 'border-gray-600 bg-gray-700/50'
            }`}
          >
            <div className="mb-6">
              <div className="mx-auto w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-blue-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                {isDragging ? 'Laat hier vallen!' : uploadedFiles.length > 0 ? `${uploadedFiles.length} bestand(en) geüpload` : 'Sleep hier je MHTML bestanden'}
              </h3>
              <p className="text-gray-300">
                Sleep en zet neer of klik om te selecteren (MHTML)
              </p>
            </div>
            
            <div className="space-y-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Selecteer Bestanden
              </button>
              <p className="text-sm text-gray-400">
                Je kunt meerdere bestanden tegelijk selecteren (max. 10 bestanden)
              </p>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".mhtml,.mht"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
          </div>

          {/* Uploaded Files List */}
          {uploadedFiles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  Geüploade Bestanden ({uploadedFiles.length})
                </h3>
                <span className="text-sm text-gray-300">
                  Totaal: {totalSizeMb.toFixed(2)} MB
                </span>
                <button
                  onClick={clearAllFiles}
                  className="text-sm text-red-400 hover:text-red-300"
                >
                  Alles verwijderen
                </button>
              </div>
              
              {uploadedFiles.map((uploadedFile) => (
                <div key={uploadedFile.id} className="bg-gray-700 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {uploadedFile.file.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {(uploadedFile.file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(uploadedFile.id)}
                    className="flex-shrink-0 ml-4 text-red-400 hover:text-red-300"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mt-6 p-4 bg-red-900/20 border border-red-400 rounded-md">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Submit button */}
          <div className="flex justify-center mt-8">
            <button
              onClick={handleSubmit}
              disabled={uploadedFiles.length === 0 || isUploading}
              className={`px-8 py-3 rounded-lg font-medium ${
                uploadedFiles.length > 0 && !isUploading
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              } transition-colors`}
            >
              {isUploading ? 'Uploaden...' : 'Start Analyse'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

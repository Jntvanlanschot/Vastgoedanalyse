'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);

  useEffect(() => {
    // Get analysis data from sessionStorage
    const analysisStr = sessionStorage.getItem('analysisResult');
    if (analysisStr) {
      try {
        const analysis = JSON.parse(analysisStr);
        if (analysis.step1_result?.top_5_streets) {
          setAnalysisData({
            top_5_streets: analysis.step1_result.top_5_streets,
            total_funda_records: analysis.step1_result.total_funda_records
          });
        }
      } catch (e) {
        console.error('Failed to parse analysis data:', e);
      }
    }
  }, []);

  const handleFileUpload = useCallback((index: number, file: File) => {
    if (file) {
      const newFile: UploadedFile = {
        file,
        id: `file-${index}-${Date.now()}`
      };
      
      setUploadedFiles(prev => {
        const updated = [...prev];
        updated[index] = newFile;
        return updated;
      });
      
      setError(null);
    }
  }, []);

  const handleSubmit = async () => {
    if (uploadedFiles.length !== 5) {
      setError('Please upload exactly 5 Realworks RTF files');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      
      uploadedFiles.forEach((uploadedFile, index) => {
        formData.append(`realworks_file_${index + 1}`, uploadedFile.file);
      });

      // Get reference data from sessionStorage
      const referenceDataStr = sessionStorage.getItem('referenceData');
      if (referenceDataStr) {
        formData.append('referenceData', referenceDataStr);
      }

      const response = await fetch('/api/upload-realworks', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      
      // Redirect to results page or show success
      router.push('/analysis-results');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => {
      const updated = [...prev];
      updated[index] = undefined as any;
      return updated;
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Upload Realworks Bestanden
          </h1>
          <p className="text-lg text-gray-600">
            Upload hier je 5 Realworks RTF bestanden om de analyse te voltooien
          </p>
        </div>

        {/* Top 5 Streets Display */}
        {analysisData?.top_5_streets ? (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 text-center">
              Top 5 Straten uit Funda Analyse
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {analysisData.top_5_streets.map((street, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-4 border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                        <span className="text-sm font-medium text-blue-600">{index + 1}</span>
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{street.street_name}</h3>
                        <p className="text-sm text-gray-500">{street.city}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">{street.properties_count}</span> woningen
                    </p>
                    <p className="text-sm text-gray-600">
                      Gemiddeld: <span className="font-medium">€{street.average_price.toLocaleString()}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {analysisData.total_funda_records && (
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-500">
                  Gebaseerd op {analysisData.total_funda_records} Funda records
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Geen analyse resultaten gevonden
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>
                    Er zijn nog geen Funda analyse resultaten beschikbaar. Ga terug naar de vorige pagina 
                    en start eerst de Funda scraper om de top 5 straten te analyseren.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Large upload area */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <div className="text-center mb-6">
            <div className="mx-auto w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Upload hier je 5 Realworks RTF bestanden
            </h2>
            <p className="text-gray-600">
              Selecteer de RTF bestanden die je wilt uploaden voor de analyse
            </p>
          </div>

          {/* File upload slots */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                {uploadedFiles[index] ? (
                  <div className="space-y-2">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {uploadedFiles[index].file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(uploadedFiles[index].file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Verwijder
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-500">RTF Bestand {index + 1}</p>
                    <input
                      type="file"
                      accept=".rtf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(index, file);
                      }}
                      className="hidden"
                      id={`file-${index}`}
                    />
                    <label
                      htmlFor={`file-${index}`}
                      className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer"
                    >
                      Upload bestand
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Submit button */}
          <div className="flex justify-center">
            <button
              onClick={handleSubmit}
              disabled={uploadedFiles.length !== 5 || isUploading}
              className={`px-8 py-3 rounded-lg font-medium ${
                uploadedFiles.length === 5 && !isUploading
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              } transition-colors`}
            >
              {isUploading ? 'Uploaden...' : 'Start Analyse'}
            </button>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Status</h3>
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="flex items-center space-x-3">
                <div className={`w-4 h-4 rounded-full ${
                  uploadedFiles[index] ? 'bg-green-500' : 'bg-gray-300'
                }`} />
                <span className="text-sm text-gray-700">
                  RTF Bestand {index + 1}: {uploadedFiles[index] ? 'Geüpload' : 'Nog niet geüpload'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

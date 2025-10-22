'use client';

import { useState } from 'react';

interface RunAnalysisButtonProps {
  fundaConfig: any;
  disabled?: boolean;
}

interface AnalysisResult {
  success: boolean;
  runId: string;
  datasetId: string;
  totalProperties: number;
  recentSales: number;
  averagePrice: number;
  averageTaxatieValue: number;
  csvData: string;
  analysis: Array<{
    url: string;
    address: string;
    price: number;
    saleDate: string;
    taxatieValue?: number;
  }>;
}

export default function RunAnalysisButton({ fundaConfig, disabled = false }: RunAnalysisButtonProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunAnalysis = async () => {
    if (!fundaConfig) {
      setError('No Funda configuration available');
      return;
    }

    setIsRunning(true);
    setProgress('Starting scrape...');
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/run-scraper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fundaConfig),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to run analysis');
      }

      const data = await response.json();
      setResult(data);
      setProgress('Analysis complete!');
    } catch (err) {
      console.error('Error running analysis:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setProgress('');
    } finally {
      setIsRunning(false);
    }
  };

  const downloadCSV = () => {
    if (!result?.csvData) return;

    const blob = new Blob([result.csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `funda-analysis-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mt-6">
      <button
        onClick={handleRunAnalysis}
        disabled={disabled || isRunning || !fundaConfig}
        className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
          disabled || isRunning || !fundaConfig
            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
            : 'bg-green-600 hover:bg-green-700 text-white'
        }`}
      >
        {isRunning ? '🔄 Running Analysis...' : '🚀 Run Analysis'}
      </button>

      {progress && (
        <div className="mt-4 p-4 bg-blue-900 border border-blue-700 rounded-lg">
          <p className="text-blue-200 text-sm">{progress}</p>
          {isRunning && (
            <div className="mt-2 w-full bg-blue-800 rounded-full h-2">
              <div className="bg-blue-400 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-900 border border-red-700 rounded-lg">
          <p className="text-red-200 text-sm">❌ {error}</p>
        </div>
      )}

      {result && (
        <div className="mt-6 p-6 bg-gray-800 border border-gray-700 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white">Analysis Results</h3>
            <button
              onClick={downloadCSV}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200"
            >
              📥 Download CSV
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-700 p-3 rounded-lg">
              <p className="text-gray-400 text-sm">Total Properties</p>
              <p className="text-white text-xl font-semibold">{result.totalProperties}</p>
            </div>
            <div className="bg-gray-700 p-3 rounded-lg">
              <p className="text-gray-400 text-sm">Recent Sales (12m)</p>
              <p className="text-white text-xl font-semibold">{result.recentSales}</p>
            </div>
            <div className="bg-gray-700 p-3 rounded-lg">
              <p className="text-gray-400 text-sm">Avg Price</p>
              <p className="text-white text-xl font-semibold">€{result.averagePrice.toLocaleString()}</p>
            </div>
            <div className="bg-gray-700 p-3 rounded-lg">
              <p className="text-gray-400 text-sm">Avg Taxatie</p>
              <p className="text-white text-xl font-semibold">
                {result.averageTaxatieValue > 0 ? `€${result.averageTaxatieValue.toLocaleString()}` : 'N/A'}
              </p>
            </div>
          </div>

          {result.analysis.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-white mb-3">Recent Sales</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-600">
                      <th className="text-left text-gray-300 py-2">Address</th>
                      <th className="text-left text-gray-300 py-2">Price</th>
                      <th className="text-left text-gray-300 py-2">Taxatie</th>
                      <th className="text-left text-gray-300 py-2">Sale Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.analysis.slice(0, 10).map((property, index) => (
                      <tr key={index} className="border-b border-gray-700">
                        <td className="text-gray-200 py-2 max-w-xs truncate">{property.address}</td>
                        <td className="text-green-400 py-2">€{property.price.toLocaleString()}</td>
                        <td className="text-blue-400 py-2">
                          {property.taxatieValue ? `€${property.taxatieValue.toLocaleString()}` : 'N/A'}
                        </td>
                        <td className="text-gray-300 py-2">{property.saleDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.analysis.length > 10 && (
                <p className="text-gray-400 text-sm mt-2">
                  Showing first 10 of {result.analysis.length} recent sales. Download CSV for full data.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 p-3 bg-gray-700 rounded-lg">
            <p className="text-gray-300 text-sm">
              <strong>Run ID:</strong> {result.runId} | <strong>Dataset ID:</strong> {result.datasetId}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

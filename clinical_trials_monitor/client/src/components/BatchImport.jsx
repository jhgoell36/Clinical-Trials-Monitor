import { useState } from 'react'
import { authFetch } from '../api'

export default function BatchImport({ onImportComplete }) {
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [results, setResults] = useState(null)

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!input.trim()) return

        // Parse input: split by newlines, commas, spaces, and filter empty
        const nctIds = input
            .split(/[\n,\s]+/)
            .map(id => id.trim())
            .filter(id => id.length > 0)

        if (nctIds.length === 0) return

        setLoading(true)
        setResults(null)

        try {
            const response = await authFetch('/trials/batch', {
                method: 'POST',
                body: JSON.stringify({ nctIds }),
            })

            const data = await response.json()
            setResults(data.results)
            if (onImportComplete) onImportComplete()
            setInput('')
        } catch (error) {
            console.error('Batch import failed:', error)
            setResults([{ status: 'error', message: 'Network or server error' }])
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="bg-white shadow sm:rounded-lg mb-6">
            <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Batch Import Trials</h3>
                <div className="mt-2 max-w-xl text-sm text-gray-500">
                    <p>Enter multiple NCT IDs separated by commas or newlines.</p>
                </div>
                <form className="mt-5" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="batch-input" className="sr-only">
                            NCT IDs
                        </label>
                        <textarea
                            id="batch-input"
                            rows={4}
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                            placeholder="NCT04316375, NCT00000102..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                        />
                    </div>
                    <div className="mt-3">
                        <button
                            type="submit"
                            disabled={loading}
                            className="inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm disabled:opacity-50"
                        >
                            {loading ? 'Importing...' : 'Import Trials'}
                        </button>
                    </div>
                </form>

                {results && (
                    <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-900">Import Results</h4>
                        <ul className="mt-2 divide-y divide-gray-200 max-h-40 overflow-y-auto text-sm">
                            {results.map((res, idx) => (
                                <li key={idx} className="py-2 flex justify-between">
                                    <span className="font-mono text-gray-600">{res.nctId || 'Error'}</span>
                                    <span className={`
                    ${res.status === 'success' ? 'text-green-600' : ''}
                    ${res.status === 'skipped' ? 'text-yellow-600' : ''}
                    ${res.status === 'error' ? 'text-red-600' : ''}
                  `}>
                                        {res.status === 'success' && 'Added'}
                                        {res.status === 'skipped' && 'Skipped'}
                                        {res.status === 'error' && (res.message || 'Failed')}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    )
}

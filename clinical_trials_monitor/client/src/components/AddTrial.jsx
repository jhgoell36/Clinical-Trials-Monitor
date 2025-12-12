import { useState } from 'react'
import { authFetch } from '../api'

export default function AddTrial({ onAdd }) {
    const [nctId, setNctId] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!nctId) return

        setLoading(true)
        setError('')
        try {
            const response = await authFetch('/trials', {
                method: 'POST',
                body: JSON.stringify({ nctId }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to add trial')
            }

            const newTrial = await response.json()
            onAdd(newTrial)
            setNctId('')
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="bg-white shadow sm:rounded-lg mb-6">
            <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Add New Trial</h3>
                <div className="mt-2 max-w-xl text-sm text-gray-500">
                    <p>Enter the NCT ID (e.g., NCT04316375) to start monitoring.</p>
                </div>
                <form className="mt-5 sm:flex sm:items-center" onSubmit={handleSubmit}>
                    <div className="w-full sm:max-w-xs">
                        <label htmlFor="nctId" className="sr-only">
                            NCT ID
                        </label>
                        <input
                            type="text"
                            name="nctId"
                            id="nctId"
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                            placeholder="NCT00000000"
                            value={nctId}
                            onChange={(e) => setNctId(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-3 w-full inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                    >
                        {loading ? 'Adding...' : 'Monitor Trial'}
                    </button>
                </form>
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </div>
        </div>
    )
}

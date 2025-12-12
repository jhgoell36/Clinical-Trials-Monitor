import { useState, useEffect } from 'react'
import { authFetch } from '../api'

export default function SponsorList() {
    const [sponsors, setSponsors] = useState([])
    const [newSponsor, setNewSponsor] = useState('')
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)
    const [suggestions, setSuggestions] = useState([])

    useEffect(() => {
        fetchSponsors()
    }, [])

    useEffect(() => {
        const timer = setTimeout(() => {
            if (newSponsor.length >= 3) {
                fetchSuggestions(newSponsor)
            } else {
                setSuggestions([])
            }
        }, 500)
        return () => clearTimeout(timer)
    }, [newSponsor])

    const fetchSponsors = async () => {
        try {
            const response = await authFetch('/sponsors')
            const data = await response.json()
            setSponsors(data)
        } catch (error) {
            console.error('Failed to fetch sponsors:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchSuggestions = async (query) => {
        try {
            const response = await authFetch(`/sponsors/search?q=${encodeURIComponent(query)}`)
            const data = await response.json()
            setSuggestions(data)
        } catch (error) {
            console.error('Failed to fetch suggestions:', error)
        }
    }

    const handleAdd = async (e) => {
        e.preventDefault()
        if (!newSponsor.trim()) return

        setAdding(true)
        try {
            const response = await authFetch('/sponsors', {
                method: 'POST',
                body: JSON.stringify({ name: newSponsor }),
            })

            if (response.ok) {
                const data = await response.json()
                setSponsors(prev => [...prev, { name: data.name, lastChecked: new Date().toISOString() }])
                setNewSponsor('')
                setSuggestions([])
                alert(`Sponsor added! Found ${data.trialsFound || 0} new trials.`)
            }
        } catch (error) {
            console.error('Failed to add sponsor:', error)
        } finally {
            setAdding(false)
        }
    }

    const handleDelete = async (name) => {
        let cascade = false
        if (confirm(`Delete sponsor "${name}"?\n\nClick OK to delete ONLY the sponsor monitoring.\nClick Cancel to see more options.`)) {
            // User clicked OK - just delete sponsor
        } else {
            // User clicked Cancel - offer cascade
            if (confirm(`Do you want to delete "${name}" AND ALL their associated trials from your list?`)) {
                cascade = true
            } else {
                return // Cancelled everything
            }
        }

        try {
            await authFetch(`/sponsors/${encodeURIComponent(name)}?cascade=${cascade}`, {
                method: 'DELETE',
            })
            setSponsors(sponsors.filter((s) => s.name !== name))
        } catch (error) {
            console.error('Failed to delete sponsor:', error)
        }
    }

    return (
        <div className="space-y-6">
            <div className="bg-white shadow sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Add Sponsor</h3>
                    <div className="mt-2 max-w-xl text-sm text-gray-500">
                        <p>Enter a sponsor name (e.g., "Pfizer") to automatically monitor all their trials.</p>
                    </div>
                    <form className="mt-5 relative" onSubmit={handleAdd}>
                        <div className="w-full sm:max-w-xs relative">
                            <label htmlFor="sponsor" className="sr-only">
                                Sponsor Name
                            </label>
                            <input
                                type="text"
                                name="sponsor"
                                id="sponsor"
                                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                                placeholder="Sponsor Name"
                                value={newSponsor}
                                onChange={(e) => setNewSponsor(e.target.value)}
                                autoComplete="off"
                            />
                            {suggestions.length > 0 && (
                                <ul className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                                    {suggestions.map((suggestion, idx) => (
                                        <li
                                            key={idx}
                                            className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-indigo-600 hover:text-white text-gray-900"
                                            onClick={() => {
                                                setNewSponsor(suggestion)
                                                setSuggestions([])
                                            }}
                                        >
                                            <span className="block truncate">{suggestion}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <button
                            type="submit"
                            disabled={adding}
                            className="mt-3 w-full inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                        >
                            {adding ? 'Adding...' : 'Monitor Sponsor'}
                        </button>
                    </form>
                </div>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <div className="px-4 py-5 sm:px-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Monitored Sponsors</h3>
                </div>
                <ul className="divide-y divide-gray-200">
                    {loading ? (
                        <li className="px-4 py-4 text-center text-gray-500">Loading...</li>
                    ) : sponsors.length === 0 ? (
                        <li className="px-4 py-8 text-center text-gray-500">No sponsors monitored yet.</li>
                    ) : (
                        sponsors.map((sponsor) => (
                            <li key={sponsor.name}>
                                <div className="px-4 py-4 sm:px-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-indigo-600 truncate">{sponsor.name}</p>
                                            <p className="text-xs text-gray-500">Last Checked: {sponsor.lastChecked || 'Never'}</p>
                                        </div>
                                        <div className="ml-4 flex-shrink-0">
                                            <button
                                                onClick={() => handleDelete(sponsor.name)}
                                                className="text-xs text-red-600 hover:text-red-900"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </li>
                        ))
                    )}
                </ul>
            </div>
        </div>
    )
}

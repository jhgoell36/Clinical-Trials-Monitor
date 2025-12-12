import { useState, useEffect } from 'react'
import AddTrial from './AddTrial'
import BatchImport from './BatchImport'
import { authFetch } from '../api'

export default function TrialList() {
    const [trials, setTrials] = useState([])
    const [loading, setLoading] = useState(true)
    const [showBatch, setShowBatch] = useState(false)
    const [selectedTrials, setSelectedTrials] = useState(new Set())
    const [sortConfig, setSortConfig] = useState({ key: 'lastUpdated', direction: 'desc' })

    const [filterActive, setFilterActive] = useState(false)

    useEffect(() => {
        fetchTrials()
    }, [])

    const fetchTrials = async () => {
        try {
            const response = await authFetch('/trials')
            const data = await response.json()
            setTrials(data)
            setSelectedTrials(new Set()) // Reset selection on refresh
        } catch (error) {
            console.error('Failed to fetch trials:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleAdd = (newTrial) => {
        setTrials(prev => [...prev, newTrial])
    }

    const handleBatchComplete = () => {
        fetchTrials()
    }

    const handleDelete = async (nctId) => {
        if (!confirm('Are you sure you want to stop monitoring this trial?')) return

        try {
            await authFetch(`/trials/${nctId}`, {
                method: 'DELETE',
            })
            setTrials(trials.filter((t) => t.nctId !== nctId))
            const newSelected = new Set(selectedTrials)
            newSelected.delete(nctId)
            setSelectedTrials(newSelected)
        } catch (error) {
            console.error('Failed to delete trial:', error)
            alert('Failed to delete trial. Check console/network.')
        }
    }

    const toggleSelectAll = () => {
        if (selectedTrials.size === trials.length && trials.length > 0) {
            setSelectedTrials(new Set())
        } else {
            setSelectedTrials(new Set(trials.map(t => t.nctId)))
        }
    }

    const toggleSelect = (nctId) => {
        const newSelected = new Set(selectedTrials)
        if (newSelected.has(nctId)) {
            newSelected.delete(nctId)
        } else {
            newSelected.add(nctId)
        }
        setSelectedTrials(newSelected)
    }

    const handleBatchDelete = async () => {
        if (!confirm(`Delete ${selectedTrials.size} trials?`)) return

        const nctIds = Array.from(selectedTrials)
        console.log('Batch deleting trials:', nctIds)

        try {
            const response = await authFetch('/trials/batch', {
                method: 'DELETE',
                body: JSON.stringify({ nctIds }),
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            console.log('Batch delete successful')
            setSelectedTrials(new Set())
            fetchTrials()
        } catch (error) {
            console.error('Failed to batch delete:', error)
            alert('Failed to delete trials. See console for details.')
        }
    }

    const handleSort = (key) => {
        let direction = 'asc'
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc'
        }
        setSortConfig({ key, direction })
    }

    const filteredTrials = trials.filter(trial => {
        if (!filterActive) return true
        const status = (trial.status || '').toUpperCase()
        const activeStatuses = [
            'RECRUITING',
            'NOT_YET_RECRUITING',
            'ACTIVE_NOT_RECRUITING',
            'ENROLLING_BY_INVITATION',
            'AVAILABLE'
        ]
        // Also include if status is missing (to avoid hiding backfilling trials)? 
        // No, user wants to filter OUT non-active. If missing, we don't know.
        // But for now, let's assume missing = keep? No, missing = unknown.
        // Let's keep missing ones so they don't disappear while backfilling.
        if (!status) return true
        return activeStatuses.includes(status)
    })

    const sortedTrials = [...filteredTrials].sort((a, b) => {
        if (sortConfig.key === 'lastUpdated') {
            const dateA = new Date(a.lastUpdated || 0)
            const dateB = new Date(b.lastUpdated || 0)
            return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA
        }
        if (sortConfig.key === 'sponsor') {
            const sponsorA = (a.sponsor || '').toLowerCase()
            const sponsorB = (b.sponsor || '').toLowerCase()
            if (sponsorA < sponsorB) return sortConfig.direction === 'asc' ? -1 : 1
            if (sponsorA > sponsorB) return sortConfig.direction === 'asc' ? 1 : -1
            return 0
        }
        if (sortConfig.key === 'status') {
            const statusA = (a.status || '').toLowerCase()
            const statusB = (b.status || '').toLowerCase()
            if (statusA < statusB) return sortConfig.direction === 'asc' ? -1 : 1
            if (statusA > statusB) return sortConfig.direction === 'asc' ? 1 : -1
            return 0
        }
        if (sortConfig.key === 'lastChecked') {
            const dateA = new Date(a.lastChecked || 0)
            const dateB = new Date(b.lastChecked || 0)
            return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA
        }
        if (sortConfig.key === 'primaryCompletionDate') {
            const dateA = new Date(a.primaryCompletionDate || 0)
            const dateB = new Date(b.primaryCompletionDate || 0)
            return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA
        }
        return 0
    })

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center space-x-4">
                    {selectedTrials.size > 0 && (
                        <button
                            onClick={handleBatchDelete}
                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none"
                        >
                            Delete Selected ({selectedTrials.size})
                        </button>
                    )}
                    <div className="flex items-center">
                        <input
                            id="filterActive"
                            type="checkbox"
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            checked={filterActive}
                            onChange={(e) => setFilterActive(e.target.checked)}
                        />
                        <label htmlFor="filterActive" className="ml-2 block text-sm text-gray-900">
                            Show Active/Recruiting Only
                        </label>
                    </div>
                </div>
                <button
                    onClick={() => setShowBatch(!showBatch)}
                    className="text-sm text-indigo-600 hover:text-indigo-900"
                >
                    {showBatch ? 'Switch to Single Add' : 'Switch to Batch Import'}
                </button>
            </div>

            {showBatch ? (
                <BatchImport onImportComplete={handleBatchComplete} />
            ) : (
                <AddTrial onAdd={handleAdd} />
            )}

            <div className="bg-white shadow sm:rounded-md max-h-[80vh] overflow-y-auto">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                        checked={trials.length > 0 && selectedTrials.size === trials.length}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    NCT ID
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Title
                                </th>
                                <th
                                    scope="col"
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                    onClick={() => handleSort('sponsor')}
                                >
                                    Sponsor {sortConfig.key === 'sponsor' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th
                                    scope="col"
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                    onClick={() => handleSort('status')}
                                >
                                    Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th
                                    scope="col"
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                    onClick={() => handleSort('lastUpdated')}
                                >
                                    Last Updated {sortConfig.key === 'lastUpdated' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th
                                    scope="col"
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                    onClick={() => handleSort('primaryCompletionDate')}
                                >
                                    Primary Completion {sortConfig.key === 'primaryCompletionDate' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th
                                    scope="col"
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                    onClick={() => handleSort('lastChecked')}
                                >
                                    Last Checked {sortConfig.key === 'lastChecked' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th scope="col" className="relative px-6 py-3">
                                    <span className="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan="8" className="px-6 py-4 text-center text-sm text-gray-500">Loading...</td>
                                </tr>
                            ) : sortedTrials.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="px-6 py-4 text-center text-sm text-gray-500">No trials found.</td>
                                </tr>
                            ) : (
                                sortedTrials.map((trial) => (
                                    <tr key={trial.nctId}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                                checked={selectedTrials.has(trial.nctId)}
                                                onChange={() => toggleSelect(trial.nctId)}
                                            />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">
                                            <a
                                                href={`https://clinicaltrials.gov/study/${trial.nctId}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="hover:underline"
                                            >
                                                {trial.nctId}
                                            </a>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={trial.title}>
                                            {trial.title}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {trial.sponsor || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${['RECRUITING', 'ACTIVE_NOT_RECRUITING', 'ENROLLING_BY_INVITATION'].includes((trial.status || '').toUpperCase())
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                {trial.status || 'Unknown'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {trial.lastUpdated || 'Unknown'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {trial.primaryCompletionDate || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {trial.lastChecked ? new Date(trial.lastChecked).toLocaleString() : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">

                                            <button
                                                onClick={() => handleDelete(trial.nctId)}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                Remove
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

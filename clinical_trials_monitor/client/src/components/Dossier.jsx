import { useState, useEffect } from 'react'
import { authFetch } from '../api'

const LEVEL_STYLES = {
    HIGH: 'bg-red-100 text-red-800 border-red-200',
    MED: 'bg-amber-100 text-amber-800 border-amber-200',
    LOW: 'bg-gray-100 text-gray-600 border-gray-200',
}

function NewsItem({ item }) {
    return (
        <li className="px-4 py-3 sm:px-6">
            <div className="flex items-start gap-3">
                <span className={`mt-0.5 inline-flex justify-center min-w-[3rem] px-2 py-0.5 rounded text-xs font-bold border ${LEVEL_STYLES[item.level] || LEVEL_STYLES.LOW}`}>
                    {item.level}
                </span>
                <div className="flex-1 min-w-0">
                    <a href={item.url} target="_blank" rel="noreferrer"
                        className="text-sm font-semibold text-indigo-700 hover:underline break-words">
                        {item.title}
                    </a>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                        <span className="font-medium text-gray-700">{item.ticker}</span>
                        <span>·</span>
                        <span>{item.source}</span>
                        <span>·</span>
                        <span>{(item.published || '').slice(0, 10)}</span>
                        {(item.tags || []).map((t, i) => (
                            <span key={i} className="bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{t}</span>
                        ))}
                    </div>
                </div>
            </div>
        </li>
    )
}

export default function Dossier() {
    const [data, setData] = useState(null)
    const [companies, setCompanies] = useState([])
    const [paste, setPaste] = useState('')
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [adding, setAdding] = useState(false)
    const [feedback, setFeedback] = useState(null)

    useEffect(() => {
        loadCompanies()
        loadDossier()
    }, [])

    const loadCompanies = async () => {
        try {
            const res = await authFetch('/companies')
            setCompanies(await res.json())
        } catch (e) { console.error('Failed to load companies:', e) }
    }

    const loadDossier = async () => {
        setLoading(true)
        try {
            const res = await authFetch('/dossier')
            setData(await res.json())
        } catch (e) {
            console.error('Failed to load dossier:', e)
        } finally {
            setLoading(false)
        }
    }

    const handleAdd = async (e) => {
        e.preventDefault()
        if (!paste.trim()) return
        setAdding(true)
        setFeedback(null)
        try {
            const res = await authFetch('/companies', {
                method: 'POST',
                body: JSON.stringify({ text: paste }),
            })
            const result = await res.json()
            if (res.ok) {
                setPaste('')
                setFeedback({
                    added: result.added?.map(a => a.ticker) || [],
                    unresolved: result.unresolved || [],
                })
                await loadCompanies()
            } else {
                setFeedback({ error: result.error || 'Failed to add' })
            }
        } catch (e) {
            setFeedback({ error: e.message })
        } finally {
            setAdding(false)
        }
    }

    const handleRefresh = async () => {
        setRefreshing(true)
        try {
            const res = await authFetch('/dossier/refresh', { method: 'POST' })
            setData(await res.json())
        } catch (e) {
            console.error('Refresh failed:', e)
        } finally {
            setRefreshing(false)
        }
    }

    const handleRemove = async (ticker) => {
        if (!confirm(`Stop watching ${ticker}?`)) return
        try {
            await authFetch(`/companies/${encodeURIComponent(ticker)}`, { method: 'DELETE' })
            setCompanies(companies.filter(c => c.ticker !== ticker))
        } catch (e) { console.error('Failed to remove:', e) }
    }

    const counts = data?.counts || { HIGH: 0, MED: 0, LOW: 0 }
    const order = ['HIGH', 'MED', 'LOW']

    return (
        <div className="space-y-6">
            <div className="bg-white shadow sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Add Companies</h3>
                    <div className="mt-2 text-sm text-gray-500">
                        <p>Paste tickers in any format. Add an analyst note after a <code className="bg-gray-100 px-1 rounded">|</code> on a single-ticker line.</p>
                    </div>
                    <form className="mt-4" onSubmit={handleAdd}>
                        <textarea
                            rows={4}
                            className="block w-full sm:text-sm border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                            placeholder={"SRPT | core long, PDUFA Q3\nVRDN, BBIO, IONS"}
                            value={paste}
                            onChange={(e) => setPaste(e.target.value)}
                        />
                        <button
                            type="submit"
                            disabled={adding}
                            className="mt-3 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                            {adding ? 'Adding...' : 'Add to Watchlist'}
                        </button>
                    </form>
                    {feedback && (
                        <div className="mt-3 text-sm">
                            {feedback.error && <p className="text-red-600">{feedback.error}</p>}
                            {feedback.added?.length > 0 && (
                                <p className="text-green-700">Added: {feedback.added.join(', ')}</p>
                            )}
                            {feedback.unresolved?.length > 0 && (
                                <p className="text-amber-700">Could not resolve: {feedback.unresolved.join(', ')}</p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {companies.length > 0 && (
                <div className="bg-white shadow sm:rounded-lg">
                    <div className="px-4 py-4 sm:px-6 flex items-center justify-between">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">
                            Watchlist <span className="text-sm text-gray-500">({companies.length})</span>
                        </h3>
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                        >
                            {refreshing ? 'Refreshing…' : 'Refresh Dossier'}
                        </button>
                    </div>
                    <div className="px-4 pb-4 sm:px-6 flex flex-wrap gap-2">
                        {companies.map(c => (
                            <span key={c.ticker} className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-3 py-1 text-xs">
                                <span className="font-semibold text-gray-800">{c.ticker}</span>
                                {c.note && <span className="text-purple-700">· {c.note}</span>}
                                <button onClick={() => handleRemove(c.ticker)}
                                    className="ml-1 text-gray-400 hover:text-red-600" title="Remove">×</button>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <div className="px-4 py-4 sm:px-6 border-b border-gray-200">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Morning Dossier</h3>
                    <p className="text-xs text-gray-500 mt-1">
                        {data?.since ? `Since ${data.since.slice(0, 10)} · ` : ''}
                        <span className="text-red-700 font-medium">{counts.HIGH} high</span>{' · '}
                        <span className="text-amber-700 font-medium">{counts.MED} medium</span>{' · '}
                        <span className="text-gray-500">{counts.LOW} low</span>
                    </p>
                </div>
                {loading ? (
                    <div className="px-4 py-8 text-center text-gray-500">Loading…</div>
                ) : !data || (counts.HIGH + counts.MED + counts.LOW === 0) ? (
                    <div className="px-4 py-8 text-center text-gray-500">
                        {companies.length === 0
                            ? 'Add companies above to build your dossier.'
                            : 'No events in the lookback window. Try "Refresh Dossier".'}
                    </div>
                ) : (
                    order.map(level => (
                        (data.groups[level] || []).length > 0 && (
                            <div key={level}>
                                <div className="px-4 py-2 sm:px-6 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    {level} · {data.groups[level].length}
                                </div>
                                <ul className="divide-y divide-gray-100">
                                    {data.groups[level].map(item => (
                                        <NewsItem key={item.id} item={item} />
                                    ))}
                                </ul>
                            </div>
                        )
                    ))
                )}
            </div>
        </div>
    )
}

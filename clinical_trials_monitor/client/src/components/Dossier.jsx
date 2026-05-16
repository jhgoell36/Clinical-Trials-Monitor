import { useState, useRef, useEffect } from 'react'
import { authFetch } from '../api'
import Markdown from './Markdown'

const CATEGORY_LABEL = {
    filings: 'SEC Filings',
    presentations: 'Presentations & Posters',
    literature: 'Scientific Literature',
}

function humanSize(n) {
    if (n == null) return ''
    const u = ['B', 'KB', 'MB', 'GB']
    let i = 0
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
    return `${i === 0 ? n : n.toFixed(1)} ${u[i]}`
}

export default function Dossier() {
    const [ticker, setTicker] = useState('')
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [cik, setCik] = useState('')
    const [name, setName] = useState('')
    const [irUrl, setIrUrl] = useState('')

    const [job, setJob] = useState(null)
    const [dossier, setDossier] = useState(null)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const pollRef = useRef(null)

    useEffect(() => () => clearInterval(pollRef.current), [])

    const loadDossier = async (tk) => {
        try {
            const r = await authFetch(`/dossier/${encodeURIComponent(tk)}`)
            if (r.ok) {
                setDossier(await r.json())
            } else {
                const e = await r.json().catch(() => ({}))
                setError(e.error || 'Dossier not found')
            }
        } catch (e) {
            setError(e.message)
        }
    }

    const poll = (jobId) => {
        clearInterval(pollRef.current)
        pollRef.current = setInterval(async () => {
            try {
                const r = await authFetch(`/dossier/jobs/${jobId}`)
                const j = await r.json()
                setJob(j)
                if (j.status === 'done') {
                    clearInterval(pollRef.current)
                    setBusy(false)
                    loadDossier(j.ticker)
                } else if (j.status === 'error') {
                    clearInterval(pollRef.current)
                    setBusy(false)
                    setError(j.error || 'Dossier build failed')
                }
            } catch (e) {
                clearInterval(pollRef.current)
                setBusy(false)
                setError(e.message)
            }
        }, 1500)
    }

    const handleBuild = async (e) => {
        e.preventDefault()
        if (!ticker.trim()) return
        setError('')
        setDossier(null)
        setJob(null)
        setBusy(true)
        try {
            const body = { ticker: ticker.trim().toUpperCase() }
            if (cik.trim()) body.cik = cik.trim()
            if (name.trim()) body.name = name.trim()
            if (irUrl.trim()) body.irUrl = irUrl.trim()
            const r = await authFetch('/dossier', {
                method: 'POST',
                body: JSON.stringify(body),
            })
            const data = await r.json()
            if (!r.ok) throw new Error(data.error || 'Failed to start')
            setJob({ ...data, progress: [] })
            poll(data.jobId)
        } catch (err) {
            setBusy(false)
            setError(err.message)
        }
    }

    const download = async (tk, relPath, fileName) => {
        try {
            const r = await authFetch(
                `/dossier/${encodeURIComponent(tk)}/file?path=${encodeURIComponent(relPath)}`
            )
            if (!r.ok) throw new Error('Download failed')
            const blob = await r.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = fileName
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch (e) {
            setError(e.message)
        }
    }

    const grouped = {}
    if (dossier) {
        for (const f of dossier.files) {
            (grouped[f.category] = grouped[f.category] || []).push(f)
        }
    }

    const lastProgress = job?.progress?.[job.progress.length - 1]

    return (
        <div className="space-y-6">
            <div className="bg-white shadow sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                        Company Research Dossier
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                        Enter a ticker to assemble SEC filings, investor
                        presentations &amp; scientific posters, and the most
                        relevant literature into one deep-research brief.
                    </p>
                    <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={handleBuild}>
                        <div>
                            <label className="block text-xs font-medium text-gray-600">Ticker</label>
                            <input
                                type="text"
                                value={ticker}
                                onChange={(e) => setTicker(e.target.value)}
                                placeholder="e.g. TRAX"
                                className="mt-1 w-40 border border-gray-300 rounded-md p-2 text-sm
                                    focus:ring-indigo-500 focus:border-indigo-500"
                                autoComplete="off"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={busy}
                            className="px-4 py-2 border border-transparent shadow-sm font-medium
                                rounded-md text-white bg-indigo-600 hover:bg-indigo-700 text-sm
                                disabled:opacity-50"
                        >
                            {busy ? 'Building…' : 'Build Dossier'}
                        </button>
                        <button
                            type="button"
                            onClick={() => loadDossier(ticker.trim().toUpperCase())}
                            disabled={!ticker.trim()}
                            className="px-4 py-2 border border-gray-300 shadow-sm font-medium
                                rounded-md text-gray-700 bg-white hover:bg-gray-50 text-sm
                                disabled:opacity-50"
                        >
                            Load Existing
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowAdvanced((s) => !s)}
                            className="text-xs text-indigo-600 hover:underline"
                        >
                            {showAdvanced ? 'Hide' : 'Advanced'}
                        </button>
                    </form>

                    {showAdvanced && (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <input value={cik} onChange={(e) => setCik(e.target.value)}
                                placeholder="CIK override (new listings)"
                                className="border border-gray-300 rounded-md p-2 text-sm" />
                            <input value={name} onChange={(e) => setName(e.target.value)}
                                placeholder="Company name override"
                                className="border border-gray-300 rounded-md p-2 text-sm" />
                            <input value={irUrl} onChange={(e) => setIrUrl(e.target.value)}
                                placeholder="Investor-relations URL"
                                className="border border-gray-300 rounded-md p-2 text-sm" />
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 bg-red-50 border border-red-200 text-red-700
                            px-3 py-2 rounded text-sm">{error}</div>
                    )}

                    {job && job.status === 'running' && (
                        <div className="mt-4">
                            <div className="text-sm text-gray-700 font-medium">
                                Building dossier for {job.ticker}…
                            </div>
                            <div className="mt-2 bg-gray-50 border border-gray-200 rounded
                                p-3 max-h-48 overflow-y-auto text-xs font-mono space-y-1">
                                {(job.progress || []).map((p, i) => (
                                    <div key={i} className="text-gray-600">
                                        <span className="text-indigo-600">[{p.stage}]</span>{' '}
                                        {p.message}
                                    </div>
                                ))}
                                {lastProgress == null && (
                                    <div className="text-gray-400">Starting…</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {dossier && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <div className="lg:col-span-1 bg-white shadow sm:rounded-lg p-4 h-fit">
                        <h4 className="font-semibold text-gray-900 text-sm mb-2">
                            Held Files
                        </h4>
                        <p className="text-xs text-gray-500 mb-3">
                            Stored alongside the dossier and referenced in it.
                        </p>
                        {Object.keys(grouped).length === 0 && (
                            <p className="text-xs text-gray-400">
                                No files were downloaded (likely network-restricted
                                environment). Source URLs are listed in the dossier.
                            </p>
                        )}
                        {['filings', 'presentations', 'literature'].map((cat) =>
                            grouped[cat] ? (
                                <div key={cat} className="mb-4">
                                    <div className="text-xs font-semibold text-gray-700
                                        uppercase tracking-wide mb-1">
                                        {CATEGORY_LABEL[cat]} ({grouped[cat].length})
                                    </div>
                                    <ul className="space-y-1">
                                        {grouped[cat].map((f) => (
                                            <li key={f.path}>
                                                <button
                                                    onClick={() => download(dossier.ticker, f.path, f.name)}
                                                    className="text-left text-xs text-indigo-600
                                                        hover:underline break-all"
                                                    title={`${f.name} (${humanSize(f.bytes)})`}
                                                >
                                                    {f.name}
                                                </button>{' '}
                                                <span className="text-gray-400 text-[10px]">
                                                    {humanSize(f.bytes)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null
                        )}
                        <button
                            onClick={() => {
                                const blob = new Blob([dossier.markdown], { type: 'text/markdown' })
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url
                                a.download = `${dossier.ticker}-dossier.md`
                                a.click()
                                URL.revokeObjectURL(url)
                            }}
                            className="mt-2 w-full text-xs px-3 py-2 border border-gray-300
                                rounded-md text-gray-700 hover:bg-gray-50"
                        >
                            Download DOSSIER.md
                        </button>
                    </div>

                    <div className="lg:col-span-3 bg-white shadow sm:rounded-lg p-6
                        max-w-none overflow-x-auto">
                        <Markdown text={dossier.markdown} />
                    </div>
                </div>
            )}
        </div>
    )
}

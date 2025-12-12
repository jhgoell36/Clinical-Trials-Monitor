import { useState, useEffect } from 'react'
import { authFetch } from '../api'

export default function Settings() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')

    useEffect(() => {
        fetchSettings()
    }, [])

    const fetchSettings = async () => {
        try {
            const response = await authFetch('/settings')
            const data = await response.json()
            setEmail(data.notify_email || '')
        } catch (error) {
            console.error('Failed to fetch settings:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSaving(true)
        setMessage('')
        try {
            await authFetch('/settings', {
                method: 'POST',
                body: JSON.stringify({ notify_email: email }),
            })
            setMessage('Settings saved successfully.')
        } catch (error) {
            setMessage('Failed to save settings.')
        } finally {
            setSaving(false)
        }
    }

    const handleCheckNow = async () => {
        try {
            await authFetch('/check-now', { method: 'POST' });
            alert('Check started in background. Check server logs.');
        } catch (e) {
            alert('Failed to trigger check');
        }
    }

    if (loading) return <div className="p-4">Loading...</div>

    return (
        <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Notification Settings</h3>
                <div className="mt-2 max-w-xl text-sm text-gray-500">
                    <p>Receive email notifications when monitored trials are updated.</p>
                </div>
                <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                            Email Address
                        </label>
                        <div className="mt-1">
                            <input
                                type="email"
                                name="email"
                                id="email"
                                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                </form>
                {message && <p className="mt-2 text-sm text-green-600">{message}</p>}

                <div className="mt-8 border-t pt-4">
                    <h4 className="text-md font-medium text-gray-900">Developer Tools</h4>
                    <button
                        onClick={handleCheckNow}
                        className="mt-2 inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                    >
                        Force Update Check Now
                    </button>
                    <button
                        onClick={async () => {
                            try {
                                const res = await authFetch('/test-email', { method: 'POST' });
                                const data = await res.json();
                                if (res.ok) alert('Test email sent! Check your inbox (or spam).');
                                else alert('Error: ' + data.error);
                            } catch (e) {
                                alert('Failed to send test email');
                            }
                        }}
                        className="mt-2 ml-3 inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                    >
                        Send Test Email
                    </button>
                </div>
            </div>
        </div>
    )
}

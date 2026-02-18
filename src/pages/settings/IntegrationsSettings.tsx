import { useState, useEffect } from 'react';
import { Plus, Trash2, Key, Globe, Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';

const API_BASE_URL = 'http://localhost:3000/api'; // Adjust if needed

interface ApiKey {
    id: string;
    name: string;
    key_prefix: string;
    created_at: string;
    last_used_at: string | null;
    key?: string;
}

interface Webhook {
    id: string;
    target_url: string;
    events: string[];
    active: boolean;
    secret: string;
}

export function IntegrationsSettings() {
    const [activeTab, setActiveTab] = useState('api_keys');

    return (
        <div className="space-y-6">
            <div className="flex gap-4 border-b border-border/50 pb-2">
                <button
                    onClick={() => setActiveTab('api_keys')}
                    className={`pb-2 text-sm font-medium transition-colors ${activeTab === 'api_keys'
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-text-secondary hover:text-text-primary'
                        }`}
                >
                    API Keys
                </button>
                <button
                    onClick={() => setActiveTab('webhooks')}
                    className={`pb-2 text-sm font-medium transition-colors ${activeTab === 'webhooks'
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-text-secondary hover:text-text-primary'
                        }`}
                >
                    Webhooks
                </button>
            </div>

            {activeTab === 'api_keys' ? <ApiKeysManager /> : <WebhooksManager />}
        </div>
    );
}

function ApiKeysManager() {
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [newKeyName, setNewKeyName] = useState('');
    const [createdKey, setCreatedKey] = useState<ApiKey | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        fetchKeys();
    }, []);

    const fetchKeys = async () => {
        try {
            const token = localStorage.getItem('token'); // Assuming auth token is stored here
            const res = await fetch(`${API_BASE_URL}/keys`, {
                headers: { 'Authorization': `Bearer ${token}` } // If you use Bearer auth, otherwise cookies
            });
            if (res.ok) {
                const data = await res.json();
                setKeys(data);
            }
        } catch (err) {
            console.error('Failed to fetch keys', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateKey = async () => {
        if (!newKeyName.trim()) return;
        setIsCreating(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/keys`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` // Assuming cookie auth primarily, but adding header just in case
                },
                body: JSON.stringify({ name: newKeyName })
            });

            if (res.ok) {
                const data = await res.json();
                setCreatedKey(data);
                setNewKeyName('');
                fetchKeys();
            }
        } catch (err) {
            console.error('Failed to create key', err);
        } finally {
            setIsCreating(false);
        }
    };

    const handleRevokeKey = async (id: string) => {
        if (!confirm('Are you sure you want to revoke this API Key? This action cannot be undone.')) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/keys/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setKeys(keys.filter(k => k.id !== id));
            }
        } catch (err) {
            console.error('Failed to revoke key', err);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-surface border border-border/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                    <Key className="w-5 h-5 text-primary" /> Generate New API Key
                </h3>
                <div className="flex gap-4 items-end">
                    <div className="flex-1 space-y-2">
                        <label className="text-sm text-text-secondary">Key Name</label>
                        <input
                            type="text"
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                            placeholder="e.g. My Website Integration"
                            className="w-full bg-background border border-border/50 rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:border-primary"
                        />
                    </div>
                    <button
                        onClick={handleCreateKey}
                        disabled={!newKeyName.trim() || isCreating}
                        className="bg-primary hover:opacity-90 text-white px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isCreating ? 'Generating...' : <><Plus size={18} /> Generate Key</>}
                    </button>
                </div>

                {createdKey && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-green-400 font-medium">API Key Generated Successfully!</span>
                            <button onClick={() => setCreatedKey(null)} className="text-text-muted hover:text-text-primary">&times;</button>
                        </div>
                        <p className="text-text-secondary text-sm mb-3">
                            Copy this key now. You won't be able to see it again!
                        </p>
                        <div className="flex items-center gap-2 bg-background p-3 rounded border border-border/50">
                            <code className="text-primary font-mono text-sm flex-1 break-all">{createdKey.key}</code>
                            <CopyButton text={createdKey.key || ''} />
                        </div>
                    </motion.div>
                )}
            </div>

            <div className="bg-surface border border-border/50 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border/50 bg-surfaceHover/30">
                    <h3 className="font-medium text-text-primary">Your API Keys</h3>
                </div>
                {loading ? (
                    <div className="p-8 text-center text-text-muted">Loading keys...</div>
                ) : keys.length === 0 ? (
                    <div className="p-8 text-center text-text-muted">No API keys generated yet.</div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="bg-surfaceHover/50 text-text-secondary">
                            <tr>
                                <th className="p-4 font-medium">Name</th>
                                <th className="p-4 font-medium">Prefix</th>
                                <th className="p-4 font-medium">Created</th>
                                <th className="p-4 font-medium">Last Used</th>
                                <th className="p-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                            {keys.map(key => (
                                <tr key={key.id} className="hover:bg-surfaceHover/30 transition-colors">
                                    <td className="p-4 text-text-primary font-medium">{key.name}</td>
                                    <td className="p-4 text-text-muted font-mono">{key.key_prefix}...</td>
                                    <td className="p-4 text-text-secondary">{new Date(key.created_at).toLocaleDateString()}</td>
                                    <td className="p-4 text-text-secondary">
                                        {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Never'}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => handleRevokeKey(key.id)}
                                            className="text-red-400 hover:text-red-300 p-2 hover:bg-red-400/10 rounded-lg transition-colors"
                                            title="Revoke Key"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="bg-surface border border-border/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-text-primary mb-2">API Documentation</h3>
                <p className="text-text-secondary text-sm mb-4">
                    Access our comprehensive API documentation to learn how to integrate Kogna into your applications.
                </p>
                <a
                    href="http://localhost:3000/api-docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
                >
                    View Swagger Documentation &rarr;
                </a>
            </div>
        </div>
    );
}

function WebhooksManager() {
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({ targetUrl: '', events: ['lead.created'] });
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        fetchWebhooks();
    }, []);

    const fetchWebhooks = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/webhooks`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setWebhooks(data);
            }
        } catch (err) {
            console.error('Failed to fetch webhooks', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateWebhook = async () => {
        if (!formData.targetUrl) return;
        setIsCreating(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/webhooks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setFormData({ targetUrl: '', events: ['lead.created'] });
                fetchWebhooks();
            }
        } catch (err) {
            console.error('Failed to create webhook', err);
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteWebhook = async (id: string) => {
        if (!confirm('Are you sure you want to remove this Webhook?')) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/webhooks/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setWebhooks(webhooks.filter(w => w.id !== id));
            }
        } catch (err) {
            console.error('Failed to delete webhook', err);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-surface border border-border/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary" /> Add Webhook Endpoint
                </h3>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm text-text-secondary">Target URL</label>
                        <input
                            type="url"
                            value={formData.targetUrl}
                            onChange={(e) => setFormData({ ...formData, targetUrl: e.target.value })}
                            placeholder="https://your-api.com/webhooks/kogna"
                            className="w-full bg-background border border-border/50 rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:border-primary"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm text-text-secondary">Events</label>
                        <div className="flex flex-wrap gap-3">
                            {['lead.created', 'appointment.scheduled'].map(ev => (
                                <label key={ev} className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.events.includes(ev)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setFormData({ ...formData, events: [...formData.events, ev] });
                                            } else {
                                                setFormData({ ...formData, events: formData.events.filter(x => x !== ev) });
                                            }
                                        }}
                                        className="rounded border-border/50 bg-background text-primary focus:ring-primary"
                                    />
                                    {ev}
                                </label>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handleCreateWebhook}
                        disabled={!formData.targetUrl || formData.events.length === 0 || isCreating}
                        className="bg-primary hover:opacity-90 text-white px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isCreating ? 'Adding...' : <><Plus size={18} /> Add Webhook</>}
                    </button>
                </div>
            </div>

            <div className="bg-surface border border-border/50 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border/50 bg-surfaceHover/30">
                    <h3 className="font-medium text-text-primary">Active Webhooks</h3>
                </div>
                {loading ? (
                    <div className="p-8 text-center text-text-muted">Loading webhooks...</div>
                ) : webhooks.length === 0 ? (
                    <div className="p-8 text-center text-text-muted">No webhooks configured.</div>
                ) : (
                    <div className="divide-y divide-border/30">
                        {webhooks.map(webhook => (
                            <div key={webhook.id} className="p-4 flex items-center justify-between hover:bg-surfaceHover/30 transition-colors">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-text-primary break-all">{webhook.target_url}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${webhook.active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                            {webhook.active ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    <div className="flex gap-2 text-xs text-text-muted">
                                        {webhook.events.map(ev => (
                                            <span key={ev} className="bg-background border border-border/30 px-2 py-0.5 rounded text-text-secondary">
                                                {ev}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="text-xs text-text-muted/60 font-mono mt-1">
                                        Secret: {webhook.secret.substring(0, 10)}...
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDeleteWebhook(webhook.id)}
                                    className="text-red-400 hover:text-red-300 p-2 hover:bg-red-400/10 rounded-lg transition-colors"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button onClick={handleCopy} className="text-text-secondary hover:text-primary transition-colors p-1">
            {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
        </button>
    );
}

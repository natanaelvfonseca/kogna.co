import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KanbanColumn } from './KanbanColumn';
import { Lead, LeadStatus } from '../types';
import { useAuth } from '../../../context/AuthContext';
import { useNotifications } from '../../../context/NotificationContext';

interface DbColumn {
    id: string;
    title: string;
    color?: string;
    order_index: number;
    is_system?: boolean;
}

// Legacy status-to-title mapping for leads created before column integration
const LEGACY_STATUS_MAP: Record<string, string> = {
    'new': 'Novos Leads',
    'contacted': 'Em Contato',
    'proposal': 'Proposta Enviada',
    'negotiation': 'Negociação',
    'qualified': 'Qualificado',
    'closed': 'Fechado',
    'lost': 'Perdido',
};

export function KanbanBoard({ refreshTrigger, onEditLead }: { refreshTrigger: number; onEditLead: (lead: Lead) => void }) {
    const { token } = useAuth();
    const { showToast } = useNotifications();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [columns, setColumns] = useState<DbColumn[]>([]);
    const navigate = useNavigate();

    const API_URL = '/api';

    const authHeaders = (): HeadersInit => ({
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    });

    // Get the column title that a lead belongs to
    const getLeadColumnTitle = (lead: Lead): string => {
        // First check if the status exactly matches a column title
        const directMatch = columns.find(c => c.title === lead.status);
        if (directMatch) return directMatch.title;

        // Check legacy status mapping
        const legacyTitle = LEGACY_STATUS_MAP[lead.status];
        if (legacyTitle) {
            const legacyMatch = columns.find(c => c.title === legacyTitle);
            if (legacyMatch) return legacyMatch.title;
        }

        // Default to first column
        return columns.length > 0 ? columns[0].title : '';
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [leadsRes, colsRes] = await Promise.all([
                fetch(`${API_URL}/leads`, { headers: authHeaders() }),
                fetch(`${API_URL}/settings/columns`, { headers: authHeaders() })
            ]);

            if (colsRes.ok) {
                const dbColumns = await colsRes.json();
                if (dbColumns && dbColumns.length > 0) {
                    setColumns(dbColumns);
                }
            }

            if (leadsRes.ok) {
                const data = await leadsRes.json();
                if (Array.isArray(data)) {
                    setLeads(data);
                } else {
                    console.error("Leads data is not an array:", data);
                    setLeads([]);
                }
            }

        } catch (e) {
            console.error("Error fetching data:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [refreshTrigger]);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, leadId: string) => {
        e.dataTransfer.setData('leadId', leadId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>, columnTitle: string) => {
        e.preventDefault();
        const leadId = e.dataTransfer.getData('leadId');

        if (leadId) {
            // Optimistically update the lead status to the column title
            const updatedLeads = leads.map((lead) =>
                lead.id === leadId
                    ? { ...lead, status: columnTitle as LeadStatus }
                    : lead
            );
            setLeads(updatedLeads);

            setSyncing(true);
            try {
                await fetch(`${API_URL}/leads/${leadId}/status`, {
                    method: 'PATCH',
                    headers: authHeaders(),
                    body: JSON.stringify({ status: columnTitle }),
                });
            } catch (error) {
                console.error('Failed to update lead status:', error);
            } finally {
                setTimeout(() => setSyncing(false), 500);
            }
        }
    };

    const handleDeleteLead = async (leadId: string) => {
        setSyncing(true);
        try {
            const res = await fetch(`${API_URL}/leads/${leadId}`, {
                method: 'DELETE',
                headers: authHeaders(),
            });

            if (res.ok) {
                setLeads(prev => prev.filter(lead => lead.id !== leadId));
            } else {
                console.error("Failed to delete lead");
                alert("Erro ao excluir lead. Tente novamente.");
            }
        } catch (error) {
            console.error("Delete error:", error);
            alert("Erro de conexão ao excluir lead.");
        } finally {
            setSyncing(false);
        }
    };

    const handleMarkAsClient = async (leadId: string) => {
        setSyncing(true);

        try {
            const leadToUpdate = leads.find(l => l.id === leadId);
            if (!leadToUpdate) return;

            // Remove from Kanban optimistically
            const url = `${API_URL}/leads/${leadId}/status`;
            const body = { status: 'Cliente' };

            const res = await fetch(url, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify(body),
            });

            if (res.ok) {
                setLeads(prev => prev.filter(l => l.id !== leadId));
                showToast('Cliente fechado com sucesso', 'O negócio foi fechado e o lead movido para clientes.', 'success');

                // Navigate after a short delay
                setTimeout(() => {
                    navigate('/clients');
                }, 1500);
            } else {
                fetchData();
            }
        } catch (error: any) {
            fetchData();
        } finally {
            setSyncing(false);
        }
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="flex gap-4 h-full overflow-x-auto pb-4 items-start select-none scrollbar-hide relative">
            {syncing && (
                <div className="absolute top-2 right-4 z-50">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-500"></div>
                </div>
            )}

            {columns.map((col) => (
                <div
                    key={col.id}
                    className="h-full flex flex-col"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, col.title)}
                >
                    <KanbanColumn
                        column={{
                            id: col.title,
                            title: col.title,
                            leads: (leads || []).filter((l) => {
                                if (!l || l.status === 'Cliente') return false;
                                return getLeadColumnTitle(l) === col.title;
                            }),
                        }}
                        onDrop={(e) => handleDrop(e, col.title)}
                        onDragOver={handleDragOver}
                        onDragStart={handleDragStart}
                        onDeleteLead={handleDeleteLead}
                        onEditLead={onEditLead}
                        onMarkAsClient={handleMarkAsClient}
                    />
                </div>
            ))}
        </div>
    );
}

import { MoreHorizontal, Calendar, DollarSign, Trash2, Phone, Mail, Globe, UserCheck } from 'lucide-react';
import { Lead } from '../types';

interface KanbanCardProps {
    lead: Lead;
    onDragStart: (e: React.DragEvent<HTMLDivElement>, leadId: string) => void;
    onDelete?: (leadId: string) => void;
    onEdit?: (lead: Lead) => void;
    onMarkAsClient?: (leadId: string) => void;
}

export function KanbanCard({ lead, onDragStart, onDelete, onEdit, onMarkAsClient }: KanbanCardProps) {
    // Defensive check
    if (!lead) return null;

    const formatValue = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    const formatDate = (dateString: string) => {
        try {
            const date = new Date(dateString);
            return new Intl.DateTimeFormat('pt-BR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }).format(date);
        } catch (e) {
            return dateString;
        }
    };

    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, lead.id)}
            className="bg-surface border border-border/50 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-move group animate-fade-in mb-3 active:scale-95 active:rotate-1 relative"
        >
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-xs font-bold text-white border border-white/5">
                        {(lead.name || 'Sem Nome').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <h4 className="font-semibold text-text-primary text-sm leading-tight group-hover:text-primary transition-colors">{lead.name || 'Sem Nome'}</h4>

                        {lead.phone && (
                            <p className="text-xs text-text-secondary flex items-center gap-1 mt-0.5">
                                <Phone size={10} />
                                {lead.phone}
                            </p>
                        )}
                        {lead.email && (
                            <p className="text-xs text-text-secondary flex items-center gap-1 mt-0.5 truncate max-w-[180px]" title={lead.email}>
                                <Mail size={10} />
                                {lead.email}
                            </p>
                        )}
                        {lead.source && (
                            <p className="text-xs text-text-secondary flex items-center gap-1 mt-0.5">
                                <Globe size={10} />
                                {lead.source}
                            </p>
                        )}
                        {lead.temperature && (
                            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold mt-1.5 border ${lead.temperature.includes('Quente') ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                    lead.temperature.includes('Morno') ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' :
                                        'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                }`}>
                                <span>{lead.temperature}</span>
                                {lead.score !== undefined && <span className="opacity-70">({lead.score}%)</span>}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex gap-1">
                    {onDelete && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Tem certeza que deseja excluir este lead?')) {
                                    onDelete(lead.id);
                                }
                            }}
                            className="text-text-muted hover:text-red-500 transition-colors p-1 hover:bg-red-500/10 rounded opacity-0 group-hover:opacity-100"
                            title="Excluir Lead"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                    {onMarkAsClient && lead.status !== 'Cliente' && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Marcar ${lead.name} como Cliente?`)) {
                                    onMarkAsClient(lead.id);
                                }
                            }}
                            className="text-text-muted hover:text-green-500 transition-colors p-1 hover:bg-green-500/10 rounded"
                            title="Fechar Negócio"
                        >
                            <UserCheck size={16} />
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit?.(lead);
                        }}
                        className="text-text-muted hover:text-text-primary transition-colors p-1 hover:bg-white/5 rounded"
                        title="Editar Lead"
                    >
                        <MoreHorizontal size={16} />
                    </button>
                </div>
            </div>

            <div className="flex items-center justify-between text-xs text-text-secondary border-t border-border/30 pt-3 mt-1">
                <div className="flex items-center gap-1.5 font-medium text-text-primary/80">
                    <DollarSign size={12} className="text-green-500" />
                    {formatValue(lead.value || 0)}
                </div>
                <div className="flex items-center gap-1.5" title={lead.lastContact}>
                    <Calendar size={12} />
                    {formatDate(lead.lastContact)}
                </div>
            </div>

            {lead.tags && lead.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                    {lead.tags.map(tag => (
                        <span key={tag} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-text-primary/5 text-text-secondary border border-text-primary/5">
                            {tag}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

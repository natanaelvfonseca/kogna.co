import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Search, Paperclip, CheckCheck, X, Play, Pause, UserCheck, BrainCircuit, Lightbulb, Target, MessageSquare, Sparkles, Loader2, TrendingUp, Clock3, ShieldAlert, Bot, ArrowUpRight } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/cn';


interface Chat {
    id: string;
    name: string;
    pushName?: string;
    picture?: string;
    lastMessage?: {
        content: string;
        timestamp: number;
        status?: string;
    };
    remoteJid: string;
    unreadCount?: number;
    associatedJids?: Set<string>;
}

interface Message {
    id: string;
    key: {
        remoteJid: string;
        fromMe: boolean;
        id: string;
    };
    message: {
        conversation?: string;
        extendedTextMessage?: {
            text: string;
        };
        imageMessage?: any;
        videoMessage?: any;
        audioMessage?: any;
        documentMessage?: any;
        reactionMessage?: any;
    };
    pushName?: string;
    profilePicUrl?: string;
    messageTimestamp: number | string;
    status: string;
}

interface LeadSummaryData {
    text?: string | null;
    recommendation?: string | null;
    stage?: string | null;
    intent?: string | null;
    needsHumanAttention?: boolean;
    humanAttentionReason?: string | null;
    humanAttentionSince?: string | null;
    topObjection?: string | null;
}

interface FollowupStatusData {
    status: string;
    current_step?: number;
    total_steps?: number;
    scheduled_at?: string | null;
    conversation_temperature?: string | null;
    pipeline_stage?: string | null;
    followup_trigger_reason?: string | null;
    detected_objection?: string | null;
    detected_product_interest?: string | null;
    lead_score?: number;
    lead_id?: string | null;
    lead_name?: string | null;
    lead_briefing?: string | null;
    lead_summary?: string | null;
    next_recommendation?: string | null;
    sequence_name?: string | null;
    assigned_vendor_name?: string | null;
    needs_human_attention?: boolean;
    human_attention_reason?: string | null;
    human_attention_since?: string | null;
    top_objection?: string | null;
}

interface SellerConversationScope {
    remoteJid: string;
    instanceName: string | null;
    phone?: string | null;
}

const FOLLOWUP_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
    pending: {
        label: 'Agendado',
        badgeClass: 'border-orange-200 bg-orange-50 text-orange-600 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-200',
    },
    sent: {
        label: 'Enviado',
        badgeClass: 'border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200',
    },
    replied: {
        label: 'Reativado',
        badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200',
    },
    cancelled: {
        label: 'Cancelado',
        badgeClass: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-200',
    },
};

function formatRelativeMoment(timestamp?: number | string | null) {
    if (!timestamp) return 'Agora';

    const date = new Date(typeof timestamp === 'number' && timestamp < 10000000000 ? timestamp * 1000 : timestamp);
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

    if (diffMinutes < 1) return 'Agora';
    if (diffMinutes < 60) return `${diffMinutes} min atras`;

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h atras`;

    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d atras`;
}

function normalizeBrazilPhoneKey(value?: string | null) {
    const digits = String(value || '').split('@')[0].replace(/\D/g, '');
    if (!digits) return '';

    if (digits.startsWith('55')) {
        const localDigits = digits.slice(2);
        if (localDigits.length === 11 && localDigits[2] === '9') {
            return `55${localDigits.slice(0, 2)}${localDigits.slice(3)}`;
        }
        return digits;
    }

    if (digits.length === 11 && digits[2] === '9') {
        return `${digits.slice(0, 2)}${digits.slice(3)}`;
    }

    return digits;
}

function buildScopeKeys(values: Array<string | null | undefined>) {
    const keys = new Set<string>();

    values.forEach((value) => {
        if (!value) return;

        const literal = String(value).trim();
        if (!literal) return;

        keys.add(literal.toLowerCase());

        const normalized = normalizeBrazilPhoneKey(literal);
        if (normalized) {
            keys.add(normalized);
            if (normalized.startsWith('55')) {
                keys.add(normalized.slice(2));
            }
        }
    });

    return keys;
}

function buildChatScopeKeys(chat: Chat) {
    return buildScopeKeys([
        chat.remoteJid,
        chat.id,
        ...(chat.associatedJids ? Array.from(chat.associatedJids) : []),
    ]);
}

function getLeadPriorityMeta(temperature?: string, score = 0) {
    if ((temperature || '').includes('Quente') || score >= 80) {
        return {
            label: 'Alta prioridade',
            description: 'Momento forte para fechamento ou agendamento.',
            badgeClass: 'border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300',
        };
    }

    if ((temperature || '').includes('Morno') || score >= 45) {
        return {
            label: 'Em aceleracao',
            description: 'Existe interesse, mas ainda ha friccao para resolver.',
            badgeClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
        };
    }

    return {
        label: 'Em qualificacao',
        description: 'Ainda vale investigar dor, timing e contexto.',
        badgeClass: 'border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300',
    };
}

function buildRevenueOsTips({
    temperature,
    score,
    isChatPaused,
    unreadCount,
    summary,
    lastInboundTimestamp,
    objection,
    needsHumanAttention,
}: {
    temperature?: string;
    score?: number;
    isChatPaused: boolean;
    unreadCount?: number;
    summary?: LeadSummaryData | null;
    lastInboundTimestamp?: number | string | null;
    objection?: string | null;
    needsHumanAttention?: boolean;
}) {
    const tips: { title: string; body: string }[] = [];

    if (isChatPaused) {
        tips.push({
            title: 'Assuma com contexto',
            body: 'A IA ja pausou a automacao. Entre manualmente, confirme o objetivo atual do lead e proponha o proximo passo comercial.',
        });
    } else if ((temperature || '').includes('Quente') || (score || 0) >= 80) {
        tips.push({
            title: 'Conduza para decisao',
            body: 'Reduza opcoes, use uma CTA unica e tente converter em agenda, pagamento ou confirmacao de interesse.',
        });
    } else if ((temperature || '').includes('Morno') || (score || 0) >= 45) {
        tips.push({
            title: 'Remova friccao',
            body: 'Valide a principal dor, o timing e o criterio de compra antes de entrar em detalhes de preco.',
        });
    } else {
        tips.push({
            title: 'Aprofunde a qualificacao',
            body: 'Use perguntas abertas para entender contexto, urgencia e o que faria esse lead avancar.',
        });
    }

    if (needsHumanAttention) {
        tips.push({
            title: 'Acione humano com contexto',
            body: 'Este lead merece acompanhamento humano agora. Entre com clareza, valide a decisao e mantenha uma CTA unica para nao perder timing.',
        });
    }

    if (objection) {
        tips.push({
            title: 'Trabalhe a objecao principal',
            body: `Existe uma objecao ativa em torno de "${objection}". Responda com prova, contexto e conduza para o proximo passo logo depois de reduzir a friccao.`,
        });
    }

    if (summary?.recommendation) {
        tips.push({
            title: 'Siga a proxima acao da IA',
            body: summary.recommendation,
        });
    }

    if (summary?.intent) {
        tips.push({
            title: 'Ancore na intencao atual',
            body: `A conversa indica foco em ${summary.intent.toLowerCase()}. Conecte a resposta a esse objetivo para ganhar velocidade.`,
        });
    }

    if ((unreadCount || 0) > 0 || lastInboundTimestamp) {
        tips.push({
            title: 'Mantenha velocidade',
            body: `A ultima interacao do contato foi ${formatRelativeMoment(lastInboundTimestamp)}. Responda rapido para nao esfriar a conversa.`,
        });
    }

    return tips.slice(0, 3);
}

export function LiveChat() {
    const { user, token } = useAuth();
    const [searchParams] = useSearchParams();
    const sellerId = searchParams.get('sellerId')?.trim() || null;
    const requestedInstanceName = searchParams.get('instance')?.trim() || null;
    const requestedJid = searchParams.get('jid')?.trim() || null;
    const [chats, setChats] = useState<Chat[]>([]);
    const [activeChat, setActiveChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [isLoadingChats, setIsLoadingChats] = useState(false);
    const [instanceName, setInstanceName] = useState<string | null>(null);
    const [noInstance, setNoInstance] = useState(false);
    const [isUploadingFile, setIsUploadingFile] = useState(false);
    const messagesContainerRef = useRef<HTMLDivElement>(null); // New ref for container
    const chatPollingRef = useRef<any>(null);
    const messagePollingRef = useRef<any>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isChatPaused, setIsChatPaused] = useState(false);
    const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);
    const [activeLeadScore, setActiveLeadScore] = useState<number>(0);
    const [activeLeadTemp, setActiveLeadTemp] = useState<string>("Frio");
    const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
    const [chatTemperatures, setChatTemperatures] = useState<Record<string, { temperature: string, score: number }>>({});
    const [vendedores, setVendedores] = useState<{ id: string; nome: string }[]>([]);
    const [showTakeoverModal, setShowTakeoverModal] = useState(false);
    const [selectedVendedorId, setSelectedVendedorId] = useState<string>('');
    const [activeLeadSummary, setActiveLeadSummary] = useState<LeadSummaryData | null>(null);
    const [activeFollowupStatus, setActiveFollowupStatus] = useState<FollowupStatusData | null>(null);
    const [sellerConversations, setSellerConversations] = useState<SellerConversationScope[]>([]);
    const [isLoadingSellerScope, setIsLoadingSellerScope] = useState(false);
    const requestedChatSelectionRef = useRef(false);

    useEffect(() => {
        requestedChatSelectionRef.current = false;
    }, [requestedJid, sellerId, requestedInstanceName]);

    useEffect(() => {
        if (!sellerId || !token) {
            setSellerConversations([]);
            return;
        }

        let isCancelled = false;
        setIsLoadingSellerScope(true);

        fetch(`/api/sellers/${sellerId}/conversations?range=30d`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        })
            .then((response) => response.ok ? response.json() : Promise.reject(new Error('seller_scope_failed')))
            .then((data) => {
                if (isCancelled) return;
                setSellerConversations(Array.isArray(data?.conversations) ? data.conversations : []);
            })
            .catch(() => {
                if (!isCancelled) {
                    setSellerConversations([]);
                }
            })
            .finally(() => {
                if (!isCancelled) {
                    setIsLoadingSellerScope(false);
                }
            });

        return () => {
            isCancelled = true;
        };
    }, [sellerId, token]);


    // Fetch Chat Context when activeChat changes
    useEffect(() => {
        if (!activeChat || !instanceName || !user) return;

        const fetchContext = async () => {
            try {
                const jid = activeChat.remoteJid || activeChat.id;
                // Encode JID just in case (though mostly safe in path usually)
                const res = await fetch(`/api/chat-context/${instanceName}/${encodeURIComponent(jid)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.found || data.agentId) {
                        setCurrentAgentId(data.agentId);
                        setIsChatPaused(data.isPaused);
                        setActiveLeadScore(data.leadScore || 0);
                        setActiveLeadTemp(data.leadTemperature || "Frio");
                        setActiveLeadId(data.leadId || null);
                        setActiveLeadSummary((current) => current ? {
                            ...current,
                            needsHumanAttention: data.needsHumanAttention || false,
                            humanAttentionReason: data.humanAttentionReason || null,
                            humanAttentionSince: data.humanAttentionSince || null,
                            topObjection: data.topObjection || current.topObjection || null,
                        } : current);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch chat context', err);
            }
        };
        fetchContext();
    }, [activeChat, instanceName, user, token]);

    useEffect(() => {
        if (!activeLeadId || !token) {
            setActiveLeadSummary(null);
            return;
        }

        let cancelled = false;

        fetch(`/api/leads/${activeLeadId}/memory`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (cancelled) return;
                const summary = data?.summary;
                if (!summary) {
                    setActiveLeadSummary(null);
                    return;
                }
                setActiveLeadSummary({
                    text: summary.text || null,
                    recommendation: summary.recommendation || null,
                    stage: summary.stage || null,
                    intent: summary.intent || null,
                    needsHumanAttention: summary.needs_human_attention || false,
                    humanAttentionReason: summary.human_attention_reason || null,
                    humanAttentionSince: summary.human_attention_since || null,
                    topObjection: summary.top_objection || data?.memory?.top_objection || data?.memory?.main_objection || null,
                });
            })
            .catch(() => {
                if (!cancelled) setActiveLeadSummary(null);
            });

        return () => {
            cancelled = true;
        };
    }, [activeLeadId, token]);

    useEffect(() => {
        if (!activeChat || !token) {
            setActiveFollowupStatus(null);
            return;
        }

        let cancelled = false;
        const jid = encodeURIComponent(activeChat.remoteJid || activeChat.id);

        fetch(`/api/followup/status/${jid}`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then((response) => response.ok ? response.json() : null)
            .then((data) => {
                if (cancelled) return;
                if (data && data.status !== 'none') {
                    setActiveFollowupStatus(data);
                    return;
                }
                setActiveFollowupStatus(null);
            })
            .catch(() => {
                if (!cancelled) setActiveFollowupStatus(null);
            });

        return () => {
            cancelled = true;
        };
    }, [activeChat, token]);

    const handleToggleChatPause = async () => {
        if (!currentAgentId || !activeChat) return;

        try {
            const jid = activeChat.remoteJid || activeChat.id;
            const res = await fetch('/api/chats/toggle-pause', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    agentId: currentAgentId,
                    remoteJid: jid
                })
            });

            if (res.ok) {
                const data = await res.json();
                setIsChatPaused(data.isPaused);
            }
        } catch (err) {
            console.error('Failed to toggle pause', err);
            alert('Erro ao pausar IA.');
        }
    };

    // --- 1. Set Instance Name Directly ---
    useEffect(() => {
        if (!user) return; // Wait for user

        if (requestedInstanceName) {
            setInstanceName(requestedInstanceName);
            setNoInstance(false);
            return;
        }

        fetch('/api/instance', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then(res => {

                return res.json();
            })
            .then(data => {

                // Fix: Check for 'instance_name' (DB column style) as well as 'instanceName'
                const name = data?.instanceName || data?.instance_name || data?.instance?.instanceName || data?.instance?.instance_name;

                if (name) {
                    setInstanceName(name);
                } else {
                    console.warn('LiveChat DEBUG: No instance name found in response');
                    setNoInstance(true);
                }
            })
            .catch(err => {
                console.error('LiveChat DEBUG: Failed to load instance name:', err);
                setNoInstance(true);
            });
    }, [requestedInstanceName, user, token]);

    // Fetch vendors for org
    useEffect(() => {
        if (!token) return;
        fetch('/api/vendedores', { headers: { 'Authorization': `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : [])
            .then(data => setVendedores(Array.isArray(data) ? data : []))
            .catch(() => { });
    }, [token]);

    // Handle takeover: pause AI + assign vendedor + update CRM lead
    const handleTakeover = async () => {
        if (!activeChat || !instanceName) return;
        const jid = activeChat.remoteJid || activeChat.id;

        // 1. Pause AI
        if (currentAgentId && !isChatPaused) {
            await fetch('/api/chats/toggle-pause', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ agentId: currentAgentId, remoteJid: jid })
            }).catch(() => { });
            setIsChatPaused(true);
        }

        // 2. Assign lead if vendedor selected and lead found
        if (selectedVendedorId && activeLeadId) {
            await fetch(`/api/leads/${activeLeadId}/assign`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ vendedorId: selectedVendedorId })
            }).catch(() => { });
        }

        setShowTakeoverModal(false);
        setSelectedVendedorId('');
    };

    // --- 2. Fetch Chats (Polling) ---
    const fetchChats = useCallback(async () => {
        if (!instanceName) return;
        try {
            const res = await fetch(`/chat/findChats/${instanceName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    "where": {} // Evolution API often takes an empty object or specific query
                })
            });
            if (res.ok) {
                const data = await res.json();
                // Evolution returns an array of chats.
                // We might need to map or filter. For now, assuming raw data is usable or needs minor mapping.
                // Let's assume data is Chat[] or { result: Chat[] }
                const chatList = Array.isArray(data) ? data : (data.result || []);

                // Enhance chats with profile pictures if needed (optional optimization: fetch on view)
                // For now, simple set.
                // Map profilePicUrl to picture for UI compatibility
                const mappedChats = chatList.map((c: any) => {
                    // Extract last message text from the message structure
                    let lastMessageContent = '';
                    if (c.lastMessage?.message) {
                        lastMessageContent =
                            c.lastMessage.message.conversation ||
                            c.lastMessage.message.extendedTextMessage?.text ||
                            c.lastMessage.message.imageMessage?.caption ||
                            (c.lastMessage.message.imageMessage ? '📷 Imagem' : '') ||
                            (c.lastMessage.message.videoMessage ? '🎥 Vídeo' : '') ||
                            (c.lastMessage.message.audioMessage ? '🎵 Áudio' : '') ||
                            (c.lastMessage.message.documentMessage ? '📄 Documento' : '') ||
                            '';
                    }

                    return {
                        ...c,
                        picture: c.profilePicUrl || c.picture,
                        lastMessage: c.lastMessage ? {
                            ...c.lastMessage,
                            content: lastMessageContent,
                            timestamp: c.lastMessage.messageTimestamp || c.lastMessage.timestamp
                        } : undefined
                    };
                });

                // Deduplicate chats by normalized JID (phone number part)
                // Handles Brazilian number variations (with/without 9th digit) and LID chats
                const normalizeJid = (chat: any): string => {
                    const rawJid = chat.remoteJid || chat.id || '';

                    // If it's a LID chat, try to find the linked phone number JID
                    if (rawJid.includes('@lid')) {
                        // Check lastMessage for remoteJidAlt
                        const altJid = chat.lastMessage?.key?.remoteJidAlt;
                        if (altJid && altJid.includes('@s.whatsapp.net')) {
                            return normalizePhonePart(altJid);
                        }
                    }

                    return normalizePhonePart(rawJid);
                };

                const normalizePhonePart = (jid: string): string => {
                    const num = jid.split('@')[0];
                    if (num.startsWith('55') && num.length === 13) {
                        const areaCode = num.slice(2, 4);
                        const mobileDigit = num.slice(4, 5);
                        if (mobileDigit === '9') {
                            return '55' + areaCode + num.slice(5);
                        }
                    }
                    return num;
                };

                const chatMap = new Map<string, any>();

                mappedChats.forEach((chat: any) => {
                    const rawJid = chat.remoteJid || chat.id || '';
                    if (!rawJid) return;

                    // Filter out non-user chats (status updates, newsletters)
                    // ALLOW @lid chats now
                    if (rawJid.includes('status@broadcast') || rawJid.includes('newsletter')) {
                        return;
                    }
                    // If not group, broadcast, or user (s.whatsapp.net OR lid), skip
                    if (!rawJid.includes('@g.us') && !rawJid.includes('@s.whatsapp.net') && !rawJid.includes('@lid')) {
                        return;
                    }

                    const normalizedJid = normalizeJid(chat);
                    const existing = chatMap.get(normalizedJid);

                    const newTimestamp = chat.lastMessage?.timestamp || 0;
                    const existingTimestamp = existing?.lastMessage?.timestamp || 0;

                    // Merge JIDs to ensure we can fetch messages for both
                    const existingJids = existing?.associatedJids || new Set();
                    existingJids.add(rawJid);
                    if (chat.remoteJid) existingJids.add(chat.remoteJid);
                    if (chat.id) existingJids.add(chat.id);

                    const shouldReplace = !existing ||
                        newTimestamp > existingTimestamp ||
                        (newTimestamp === existingTimestamp && rawJid.includes('@s.whatsapp.net') && !existing.remoteJid?.includes('@s.whatsapp.net'));

                    if (shouldReplace) {
                        chatMap.set(normalizedJid, {
                            ...chat,
                            // Prefer @s.whatsapp.net as the primary JID if available in previous or current
                            remoteJid: (rawJid.includes('@s.whatsapp.net') ? rawJid : (existing?.remoteJid?.includes('@s.whatsapp.net') ? existing.remoteJid : (chat.remoteJid || rawJid))),
                            associatedJids: existingJids
                        });
                    } else {
                        // Just update the JIDs set on the existing entry
                        chatMap.set(normalizedJid, {
                            ...existing,
                            associatedJids: existingJids
                        });
                    }
                });

                const deduplicatedChats = Array.from(chatMap.values());

                setChats(deduplicatedChats);

                // Fetch temperatures in bulk for active chats
                if (deduplicatedChats.length > 0) {
                    const jids = deduplicatedChats.map(c => c.remoteJid || c.id).filter(Boolean);
                    fetch(`/api/chat-context/bulk/${instanceName}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ jids })
                    })
                        .then(r => r.ok ? r.json() : {})
                        .then(data => setChatTemperatures(data))
                        .catch(() => { });
                }
            }
        } catch (error) {
            console.error('Failed to fetch chats:', error);
        }
    }, [instanceName, token]);

    useEffect(() => {
        if (instanceName) {
            setIsLoadingChats(true);
            fetchChats().finally(() => setIsLoadingChats(false));

            // Poll every 30 seconds for chat list updates
            chatPollingRef.current = setInterval(fetchChats, 30000);
        }
        return () => {
            if (chatPollingRef.current) clearInterval(chatPollingRef.current);
        };
    }, [instanceName, fetchChats]);


    // --- 3. Fetch Messages (Polling when chat active) ---
    const fetchMessages = useCallback(async () => {
        if (!instanceName || !activeChat) return;

        // Helper to get JID variations (12 and 13 digits) for Brazilian numbers
        // AND include any associated JIDs (like LIDs)
        const getJidVariations = (jid: string, associated: Set<string> | undefined): string[] => {
            const variations = new Set<string>();
            if (associated) {
                associated.forEach(j => variations.add(j));
            }
            variations.add(jid);

            // Generate 9-digit variations for any phone number JIDs found
            Array.from(variations).forEach(v => {
                const numPart = v.split('@')[0];
                const suffix = v.split('@')[1] || 's.whatsapp.net';

                if (suffix === 's.whatsapp.net' && numPart.startsWith('55')) {
                    const areaCode = numPart.slice(2, 4);
                    const rest = numPart.slice(4);

                    if (rest.length === 8) {
                        variations.add(`55${areaCode}9${rest}@${suffix}`);
                    } else if (rest.length === 9 && rest.startsWith('9')) {
                        variations.add(`55${areaCode}${rest.slice(1)}@${suffix}`);
                    }
                }
            });

            return Array.from(variations);
        };

        try {
            const jid = activeChat.remoteJid || activeChat.id;
            const jidsToFetch = getJidVariations(jid, activeChat.associatedJids);

            // Fetch messages for all JID variations
            const responses = await Promise.all(jidsToFetch.map(targetJid =>
                fetch(`/chat/findMessages/${instanceName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        "where": {
                            "key": {
                                "remoteJid": targetJid
                            }
                        },
                        "options": {
                            "limit": 50,
                            "order": "DESC"
                        }
                    })
                }).then(res => res.ok ? res.json() : null)
            ));

            let allMessages: any[] = [];
            let errorCount = 0;

            responses.forEach(data => {
                if (!data) {
                    errorCount++;
                    return;
                }

                let fetched: any[] = [];
                if (Array.isArray(data)) {
                    fetched = data;
                } else if (data?.messages?.records && Array.isArray(data.messages.records)) {
                    fetched = data.messages.records;
                } else if (data?.messages && Array.isArray(data.messages)) {
                    fetched = data.messages;
                } else if (data?.records && Array.isArray(data.records)) {
                    fetched = data.records;
                } else if (data?.result && Array.isArray(data.result)) {
                    fetched = data.result;
                }
                allMessages = [...allMessages, ...fetched];
            });

            if (errorCount === jidsToFetch.length && allMessages.length === 0) {
                setFetchError(`API Error`);
            } else {
                setFetchError(null);

                // Deduplicate messages by ID
                const uniqueMessages = new Map();
                allMessages.forEach(msg => {
                    if (msg.key?.id) {
                        uniqueMessages.set(msg.key.id, msg);
                    }
                });

                const finalMessages = Array.from(uniqueMessages.values());

                // Map messages to include profile pictures from participants
                const enhancedMessages = finalMessages.map((msg: any) => {
                    if (msg.key?.participant && !msg.key.fromMe) {
                        return {
                            ...msg,
                            profilePicUrl: msg.participant?.profilePicUrl || msg.participant?.imgUrl || null
                        };
                    }
                    return msg;
                });

                // Sort by timestamp asc for display
                const sorted = enhancedMessages.sort((a: any, b: any) => {
                    const tA = Number(a.messageTimestamp || 0);
                    const tB = Number(b.messageTimestamp || 0);
                    return tA - tB; // Ascending order
                });

                // Check if we need to update state (avoid unneeded renders)
                setMessages(prev => {
                    if (prev.length === sorted.length && prev[prev.length - 1]?.key?.id === sorted[sorted.length - 1]?.key?.id) {
                        return prev;
                    }
                    return sorted;
                });
            }
        } catch (error: any) {
            console.error('Failed to fetch messages:', error);
            setFetchError(`Net Error: ${error.message}`);
        }
    }, [instanceName, activeChat, messages.length]);

    useEffect(() => {
        if (activeChat) {
            // setIsLoadingMessages(true); // Unused state
            fetchMessages().finally(() => {
                // setIsLoadingMessages(false);
                scrollToBottom();
            });

            // Poll every 10 seconds for new messages in active chat
            messagePollingRef.current = setInterval(fetchMessages, 10000);
        } else {
            setMessages([]);
        }
        return () => {
            if (messagePollingRef.current) clearInterval(messagePollingRef.current);
        };
    }, [activeChat, fetchMessages]);


    // --- 4. Send Message ---
    const handleSendMessage = async () => {
        if (!newMessage.trim() || !instanceName || !activeChat) return;

        const messageContent = newMessage.trim();
        setNewMessage(''); // 1. Immediate Clear Input

        // 2. Create Temporary Message Object for Immediate Feedback (Optimistic UI)
        const tempId = 'temp-' + Date.now();
        const optimisticMsg: Message = {
            id: tempId,
            key: {
                id: tempId,
                remoteJid: activeChat.remoteJid || activeChat.id,
                fromMe: true
            },
            message: {
                conversation: messageContent,
                // Add fallback for structure consistency
                extendedTextMessage: { text: messageContent }
            },
            messageTimestamp: Math.floor(Date.now() / 1000),
            status: 'PENDING',
            pushName: 'Eu'
        };

        // 3. Update State Immediately
        setMessages(prev => [...prev, optimisticMsg]);

        try {
            const res = await fetch(`/api/chat/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceName,
                    agentId: currentAgentId, // Pass agentId for logging
                    number: activeChat.remoteJid || activeChat.id,
                    text: messageContent,
                    options: { delay: 1200 }
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                console.error('Send Error:', errData);
                throw new Error('Failed to send');
            }

            // 4. Use API Response to Update State
            const sentMessageData = await res.json();

            if (sentMessageData && sentMessageData.key) {
                // Replace the optimistic message with the real one
                setMessages(prev => prev.map(m => m.id === tempId ? sentMessageData : m));
            } else {
                // If API doesn't return the full message, keep optimistic and just fetch
                fetchMessages();
            }

        } catch (error) {
            console.error('Failed to send message:', error);
            // Revert state on failure
            setMessages(prev => prev.filter(m => m.id !== tempId));
            alert('Falha ao enviar mensagem.');
            setNewMessage(messageContent); // Restore input
        }
    };

    // --- Send Image ---
    const handleSendImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !instanceName || !activeChat) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Por favor, selecione uma imagem válida.');
            return;
        }

        setIsUploadingFile(true);

        try {
            // Convert to base64
            const base64 = await fileToBase64(file);

            const res = await fetch(`/api/chat/send-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceName,
                    agentId: currentAgentId,
                    number: activeChat.remoteJid || activeChat.id,
                    mediatype: 'image',
                    media: base64,
                    fileName: file.name,
                    caption: ''
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                console.error('Send image error:', {
                    status: res.status,
                    statusText: res.statusText,
                    error: errorData
                });
                throw new Error(`Failed to send image: ${res.status} - ${JSON.stringify(errorData)}`);
            }

            // Wait for Evolution API to process the message
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Refresh messages multiple times to ensure the sent image appears
            await fetchMessages();
            setTimeout(() => fetchMessages(), 1000);
            setTimeout(() => fetchMessages(), 2000);
        } catch (error) {
            console.error('Failed to send image:', error);
            const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
            alert(`Falha ao enviar imagem: ${errorMsg}`);
        } finally {
            setIsUploadingFile(false);
            // Reset input
            if (imageInputRef.current) {
                imageInputRef.current.value = '';
            }
        }
    };

    // --- Send File ---
    const handleSendFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !instanceName || !activeChat) return;

        setIsUploadingFile(true);

        try {
            // Convert to base64
            const base64 = await fileToBase64(file);

            // Determine media type
            let mediatype = 'document';
            if (file.type.startsWith('video/')) {
                mediatype = 'video';
            } else if (file.type.startsWith('audio/')) {
                mediatype = 'audio';
            }

            const res = await fetch(`/api/chat/send-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceName,
                    agentId: currentAgentId,
                    number: activeChat.remoteJid || activeChat.id,
                    mediatype,
                    media: base64,
                    fileName: file.name
                })
            });

            if (!res.ok) {
                throw new Error('Failed to send file');
            }

            // Wait for Evolution API to process the message
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Refresh messages multiple times to ensure the sent file appears
            await fetchMessages();
            setTimeout(() => fetchMessages(), 1000);
            setTimeout(() => fetchMessages(), 2000);
        } catch (error) {
            console.error('Failed to send file:', error);
            alert('Falha ao enviar arquivo.');
        } finally {
            setIsUploadingFile(false);
            // Reset input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    // Helper function to convert file to base64
    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const result = reader.result as string;
                // Remove data:image/png;base64, prefix - Evolution API expects pure base64
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    };


    // --- 5. Auto Scroll ---
    const scrollToBottom = () => {
        if (messagesContainerRef.current) {
            const { scrollHeight, clientHeight } = messagesContainerRef.current;
            messagesContainerRef.current.scrollTop = scrollHeight - clientHeight;
        }
    };

    // Trigger scroll on new messages
    // Use useLayoutEffect or simple timeout to ensure DOM is ready
    useEffect(() => {
        // slight delay to allow layout painting
        const timeoutId = setTimeout(scrollToBottom, 50);
        return () => clearTimeout(timeoutId);
    }, [messages]);


    // --- 6. Helpers ---
    const formatTime = (timestamp: number | string) => {
        if (!timestamp) return '';
        // Handle seconds vs milliseconds
        const date = new Date(typeof timestamp === 'number' && timestamp < 10000000000 ? timestamp * 1000 : timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getTemperatureBadgeClass = (temperature?: string) => {
        if (!temperature) return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300';
        if (temperature.includes('Quente')) return 'border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300';
        if (temperature.includes('Morno')) return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300';
        return 'border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300';
    };




    const renderMessageContent = (msg: Message, isMe = false) => {
        // Debug: Log the entire message structure









        const textContent = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption;

        // Render image
        if (msg.message?.imageMessage) {


            let imageUrl = msg.message.imageMessage.url ||
                msg.message.imageMessage.mediaUrl ||
                msg.message.imageMessage.directPath ||
                (msg.message.imageMessage.base64 ? `data:image/jpeg;base64,${msg.message.imageMessage.base64}` : null);

            // If URL is from WhatsApp CDN, use our proxy to bypass CORS
            if (imageUrl && imageUrl.includes('mmg.whatsapp.net')) {
                imageUrl = `/api/media-proxy?url=${encodeURIComponent(imageUrl)}`;
            }



            return (
                <div className="flex flex-col gap-3">
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt="Imagem"
                            className="max-h-[360px] w-full max-w-full rounded-[20px] object-cover transition-opacity hover:opacity-90"
                            onClick={() => window.open(imageUrl, '_blank')}
                            onError={() => console.error('Image load error. URL:', imageUrl, 'Full data:', msg.message.imageMessage)}
                        />
                    ) : (
                        <div className="text-gray-500">📷 Imagem (URL não disponível)</div>
                    )}
                    {textContent && <div className="mt-1">{textContent}</div>}
                </div>
            );
        }

        // Render audio
        if (msg.message?.audioMessage) {


            let audioUrl = msg.message.audioMessage.url ||
                msg.message.audioMessage.mediaUrl ||
                msg.message.audioMessage.directPath ||
                (msg.message.audioMessage.base64 ? `data:audio/ogg;base64,${msg.message.audioMessage.base64}` : null);

            // If URL is from WhatsApp CDN, use our proxy to bypass CORS
            if (audioUrl && audioUrl.includes('mmg.whatsapp.net')) {
                audioUrl = `/api/media-proxy?url=${encodeURIComponent(audioUrl)}`;
            }



            return (
                <div className="flex min-w-[220px] max-w-full flex-col gap-3">
                    {audioUrl ? (
                        <audio controls className="max-w-full rounded-2xl">
                            <source src={audioUrl} type="audio/ogg" />
                            <source src={audioUrl} type="audio/mpeg" />
                            <source src={audioUrl} type="audio/mp4" />
                            Seu navegador não suporta áudio.
                        </audio>
                    ) : (
                        <div className="text-gray-500">🎵 Áudio (URL não disponível)</div>
                    )}
                </div>
            );
        }

        // Render video
        if (msg.message?.videoMessage) {
            const videoUrl = msg.message.videoMessage.url ||
                (msg.message.videoMessage.base64 ? `data:video/mp4;base64,${msg.message.videoMessage.base64}` : null);

            return (
                <div className="flex flex-col gap-3">
                    {videoUrl ? (
                        <video controls className="max-h-[360px] max-w-full rounded-[20px]">
                            <source src={videoUrl} type="video/mp4" />
                            Seu navegador não suporta vídeo.
                        </video>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span>🎥</span>
                            <span>Vídeo</span>
                        </div>
                    )}
                    {textContent && <div className="mt-1">{textContent}</div>}
                </div>
            );
        }

        // Render document
        if (msg.message?.documentMessage) {
            const docUrl = msg.message.documentMessage.url;
            const fileName = msg.message.documentMessage.fileName || 'Documento';

            return (
                <div className={cn('flex items-center gap-3 rounded-[20px] border p-3', isMe ? 'border-white/15 bg-black/10' : 'border-black/[0.06] bg-black/[0.03] dark:border-white/[0.08] dark:bg-white/[0.04]')}>
                    <div className="text-2xl">📄</div>
                    <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{fileName}</div>
                        {docUrl && (
                            <a
                                href={docUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs underline hover:no-underline"
                            >
                                Baixar
                            </a>
                        )}
                    </div>
                </div>
            );
        }

        // Default: render text
        return <div className="whitespace-pre-wrap break-words">{textContent || '...'}</div>;
    };

    const getDisplayName = (chat: Chat) => {
        if (chat.name) return chat.name;
        if (chat.pushName) return chat.pushName;

        // Format JID to phone number
        const jid = chat.remoteJid || chat.id;
        if (!jid) return 'Desconhecido';

        const number = jid.split('@')[0];

        // Basic Brazil formatting (DDI + DDD + Number)
        // Example: 554792938927 -> +55 (47) 9293-8927
        if (number.length >= 10) { // Assuming typical length
            // Flexible formatting logic
            if (number.startsWith('55') && number.length === 12) { // 55 47 9123 4567 (12 chars ? no 55 47 9 1234 5678 is 13)
                // 55 47 99989 2596 (13 digits)
                return `+${number.slice(0, 2)} (${number.slice(2, 4)}) ${number.slice(4, 9)}-${number.slice(9)}`;
            }
            if (number.startsWith('55') && number.length === 13) {
                return `+${number.slice(0, 2)} (${number.slice(2, 4)}) ${number.slice(4, 9)}-${number.slice(9)}`;
            }
            // Generic fallback
            return `+${number}`;
        }

        return number;
    };

    const sellerConversationKeys = sellerId
        ? sellerConversations.reduce((accumulator, conversation) => {
            if (instanceName && conversation.instanceName && conversation.instanceName !== instanceName) {
                return accumulator;
            }

            buildScopeKeys([conversation.remoteJid, conversation.phone]).forEach((key) => accumulator.add(key));
            return accumulator;
        }, new Set<string>())
        : new Set<string>();

    const scopedChats = sellerId
        ? chats.filter((chat) => {
            const chatKeys = buildChatScopeKeys(chat);
            return Array.from(chatKeys).some((key) => sellerConversationKeys.has(key));
        })
        : chats;

    const filteredChats = scopedChats.filter((chat) =>
        getDisplayName(chat).toLowerCase().includes(searchQuery.toLowerCase())
    );

    const activeChatKey = activeChat?.remoteJid || activeChat?.id || null;

    useEffect(() => {
        if (!sellerId || !activeChat) return;

        const chatStillVisible = scopedChats.some((chat) => (chat.remoteJid || chat.id) === (activeChat.remoteJid || activeChat.id));
        if (!chatStillVisible) {
            setActiveChat(null);
        }
    }, [sellerId, scopedChats, activeChat]);

    useEffect(() => {
        if (!requestedJid || requestedChatSelectionRef.current || filteredChats.length === 0) return;

        const requestedKeys = buildScopeKeys([requestedJid]);
        const targetChat = filteredChats.find((chat) => {
            const chatKeys = buildChatScopeKeys(chat);
            return Array.from(chatKeys).some((key) => requestedKeys.has(key));
        });

        if (targetChat) {
            setActiveChat(targetChat);
            requestedChatSelectionRef.current = true;
        }
    }, [requestedJid, filteredChats]);

    if (!instanceName) {
        if (noInstance) {
            return (
                <div className="flex h-full min-h-[70vh] items-center justify-center px-4 py-8">
                    <div className="w-full max-w-xl overflow-hidden rounded-[32px] border border-black/[0.06] bg-white/[0.9] p-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.10)] dark:border-white/[0.08] dark:bg-[#111111] dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] bg-gradient-primary text-white shadow-[0_18px_40px_rgba(245,121,59,0.28)]">
                            <MessageSquare size={34} />
                        </div>
                        <h2 className="mt-6 text-3xl font-display font-bold tracking-tight text-gray-900 dark:text-white">
                            Nenhuma conexao encontrada
                        </h2>
                        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-gray-500 dark:text-gray-400">
                            Conecte seu WhatsApp para acompanhar conversas em tempo real e operar o atendimento em uma interface mais clara.
                        </p>
                        <a
                            href="/whatsapp"
                            className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(245,121,59,0.34)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_45px_rgba(245,121,59,0.4)]"
                        >
                            <Sparkles size={16} />
                            Conectar WhatsApp
                        </a>
                    </div>
                </div>
            );
        }
        return (
            <div className="flex h-full min-h-[70vh] items-center justify-center px-4 py-8">
                <div className="flex w-full max-w-sm flex-col items-center rounded-[28px] border border-black/[0.06] bg-white/80 px-6 py-10 text-center shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-white/[0.08] dark:bg-[#111111] dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-primary text-white shadow-[0_18px_40px_rgba(245,121,59,0.28)]">
                        <Loader2 size={28} className="animate-spin" />
                    </div>
                    <h2 className="mt-6 text-2xl font-display font-bold tracking-tight text-gray-900 dark:text-white">
                        Carregando chat
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-gray-500 dark:text-gray-400">
                        Estamos preparando sua conexao e buscando as conversas mais recentes.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="relative flex h-full min-h-[calc(100vh-128px)] w-full overflow-hidden rounded-[30px] border border-black/[0.06] bg-white/[0.92] shadow-[0_24px_80px_rgba(15,23,42,0.10)] dark:border-white/[0.08] dark:bg-[#0F0F10] dark:shadow-[0_28px_90px_rgba(0,0,0,0.42)]" data-tour-id="tour-live-chat-layout">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,121,59,0.10),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.06),_transparent_32%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(245,121,59,0.12),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.04),_transparent_28%)]" />

                <div className="relative z-10 flex h-full min-w-[350px] w-[350px] flex-none flex-col border-r border-black/[0.06] bg-white/[0.94] dark:border-white/[0.08] dark:bg-[#121212] xl:min-w-[380px] xl:w-[380px]">
                    <div className="border-b border-black/[0.06] px-5 pb-4 pt-5 dark:border-white/[0.08]">
                        <div className="inline-flex items-center gap-2 rounded-full border border-primary/[0.15] bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary dark:border-primary/20 dark:bg-primary/[0.12]">
                            <Sparkles size={13} />
                            {sellerId ? 'Atendimento do vendedor' : 'Atendimento ao vivo'}
                        </div>
                        <div className="mt-4 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-2xl font-display font-bold tracking-tight text-gray-900 dark:text-white">Conversas</h2>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    {sellerId
                                        ? 'Live Chat existente filtrado para o vendedor e a linha selecionada.'
                                        : 'Monitore conversas e responda com mais contexto.'}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-black/[0.06] bg-white/80 px-3 py-2 text-right dark:border-white/[0.08] dark:bg-white/[0.04]">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Ativas</p>
                                <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{filteredChats.length}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex-none px-4 py-4">
                        <div className="flex h-11 items-center rounded-2xl border border-black/[0.06] bg-gray-50/80 px-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)] dark:border-white/[0.08] dark:bg-[#1B1B1D]">
                            <Search size={18} className="mr-3 text-gray-500 dark:text-gray-400" />
                            <input
                                type="text"
                                placeholder="Pesquisar..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full border-none bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-500 dark:text-white"
                            />
                            {searchQuery && (
                                <X
                                    size={16}
                                    className="ml-2 cursor-pointer text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                    onClick={() => setSearchQuery('')}
                                />
                            )}
                        </div>
                    </div>

                    <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3 custom-scrollbar">
                        {((isLoadingChats && chats.length === 0) || (sellerId && isLoadingSellerScope && scopedChats.length === 0)) ? (
                            <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">Carregando conversas...</div>
                        ) : filteredChats.length === 0 ? (
                            <div className="rounded-[24px] border border-dashed border-black/[0.08] bg-white/70 px-4 py-10 text-center text-sm text-gray-500 dark:border-white/[0.10] dark:bg-white/[0.03] dark:text-gray-400">
                                {sellerId
                                    ? 'Nenhuma conversa deste vendedor foi encontrada nesta linha ou busca.'
                                    : 'Nenhuma conversa encontrada para essa busca.'}
                            </div>
                        ) : (
                            filteredChats.map((chat) => {
                                const chatKey = chat.remoteJid || chat.id;
                                const temperature = chatTemperatures[chatKey]?.temperature;
                                const isActive = activeChatKey === chatKey;

                                return (
                                <button
                                    key={chat.id || chat.remoteJid}
                                    onClick={() => setActiveChat(chat)}
                                    className={cn(
                                        'w-full rounded-[24px] border p-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]',
                                        isActive
                                            ? 'border-primary/20 bg-primary/[0.08] shadow-[0_14px_34px_rgba(245,121,59,0.12)] dark:border-primary/30 dark:bg-primary/[0.10]'
                                            : 'border-transparent bg-transparent hover:border-black/[0.06] hover:bg-white dark:hover:border-white/[0.08] dark:hover:bg-white/[0.04]'
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                    <div className="h-12 w-12 overflow-hidden rounded-full bg-gray-700 shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
                                        {(chat.picture) ? (
                                            <img src={chat.picture} alt={chat.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xl font-bold bg-[#333]">
                                                {getDisplayName(chat)[0].toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="mb-1 flex items-start justify-between gap-3">
                                            <div className="min-w-0 pr-2">
                                                <h3 className="truncate text-[16px] font-medium text-gray-900 dark:text-white font-display">{getDisplayName(chat)}</h3>
                                                {temperature && (
                                                    <span className={cn('mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]', getTemperatureBadgeClass(temperature))}>
                                                        {temperature}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="whitespace-nowrap pt-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                                {chat.lastMessage?.timestamp ? formatTime(chat.lastMessage.timestamp) : ''}
                                            </span>
                                        </div>
                                        <p className="truncate text-sm leading-6 text-gray-500 dark:text-gray-400 font-body">
                                            {chat.lastMessage?.content || '...'}
                                        </p>
                                        {chat.unreadCount ? (
                                            <div className="mt-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 text-[11px] font-semibold text-white shadow-[0_10px_24px_rgba(245,121,59,0.24)]">
                                                {chat.unreadCount}
                                            </div>
                                        ) : null}
                                    </div>
                                    </div>
                                </button>
                            )})
                        )}
                    </div>
                </div>

                <div className="relative z-10 flex min-w-0 flex-1 flex-col bg-[#F7F7F8] dark:bg-[#0D0D0F]">
                    {activeChat ? (
                        <>
                            {/* Chat Header */}
                            <div className="flex-none border-b border-black/[0.06] bg-white/[0.8] px-5 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur dark:border-white/[0.08] dark:bg-[#161618]/90">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <h2 className="truncate text-xl font-display font-bold tracking-tight text-gray-900 dark:text-white">
                                                {getDisplayName(activeChat)}
                                            </h2>
                                            {activeLeadTemp && (
                                                <span className={cn(
                                                    'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
                                                    getTemperatureBadgeClass(activeLeadTemp)
                                                )}>
                                                    {activeLeadTemp} {activeLeadScore > 0 ? `(${activeLeadScore}%)` : ''}
                                                </span>
                                            )}
                                            {isChatPaused && (
                                                <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                                                    IA pausada
                                                </span>
                                            )}
                                            {(activeLeadSummary?.needsHumanAttention || activeFollowupStatus?.needs_human_attention) && (
                                                <span className="inline-flex items-center gap-2 rounded-full border border-red-200/80 bg-red-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                                                    Atencao humana
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-2 truncate text-sm text-gray-500 dark:text-gray-400">
                                            {activeChat.remoteJid || activeChat.id}
                                        </p>
                                    </div>

                                <div className="flex flex-wrap gap-3 text-gray-500 dark:text-gray-400 items-center">
                                    {/* Pause Button */}
                                    {currentAgentId && (
                                        <button
                                            onClick={handleToggleChatPause}
                                            className={`inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-all duration-300 ${isChatPaused
                                                ? 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200'
                                                : 'border border-black/[0.06] bg-white text-gray-700 hover:border-primary/25 hover:text-primary dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300'
                                                }`}
                                            title={isChatPaused ? "IA Pausada nesta conversa" : "Pausar IA nesta conversa"}
                                        >
                                            {isChatPaused ? <Play size={16} /> : <Pause size={16} />}
                                            {isChatPaused ? 'Retomar IA' : 'Pausar IA'}
                                        </button>
                                    )}

                                    {/* Takeover Button */}
                                    <button
                                        onClick={() => setShowTakeoverModal(true)}
                                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-primary/20 bg-primary/10 px-4 text-sm font-semibold text-primary transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary/15"
                                        title="Assumir conversa e atribuir vendedor"
                                    >
                                        <UserCheck size={16} />
                                        Assumir
                                    </button>
                                </div>
                                </div>
                            </div>

                            <div className="min-h-0 flex flex-1">
                                <div className="flex min-w-0 flex-1 flex-col">
                            {/* Messages Area */}
                            <div ref={messagesContainerRef} className="relative flex-1 overflow-y-auto scroll-smooth bg-[#F7F7F8] px-5 py-5 dark:bg-[#0D0D0F]">
                                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,121,59,0.08),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.06),_transparent_26%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(245,121,59,0.12),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.04),_transparent_24%)]" />
                                <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-5 pb-4">
                                    <div className="xl:hidden">
                                        <ConversationInsightsPanel
                                            activeChat={activeChat}
                                            activeLeadTemp={activeLeadTemp}
                                            activeLeadScore={activeLeadScore}
                                            activeLeadSummary={activeLeadSummary}
                                            activeFollowupStatus={activeFollowupStatus}
                                            currentAgentId={currentAgentId}
                                            isChatPaused={isChatPaused}
                                            messages={messages}
                                        />
                                    </div>
                                {/* Handoff Banner — shown when AI is paused (may be auto-handoff or manual) */}
                                {isChatPaused && (
                                    <div className="mb-2 flex items-start gap-3 rounded-[24px] border border-amber-500/30 bg-amber-500/10 p-4 shadow-[0_12px_26px_rgba(245,158,11,0.10)]">
                                        <span className="text-2xl flex-shrink-0">🤝</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-amber-500">Handoff Humano Ativo</p>
                                            <p className="mt-0.5 text-xs leading-relaxed text-amber-400/80">
                                                A conversa esta em modo manual. O time humano pode assumir daqui com o contexto montado pela IA e retomar o fluxo quando fizer sentido.
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleToggleChatPause}
                                            className="inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-2xl bg-amber-500 px-4 text-xs font-bold text-white transition-colors hover:bg-amber-400"
                                        >
                                            <Play size={12} /> Retomar IA
                                        </button>
                                    </div>
                                )}

                                {fetchError && (
                                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                                        Falha ao carregar: {fetchError}
                                    </div>
                                )}

                                {messages.length === 0 && !fetchError && (
                                    <div className="rounded-[28px] border border-dashed border-black/[0.08] bg-white/70 px-6 py-12 text-center text-sm text-gray-400 dark:border-white/[0.10] dark:bg-white/[0.03]">
                                        Nenhuma mensagem encontrada.
                                        <br /><span className="text-xs text-gray-300">Envie uma mensagem para iniciar.</span>
                                    </div>
                                )}

                                <div className="flex w-full flex-col gap-4 pb-2">
                                    {messages.map((msg, index) => {
                                        // 1. Logic Defense from Senior Engineer: Guard against malformed objects
                                        if (!msg || !msg.key) {
                                            console.warn('DEBUG: Invalid message object skipped:', msg);
                                            return null;
                                        }

                                        // 2. Filter out reaction messages (they appear as empty bubbles)
                                        if (msg.message?.reactionMessage) {
                                            return null;
                                        }


                                        // Note: We no longer filter out messages with empty text
                                        // because getMessageText() now returns placeholders for media messages

                                        const isMe = msg.key.fromMe || false;
                                        // ALWAYS include index to guarantee uniqueness
                                        const messageKey = `${msg.key.id || 'msg'}-${msg.messageTimestamp || Date.now()}-${index}`;

                                        return (
                                            <div key={messageKey} className={cn('flex w-full', isMe ? 'justify-end' : 'justify-start')}>
                                                <div className={cn('flex max-w-[min(84%,760px)] items-end gap-3', isMe ? 'flex-row-reverse' : 'flex-row')}>
                                                    {!isMe && (
                                                        <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gray-700 shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
                                                            {msg.profilePicUrl ? (
                                                                <img src={msg.profilePicUrl} alt={msg.pushName || 'Contato'} className="h-full w-full object-cover" />
                                                            ) : (
                                                                <div className="flex h-full w-full items-center justify-center bg-[#555] text-xs font-bold text-white">
                                                                    {(msg.pushName || 'U')[0].toUpperCase()}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    <div className={cn('flex min-w-0 flex-col', isMe ? 'items-end' : 'items-start')}>
                                                        {!isMe && msg.pushName && (
                                                            <div className="mb-1.5 ml-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                                                                {msg.pushName}
                                                            </div>
                                                        )}

                                                        <div
                                                            className={cn(
                                                                'min-w-[96px] rounded-[26px] px-4 py-3 text-sm shadow-[0_14px_34px_rgba(15,23,42,0.08)] transition-all duration-300',
                                                                isMe
                                                                    ? 'rounded-br-md bg-gradient-to-br from-[#FF8A4C] via-[#F5793B] to-[#EF6C2F] text-white'
                                                                    : 'rounded-bl-md border border-black/[0.06] bg-white text-gray-900 dark:border-white/[0.08] dark:bg-[#1E1E21] dark:text-white'
                                                            )}
                                                        >
                                                            <div className="font-body text-[15px] leading-7 break-words">
                                                                {renderMessageContent(msg, isMe)}
                                                            </div>
                                                            <div className={cn(
                                                                'mt-3 flex items-center justify-end gap-1 text-[11px]',
                                                                isMe ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'
                                                            )}>
                                                                {formatTime(msg.messageTimestamp)}
                                                                {isMe && (
                                                                    <span className={msg.status === 'READ' ? 'text-blue-200' : ''}>
                                                                        <CheckCheck size={14} />
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                </div>
                            </div>

                            {/* Input Area */}
                            <div className="flex-none border-t border-black/[0.06] bg-white/[0.86] px-5 py-4 backdrop-blur dark:border-white/[0.08] dark:bg-[#151517]/92">
                                {/* Hidden file inputs */}
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleSendImage}
                                    className="hidden"
                                />
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    onChange={handleSendFile}
                                    className="hidden"
                                />

                                <div className="mx-auto flex w-full max-w-5xl items-center gap-4">
                                    <button
                                        className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-black/[0.06] bg-white text-gray-500 transition-colors hover:text-gray-900 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-400 dark:hover:text-white ${isUploadingFile ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        onClick={() => !isUploadingFile && fileInputRef.current?.click()}
                                        type="button"
                                    >
                                        <Paperclip size={20} />
                                    </button>
                                <div className="flex h-14 flex-1 items-center rounded-[22px] border border-black/[0.06] bg-white px-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] dark:border-white/[0.08] dark:bg-[#1E1E21]">
                                    {isUploadingFile ? (
                                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#F5793B] border-t-transparent"></div>
                                            Enviando arquivo...
                                        </div>
                                    ) : (
                                        <input
                                            type="text"
                                            placeholder="Digite uma mensagem"
                                            className="w-full border-none bg-transparent font-body text-sm text-gray-900 outline-none placeholder:text-gray-500 dark:text-white"
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                        />
                                    )}
                                </div>
                                <button
                                    onClick={handleSendMessage}
                                    disabled={isUploadingFile}
                                    className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-[0_18px_40px_rgba(245,121,59,0.34)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_45px_rgba(245,121,59,0.4)] active:scale-95 ${isUploadingFile ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <Send size={20} />
                                </button>
                                </div>
                            </div>

                                </div>

                                <aside className="hidden w-[360px] flex-col border-l border-black/[0.06] bg-white/[0.72] dark:border-white/[0.08] dark:bg-[#141416]/92 xl:flex">
                                    <div className="border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.08]">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Revenue OS</p>
                                                <h3 className="mt-2 text-lg font-display font-bold tracking-tight text-gray-900 dark:text-white">Contexto da conversa</h3>
                                            </div>
                                            <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                                                <Bot size={12} />
                                                Ao vivo
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto px-4 py-4">
                                        <ConversationInsightsPanel
                                            activeChat={activeChat}
                                            activeLeadTemp={activeLeadTemp}
                                            activeLeadScore={activeLeadScore}
                                            activeLeadSummary={activeLeadSummary}
                                            activeFollowupStatus={activeFollowupStatus}
                                            currentAgentId={currentAgentId}
                                            isChatPaused={isChatPaused}
                                            messages={messages}
                                        />
                                    </div>
                                </aside>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
                            <div className="w-64 h-64 mb-8 opacity-20">
                                {/* Placeholder Illustration */}
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="w-full h-full text-gray-400 dark:text-gray-500">
                                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                                </svg>
                            </div>
                            <h1 className="mb-4 text-3xl font-display font-bold tracking-tight text-gray-900 dark:text-white">Kogna Live Chat</h1>
                            <p className="max-w-md text-sm leading-7 text-gray-500 dark:text-gray-400">
                                Envie e receba mensagens sem precisar manter seu celular conectado à internet.
                            </p>
                            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/70 px-3 py-1.5 text-xs text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.04]">
                                <LockIcon size={12} />
                                Protegido com criptografia de ponta a ponta
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {showTakeoverModal && <TakeoverModal vendedores={vendedores} selectedId={selectedVendedorId} onSelect={setSelectedVendedorId} onConfirm={handleTakeover} onClose={() => setShowTakeoverModal(false)} />}
        </>
    );
}

function ConversationInsightsPanel({
    activeChat,
    activeLeadTemp,
    activeLeadScore,
    activeLeadSummary,
    activeFollowupStatus,
    currentAgentId,
    isChatPaused,
    messages,
}: {
    activeChat: Chat;
    activeLeadTemp: string;
    activeLeadScore: number;
    activeLeadSummary: LeadSummaryData | null;
    activeFollowupStatus: FollowupStatusData | null;
    currentAgentId: string | null;
    isChatPaused: boolean;
    messages: Message[];
}) {
    const lastInboundMessage = [...messages].reverse().find((msg) => msg?.key && !msg.key.fromMe && !msg.message?.reactionMessage) || null;
    const leadPriority = getLeadPriorityMeta(activeLeadTemp, activeLeadScore);
    const automationLabel = isChatPaused ? 'Handoff humano' : currentAgentId ? 'IA ativa' : 'Sem agente';
    const lastContactLabel = formatRelativeMoment(lastInboundMessage?.messageTimestamp ?? activeChat.lastMessage?.timestamp ?? null);
    const summaryText = activeLeadSummary?.text || 'A IA ainda esta consolidando contexto. Continue a conversa para enriquecer o resumo e a recomendacao operacional.';
    const conversationLabel = activeChat.name || activeChat.pushName || activeChat.remoteJid || activeChat.id;
    const followupMeta = activeFollowupStatus ? FOLLOWUP_STATUS_META[activeFollowupStatus.status] || FOLLOWUP_STATUS_META.pending : null;
    const followupScheduleLabel = activeFollowupStatus?.scheduled_at
        ? new Date(activeFollowupStatus.scheduled_at).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        })
        : 'Sem envio agendado';
    const tips = buildRevenueOsTips({
        temperature: activeLeadTemp,
        score: activeLeadScore,
        isChatPaused,
        unreadCount: activeChat.unreadCount,
        summary: activeLeadSummary,
        lastInboundTimestamp: lastInboundMessage?.messageTimestamp ?? activeChat.lastMessage?.timestamp ?? null,
        objection: activeLeadSummary?.topObjection || activeFollowupStatus?.top_objection || activeFollowupStatus?.detected_objection || null,
        needsHumanAttention: activeLeadSummary?.needsHumanAttention || activeFollowupStatus?.needs_human_attention || false,
    });
    const needsHumanAttention = activeLeadSummary?.needsHumanAttention || activeFollowupStatus?.needs_human_attention || false;
    const humanAttentionReason = activeLeadSummary?.humanAttentionReason || activeFollowupStatus?.human_attention_reason || null;
    const humanAttentionSince = activeLeadSummary?.humanAttentionSince || activeFollowupStatus?.human_attention_since || null;
    const topObjection = activeLeadSummary?.topObjection || activeFollowupStatus?.top_objection || activeFollowupStatus?.detected_objection || null;

    const signalCards = [
        {
            label: 'Temperatura',
            value: activeLeadTemp || 'Sem leitura',
            detail: activeLeadScore > 0 ? `${activeLeadScore}% de score` : 'Score em processamento',
            icon: TrendingUp,
        },
        {
            label: 'Automacao',
            value: automationLabel,
            detail: isChatPaused ? 'Operacao manual recomendada' : 'Fluxo automatico ativo',
            icon: Bot,
        },
        {
            label: 'Ultima resposta',
            value: lastContactLabel,
            detail: activeChat.unreadCount ? `${activeChat.unreadCount} mensagem(ns) pendentes` : 'Sem mensagens pendentes',
            icon: Clock3,
        },
        {
            label: 'Sinal comercial',
            value: leadPriority.label,
            detail: leadPriority.description,
            icon: ShieldAlert,
        },
    ];

    return (
        <div className="space-y-4">
            <div className="rounded-[28px] border border-black/[0.06] bg-white/[0.94] p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)] dark:border-white/[0.08] dark:bg-[#171719]">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Lead em foco</p>
                        <h4 className="mt-2 truncate text-lg font-display font-bold tracking-tight text-gray-900 dark:text-white">
                            {conversationLabel}
                        </h4>
                        <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                            {activeChat.remoteJid || activeChat.id}
                        </p>
                    </div>
                    <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', leadPriority.badgeClass)}>
                        {leadPriority.label}
                    </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {signalCards.map((card) => (
                        <div key={card.label} className="rounded-[22px] border border-black/[0.06] bg-[#F8F8FA] p-4 dark:border-white/[0.08] dark:bg-[#111214]">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                                        {card.label}
                                    </p>
                                    <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                                        {card.value}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                                        {card.detail}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-primary/15 bg-primary/[0.08] p-2 text-primary">
                                    <card.icon size={15} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="rounded-[28px] border border-black/[0.06] bg-white/[0.94] p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)] dark:border-white/[0.08] dark:bg-[#171719]">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-2xl border border-primary/15 bg-primary/[0.08] p-2 text-primary">
                        <BrainCircuit size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Resumo da IA</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-500">
                                <Target size={11} />
                                {activeLeadSummary?.stage || 'Em andamento'}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-purple-500">
                                <Lightbulb size={11} />
                                {activeLeadSummary?.intent || 'Em descoberta'}
                            </span>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-gray-700 dark:text-gray-300">
                            {summaryText}
                        </p>

                        {activeLeadSummary?.recommendation && (
                            <div className="mt-4 rounded-[22px] border border-black/[0.06] bg-[#F8F8FA] px-4 py-3 dark:border-white/[0.08] dark:bg-[#111214]">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                                    Proxima acao recomendada
                                </p>
                                <p className="mt-2 text-sm leading-6 text-gray-800 dark:text-gray-200">
                                    {activeLeadSummary.recommendation}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="rounded-[28px] border border-black/[0.06] bg-white/[0.94] p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)] dark:border-white/[0.08] dark:bg-[#171719]">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Revenue OS</p>
                        <h4 className="mt-2 text-lg font-display font-bold tracking-tight text-gray-900 dark:text-white">
                            Prioridade humana e objecoes
                        </h4>
                    </div>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${needsHumanAttention ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300' : 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>
                        {needsHumanAttention ? 'Atencao humana' : 'IA conduzindo'}
                    </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-[22px] border border-black/[0.06] bg-[#F8F8FA] p-4 dark:border-white/[0.08] dark:bg-[#111214]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                            Contexto humano
                        </p>
                        <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                            {humanAttentionReason || (needsHumanAttention ? 'Lead com alta prioridade comercial' : 'Sem alerta pendente')}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                            {humanAttentionSince ? `Sinalizado em ${formatRelativeMoment(humanAttentionSince)}` : 'A IA pode continuar conduzindo enquanto o humano se organiza.'}
                        </p>
                    </div>
                    <div className="rounded-[22px] border border-black/[0.06] bg-[#F8F8FA] p-4 dark:border-white/[0.08] dark:bg-[#111214]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                            Objecao principal
                        </p>
                        <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                            {topObjection || 'Nenhuma objecao dominante mapeada'}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                            Use prova, contexto e CTA clara para destravar esse ponto.
                        </p>
                    </div>
                </div>
            </div>

            <div className="rounded-[28px] border border-black/[0.06] bg-white/[0.94] p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)] dark:border-white/[0.08] dark:bg-[#171719]">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Recovery OS</p>
                        <h4 className="mt-2 text-lg font-display font-bold tracking-tight text-gray-900 dark:text-white">
                            Follow-up da conversa
                        </h4>
                    </div>
                    {followupMeta ? (
                        <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', followupMeta.badgeClass)}>
                            {followupMeta.label}
                        </span>
                    ) : (
                        <span className="inline-flex rounded-full border border-black/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:border-white/[0.08] dark:text-gray-400">
                            Sem recovery ativo
                        </span>
                    )}
                </div>

                {activeFollowupStatus ? (
                    <div className="mt-4 space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-[22px] border border-black/[0.06] bg-[#F8F8FA] p-4 dark:border-white/[0.08] dark:bg-[#111214]">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                                    Sequencia
                                </p>
                                <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                                    {activeFollowupStatus.sequence_name || 'Sequencia automatica'}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                                    {activeFollowupStatus.current_step
                                        ? `Passo ${activeFollowupStatus.current_step}/${activeFollowupStatus.total_steps || activeFollowupStatus.current_step}`
                                        : 'Passo em definicao'}
                                </p>
                            </div>
                            <div className="rounded-[22px] border border-black/[0.06] bg-[#F8F8FA] p-4 dark:border-white/[0.08] dark:bg-[#111214]">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                                    Proximo disparo
                                </p>
                                <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                                    {followupScheduleLabel}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                                    {activeFollowupStatus.pipeline_stage || 'Sem etapa definida'}
                                </p>
                            </div>
                        </div>

                        <div className="rounded-[22px] border border-black/[0.06] bg-[#F8F8FA] p-4 dark:border-white/[0.08] dark:bg-[#111214]">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                                Leitura operacional
                            </p>
                            <p className="mt-2 text-sm leading-7 text-gray-800 dark:text-gray-200">
                                {activeFollowupStatus.next_recommendation
                                    || activeFollowupStatus.followup_trigger_reason
                                    || activeFollowupStatus.lead_summary
                                    || 'Revisar a conversa antes do proximo toque para manter o contexto comercial.'}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {activeFollowupStatus.detected_product_interest && (
                                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-600 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
                                        Produto: {activeFollowupStatus.detected_product_interest}
                                    </span>
                                )}
                                {activeFollowupStatus.detected_objection && (
                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                                        Objecao: {activeFollowupStatus.detected_objection}
                                    </span>
                                )}
                                {activeFollowupStatus.assigned_vendor_name && (
                                    <span className="rounded-full border border-black/[0.06] bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:border-white/[0.08] dark:bg-[#151518] dark:text-gray-300">
                                        Vendedor: {activeFollowupStatus.assigned_vendor_name}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="mt-4 rounded-[22px] border border-dashed border-black/[0.08] bg-[#F8F8FA] px-4 py-4 text-sm text-gray-500 dark:border-white/[0.10] dark:bg-[#111214] dark:text-gray-400">
                        Esta conversa ainda nao entrou em uma sequencia de recuperacao automatica.
                    </div>
                )}
            </div>

            <div className="rounded-[28px] border border-black/[0.06] bg-white/[0.94] p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)] dark:border-white/[0.08] dark:bg-[#171719]">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Playbook</p>
                        <h4 className="mt-2 text-lg font-display font-bold tracking-tight text-gray-900 dark:text-white">
                            Dicas do Revenue OS
                        </h4>
                    </div>
                    <div className="rounded-2xl border border-primary/15 bg-primary/[0.08] p-2 text-primary">
                        <ArrowUpRight size={16} />
                    </div>
                </div>

                <div className="mt-4 space-y-3">
                    {tips.map((tip) => (
                        <div key={tip.title} className="rounded-[22px] border border-black/[0.06] bg-[#F8F8FA] px-4 py-3 dark:border-white/[0.08] dark:bg-[#111214]">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 rounded-full bg-primary/10 p-1.5 text-primary">
                                    <Sparkles size={12} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{tip.title}</p>
                                    <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{tip.body}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

const LockIcon = ({ size }: { size: number }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
);

function TakeoverModal({ vendedores, selectedId, onSelect, onConfirm, onClose }: {
    vendedores: { id: string; nome: string }[];
    selectedId: string;
    onSelect: (id: string) => void;
    onConfirm: () => void;
    onClose: () => void;
}) {
    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
            <div className="w-full max-w-md rounded-[28px] border border-black/[0.06] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.24)] dark:border-white/[0.08] dark:bg-[#171717] dark:shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Takeover</p>
                        <h3 className="mt-2 text-xl font-display font-bold tracking-tight text-gray-900 dark:text-white">Assumir conversa</h3>
                    </div>
                    <button onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-black/[0.07] bg-white/75 text-gray-500 transition-colors hover:text-gray-900 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-400 dark:hover:text-white"><X size={18} /></button>
                </div>
                <p className="text-gray-400 text-sm mb-4">A IA será pausada e o lead atribuído ao vendedor selecionado no CRM.</p>
                <div className="space-y-2 mb-6">
                    {vendedores.length === 0 && <p className="text-gray-500 text-sm">Nenhum vendedor cadastrado.</p>}
                    {vendedores.map(v => (
                        <button
                            key={v.id}
                            onClick={() => onSelect(v.id)}
                            className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-all duration-300 ${selectedId === v.id
                                ? 'border-primary/30 bg-primary/10 text-primary shadow-[0_12px_26px_rgba(245,121,59,0.14)]'
                                : 'border-black/[0.06] bg-white/80 text-gray-800 hover:border-primary/20 hover:bg-primary/[0.04] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white'
                                }`}
                        >
                            {v.nome}
                        </button>
                    ))}
                </div>
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 rounded-2xl border border-black/[0.07] py-3 text-sm font-semibold text-gray-500 transition-colors hover:bg-black/[0.03] hover:text-gray-900 dark:border-white/[0.08] dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-white">Cancelar</button>
                    <button onClick={onConfirm} className="flex-1 rounded-2xl bg-gradient-primary py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(245,121,59,0.30)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_45px_rgba(245,121,59,0.36)]">Confirmar</button>
                </div>
            </div>
        </div>
    );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Search, Paperclip, CheckCheck, X, Play, Pause } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';


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

export function LiveChat() {
    const { user, token } = useAuth();
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
                    if (data.found) {
                        setCurrentAgentId(data.agentId);
                        setIsChatPaused(data.isChatPaused);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch chat context', err);
            }
        };
        fetchContext();
    }, [activeChat, instanceName, user, token]);

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
    }, [user, token]);

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
            }
        } catch (error) {
            console.error('Failed to fetch chats:', error);
        }
    }, [instanceName]);

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



    const renderMessageContent = (msg: Message) => {
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
                <div className="flex flex-col gap-1">
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt="Imagem"
                            className="max-w-[300px] max-h-[400px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
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
                <div className="flex flex-col gap-2">
                    {audioUrl ? (
                        <audio controls className="max-w-[300px]">
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
                <div className="flex flex-col gap-1">
                    {videoUrl ? (
                        <video controls className="max-w-[300px] max-h-[400px] rounded-lg">
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
                <div className="flex items-center gap-3 p-2 bg-white/10 rounded-lg">
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
        return <div>{textContent || '...'}</div>;
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

    if (!instanceName) {
        if (noInstance) {
            return (
                <div className="flex h-screen flex-col items-center justify-center bg-gray-50 dark:bg-[#0C0C0C] text-gray-900 dark:text-white gap-4 relative">
                    <div className="text-xl font-medium">Nenhuma conexão de WhatsApp encontrada.</div>
                    <p className="text-gray-500">Conecte seu WhatsApp para usar o chat ao vivo.</p>
                    <a href="/whatsapp" className="px-4 py-2 bg-[#FF4C00] text-white rounded-lg hover:bg-[#ff6a2b] transition-colors">
                        Conectar WhatsApp
                    </a>
                </div>
            );
        }
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-[#0C0C0C] text-gray-900 dark:text-white relative">
                Carregando instância...
            </div>
        );
    }

    return (
        <div className="relative w-full h-full flex overflow-hidden bg-gray-50 dark:bg-[#0C0C0C] rounded-xl border border-gray-200 dark:border-[#2A2A2A] shadow-sm">


            <div className="flex-none w-[350px] min-w-[350px] bg-white dark:bg-[#121212] border-r border-gray-200 dark:border-[#2A2A2A] flex flex-col h-full z-10">

                <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-[#2A2A2A]">
                    <h2 className="text-gray-900 dark:text-white font-medium pl-1">Conversas</h2>
                </div>

                {/* Search Bar */}
                <div className="flex-none p-3 bg-white dark:bg-[#121212]">
                    <div className="bg-gray-100 dark:bg-[#1F1F1F] rounded-lg flex items-center px-3 py-1.5 h-9">
                        <Search size={18} className="text-gray-500 dark:text-gray-400 mr-3" />
                        <input
                            type="text"
                            placeholder="Pesquisar..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent border-none outline-none text-gray-900 dark:text-white text-sm w-full placeholder-gray-500"
                        />
                        {searchQuery && (
                            <X
                                size={16}
                                className="text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 ml-2"
                                onClick={() => setSearchQuery('')}
                            />
                        )}
                    </div>
                </div>

                {/* Chat List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {isLoadingChats && chats.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-sm">Carregando conversas...</div>
                    ) : (
                        chats.filter(chat =>
                            getDisplayName(chat).toLowerCase().includes(searchQuery.toLowerCase())
                        ).map((chat) => (
                            <div
                                key={chat.id || chat.remoteJid}
                                onClick={() => setActiveChat(chat)}
                                className={`flex items-center p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-[#1F1F1F] transition-colors border-b border-gray-100 dark:border-[#1F1F1F] ${activeChat?.id === chat.id ? 'bg-gray-200 dark:bg-[#2A2A2A]' : ''}`}
                            >
                                <div className="w-12 h-12 rounded-full bg-gray-700 mr-3 flex-shrink-0 overflow-hidden">
                                    {(chat.picture) ? (
                                        <img src={chat.picture} alt={chat.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xl font-bold bg-[#333]">
                                            {getDisplayName(chat)[0].toUpperCase()}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <h3 className="text-gray-900 dark:text-white text-[16px] font-medium truncate font-display">{getDisplayName(chat)}</h3>
                                        <span className="text-xs text-gray-500">{chat.lastMessage?.timestamp ? formatTime(chat.lastMessage.timestamp) : ''}</span>
                                    </div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate font-body">
                                        {chat.lastMessage?.content || '...'}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-[#0C0C0C] relative h-full">
                {activeChat ? (
                    <>
                        {/* Chat Header */}
                        <div className="flex-none h-[70px] px-4 flex items-center justify-between border-b border-gray-200 dark:border-[#2A2A2A] bg-gray-100 dark:bg-[#1F1F1F] z-10 shadow-sm">
                            <div className="flex items-center gap-4">

                                <div>
                                    <h2 className="text-gray-900 dark:text-white font-medium font-display">{getDisplayName(activeChat)}</h2>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">online</span>
                                </div>
                            </div>
                            <div className="flex gap-4 text-gray-500 dark:text-gray-400 items-center">
                                {/* Pause Button */}
                                {currentAgentId && (
                                    <button
                                        onClick={handleToggleChatPause}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isChatPaused
                                            ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400'
                                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-[#2A2A2A] dark:border-[#333] dark:text-gray-300 dark:hover:bg-[#333]'
                                            }`}
                                        title={isChatPaused ? "IA Pausada nesta conversa" : "Pausar IA nesta conversa"}
                                    >
                                        {isChatPaused ? <Play size={16} /> : <Pause size={16} />}
                                        {isChatPaused ? 'Retomar IA' : 'Pausar IA'}
                                    </button>
                                )}

                                <Search size={20} className="cursor-pointer hover:text-gray-900 dark:hover:text-white" />

                            </div>
                        </div>

                        {/* Messages Area */}
                        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-[#0C0C0C] relative scroll-smooth">




                            {fetchError && (
                                <div className="p-2 bg-red-100 text-red-700 text-xs text-center border-b border-red-200">
                                    Falha ao carregar: {fetchError}
                                </div>
                            )}

                            {messages.length === 0 && !fetchError && (
                                <div className="p-4 text-center text-gray-400 text-sm mt-10">
                                    Nenhuma mensagem encontrada.
                                    <br /><span className="text-xs text-gray-300">Envie uma mensagem para iniciar.</span>
                                </div>
                            )}

                            <div className="relative z-10 flex flex-col space-y-2 w-full pb-2">
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
                                        <div key={messageKey} className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-2`}>
                                            {/* Avatar for incoming messages */}
                                            {!isMe && (
                                                <div className="w-8 h-8 rounded-full bg-gray-700 flex-shrink-0 overflow-hidden self-end mb-1">
                                                    {msg.profilePicUrl ? (
                                                        <img src={msg.profilePicUrl} alt={msg.pushName || 'User'} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold bg-[#555]">
                                                            {(msg.pushName || 'U')[0].toUpperCase()}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex flex-col">
                                                {/* Sender name for incoming messages */}
                                                {!isMe && msg.pushName && (
                                                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-0.5 ml-2 font-medium">
                                                        {msg.pushName}
                                                    </div>
                                                )}

                                                <div className={`
                                                    max-w-[85%] sm:max-w-[70%] rounded-lg px-3 py-1.5 shadow-md relative text-sm
                                                    ${isMe
                                                        ? 'bg-[#F5793B] text-white rounded-tr-none'
                                                        : 'bg-white dark:bg-[#252525] text-gray-900 dark:text-white rounded-tl-none'}
                                                `}>
                                                    <div className="font-body text-[15px] leading-relaxed break-words pb-4 min-w-[80px]">
                                                        {renderMessageContent(msg)}
                                                    </div>
                                                    <div className={`
                                                        absolute bottom-1 right-2 text-[10px] flex items-center gap-1
                                                        ${isMe ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}
                                                    `}>
                                                        {formatTime(msg.messageTimestamp)}
                                                        {isMe && (
                                                            <span className={msg.status === 'READ' ? 'text-blue-200' : ''}>
                                                                <CheckCheck size={14} />
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Triangle for bubble tail */}
                                                    <div className={`absolute top-0 w-0 h-0 border-[6px] border-transparent 
                                                        ${isMe
                                                            ? 'right-[-6px] border-t-[#F5793B] border-l-[#F5793B]'
                                                            : 'left-[-6px] border-t-white dark:border-t-[#252525] border-r-white dark:border-r-[#252525]'}
                                                    `}></div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Input Area */}
                        <div className="flex-none min-h-[80px] bg-gray-100 dark:bg-[#1F1F1F] px-4 py-3 flex items-center gap-4 z-20 border-t border-gray-200 dark:border-[#2A2A2A] w-full">
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

                            <div className="flex gap-4 text-gray-500 dark:text-gray-400">

                                <Paperclip
                                    size={24}
                                    className={`cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors ${isUploadingFile ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    onClick={() => !isUploadingFile && fileInputRef.current?.click()}
                                />
                            </div>
                            <div className="flex-1 bg-white dark:bg-[#2A2A2A] rounded-lg flex items-center px-4 py-2 border border-gray-200 dark:border-none shadow-sm dark:shadow-none">
                                {isUploadingFile ? (
                                    <div className="text-gray-500 dark:text-gray-400 text-sm flex items-center gap-2">
                                        <div className="animate-spin h-4 w-4 border-2 border-[#F5793B] border-t-transparent rounded-full"></div>
                                        Enviando arquivo...
                                    </div>
                                ) : (
                                    <input
                                        type="text"
                                        placeholder="Digite uma mensagem"
                                        className="bg-transparent border-none outline-none text-gray-900 dark:text-white w-full placeholder-gray-500 font-body text-sm"
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                    />
                                )}
                            </div>
                            <button
                                onClick={handleSendMessage}
                                disabled={isUploadingFile}
                                className={`p-2 rounded-full bg-[#F5793B] text-white hover:bg-[#e06225] transition-colors shadow-lg active:scale-95 ${isUploadingFile ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <Send size={20} />
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50 dark:bg-[#0C0C0C] border-b-[6px] border-[#F5793B]">
                        <div className="w-64 h-64 mb-8 opacity-20">
                            {/* Placeholder Illustration */}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="w-full h-full text-gray-400 dark:text-gray-500">
                                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                            </svg>
                        </div>
                        <h1 className="text-3xl font-display font-light text-gray-900 dark:text-white mb-4">Kogna Live Chat</h1>
                        <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md leading-relaxed">
                            Envie e receba mensagens sem precisar manter seu celular conectado à internet.<br />
                            Use o Kogna em até 4 aparelhos e 1 celular ao mesmo tempo.
                        </p>
                        <div className="mt-8 flex items-center gap-2 text-xs text-gray-500">
                            <LockIcon size={12} />
                            Protegido com criptografia de ponta a ponta
                        </div>
                    </div>
                )}
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

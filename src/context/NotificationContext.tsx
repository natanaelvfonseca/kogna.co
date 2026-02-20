
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CheckCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from './AuthContext';

interface Notification {
    id: string;
    title: string;
    message: string;
    read: boolean;
    created_at: string;
}

interface Toast {
    id: string;
    title: string;
    message?: string;
    type: 'success' | 'error' | 'info' | 'warning';
}

interface NotificationContextType {
    notifications: Notification[];
    unreadCount: number;
    loading: boolean;
    fetchNotifications: () => Promise<void>;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    showToast: (title: string, message?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((title: string, message?: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, { id, title, message, type }]);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
    }, []);

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const fetchNotifications = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const token = localStorage.getItem('kogna_token');
            const response = await fetch('/api/notifications', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                setNotifications(data);
            }
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (id: string) => {
        try {
            const token = localStorage.getItem('kogna_token');
            await fetch(`/api/notifications/${id}/read`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            setNotifications(prev => prev.map(n =>
                n.id === id ? { ...n, read: true } : n
            ));
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    };

    const markAllAsRead = async () => {
        // Optimistic update
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));

        // Ideally we'd have a batch endpoint, but we'll just loop for now or leave it for later enhancement
        // For this specific requirement "click appears message", usually implies specific interaction.
        // But keeping this helper generic.
        const unread = notifications.filter(n => !n.read);
        await Promise.all(unread.map(n => markAsRead(n.id)));
    };

    useEffect(() => {
        if (user) {
            fetchNotifications();
            // Poll every 60 seconds
            const interval = setInterval(fetchNotifications, 60000);
            return () => clearInterval(interval);
        } else {
            setNotifications([]);
        }
    }, [user]);

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            loading,
            fetchNotifications,
            markAsRead,
            markAllAsRead,
            showToast
        }}>
            {children}

            {/* Global Toasts Container */}
            <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none w-full max-w-sm">
                <AnimatePresence>
                    {toasts.map(toast => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, x: 50, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 20, scale: 0.95 }}
                            className="pointer-events-auto"
                        >
                            <div className={`p-4 rounded-2xl border shadow-xl backdrop-blur-md flex gap-3 relative overflow-hidden group bg-surface ${toast.type === 'success' ? 'border-emerald-500/20 text-emerald-500' :
                                toast.type === 'error' ? 'border-red-500/10 border-red-500/20 text-red-500' :
                                    toast.type === 'warning' ? 'border-amber-500/10 border-amber-500/20 text-amber-500' :
                                        'border-blue-500/10 border-blue-500/20 text-blue-500'
                                }`}>
                                {/* Progress Bar Background */}
                                <div className="absolute bottom-0 left-0 h-1 bg-current opacity-20 w-full" />
                                <motion.div
                                    initial={{ width: "100%" }}
                                    animate={{ width: "0%" }}
                                    transition={{ duration: 5, ease: "linear" }}
                                    className="absolute bottom-0 left-0 h-1 bg-current"
                                />

                                <div className="shrink-0 mt-0.5">
                                    {toast.type === 'success' && <CheckCircle size={20} />}
                                    {toast.type === 'error' && <AlertCircle size={20} />}
                                    {toast.type === 'info' && <Info size={20} />}
                                    {toast.type === 'warning' && <AlertTriangle size={20} />}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-sm leading-tight">{toast.title}</h4>
                                    {toast.message && (
                                        <p className="text-xs mt-1 opacity-90 leading-relaxed line-clamp-2">
                                            {toast.message}
                                        </p>
                                    )}
                                </div>

                                <button
                                    onClick={() => removeToast(toast.id)}
                                    className="shrink-0 hover:bg-current/10 p-1 rounded-lg transition-colors h-fit"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
};

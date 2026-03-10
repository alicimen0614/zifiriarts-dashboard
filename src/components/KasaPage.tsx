import React, { useState, useEffect } from 'react';
import { PlusCircle, TrendingUp, TrendingDown, Wallet, X, Save, Trash2, Calendar, Clock, Check, HandCoins, Undo2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, updateDoc } from 'firebase/firestore';

interface KasaEntry {
    id: string;
    type: 'income' | 'expense' | 'pending' | 'loan';
    amount: number;
    description?: string;
    orderTitle?: string;
    customer?: string;
    orderId?: string;
    category?: string;
    borrower?: string;
    createdAt: string;
}

const expenseCategories = [
    'Filament',
    'Elektrik',
    'Bakım & Onarım',
    'Kargo',
    'Ekipman',
    'Diğer'
];

type DatePreset = 'all' | 'today' | 'week' | 'month' | 'custom';

interface KasaPageProps {
    onAddExpense: () => void;
    onOpenPending: () => void;
    onOpenBorrows: () => void;
    setGlobalConfirmDialog: (dialog: { message: string, onConfirm: () => void, confirmVariant?: 'danger' | 'primary', confirmText?: string, cancelText?: string } | null) => void;
}

export default function KasaPage({ onAddExpense, onOpenPending, onOpenBorrows, setGlobalConfirmDialog }: KasaPageProps) {
    const [entries, setEntries] = useState<KasaEntry[]>([]);
    const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
    const [datePreset, setDatePreset] = useState<DatePreset>('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'kasa'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            })) as KasaEntry[];
            setEntries(data);
        });
        return () => unsubscribe();
    }, []);

    const handleDelete = (entryId: string) => {
        setGlobalConfirmDialog({
            message: 'Bu kaydı silmek istediğinize emin misiniz?',
            confirmVariant: 'danger',
            confirmText: 'Sil',
            onConfirm: async () => {
                try { await deleteDoc(doc(db, 'kasa', entryId)); } catch (e) { console.error(e); }
                setGlobalConfirmDialog(null);
            }
        });
    };

    // Date filtering
    const getDateRange = (): { start: Date | null; end: Date | null } => {
        const now = new Date();
        switch (datePreset) {
            case 'today': {
                const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                return { start: s, end: e };
            }
            case 'week': {
                const s = new Date(now); s.setDate(now.getDate() - 7); s.setHours(0, 0, 0, 0);
                return { start: s, end: now };
            }
            case 'month': {
                return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
            }
            case 'custom': {
                return {
                    start: startDate ? new Date(startDate + 'T00:00:00') : null,
                    end: endDate ? new Date(endDate + 'T23:59:59') : null
                };
            }
            default: return { start: null, end: null };
        }
    };

    const dateRange = getDateRange();
    const pendingEntries = entries.filter(e => e.type === 'pending');
    const loanEntries = entries.filter(e => e.type === 'loan');
    const transactionEntries = entries.filter(e => e.type !== 'pending' && e.type !== 'loan');

    const dateFilteredEntries = transactionEntries.filter(e => {
        if (!dateRange.start && !dateRange.end) return true;
        const entryDate = new Date(e.createdAt);
        if (dateRange.start && entryDate < dateRange.start) return false;
        if (dateRange.end && entryDate > dateRange.end) return false;
        return true;
    });

    const filteredEntries = dateFilteredEntries.filter(e => filter === 'all' || e.type === filter);
    const totalIncome = dateFilteredEntries.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
    const totalExpense = dateFilteredEntries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
    const netBalance = totalIncome - totalExpense;
    const totalPending = pendingEntries.reduce((sum, e) => sum + e.amount, 0);
    const totalLoans = loanEntries.reduce((sum, e) => sum + e.amount, 0);

    const handlePresetChange = (preset: DatePreset) => {
        setDatePreset(preset);
        if (preset !== 'custom') { setStartDate(''); setEndDate(''); }
    };

    return (
        <div>
            {/* Header */}
            <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                    <h2>Kasa</h2>
                    <p className="text-secondary">Gelir ve giderlerinizi takip edin.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn-secondary" onClick={onOpenPending} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}>
                        <Clock size={14} /> Ücret Alınacaklar
                        {pendingEntries.length > 0 && <span className="kasa-pending-badge">{pendingEntries.length}</span>}
                    </button>
                    <button className="btn-secondary" onClick={onOpenBorrows} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}>
                        <HandCoins size={14} /> Borçlar
                        {loanEntries.length > 0 && <span className="kasa-pending-badge">{loanEntries.length}</span>}
                    </button>
                    <button className="btn-primary" onClick={onAddExpense}>
                        <PlusCircle size={18} /> Gider Ekle
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="kasa-summary">
                <div className="kasa-card kasa-card-income">
                    <div className="kasa-card-icon"><TrendingUp size={20} /></div>
                    <div>
                        <span className="kasa-card-label">Toplam Gelir</span>
                        <span className="kasa-card-value">{totalIncome.toLocaleString('tr-TR')}₺</span>
                    </div>
                </div>
                <div className="kasa-card kasa-card-expense">
                    <div className="kasa-card-icon"><TrendingDown size={20} /></div>
                    <div>
                        <span className="kasa-card-label">Toplam Gider</span>
                        <span className="kasa-card-value">{totalExpense.toLocaleString('tr-TR')}₺</span>
                    </div>
                </div>
                <div className={`kasa-card ${netBalance >= 0 ? 'kasa-card-net-positive' : 'kasa-card-net-negative'}`}>
                    <div className="kasa-card-icon"><Wallet size={20} /></div>
                    <div>
                        <span className="kasa-card-label">Net Bakiye</span>
                        <span className="kasa-card-value">{netBalance >= 0 ? '+' : ''}{netBalance.toLocaleString('tr-TR')}₺</span>
                    </div>
                </div>
            </div>

            {/* Extra Info */}
            {(totalPending > 0 || totalLoans > 0) && (
                <div className="kasa-extra-info">
                    {totalPending > 0 && (
                        <div className="kasa-extra-item" onClick={onOpenPending} style={{ cursor: 'pointer' }}>
                            <Clock size={14} style={{ color: '#f97316' }} />
                            <span>Ücret Alınacak:</span>
                            <strong style={{ color: '#f97316' }}>{totalPending.toLocaleString('tr-TR')}₺</strong>
                            <span className="kasa-extra-count">{pendingEntries.length} sipariş</span>
                        </div>
                    )}
                    {totalLoans > 0 && (
                        <div className="kasa-extra-item" onClick={onOpenBorrows} style={{ cursor: 'pointer' }}>
                            <HandCoins size={14} style={{ color: '#a855f7' }} />
                            <span>Açık Borç:</span>
                            <strong style={{ color: '#a855f7' }}>{totalLoans.toLocaleString('tr-TR')}₺</strong>
                            <span className="kasa-extra-count">{loanEntries.length} kişi</span>
                        </div>
                    )}
                </div>
            )}

            {/* Date Filter */}
            <div className="kasa-date-filter">
                <div className="kasa-date-presets">
                    <Calendar size={16} style={{ color: 'var(--text-secondary)' }} />
                    {([
                        { key: 'all', label: 'Tümü' }, { key: 'today', label: 'Bugün' },
                        { key: 'week', label: 'Son 7 Gün' }, { key: 'month', label: 'Bu Ay' },
                        { key: 'custom', label: 'Özel Aralık' },
                    ] as { key: DatePreset; label: string }[]).map(p => (
                        <button key={p.key} className={`kasa-date-btn ${datePreset === p.key ? 'active' : ''}`} onClick={() => handlePresetChange(p.key)}>
                            {p.label}
                        </button>
                    ))}
                </div>
                {datePreset === 'custom' && (
                    <div className="kasa-date-inputs">
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <span style={{ color: 'var(--text-secondary)' }}>→</span>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                )}
            </div>

            {/* Type Filter */}
            <div className="kasa-filters">
                <button className={`kasa-filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                    Tümü <span className="kasa-badge">{dateFilteredEntries.length}</span>
                </button>
                <button className={`kasa-filter-btn ${filter === 'income' ? 'active' : ''}`} onClick={() => setFilter('income')}>
                    Gelirler <span className="kasa-badge">{dateFilteredEntries.filter(e => e.type === 'income').length}</span>
                </button>
                <button className={`kasa-filter-btn ${filter === 'expense' ? 'active' : ''}`} onClick={() => setFilter('expense')}>
                    Giderler <span className="kasa-badge">{dateFilteredEntries.filter(e => e.type === 'expense').length}</span>
                </button>
            </div>

            {/* Entries List */}
            <div className="kasa-entries">
                {filteredEntries.length === 0 ? (
                    <div className="products-empty"><Wallet size={48} /><p>Kayıt bulunamadı</p></div>
                ) : (
                    filteredEntries.map(entry => (
                        <div key={entry.id} className={`kasa-entry ${entry.type}`}>
                            <div className="kasa-entry-icon">
                                {entry.type === 'income' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                            </div>
                            <div className="kasa-entry-info">
                                <span className="kasa-entry-title">
                                    {entry.type === 'income' ? (entry.orderTitle || 'Gelir') : (entry.description || entry.category || 'Gider')}
                                </span>
                                <span className="kasa-entry-detail">
                                    {entry.type === 'income' && entry.customer && `👤 ${entry.customer}`}
                                    {entry.type === 'expense' && entry.category && `📁 ${entry.category}`}
                                    {entry.createdAt && ` · ${new Date(entry.createdAt).toLocaleDateString('tr-TR')}`}
                                </span>
                            </div>
                            <div className="kasa-entry-amount">
                                <span className={entry.type === 'income' ? 'amount-positive' : 'amount-negative'}>
                                    {entry.type === 'income' ? '+' : '-'}{entry.amount.toLocaleString('tr-TR')}₺
                                </span>
                            </div>
                            <button className="kasa-entry-delete" onClick={() => handleDelete(entry.id)} title="Sil">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))
                )}
            </div>

        </div>
    );
}

/* ===================== EXPORTED MODALS ===================== */

export function AddExpenseModal({ onClose }: { onClose: () => void }) {
    const [amount, setAmount] = useState<number | ''>('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState(expenseCategories[0]);
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || amount <= 0) return;
        setIsSaving(true);
        try {
            await addDoc(collection(db, 'kasa'), {
                type: 'expense', amount: Number(amount),
                description: description.trim() || null, category,
                createdAt: new Date().toISOString()
            });
            onClose();
        } catch (error) { console.error('Gider eklenirken hata:', error); }
        finally { setIsSaving(false); }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-panel animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
                <div className="modal-header">
                    <h2>Gider Ekle</h2>
                    <button onClick={onClose} className="btn-icon"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-group">
                        <label>Kategori</label>
                        <select value={category} onChange={e => setCategory(e.target.value)}>
                            {expenseCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Tutar (₺) <span className="text-danger">*</span></label>
                        <input type="number" min="0.01" step="0.01" required placeholder="Örn: 350" value={amount} onChange={e => setAmount(Number(e.target.value))} style={{ fontSize: '1.1rem', fontWeight: 600 }} />
                    </div>
                    <div className="form-group">
                        <label>Açıklama</label>
                        <input type="text" placeholder="Örn: 1kg PLA filament" value={description} onChange={e => setDescription(e.target.value)} />
                    </div>
                    <div className="modal-actions">
                        <div style={{ flex: 1 }} />
                        <button type="button" onClick={onClose} className="btn-secondary">İptal</button>
                        <button type="submit" disabled={isSaving} className="btn-primary" style={{ background: '#ef4444' }}>
                            {isSaving ? "Kaydediliyor..." : <><Save size={16} /> Gider Ekle</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function PendingModal({ onClose, setGlobalConfirmDialog }: { onClose: () => void, setGlobalConfirmDialog: (dialog: { message: string, onConfirm: () => void, confirmVariant?: 'danger' | 'primary', confirmText?: string, cancelText?: string } | null) => void }) {
    const [pendings, setPendings] = useState<KasaEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'kasa'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() })) as KasaEntry[];
            setPendings(data.filter(e => e.type === 'pending'));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleMarkAsPaid = (entry: KasaEntry) => {
        setGlobalConfirmDialog({
            message: `${entry.amount}₺ tutarındaki bu ödemeyi tahsil edildi (kasaya eklendi) olarak işaretlemek istiyor musunuz?`,
            confirmVariant: 'primary',
            confirmText: 'Tahsil Et',
            onConfirm: async () => {
                setIsSaving(true);
                try {
                    await updateDoc(doc(db, 'kasa', entry.id), { type: 'income', createdAt: new Date().toISOString() });
                    // Optional: update order paymentStatus to 'paid' if orderId exists
                    if (entry.orderId) {
                        await updateDoc(doc(db, 'orders', entry.orderId), { paymentStatus: 'paid' });
                    }
                } catch (e) { console.error('Tahsilat hatası:', e); }
                finally {
                    setIsSaving(false);
                    setGlobalConfirmDialog(null);
                }
            }
        });
    };

    const handleDelete = (entryId: string) => {
        setGlobalConfirmDialog({
            message: 'Bu borç kaydını tamamen silmek istediğinize emin misiniz?',
            confirmVariant: 'danger',
            confirmText: 'Sil',
            onConfirm: async () => {
                setIsSaving(true);
                try { await deleteDoc(doc(db, 'kasa', entryId)); } catch (e) { console.error(e); }
                finally {
                    setIsSaving(false);
                    setGlobalConfirmDialog(null);
                }
            }
        });
    };

    const totalPending = pendings.reduce((sum, e) => sum + e.amount, 0);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-panel animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div className="modal-header">
                    <h2>Alınacak Ödemeler (Açık Hesap)</h2>
                    <button onClick={onClose} className="btn-icon"><X size={20} /></button>
                </div>

                <div className="modal-form">
                    <div className="summary-card" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '1rem', borderRadius: '12px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Toplam Alacak</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>{totalPending.toLocaleString('tr-TR')}₺</div>
                        </div>
                        <HandCoins size={32} color="#f59e0b" opacity={0.8} />
                    </div>

                    <div className="entries-list" style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Yükleniyor...</div>
                        ) : pendings.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Alınacak ödeme bulunmuyor.</div>
                        ) : (
                            pendings.map(entry => (
                                <div key={entry.id} className="kasa-entry-item" style={{ gridTemplateColumns: '1fr auto', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.02)' }}>
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entry.customer}</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>{entry.amount}₺</span>
                                            <span>•</span>
                                            <span title={entry.orderTitle} style={{ maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.orderTitle}</span>
                                            <span>•</span>
                                            <span>{new Date(entry.createdAt).toLocaleDateString('tr-TR')}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            className="btn-primary"
                                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', background: '#22c55e' }}
                                            onClick={() => handleMarkAsPaid(entry)}
                                            title="Ödendi İşaretle & Kasaya Ekle"
                                            disabled={isSaving}
                                        >
                                            <Check size={16} style={{ marginRight: '0.2rem' }} /> Tahsil Et
                                        </button>
                                        <button
                                            className="kasa-entry-delete"
                                            onClick={() => handleDelete(entry.id)}
                                            title="Kaydı Sil"
                                            disabled={isSaving}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function BorrowsModal({ onClose, setGlobalConfirmDialog }: { onClose: () => void, setGlobalConfirmDialog: (dialog: { message: string, onConfirm: () => void, confirmVariant?: 'danger' | 'primary', confirmText?: string, cancelText?: string } | null) => void }) {
    const [entries, setEntries] = useState<KasaEntry[]>([]);
    const [borrowAmount, setBorrowAmount] = useState<number | ''>('');
    const [borrower, setBorrower] = useState('');
    const [borrowNote, setBorrowNote] = useState('');
    const [isBorrowing, setIsBorrowing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'kasa'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setEntries(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as KasaEntry[]);
        });
        return () => unsubscribe();
    }, []);

    const loanEntries = entries.filter(e => e.type === 'loan');
    const totalLoans = loanEntries.reduce((sum, e) => sum + e.amount, 0);

    const handleBorrow = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!borrowAmount || borrowAmount <= 0 || !borrower.trim()) return;
        setIsBorrowing(true);
        try {
            await addDoc(collection(db, 'kasa'), {
                type: 'loan', amount: Number(borrowAmount),
                borrower: borrower.trim(), description: borrowNote.trim() || null,
                createdAt: new Date().toISOString()
            });
            setBorrowAmount(''); setBorrower(''); setBorrowNote('');
        } catch (error) { console.error(error); }
        finally { setIsBorrowing(false); }
    };

    const handleLoanReturn = (entry: KasaEntry) => {
        setGlobalConfirmDialog({
            message: `${entry.borrower || 'Bu kişi'} ${entry.amount}₺ borcunu iade etti mi?`,
            confirmVariant: 'primary',
            confirmText: 'İade Edildi',
            onConfirm: async () => {
                setIsSaving(true);
                try { await deleteDoc(doc(db, 'kasa', entry.id)); } catch (e) { console.error(e); }
                finally { setIsSaving(false); setGlobalConfirmDialog(null); }
            }
        });
    };

    const handleDelete = (entryId: string) => {
        setGlobalConfirmDialog({
            message: 'Bu kaydı silmek istediğinize emin misiniz?',
            confirmVariant: 'danger',
            confirmText: 'Sil',
            onConfirm: async () => {
                setIsSaving(true);
                try { await deleteDoc(doc(db, 'kasa', entryId)); } catch (e) { console.error(e); }
                finally { setIsSaving(false); setGlobalConfirmDialog(null); }
            }
        });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-panel animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
                <div className="modal-header">
                    <h2>Borçlar</h2>
                    <button onClick={onClose} className="btn-icon" disabled={isBorrowing || isSaving}><X size={20} /></button>
                </div>
                <div className="modal-form" style={{ gap: '0.75rem' }}>
                    {/* Summary */}
                    <div className="form-group" style={{ margin: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                            <HandCoins size={20} style={{ color: '#a855f7' }} />
                            <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Toplam Borç</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#a855f7' }}>{totalLoans.toLocaleString('tr-TR')}₺</div>
                            </div>
                            <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{loanEntries.length} kişi</span>
                        </div>
                    </div>

                    {/* Add Form */}
                    <form onSubmit={handleBorrow} className="kasa-borrow-form">
                        <input type="text" required disabled={isBorrowing || isSaving} placeholder="Kim aldı?" value={borrower} onChange={e => setBorrower(e.target.value)} />
                        <input type="number" required disabled={isBorrowing || isSaving} min="0.01" step="0.01" placeholder="Tutar (₺)" value={borrowAmount} onChange={e => setBorrowAmount(Number(e.target.value))} />
                        <input type="text" disabled={isBorrowing || isSaving} placeholder="Not (opsiyonel)" value={borrowNote} onChange={e => setBorrowNote(e.target.value)} />
                        <button type="submit" className="btn-primary" disabled={isBorrowing || isSaving} style={{ background: '#a855f7', whiteSpace: 'nowrap' }}>
                            {isBorrowing ? "Ekleniyor..." : <><PlusCircle size={16} /> Borç Ekle</>}
                        </button>
                    </form>

                    {/* List */}
                    {loanEntries.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)' }}>
                            <Check size={36} style={{ color: '#22c55e', marginBottom: '0.5rem' }} />
                            <p>Aktif borç yok 🎉</p>
                        </div>
                    ) : (
                        <div className="kasa-entries" style={{ maxHeight: '340px', overflowY: 'auto' }}>
                            {loanEntries.map(entry => (
                                <div key={entry.id} className="kasa-entry loan">
                                    <div className="kasa-entry-icon"><HandCoins size={18} /></div>
                                    <div className="kasa-entry-info">
                                        <span className="kasa-entry-title">👤 {entry.borrower || 'Bilinmiyor'}</span>
                                        <span className="kasa-entry-detail">
                                            {entry.description && `📝 ${entry.description} · `}
                                            {entry.createdAt && new Date(entry.createdAt).toLocaleDateString('tr-TR')}
                                        </span>
                                    </div>
                                    <div className="kasa-entry-amount">
                                        <span style={{ color: '#a855f7', fontWeight: 700 }}>{entry.amount.toLocaleString('tr-TR')}₺</span>
                                    </div>
                                    <button className="kasa-paid-btn" style={{ borderColor: '#a855f7', color: '#a855f7', background: 'rgba(168, 85, 247, 0.1)' }} onClick={() => handleLoanReturn(entry)} disabled={isSaving}>
                                        <Undo2 size={14} /> İade Edildi
                                    </button>
                                    <button className="kasa-entry-delete" style={{ opacity: 1 }} onClick={() => handleDelete(entry.id)} title="Sil" disabled={isSaving}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
